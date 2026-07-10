/**
 * ACARS explain streaming via Vercel AI SDK (`streamText` + Groq).
 *
 * Env (Convex dashboard / `npx convex env set`):
 *   GROQ_API_KEY         required
 *   ACARS_EXPLAIN_MODEL  default: llama-3.1-8b-instant
 *   ACARS_EXPLAIN_BASE   optional override base URL
 */

import { streamText, type LanguageModel } from "ai";
import { createGroq } from "@ai-sdk/groq";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type StreamChatOptions = {
  /** System prompt (AI SDK v7: use `instructions`, not role:system). */
  instructions?: string;
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  /** Called with the full text so far (not just the delta). */
  onPartial: (fullText: string) => Promise<void> | void;
  signal?: AbortSignal;
};

export type LlmConfig = {
  model: LanguageModel;
  modelId: string;
  provider: "groq";
};

export function resolveLlmConfig(modelOverride?: string): LlmConfig {
  const groqKey = process.env.GROQ_API_KEY?.trim();
  if (!groqKey) {
    throw new Error(
      "Missing GROQ_API_KEY. Set with: npx convex env set GROQ_API_KEY <key>",
    );
  }

  const baseOverride = process.env.ACARS_EXPLAIN_BASE?.trim();
  const envModel = process.env.ACARS_EXPLAIN_MODEL?.trim();
  const modelId = modelOverride || envModel || "openai/gpt-oss-120b";
  const groq = createGroq({
    apiKey: groqKey,
    ...(baseOverride ? { baseURL: baseOverride.replace(/\/$/, "") } : {}),
  });

  return {
    model: groq(modelId),
    modelId,
    provider: "groq",
  };
}

/**
 * Stream a chat completion via Vercel AI SDK.
 * Invokes onPartial with cumulative text (throttled ~180ms).
 */
export async function streamChatCompletion(
  opts: StreamChatOptions,
): Promise<{ text: string; model: string }> {
  const config = resolveLlmConfig(opts.model);

  const result = streamText({
    model: config.model,
    instructions: opts.instructions,
    messages: opts.messages,
    temperature: opts.temperature ?? 0.3,
    maxOutputTokens: opts.maxTokens ?? 700,
    abortSignal: opts.signal,
  });

  let full = "";
  let lastFlush = 0;
  let pending = false;

  const flush = async (force = false) => {
    const now = Date.now();
    if (!force && now - lastFlush < 180) {
      pending = true;
      return;
    }
    lastFlush = now;
    pending = false;
    await opts.onPartial(full);
  };

  for await (const delta of result.textStream) {
    if (typeof delta === "string" && delta.length > 0) {
      full += delta;
      await flush(false);
    }
  }

  if (pending || full.length > 0) {
    await flush(true);
  }

  // Surface provider errors if the stream ended empty due to failure.
  const finalText = (await result.text).trim() || full.trim();

  return { text: finalText, model: config.modelId };
}

export function buildAcarsExplainMessages(input: {
  raw: string;
  category?: string;
  label?: string;
  callsign?: string;
  flightNumber?: string;
  icao24?: string;
  registration?: string;
  decoded?: string;
  timestamp?: number;
}): { instructions: string; messages: ChatMessage[] } {
  const meta = [
    input.category ? `category: ${input.category}` : null,
    input.label ? `ACARS label: ${input.label}` : null,
    input.callsign ? `callsign: ${input.callsign}` : null,
    input.flightNumber ? `flight: ${input.flightNumber}` : null,
    input.icao24 ? `icao24: ${input.icao24}` : null,
    input.registration ? `registration: ${input.registration}` : null,
    input.decoded ? `station/meta: ${input.decoded}` : null,
    input.timestamp
      ? `time (UTC): ${new Date(input.timestamp).toISOString()}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    instructions: [
      "You are an aviation ACARS analyst for flight-tracking enthusiasts.",
      "Explain raw ACARS/VDL/HFDL messages in plain language, without bold, italic etc. Only use plain text without markdown formatting.",
      "Be concise (a few short sentences).",
      "Cover what the message is, (e.g. operational meaning, any position/route/fuel/ops cues if any, etc. If none, don't say something like 'no position update' or 'no explicit altitude given')",
      "If the payload is opaque binary/hex or empty, say so and note the label/type if useful.",
      "Do not invent flight numbers, airports, or emergencies that are not supported by the text. Only return the interpretation",
    ].join(" "),
    messages: [
      {
        role: "user",
        content: `Explain this ACARS message in plain text (without markdown, bold, ...).\n\nMetadata:\n${meta || "(none)"}\n\nRaw message:\n${input.raw}`,
      },
    ],
  };
}
