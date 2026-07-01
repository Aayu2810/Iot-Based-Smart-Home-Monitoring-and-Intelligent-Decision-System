import { useEffect } from "react";
import { useDashboardStore } from "../store/dashboardStore";
import { getHistoricalData, getHealth } from "../services/api";

const HEALTH_POLL_MS = 5000;
const HISTORY_REFRESH_MS = 30_000;

export function useHistoricalData() {
  const { historyRange, setHistory, setIsLoadingHistory, setHealth } =
    useDashboardStore();

  // Re-fetch history when the range changes AND every 30 s.
  // setHistory skips replacing if the server returns empty, preserving live
  // WebSocket points already appended by useMQTT.
  useEffect(() => {
    let cancelled = false;

    async function fetchHistory() {
      setIsLoadingHistory(true);
      try {
        const data = await getHistoricalData(historyRange);
        if (!cancelled) setHistory(data);
      } catch (err) {
        console.error("[history] fetch failed:", err);
      } finally {
        if (!cancelled) setIsLoadingHistory(false);
      }
    }

    fetchHistory();
    const id = setInterval(fetchHistory, HISTORY_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [historyRange, setHistory, setIsLoadingHistory]);

  // Poll /api/health every 5 s
  useEffect(() => {
    let cancelled = false;

    async function pollHealth() {
      try {
        const h = await getHealth();
        if (!cancelled) setHealth(h);
      } catch {
        // server may not be ready yet
      }
    }

    pollHealth();
    const id = setInterval(pollHealth, HEALTH_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [setHealth]);
}
