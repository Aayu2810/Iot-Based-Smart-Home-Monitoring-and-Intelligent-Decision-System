import React from "react";
import { motion } from "framer-motion";
import {
  Thermometer, Droplets, Wind, Activity, Sun, Shield, Cpu, Bell,
} from "lucide-react";
import { useDashboardStore } from "../../store/dashboardStore";
import { FsmState } from "../../types";

// ── colour helpers ───────────────────────────────────────────────

function fsmBadgeStyle(state: FsmState): React.CSSProperties {
  const base: React.CSSProperties = {
    display: "inline-block", padding: "5px 14px", borderRadius: "10px",
    border: "1px solid", fontSize: "0.82rem", fontWeight: 700,
    fontFamily: "var(--font)", letterSpacing: "0.04em",
  };
  const map: Record<FsmState, React.CSSProperties> = {
    IDLE:       { ...base, background:"rgba(13,148,136,0.15)",  borderColor:"rgba(13,148,136,0.35)",  color:"#0f766e" },
    MONITOR:    { ...base, background:"rgba(56,189,248,0.15)",  borderColor:"rgba(56,189,248,0.35)",  color:"#0284c7" },
    ALERT_LOW:  { ...base, background:"rgba(245,158,11,0.15)",  borderColor:"rgba(245,158,11,0.35)",  color:"#b45309" },
    ALERT_HIGH: { ...base, background:"rgba(249,115,22,0.15)",  borderColor:"rgba(249,115,22,0.35)",  color:"#c2410c" },
    CRITICAL:   { ...base, background:"rgba(244,63,94,0.15)",   borderColor:"rgba(244,63,94,0.35)",   color:"#be123c" },
    FAULT:      { ...base, background:"rgba(139,92,246,0.15)",  borderColor:"rgba(139,92,246,0.35)",  color:"#7c3aed" },
  };
  return map[state] ?? { ...base, background:"rgba(255,255,255,0.20)", borderColor:"rgba(255,255,255,0.50)", color:"var(--text-muted)" };
}

function riskColor(r: number) {
  if (r < 0.2) return "#0d9488"; if (r < 0.4) return "#38bdf8";
  if (r < 0.65) return "#f59e0b"; if (r < 0.85) return "#f97316";
  return "#f43f5e";
}
function riskBarColor(r: number) {
  if (r < 0.2) return "linear-gradient(90deg,#14b8a6,#0d9488)";
  if (r < 0.4) return "linear-gradient(90deg,#38bdf8,#0284c7)";
  if (r < 0.65) return "linear-gradient(90deg,#fbbf24,#f59e0b)";
  if (r < 0.85) return "linear-gradient(90deg,#fb923c,#f97316)";
  return "linear-gradient(90deg,#f87171,#f43f5e)";
}
function isAlertActive(s: FsmState) { return s === "ALERT_HIGH" || s === "CRITICAL"; }

// ── sub-components ───────────────────────────────────────────────

interface CardProps {
  label: string; icon: React.ReactNode; children: React.ReactNode; alertBorder?: boolean;
}

function Card({ label, icon, children, alertBorder }: CardProps) {
  return (
    <motion.div
      className="glass-card"
      whileHover={{ scale: 1.025, y: -3 }}
      transition={{ type: "spring", stiffness: 350, damping: 28 }}
      style={{
        padding: "1.25rem",
        display: "flex", flexDirection: "column", gap: "1rem",
        border: alertBorder ? "1px solid rgba(244,63,94,0.45)" : undefined,
      }}
    >
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <span style={{ fontFamily:"var(--font)", fontSize:"0.72rem", fontWeight:700,
          letterSpacing:"0.12em", textTransform:"uppercase", color:"var(--text-muted)" }}>
          {label}
        </span>
        <div style={{ color:"var(--text-muted)", opacity:0.75 }}>{icon}</div>
      </div>
      {children}
    </motion.div>
  );
}

function BigVal({ v, unit, color="var(--text-primary)" }: { v: string; unit: string; color?: string }) {
  return (
    <div style={{ fontFamily:"var(--font)", fontSize:"2.6rem", fontWeight:800,
      color, lineHeight:1, fontVariantNumeric:"tabular-nums" }}>
      {v}
      <span style={{ fontSize:"1.1rem", fontWeight:400, color:"var(--text-muted)", marginLeft:5 }}>{unit}</span>
    </div>
  );
}

function Bar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="progress-track">
      <motion.div
        className="progress-fill"
        initial={{ width: 0 }}
        animate={{ width: `${Math.min(100, pct)}%` }}
        transition={{ duration: 0.8, ease: [0.34, 1.56, 0.64, 1] }}
        style={{ background: color }}
      />
    </div>
  );
}

// ── main export ──────────────────────────────────────────────────

export function OverviewCards() {
  const { current } = useDashboardStore();

  const cardVariants = {
    hidden: { opacity: 0, scale: 0.94, y: 20 },
    show:   { opacity: 1, scale: 1,    y: 0,
      transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] } },
  };
  const container = {
    hidden: {}, show: { transition: { staggerChildren: 0.07 } },
  };

  return (
    <motion.div
      variants={container} initial="hidden" animate="show"
      style={{
        display:"grid",
        gridTemplateColumns:"repeat(2, 1fr)",
        gap:"1.1rem",
      }}
      className="ov-grid"
    >
      <motion.div variants={cardVariants}>
        <Card label="Temperature" icon={<Thermometer className="w-5 h-5" />}>
          <BigVal v={current.temperature.toFixed(1)} unit="°C" />
          <Bar pct={(current.temperature/50)*100} color="linear-gradient(90deg,#fbbf24,#f59e0b)" />
        </Card>
      </motion.div>

      <motion.div variants={cardVariants}>
        <Card label="Humidity" icon={<Droplets className="w-5 h-5" />}>
          <BigVal v={current.humidity.toFixed(1)} unit="%" />
          <Bar pct={current.humidity} color="linear-gradient(90deg,#38bdf8,#0284c7)" />
        </Card>
      </motion.div>

      <motion.div variants={cardVariants}>
        <Card label="Gas Level" icon={<Wind className="w-5 h-5" />}>
          <BigVal v={current.gas_ppm.toFixed(1)} unit="ppm" />
          <Bar pct={(current.gas_ppm/1000)*100} color="linear-gradient(90deg,#a78bfa,#8b5cf6)" />
        </Card>
      </motion.div>

      <motion.div variants={cardVariants}>
        <Card label="Motion" icon={<Activity className="w-5 h-5" />}>
          <div style={{ display:"flex", alignItems:"center", gap:"0.85rem" }}>
            <motion.div
              animate={{ scale: current.pir_state ? [1, 1.3, 1] : 1 }}
              transition={{ repeat: current.pir_state ? Infinity : 0, duration: 0.8 }}
              style={{
                width:12, height:12, borderRadius:"50%", flexShrink:0,
                background: current.pir_state ? "var(--rose)" : "rgba(255,255,255,0.35)",
                boxShadow: current.pir_state ? "0 0 12px rgba(244,63,94,0.60)" : "none",
              }}
            />
            <span style={{ fontFamily:"var(--font)", fontSize:"1.9rem", fontWeight:800,
              color: current.pir_state ? "var(--rose)" : "var(--text-muted)" }}>
              {current.pir_state ? "Detected" : "Clear"}
            </span>
          </div>
          <span style={{ fontSize:"0.75rem", color:"var(--text-muted)" }}>PIR sensor (debounced)</span>
        </Card>
      </motion.div>

      <motion.div variants={cardVariants}>
        <Card label="Darkness Level" icon={<Sun className="w-5 h-5" />}>
          <BigVal v={(current.ldr_norm*100).toFixed(0)} unit="%" />
          <Bar pct={current.ldr_norm*100} color="linear-gradient(90deg,#fde047,#eab308)" />
        </Card>
      </motion.div>

      <motion.div variants={cardVariants}>
        <Card label="Risk Score" icon={<Shield className="w-5 h-5" />}>
          <BigVal v={(current.risk*100).toFixed(1)} unit="%" color={riskColor(current.risk)} />
          <Bar pct={current.risk*100} color={riskBarColor(current.risk)} />
        </Card>
      </motion.div>

      <motion.div variants={cardVariants}>
        <Card label="FSM State" icon={<Cpu className="w-5 h-5" />}>
          <span style={fsmBadgeStyle(current.fsm_state)}>{current.fsm_state}</span>
          <div style={{ fontSize:"0.8rem", color:"var(--text-muted)" }}>
            {current.fsm_state === "IDLE"       && "System nominal"}
            {current.fsm_state === "MONITOR"    && "Elevated monitoring"}
            {current.fsm_state === "ALERT_LOW"  && "Low-level alert active"}
            {current.fsm_state === "ALERT_HIGH" && "High alert — check sensors"}
            {current.fsm_state === "CRITICAL"   && "Critical hazard detected"}
            {current.fsm_state === "FAULT"      && "Sensor fault detected"}
          </div>
        </Card>
      </motion.div>

      <motion.div variants={cardVariants}>
        <Card label="Alert Status" icon={<Bell className="w-5 h-5" />}
          alertBorder={isAlertActive(current.fsm_state)}>
          <div style={{ display:"flex", alignItems:"center", gap:"0.85rem" }}>
            <motion.div
              animate={{ scale: isAlertActive(current.fsm_state) ? [1,1.3,1] : 1 }}
              transition={{ repeat: isAlertActive(current.fsm_state) ? Infinity : 0, duration:0.8 }}
              style={{
                width:12, height:12, borderRadius:"50%",
                background: isAlertActive(current.fsm_state) ? "var(--rose)" : "var(--teal-light)",
                boxShadow: isAlertActive(current.fsm_state) ? "0 0 12px rgba(244,63,94,0.60)" : "0 0 10px rgba(20,184,166,0.50)",
              }}
            />
            <span style={{ fontSize:"1.9rem", fontWeight:800,
              color: isAlertActive(current.fsm_state) ? "var(--rose)" : "var(--teal-dark)" }}>
              {isAlertActive(current.fsm_state) ? "Active" : "Normal"}
            </span>
          </div>
          <div style={{ fontSize:"0.75rem", color:"var(--text-muted)" }}>
            {isAlertActive(current.fsm_state) ? `FSM: ${current.fsm_state}` : "No critical alerts"}
          </div>
        </Card>
      </motion.div>

      <style>{`
        @media (min-width: 1024px) { .ov-grid { grid-template-columns: repeat(4, 1fr) !important; } }
      `}</style>
    </motion.div>
  );
}
