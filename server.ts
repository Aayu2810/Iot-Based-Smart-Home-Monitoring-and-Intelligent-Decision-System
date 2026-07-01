import express from "express";
import path from "path";
import fs from "fs";
import http from "http";
import { createServer as createViteServer } from "vite";
import { WebSocketServer, WebSocket } from "ws";
import mqtt from "mqtt";
import dotenv from "dotenv";

const ROOT = process.cwd();

dotenv.config();

// ─── In-memory state ──────────────────────────────────────────────────────────
interface LatestState {
  temperature: number;
  humidity: number;
  gas_ppm: number;
  pir_state: boolean;
  ldr_raw: number;
  ldr_norm: number;
  risk: number;
  fsm_state: string;
  // Live graph topology from main_coordinator.py (only when FSM >= MONITOR)
  graph: {
    dijk_path: number[];
    bfs_order: number[];
    dijk_cost: number;
  } | null;
  ts: number;
}

const latestState: LatestState = {
  temperature: 0,
  humidity: 0,
  gas_ppm: 0,
  pir_state: false,
  ldr_raw: 0,
  ldr_norm: 0,
  risk: 0,
  fsm_state: "IDLE",
  graph: null,
  ts: 0,
};

let mqttConnected = false;
let packetCount = 0;
let serverStartTime = Date.now();
const packetWindow: number[] = []; // timestamps for rolling rate

// ─── In-memory history buffer ─────────────────────────────────────────────────
// Accumulates live MQTT readings so /api/history returns real-time data even
// when the CSV files on disk are stale (e.g. dashboard runs on a different
// machine from the Pi).
const MAX_HISTORY_BUFFER = 8640; // ~24 h at one reading per 10 s

const liveHistory: {
  temperatures: HistoryPoint[];
  humidities: HistoryPoint[];
  gases: HistoryPoint[];
  risks: HistoryPoint[];
} = { temperatures: [], humidities: [], gases: [], risks: [] };

function pushHistory(
  field: keyof typeof liveHistory,
  value: number,
  ts: number
) {
  if (isNaN(value)) return;
  const arr = liveHistory[field];
  arr.push({ ts, value });
  if (arr.length > MAX_HISTORY_BUFFER) arr.shift();
}

function recordPacket() {
  const now = Date.now();
  packetWindow.push(now);
  // Keep only last 10 seconds
  const cutoff = now - 10000;
  while (packetWindow.length > 0 && packetWindow[0] < cutoff) packetWindow.shift();
  packetCount++;
}

function getPacketRate(): number {
  const now = Date.now();
  const cutoff = now - 10000;
  const recent = packetWindow.filter((t) => t >= cutoff);
  return parseFloat((recent.length / 10).toFixed(2));
}

// ─── WebSocket broadcast ──────────────────────────────────────────────────────
let wss: WebSocketServer;

function broadcast(type: string, data: unknown) {
  if (!wss) return;
  const msg = JSON.stringify({ type, data });
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) client.send(msg);
  });
}

// ─── MQTT setup ───────────────────────────────────────────────────────────────
const MQTT_BROKER = process.env.MQTT_BROKER_URL || "mqtt://localhost:1883";

const TOPICS = [
  "home/node/env/sensors",
  "home/node/motion/sensors",
  "home/node/light/sensors",
  "home/sensors/normalized",
] as const;

function startMQTT() {
  const client = mqtt.connect(MQTT_BROKER, {
    clientId: `smarthome-server-${Date.now()}`,
    reconnectPeriod: 3000,
  });

  client.on("connect", () => {
    mqttConnected = true;
    console.log("[MQTT] Connected to broker");
    client.subscribe(TOPICS as unknown as string[], { qos: 1 });
    broadcast("mqtt_status", { connected: true });
  });

  client.on("reconnect", () => {
    console.log("[MQTT] Reconnecting...");
  });

  client.on("offline", () => {
    mqttConnected = false;
    broadcast("mqtt_status", { connected: false });
  });

  client.on("error", (err) => {
    console.error("[MQTT] Error:", err.message);
    mqttConnected = false;
  });

  client.on("message", (topic: string, payload: Buffer) => {
    try {
      const data = JSON.parse(payload.toString());
      recordPacket();

      if (topic === "home/node/env/sensors") {
        latestState.temperature = data.temperature ?? latestState.temperature;
        latestState.humidity = data.humidity ?? latestState.humidity;
        latestState.gas_ppm = data.gas_ppm ?? latestState.gas_ppm;
        latestState.ts = Date.now();
        const envTs = latestState.ts;
        pushHistory("temperatures", latestState.temperature, envTs);
        pushHistory("humidities", latestState.humidity, envTs);
        pushHistory("gases", latestState.gas_ppm, envTs);
      } else if (topic === "home/node/motion/sensors") {
        const prevPir = latestState.pir_state;
        latestState.pir_state = Boolean(data.pir_state);
        latestState.ts = Date.now();
        // Alert on motion rising edge
        if (!prevPir && latestState.pir_state) {
          broadcast("alert", {
            kind: "motion",
            message: "Motion detected",
            ts: latestState.ts,
          });
        }
      } else if (topic === "home/node/light/sensors") {
        latestState.ldr_raw = data.ldr_raw ?? latestState.ldr_raw;
        latestState.ldr_norm = data.ldr_norm ?? latestState.ldr_norm;
        latestState.ts = Date.now();
      } else if (topic === "home/sensors/normalized") {
        // Only published when coordinator FSM state >= MONITOR
        const prevState = latestState.fsm_state;
        latestState.risk = data.risk ?? latestState.risk;
        latestState.fsm_state = data.state ?? latestState.fsm_state;
        latestState.ts = data.ts ?? Date.now();
        pushHistory("risks", latestState.risk, latestState.ts);

        // Extract live graph topology (Dijkstra path + BFS order)
        if (data.graph) {
          latestState.graph = {
            dijk_path: Array.isArray(data.graph.dijk_path) ? data.graph.dijk_path : [],
            bfs_order: Array.isArray(data.graph.bfs_order) ? data.graph.bfs_order : [],
            dijk_cost: typeof data.graph.dijk_cost === "number" ? data.graph.dijk_cost : 0,
          };
        }

        // Alert on high-risk or critical FSM transitions
        if (prevState !== latestState.fsm_state) {
          if (latestState.fsm_state === "ALERT_HIGH" || latestState.fsm_state === "CRITICAL") {
            broadcast("alert", {
              kind: latestState.fsm_state === "CRITICAL" ? "critical_state" : "high_risk",
              message: `FSM transitioned to ${latestState.fsm_state}`,
              ts: latestState.ts,
            });
          }
        }
        if (latestState.risk >= 0.65) {
          broadcast("alert", {
            kind: "high_risk",
            message: `Risk score elevated: ${latestState.risk.toFixed(3)}`,
            ts: latestState.ts,
          });
        }
      }

      broadcast("state_update", { ...latestState });
    } catch (err) {
      console.error("[MQTT] Failed to parse message on", topic, err);
    }
  });
}

// ─── CSV history reader ───────────────────────────────────────────────────────
const DATASET_DIR = path.join(
  ROOT,
  "raspberry_pi",
  "smarthome_data",
  "datasets"
);

interface HistoryPoint {
  ts: number;
  value: number;
}

function readCSVHistory(
  range: "24h" | "7d" | "30d"
): Record<string, HistoryPoint[]> {
  const hours = range === "24h" ? 24 : range === "7d" ? 168 : 720;
  const cutoffMs = Date.now() - hours * 3600 * 1000;

  // Collect all CSV files in directory
  let rows: string[][] = [];
  if (fs.existsSync(DATASET_DIR)) {
    const files = fs
      .readdirSync(DATASET_DIR)
      .filter((f) => f.endsWith(".csv"))
      .sort();

    for (const file of files) {
      const content = fs.readFileSync(path.join(DATASET_DIR, file), "utf8");
      const lines = content.trim().split("\n");
      // Skip header (first line)
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(",");
        if (cols.length >= 8) rows.push(cols);
      }
    }
  }

  // CSV columns by index:
  // 0:timestamp  1:temperature  2:humidity  3:mq2_ppm  4:pir  5:ldr
  // 6:risk_score  7:fsm_state  8:alert_flag  ...
  const temperatures: HistoryPoint[] = [];
  const humidities: HistoryPoint[] = [];
  const gases: HistoryPoint[] = [];
  const risks: HistoryPoint[] = [];

  for (const cols of rows) {
    const ts = new Date(cols[0]).getTime();
    if (isNaN(ts) || ts < cutoffMs) continue;

    const temp = parseFloat(cols[1]);
    const hum = parseFloat(cols[2]);
    const gas = parseFloat(cols[3]);
    const risk = parseFloat(cols[6]);

    if (!isNaN(temp)) temperatures.push({ ts, value: temp });
    if (!isNaN(hum)) humidities.push({ ts, value: hum });
    if (!isNaN(gas)) gases.push({ ts, value: gas });
    if (!isNaN(risk)) risks.push({ ts, value: risk });
  }

  // Downsample to max 500 points per series to keep payload small
  const downsample = (arr: HistoryPoint[], max = 500): HistoryPoint[] => {
    if (arr.length <= max) return arr;
    const step = Math.ceil(arr.length / max);
    return arr.filter((_, i) => i % step === 0);
  };

  // Merge live MQTT buffer into CSV data so the chart shows real-time points
  // even when the CSV files on disk are stale or absent.
  function mergeLive(csvArr: HistoryPoint[], liveArr: HistoryPoint[]): HistoryPoint[] {
    const filtered = liveArr.filter((p) => p.ts >= cutoffMs);
    if (filtered.length === 0) return csvArr;
    const combined = [...csvArr, ...filtered].sort((a, b) => a.ts - b.ts);
    // Remove consecutive duplicates (same ms timestamp from double-write)
    return combined.filter((p, i) => i === 0 || p.ts !== combined[i - 1].ts);
  }

  return {
    temperatures: downsample(mergeLive(temperatures, liveHistory.temperatures)),
    humidities:   downsample(mergeLive(humidities,   liveHistory.humidities)),
    gases:        downsample(mergeLive(gases,         liveHistory.gases)),
    risks:        downsample(mergeLive(risks,         liveHistory.risks)),
  };
}

// ─── Express + WebSocket + Vite ───────────────────────────────────────────────
async function startServer() {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  // ── IoT REST endpoints ──────────────────────────────────────────────────────

  app.get("/api/health", (_req, res) => {
    res.json({
      mqtt_connected: mqttConnected,
      last_update: latestState.ts,
      packet_rate: getPacketRate(),
      uptime_seconds: Math.floor((Date.now() - serverStartTime) / 1000),
    });
  });

  app.get("/api/history", (req, res) => {
    const range = (req.query.range as string) || "24h";
    if (range !== "24h" && range !== "7d" && range !== "30d") {
      return res.status(400).json({ error: "range must be 24h, 7d, or 30d" });
    }
    try {
      const history = readCSVHistory(range as "24h" | "7d" | "30d");
      res.json(history);
    } catch (err) {
      console.error("[history] CSV read error:", err);
      res.status(500).json({ error: "Failed to read history data" });
    }
  });

  // ── Vite dev middleware (or static in production) ──────────────────────────
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(ROOT, "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // ── HTTP server ─────────────────────────────────────────────────────────────
  const httpServer = http.createServer(app);

  // ── WebSocket server on path /ws ────────────────────────────────────────────
  // noServer=true + manual upgrade handling keeps /ws separate from Vite HMR
  wss = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", (request, socket, head) => {
    if (request.url === "/ws") {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    }
    // Other upgrade requests (Vite HMR) fall through
  });

  wss.on("connection", (ws) => {
    // Send current state immediately on connect
    ws.send(
      JSON.stringify({ type: "state_update", data: { ...latestState } })
    );
    ws.send(
      JSON.stringify({ type: "mqtt_status", data: { connected: mqttConnected } })
    );
  });

  // ── Start ───────────────────────────────────────────────────────────────────
  const PORT = parseInt(process.env.PORT || "3000", 10);
  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`[server] Running on http://0.0.0.0:${PORT}`);
  });

  startMQTT();
}

startServer();
