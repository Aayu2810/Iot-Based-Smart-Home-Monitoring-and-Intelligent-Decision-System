import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useDashboardStore } from "../../store/dashboardStore";
import { Radio, Sliders } from "lucide-react";

// ── FSM data from raspberry_pi/edge_algorithms/fsm_engine.py ─────
const STATES = ["IDLE", "MONITOR", "ALERT_LOW", "ALERT_HIGH", "CRITICAL", "FAULT"];
const SIGMA  = ["σ₀\nR<0.20", "σ₁\n0.20–0.40", "σ₂\n0.40–0.65", "σ₃\n0.65–0.85", "σ₄\nR≥0.85", "σ₅\nFault"];

// transition_table[state][sigma] = nextState (from fsm_engine.py)
const TRANSITION: number[][] = [
  [0, 1, 2, 3, 4, 5], // IDLE
  [0, 1, 2, 3, 4, 5], // MONITOR
  [1, 1, 2, 3, 4, 5], // ALERT_LOW
  [1, 1, 2, 3, 4, 5], // ALERT_HIGH
  [1, 1, 2, 3, 4, 5], // CRITICAL
  [0, 1, 2, 3, 4, 5], // FAULT
];

// ── State colour map ──────────────────────────────────────────────
const STATE_COLORS: Record<string, { bg: string; border: string; text: string; glow: string }> = {
  IDLE:       { bg:"rgba(13,148,136,0.18)",  border:"rgba(13,148,136,0.50)",  text:"#0f766e", glow:"rgba(13,148,136,0.30)" },
  MONITOR:    { bg:"rgba(56,189,248,0.18)",  border:"rgba(56,189,248,0.50)",  text:"#0284c7", glow:"rgba(56,189,248,0.30)" },
  ALERT_LOW:  { bg:"rgba(245,158,11,0.18)",  border:"rgba(245,158,11,0.50)",  text:"#b45309", glow:"rgba(245,158,11,0.30)" },
  ALERT_HIGH: { bg:"rgba(249,115,22,0.18)",  border:"rgba(249,115,22,0.50)",  text:"#c2410c", glow:"rgba(249,115,22,0.30)" },
  CRITICAL:   { bg:"rgba(244,63,94,0.18)",   border:"rgba(244,63,94,0.50)",   text:"#be123c", glow:"rgba(244,63,94,0.30)" },
  FAULT:      { bg:"rgba(139,92,246,0.18)",  border:"rgba(139,92,246,0.50)",  text:"#7c3aed", glow:"rgba(139,92,246,0.30)" },
};

// ── FSM Positions in SVG ──────────────────────────────────────────
const FSM_POS: [number, number][] = [
  [240,  50], // IDLE (top)
  [400, 140], // MONITOR (right-top)
  [400, 250], // ALERT_LOW (right-bottom)
  [240, 330], // ALERT_HIGH (bottom)
  [ 80, 250], // CRITICAL (left-bottom)
  [ 80, 140], // FAULT (left-top)
];

// ── Sigma index from risk score ───────────────────────────────────
function getSigmaIdx(risk: number, fault: boolean): number {
  if (fault)     return 5;
  if (risk < 0.20) return 0;
  if (risk < 0.40) return 1;
  if (risk < 0.65) return 2;
  if (risk < 0.85) return 3;
  return 4;
}

// ── Boolean logic ─────────────────────────────────────────────────
type BoolState = { T: boolean; S: boolean; P: boolean; L: boolean };

function evalBoolean(b: BoolState) {
  return {
    fire:      b.T && b.S,
    gas:       b.S && !b.T,
    intrusion: b.P && !b.L,
    critical:  b.S && (b.T || b.P),  // Quine-McCluskey: S(T+P)
  };
}

// ── Truth table minterms ──────────────────────────────────────────
const MINTERMS = new Set([6, 7, 10, 11, 12, 13, 14, 15]);

// ── Graph properties data ─────────────────────────────────────────
const ADJ = [
  [0,1,1,1,0],
  [1,0,0,1,0],
  [1,0,0,1,0],
  [1,1,1,0,1],
  [0,0,0,1,0],
];
const DISTS = [
  [0,   0.30, 0.40, 0.25, 0   ],
  [0.30,0,    0,    0.20, 0   ],
  [0.40,0,    0,    0.20, 0   ],
  [0.25,0.20, 0.20, 0,    0.35],
  [0,   0,    0,    0.35, 0   ],
];
const CHROMATIC_COLORS = [0,1,2,0,1];
const CHROM_PALETTE = ["#0d9488","#8b5cf6","#f59e0b"];

// ──────────────────────────────────────────────────────────────────
type DmTab = "fsm" | "boolean" | "graph";

export function DiscreteMathViz() {
  const [dmTab, setDmTab] = useState<DmTab>("fsm");

  const tabs: { id: DmTab; label: string }[] = [
    { id:"fsm",     label:"FSM Diagram" },
    { id:"boolean", label:"Boolean Logic" },
    { id:"graph",   label:"Graph Properties" },
  ];

  return (
    <motion.div style={{ display:"flex", flexDirection:"column", gap:"1.25rem" }}
      initial={{ opacity:0 }} animate={{ opacity:1 }}>

      {/* Inner tab bar */}
      <div className="viz-inner-tabs">
        {tabs.map(t => (
          <motion.button key={t.id}
            className={`viz-inner-tab${dmTab===t.id?" active":""}`}
            onClick={() => setDmTab(t.id)}
            whileTap={{ scale:0.95 }}>
            {t.label}
          </motion.button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {dmTab === "fsm" && (
          <motion.div key="fsm"
            initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-12 }}
            transition={{ duration:0.3 }}>
            <FSMDiagram />
          </motion.div>
        )}
        {dmTab === "boolean" && (
          <motion.div key="bool"
            initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-12 }}
            transition={{ duration:0.3 }}>
            <BooleanViz />
          </motion.div>
        )}
        {dmTab === "graph" && (
          <motion.div key="graph"
            initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-12 }}
            transition={{ duration:0.3 }}>
            <GraphProperties />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Risk formula mirrors raspberry_pi/edge_algorithms/risk_engine.py ─
// Simplified version: temperature contributes if >30°C, gas if >100 ppm,
// PIR adds motion risk, low light (ldr_norm < 0.15) adds slight risk.
function computeSimRisk(temp: number, gas: number, pir: boolean, ldrRaw: number): number {
  const ldrNorm = Math.min(1, Math.max(0, ldrRaw / 4095));
  const tempR   = Math.min(1, Math.max(0, (temp - 20) / 60));   // 0 at 20°C, 1 at 80°C
  const gasR    = Math.min(1, Math.max(0, gas / 1000));          // 0 at 0ppm, 1 at 1000ppm
  const pirR    = pir ? 0.15 : 0;
  const ldrR    = ldrNorm < 0.15 ? 0.05 : 0;                    // low-light slight risk
  return Math.min(1, 0.45 * tempR + 0.40 * gasR + pirR + ldrR);
}

// ── FSM Diagram — now driven by live MQTT fsm_state ───────────────
function FSMDiagram() {
  const { current } = useDashboardStore();
  const liveFsmState = current.fsm_state;
  const liveRisk     = current.risk;
  const liveStateIdx = STATES.indexOf(liveFsmState);
  const liveSigmaIdx = getSigmaIdx(liveRisk, liveFsmState === "FAULT");

  // Sim sensor state
  const [simMode,    setSimMode]   = useState(false);
  const [simTemp,    setSimTemp]   = useState(25);     // °C
  const [simGas,     setSimGas]    = useState(150);    // ppm
  const [simPir,     setSimPir]    = useState(false);
  const [simLdrRaw,  setSimLdrRaw] = useState(2000);   // 0–4095

  // Derived sim values
  const simRisk             = computeSimRisk(simTemp, simGas, simPir, simLdrRaw);
  const simSigmaIdx         = getSigmaIdx(simRisk, false);
  // Derive FSM state from IDLE row using computed sigma (mirrors fsm_engine.py behaviour)
  const derivedSimStateName = STATES[TRANSITION[0][simSigmaIdx]];

  // User can still click to explore; null means "show live/sim"
  const [manualActive, setManualActive] = useState<number | null>(null);

  // Active state depends on mode
  const effectiveStateIdx = simMode
    ? STATES.indexOf(derivedSimStateName)
    : liveStateIdx;
  const effectiveStateName = simMode ? derivedSimStateName : liveFsmState;
  const effectiveSigmaIdx  = simMode ? simSigmaIdx : liveSigmaIdx;
  const activeIdx = manualActive !== null ? manualActive : effectiveStateIdx;

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
              onClick={() => { setSimMode(m === "sim"); setManualActive(null); }}
              whileTap={{ scale: 0.95 }}
              style={{
                padding: "10px 28px", fontFamily: "var(--font)", fontSize: "0.88rem",
                fontWeight: 700, border: "none", cursor: "pointer",
                background: (simMode ? m === "sim" : m === "live")
                  ? "linear-gradient(135deg,var(--teal),var(--sky-dark))" : "transparent",
                color: (simMode ? m === "sim" : m === "live") ? "white" : "var(--text-secondary)",
                display: "flex", alignItems: "center", gap: 8, transition: "background 0.2s",
              }}>
              {m === "live" ? <Radio size={15} /> : <Sliders size={15} />}
              {m === "live" ? "Live MQTT" : "Simulation"}
            </motion.button>
          ))}
        </div>
      </motion.div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr", gap:"1.5rem" }} className="fsm-layout">
        <motion.div className="glass-card" style={{ padding:"1.5rem" }}
          initial={{ opacity:0, scale:0.96 }} animate={{ opacity:1, scale:1 }}>

          {/* Header with live status */}
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:4, flexWrap:"wrap" }}>
            <h3 style={{ fontFamily:"var(--font)", fontSize:"1.1rem", fontWeight:800,
              color:"var(--text-primary)", margin:0 }}>
              6-State Deterministic FSM
            </h3>
            {/* State badge */}
            <motion.div animate={{ opacity:[1,0.5,1] }} transition={{ repeat:Infinity, duration:1.8 }}
              style={{ display:"flex", alignItems:"center", gap:5, padding:"3px 10px",
                borderRadius:20,
                background: effectiveStateIdx >= 0
                  ? STATE_COLORS[effectiveStateName]?.bg ?? "rgba(200,200,200,0.15)"
                  : "rgba(200,200,200,0.15)",
                border: `1px solid ${effectiveStateIdx >= 0 ? STATE_COLORS[effectiveStateName]?.border ?? "#aaa" : "#aaa"}` }}>
              <div style={{ width:7, height:7, borderRadius:"50%",
                background: effectiveStateIdx >= 0 ? STATE_COLORS[effectiveStateName]?.text ?? "#aaa" : "#aaa" }} />
              <span style={{ fontSize:"0.68rem", fontWeight:700, fontFamily:"var(--font)",
                color: effectiveStateIdx >= 0 ? STATE_COLORS[effectiveStateName]?.text ?? "#666" : "#666" }}>
                {simMode ? `SIM: ${effectiveStateName}` : effectiveStateIdx >= 0 ? `LIVE: ${liveFsmState}` : "WAITING…"}
              </span>
            </motion.div>
          </div>

        <p style={{ fontSize:"0.78rem", color:"var(--text-muted)", fontFamily:"var(--font)", marginBottom:"0.6rem" }}>
          {simMode
            ? <>Simulation mode · Adjust sensor values below to see FSM transitions · Risk: <strong style={{ color:"var(--teal-dark)" }}>{(simRisk*100).toFixed(1)}% → σ{simSigmaIdx}</strong></>
            : <>Active state highlighted from live MQTT · Click any node to explore transitions · Risk: <strong style={{ color:"var(--teal-dark)" }}>{(liveRisk*100).toFixed(1)}% → σ{liveSigmaIdx}</strong></>
          }
        </p>

        {/* ── Simulation sensor inputs ── */}
        {simMode && (
          <motion.div initial={{ opacity:0, y:-8 }} animate={{ opacity:1, y:0 }}
            style={{ background:"rgba(245,158,11,0.08)", border:"1px solid rgba(245,158,11,0.30)",
              borderRadius:12, padding:"1rem", marginBottom:"1rem" }}>
            <div style={{ fontFamily:"var(--font)", fontSize:"0.78rem", fontWeight:700,
              color:"#b45309", marginBottom:"0.75rem", textTransform:"uppercase", letterSpacing:"0.08em" }}>
              🎛️ Sensor Input Simulation
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"0.75rem" }}>

              {/* Temperature */}
              <div>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
                  <span style={{ fontFamily:"var(--font)", fontSize:"0.76rem", fontWeight:700,
                    color:"var(--text-secondary)" }}>🌡️ Temp (Kitchen)</span>
                  <span style={{ fontFamily:"monospace", fontSize:"0.76rem", fontWeight:800,
                    color: simTemp > 45 ? "#f43f5e" : simTemp > 35 ? "#f97316" : "#0d9488" }}>
                    {simTemp}°C
                  </span>
                </div>
                <input type="range" min={15} max={80} step={1} value={simTemp}
                  onChange={e => setSimTemp(+e.target.value)}
                  style={{ accentColor: simTemp > 45 ? "#f43f5e" : simTemp > 35 ? "#f97316" : "#0d9488" }} />
                <div style={{ display:"flex", justifyContent:"space-between", fontSize:"0.63rem",
                  color:"var(--text-muted)", fontFamily:"var(--font)" }}>
                  <span>15°C</span><span style={{ color:"#f59e0b" }}>35° fire risk</span><span>80°C</span>
                </div>
              </div>

              {/* Gas PPM */}
              <div>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
                  <span style={{ fontFamily:"var(--font)", fontSize:"0.76rem", fontWeight:700,
                    color:"var(--text-secondary)" }}>💨 Gas/MQ-2 (Kitchen)</span>
                  <span style={{ fontFamily:"monospace", fontSize:"0.76rem", fontWeight:800,
                    color: simGas > 600 ? "#f43f5e" : simGas > 300 ? "#f97316" : "#0d9488" }}>
                    {simGas} ppm
                  </span>
                </div>
                <input type="range" min={0} max={1000} step={10} value={simGas}
                  onChange={e => setSimGas(+e.target.value)}
                  style={{ accentColor: simGas > 600 ? "#f43f5e" : simGas > 300 ? "#f97316" : "#0d9488" }} />
                <div style={{ display:"flex", justifyContent:"space-between", fontSize:"0.63rem",
                  color:"var(--text-muted)", fontFamily:"var(--font)" }}>
                  <span>0</span><span style={{ color:"#f59e0b" }}>300 smoke alert</span><span>1000 ppm</span>
                </div>
              </div>

              {/* LDR */}
              <div>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
                  <span style={{ fontFamily:"var(--font)", fontSize:"0.76rem", fontWeight:700,
                    color:"var(--text-secondary)" }}>💡 LDR Raw (Bedroom)</span>
                  <span style={{ fontFamily:"monospace", fontSize:"0.76rem", fontWeight:800,
                    color: simLdrRaw < 600 ? "#8b5cf6" : "#0d9488" }}>
                    {simLdrRaw} ({(simLdrRaw/4095*100).toFixed(0)}%)
                  </span>
                </div>
                <input type="range" min={0} max={4095} step={50} value={simLdrRaw}
                  onChange={e => setSimLdrRaw(+e.target.value)}
                  style={{ accentColor: simLdrRaw < 600 ? "#8b5cf6" : "#0d9488" }} />
                <div style={{ display:"flex", justifyContent:"space-between", fontSize:"0.63rem",
                  color:"var(--text-muted)", fontFamily:"var(--font)" }}>
                  <span>0 (dark)</span><span>4095 (bright)</span>
                </div>
              </div>

              {/* PIR toggle */}
              <div style={{ display:"flex", flexDirection:"column", justifyContent:"center",
                padding:"0.5rem 0.75rem", borderRadius:10,
                background: simPir ? "rgba(249,115,22,0.12)" : "rgba(255,255,255,0.18)",
                border:`1px solid ${simPir ? "rgba(249,115,22,0.40)" : "rgba(255,255,255,0.45)"}`,
                transition:"background 0.2s" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <span style={{ fontFamily:"var(--font)", fontSize:"0.76rem", fontWeight:700,
                    color:"var(--text-secondary)" }}>🚨 PIR Motion (Door)</span>
                  <label className="switch">
                    <input type="checkbox" checked={simPir} onChange={e => setSimPir(e.target.checked)} />
                    <span className="switch-slider" />
                  </label>
                </div>
                <div style={{ marginTop:4, fontSize:"0.68rem", fontFamily:"var(--font)",
                  fontWeight:700, color: simPir ? "#c2410c" : "var(--text-muted)" }}>
                  {simPir ? "Motion Detected" : "No Motion"}
                </div>
              </div>
            </div>

            {/* Computed risk readout */}
            <div style={{ marginTop:"0.75rem", display:"flex", alignItems:"center", gap:12,
              padding:"0.6rem 0.85rem", borderRadius:10,
              background:"rgba(255,255,255,0.25)", border:"1px solid rgba(255,255,255,0.50)" }}>
              <span style={{ fontFamily:"var(--font)", fontSize:"0.75rem", fontWeight:700,
                color:"var(--text-muted)" }}>Computed Risk →</span>
              <span style={{ fontFamily:"monospace", fontSize:"1.1rem", fontWeight:900,
                color: simRisk >= 0.65 ? "#f43f5e" : simRisk >= 0.35 ? "#f97316" : "#0d9488" }}>
                {(simRisk*100).toFixed(1)}%
              </span>
              <span style={{ fontFamily:"var(--font)", fontSize:"0.75rem", fontWeight:700,
                color:"var(--text-muted)" }}>→ σ{simSigmaIdx} →</span>
              <span style={{ fontFamily:"var(--font)", fontSize:"0.82rem", fontWeight:800,
                color: STATE_COLORS[derivedSimStateName]?.text ?? "var(--text-secondary)" }}>
                {derivedSimStateName}
              </span>
            </div>
          </motion.div>
        )}

        <svg viewBox="0 0 480 390" style={{ width:"100%", maxWidth:480, display:"block", margin:"0 auto" }}>
          <defs>
            <marker id="arrow-fsm" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
              <path d="M0,0 L0,6 L8,3 z" fill="rgba(90,143,160,0.70)" />
            </marker>
          </defs>

          {/* Transition arrows */}
          {STATES.map((_, fromIdx) =>
            TRANSITION[fromIdx].map((toIdx, sigIdx) => {
              const [x1,y1] = FSM_POS[fromIdx];
              const [x2,y2] = FSM_POS[toIdx];
              if (fromIdx === toIdx) return null;
              const isHighlit = activeIdx === fromIdx;
              const dx = x2-x1, dy = y2-y1;
              const len = Math.sqrt(dx*dx+dy*dy);
              const ux = dx/len, uy = dy/len;
              const R = 30;
              const sx = x1+ux*R, sy = y1+uy*R;
              const ex = x2-ux*R, ey = y2-uy*R;
              const cx = (sx+ex)/2 - uy*22, cy = (sy+ey)/2 + ux*22;
              return (
                <g key={`${fromIdx}-${sigIdx}`}
                  opacity={activeIdx !== null && activeIdx !== -1 && !isHighlit ? 0.15 : 0.70}>
                  <path d={`M${sx},${sy} Q${cx},${cy} ${ex},${ey}`}
                    fill="none"
                    stroke={isHighlit ? STATE_COLORS[STATES[fromIdx]].text : "rgba(90,143,160,0.55)"}
                    strokeWidth={isHighlit ? 2.0 : 1.0}
                    markerEnd="url(#arrow-fsm)" />
                </g>
              );
            })
          )}

          {/* Nodes */}
          {STATES.map((s, i) => {
            const [x,y] = FSM_POS[i];
            const c = STATE_COLORS[s];
            const isEffective = i === effectiveStateIdx;
            const isManual    = manualActive === i;
            const isActive    = isEffective || isManual;

            return (
              <g key={s} style={{ cursor:"pointer" }}
                onClick={() => setManualActive(manualActive === i ? null : i)}>

                {/* Pulsing ring for current state */}
                {isEffective && (
                  <motion.circle cx={x} cy={y} r={34}
                    fill={c.bg}
                    stroke={c.border} strokeWidth={3}
                    animate={{ r:[34,38,34], opacity:[0.8,0.3,0.8] }}
                    transition={{ repeat:Infinity, duration:1.5, ease:"easeInOut" }}
                  />
                )}

                {/* Manual click ring */}
                {isManual && !isEffective && (
                  <motion.circle cx={x} cy={y} r={36} fill="none"
                    stroke={c.border} strokeWidth={2.5} strokeDasharray="5 3"
                    animate={{ rotate:360 }} transition={{ repeat:Infinity, duration:4, ease:"linear" }}
                    style={{ transformOrigin:`${x}px ${y}px` }}
                  />
                )}

                <circle cx={x} cy={y} r={28}
                  fill={isActive ? c.bg : "rgba(255,255,255,0.10)"}
                  stroke={c.border} strokeWidth={isActive ? 2.5 : 1.8} />
                <text x={x} y={y+4} textAnchor="middle"
                  style={{ fontSize:10, fontWeight:800, fontFamily:"Inter,sans-serif", fill:c.text }}>
                  {s.replace("_","\n")}
                </text>
              </g>
            );
          })}
        </svg>
      </motion.div>

      {/* Transition table with sigma highlight */}
      <motion.div className="glass-card" style={{ padding:"1.5rem", overflowX:"auto" }}
        initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.1 }}>
        <h4 style={{ fontFamily:"var(--font)", fontSize:"0.95rem", fontWeight:800,
          color:"var(--text-primary)", marginBottom:"0.85rem" }}>
          δ Transition Table
          {effectiveStateIdx >= 0 && (
            <span style={{ marginLeft:10, fontSize:"0.72rem", fontWeight:600,
              color: simMode ? "#b45309" : "var(--teal-dark)",
              background: simMode ? "rgba(245,158,11,0.12)" : "rgba(13,148,136,0.12)",
              border: `1px solid ${simMode ? "rgba(245,158,11,0.30)" : "rgba(13,148,136,0.30)"}`,
              borderRadius:8, padding:"2px 8px", fontFamily:"var(--font)" }}>
              {simMode ? "Sim" : "Live"} σ{effectiveSigmaIdx} ({SIGMA[effectiveSigmaIdx].split("\n")[1]})
            </span>
          )}
        </h4>
        <table style={{ borderCollapse:"collapse", width:"100%", fontSize:"0.72rem", fontFamily:"var(--font)" }}>
          <thead>
            <tr>
              <th style={{ padding:"6px 8px", color:"var(--text-muted)", textAlign:"left", fontWeight:700 }}>State</th>
              {SIGMA.map((s, i) => (
                <th key={i}
                  style={{ padding:"4px 6px", fontWeight:700,
                    whiteSpace:"pre", textAlign:"center", lineHeight:1.3,
                    color: i === effectiveSigmaIdx ? "white" : "var(--teal-dark)",
                    background: i === effectiveSigmaIdx ? "rgba(13,148,136,0.40)" : "transparent",
                    borderRadius: i === effectiveSigmaIdx ? 6 : 0 }}>
                  {s}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {STATES.map((st, si) => (
              <tr key={st}
                style={{ background:
                  si === effectiveStateIdx
                    ? STATE_COLORS[st].bg
                    : (manualActive === si ? STATE_COLORS[st].bg : "transparent"),
                  cursor:"pointer" }}
                onClick={() => setManualActive(manualActive === si ? null : si)}>
                <td style={{ padding:"6px 8px", fontWeight:700,
                  color:STATE_COLORS[st].text, whiteSpace:"nowrap" }}>
                  {si === effectiveStateIdx ? "▶ " : ""}{st}
                </td>
                {TRANSITION[si].map((nextSt, sigi) => (
                  <td key={sigi}
                    style={{ padding:"6px 8px", textAlign:"center",
                      color:STATE_COLORS[STATES[nextSt]].text, fontWeight:600,
                      background: sigi === effectiveSigmaIdx ? "rgba(13,148,136,0.10)" : "transparent" }}>
                    {STATES[nextSt].replace("ALERT_","A_")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </motion.div>

      <style>{`@media(min-width:900px){.fsm-layout{grid-template-columns:1fr 1fr!important;}}`}</style>
      </div>
    </div>
  );
}

// ── Boolean Viz — live sensor values + manual override ────────────
function BooleanViz() {
  const { current } = useDashboardStore();

  // Derive live boolean states from actual sensor readings
  // Kitchen ESP32 (MQ-2 / env): temp > 35°C → fire risk; gas_ppm > 300 → smoke
  // Main Door ESP32 (PIR): pir_state
  // Bedroom ESP32 (LDR): ldr_norm > 0.3 → light normal
  const liveBits = useMemo<BoolState>(() => ({
    T: current.temperature > 35,
    S: current.gas_ppm > 300,
    P: current.pir_state,
    L: current.ldr_norm > 0.3,
  }), [current.temperature, current.gas_ppm, current.pir_state, current.ldr_norm]);

  const [overrideMode, setOverrideMode] = useState(false);
  const [manualBits, setManualBits] = useState<BoolState>({ T:false, S:false, P:false, L:false });

  const bits  = overrideMode ? manualBits : liveBits;
  const flags = evalBoolean(bits);

  const toggle = (k: keyof BoolState) => {
    if (!overrideMode) return;
    setManualBits(b => ({ ...b, [k]: !b[k] }));
  };

  const SENSOR_LABELS: Record<keyof BoolState, { label: string; sensor: string; threshold: string }> = {
    T: { label:"T: Temp High",   sensor:"Kitchen ESP32 · DHT11",    threshold:`${current.temperature.toFixed(1)}°C > 35°C` },
    S: { label:"S: Gas/Smoke",   sensor:"Kitchen ESP32 · MQ-2",     threshold:`${current.gas_ppm.toFixed(0)} ppm > 300` },
    P: { label:"P: PIR Motion",  sensor:"Main Door ESP32 · PIR",    threshold:`${current.pir_state ? "Detected" : "Clear"}` },
    L: { label:"L: Light Normal",sensor:"Bedroom ESP32 · LDR",      threshold:`Norm=${current.ldr_norm.toFixed(2)} > 0.30` },
  };

  const FlagPill = ({ label, val, color }: { label:string; val:boolean; color:string }) => (
    <motion.div
      animate={{ scale: val ? [1,1.05,1] : 1 }}
      transition={{ duration:0.3 }}
      style={{
        display:"flex", alignItems:"center", gap:8, padding:"8px 14px",
        borderRadius:10, border:"1px solid",
        background: val ? `${color}20` : "rgba(255,255,255,0.20)",
        borderColor: val ? color : "rgba(255,255,255,0.45)",
        fontFamily:"var(--font)", fontSize:"0.82rem", fontWeight:700,
        color: val ? color : "var(--text-muted)",
      }}>
      <motion.div style={{ width:10, height:10, borderRadius:"50%",
        background: val ? color : "rgba(180,200,210,0.45)" }}
        animate={{ boxShadow: val ? `0 0 10px ${color}` : "none" }} />
      {label}: {val ? "1" : "0"}
    </motion.div>
  );

  return (
    <div style={{ display:"grid", gridTemplateColumns:"1fr", gap:"1.5rem" }} className="bool-layout">
      {/* Live evaluator */}
      <motion.div className="glass-card" style={{ padding:"1.5rem" }}
        initial={{ opacity:0, scale:0.96 }} animate={{ opacity:1, scale:1 }}>

        {/* Header */}
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:4 }}>
          <h3 style={{ fontFamily:"var(--font)", fontSize:"1.1rem", fontWeight:800,
            color:"var(--text-primary)", margin:0 }}>
            Boolean Sensor Evaluator
          </h3>
          {/* Live / Manual toggle */}
          <motion.button whileTap={{ scale:0.92 }}
            onClick={() => setOverrideMode(o => !o)}
            style={{ padding:"3px 12px", borderRadius:20, border:"1px solid",
              fontSize:"0.68rem", fontWeight:700, fontFamily:"var(--font)",
              cursor:"pointer",
              background: overrideMode ? "rgba(245,158,11,0.15)" : "rgba(13,148,136,0.15)",
              borderColor: overrideMode ? "#f59e0b" : "#0d9488",
              color: overrideMode ? "#b45309" : "#0f766e" }}>
            {overrideMode ? "✋ Manual" : "📡 Live MQTT"}
          </motion.button>
        </div>

        <p style={{ fontSize:"0.78rem", color:"var(--text-muted)", fontFamily:"var(--font)", marginBottom:"1.25rem" }}>
          Quine-McCluskey minimized: <strong style={{ color:"var(--teal-dark)" }}>A_critical = S·(T + P)</strong>
          {!overrideMode && <span style={{ marginLeft:8, color:"#0284c7", fontWeight:600 }}>
            · Values from live ESP32 sensors
          </span>}
        </p>

        {/* Sensor input grid */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"0.85rem", marginBottom:"1.25rem" }}>
          {(Object.keys(bits) as (keyof BoolState)[]).map(k => (
            <div key={k} style={{ display:"flex", flexDirection:"column", gap:4, padding:"10px 14px",
              borderRadius:12,
              background: bits[k] ? "rgba(13,148,136,0.10)" : "rgba(255,255,255,0.22)",
              border:`1px solid ${bits[k] ? "rgba(13,148,136,0.40)" : "rgba(255,255,255,0.55)"}`,
              transition:"background 0.2s" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <span style={{ fontFamily:"var(--font)", fontSize:"0.88rem", fontWeight:700,
                  color:"var(--text-secondary)" }}>
                  {SENSOR_LABELS[k].label}
                </span>
                <motion.div whileTap={{ scale:0.9 }}>
                  <label className="switch">
                    <input type="checkbox" checked={bits[k]}
                      onChange={() => toggle(k)}
                      disabled={!overrideMode} />
                    <span className="switch-slider" />
                  </label>
                </motion.div>
              </div>
              {/* Sensor info */}
              <div style={{ fontSize:"0.68rem", color:"var(--text-muted)", fontFamily:"var(--font)" }}>
                {SENSOR_LABELS[k].sensor}
              </div>
              <div style={{ fontSize:"0.72rem", fontWeight:700,
                color: bits[k] ? "var(--teal-dark)" : "var(--text-muted)",
                fontFamily:"var(--font)" }}>
                {overrideMode ? (bits[k] ? "HIGH" : "LOW") : SENSOR_LABELS[k].threshold}
              </div>
            </div>
          ))}
        </div>

        {/* Outputs */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"0.75rem" }}>
          <FlagPill label="A_fire"      val={flags.fire}      color="#f59e0b" />
          <FlagPill label="A_gas"       val={flags.gas}       color="#8b5cf6" />
          <FlagPill label="A_intrusion" val={flags.intrusion} color="#f97316" />
          <FlagPill label="A_critical"  val={flags.critical}  color="#f43f5e" />
        </div>

        <div style={{ marginTop:"1rem", padding:"0.85rem", borderRadius:12,
          background:"rgba(255,255,255,0.25)", border:"1px solid rgba(255,255,255,0.50)" }}>
          <p style={{ fontFamily:"monospace", fontSize:"0.75rem", color:"var(--text-secondary)", lineHeight:1.7, margin:0 }}>
            A_fire      = T ∧ S<br/>
            A_gas       = S ∧ ¬T<br/>
            A_intrusion = P ∧ ¬L<br/>
            <strong style={{ color:"var(--teal-dark)" }}>A_critical  = S ∧ (T ∨ P)  ← Q-M minimized</strong>
          </p>
        </div>
      </motion.div>

      {/* Truth table */}
      <motion.div className="glass-card" style={{ padding:"1.5rem", overflowX:"auto" }}
        initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.1 }}>
        <h4 style={{ fontFamily:"var(--font)", fontSize:"0.95rem", fontWeight:800,
          color:"var(--text-primary)", marginBottom:"0.85rem" }}>
          Truth Table — A_critical = S·(T + P)
        </h4>
        <table style={{ borderCollapse:"collapse", width:"100%", fontSize:"0.72rem", fontFamily:"var(--font)" }}>
          <thead>
            <tr>
              {["m#","T","S","P","L","A_fire","A_gas","A_intru","A_crit"].map(h => (
                <th key={h} style={{ padding:"5px 7px", color:"var(--teal-dark)", fontWeight:700, textAlign:"center",
                  borderBottom:"1px solid rgba(255,255,255,0.40)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({length:16}, (_,i) => {
              const T=(i>>3)&1, S=(i>>2)&1, P=(i>>1)&1, L=i&1;
              const b = { T:!!T,S:!!S,P:!!P,L:!!L };
              const f = evalBoolean(b);
              const isMinterm = MINTERMS.has(i);
              // Highlight the row that matches the current live sensor state
              const matchesLive =
                (T===1) === liveBits.T &&
                (S===1) === liveBits.S &&
                (P===1) === liveBits.P &&
                (L===1) === liveBits.L;
              return (
                <tr key={i} style={{
                  background: matchesLive
                    ? "rgba(2,132,199,0.18)"
                    : isMinterm ? "rgba(13,148,136,0.10)" : "transparent",
                  outline: matchesLive ? "1.5px solid rgba(2,132,199,0.50)" : "none",
                }}>
                  <td style={{ padding:"4px 7px", color: matchesLive ? "#0284c7" : "var(--text-muted)",
                    fontWeight: matchesLive ? 800 : 600, textAlign:"center" }}>
                    {matchesLive ? "▶ " : ""}m{i}
                  </td>
                  {[T,S,P,L].map((v,vi) => (
                    <td key={vi} style={{ padding:"4px 7px", textAlign:"center",
                      color: v ? "var(--teal-dark)" : "var(--text-muted)", fontWeight:v?700:400 }}>{v}</td>
                  ))}
                  {[f.fire,f.gas,f.intrusion,f.critical].map((v,vi) => (
                    <td key={vi} style={{ padding:"4px 7px", textAlign:"center",
                      color: v ? "#f43f5e" : "var(--text-muted)", fontWeight:v?700:400 }}>{v?1:0}</td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
        <p style={{ marginTop:8, fontSize:"0.70rem", color:"var(--text-muted)", fontFamily:"var(--font)" }}>
          ✅ Teal rows = A_critical minterms · 🔵 Blue row = current live sensor state
        </p>
      </motion.div>

      <style>{`@media(min-width:900px){.bool-layout{grid-template-columns:1fr 1fr!important;}}`}</style>
    </div>
  );
}

// ── Graph Properties ──────────────────────────────────────────────
function GraphProperties() {
  const NODE_NAMES = ["Living","Kitchen","Bedroom","Hallway","Exit (Main Door)"];
  const NODE_ICONS = ["🏠","🍳","🛏️","🚪","🚪✅"];

  return (
    <div style={{ display:"grid", gridTemplateColumns:"1fr", gap:"1.5rem" }} className="gp-layout">

      {/* Adjacency matrix */}
      <motion.div className="glass-card" style={{ padding:"1.5rem" }}
        initial={{ opacity:0, scale:0.96 }} animate={{ opacity:1, scale:1 }}>
        <h3 style={{ fontFamily:"var(--font)", fontSize:"1.1rem", fontWeight:800,
          color:"var(--text-primary)", marginBottom:4 }}>Adjacency & Distance Matrix</h3>
        <p style={{ fontSize:"0.78rem", color:"var(--text-muted)", fontFamily:"var(--font)", marginBottom:"1rem" }}>
          V=5, E=6 · Graph Center: <strong style={{ color:"var(--teal-dark)" }}>Hallway</strong> · Chromatic Number χ=<strong style={{ color:"var(--teal-dark)" }}>3</strong>
        </p>
        <div style={{ overflowX:"auto" }}>
          <table style={{ borderCollapse:"collapse", fontSize:"0.78rem", fontFamily:"var(--font)" }}>
            <thead>
              <tr>
                <th style={{ padding:"6px 10px", color:"var(--text-muted)" }}></th>
                {NODE_NAMES.map((n,i) => (
                  <th key={i} style={{ padding:"6px 10px", color:CHROM_PALETTE[CHROMATIC_COLORS[i]], fontWeight:800 }}>
                    {NODE_ICONS[i]} {n}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {NODE_NAMES.map((n,i) => (
                <tr key={i}>
                  <td style={{ padding:"6px 10px", fontWeight:800, color:CHROM_PALETTE[CHROMATIC_COLORS[i]] }}>
                    {NODE_ICONS[i]} {n}
                  </td>
                  {ADJ[i].map((a,j) => (
                    <motion.td key={j}
                      initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay: (i*5+j)*0.02 }}
                      style={{ padding:"6px 12px", textAlign:"center", fontWeight:a?700:400,
                        color: a ? "var(--teal-dark)" : "var(--text-muted)",
                        background: a ? "rgba(13,148,136,0.10)" : "transparent",
                        border:"1px solid rgba(255,255,255,0.25)", borderRadius:6 }}>
                      {a ? DISTS[i][j].toFixed(2) : "—"}
                    </motion.td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>

      {/* Properties */}
      <motion.div style={{ display:"flex", flexDirection:"column", gap:"1rem" }}
        initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.1 }}>

        {/* Chromatic colouring */}
        <div className="glass-card" style={{ padding:"1.25rem" }}>
          <h4 style={{ fontFamily:"var(--font)", fontSize:"0.95rem", fontWeight:800,
            color:"var(--text-primary)", marginBottom:"0.75rem" }}>
            Greedy Graph Colouring  (χ = 3)
          </h4>
          <div style={{ display:"flex", gap:"0.75rem", flexWrap:"wrap" }}>
            {NODE_NAMES.map((n,i) => (
              <motion.div key={n}
                initial={{ scale:0 }} animate={{ scale:1 }} transition={{ delay:0.05*i, type:"spring" }}
                style={{ padding:"8px 16px", borderRadius:10,
                  background:`${CHROM_PALETTE[CHROMATIC_COLORS[i]]}20`,
                  border:`1.5px solid ${CHROM_PALETTE[CHROMATIC_COLORS[i]]}`,
                  fontFamily:"var(--font)", fontSize:"0.82rem", fontWeight:700,
                  color:CHROM_PALETTE[CHROMATIC_COLORS[i]] }}>
                {NODE_ICONS[i]} {n} <span style={{ fontWeight:400, opacity:0.7 }}>C{CHROMATIC_COLORS[i]+1}</span>
              </motion.div>
            ))}
          </div>
          <p style={{ marginTop:10, fontSize:"0.72rem", color:"var(--text-muted)", fontFamily:"var(--font)" }}>
            3 colours needed · Triangle cycles: Living–Bedroom–Hallway, Living–Kitchen–Hallway
          </p>
        </div>

        {/* Topological properties */}
        <div className="glass-card" style={{ padding:"1.25rem" }}>
          <h4 style={{ fontFamily:"var(--font)", fontSize:"0.95rem", fontWeight:800,
            color:"var(--text-primary)", marginBottom:"0.85rem" }}>
            Topological Properties
          </h4>
          {[
            ["Vertex Set |V|","5 zones"],
            ["Edge Set |E|","6 connections"],
            ["Graph Center","Hallway (min eccentricity)"],
            ["Chromatic No. χ","3 (triangle-induced)"],
            ["Graph Type","Connected, undirected, weighted"],
            ["Weight Range","0.20 – 0.40 (static base distances)"],
            ["Degree of Hallway","4 (highest — central hub)"],
            ["ESP32 Kitchen","MQ-2 Gas + DHT11 Env"],
            ["ESP32 Main Door","PIR Motion + Buzzer"],
            ["ESP32 Bedroom","LED + LDR Light"],
          ].map(([k,v]) => (
            <div key={k} style={{ display:"flex", justifyContent:"space-between", padding:"6px 0",
              borderBottom:"1px solid rgba(255,255,255,0.25)" }}>
              <span style={{ fontFamily:"var(--font)", fontSize:"0.82rem", color:"var(--text-muted)" }}>{k}</span>
              <span style={{ fontFamily:"var(--font)", fontSize:"0.82rem", fontWeight:700, color:"var(--text-secondary)" }}>{v}</span>
            </div>
          ))}
        </div>
      </motion.div>

      <style>{`@media(min-width:900px){.gp-layout{grid-template-columns:1fr 1fr!important;}}`}</style>
    </div>
  );
}
