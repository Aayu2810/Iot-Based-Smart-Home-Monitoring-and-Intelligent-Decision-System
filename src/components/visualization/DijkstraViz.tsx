import { useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Play, RotateCcw, Radio, Sliders } from "lucide-react";
import { useDashboardStore } from "../../store/dashboardStore";

// ── Constants from raspberry_pi/edge_algorithms/config.py ────────
const ALPHA  = 0.50;
const BETA   = 0.20;
const GAMMA  = 0.30;
const LAMBDA = 2.5;
const EPSILON = 0.01;

// ── Zone graph from graph_engine.py ──────────────────────────────
// Zones reflect actual ESP32 placement:
//   0 Living   — aggregated hub
//   1 Kitchen  — MQ-2 gas + env sensor (ESP32 #1)
//   2 Bedroom  — LDR light sensor     (ESP32 #3)
//   3 Hallway  — aggregated hub / PIR-adjacent
//   4 Exterior — exit / safe zone (main door — PIR buzzer ESP32 #2)
const NODE_NAMES = ["Living", "Kitchen", "Bedroom", "Hallway", "Main Door (Exit)"];
const NODE_ICONS = ["🏠", "🍳", "🛏️", "🚪", "🚪✅"];
// Physical placement note shown in UI
const NODE_SENSORS: (string | null)[] = [
  null,
  "MQ-2 Gas · Temp · Humidity",
  "LDR Light",
  null,
  "PIR Motion · Buzzer",
];

const NODE_POS: [number, number][] = [
  [150, 240], // Living
  [330, 240], // Kitchen
  [150, 110], // Bedroom
  [270, 155], // Hallway
  [270,  40], // Exterior / Main Door (exit)
];

// [from, to, base-distance]
const STATIC_EDGES: [number, number, number][] = [
  [0, 1, 0.30], // Living - Kitchen
  [0, 2, 0.40], // Living - Bedroom
  [0, 3, 0.25], // Living - Hallway
  [1, 3, 0.20], // Kitchen - Hallway
  [2, 3, 0.20], // Bedroom - Hallway
  [3, 4, 0.35], // Hallway - Main Door (Exit)
];

// ── Weight formula (graph_engine.py compute_edge_weight) ─────────
function computeEdgeWeight(
  riskScores: number[], i: number, j: number, dist: number
): number {
  const R_bar  = (riskScores[i] + riskScores[j]) / 2;
  const delta_R = Math.abs(riskScores[i] - riskScores[j]);
  const P_ij   = 1 - Math.exp(-LAMBDA * delta_R);
  return Math.min(1, Math.max(0, ALPHA * R_bar + BETA * dist + GAMMA * P_ij));
}

// ── Safety cost (dijkstra_algorithm.py compute_safety_cost) ──────
function safetyCost(r_i: number, r_j: number): number {
  const R_avg = (r_i + r_j) / 2;
  return 1 / (1 - R_avg + EPSILON);
}

// ── Dijkstra (browser simulation) ────────────────────────────────
interface DijkResult { dist: number[]; prev: number[]; path: number[]; steps: string[] }

function runDijkstra(risks: number[], source: number, exit: number): DijkResult {
  const n = 5;
  const dist    = Array(n).fill(Infinity);
  const prev    = Array(n).fill(-1);
  const visited = Array(n).fill(false);
  const steps: string[] = [];

  dist[source] = 0;
  const pq: [number, number][] = [[0, source]];

  while (pq.length > 0) {
    pq.sort((a, b) => a[0] - b[0]);
    const [d, u] = pq.shift()!;
    if (visited[u]) continue;
    visited[u] = true;
    steps.push(`Pop ${NODE_NAMES[u].replace(" (Exit)","✅")} (cost=${d.toFixed(3)})`);

    for (const [a, b] of STATIC_EDGES) {
      const v = a === u ? b : b === u ? a : -1;
      if (v === -1 || visited[v]) continue;
      const cost = safetyCost(risks[u], risks[v]);
      const alt  = dist[u] + cost;
      if (alt < dist[v]) {
        dist[v] = alt;
        prev[v] = u;
        pq.push([alt, v]);
        steps.push(
          `  Relax ${NODE_NAMES[u].split(" ")[0]}→${NODE_NAMES[v].split(" ")[0]} cost=${cost.toFixed(3)} dist=${alt.toFixed(3)}`
        );
      }
    }
  }

  const path: number[] = [];
  let curr = exit;
  while (curr !== -1) { path.unshift(curr); curr = prev[curr]; }
  return { dist, prev, path, steps };
}

// ── Colour helpers ────────────────────────────────────────────────
function nodeColor(r: number) {
  if (r < 0.20) return { fill: "#0d9488", glow: "rgba(13,148,136,0.45)" };
  if (r < 0.40) return { fill: "#38bdf8", glow: "rgba(56,189,248,0.45)" };
  if (r < 0.65) return { fill: "#f59e0b", glow: "rgba(245,158,11,0.45)" };
  if (r < 0.85) return { fill: "#f97316", glow: "rgba(249,115,22,0.45)" };
  return           { fill: "#f43f5e", glow: "rgba(244,63,94,0.45)" };
}
function edgeColor(w: number) {
  if (w < 0.35) return "#10b981";
  if (w < 0.65) return "#fbbf24";
  return "#f43f5e";
}

// ── Build per-zone risks from a single global score ───────────────
// Same distribution logic as graph_engine.py update_risk_scores()
// Kitchen (gas/env) and Hallway (near exit) amplified; Exterior always low.
function buildZoneRisks(globalRisk: number): number[] {
  return [
    Math.min(1, globalRisk * 0.9),                // Living
    Math.min(1, globalRisk * 1.2),                // Kitchen (gas sensor — amplified)
    Math.min(1, globalRisk * 0.8),                // Bedroom
    Math.min(1, globalRisk * 1.0),                // Hallway
    Math.max(0, globalRisk * 0.3 - 0.1),         // Main Door / Exterior (goal — kept low)
  ];
}

// ── Default per-zone risks for simulation ────────────────────────
const DEFAULT_ZONE_RISKS: number[] = [0.20, 0.25, 0.15, 0.20, 0.05];

// ─────────────────────────────────────────────────────────────────
export function DijkstraViz() {
  const [mode, setMode]     = useState<"live" | "sim">("live");

  // ── Simulation state: individual per-zone risk values ──
  const [zoneRisks, setZoneRisks] = useState<number[]>([...DEFAULT_ZONE_RISKS]);
  const [simSource, setSimSource] = useState(0);
  const [simResult, setSimResult] = useState<DijkResult | null>(null);
  const [running, setRunning]     = useState(false);
  const [stepIdx, setStepIdx]     = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  // ── Live state ──
  const { graphState, current } = useDashboardStore();
  const liveRisk   = current.risk;
  const liveRisks  = buildZoneRisks(liveRisk);
  const liveEdgeW  = STATIC_EDGES.map(([a, b, d]) => computeEdgeWeight(liveRisks, a, b, d));
  const livePath   = graphState?.dijk_path ?? [];
  const liveBFS    = graphState?.bfs_order ?? [];
  const liveCost   = graphState?.dijk_cost ?? null;

  const livePathSet = new Set<string>(
    livePath.slice(0, -1).map((n, i) => {
      const nxt = livePath[i + 1];
      return [Math.min(n, nxt), Math.max(n, nxt)].join("-");
    })
  );

  // ── Sim helpers — use per-zone risks directly ──
  const simEdgeW = STATIC_EDGES.map(([a, b, d]) => computeEdgeWeight(zoneRisks, a, b, d));

  const simPathSet = simResult
    ? new Set<string>(
        simResult.path.slice(0, -1).map((n, i) => {
          const nxt = simResult.path[i + 1];
          return [Math.min(n, nxt), Math.max(n, nxt)].join("-");
        })
      )
    : new Set<string>();

  // Update a single zone's risk value
  const handleZoneRisk = (zoneIdx: number, val: number) => {
    setZoneRisks(prev => { const next = [...prev]; next[zoneIdx] = val; return next; });
    handleReset();
  };

  const handleRun = useCallback(() => {
    if (running) return;
    setSimResult(null); setStepIdx(0); setRunning(true);
    const res = runDijkstra(zoneRisks, simSource, 4);
    setSimResult(res);
    let i = 0;
    function next() {
      i++;
      setStepIdx(i);
      if (i < res.steps.length) timerRef.current = setTimeout(next, 280);
      else setRunning(false);
    }
    timerRef.current = setTimeout(next, 200);
  }, [zoneRisks, simSource, running]);

  const handleReset = () => {
    clearTimeout(timerRef.current);
    setSimResult(null); setStepIdx(0); setRunning(false);
  };

  const handleResetZones = () => {
    setZoneRisks([...DEFAULT_ZONE_RISKS]);
    handleReset();
  };

  // ── Shared graph renderer ─────────────────────────────────────
  function GraphSVG({
    risks, edgeWeights, pathSet, path, bfsOrder, highlightBFS,
  }: {
    risks: number[]; edgeWeights: number[]; pathSet: Set<string>;
    path: number[]; bfsOrder?: number[]; highlightBFS?: boolean;
  }) {
    return (
      <svg viewBox="0 0 480 300" style={{ width: "100%", maxWidth: 480, display: "block", margin: "0 auto" }}>
        <defs>
          {NODE_POS.map((_, i) => (
            <radialGradient key={i} id={`glow-${i}-${mode}`} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={nodeColor(risks[i]).fill} stopOpacity={0.4} />
              <stop offset="100%" stopColor={nodeColor(risks[i]).fill} stopOpacity={0} />
            </radialGradient>
          ))}
        </defs>

        {/* BFS traversal order badges */}
        {highlightBFS && bfsOrder && bfsOrder.map((nodeIdx, bfsPos) => {
          const [x, y] = NODE_POS[nodeIdx];
          return (
            <motion.text key={`bfs-${nodeIdx}`} x={x + 24} y={y - 18}
              textAnchor="middle"
              initial={{ opacity: 0, scale: 0 }} animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: bfsPos * 0.12 }}
              style={{ fontSize: 10, fontFamily: "Inter,sans-serif", fontWeight: 800, fill: "#0284c7" }}>
              BFS:{bfsPos + 1}
            </motion.text>
          );
        })}

        {/* Edges */}
        {STATIC_EDGES.map(([a, b], idx) => {
          const [x1, y1] = NODE_POS[a];
          const [x2, y2] = NODE_POS[b];
          const key = `${Math.min(a, b)}-${Math.max(a, b)}`;
          const inPath = pathSet.has(key);
          const w = edgeWeights[idx];
          const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
          return (
            <g key={idx}>
              {inPath && (
                <motion.line x1={x1} y1={y1} x2={x2} y2={y2}
                  stroke="#38bdf8" strokeWidth={10} strokeOpacity={0.30}
                  initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
                  transition={{ duration: 0.6 }} />
              )}
              <line x1={x1} y1={y1} x2={x2} y2={y2}
                stroke={inPath ? "#0d9488" : edgeColor(w)}
                strokeWidth={inPath ? 3.5 : 1.8}
                strokeOpacity={0.85} />
              <rect x={mx - 18} y={my - 9} width={36} height={18} rx={5}
                fill="rgba(255,255,255,0.55)" />
              <text x={mx} y={my + 4} textAnchor="middle"
                style={{ fontSize: 10, fontFamily: "Inter,sans-serif", fontWeight: 600, fill: edgeColor(w) }}>
                {w.toFixed(2)}
              </text>
            </g>
          );
        })}

        {/* Nodes */}
        {NODE_POS.map(([x, y], i) => {
          const { fill } = nodeColor(risks[i]);
          const inPath = path.includes(i);
          const isSrc  = i === (mode === "live" ? 0 : 0);
          const isExit = i === 4;
          return (
            <g key={i}>
              <circle cx={x} cy={y} r={28} fill={`url(#glow-${i}-${mode})`} />
              <motion.circle cx={x} cy={y} r={22}
                fill={fill} fillOpacity={0.88}
                stroke={inPath ? "#ffffff" : "rgba(255,255,255,0.60)"}
                strokeWidth={inPath ? 3 : 1.5}
                animate={inPath ? { scale: [1, 1.12, 1] } : { scale: 1 }}
                transition={{ repeat: inPath ? Infinity : 0, duration: 1.2 }} />
              {isSrc  && <circle cx={x} cy={y} r={26} fill="none" stroke="#0d9488" strokeWidth={2} strokeDasharray="4 3" />}
              {isExit && <circle cx={x} cy={y} r={26} fill="none" stroke="#fbbf24" strokeWidth={2} strokeDasharray="4 3" />}
              <text x={x} y={y + 4} textAnchor="middle"
                style={{ fontSize: 9, fontFamily: "Inter,sans-serif", fontWeight: 800, fill: "white" }}>
                R:{risks[i].toFixed(2)}
              </text>
              <text x={x} y={y + 34} textAnchor="middle"
                style={{ fontSize: i === 4 ? 8 : 10, fontFamily: "Inter,sans-serif", fontWeight: 700, fill: "var(--text-primary)" }}>
                {NODE_ICONS[i]} {NODE_NAMES[i].split(" ")[0]}
              </text>
            </g>
          );
        })}
      </svg>
    );
  }

  // ─────────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>

      {/* ── Mode toggle ── */}
      <motion.div style={{ display: "flex", justifyContent: "center" }}
        initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        <div style={{
          display: "flex", borderRadius: 14, overflow: "hidden",
          border: "1.5px solid rgba(255,255,255,0.50)",
          background: "rgba(255,255,255,0.18)", backdropFilter: "blur(12px)",
        }}>
          {(["live", "sim"] as const).map(m => (
            <motion.button key={m}
              onClick={() => { setMode(m); handleReset(); }}
              whileTap={{ scale: 0.95 }}
              style={{
                padding: "10px 28px", fontFamily: "var(--font)", fontSize: "0.88rem",
                fontWeight: 700, border: "none", cursor: "pointer",
                background: mode === m ? "linear-gradient(135deg,var(--teal),var(--sky-dark))" : "transparent",
                color: mode === m ? "white" : "var(--text-secondary)",
                display: "flex", alignItems: "center", gap: 8, transition: "background 0.2s",
              }}>
              {m === "live" ? <Radio size={15} /> : <Sliders size={15} />}
              {m === "live" ? "Live Pi Mode" : "Simulation"}
            </motion.button>
          ))}
        </div>
      </motion.div>

      <AnimatePresence mode="wait">
        {/* ═══════════════ LIVE PI MODE ═══════════════ */}
        {mode === "live" && (
          <motion.div key="live" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.3 }}
            style={{ display: "grid", gridTemplateColumns: "1fr", gap: "1.5rem" }}
            className="dijk-layout">

            {/* Graph card */}
            <motion.div className="glass-card"
              initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
              style={{ padding: "1.5rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                <h3 style={{ fontFamily: "var(--font)", fontSize: "1.1rem", fontWeight: 800,
                  color: "var(--text-primary)", margin: 0 }}>
                  🏠 Live Evacuation Graph
                </h3>
                {/* Live badge */}
                <motion.div animate={{ opacity: [1, 0.4, 1] }} transition={{ repeat: Infinity, duration: 1.5 }}
                  style={{ display: "flex", alignItems: "center", gap: 5, padding: "3px 10px",
                    borderRadius: 20, background: graphState ? "rgba(16,185,129,0.15)" : "rgba(200,200,200,0.15)",
                    border: `1px solid ${graphState ? "#10b981" : "#aaa"}` }}>
                  <div style={{ width: 7, height: 7, borderRadius: "50%",
                    background: graphState ? "#10b981" : "#aaa" }} />
                  <span style={{ fontSize: "0.68rem", fontWeight: 700, fontFamily: "var(--font)",
                    color: graphState ? "#065f46" : "#666" }}>
                    {graphState ? "LIVE" : "WAITING…"}
                  </span>
                </motion.div>
              </div>
              <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginBottom: "1rem",
                fontFamily: "var(--font)" }}>
                Real-time Dijkstra path from <strong>raspberry_pi/dijkstra_algorithm.py</strong> ·
                Broadcast via <code>home/sensors/normalized</code>
              </p>

              {graphState ? (
                <GraphSVG risks={liveRisks} edgeWeights={liveEdgeW}
                  pathSet={livePathSet} path={livePath}
                  bfsOrder={liveBFS} highlightBFS />
              ) : (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center",
                  justifyContent: "center", minHeight: 200, gap: 12,
                  color: "var(--text-muted)", fontFamily: "var(--font)" }}>
                  <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
                    style={{ fontSize: "2rem" }}>⏳</motion.div>
                  <span style={{ fontWeight: 600, fontSize: "0.88rem" }}>
                    Waiting for Pi coordinator data…
                  </span>
                  <span style={{ fontSize: "0.74rem", textAlign: "center", maxWidth: 260 }}>
                    The FSM must reach <strong>MONITOR</strong> state or above before
                    the Pi publishes graph data. Trigger a sensor reading to begin.
                  </span>
                </div>
              )}

              {/* Legend */}
              <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginTop: "0.75rem" }}>
                {[["#10b981","Safe (w<0.35)"],["#fbbf24","Moderate (0.35–0.65)"],
                  ["#f43f5e","Hazard (w>0.65)"],["#0d9488","Dijkstra Path"],
                  ["#0284c7","BFS Order"]].map(([c, l]) => (
                  <div key={l} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <div style={{ width: 12, height: 12, borderRadius: 3, background: c }} />
                    <span style={{ fontSize: "0.70rem", color: "var(--text-muted)",
                      fontFamily: "var(--font)" }}>{l}</span>
                  </div>
                ))}
              </div>
            </motion.div>

            {/* Right panel — live info */}
            <motion.div className="glass-card"
              initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 }}
              style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1.25rem" }}>

              {/* Global risk */}
              <div style={{ background: "rgba(13,148,136,0.08)", border: "1px solid rgba(13,148,136,0.22)",
                borderRadius: 12, padding: "1rem" }}>
                <div style={{ fontFamily: "var(--font)", fontSize: "0.78rem", fontWeight: 700,
                  color: "var(--teal-dark)", marginBottom: 8, textTransform: "uppercase",
                  letterSpacing: "0.08em" }}>Global Risk Score (Live)</div>
                <div style={{ fontSize: "2.4rem", fontWeight: 900, fontFamily: "var(--font)",
                  color: liveRisk >= 0.65 ? "#f43f5e" : liveRisk >= 0.35 ? "#f59e0b" : "#0d9488" }}>
                  {(liveRisk * 100).toFixed(1)}%
                </div>
                <div style={{ fontSize: "0.74rem", color: "var(--text-muted)", fontFamily: "var(--font)",
                  marginTop: 4 }}>
                  FSM State: <strong style={{ color: "var(--teal-dark)" }}>{current.fsm_state}</strong>
                </div>
              </div>

              {/* Live path */}
              {graphState ? (
                <>
                  <div>
                    <div style={{ fontFamily: "var(--font)", fontSize: "0.82rem", fontWeight: 700,
                      color: "var(--teal-dark)", marginBottom: 8 }}>
                      🛣️ Safest Evacuation Path (Pi Computed)
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      {livePath.map((n, i) => (
                        <span key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <motion.span
                            initial={{ scale: 0 }} animate={{ scale: 1 }}
                            transition={{ delay: i * 0.1, type: "spring" }}
                            style={{ background: "rgba(13,148,136,0.15)",
                              border: "1px solid rgba(13,148,136,0.30)",
                              borderRadius: 8, padding: "4px 12px",
                              fontFamily: "var(--font)", fontSize: "0.80rem",
                              fontWeight: 700, color: "var(--teal-dark)" }}>
                            {NODE_ICONS[n]} {NODE_NAMES[n].split(" ")[0]}
                          </motion.span>
                          {i < livePath.length - 1 &&
                            <span style={{ color: "var(--text-muted)" }}>→</span>}
                        </span>
                      ))}
                    </div>
                    <div style={{ marginTop: 8, fontSize: "0.76rem", color: "var(--text-muted)",
                      fontFamily: "var(--font)" }}>
                      Total safety cost:
                      <strong style={{ color: "var(--teal-dark)", marginLeft: 4 }}>
                        {liveCost !== null ? liveCost.toFixed(4) : "—"}
                      </strong>
                    </div>
                  </div>

                  {/* BFS order */}
                  <div>
                    <div style={{ fontFamily: "var(--font)", fontSize: "0.82rem", fontWeight: 700,
                      color: "var(--text-secondary)", marginBottom: 8 }}>
                      📡 BFS Traversal Order (from Living)
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {liveBFS.map((n, i) => (
                        <motion.span key={i}
                          initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.08 }}
                          style={{ background: "rgba(2,132,199,0.12)",
                            border: "1px solid rgba(2,132,199,0.30)",
                            borderRadius: 6, padding: "3px 9px",
                            fontFamily: "var(--font)", fontSize: "0.75rem",
                            fontWeight: 700, color: "#0284c7" }}>
                          {i + 1}. {NODE_NAMES[n].split(" ")[0]}
                        </motion.span>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <div style={{ fontFamily: "var(--font)", fontSize: "0.82rem",
                  color: "var(--text-muted)", textAlign: "center", padding: "1rem" }}>
                  Path data appears once the Raspberry Pi coordinator runs Dijkstra
                  (FSM must be ≥ MONITOR).
                </div>
              )}

              {/* Node sensor info */}
              <div style={{ background: "rgba(255,255,255,0.25)",
                border: "1px solid rgba(255,255,255,0.50)",
                borderRadius: 12, padding: "0.85rem" }}>
                <div style={{ fontFamily: "var(--font)", fontSize: "0.78rem", fontWeight: 700,
                  color: "var(--teal-dark)", marginBottom: 8 }}>
                  📍 Zone → ESP32 Sensor Mapping
                </div>
                {NODE_NAMES.map((name, i) => NODE_SENSORS[i] && (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between",
                    padding: "4px 0", borderBottom: "1px solid rgba(255,255,255,0.20)" }}>
                    <span style={{ fontFamily: "var(--font)", fontSize: "0.76rem",
                      fontWeight: 700, color: "var(--text-secondary)" }}>
                      {NODE_ICONS[i]} {name}
                    </span>
                    <span style={{ fontFamily: "var(--font)", fontSize: "0.74rem",
                      color: "var(--text-muted)" }}>
                      {NODE_SENSORS[i]}
                    </span>
                  </div>
                ))}
              </div>

              {/* Formula */}
              <div style={{ background: "rgba(255,255,255,0.25)",
                border: "1px solid rgba(255,255,255,0.50)",
                borderRadius: 12, padding: "0.85rem" }}>
                <div style={{ fontFamily: "var(--font)", fontSize: "0.78rem", fontWeight: 700,
                  color: "var(--teal-dark)", marginBottom: 6 }}>Weight Formula (config.py)</div>
                <p style={{ fontFamily: "monospace", fontSize: "0.75rem",
                  color: "var(--text-secondary)", lineHeight: 1.7, margin: 0 }}>
                  W_edge = α·R̄ + β·d_ij + γ·P_ij<br />
                  α={ALPHA}, β={BETA}, γ={GAMMA}, λ={LAMBDA}<br />
                  W_safe = 1 / (1 − R_avg + ε)
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* ═══════════════ SIMULATION MODE ═══════════════ */}
        {mode === "sim" && (
          <motion.div key="sim" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.3 }}
            style={{ display: "grid", gridTemplateColumns: "1fr", gap: "1.5rem" }}
            className="dijk-layout">

            {/* Graph SVG card */}
            <motion.div className="glass-card"
              initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
              style={{ padding: "1.5rem" }}>
              <h3 style={{ fontFamily: "var(--font)", fontSize: "1.1rem", fontWeight: 800,
                color: "var(--text-primary)", marginBottom: "0.5rem" }}>
                🗺️ Interactive Pathfinder Simulation
              </h3>
              <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginBottom: "1rem",
                fontFamily: "var(--font)" }}>
                5 zones · 6 edges · Set each zone's risk individually — watch edge weights and the optimal path update in real time
              </p>

              <GraphSVG risks={zoneRisks} edgeWeights={simEdgeW}
                pathSet={simPathSet} path={simResult?.path ?? []} />

              {/* Legend */}
              <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginTop: "0.75rem" }}>
                {[["#10b981","Safe (w<0.35)"],["#fbbf24","Moderate (0.35–0.65)"],
                  ["#f43f5e","Hazard (w>0.65)"],["#0d9488","Dijkstra Path"]].map(([c, l]) => (
                  <div key={l} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <div style={{ width: 12, height: 12, borderRadius: 3, background: c }} />
                    <span style={{ fontSize: "0.70rem", color: "var(--text-muted)",
                      fontFamily: "var(--font)" }}>{l}</span>
                  </div>
                ))}
              </div>
            </motion.div>

            {/* Controls */}
            <motion.div className="glass-card"
              initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 }}
              style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1.25rem" }}>

              {/* ── Per-zone risk sliders ── */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <label style={{ fontFamily: "var(--font)", fontSize: "0.85rem", fontWeight: 700,
                    color: "var(--text-secondary)" }}>
                    🎚️ Per-Zone Risk Values
                  </label>
                  <motion.button whileTap={{ scale: 0.92 }}
                    onClick={handleResetZones}
                    style={{ padding: "3px 12px", borderRadius: 20, border: "1px solid rgba(255,255,255,0.50)",
                      fontSize: "0.68rem", fontWeight: 700, fontFamily: "var(--font)", cursor: "pointer",
                      background: "rgba(255,255,255,0.22)", color: "var(--text-secondary)" }}>
                    Reset All
                  </motion.button>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                  {NODE_NAMES.map((name, zi) => {
                    const risk = zoneRisks[zi];
                    const color = risk < 0.20 ? "#0d9488" : risk < 0.40 ? "#38bdf8" : risk < 0.65 ? "#f59e0b" : risk < 0.85 ? "#f97316" : "#f43f5e";
                    return (
                      <div key={zi}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                          <span style={{ fontFamily: "var(--font)", fontSize: "0.78rem", fontWeight: 700,
                            color: "var(--text-secondary)" }}>
                            {NODE_ICONS[zi]} {name.split(" ")[0]}
                            {NODE_SENSORS[zi] && <span style={{ fontWeight: 400, fontSize: "0.68rem",
                              color: "var(--text-muted)", marginLeft: 5 }}>· {NODE_SENSORS[zi]}</span>}
                          </span>
                          <span style={{ fontFamily: "monospace", fontSize: "0.80rem", fontWeight: 800,
                            color, minWidth: 38, textAlign: "right" }}>
                            {(risk * 100).toFixed(0)}%
                          </span>
                        </div>
                        <input type="range" min={0} max={1} step={0.01}
                          value={risk}
                          onChange={e => handleZoneRisk(zi, +e.target.value)}
                          style={{ accentColor: color }} />
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Source selector */}
              <div>
                <label style={{ fontFamily: "var(--font)", fontSize: "0.85rem", fontWeight: 700,
                  color: "var(--text-secondary)", display: "block", marginBottom: 8 }}>
                  Start Zone
                </label>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {[0, 1, 2, 3].map(i => (
                    <motion.button key={i} onClick={() => { setSimSource(i); handleReset(); }}
                      whileTap={{ scale: 0.94 }}
                      style={{
                        padding: "6px 14px", borderRadius: 9, border: "1px solid",
                        fontFamily: "var(--font)", fontSize: "0.80rem", fontWeight: 600,
                        cursor: "pointer",
                        background: simSource === i
                          ? "linear-gradient(135deg,var(--teal),var(--sky-dark))"
                          : "rgba(255,255,255,0.30)",
                        borderColor: simSource === i ? "transparent" : "rgba(255,255,255,0.55)",
                        color: simSource === i ? "white" : "var(--text-secondary)",
                        boxShadow: simSource === i ? "0 4px 12px rgba(13,148,136,0.35)" : "none",
                      }}>
                      {NODE_ICONS[i]} {NODE_NAMES[i].split(" ")[0]}
                    </motion.button>
                  ))}
                </div>
              </div>

              {/* Run / Reset */}
              <div style={{ display: "flex", gap: "0.75rem" }}>
                <motion.button className="btn-teal" onClick={handleRun}
                  disabled={running} whileTap={{ scale: 0.94 }}
                  style={{ opacity: running ? 0.7 : 1, flex: 1 }}>
                  {running
                    ? <motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }}>⏳</motion.span>
                    : <Play className="w-4 h-4" />}
                  {running ? "Running…" : "Run Dijkstra"}
                </motion.button>
                <motion.button className="btn-ghost" onClick={handleReset} whileTap={{ scale: 0.94 }}>
                  <RotateCcw className="w-4 h-4" /> Reset
                </motion.button>
              </div>

              {/* Result */}
              <AnimatePresence>
                {simResult && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    style={{ background: "rgba(13,148,136,0.08)",
                      border: "1px solid rgba(13,148,136,0.25)",
                      borderRadius: 14, padding: "1rem" }}>
                    <div style={{ fontFamily: "var(--font)", fontSize: "0.82rem", fontWeight: 700,
                      color: "var(--teal-dark)", marginBottom: 6 }}>🛣️ Safe Evacuation Path</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                      {simResult.path.map((n, i) => (
                        <span key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <span style={{ background: "rgba(13,148,136,0.15)",
                            border: "1px solid rgba(13,148,136,0.30)",
                            borderRadius: 8, padding: "3px 10px",
                            fontFamily: "var(--font)", fontSize: "0.80rem",
                            fontWeight: 700, color: "var(--teal-dark)" }}>
                            {NODE_ICONS[n]} {NODE_NAMES[n].split(" ")[0]}
                          </span>
                          {i < simResult.path.length - 1 &&
                            <span style={{ color: "var(--text-muted)" }}>→</span>}
                        </span>
                      ))}
                    </div>
                    <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", fontFamily: "var(--font)" }}>
                      Total safety cost: <strong style={{ color: "var(--teal-dark)" }}>
                        {simResult.dist[4].toFixed(4)}
                      </strong>
                      &nbsp;·&nbsp; W_safe = 1 / (1 − R_avg + ε)
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Step log */}
              <AnimatePresence>
                {simResult && simResult.steps.length > 0 && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    style={{ background: "rgba(255,255,255,0.30)",
                      border: "1px solid rgba(255,255,255,0.55)",
                      borderRadius: 12, padding: "0.85rem", maxHeight: 160, overflowY: "auto" }}>
                    <div style={{ fontFamily: "var(--font)", fontSize: "0.72rem", fontWeight: 700,
                      color: "var(--text-muted)", marginBottom: 6, textTransform: "uppercase",
                      letterSpacing: "0.10em" }}>Priority Queue Steps</div>
                    {simResult.steps.slice(0, stepIdx).map((s, i) => (
                      <motion.div key={i} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.18 }}
                        style={{ fontFamily: "monospace", fontSize: "0.72rem",
                          color: s.startsWith("  ") ? "var(--text-muted)" : "var(--teal-dark)",
                          lineHeight: 1.6 }}>
                        {s}
                      </motion.div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Formula */}
              <div style={{ background: "rgba(255,255,255,0.25)",
                border: "1px solid rgba(255,255,255,0.50)",
                borderRadius: 12, padding: "0.85rem" }}>
                <div style={{ fontFamily: "var(--font)", fontSize: "0.78rem", fontWeight: 700,
                  color: "var(--teal-dark)", marginBottom: 6 }}>Weight Formula (config.py)</div>
                <p style={{ fontFamily: "monospace", fontSize: "0.75rem",
                  color: "var(--text-secondary)", lineHeight: 1.7, margin: 0 }}>
                  W_edge = α·R̄ + β·d_ij + γ·P_ij<br />
                  α={ALPHA}, β={BETA}, γ={GAMMA}, λ={LAMBDA}<br />
                  W_safe = 1 / (1 − R_avg + ε)
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        @media (min-width: 900px) { .dijk-layout { grid-template-columns: 1fr 1fr !important; } }
      `}</style>
    </div>
  );
}
