import React, { useState } from "react";
import {
  BookOpen,
  GraduationCap,
  Award,
  ChevronRight,
  HelpCircle,
  FileText,
  Bookmark,
  CheckCircle,
  XCircle,
  TrendingUp,
  Table,
  Terminal,
  Layers,
  Lightbulb,
} from "lucide-react";

// Types
import { QuizQuestion, Flashcard } from "../types";

export const SUBJECT_QUIZ_QUESTIONS: QuizQuestion[] = [
  {
    question: "Why is the 6-state FSM (IDLE, MONITOR, ALERT_LOW, ALERT_HIGH, CRITICAL, FAULT) considered mathematically 'minimal'?",
    options: [
      "No two states have identical outputs (Moore expressions) and transition paths (δ) across all inputs, proving minimality via Myhill-Nerode indistinguishability loops.",
      "Vite HMR is disabled by the middleware layer, reducing memory compilation states within Node.js to a canonical base size of 6.",
      "The ESP32 lacks sufficient memory buffers to hold more than 6 state definitions in non-volatile EEPROM pools.",
      "Quine-McCluskey minimization results in exactly 6 prime implicants for the state transition matrix."
    ],
    correctAnswerIndex: 0,
    explanation: "Under Myhill-Nerode theorem, two states are indistinguishable if they produce identical outputs for all present and future inputs. Since each of our 6 states has unique Moore physical outputs (LED colors and active buzzer frequencies) or diverse transition destinations for risk σ inputs, no states can be merged, making the 6-state automaton proven minimal."
  },
  {
    question: "Which Boolean function represents the formally minimized critical hazard alarm after implementing Quine-McCluskey consensus operations?",
    options: [
      "A_critical = S + P + T (where S=Smoke, P=PIR Motion, T=Temperature)",
      "A_critical = S (P + T)",
      "A_critical = S · P · T",
      "A_critical = S · P + T · P"
    ],
    correctAnswerIndex: 1,
    explanation: "Our initial hazard table lists critical alarms when Smoke is triggered AND either Motion or Temperature is high. Writing the sum-of-products yields: S·P·T + S·P·T' + S·P'·T. Applying the consensus theorem / Quine-McCluskey reduction simplifies this directly to S·P + S·T, which factors as the elegant minimal gate: S (P + T)."
  },
  {
    question: "What is the time complexity of the custom Binary Max-Heap Priority Queue used to dispatch high-speed alerts?",
    options: [
      "O(N log N) for each raw insertion",
      "O(1) average time but O(N) worst-case",
      "O(log N) worst-case for both insert() and extractMax() due to logarithmic siftUp and siftDown height adjustments",
      "O(N) for extracting the highest priority item from the queue list"
    ],
    correctAnswerIndex: 2,
    explanation: "Because the tree height is bounded by log N, adding a priority message (siftUp) and removing the root (siftDown) both run in O(log N) worst-case time complexity. This guarantees urgent risk telemetry immediately bypasses routine data."
  },
  {
    question: "In the Dynamic Edge Safety Cost formula W_safe = 1 / (1 - W_edge + 0.01), what is the primary purpose of the 0.01 constant?",
    options: [
      "To calibrate standard DHT11 Kelvin voltage differences",
      "To prevent division-by-zero singularities when the edge hazard weight W_edge approaches 1.0 (highest danger)",
      "To match the 802.11b Wi-Fi frame header overhead byte ratios",
      "To satisfy the Nyquist-Shannon sampling interval limits for the LDR light sensor"
    ],
    correctAnswerIndex: 1,
    explanation: "As hazard risk rises, W_edge approaches 1.0, representing severe danger (e.g., active fire on the path). Without the 0.01 margin, 1 - 1 = 0, causing division by zero. The 0.01 constant caps maximum safety cost at 100, preventing compile/runtime failures."
  },
  {
    question: "How do the MQTT QoS 1 and QoS 2 handshakes differ regarding communication overhead?",
    options: [
      "QoS 1 uses 1 message; QoS 2 uses none",
      "QoS 1 guarantees delivery using a 2-way handshake (PUBLISH, PUBACK). QoS 2 guarantees exactly-once transfer using a strict 4-way handshake (PUBLISH, PUBREC, PUBREL, PUBCOMP), protecting against duplicate data.",
      "QoS 2 is faster but drops packets during Wi-Fi connection drops",
      "QoS 1 forces Node.js to reload the page via Vite refresh middleware"
    ],
    correctAnswerIndex: 1,
    explanation: "QoS 1 utilizes a fast client-broker confirmation loop, but can duplicate packets if acknowledgments drop. QoS 2 uses a double-handshake containing 4 packets to secure exactly-once transmission at the cost of higher latency."
  }
];

export const SUBJECT_FLASHCARDS: Flashcard[] = [
  {
    front: "Subject: DMS — FSM Moore Outputs",
    back: "Moore machines map outputs solely to states. Example: MONITOR (Green LED), CRITICAL (Red LED flash, 2000Hz Buzzer), FAULT (Blue LED flash). outputs update when state registers transition."
  },
  {
    front: "Subject: DMS — Livelock Loop Mitigation",
    back: "A livelock occurs when two entities (Nodes) cycle states endlessly. We mitigate this using a loop tick tracker. If a node cycles ALERT_HIGH elements 10 times consecutively, it forces an escalation to safe CRITICAL mode."
  },
  {
    front: "Subject: DAA — BFS vs DFS Algorithms",
    back: "BFS uses a Queue to traverse a graph level-by-level, finding minimum hop distances. DFS uses a Stack/Recursion to find discovery/finish times, identifying cycle loops (back edges) for topological security."
  },
  {
    front: "Subject: DAA — Dijkstra Escape Path Costs",
    back: "Dijkstra finds the absolute minimum safety cost from bedroom to safe exterior. Each edge weight continuously scales based on temperature, PIR motion and distance risk: W_edge = α R + β d + γ P."
  },
  {
    front: "Subject: Networks — TLS Certificate Pinning",
    back: "To secure ThingSpeak web requests from Man-In-The-Middle attacks on local Wi-Fi, the ESP32 verifies server identity by matching the PEM root certificate directly in memory (WiFiClientSecure)."
  },
  {
    front: "Subject: Networks — ESP32 LEDC PWM Buzzer",
    back: "Since ESP32 lacks DAC pins on some headers, active buzzer frequency is generated via PWM LEDC channels using a timer, varying the sound frequency (500Hz to 2000Hz) to represent hazard severity."
  }
];

export function SmartHomeQuizAndResources() {
  const [quizIdx, setQuizIdx] = useState<number>(0);
  const [selectedOpt, setSelectedOpt] = useState<number | null>(null);
  const [showExplanation, setShowExplanation] = useState<boolean>(false);
  const [score, setScore] = useState<number>(0);
  const [finishedQuiz, setFinishedQuiz] = useState<boolean>(false);

  const [activeFlashIdx, setActiveFlashIdx] = useState<number>(0);
  const [flipFlashCard, setFlipFlashCard] = useState<boolean>(false);

  const handleOptionSelect = (idx: number) => {
    if (selectedOpt !== null) return; // Locked in
    setSelectedOpt(idx);
    setShowExplanation(true);
    if (idx === SUBJECT_QUIZ_QUESTIONS[quizIdx].correctAnswerIndex) {
      setScore((s) => s + 1);
    }
  };

  const handleNextQuestion = () => {
    setSelectedOpt(null);
    setShowExplanation(false);
    if (quizIdx + 1 < SUBJECT_QUIZ_QUESTIONS.length) {
      setQuizIdx((prev) => prev + 1);
    } else {
      setFinishedQuiz(true);
    }
  };

  const restartQuiz = () => {
    setQuizIdx(0);
    setSelectedOpt(null);
    setShowExplanation(false);
    setScore(0);
    setFinishedQuiz(false);
  };

  return (
    <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-6 text-slate-200">
      
      {/* LEFT COLUMN: INTERACTIVE QUIZ & FLASCHARD MODULES (7/12 SPAN) */}
      <div className="col-span-1 lg:col-span-7 space-y-6 flex flex-col">
        
        {/* ACADEMIC ASSESSMENT QUIZ PANEL */}
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl flex-1 flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center border-b border-slate-800 pb-3 mb-5">
              <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-300">
                <GraduationCap className="w-5 h-5 text-indigo-400" /> Academic IoT & Theory Assessment
              </span>
              <span className="font-mono text-xs text-indigo-400 font-bold">
                Q: {quizIdx + 1} of {SUBJECT_QUIZ_QUESTIONS.length}
              </span>
            </div>

            {!finishedQuiz ? (
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-white leading-relaxed">
                  {SUBJECT_QUIZ_QUESTIONS[quizIdx].question}
                </h3>

                <div className="space-y-2.5">
                  {SUBJECT_QUIZ_QUESTIONS[quizIdx].options.map((opt, idx) => {
                    // Styles determination
                    let btnClass = "border-slate-800 bg-slate-950/60 hover:border-slate-700 hover:bg-slate-900/40 text-slate-300";
                    if (selectedOpt !== null) {
                      if (idx === SUBJECT_QUIZ_QUESTIONS[quizIdx].correctAnswerIndex) {
                        btnClass = "border-emerald-500/40 bg-emerald-600/15 text-emerald-300 font-semibold";
                      } else if (idx === selectedOpt) {
                        btnClass = "border-rose-500/40 bg-rose-600/15 text-rose-300";
                      } else {
                        btnClass = "border-slate-850 opacity-40 bg-slate-950 text-slate-500 cursor-not-allowed";
                      }
                    }

                    return (
                      <button
                        key={idx}
                        onClick={() => handleOptionSelect(idx)}
                        disabled={selectedOpt !== null}
                        className={`w-full text-left p-3.5 rounded-xl border text-xs transition duration-200 flex items-start gap-3 leading-relaxed ${btnClass}`}
                      >
                        <span className="font-mono text-indigo-400 font-bold bg-slate-900 p-1.5 px-2 rounded-lg text-[10px] mt-0.5">
                          {String.fromCharCode(65 + idx)}
                        </span>
                        <span className="flex-1 mt-0.5">{opt}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Question Explanation Box */}
                {showExplanation && (
                  <div className="bg-slate-950 border border-slate-850 p-4 rounded-xl mt-4 space-y-2">
                    <div className="flex items-center gap-2 text-indigo-405 text-xs font-bold uppercase">
                      <Lightbulb className="w-4 h-4 text-indigo-400" /> Analytical Explanation
                    </div>
                    <p className="text-[11.5px] text-slate-400 leading-relaxed text-left">
                      {SUBJECT_QUIZ_QUESTIONS[quizIdx].explanation}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="py-8 text-center space-y-4">
                <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-full flex items-center justify-center mx-auto text-xl font-black shadow-sm">
                  {score}/{SUBJECT_QUIZ_QUESTIONS.length}
                </div>
                <div className="space-y-1">
                  <h4 className="text-base font-bold text-white">Quiz Completed Successfully!</h4>
                  <p className="text-xs text-slate-400">
                    You scored {(score / SUBJECT_QUIZ_QUESTIONS.length) * 100}% on the Smart IoT Networks assessment.
                  </p>
                </div>
                <button
                  onClick={restartQuiz}
                  className="p-2.5 px-5 bg-indigo-600 hover:bg-indigo-500/90 text-white text-xs font-bold rounded-xl transition"
                >
                  Restart assessment
                </button>
              </div>
            )}
          </div>

          {!finishedQuiz && selectedOpt !== null && (
            <button
              onClick={handleNextQuestion}
              className="mt-5 w-full p-3 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5"
            >
              Continue <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* ACTIVE STUDY FLASHCARDS PANEL */}
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl flex flex-col justify-between">
          <div className="flex justify-between items-center border-b border-slate-800 pb-3 mb-4">
            <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-300">
              <BookOpen className="w-5 h-5 text-indigo-400" /> Subject-Matter Flashcards
            </span>
            <span className="font-mono text-xs text-indigo-400 font-bold">
              Card {activeFlashIdx + 1} of {SUBJECT_FLASHCARDS.length}
            </span>
          </div>

          {/* Flashcard click panel */}
          <div
            onClick={() => setFlipFlashCard(!flipFlashCard)}
            className="cursor-pointer min-h-[140px] bg-slate-950 hover:bg-slate-920 border border-slate-850 hover:border-slate-800 p-6 rounded-2xl flex flex-col justify-center items-center text-center transition-all duration-300 select-none shadow-inner"
          >
            {flipFlashCard ? (
              <div className="space-y-2">
                <span className="text-[9px] font-mono font-bold px-2 py-0.5 bg-emerald-600/10 border border-emerald-500/25 text-emerald-400 rounded-full uppercase">
                  Subject Solution
                </span>
                <p className="text-xs text-slate-300 max-w-md leading-relaxed text-left">
                  {SUBJECT_FLASHCARDS[activeFlashIdx].back}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <span className="text-[9px] font-mono font-bold px-2 py-0.5 bg-indigo-605/10 border border-indigo-550/25 text-indigo-400 rounded-full uppercase">
                  Concept Query
                </span>
                <h4 className="text-sm font-semibold text-white leading-relaxed">
                  {SUBJECT_FLASHCARDS[activeFlashIdx].front}
                </h4>
                <span className="text-[10px] font-mono text-slate-500 block mt-1">
                  Click card to reveal proof
                </span>
              </div>
            )}
          </div>

          {/* Indicators bottom navigation slider */}
          <div className="flex justify-between items-center mt-4 pt-1">
            <button
              onClick={() => {
                setFlipFlashCard(false);
                setActiveFlashIdx((idx) => (idx > 0 ? idx - 1 : SUBJECT_FLASHCARDS.length - 1));
              }}
              className="p-1 px-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs transition font-mono uppercase"
            >
              Prev
            </button>
            <div className="flex gap-1.5">
              {SUBJECT_FLASHCARDS.map((_, idx) => (
                <div
                  key={idx}
                  className={`w-2 h-2 rounded-full transition ${activeFlashIdx === idx ? "bg-indigo-405 scale-110" : "bg-slate-800"}`}
                />
              ))}
            </div>
            <button
              onClick={() => {
                setFlipFlashCard(false);
                setActiveFlashIdx((idx) => (idx + 1 < SUBJECT_FLASHCARDS.length ? idx + 1 : 0));
              }}
              className="p-1 px-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs transition font-mono uppercase"
            >
              Next
            </button>
          </div>
        </div>

      </div>

      {/* RIGHT COLUMN: LAB COMPANION & COURSE TOPIC REFERENCE (5/12 SPAN) */}
      <div className="col-span-1 lg:col-span-5 space-y-6 flex flex-col">
        
        {/* SUBJECT TOPIC INTEGRATIONS RESOURCE CHEAT SHEET */}
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl flex-1 flex flex-col">
          <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-300 border-b border-slate-800 pb-3 mb-4">
            <Layers className="w-5 h-5 text-indigo-400" /> Academic Labs Compendium Guide
          </span>

          <div className="space-y-4.5 overflow-y-auto max-h-[460px] pr-1 flex-1 text-left">
            
            {/* Lab 8.1 */}
            <div className="p-4 bg-slate-950 rounded-xl border border-slate-850 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-mono bg-indigo-505/10 text-indigo-400 p-1 px-2 rounded font-bold uppercase">
                  Lab Module 8.1
                </span>
                <span className="text-[9px] font-mono text-slate-500 font-semibold uppercase">
                  Dis. Math (Automata)
                </span>
              </div>
              <h4 className="text-xs font-bold text-white uppercase">6-Tuple FSM Minimality Theorem</h4>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Formulates a deterministic finite automaton (DFA) mapping raw risks &sigma; inputs across 6 physical system states. Proof confirms minimality as states map to unique combinations of PWM buzzer pitch and solid color actuators.
              </p>
            </div>

            {/* Lab 8.2 */}
            <div className="p-4 bg-slate-950 rounded-xl border border-slate-850 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-mono bg-indigo-505/10 text-indigo-400 p-1 px-2 rounded font-bold uppercase">
                  Lab Module 8.2
                </span>
                <span className="text-[9px] font-mono text-slate-500 font-semibold uppercase">
                  Graph/Algorithms
                </span>
              </div>
              <h4 className="text-xs font-bold text-white uppercase">Dynamic Escape Paths via Dijkstra</h4>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Applies edge weights scaling dynamically as hazardous metrics trigger. Models room nodes and exits, deploying dynamic edge relaxed solutions over a binary priority heap to solve safe routes.
              </p>
            </div>

            {/* Lab 8.3 */}
            <div className="p-4 bg-slate-950 rounded-xl border border-slate-850 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-mono bg-indigo-505/10 text-indigo-400 p-1 px-2 rounded font-bold uppercase">
                  Lab Module 8.3
                </span>
                <span className="text-[9px] font-mono text-slate-500 font-semibold uppercase">
                  Dis. Math (Set Theory)
                </span>
              </div>
              <h4 className="text-xs font-bold text-white uppercase">Multi-Sensor Weight Optimization</h4>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Weights composite risk score tracking through sensor dimensions. Integrates ROC optimized values (Temperature, Smoke, PIR, Humidity, LDR) to establish risk quotients for alarms.
              </p>
            </div>

            {/* Lab 8.4 */}
            <div className="p-4 bg-slate-950 rounded-xl border border-slate-850 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-mono bg-indigo-505/10 text-indigo-400 p-1 px-2 rounded font-bold uppercase">
                  Lab Module 8.4
                </span>
                <span className="text-[9px] font-mono text-slate-500 font-semibold uppercase">
                  Dis. Math (Logic)
                </span>
              </div>
              <h4 className="text-xs font-bold text-white uppercase">Quine-McCluskey Gate Minimization</h4>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Simplifies logic inputs S, P, T to minimize false flags and streamline gate architecture. Minimal boolean output triggers automatic FSM escalation bypass when fire indicators compound.
              </p>
            </div>

            {/* Lab 8.5 */}
            <div className="p-4 bg-slate-950 rounded-xl border border-slate-850 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-mono bg-indigo-505/10 text-indigo-400 p-1 px-2 rounded font-bold uppercase">
                  Lab Module 8.5
                </span>
                <span className="text-[9px] font-mono text-slate-500 font-semibold uppercase">
                  Networks (QoS)
                </span>
              </div>
              <h4 className="text-xs font-bold text-white uppercase">Network Latency & QoS Benchmarks</h4>
              <p className="text-[11px] text-slate-450 leading-relaxed">
                Compares latency distribution across different QoS levels. Proves via t-statistics that higher QoS handshakes safeguard packet reception but increase overhead, matching Moore machine reporting intervals.
              </p>
            </div>

          </div>
        </div>
        
      </div>
      
    </div>
  );
}
