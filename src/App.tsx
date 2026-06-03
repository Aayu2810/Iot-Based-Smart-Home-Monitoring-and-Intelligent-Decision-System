import React, { useState, useEffect, useRef } from "react";
import {
  Folder,
  FolderOpen,
  FileText,
  FileCheck,
  Search,
  BookOpen,
  MessageSquare,
  Sparkles,
  HelpCircle,
  Layers,
  LogOut,
  ChevronRight,
  RefreshCw,
  Clock,
  ExternalLink,
  ChevronLeft,
  GraduationCap,
  AlertCircle,
  Copy,
  Check,
  Flame,
  ArrowRight,
  Cpu,
  Terminal,
  Sliders,
  Code,
} from "lucide-react";
import Markdown from "react-markdown";
import { motion, AnimatePresence } from "motion/react";
import { initAuth, googleSignIn, logout } from "./firebase";
import { DriveFile, Message, QuizQuestion, Flashcard, UserProfile } from "./types";
import SmartHomeSimulator from "./components/SmartHomeSimulator";
import { SmartHomeQuizAndResources } from "./components/SmartHomeQuizAndResources";
import { ESP32_NODE1_CODE, ESP32_NODE2_CODE, ESP32_NODE3_CODE } from "./components/FirmwareCodes";

const DEFAULT_FOLDER_ID = "11jWFtcfxOt2TSNE6Wah-ptrML22h1r2M";
const DEFAULT_FOLDER_NAME = "4th sem el";

export default function App() {
  // Auth state
  const [user, setUser] = useState<UserProfile | null>({
    name: "Guest Academic",
    email: "preview@university.edu"
  });
  const [token, setToken] = useState<string | null>("demo-token-bypass");
  const [needsAuth, setNeedsAuth] = useState<boolean>(false);
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Academic IoT & Course integrations states
  const [systemMode, setSystemMode] = useState<"drive" | "iot">("iot"); // Default to 'iot' to immediately highlight the core Smart Home IoT simulator on startup!
  const [iotTab, setIotTab] = useState<"sim" | "academic" | "firmware">("sim");
  const [activeFirmwareNode, setActiveFirmwareNode] = useState<1 | 2 | 3>(1);
  const [copiedCode, setCopiedCode] = useState<boolean>(false);

  // Folder Explorer state
  const [inputFolderId, setInputFolderId] = useState<string>("");
  const [folderStack, setFolderStack] = useState<{ id: string; name: string }[]>([
    { id: DEFAULT_FOLDER_ID, name: DEFAULT_FOLDER_NAME },
  ]);
  const [folderMetadata, setFolderMetadata] = useState<{ name: string; description?: string } | null>(null);
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [loadingFiles, setLoadingFiles] = useState<boolean>(false);
  const [explorerError, setExplorerError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Study workspace state
  const [selectedFile, setSelectedFile] = useState<DriveFile | null>(null);
  const [extractingContent, setExtractingContent] = useState<boolean>(false);
  const [fileContentData, setFileContentData] = useState<{ textContent?: string; base64Pdf?: string; isPdf: boolean } | null>(null);
  const [workspaceTab, setWorkspaceTab] = useState<"summary" | "chat" | "quiz" | "flashcards">("summary");
  const [extractionError, setExtractionError] = useState<string | null>(null);

  // AI Generated States (cached per file)
  const [aiCache, setAiCache] = useState<{
    [fileId: string]: {
      summary?: string;
      chatMessages?: Message[];
      quiz?: QuizQuestion[];
      flashcards?: Flashcard[];
    };
  }>({});

  // Active generation loads
  const [generatingSummary, setGeneratingSummary] = useState<boolean>(false);
  const [summaryResponseError, setSummaryResponseError] = useState<string | null>(null);

  // Chat interactive messages
  const [chatInput, setChatInput] = useState<string>("");
  const [sendingChat, setSendingChat] = useState<boolean>(false);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);

  // Quiz game state
  const [generatingQuiz, setGeneratingQuiz] = useState<boolean>(false);
  const [quizError, setQuizError] = useState<string | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState<number>(0);
  const [selectedAnswerIndex, setSelectedAnswerIndex] = useState<number | null>(null);
  const [score, setScore] = useState<number>(0);
  const [quizCompleted, setQuizCompleted] = useState<boolean>(false);

  // Flashcard Deck state
  const [generatingFlashcards, setGeneratingFlashcards] = useState<boolean>(false);
  const [flashcardError, setFlashcardError] = useState<string | null>(null);
  const [currentCardIndex, setCurrentCardIndex] = useState<number>(0);
  const [isCardFlipped, setIsCardFlipped] = useState<boolean>(false);

  // Copy support
  const [copiedSummary, setCopiedSummary] = useState<boolean>(false);

  const currentFolder = folderStack[folderStack.length - 1];

  // Initialize Auth state
  useEffect(() => {
    const unsubscribe = initAuth(
      (currentUser, accessToken) => {
        setUser({
          name: currentUser.displayName || currentUser.email || "Explorer",
          email: currentUser.email || "",
          photoURL: currentUser.photoURL || undefined,
        });
        setToken(accessToken);
        setNeedsAuth(false);
      },
      () => {
        // Only reset if NOT active in demo preview mode
        setToken((currToken) => {
          if (currToken === "demo-token-bypass") {
            return currToken;
          }
          setUser(null);
          setNeedsAuth(true);
          return null;
        });
      }
    );
    return () => unsubscribe();
  }, []);

  // Fetch folders and files when token or folder changes
  useEffect(() => {
    if (token && currentFolder) {
      fetchFolderContents(currentFolder.id);
    }
  }, [token, currentFolder?.id]);

  // Handle active file loading scrolling inside Q&A helper
  useEffect(() => {
    if (chatBottomRef.current) {
      chatBottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [workspaceTab, aiCache[selectedFile?.id || ""]?.chatMessages, sendingChat]);

  // Login action handler
  const handleLogin = async () => {
    setIsLoggingIn(true);
    setAuthError(null);
    try {
      const result = await googleSignIn();
      if (result) {
        setUser({
          name: result.user.displayName || result.user.email || "Explorer",
          email: result.user.email || "",
          photoURL: result.user.photoURL || undefined,
        });
        setToken(result.accessToken);
        setNeedsAuth(false);
      }
    } catch (err: any) {
      console.error("Popup auth challenge failed:", err);
      setAuthError(err?.message || "Google authentication failed. Please try again.");
    } finally {
      setIsLoggingIn(false);
    }
  };

  // Sign out handler
  const handleLogout = async () => {
    try {
      await logout();
      setUser(null);
      setToken(null);
      setNeedsAuth(true);
      setSelectedFile(null);
      setFileContentData(null);
      setFiles([]);
      setFolderStack([{ id: DEFAULT_FOLDER_ID, name: DEFAULT_FOLDER_NAME }]);
    } catch (err) {
      console.error("Sign out fail", err);
    }
  };

  const handleEnterDemoMode = () => {
    setUser({
      name: "Guest Academic",
      email: "preview@university.edu",
    });
    setToken("demo-token-bypass");
    setNeedsAuth(false);
  };

  // Utility to parse folder ID from Google Drive folder Link
  const handleSearchFolderSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputFolderId.trim()) return;

    let targetId = inputFolderId.trim();
    // Parse Google Drive Folder URL
    // e.g. https://drive.google.com/drive/folders/11jWFtcfxOt2TSNE6Wah-ptrML22h1r2M?usp=sharing
    const match = targetId.match(/\/folders\/([a-zA-Z0-9-_]+)/);
    if (match && match[1]) {
      targetId = match[1];
    }

    // Push new root stack folder
    setFolderStack([{ id: targetId, name: "Linked Folder" }]);
    setInputFolderId("");
  };

  // Run google drive directory list API
  const fetchFolderContents = async (folderId: string) => {
    if (!token) return;
    setLoadingFiles(true);
    setExplorerError(null);
    if (token === "demo-token-bypass") {
      setFolderMetadata({
        name: "4th Sem IoT Course Library (Preview)",
        description: "Shared directory of course syllabus, materials, and finite state machine proofs.",
      });
      setFiles([
        {
          id: "demo-file-1",
          name: "[Module 1] Discrete FSM States & State Graphs.txt",
          mimeType: "text/plain",
          size: "4200",
          modifiedTime: new Date().toISOString(),
          description: "Details the 6-tuple FSM specification, transition tables, list transitions, and state diagram proofs."
        },
        {
          id: "demo-file-2",
          name: "[Module 2] IoT System: Multi-Sensor Risk Fusion.txt",
          mimeType: "text/plain",
          size: "6100",
          modifiedTime: new Date().toISOString(),
          description: "Academic formulation on normalized risk coefficient calculations and Boolean minimization algorithms."
        },
        {
          id: "demo-file-3",
          name: "[Module 3] Computer Networks: Edge Routing & Dijkstra.txt",
          mimeType: "text/plain",
          size: "5400",
          modifiedTime: new Date().toISOString(),
          description: "Details Dijkstra exit path solver, Priority queues, BFS/DFS traversal schemas, and SSL-pinned REST transfers."
        }
      ]);
      setLoadingFiles(false);
      return;
    }
    try {
      // 1. Fetch Folder Metadata first to display true title
      const metaRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${folderId}?fields=name,description`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (metaRes.ok) {
        const meta = await metaRes.json();
        setFolderMetadata({
          name: meta.name || "Unknown Folder",
          description: meta.description,
        });

        // Update name in stack
        setFolderStack((prev) =>
          prev.map((item) => (item.id === folderId ? { ...item, name: meta.name } : item))
        );
      } else {
        setFolderMetadata({ name: "Study Folder" });
      }

      // 2. Fetch Directory files list containing standard schema items
      const query = `'${folderId}' in parents and trashed = false`;
      const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
        query
      )}&fields=files(id,name,mimeType,size,modifiedTime,iconLink,webViewLink,description)&orderBy=folder,name_natural&pageSize=100`;

      const filesRes = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!filesRes.ok) {
        if (filesRes.status === 401) {
          // Token expired, require auth update
          setNeedsAuth(true);
          return;
        }
        throw new Error(`Failed to list files. Status ${filesRes.status}`);
      }

      const rawData = await filesRes.json();
      setFiles(rawData.files || []);
    } catch (err: any) {
      console.error("List files error:", err);
      setExplorerError(
        err?.message || "Failed to load files. Ensure this application has permissions for this folder."
      );
    } finally {
      setLoadingFiles(false);
    }
  };

  // Navigating Breadcrumbs jump back
  const handleBreadcrumbClick = (index: number) => {
    if (index === folderStack.length - 1) return;
    setFolderStack(folderStack.slice(0, index + 1));
  };

  // Clicking an element in file explorer: handle sub-folders vs study files
  const handleFileClick = async (file: DriveFile) => {
    // If folder: drill down
    if (file.mimeType === "application/vnd.google-apps.folder") {
      setFolderStack((prev) => [...prev, { id: file.id, name: file.name }]);
      return;
    }

    // Set selected file
    setSelectedFile(file);
    setExtractionError(null);
    setFileContentData(null);
    setWorkspaceTab("summary");

    // Initiate content extract loader
    setExtractingContent(true);
    try {
      const extracted = await downloadAndExportFile(file.id, file.mimeType);
      setFileContentData(extracted);
    } catch (err: any) {
      console.error("File content extraction exception:", err);
      setExtractionError(
        err?.message || "Unable to extract learning content from this file type. Please try standard text or PDFs."
      );
    } finally {
      setExtractingContent(false);
    }
  };

  // Handle conversion & extraction logic matching MIME schemas
  const downloadAndExportFile = async (
    fileId: string,
    mimeType: string
  ): Promise<{ textContent?: string; base64Pdf?: string; isPdf: boolean }> => {
    if (!token) throw new Error("Authentication missing.");

    if (token === "demo-token-bypass") {
      if (fileId === "demo-file-1") {
        return {
          textContent: `=== IoT ACADEMIC SERIES: MODULE 1 (FSM TRANSITION SYSTEM) ===
A Finite State Machine (FSM) is mathematically defined as a 6-tuple: (Q, Sigma, Gamma, delta, q0, F)
Where:
- Q is a finite set of states: {IDLE, MONITOR, ALERT_LOW, ALERT_HIGH, CRITICAL, FAULT}.
- Sigma (sigma) is the input alphabets, mapped to normalization thresholds or composite sensor hazards:
  sigma_0: composite risk (R) < 0.20
  sigma_1: 0.20 <= R < 0.40
  sigma_2: 0.40 <= R < 0.65
  sigma_3: 0.65 <= R < 0.85
  sigma_4: R >= 0.85
- Gamma is the output alphabet associated with actuative displays (LCD alerts, LED sirens, sounders).
- delta (delta) is the state transition function mapping Q x Sigma -> Q.
- q0 is the initial state (IDLE).
- F is the set of final states or hazard-recovery terminals.

Transition Table delta mappings:
Present State | Input (Sigma) | Next State | Output Description
--------------------------------------------------------------
IDLE          | sigma_0       | IDLE       | LCD Green, Actuators Off
IDLE          | sigma_1       | MONITOR    | LCD Info, Sensor Active
MONITOR       | sigma_0       | IDLE       | Restores to Calm System
MONITOR       | sigma_2       | ALERT_LOW  | Orange indicator glows
ALERT_LOW     | sigma_3       | ALERT_HIGH | Red alert triggered, LED blinks
ALERT_HIGH    | sigma_4       | CRITICAL   | Siren triggers, dynamic path solved
CRITICAL      | sigma_0       | IDLE       | Standard system reset complete

Livelock Prevention Mechanism:
To prevent intermediate high-frequency state-shaking (livelocks) at exact threshold boundary lines (e.g. 0.400), an anti-chatter debounce algorithm filters the input stream. Additionally, sensor stuck-at faults force the FSM directly into the FAULT state (state index 5), activating secondary display overrides.`,
          isPdf: false
        };
      }
      if (fileId === "demo-file-2") {
        return {
          textContent: `=== IoT ACADEMIC SERIES: MODULE 2 (MULTI-SENSOR RISK FUSION) ===
Multi-sensor risk fusion processes inputs from disparate sensory nodes to determine a unified composite risk coefficient R(t).
Sensors mapping inputs:
- Temperature Raw (measured via DHT11, calibrated using T_cal = T_raw + 0.82)
- Humidity Raw (measured via DHT11)
- LDR Light Intensity (reading 12-bit ADC raw range)
- PIR Motion detectors (binary high/low)
- Smoke/Gas sensors (simulated levels)

Mathematical Weight Coefficients Assigning:
w_T (Temperature) = 0.30
w_S (Smoke/Gas) = 0.35
w_P (PIR Motion) = 0.20
w_H (Humidity) = 0.10
w_L (LDR Light) = 0.05
sum of w_i = 1.00

Composite Risk Equation:
R(t) = w_T * n_T + w_S * n_S + w_P * n_P + w_H * n_H + w_L * n_L

Where n_i represents the normalized value restricted to [0.0, 1.0]:
- n_T: Normalized scale mapping [20.0 to 45.0]
- n_H: Dryness ratio = 1.0 - (humidity / 100.0)
- n_L: Light darkness ratio = 1.0 - (LDR_Normalized_Ratio)

Logical Boolean Clause Minimization:
Let conditions be:
T = High Temperature (n_T > 0.5)
S = High Smoke/Gas (n_S > 0.5)
P = PIR Motion Active (n_P == 1.0)
L = High Darkness (n_L > 0.5)

Before Minimization:
- Fire Threat: Alert = T and S
- Gas Hazard: Alert = S and (not T)
- Intrusion Threat: Alert = P and L

After Minimization for Critical Hazards (A_critical):
An escape hazard activates when smoke is present alongside either movement or high temperature:
A_critical = S and (P or T)
Utilizing Boolean algebra, this reduces physical microprocessor logical gate evaluation cycles and avoids thread-blocking inside the main CPU execution loop.`,
          isPdf: false
        };
      }
      if (fileId === "demo-file-3") {
        return {
          textContent: `=== IoT ACADEMIC SERIES: MODULE 3 (DIJKSTRA SHORT-PATH ROUTING) ===
Algorithm Analysis & Graphs Routing on Microcontrollers of low core frequency.
To solve dynamic exit paths for residents inside a hazard-blocked building, a graph structure representation of the floorplan is loaded in the node memory:
G = (V, E)
Where:
- V represents key nodes (0: Living Room, 1: Kitchen, 2: Bedroom, 3: Hallway, 4: Back Exit, 5: Front Main Gate).
- E represents connections with edge weights mapping physical distance.

Dijkstra Shortest Path Formulation:
1. Initialize distance array elements to infinity; distance to starting source cell is set to 0.
2. Initialize an empty Min-Heap priority queue of vertex index nodes.
3. Push source node to heap.
4. While heap is not empty:
   Extract node 'u' with the minimum accumulated cost.
   For each adjacent neighbor 'v' of 'u':
     If dist[u] + weight(u, v) < dist[v]:
       dist[v] = dist[u] + weight(u, v)
       Push 'v' to priority queue.

Microcontroller Implementation Constraints:
- Built-in STL priority_queue templates contain heavy memory allocations unsuitable for bare-metal ESP32/Arduino chips.
- Custom binary max-heaps or linear scan routines are implemented to reduce heap noise and prevent memory fragmentation.
- When fire blocks Hallway (Node 3), neighbors are recalculated, and a dynamic detour recalculation alerts active clients.

Secure Transmission Protocols (REST vs MQTT QoS2):
- ThingSpeak supports standard HTTP REST transfers.
- Communication nodes must pins the specific SSL certificate fingerprint to bypass rogue MITM access attacks.
- MQTT broker bridges are benchmarked. QoS0, QoS1, and QoS2 benchmarks measure memory vs packet persistence levels under high communication load.`,
          isPdf: false
        };
      }
      return {
        textContent: "Demo document content loaded.",
        isPdf: false
      };
    }

    // Google Document Export to Plain Text
    if (mimeType === "application/vnd.google-apps.document") {
      const exportUrl = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/plain`;
      const res = await fetch(exportUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Could not export Google Document format.");
      const text = await res.text();
      return { textContent: text, isPdf: false };
    }

    // Google Sheets Export to CSV
    if (mimeType === "application/vnd.google-apps.spreadsheet") {
      const exportUrl = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/csv`;
      const res = await fetch(exportUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Could not export spreadsheet cells.");
      const text = await res.text();
      return { textContent: text, isPdf: false };
    }

    // Google Slides exported as PDF (Vite servers proxying handles)
    if (mimeType === "application/vnd.google-apps.presentation") {
      const exportUrl = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=application/pdf`;
      const res = await fetch(exportUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to compile Slides as PDF.");
      const blob = await res.blob();
      const base64 = await convertBlobToBase64(blob);
      return { base64Pdf: base64, isPdf: true };
    }

    // Regular PDF Document Handling (read binary chunk send base64)
    if (mimeType === "application/pdf") {
      const downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
      const res = await fetch(downloadUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        throw new Error(
          "Could not download PDF. Verify the file isn't blocked by admin policies."
        );
      }
      const blob = await res.blob();
      const base64 = await convertBlobToBase64(blob);
      return { base64Pdf: base64, isPdf: true };
    }

    // Check for readable text formats
    const isTextReadable =
      mimeType.startsWith("text/") ||
      mimeType === "application/json" ||
      mimeType === "application/javascript" ||
      mimeType.includes("xml");

    if (isTextReadable) {
      const downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
      const res = await fetch(downloadUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Could not obtain text format stream.");
      const text = await res.text();
      return { textContent: text, isPdf: false };
    }

    // Fallback: Check if file has a size and description to study
    if (selectedFile?.description) {
      return {
        textContent: `Note: File contents not raw readable. Metadata Description: ${selectedFile.description}`,
        isPdf: false,
      };
    }

    throw new Error(
      "Unsupported File Type: This companion can study Google Docs, Slides, Sheets, standard text files, and PDFs."
    );
  };

  const convertBlobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === "string") {
          const split = reader.result.split(",")[1];
          resolve(split);
        } else {
          reject(new Error("File translation failed."));
        }
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  // API Call: Summary Generator
  const generateStudyGuide = async () => {
    if (!selectedFile || !fileContentData) return;
    setGeneratingSummary(true);
    setSummaryResponseError(null);

    try {
      const res = await fetch("/api/study/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: selectedFile.name,
          fileContent: fileContentData.isPdf
            ? "[PDF Document Binary. Grounding Context Included]"
            : fileContentData.textContent,
          // Since server can read PDF base64 if needed, let's pass it
          base64: fileContentData.base64Pdf,
        }),
      });

      if (!res.ok) {
        throw new Error("Tutor summary service returned an error.");
      }

      const data = await res.json();

      setAiCache((prev) => ({
        ...prev,
        [selectedFile.id]: {
          ...prev[selectedFile.id],
          summary: data.result,
        },
      }));
    } catch (err: any) {
      console.error(err);
      setSummaryResponseError(err?.message || "Failed to generate study summary.");
    } finally {
      setGeneratingSummary(false);
    }
  };

  // API Call: Send chat message for interactive grounding tutoring
  const handleSendChatMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!chatInput.trim() || !selectedFile || !fileContentData || sendingChat) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: chatInput.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setChatInput("");

    // Read previous chat from cache or initialize
    const fileCache = aiCache[selectedFile.id] || {};
    const previousMessages = fileCache.chatMessages || [];
    const updatedMessages = [...previousMessages, userMsg];

    setAiCache((prev) => ({
      ...prev,
      [selectedFile.id]: {
        ...prev[selectedFile.id],
        chatMessages: updatedMessages,
      },
    }));

    setSendingChat(true);

    try {
      const res = await fetch("/api/study/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: selectedFile.name,
          fileContent: fileContentData.isPdf
            ? "[Grounding context included within PDF structure]"
            : fileContentData.textContent,
          messages: updatedMessages.map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      if (!res.ok) throw new Error("Chat tutor endpoint offline.");
      const data = await res.json();

      const aiMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "model",
        content: data.reply,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };

      setAiCache((prev) => ({
        ...prev,
        [selectedFile.id]: {
          ...prev[selectedFile.id],
          chatMessages: [...updatedMessages, aiMsg],
        },
      }));
    } catch (err: any) {
      console.error(err);
      const errMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "model",
        content: `⚠️ Error: ${err?.message || "Unable to reach your AI tutor right now. Please verify internet connection."}`,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      setAiCache((prev) => ({
        ...prev,
        [selectedFile.id]: {
          ...prev[selectedFile.id],
          chatMessages: [...updatedMessages, errMsg],
        },
      }));
    } finally {
      setSendingChat(false);
    }
  };

  // API Call: Quiz construction
  const generateQuiz = async () => {
    if (!selectedFile || !fileContentData) return;
    setGeneratingQuiz(true);
    setQuizError(null);
    setCurrentQuestionIndex(0);
    setSelectedAnswerIndex(null);
    setScore(0);
    setQuizCompleted(false);

    try {
      const res = await fetch("/api/study/quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: selectedFile.name,
          fileContent: fileContentData.isPdf ? "[PDF material loaded]" : fileContentData.textContent,
        }),
      });

      if (!res.ok) throw new Error("Quiz creation service encountered an issue.");
      const data = await res.json();

      setAiCache((prev) => ({
        ...prev,
        [selectedFile.id]: {
          ...prev[selectedFile.id],
          quiz: data.quiz,
        },
      }));
    } catch (err: any) {
      console.error(err);
      setQuizError(err?.message || "Failed to make custom multi-choice quiz.");
    } finally {
      setGeneratingQuiz(false);
    }
  };

  // API Call: Flashcard deck creation
  const generateFlashcards = async () => {
    if (!selectedFile || !fileContentData) return;
    setGeneratingFlashcards(true);
    setFlashcardError(null);
    setCurrentCardIndex(0);
    setIsCardFlipped(false);

    try {
      const res = await fetch("/api/study/flashcards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: selectedFile.name,
          fileContent: fileContentData.isPdf ? "PDF content loaded" : fileContentData.textContent,
        }),
      });

      if (!res.ok) throw new Error("Flashcards compiler crashed.");
      const data = await res.json();

      setAiCache((prev) => ({
        ...prev,
        [selectedFile.id]: {
          ...prev[selectedFile.id],
          flashcards: data.flashcards,
        },
      }));
    } catch (err: any) {
      console.error(err);
      setFlashcardError(err?.message || "Failed to structure flashcard session material.");
    } finally {
      setGeneratingFlashcards(false);
    }
  };

  // Save/Copy summary text clipboard helper
  const copySummaryToClipboard = () => {
    const summaryText = aiCache[selectedFile?.id || ""]?.summary;
    if (summaryText) {
      navigator.clipboard.writeText(summaryText);
      setCopiedSummary(true);
      setTimeout(() => setCopiedSummary(false), 2000);
    }
  };

  // Quiz active choice handler
  const handleQuizAnswer = (optionIdx: number, correctIdx: number) => {
    if (selectedAnswerIndex !== null) return; // Answer locked
    setSelectedAnswerIndex(optionIdx);
    if (optionIdx === correctIdx) {
      setScore((prev) => prev + 1);
    }
  };

  const handleNextQuizQuestion = (quizLength: number) => {
    setSelectedAnswerIndex(null);
    if (currentQuestionIndex + 1 < quizLength) {
      setCurrentQuestionIndex((prev) => prev + 1);
    } else {
      setQuizCompleted(true);
    }
  };

  // Helper file icons mapper based on mime class types
  const getFileIcon = (mimeType: string) => {
    if (mimeType === "application/vnd.google-apps.folder") {
      return <Folder className="w-5 h-5 text-amber-400 fill-amber-400" />;
    }
    if (mimeType === "application/vnd.google-apps.document" || mimeType.includes("document")) {
      return <FileText className="w-5 h-5 text-blue-400" />;
    }
    if (mimeType === "application/vnd.google-apps.spreadsheet" || mimeType.includes("sheet")) {
      return <Layers className="w-5 h-5 text-emerald-400" />;
    }
    if (mimeType === "application/vnd.google-apps.presentation" || mimeType.includes("presentation")) {
      return <Layers className="w-5 h-5 text-orange-400 text-opacity-90" />;
    }
    if (mimeType === "application/pdf") {
      return <FileText className="w-5 h-5 text-rose-400" />;
    }
    return <FileText className="w-5 h-5 text-slate-400" />;
  };

  // Filter files listed by query text
  const filteredFiles = files.filter((f) =>
    f.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-indigo-500/30 selection:text-indigo-200">
      <AnimatePresence mode="wait">
        {needsAuth ? (
          /* ================= LOGIN COMPONENT ================= */
          <motion.div
            key="login"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center justify-center min-h-screen p-6 bg-radial from-slate-900 to-slate-950"
          >
            <div className="w-full max-w-md p-8 bg-slate-900/60 border border-slate-800 rounded-2xl shadow-xl backdrop-blur-md">
              <div className="flex items-center justify-center mb-6">
                <div className="p-4 bg-indigo-600/10 border border-indigo-500/30 rounded-full text-indigo-400 shadow-inner">
                  <GraduationCap className="w-10 h-10" />
                </div>
              </div>

              <h1 className="text-2xl font-semibold text-center text-white tracking-tight leading-none mb-2">
                Drive Companion
              </h1>
              <p className="text-slate-400 text-sm text-center font-medium leading-relaxed mb-8">
                Connect your Google Drive folders to browse lecture notes, syllabus PDF's or study sheets, and unleash Gemini AI to summarize complex topics, take self-graded quizes or build custom memory flashcards.
              </p>

              {authError && (
                <div className="flex gap-2.5 items-start p-3.5 mb-6 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-300 text-xs">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{authError}</span>
                </div>
              )}

              <button
                id="google-signin-btn"
                onClick={handleLogin}
                disabled={isLoggingIn}
                className="w-full flex items-center justify-center bg-slate-100 hover:bg-white text-slate-950 font-semibold py-3 px-4 rounded-xl transition duration-150 shadow-md cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed group border border-transparent text-sm"
              >
                {isLoggingIn ? (
                  <RefreshCw className="w-5 h-5 animate-spin" />
                ) : (
                  <div className="flex items-center gap-3">
                    <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                      <path
                        fill="#4285F4"
                        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.53-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-8.77z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.11 0-5.74-2.11-6.68-4.96H1.21v3.15C3.18 21.88 7.39 24 12 24z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.32 14.24A7.16 7.16 0 0 1 5 12c0-.79.13-1.57.32-2.34V6.51H1.21A11.94 11.94 0 0 0 0 12c0 1.92.45 3.74 1.21 5.39l4.11-3.15z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.39 0 3.18 2.12 1.21 5.92l4.11 3.15c.94-2.85 3.57-4.96 6.68-4.96z"
                      />
                    </svg>
                    <span>Connect Google Account</span>
                  </div>
                )}
              </button>

              <div className="relative my-5 flex py-1 items-center">
                <div className="flex-grow border-t border-slate-805/40"></div>
                <span className="flex-shrink mx-4 text-slate-500 text-[10px] font-mono uppercase tracking-wider">or</span>
                <div className="flex-grow border-t border-slate-805/40"></div>
              </div>

              <button
                id="bypass-auth-btn"
                onClick={handleEnterDemoMode}
                className="w-full flex items-center justify-center bg-slate-900 hover:bg-slate-850 text-indigo-400 hover:text-indigo-300 font-semibold py-3 px-4 rounded-xl border border-dashed border-indigo-505/30 hover:border-indigo-400/40 transition duration-150 shadow-md cursor-pointer group text-sm"
              >
                <div className="flex items-center gap-2.5">
                  <Sparkles className="w-5 h-5 text-indigo-400 group-hover:scale-110 transition-transform" />
                  <span>Enter Preview Mode (Guest Access)</span>
                </div>
              </button>
            </div>
          </motion.div>
        ) : (
          /* ================= COMPANION APP WORKSPACE ================= */
          <motion.div
            key="dashboard"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col h-screen overflow-hidden"
          >
            {/* TOP BAR / NAVIGATION HEADER */}
            <header className="flex flex-col md:flex-row gap-4 justify-between items-center px-6 py-4 bg-slate-900 border-b border-slate-800">
              <div className="flex items-center gap-3 self-start">
                <div className="p-2 bg-indigo-500/15 border border-indigo-500/30 rounded-xl text-indigo-400">
                  <Cpu className="w-6 h-6 animate-pulse" />
                </div>
                <div>
                  <h1 className="text-lg font-bold text-white tracking-tight">Academic IoT Smart Home Dashboard</h1>
                  <span className="font-mono text-[9px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/10 uppercase tracking-widest font-black">
                    Research Simulator Active
                  </span>
                </div>
              </div>

              {user && (
                <div className="flex items-center gap-4 self-end md:self-auto">
                  <div className="flex items-center gap-2.5 text-right">
                    <div className="hidden sm:block">
                      <p className="text-xs font-semibold text-slate-100">{user.name}</p>
                      <p className="text-[10px] text-slate-400">{user.email}</p>
                    </div>
                    {user.photoURL ? (
                      <img src={user.photoURL} alt={user.name} referrerPolicy="no-referrer" className="w-8.5 h-8.5 rounded-full border border-slate-700" />
                    ) : (
                      <div className="w-8.5 h-8.5 rounded-full bg-slate-800 flex items-center justify-center border border-slate-700 font-bold text-xs uppercase text-slate-200">
                        {user.name[0]}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </header>

            {/* MAIN WORKSPACE WRAPPER */}
            <div className="flex flex-1 overflow-hidden">
              {systemMode === "iot" ? (
                /* ================= SPECIALIZED INTERACTIVE ACADEMIC WORKSPACE ================= */
                <div className="flex-1 bg-slate-950 flex flex-col overflow-y-auto">
                  <div className="border-b border-slate-850 bg-slate-900/40 px-6 py-4 flex flex-col md:flex-row justify-between items-center gap-4">
                    <div className="text-left w-full md:w-auto">
                      <h2 className="text-base font-extrabold text-white tracking-tight flex items-center gap-2">
                        <Cpu className="w-5 h-5 text-indigo-400" /> Research-Grade Smart Home IoT & Algorithms Workspace
                      </h2>
                      <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
                        Applying Discrete Mathematical Structures (FSM proofs & logical minimization), Algorithm Analysis (dynamic path solver, traversal queues, & binary heaps), and Networks (QoS QoS2 benchmarks & SSL certificate pinned REST transfers).
                      </p>
                    </div>

                    {/* SELECTOR SUB-TABS */}
                    <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-850 gap-1 shrink-0 w-full md:w-auto shadow-inner">
                      <button
                        onClick={() => setIotTab("sim")}
                        className={`flex-1 md:flex-none flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg transition cursor-pointer ${
                          iotTab === "sim" ? "bg-indigo-600 text-white shadow" : "text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        <Sliders className="w-3.5 h-3.5" />
                        <span>Visual Simulator</span>
                      </button>
                      <button
                        onClick={() => setIotTab("academic")}
                        className={`flex-1 md:flex-none flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg transition cursor-pointer ${
                          iotTab === "academic" ? "bg-indigo-600 text-white shadow" : "text-slate-405 hover:text-slate-200"
                        }`}
                      >
                        <GraduationCap className="w-3.5 h-3.5" />
                        <span>Assessments & Proofs</span>
                      </button>
                      <button
                        onClick={() => setIotTab("firmware")}
                        className={`flex-1 md:flex-none flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg transition cursor-pointer ${
                          iotTab === "firmware" ? "bg-indigo-600 text-white shadow" : "text-slate-405 hover:text-slate-200"
                        }`}
                      >
                        <Code className="w-3.5 h-3.5" />
                        <span>Unabridged Codes (ESP32)</span>
                      </button>
                    </div>
                  </div>

                  {/* ACTIVE TAB DISPLAY GRID */}
                  <div className="p-6 flex-1 max-w-7xl mx-auto w-full space-y-6">
                    {iotTab === "sim" && <SmartHomeSimulator />}
                    {iotTab === "academic" && <SmartHomeQuizAndResources />}
                    {iotTab === "firmware" && (
                      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-full text-left">
                        {/* LEFT SWITCH PANEL (4/12 SPAN) */}
                        <div className="col-span-1 lg:col-span-4 space-y-4">
                          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-3 shadow-md">
                            <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest font-black">
                              Nodes Select Hierarchy
                            </span>
                            <div className="space-y-2">
                              {[
                                { id: 1 as const, title: "ESP32 Node 1: Sensor Gateway", desc: "Reads temperature/humidity (DHT11), motion (PIR debounced), and light (LDR auto-calibrating min/max)." },
                                { id: 2 as const, title: "ESP32 Node 2: Actuative display", desc: "Displays FSM states and optimal escape directions on LCD 16x2; routes LED alarm arrays & PWM buzzer output." },
                                { id: 3 as const, title: "ESP32 Node 3: Master Compiler", desc: "Resolves 6-tuple FSM transitions, logical minimization gate, Dijkstra exit routing, BFS/DFS, Max-Heaps, & Secure ThingSpeak REST SSL uploads." }
                              ].map((node) => (
                                <button
                                  key={node.id}
                                  onClick={() => {
                                    setActiveFirmwareNode(node.id);
                                    setCopiedCode(false);
                                  }}
                                  className={`w-full text-left p-4 rounded-xl border transition-all duration-200 cursor-pointer ${
                                    activeFirmwareNode === node.id
                                      ? "bg-indigo-600/10 border-indigo-500/40 text-white"
                                      : "bg-slate-950/60 border-slate-850 hover:border-slate-800 text-slate-400 hover:bg-slate-900/10"
                                  }`}
                                >
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="w-2.5 h-2.5 rounded-full bg-indigo-400" />
                                    <h4 className="text-xs font-bold leading-none">{node.title}</h4>
                                  </div>
                                  <p className="text-[10.5px] leading-relaxed text-slate-450 mt-1.5 font-sans">
                                    {node.desc}
                                  </p>
                                </button>
                              ))}
                            </div>
                          </div>

                          <div className="p-4 bg-slate-900/30 border border-slate-800/80 rounded-xl font-sans">
                            <span className="text-xs font-semibold text-slate-300 block uppercase mb-1">
                              Compilation Guide
                            </span>
                            <p className="text-[11px] leading-relaxed text-slate-400">
                              These codes correspond to complete C++ sketch source files compile-able in Arduino IDE 2.x. Be sure to install the following dependencies via sketch libraries manager:
                            </p>
                            <ul className="text-[10px] font-mono text-indigo-300 mt-2 list-disc list-inside space-y-0.5">
                              <li>DHT sensor library</li>
                              <li>PubSubClient</li>
                              <li>LiquidCrystal_I2C</li>
                            </ul>
                          </div>
                        </div>

                        {/* RIGHT DISPLAY PANEL (8/12 SPAN) */}
                        <div className="col-span-1 lg:col-span-8 flex flex-col h-full min-h-[460px]">
                          <div className="bg-slate-900 border border-slate-800 rounded-2xl flex-1 flex flex-col overflow-hidden">
                            <div className="flex items-center justify-between border-b border-slate-850 px-5 py-3 bg-slate-950/30 whitespace-nowrap">
                              <span className="font-mono text-xs text-indigo-400 font-bold flex items-center gap-1.5">
                                <Terminal className="w-4 h-4" /> Node{activeFirmwareNode}_Firmware.ino
                              </span>
                              <button
                                onClick={() => {
                                  let codeToCopy = ESP32_NODE1_CODE;
                                  if (activeFirmwareNode === 2) codeToCopy = ESP32_NODE2_CODE;
                                  else if (activeFirmwareNode === 3) codeToCopy = ESP32_NODE3_CODE;
                                  
                                  navigator.clipboard.writeText(codeToCopy);
                                  setCopiedCode(true);
                                }}
                                className="text-[11px] font-medium bg-slate-800 hover:bg-slate-705 text-slate-200 border border-slate-700 p-1.5 px-3.5 rounded-lg flex items-center gap-1 transition cursor-pointer"
                              >
                                {copiedCode ? (
                                  <>
                                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                                    <span>Copied!</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-3.5 h-3.5" />
                                    <span>Copy Source Code</span>
                                  </>
                                )}
                              </button>
                            </div>

                            <div className="p-4 bg-slate-950/90 flex-1 overflow-auto max-h-[500px]">
                              <pre className="font-mono text-[10.5px] text-slate-300 leading-relaxed max-w-none text-left select-text whitespace-pre">
                                {activeFirmwareNode === 1 
                                  ? ESP32_NODE1_CODE 
                                  : activeFirmwareNode === 2 
                                    ? ESP32_NODE2_CODE 
                                    : ESP32_NODE3_CODE}
                              </pre>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                /* ================= BRING IN ORIGINAL DIRECTORY STUDY MANAGER ================= */
                <>
                  {/* SIDE PANEL: DIRECTORY EXPLORER */}
                  <aside className="w-80 md:w-96 bg-slate-900/40 border-r border-slate-800 flex flex-col shrink-0 overflow-hidden">
                {/* SEARCH AND FOLDER LOADS */}
                <div className="p-4 bg-slate-900/30 border-b border-slate-800 space-y-4">
                  {/* Shortcut Button */}
                  <div>
                    <button
                      onClick={() =>
                        setFolderStack([{ id: DEFAULT_FOLDER_ID, name: DEFAULT_FOLDER_NAME }])
                      }
                      className="w-full flex items-center justify-between px-3 py-2.5 bg-indigo-600/10 hover:bg-indigo-600/15 border border-indigo-500/20 hover:border-indigo-500/30 text-indigo-300 rounded-xl text-left text-xs font-medium transition cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <Folder className="w-4 h-4 fill-indigo-400" />
                        <span>🏫 Preload Course Shared Folder</span>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Folder Link Text Entry */}
                  <form onSubmit={handleSearchFolderSubmit} className="space-y-2">
                    <label className="text-[10px] font-mono font-semibold tracking-wider text-slate-400 uppercase">
                      Load Drive Folder Link or ID
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Paste folder link here..."
                        value={inputFolderId}
                        onChange={(e) => setInputFolderId(e.target.value)}
                        className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
                      />
                      <button
                        type="submit"
                        className="bg-slate-800 hover:bg-slate-700 text-white rounded-xl px-3.5 transition text-xs font-medium cursor-pointer"
                      >
                        Load
                      </button>
                    </div>
                  </form>
                </div>

                {/* BREADCRUMBS BARS */}
                <div className="px-4 py-2 bg-slate-950/60 border-b border-slate-800 flex items-center gap-1.5 overflow-x-auto whitespace-nowrap text-xs text-slate-400 select-none">
                  <FolderOpen className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                  {folderStack.map((item, index) => (
                    <React.Fragment key={item.id}>
                      {index > 0 && <ChevronRight className="w-3 h-3 text-slate-600 shrink-0" />}
                      <button
                        onClick={() => handleBreadcrumbClick(index)}
                        className={`hover:text-indigo-400 transition truncate max-w-[110px] font-medium cursor-pointer ${
                          index === folderStack.length - 1 ? "text-white font-semibold" : ""
                        }`}
                      >
                        {item.name}
                      </button>
                    </React.Fragment>
                  ))}
                </div>

                {/* EXPLORER SEA ARCH */}
                <div className="p-3 bg-slate-900/10 border-b border-slate-800">
                  <div className="relative">
                    <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-500" />
                    <input
                      type="text"
                      placeholder="Search folder files..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
                    />
                  </div>
                </div>

                {/* FILES MANAGER CONTAINER */}
                <div className="flex-1 overflow-y-auto p-3">
                  {loadingFiles ? (
                    <div className="flex flex-col items-center justify-center p-8 space-y-3.5">
                      <RefreshCw className="w-6 h-6 text-indigo-500 animate-spin" />
                      <p className="text-slate-400 text-xs font-medium tracking-wide">Syncing directories...</p>
                    </div>
                  ) : explorerError ? (
                    <div className="text-center p-6 bg-rose-500/5 border border-rose-500/10 rounded-xl">
                      <AlertCircle className="w-6 h-6 text-rose-400 mx-auto mb-2" />
                      <p className="text-slate-300 text-xs leading-relaxed font-semibold mb-1">
                        Access Restricted
                      </p>
                      <p className="text-slate-400 text-[10px] leading-relaxed mb-3">{explorerError}</p>
                      <button
                        onClick={() => fetchFolderContents(currentFolder.id)}
                        className="text-xs text-indigo-400 font-medium hover:underline flex items-center gap-1 mx-auto"
                      >
                        <RefreshCw className="w-3 h-3" /> Retry Sync
                      </button>
                    </div>
                  ) : filteredFiles.length === 0 ? (
                    <div className="text-center p-8 border border-dashed border-slate-850 rounded-xl">
                      <Folder className="w-6 h-6 text-slate-600 mx-auto mb-2" />
                      <p className="text-slate-400 text-xs font-semibold">No elements detected</p>
                      <p className="text-slate-500 text-[10px] mt-0.5">This directory tree is empty.</p>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {filteredFiles.map((file) => {
                        const isSelected = selectedFile?.id === file.id;
                        return (
                          <button
                            key={file.id}
                            onClick={() => handleFileClick(file)}
                            className={`w-full flex items-center justify-between text-left p-3 rounded-xl border transition duration-150 cursor-pointer ${
                              isSelected
                                ? "bg-indigo-600/15 border-indigo-500/35 shadow-sm text-white"
                                : "bg-transparent hover:bg-slate-900/50 border-transparent hover:border-slate-800 text-slate-300"
                            }`}
                          >
                            <div className="flex items-center gap-3 overflow-hidden">
                              <div className="shrink-0">{getFileIcon(file.mimeType)}</div>
                              <div className="overflow-hidden">
                                <p className="text-xs font-semibold truncate leading-none text-slate-200 group-hover:text-white">
                                  {file.name}
                                </p>
                                <span className="font-mono text-[9px] text-slate-500 flex items-center gap-1.5 mt-1.5 uppercase leading-none">
                                  {file.size
                                    ? `${(parseInt(file.size) / 1024).toFixed(0)} KB`
                                    : "Folder / Native"}
                                  {file.modifiedTime && (
                                    <>
                                      <span className="w-1 h-1 bg-slate-700 rounded-full" />
                                      <span>
                                        {new Date(file.modifiedTime).toLocaleDateString(undefined, {
                                          month: "short",
                                          day: "numeric",
                                        })}
                                      </span>
                                    </>
                                  )}
                                </span>
                              </div>
                            </div>
                            <ChevronRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-600 shrink-0 ml-1.5" />
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </aside>

              {/* STUDY CORE WORKSPACE */}
              <main className="flex-1 bg-slate-950 flex flex-col overflow-hidden">
                <AnimatePresence mode="wait">
                  {!selectedFile ? (
                    /* Initial No Select State Display */
                    <motion.div
                      key="no-selection"
                      initial={{ opacity: 0, scale: 0.98 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0 }}
                      className="flex-1 flex flex-col items-center justify-center p-8 text-center"
                    >
                      <div className="p-4 bg-slate-905 border border-slate-800 rounded-2xl text-indigo-400 mb-4 animate-bounce">
                        <BookOpen className="w-8 h-8" />
                      </div>
                      <h2 className="text-xl font-bold tracking-tight text-white mb-1.5">No Material Loaded</h2>
                      <p className="text-slate-400 text-xs max-w-sm leading-relaxed mb-6">
                        Select any Google Doc, spreadsheet, PDF notes, or checklist from the explorer catalog panel on the left to start your study companion session.
                      </p>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl">
                        <div className="p-4 rounded-xl bg-slate-900/30 border border-slate-800 text-left">
                          <span className="text-indigo-400 text-xs font-bold flex items-center gap-1.5 mb-1">
                            <Sparkles className="w-3.5 h-3.5" /> Study Summaries
                          </span>
                          <p className="text-[11px] text-slate-400 leading-relaxed">
                            Convert bulk documents into concise outlines complete with academic equations and strategic points.
                          </p>
                        </div>
                        <div className="p-4 rounded-xl bg-slate-900/30 border border-slate-800 text-left">
                          <span className="text-indigo-400 text-xs font-bold flex items-center gap-1.5 mb-1">
                            <MessageSquare className="w-3.5 h-3.5" /> Grounded Q&A Chat
                          </span>
                          <p className="text-[11px] text-slate-400 leading-relaxed">
                            Interactively query text materials, test your hypothesis, or obtain easy definitions of dense texts.
                          </p>
                        </div>
                      </div>
                    </motion.div>
                  ) : (
                    /* Active Workspace Panel */
                    <motion.div
                      key="workspace"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="flex-1 flex flex-col overflow-hidden"
                    >
                      {/* Active File Header */}
                      <div className="px-6 py-4.5 bg-slate-900/35 border-b border-slate-800 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2.5 bg-slate-850 rounded-xl shrink-0">
                            {getFileIcon(selectedFile.mimeType)}
                          </div>
                          <div className="overflow-hidden">
                            <h2 className="text-sm font-bold text-slate-100 truncate pr-4">
                              {selectedFile.name}
                            </h2>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wide bg-slate-850 px-1.5 py-0.5 rounded-md border border-slate-800">
                                {selectedFile.mimeType.split("/")[1] || "text"}
                              </span>
                              {selectedFile.webViewLink && (
                                <a
                                  href={selectedFile.webViewLink}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[10px] text-indigo-400 flex items-center gap-1 font-medium hover:underline"
                                >
                                  Open original Drive <ExternalLink className="w-2.5 h-2.5" />
                                </a>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* WORKSPACE MODE TABS SELECTOR */}
                        <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-850 gap-1 overflow-x-auto">
                          {(["summary", "chat", "quiz", "flashcards"] as const).map((tab) => {
                            const isTabActive = workspaceTab === tab;
                            return (
                              <button
                                key={tab}
                                onClick={() => setWorkspaceTab(tab)}
                                className={`flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-lg transition shrink-0 cursor-pointer ${
                                  isTabActive
                                    ? "bg-indigo-600 text-white shadow-sm"
                                    : "text-slate-400 hover:text-slate-200"
                                }`}
                              >
                                {tab === "summary" && <FileCheck className="w-3.5 h-3.5" />}
                                {tab === "chat" && <MessageSquare className="w-3.5 h-3.5" />}
                                {tab === "quiz" && <HelpCircle className="w-3.5 h-3.5" />}
                                {tab === "flashcards" && <Layers className="w-3.5 h-3.5" />}
                                <span className="capitalize">{tab}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* AREA: ACTIVE WORK BENCH */}
                      <div className="flex-1 overflow-y-auto bg-slate-950 relative">
                        {extractingContent ? (
                          /* Loading state: downloading the document data */
                          <div className="absolute inset-0 flex flex-col items-center justify-center p-8 bg-slate-950/90 z-20">
                            <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin mb-4" />
                            <h3 className="text-white text-sm font-semibold mb-1">Downloading file context</h3>
                            <p className="text-slate-400 text-xs">
                              Retrieving and exporting course material bytes securely from Google Drive...
                            </p>
                          </div>
                        ) : extractionError ? (
                          /* Extraction Failure Interface */
                          <div className="p-8 max-w-lg mx-auto text-center mt-12 bg-slate-900/50 border border-slate-800 rounded-2xl">
                            <AlertCircle className="w-8 h-8 text-rose-500 mx-auto mb-3" />
                            <h3 className="text-white text-sm font-semibold mb-1.5">Unsupported File Content</h3>
                            <p className="text-slate-400 text-xs leading-relaxed mb-6">
                              {extractionError}
                            </p>
                            {selectedFile.webViewLink && (
                              <a
                                href={selectedFile.webViewLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-sm text-slate-100 font-semibold py-2 px-4 rounded-xl transition cursor-pointer"
                              >
                                View Material on Web <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            )}
                          </div>
                        ) : (
                          /* Tab panels containing Gemini generators */
                          <div className="p-6 h-full">
                            {/* TAB PANEL 1: AI SUMMARY & GUIDE */}
                            {workspaceTab === "summary" && (
                              <div className="max-w-3xl mx-auto h-full flex flex-col">
                                {!aiCache[selectedFile.id]?.summary ? (
                                  <div className="my-auto flex flex-col items-center justify-center text-center py-12">
                                    <div className="p-3.5 bg-indigo-500/10 rounded-full border border-indigo-500/20 text-indigo-400 mb-4 scale-105">
                                      <Sparkles className="w-7 h-7" />
                                    </div>
                                    <h3 className="text-base font-bold text-white mb-1.5">AI Summary Study Outliner</h3>
                                    <p className="text-slate-400 text-xs max-w-sm leading-relaxed mb-6">
                                      Generate structured lecture summaries, lists of technical definitions, key academic equations, and core takeaways instantly.
                                    </p>

                                    <button
                                      onClick={generateStudyGuide}
                                      disabled={generatingSummary}
                                      className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-505 text-white font-semibold px-5 py-2.5 rounded-xl text-xs sm:text-sm transition duration-150 shadow-md cursor-pointer disabled:opacity-50"
                                    >
                                      {generatingSummary ? (
                                        <>
                                          <RefreshCw className="w-4 h-4 animate-spin" />
                                          <span>Distilling text...</span>
                                        </>
                                      ) : (
                                        <>
                                          <Sparkles className="w-4 h-4" />
                                          <span>Generate AI Study Guide</span>
                                        </>
                                      )}
                                    </button>

                                    {generatingSummary && (
                                      <motion.p
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        className="text-slate-500 text-[11px] font-mono mt-4 flex items-center gap-1.5"
                                      >
                                        <Clock className="w-3.5 h-3.5 animate-pulse text-indigo-400" />
                                        <span>distilling concepts, formulas, equations and definitions...</span>
                                      </motion.p>
                                    )}

                                    {summaryResponseError && (
                                      <p className="text-rose-400 text-xs mt-4 bg-rose-500/5 px-4 py-2 border border-rose-500/10 rounded-xl">
                                        {summaryResponseError}
                                      </p>
                                    )}
                                  </div>
                                ) : (
                                  <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className="flex flex-col h-full space-y-4"
                                  >
                                    <div className="flex items-center justify-between border-b border-slate-850 pb-3">
                                      <div className="flex items-center gap-2 text-indigo-400">
                                        <FileCheck className="w-4 h-4" />
                                        <span className="text-xs font-semibold tracking-wide uppercase">
                                          Academic Study Guide
                                        </span>
                                      </div>

                                      <div className="flex items-center gap-2">
                                        <button
                                          onClick={copySummaryToClipboard}
                                          className="text-slate-400 hover:text-white bg-slate-900 border border-slate-800 p-2 rounded-xl text-[11px] font-medium flex items-center gap-1.5 transition cursor-pointer"
                                        >
                                          {copiedSummary ? (
                                            <>
                                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                                              <span>Copied!</span>
                                            </>
                                          ) : (
                                            <>
                                              <Copy className="w-3.5 h-3.5" />
                                              <span>Copy Markdown</span>
                                            </>
                                          )}
                                        </button>

                                        <button
                                          onClick={generateStudyGuide}
                                          className="text-slate-400 hover:text-white bg-slate-900 border border-slate-800 p-2 rounded-xl text-[11px] font-medium flex items-center gap-1.5 transition cursor-pointer"
                                          title="Regenerate Outliner"
                                        >
                                          <RefreshCw className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
                                    </div>

                                    <div className="bg-slate-900/30 border border-slate-800/80 rounded-2xl p-6.5 overflow-y-auto prose prose-invert prose-indigo prose-sm text-slate-300 leading-relaxed max-w-none text-left select-text markdown-body">
                                      <Markdown>{aiCache[selectedFile.id]?.summary}</Markdown>
                                    </div>
                                  </motion.div>
                                )}
                              </div>
                            )}

                            {/* TAB PANEL 2: INTERACTIVE GROUNDED TUTOR CHAT */}
                            {workspaceTab === "chat" && (
                              <div className="max-w-3xl mx-auto h-full flex flex-col">
                                <div className="border-b border-slate-850 pb-3 flex items-center justify-between">
                                  <div className="flex items-center gap-2 text-indigo-400">
                                    <MessageSquare className="w-4 h-4" />
                                    <span className="text-xs font-semibold tracking-wide uppercase">
                                      Grounded Q&A Learning Buddy
                                    </span>
                                  </div>
                                  <button
                                    onClick={() =>
                                      setAiCache((prev) => ({
                                        ...prev,
                                        [selectedFile.id]: {
                                          ...prev[selectedFile.id],
                                          chatMessages: [],
                                        },
                                      }))
                                    }
                                    className="text-[10px] text-slate-500 hover:text-slate-300 transition uppercase tracking-wide font-mono"
                                  >
                                    Reset Chat File Thread
                                  </button>
                                </div>

                                {/* Messages Viewport */}
                                <div className="flex-1 overflow-y-auto py-4 space-y-4 min-h-[250px] max-h-[500px]">
                                  {(!aiCache[selectedFile.id]?.chatMessages ||
                                    aiCache[selectedFile.id]?.chatMessages?.length === 0) && (
                                    <div className="text-center py-12 text-slate-500">
                                      <div className="w-12 h-12 rounded-full border border-slate-800 flex items-center justify-center mx-auto mb-3 text-slate-400">
                                        <MessageSquare className="w-5 h-5" />
                                      </div>
                                      <p className="text-xs font-semibold text-slate-350">
                                        Ask me anything related to this file
                                      </p>
                                      <p className="text-[11px] leading-relaxed max-w-sm mx-auto mt-1">
                                        Request details, ask me to explain a particular segment, or construct homework definitions instantly.
                                      </p>

                                      {/* Starter Prompts */}
                                      <div className="mt-6 grid grid-cols-1 gap-2 max-w-md mx-auto">
                                        {[
                                          "Provide a simple summary of the principal topic.",
                                          "What are the top key concepts and terms?",
                                          "Create a 3-point study checklist from this text.",
                                        ].map((p, pIdx) => (
                                          <button
                                            key={pIdx}
                                            onClick={() => {
                                              setChatInput(p);
                                            }}
                                            className="text-left py-2 px-3 bg-slate-900 hover:bg-slate-850 border border-slate-800 rounded-xl text-[11px] text-indigo-400 font-medium transition cursor-pointer"
                                          >
                                            {p}
                                          </button>
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                  {aiCache[selectedFile.id]?.chatMessages?.map((msg) => {
                                    const isUser = msg.role === "user";
                                    return (
                                      <div
                                        key={msg.id}
                                        className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}
                                      >
                                        <div
                                          className={`max-w-[85%] rounded-2xl p-4.5 text-xs text-left leading-relaxed ${
                                            isUser
                                              ? "bg-indigo-600 text-white rounded-br-none"
                                              : "bg-slate-900 border border-slate-800 text-slate-200 rounded-bl-none markdown-body prose prose-invert prose-xs"
                                          }`}
                                        >
                                          {isUser ? (
                                            msg.content
                                          ) : (
                                            <Markdown>{msg.content}</Markdown>
                                          )}
                                        </div>
                                        <span className="font-mono text-[9px] text-slate-500 mt-1.5 px-1 uppercase">
                                          {msg.role === "user" ? "You" : "Gemini Study Companion"} • {msg.timestamp}
                                        </span>
                                      </div>
                                    );
                                  })}

                                  {sendingChat && (
                                    <div className="flex flex-col items-start">
                                      <div className="bg-slate-900 border border-slate-850 rounded-2xl rounded-bl-none p-4 text-xs flex items-center gap-2.5 text-slate-400">
                                        <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-400" />
                                        <span>Buddy is examining context notes...</span>
                                      </div>
                                    </div>
                                  )}

                                  <div ref={chatBottomRef} />
                                </div>

                                {/* Chat input box */}
                                <form onSubmit={handleSendChatMessage} className="mt-auto pt-3">
                                  <div className="flex gap-2">
                                    <input
                                      type="text"
                                      placeholder="Ask question about material..."
                                      value={chatInput}
                                      onChange={(e) => setChatInput(e.target.value)}
                                      disabled={sendingChat}
                                      className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-medium transition"
                                    />
                                    <button
                                      type="submit"
                                      disabled={sendingChat || !chatInput.trim()}
                                      className="bg-indigo-600 hover:bg-indigo-505 disabled:opacity-50 text-white font-semibold rounded-xl px-5 transition text-xs flex items-center gap-1 cursor-pointer"
                                    >
                                      <span>Ask</span>
                                      <ArrowRight className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </form>
                              </div>
                            )}

                            {/* TAB PANEL 3: INTERACTIVE SELF-GRADING MCQS */}
                            {workspaceTab === "quiz" && (
                              <div className="max-w-2xl mx-auto h-full flex flex-col">
                                {!aiCache[selectedFile.id]?.quiz ? (
                                  <div className="my-auto flex flex-col items-center justify-center text-center py-12">
                                    <div className="p-3.5 bg-indigo-500/10 rounded-full border border-indigo-500/20 text-indigo-400 mb-4 scale-105">
                                      <HelpCircle className="w-7 h-7" />
                                    </div>
                                    <h3 className="text-base font-bold text-white mb-1.5">Interactive Concept Quiz</h3>
                                    <p className="text-slate-400 text-xs max-w-sm leading-relaxed mb-6">
                                      Compile a real-time multiple-choice questionnaire with exactly 5 conceptual questions tailored directly to your material. Get scored instantly!
                                    </p>

                                    <button
                                      onClick={generateQuiz}
                                      disabled={generatingQuiz}
                                      className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-505 text-white font-semibold px-5 py-2.5 rounded-xl text-xs sm:text-sm transition duration-150 shadow-md cursor-pointer disabled:opacity-50"
                                    >
                                      {generatingQuiz ? (
                                        <>
                                          <RefreshCw className="w-4 h-4 animate-spin" />
                                          <span>Writing questions...</span>
                                        </>
                                      ) : (
                                        <>
                                          <HelpCircle className="w-4 h-4" />
                                          <span>Generate Companion Quiz</span>
                                        </>
                                      )}
                                    </button>

                                    {quizError && (
                                      <p className="text-rose-400 text-xs mt-4 bg-rose-500/5 px-4 py-2 border border-rose-500/10 rounded-xl">
                                        {quizError}
                                      </p>
                                    )}
                                  </div>
                                ) : (
                                  /* Quiz Session Board */
                                  <div className="flex flex-1 flex-col h-full bg-slate-900/30 p-6 border border-slate-800 rounded-2xl">
                                    {!quizCompleted ? (
                                      /* Active Questions */
                                      <div className="space-y-6">
                                        {/* Status Header */}
                                        <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                                          <span className="font-mono text-[10px] text-indigo-400 tracking-wider uppercase">
                                            Question {currentQuestionIndex + 1} of{" "}
                                            {aiCache[selectedFile.id]?.quiz?.length}
                                          </span>
                                          <div className="flex items-center gap-1.5 bg-slate-850 px-2.5 py-1 rounded-lg border border-slate-800">
                                            <Flame className="w-3.5 h-3.5 text-orange-400 fill-orange-400 animate-pulse" />
                                            <span className="font-mono text-xs text-slate-300 font-semibold">
                                              Score: {score}
                                            </span>
                                          </div>
                                        </div>

                                        {/* Current quiz item info */}
                                        {aiCache[selectedFile.id]?.quiz?.[currentQuestionIndex] && (
                                          <div className="space-y-4">
                                            <h3 className="text-sm font-bold text-slate-100 leading-normal text-left">
                                              {aiCache[selectedFile.id].quiz![currentQuestionIndex].question}
                                            </h3>

                                            {/* MC Options lists */}
                                            <div className="space-y-2 mt-4">
                                              {aiCache[selectedFile.id].quiz![currentQuestionIndex].options.map(
                                                (option, optIdx) => {
                                                  const isThisAnswerSelected =
                                                    selectedAnswerIndex === optIdx;
                                                  const correctIdx =
                                                    aiCache[selectedFile.id].quiz![
                                                      currentQuestionIndex
                                                    ].correctAnswerIndex;
                                                  const isAnswerCorrect = optIdx === correctIdx;

                                                  let cardStyles = "border-slate-800 bg-slate-900 hover:bg-slate-850 text-slate-300";

                                                  if (selectedAnswerIndex !== null) {
                                                    if (isAnswerCorrect) {
                                                      cardStyles = "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
                                                    } else if (isThisAnswerSelected) {
                                                      cardStyles = "border-rose-500/30 bg-rose-500/10 text-rose-300";
                                                    } else {
                                                      cardStyles = "border-slate-800 bg-slate-900/30 text-slate-500 cursor-not-allowed";
                                                    }
                                                  }

                                                  return (
                                                    <button
                                                      key={optIdx}
                                                      disabled={selectedAnswerIndex !== null}
                                                      onClick={() =>
                                                        handleQuizAnswer(
                                                          optIdx,
                                                          correctIdx
                                                        )
                                                      }
                                                      className={`w-full flex items-start gap-3 p-3.5 border rounded-xl text-xs font-semibold text-left transition duration-150 cursor-pointer ${cardStyles}`}
                                                    >
                                                      <span className="font-mono text-[10px] text-indigo-400 bg-indigo-500/5 border border-indigo-500/10 rounded px-1.5 py-0.5 mt-0.5 uppercase">
                                                        {String.fromCharCode(65 + optIdx)}
                                                      </span>
                                                      <span className="flex-1 mt-0.5">{option}</span>
                                                    </button>
                                                  );
                                                }
                                              )}
                                            </div>

                                            {/* Option explanations */}
                                            {selectedAnswerIndex !== null && (
                                              <motion.div
                                                initial={{ opacity: 0, y: 5 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                className="mt-6 p-4 bg-slate-950/60 border border-slate-855 rounded-xl text-left"
                                              >
                                                <div className="flex items-center gap-2 mb-2">
                                                  <FileCheck className="w-4 h-4 text-emerald-400" />
                                                  <span className="text-[10px] font-mono uppercase text-slate-400 tracking-wider font-semibold">
                                                    Concepts Explanation
                                                  </span>
                                                </div>
                                                <p className="text-slate-300 text-xs leading-relaxed">
                                                  {
                                                    aiCache[selectedFile.id].quiz![
                                                      currentQuestionIndex
                                                    ].explanation
                                                  }
                                                </p>

                                                <button
                                                  onClick={() =>
                                                    handleNextQuizQuestion(
                                                      aiCache[selectedFile.id].quiz!.length
                                                    )
                                                  }
                                                  className="mt-4 flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-505 text-white font-semibold py-2 px-4 rounded-lg text-xs ml-auto transition cursor-pointer"
                                                >
                                                  <span>
                                                    {currentQuestionIndex + 1 ===
                                                    aiCache[selectedFile.id].quiz?.length
                                                      ? "Complete Quiz"
                                                      : "Next Question"}
                                                  </span>
                                                  <ChevronRight className="w-4 h-4" />
                                                </button>
                                              </motion.div>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    ) : (
                                      /* Quiz Completed Final Frame */
                                      <div className="py-8 text-center space-y-6">
                                        <div className="w-16 h-16 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center mx-auto">
                                          <GraduationCap className="w-8 h-8" />
                                        </div>

                                        <div>
                                          <h3 className="text-base font-bold text-white mb-1.5">
                                            Test Session Wrapped!
                                          </h3>
                                          <p className="text-slate-400 text-xs leading-relaxed">
                                            Excellent job pacing through the conceptual materials. Here is your evaluation.
                                          </p>
                                        </div>

                                        <div className="inline-block bg-slate-950/50 px-6 py-4 rounded-2xl border border-slate-800">
                                          <span className="block font-mono text-[9px] text-indigo-450 uppercase font-semibold">
                                            Quiz Score Output
                                          </span>
                                          <span className="text-3xl font-extrabold tracking-tight text-white block mt-1.5">
                                            {((score / aiCache[selectedFile.id].quiz!.length) * 100).toFixed(0)}%
                                          </span>
                                          <span className="text-slate-400 text-xs block mt-1">
                                            ({score} correct out of{" "}
                                            {aiCache[selectedFile.id].quiz!.length} questions)
                                          </span>
                                        </div>

                                        <div className="flex gap-3 justify-center">
                                          <button
                                            onClick={generateQuiz}
                                            className="text-white bg-indigo-600 hover:bg-indigo-510 font-semibold py-2 px-4 rounded-xl text-xs transition cursor-pointer"
                                          >
                                            Restart New Quiz
                                          </button>
                                          <button
                                            onClick={() => {
                                              setAiCache((prev) => ({
                                                ...prev,
                                                [selectedFile.id]: {
                                                  ...prev[selectedFile.id],
                                                  quiz: undefined,
                                                },
                                              }));
                                            }}
                                            className="text-slate-400 hover:text-white bg-slate-900 border border-slate-800 py-2 px-4 rounded-xl text-xs font-semibold transition cursor-pointer"
                                          >
                                            Dismiss Board
                                          </button>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}

                            {/* TAB PANEL 4: STRUCTURAL DRILL STACK FLASHCARDS */}
                            {workspaceTab === "flashcards" && (
                              <div className="max-w-2xl mx-auto h-full flex flex-col">
                                {!aiCache[selectedFile.id]?.flashcards ? (
                                  <div className="my-auto flex flex-col items-center justify-center text-center py-12">
                                    <div className="p-3.5 bg-indigo-500/10 rounded-full border border-indigo-500/20 text-indigo-400 mb-4 scale-105">
                                      <Layers className="w-7 h-7" />
                                    </div>
                                    <h3 className="text-base font-bold text-white mb-1.5">Digital Active Study Cards</h3>
                                    <p className="text-slate-400 text-xs max-w-sm leading-relaxed mb-6">
                                      Generate exactly 8 conceptual flashcards mapping vital terminal definitions, equations, or scientific variables from your Drive files.
                                    </p>

                                    <button
                                      onClick={generateFlashcards}
                                      disabled={generatingFlashcards}
                                      className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-510 text-white font-semibold px-5 py-2.5 rounded-xl transition shadow-md cursor-pointer text-xs sm:text-sm disabled:opacity-50"
                                    >
                                      {generatingFlashcards ? (
                                        <>
                                          <RefreshCw className="w-4 h-4 animate-spin" />
                                          <span>Compiling deck...</span>
                                        </>
                                      ) : (
                                        <>
                                          <Layers className="w-4 h-4" />
                                          <span>Compile Memory Cards</span>
                                        </>
                                      )}
                                    </button>

                                    {flashcardError && (
                                      <p className="text-rose-400 text-xs mt-4 bg-rose-500/5 px-4 py-2 border border-rose-500/10 rounded-xl">
                                        {flashcardError}
                                      </p>
                                    )}
                                  </div>
                                ) : (
                                  /* Active Flip Card Deck viewport */
                                  <div className="space-y-6">
                                    <div className="flex justify-between items-center">
                                      <span className="font-mono text-[10px] text-indigo-400 tracking-wider uppercase font-semibold">
                                        Card {currentCardIndex + 1} of{" "}
                                        {aiCache[selectedFile.id].flashcards!.length}
                                      </span>

                                      <button
                                        onClick={generateFlashcards}
                                        className="text-[10px] text-slate-500 hover:text-slate-300 transition uppercase tracking-wide font-mono flex items-center gap-1 cursor-pointer"
                                      >
                                        <RefreshCw className="w-3 h-3" /> Recompile Deck
                                      </button>
                                    </div>

                                    {/* 3D Flip Card Widget */}
                                    <div
                                      onClick={() => setIsCardFlipped(!isCardFlipped)}
                                      className="relative aspect-video w-full rounded-2xl cursor-pointer select-none border border-slate-800 bg-slate-900 flex flex-col justify-between p-8 text-center"
                                      style={{ perspective: "1000px" }}
                                    >
                                      <AnimatePresence mode="wait">
                                        {!isCardFlipped ? (
                                          /* Front view */
                                          <motion.div
                                            key="front"
                                            initial={{ rotateY: 90, opacity: 0 }}
                                            animate={{ rotateY: 0, opacity: 1 }}
                                            exit={{ rotateY: -90, opacity: 0 }}
                                            transition={{ duration: 0.2 }}
                                            className="flex-1 flex flex-col items-center justify-center space-y-2 mt-4"
                                          >
                                            <span className="font-mono text-[9px] text-indigo-450 tracking-widest uppercase bg-indigo-500/5 border border-indigo-500/10 rounded px-1.5 py-0.5 mb-1.5">
                                              Term / Question Front
                                            </span>
                                            <h3 className="text-base sm:text-lg font-extrabold tracking-tight text-white leading-normal max-w-lg">
                                              {
                                                aiCache[selectedFile.id].flashcards![
                                                  currentCardIndex
                                                ].front
                                              }
                                            </h3>
                                          </motion.div>
                                        ) : (
                                          /* Back View */
                                          <motion.div
                                            key="back"
                                            initial={{ rotateY: -90, opacity: 0 }}
                                            animate={{ rotateY: 0, opacity: 1 }}
                                            exit={{ rotateY: 90, opacity: 0 }}
                                            transition={{ duration: 0.2 }}
                                            className="flex-1 flex flex-col items-center justify-center space-y-2 mt-4"
                                          >
                                            <span className="font-mono text-[9px] text-emerald-400 tracking-widest uppercase bg-emerald-500/5 border border-emerald-500/10 rounded px-1.5 py-0.5 mb-1.5">
                                              AI Explanation Back
                                            </span>
                                            <p className="text-slate-200 text-xs sm:text-sm leading-relaxed max-w-md">
                                              {
                                                aiCache[selectedFile.id].flashcards![
                                                  currentCardIndex
                                                ].back
                                              }
                                            </p>
                                          </motion.div>
                                        )}
                                      </AnimatePresence>

                                      <div className="text-[10px] text-slate-500 font-medium tracking-wide uppercase mt-4">
                                        (Click anywhere on card to flip and reveal details)
                                      </div>
                                    </div>

                                    {/* Deck navigation controllers */}
                                    <div className="flex justify-between items-center max-w-xs mx-auto pt-2">
                                      <button
                                        disabled={currentCardIndex === 0}
                                        onClick={() => {
                                          setIsCardFlipped(false);
                                          setCurrentCardIndex((prev) => Math.max(0, prev - 1));
                                        }}
                                        className="p-3 border border-slate-800 hover:border-slate-700 bg-slate-900 disabled:opacity-40 rounded-xl text-slate-200 transition cursor-pointer"
                                      >
                                        <ChevronLeft className="w-5 h-5" />
                                      </button>

                                      <span className="font-mono text-xs text-slate-400 font-semibold select-none">
                                        Card {currentCardIndex + 1} /{" "}
                                        {aiCache[selectedFile.id].flashcards!.length}
                                      </span>

                                      <button
                                        disabled={
                                          currentCardIndex + 1 ===
                                          aiCache[selectedFile.id].flashcards!.length
                                        }
                                        onClick={() => {
                                          setIsCardFlipped(false);
                                          setCurrentCardIndex((prev) =>
                                            Math.min(
                                              aiCache[selectedFile.id].flashcards!.length - 1,
                                              prev + 1
                                            )
                                          );
                                        }}
                                        className="p-3 border border-slate-800 hover:border-slate-700 bg-slate-900 disabled:opacity-40 rounded-xl text-slate-200 transition cursor-pointer"
                                      >
                                        <ChevronRight className="w-5 h-5" />
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </main>
            </>
          )}
        </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
