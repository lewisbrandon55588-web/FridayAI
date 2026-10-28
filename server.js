
require("dotenv").config();

const express = require("express");
const path = require("path");
const Groq = require("groq-sdk");

const app = express();
const PORT = 3000;

// Fish Audio configuration
const FISH_MODEL = "s2-pro";
const FRIDAY_VOICE_ID = "5bbd039a382c483fa5f6a1fed89d0b2c";

if (!process.env.GROQ_API_KEY) {
  console.error("ERROR: GROQ_API_KEY is missing from .env");
  process.exit(1);
}

if (!process.env.FISH_API_KEY) {
  console.error("WARNING: FISH_API_KEY is missing from .env");
}

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

// -------------------------------------
// FRIDAY AI CHAT
// -------------------------------------
app.post("/api/chat", async (req, res) => {
  try {
    const message = req.body?.message;

    if (typeof message !== "string" || !message.trim()) {
      return res.status(400).json({
        error: "Please enter a message.",
      });
    }

    const completion = await groq.chat.completions.create({
      model: "openai/gpt-oss-120b",
      messages: [
        {
          role: "system",
          content:
            "You are FRIDAY, a helpful personal AI assistant. " +
            "Give clear, natural, concise responses. " +
            "Your application can speak replies using a separate " +
            "text-to-speech service. Never claim that the application " +
            "cannot produce audio. Reply with the text to be spoken.",
        },
        {
          role: "user",
          content: message.trim(),
        },
      ],
      temperature: 0.7,
      max_completion_tokens: 1024,
    });

    const reply =
      completion.choices?.[0]?.message?.content?.trim();

    if (!reply) {
      return res.status(502).json({
        error: "FRIDAY received an empty AI response.",
      });
    }

    return res.json({ reply });
  } catch (error) {
    console.error(
      "Groq error:",
      error.status || "",
      error.message || error
    );

    return res.status(500).json({
      error: "FRIDAY could not get an AI response.",
      details: error.message || "Unknown AI error.",
    });
  }
});

// -------------------------------------
// FRIDAY VOICE — FISH AUDIO
// -------------------------------------
app.post("/api/speak", async (req, res) => {
  try {
    const apiKey = process.env.FISH_API_KEY;

    if (!apiKey) {
      return res.status(503).json({
        error: "Fish Audio API key is missing. Check your .env file.",
      });
    }

    const text = req.body?.text;

    if (typeof text !== "string" || !text.trim()) {
      return res.status(400).json({
        error: "No text was provided for speech.",
      });
    }

    if (text.length > 5000) {
      return res.status(400).json({
        error: "The text is too long for one voice request.",
      });
    }

    console.log("FRIDAY voice: requesting Fish Audio...");

    const response = await fetch("https://api.fish.audio/v1/tts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        model: FISH_MODEL,
      },
      body: JSON.stringify({
        text: text.trim(),
        reference_id: FRIDAY_VOICE_ID,
        format: "mp3",
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();

      // Log the service error, but never log the API key.
      console.error(
        `Fish Audio HTTP ${response.status}:`,
        errorBody.slice(0, 1500)
      );

      return res.status(502).json({
        error: "Fish Audio could not generate FRIDAY's voice.",
        details:
          `Fish Audio returned HTTP ${response.status}. ` +
          "Check the VS Code terminal for the service error.",
      });
    }

    const audioBuffer = Buffer.from(
      await response.arrayBuffer()
    );

    if (audioBuffer.length === 0) {
      console.error("Fish Audio returned an empty audio response.");

      return res.status(502).json({
        error: "Fish Audio returned an empty audio file.",
      });
    }

    console.log(
      `FRIDAY voice generated successfully (${audioBuffer.length} bytes).`
    );

    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Length", audioBuffer.length);
    res.setHeader("Cache-Control", "no-store");

    return res.send(audioBuffer);
  } catch (error) {
    console.error(
      "Fish Audio request failed:",
      error.message || error
    );

    return res.status(500).json({
      error: "FRIDAY could not connect to Fish Audio.",
      details: error.message || "Unknown voice error.",
    });
  }
});

// -------------------------------------
// START SERVER
// -------------------------------------
app.listen(PORT, () => {
  console.log("");
  console.log("==================================");
  console.log("       FRIDAY AI IS ONLINE");
  console.log("==================================");
  console.log(`Website: http://localhost:${PORT}`);
  console.log("AI engine: Groq");
  console.log(`Voice engine: Fish Audio (${FISH_MODEL})`);
  console.log("Voice profile: FRIDAY");
  console.log("Press Ctrl+C to stop the server.");
  console.log("==================================");
  console.log("");
});
