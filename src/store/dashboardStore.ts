import { create } from "zustand";
import { CurrentState, GraphState, HealthStatus, HistoryData, AlertEntry, HistoryPoint } from "../types";

const MAX_ALERTS = 50;
// Live buffer limits: one point every 10 s → 8 640 points / 24 h
const MAX_LIVE_POINTS = 2_000;
const LIVE_THROTTLE_MS = 10_000;
let _lastLiveTs = 0;

interface DashboardStore {
  current: CurrentState;
  setCurrent: (state: CurrentState) => void;

  // Live graph topology from the Pi's Dijkstra engine (null until first MQTT packet)
  graphState: GraphState | null;
  setGraphState: (g: GraphState | null) => void;

  health: HealthStatus;
  setHealth: (health: HealthStatus | ((prev: HealthStatus) => HealthStatus)) => void;

  history: HistoryData;
  /** Replace history with server-fetched data (only when server has actual points). */
  setHistory: (data: HistoryData) => void;
  /** Append one live reading from a WebSocket state_update (throttled to LIVE_THROTTLE_MS). */
  appendToHistory: (pt: { ts: number; temperature: number; humidity: number; gas_ppm: number; risk: number }) => void;

  alerts: AlertEntry[];
  addAlert: (alert: Omit<AlertEntry, "id">) => void;
  clearAlerts: () => void;

  isLoadingHistory: boolean;
  setIsLoadingHistory: (loading: boolean) => void;

  historyRange: "24h" | "7d" | "30d";
  setHistoryRange: (range: "24h" | "7d" | "30d") => void;
}

export const useDashboardStore = create<DashboardStore>((set) => ({
  current: {
    temperature: 0,
    humidity: 0,
    gas_ppm: 0,
    pir_state: false,
    ldr_raw: 0,
    ldr_norm: 0,
    risk: 0,
    fsm_state: "IDLE",
    ts: 0,
  },
  setCurrent: (state) => set({ current: state }),

  graphState: null,
  setGraphState: (g) => set({ graphState: g }),

  health: {
    mqtt_connected: false,
    last_update: 0,
    packet_rate: 0,
    uptime_seconds: 0,
  },
  setHealth: (health) =>
    set((s) => ({
      health: typeof health === "function" ? health(s.health) : health,
    })),

  history: {
    temperatures: [],
    humidities: [],
    gases: [],
    risks: [],
  },
  setHistory: (data) => {
    // Only replace if the server actually returned points; otherwise preserve live data.
    const hasData =
      data.temperatures.length > 0 ||
      data.humidities.length > 0 ||
      data.gases.length > 0 ||
      data.risks.length > 0;
    if (hasData) set({ history: data });
  },
  appendToHistory: (pt) => {
    const now = pt.ts || Date.now();
    if (now - _lastLiveTs < LIVE_THROTTLE_MS) return;
    _lastLiveTs = now;
    const push = (arr: HistoryPoint[], value: number): HistoryPoint[] => {
      if (value == null || isNaN(value)) return arr;
      const next = [...arr, { ts: now, value }];
      return next.length > MAX_LIVE_POINTS ? next.slice(-MAX_LIVE_POINTS) : next;
    };
    set((s) => ({
      history: {
        temperatures: push(s.history.temperatures, pt.temperature),
        humidities:   push(s.history.humidities,   pt.humidity),
        gases:        push(s.history.gases,         pt.gas_ppm),
        risks:        push(s.history.risks,         pt.risk),
      },
    }));
  },

  alerts: [],
  addAlert: (alert) =>
    set((s) => {
      const entry: AlertEntry = {
        ...alert,
        id: `${alert.ts}-${alert.kind}-${Math.random().toString(36).slice(2, 7)}`,
      };
      const updated = [entry, ...s.alerts].slice(0, MAX_ALERTS);
      return { alerts: updated };
    }),
  clearAlerts: () => set({ alerts: [] }),

  isLoadingHistory: false,
  setIsLoadingHistory: (loading) => set({ isLoadingHistory: loading }),

  historyRange: "24h",
  setHistoryRange: (range) => set({ historyRange: range }),
}));
