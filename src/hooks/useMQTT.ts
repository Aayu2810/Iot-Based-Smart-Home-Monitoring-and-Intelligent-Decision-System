import { useEffect, useRef } from "react";
import { useDashboardStore } from "../store/dashboardStore";
import { CurrentState, GraphState } from "../types";

const RECONNECT_DELAY_MS = 3000;

export function useMQTT() {
  const { setCurrent, setGraphState, setHealth, addAlert, appendToHistory } = useDashboardStore();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let destroyed = false;

    function connect() {
      if (destroyed) return;

      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const url = `${protocol}//${window.location.host}/ws`;
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.addEventListener("open", () => {
        setHealth((prev) => ({ ...prev, mqtt_connected: true }));
      });

      ws.addEventListener("message", (event: MessageEvent) => {
        try {
          const msg = JSON.parse(event.data as string);

          if (msg.type === "state_update" && msg.data) {
            const s = msg.data as CurrentState;
            setCurrent(s);
            // Feed live readings into the historical chart buffer
            appendToHistory({
              ts:          s.ts || Date.now(),
              temperature: s.temperature,
              humidity:    s.humidity,
              gas_ppm:     s.gas_ppm,
              risk:        s.risk,
            });
            // If the Pi has computed a live graph (FSM >= MONITOR), store it
            if (msg.data.graph) {
              setGraphState({
                ...(msg.data.graph as GraphState),
                risk: (msg.data as CurrentState).risk,
                ts:   (msg.data as CurrentState).ts,
              });
            }
          } else if (msg.type === "mqtt_status") {
            setHealth((prev) => ({
              ...prev,
              mqtt_connected: Boolean(msg.data?.connected),
              last_update: Date.now(),
            }));
          } else if (msg.type === "alert" && msg.data) {
            addAlert({
              kind: msg.data.kind,
              message: msg.data.message,
              ts: msg.data.ts ?? Date.now(),
            });
          }
        } catch {
          // malformed frame — ignore
        }
      });

      ws.addEventListener("error", () => {
        setHealth((prev) => ({ ...prev, mqtt_connected: false }));
      });

      ws.addEventListener("close", () => {
        wsRef.current = null;
        setHealth((prev) => ({ ...prev, mqtt_connected: false }));
        if (!destroyed) {
          reconnectTimer.current = setTimeout(connect, RECONNECT_DELAY_MS);
        }
      });
    }

    connect();

    return () => {
      destroyed = true;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [setCurrent, setGraphState, setHealth, addAlert, appendToHistory]);
}
