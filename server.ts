import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

// Initialize the Gemini API client using the environment key
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Set up middleware
  app.use(express.json({ limit: "15mb" }));

  // API Route: AI Summary & Study Guide Generator
  app.post("/api/study/summarize", async (req, res) => {
    try {
      const { fileName, fileContent } = req.body;

      if (!fileContent || fileContent.trim() === "") {
        return res.status(400).json({ error: "File content is required for producing a summary." });
      }

      const prompt = `You are a world-class university professor and structured academic coach.
Please read and analyze the provided text content from the file "${fileName || "Study Material"}".

Provide a comprehensive, high-quality study companion organized in very neat, readable Markdown with:
1. An "Executive Summary" section encapsulating the core topic in 2-3 sentences.
2. A "Core Concepts & Analysis" section containing detailed bulleted explanations of the most critical topics.
3. A "Formulas and Definitions" section (if applicable) highlighting key terminology, formal definitions, and scientific or mathematical equations. If none, write "Definitions" and extract key technical terms.
4. A "Strategic Takeaways" section with exactly 5 top conceptual highlights for review.

Avoid filler words. Keep the tone professional, scholarly, and extremely structured.

Document content:
${fileContent}`;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
      });

      res.json({ result: response.text || "No summary was generated." });
    } catch (error: any) {
      console.error("Summary error:", error);
      res.status(500).json({ error: error?.message || "Internal server error during summarization." });
    }
  });

  // API Route: Chat Q&A Endpoint
  app.post("/api/study/chat", async (req, res) => {
    try {
      const { fileName, fileContent, messages } = req.body;

      if (!fileContent) {
        return res.status(400).json({ error: "Context file content is required for interactive chat." });
      }

      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: "Messages list is required." });
      }

      // We inject the system instruction with document context to keep it perfectly grounded.
      const systemInstruction = `You are a brilliant, supportive, and formal academic tutor.
You are helping the student study the document named "${fileName || "Study Document"}".
Answer the user's questions based primarily on the provided source content:

${fileContent}

Guidelines:
- Reference specific sections of the document to support your answer when possible.
- If the answer cannot be found in the provided document, you should use your general academic knowledge but explicitly note: "Note: This is based on general background knowledge, as it's not explicitly detailed in the document."
- Use clean, beautifully formatted Markdown (lists, headers, bold text) to keep explanations structured.
- Keep responses engaging, and ask thought-provoking follow-up questions occasionally to deepen learning.`;

      // Map the interface messages to Google GenAI Content blocks
      const apiContents = messages.map((msg: any) => ({
        role: msg.role === "user" ? "user" : "model",
        parts: [{ text: msg.content }],
      }));

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: apiContents,
        config: {
          systemInstruction,
        },
      });

      res.json({ reply: response.text || "I was unable to process an answer. Can you rephrase?" });
    } catch (error: any) {
      console.error("Q&A Chat error:", error);
      res.status(500).json({ error: error?.message || "Internal server error during chat retrieval." });
    }
  });

  // API Route: Interactive Quiz Generator
  app.post("/api/study/quiz", async (req, res) => {
    try {
      const { fileName, fileContent } = req.body;

      if (!fileContent || fileContent.trim() === "") {
        return res.status(400).json({ error: "File content is required to construct a custom quiz." });
      }

      const prompt = `Read the following learning material from "${fileName || "Module Source"}".
Generate exactly 5 distinct multiple-choice questions (MCQs) that robustly test the reader's conceptual comprehension of the material. Include options, identify the correct answer 0-indexed position, and provide a clear, helpful scientific explanation for the answer.

Material Content:
${fileContent}`;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            description: "A list of exactly 5 multiple choice questions testing the material.",
            items: {
              type: Type.OBJECT,
              properties: {
                question: {
                  type: Type.STRING,
                  description: "The question statement being asked.",
                },
                options: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: "Exactly 4 multiple choice options. Keep options clear and plausible.",
                },
                correctAnswerIndex: {
                  type: Type.INTEGER,
                  description: "The 0-based index of the correct answer within the options list (from 0 to 3).",
                },
                explanation: {
                  type: Type.STRING,
                  description: "A detailed explanation of why this option is correct and why other options are incorrect based on the text.",
                },
              },
              required: ["question", "options", "correctAnswerIndex", "explanation"],
            },
          },
        },
      });

      const responseText = response.text?.trim() || "[]";
      let parsedQuiz = [];
      try {
        parsedQuiz = JSON.parse(responseText);
      } catch (parseErr) {
        console.error("Error parsing Gemini JSON Schema response:", responseText);
        throw new Error("Failed to generate robust structured JSON for the quiz.");
      }

      res.json({ quiz: parsedQuiz });
    } catch (error: any) {
      console.error("Quiz generation error:", error);
      res.status(500).json({ error: error?.message || "Internal server error during quiz creation." });
    }
  });

  // API Route: Digital Flashcards Generator
  app.post("/api/study/flashcards", async (req, res) => {
    try {
      const { fileName, fileContent } = req.body;

      if (!fileContent || fileContent.trim() === "") {
        return res.status(400).json({ error: "File content is required to compile study cards." });
      }

      const prompt = `Analyze the given textbook excerpts or slides from "${fileName || "Source Material"}".
Extract key technical terms, formulas, formulas variables, and critical concepts to construct exactly 8 study flashcards.
The 'front' of the card should contain the vocabulary term, formula name, or core query.
The 'back' of the card should contain a crisp definition, mathematical formulation, explanation, or critical description (limited to 2-3 concise sentences).

Document Content:
${fileContent}`;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            description: "Exactly 8 highly accurate study flashcards.",
            items: {
              type: Type.OBJECT,
              properties: {
                front: {
                  type: Type.STRING,
                  description: "The conceptual term, formula keyword, or question.",
                },
                back: {
                  type: Type.STRING,
                  description: "A concise, detailed, and clear definition or explanation of the front concept.",
                },
              },
              required: ["front", "back"],
            },
          },
        },
      });

      const responseText = response.text?.trim() || "[]";
      let parsedCards = [];
      try {
        parsedCards = JSON.parse(responseText);
      } catch (parseErr) {
        console.error("Error parsing cards JSON:", responseText);
        throw new Error("Failed to generate structured study flashcards.");
      }

      res.json({ flashcards: parsedCards });
    } catch (error: any) {
      console.error("Flashcards generation error:", error);
      res.status(500).json({ error: error?.message || "Internal server error compiling flashcards." });
    }
  });

  // Mount Vite middleware for asset serving
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // Start the server
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT} ready for workspace integration`);
  });
}

startServer();
