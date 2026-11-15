import "dotenv/config";
import express from "express";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, ThinkingLevel, Type } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);

function getAiClient(apiVersion: "v1beta" | "v1alpha" = "v1beta"): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY is not configured. Add it in Settings > Secrets."
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      apiVersion,
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

function isQuotaExceededError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes("RESOURCE_EXHAUSTED") ||
    msg.includes("429") ||
    msg.includes("Quota exceeded")
  );
}

function isDailyQuotaExhausted(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes("PerDay") ||
    msg.includes("GenerateRequestsPerDay") ||
    msg.includes("Quota exceeded for metric")
  );
}

async function withRetry<T>(
  fn: () => Promise<T>,
  attempts = 3,
  baseDelayMs = 700
): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (isDailyQuotaExhausted(err)) {
        throw err;
      }
      const msg = err instanceof Error ? err.message : String(err);
      const isTransient =
        msg.includes("503") ||
        msg.includes("429") ||
        msg.includes("UNAVAILABLE") ||
        msg.includes("RESOURCE_EXHAUSTED");
      if (!isTransient || i === attempts - 1) {
        throw err;
      }
      await new Promise((r) => setTimeout(r, baseDelayMs * Math.pow(2, i)));
    }
  }
  throw lastErr;
}

const ttsCooldownByKeyModel = new Map<string, number>();

function isTtsModelCoolingDown(apiKey: string, model: string): boolean {
  const until = ttsCooldownByKeyModel.get(`${apiKey}:${model}`) ?? 0;
  return Date.now() < until;
}

function markTtsModelDailyQuotaExhausted(apiKey: string, model: string): void {
  // Cool down for 10 minutes per key+model so we don't keep hitting an exhausted daily quota
  ttsCooldownByKeyModel.set(`${apiKey}:${model}`, Date.now() + 10 * 60 * 1000);
}

interface WhaleStoryRequestBody {
  imageBase64?: string;
  mimeType?: string;
  mirrorName?: string;
  mirrorTheme?: string;
  facePersona?: string;
  faceTraits?: string;
}

interface TtsRequestBody {
  text?: string;
  voiceName?: string;
  style?: string;
}

const BRITISH_AWKWARD_ANGLES = [
  "constantly apologising to deep-sea creatures for being in their way, like saying 'oh sorry, after you' to a passing giant squid",
  "complaining politely about the lack of a decent kettle and lukewarm kelp tea at two thousand metres below sea level",
  "treating lethal hydrothermal black smokers with intense British understatement, describing boiling toxic vents as 'a bit brisk' or 'slightly damp'",
  "observing whales forming an orderly queue at a cleaning station and getting quietly annoyed when a hagfish pushes in",
  "making painfully awkward small talk about the barometric pressure and ocean currents whenever a silence lasts more than three seconds",
  "oversharing an embarrassing personal anecdote about mistaking a barnacle-covered humpback flipper for a complimentary coat rack",
  "fretting endlessly over whether one should clap or merely nod politely after a forty-minute humpback whale aria",
  "describing an ancient bowhead whale like an intimidatingly posh retired neighbour from Surrey who still remembers 1840",
];

const UNIQUE_OCEAN_TWISTS = [
  "a secret underwater roundabout where migrating grey whales hesitate over who has right of way",
  "a particularly dramatic vampire squid that turns inside-out whenever someone tries to introduce themselves",
  "an unusually judgmental colony of sea cucumbers gossiping softly on the abyssal plain",
  "a sperm whale whose echolocation clicks sound suspiciously like someone clearing their throat before asking for the bill",
  "a sunken grand piano on a whale fall being tunelessly poked by blind abyssal grenadiers",
  "a nervous lanternfish that keeps accidentally dimming its own bioluminescence during important introductions",
  "two blue whales conducting a booming forty-hertz passive-aggressive argument across the North Atlantic",
  "a comb jelly shimmering like a disco ball at a funeral, making everyone deeply uncomfortable",
];

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: "12mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.post("/api/whale-story", async (req, res) => {
    try {
      const body = (req.body || {}) as WhaleStoryRequestBody;
      const imageBase64 = body.imageBase64 || "";
      const mimeType = body.mimeType || "image/jpeg";
      const mirrorName = body.mirrorName || "Abyssal Brass Mirror";
      const mirrorTheme =
        body.mirrorTheme ||
        "sperm whales diving into the midnight zone and bioluminescent trenches";
      const facePersona = body.facePersona || "an eccentric mirror twin";
      const faceTraits = body.faceTraits || "damp collar and quizzical eyebrows";

      if (!imageBase64) {
        res.status(400).json({ error: "Missing snapshot image data." });
        return;
      }

      const cleanBase64 = imageBase64.replace(/^data:[^;]+;base64,/, "");
      const ai = getAiClient();

      const uniqueSeed = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const awkwardAngleA = pickRandom(BRITISH_AWKWARD_ANGLES);
      const awkwardAngleB = pickRandom(
        BRITISH_AWKWARD_ANGLES.filter((a) => a !== awkwardAngleA)
      );
      const oceanTwist = pickRandom(UNIQUE_OCEAN_TWISTS);

      const promptText = [
        `Random story seed: ${uniqueSeed}. Never repeat previous openings or phrasing; invent a completely fresh narrative arc every single time.`,
        `You are the living, slightly flustered British reflection ("${facePersona}", sporting ${faceTraits}) standing inside the "${mirrorName}".`,
        `Look closely at the snapshot portrait image.`,
        `First, estimate the normalized UV coordinates (0.0 to 1.0 from top-left: x=0 left to 1 right, y=0 top to 1 bottom) of the center of the mouth in the image so the 3D mirror shader can animate it speaking.`,
        `Second, write a VERY LONG, wildly original, vivid, and terribly awkward British first-person monologue (~900 to 1,080 words across 4 substantial spoken chapters) about whales and deep ocean life.`,
        `Tone & Comedy Requirements:`,
        `- Blend genuine, poetic, scientifically accurate awe about deep-sea biology with painfully awkward, dry British humour, self-deprecating stumbles, polite over-apologising, and deadpan understatement.`,
        `- Weave in these two comedic quirks: (1) ${awkwardAngleA}, and (2) ${awkwardAngleB}.`,
        `- Include at least 4 distinct, cringingly awkward British jokes or social blunders mid-story (e.g., awkward throat-clearing, regretting a terrible whale pun immediately after saying it, overly polite British phrases like 'terribly sorry', 'right you are then', 'mustn't grumble', 'bit of a sticky wicket' applied to crushed bathyspheres or giant squid attacks).`,
        `- Start by awkwardly commenting on your own appearance in the snapshot portrait (${faceTraits}) and making a slightly botched greeting before launching into the tale.`,
        `- Anchor the story around ${mirrorTheme}, and feature this unique narrative twist: ${oceanTwist}.`,
        `- Journey through deep-sea wonders: blue whale basin songs, sperm whale echolocation duels in the midnight zone, humpback bubble-net etiquette, two-hundred-year-old bowhead whales under Arctic pack ice, bioluminescent siphonophores, hydrothermal vents, and a century-long whale fall.`,
        `Output exactly 4 rich chapters (~220 to 270 words each) in clean spoken prose—no markdown, no bullet points, no stage directions or bracketed sound effects.`,
      ].join(" ");

      const response = await withRetry(() =>
        ai.models.generateContent({
          model: "gemini-4-hydrogen",
          contents: {
            parts: [
              {
                inlineData: {
                  mimeType,
                  data: cleanBase64,
                },
              },
              { text: promptText },
            ],
          },
          config: {
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            systemInstruction:
              "You are an awkwardly polite, dryly funny British mirror reflection who happens to know an alarming amount about cetaceans and abyssal marine biology. Every story you tell must be completely original, ramble delightfully into awkward British jokes, and output strictly valid JSON matching the schema.",
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                title: {
                  type: Type.STRING,
                  description: "Poetic title for this whale and deep-ocean tale.",
                },
                mouthCenter: {
                  type: Type.OBJECT,
                  properties: {
                    x: {
                      type: Type.NUMBER,
                      description:
                        "Normalized horizontal mouth center (0.0 left to 1.0 right).",
                    },
                    y: {
                      type: Type.NUMBER,
                      description:
                        "Normalized vertical mouth center (0.0 top to 1.0 bottom).",
                    },
                  },
                  required: ["x", "y"],
                },
                chapters: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description:
                    "Exactly 4 rich spoken-prose chapters totaling ~950 words about whales and deep ocean life.",
                },
              },
              required: ["title", "mouthCenter", "chapters"],
            },
          },
        })
      );

      const rawText = (response.text || "").trim();
      if (!rawText) {
        throw new Error("Empty response from story model.");
      }

      const parsed = JSON.parse(rawText) as {
        title?: string;
        mouthCenter?: { x?: number; y?: number };
        chapters?: string[];
      };

      const mouthX =
        typeof parsed.mouthCenter?.x === "number"
          ? Math.min(0.85, Math.max(0.15, parsed.mouthCenter.x))
          : 0.5;
      const mouthY =
        typeof parsed.mouthCenter?.y === "number"
          ? Math.min(0.85, Math.max(0.2, parsed.mouthCenter.y))
          : 0.58;

      const chapters = Array.isArray(parsed.chapters)
        ? parsed.chapters.filter((c) => typeof c === "string" && c.trim().length > 0)
        : [];

      if (chapters.length === 0) {
        throw new Error("No spoken chapters returned.");
      }

      res.json({
        title: parsed.title || "Echoes Beneath the Abyssal Plain",
        mouthCenter: { x: mouthX, y: mouthY },
        chapters,
      });
    } catch (error) {
      const rawMessage =
        error instanceof Error ? error.message : "Failed to generate whale story.";
      console.error("[/api/whale-story] error:", error);
      if (isQuotaExceededError(error)) {
        res.status(429).json({
          error:
            "Gemini API quota exceeded for story generation. Check your plan or select a billing-enabled API key in Settings > Secrets.",
          code: "QUOTA_EXCEEDED",
        });
        return;
      }
      res.status(500).json({ error: rawMessage });
    }
  });

  app.post("/api/tts", async (req, res) => {
    try {
      const body = (req.body || {}) as TtsRequestBody;
      const text = (body.text || "").trim();
      const voiceName = body.voiceName || "Charon";
      const style =
        body.style ||
        "Calm, resonant, hypnotic deep-ocean storyteller with unhurried pacing";

      if (!text) {
        res.status(400).json({ error: "Missing text for speech generation." });
        return;
      }

      const validVoices = ["Puck", "Charon", "Kore", "Fenrir", "Zephyr"];
      const safeVoice = validVoices.includes(voiceName) ? voiceName : "Charon";

      const apiKey = process.env.GEMINI_API_KEY || "";
      const ai = getAiClient("v1beta");
      const ttsModels = [
        "gemini-3.8-flash-lite-tts",
        "gemini-3.8-flash-tts",
      ] as const;

      let base64Audio: string | undefined;
      let lastError: unknown = null;

      for (const model of ttsModels) {
        if (apiKey && isTtsModelCoolingDown(apiKey, model)) {
          continue;
        }
        try {
          const response = await withRetry(() =>
            ai.models.generateContent({
              model,
              contents: [
                {
                  role: "user",
                  parts: [
                    {
                      text,
                      speechMetadata: {
                        style,
                      },
                    },
                  ],
                },
              ],
              config: {
                responseModalities: ["AUDIO"],
                speechConfig: {
                  voiceConfig: {
                    prebuiltVoiceConfig: { voiceName: safeVoice },
                  },
                },
              },
            })
          );
          base64Audio =
            response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
          if (base64Audio) {
            break;
          }
        } catch (err) {
          lastError = err;
          if (apiKey && isDailyQuotaExhausted(err)) {
            markTtsModelDailyQuotaExhausted(apiKey, model);
          }
          if (!isQuotaExceededError(err)) {
            throw err;
          }
        }
      }

      if (!base64Audio) {
        if (lastError && isQuotaExceededError(lastError)) {
          res.status(429).json({
            error:
              "Gemini TTS free-tier daily quota reached. Continuing with browser voice — you can upgrade to a billing-enabled API key in Settings > Secrets.",
            code: "QUOTA_EXCEEDED",
          });
          return;
        }
        if (apiKey && ttsModels.every((m) => isTtsModelCoolingDown(apiKey, m))) {
          res.status(429).json({
            error:
              "Gemini TTS free-tier daily quota reached. Continuing with browser voice — you can upgrade to a billing-enabled API key in Settings > Secrets.",
            code: "QUOTA_EXCEEDED",
          });
          return;
        }
        throw lastError || new Error("TTS model returned no audio data.");
      }

      res.json({
        audioBase64: base64Audio,
        mimeType: "audio/wav",
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to generate speech.";
      console.error("[/api/tts] error:", error);
      if (isQuotaExceededError(error)) {
        res.status(429).json({
          error:
            "Gemini TTS free-tier daily quota reached. Continuing with browser voice — you can upgrade to a billing-enabled API key in Settings > Secrets.",
          code: "QUOTA_EXCEEDED",
        });
        return;
      }
      res.status(500).json({ error: message });
    }
  });

  const httpServer = http.createServer(app);

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr:
          process.env.DISABLE_HMR === "true" ? false : { server: httpServer },
        ws: { server: httpServer },
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, "dist");
    app.use(express.static(distDir));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distDir, "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Hall of Oceanic Mirrors server listening on port ${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Server failed to start:", err);
  process.exit(1);
});
