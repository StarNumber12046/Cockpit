import { v } from "convex/values";
import {
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  buildAcarsExplainMessages,
  streamChatCompletion,
} from "./lib/llmStream";

/** Reactive subscription for one message's explanation (streaming-friendly). */
export const getForMessage = query({
  args: {
    messageId: v.id("acarsMessages"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("acarsExplanations")
      .withIndex("by_messageId", (q) => q.eq("messageId", args.messageId))
      .first();
  },
});

/** In-flight jobs older than this are treated as stuck and re-scheduled. */
const STALE_MS = 90_000;

/**
 * Request an AI explanation for an ACARS message.
 * Returns the explanation document id. Streams into DB via scheduled action.
 * Reuses ready/in-flight rows unless `force` is true (or the job is stale).
 */
export const request = mutation({
  args: {
    messageId: v.id("acarsMessages"),
    force: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const message = await ctx.db.get(args.messageId);
    if (!message) {
      throw new Error("ACARS message not found");
    }

    const existing = await ctx.db
      .query("acarsExplanations")
      .withIndex("by_messageId", (q) => q.eq("messageId", args.messageId))
      .first();

    const now = Date.now();
    const force = args.force === true;
    const stale =
      existing != null &&
      (existing.status === "pending" || existing.status === "streaming") &&
      now - existing.updatedAt > STALE_MS;

    if (existing && !force && !stale) {
      if (
        existing.status === "ready" ||
        existing.status === "streaming" ||
        existing.status === "pending"
      ) {
        return {
          explanationId: existing._id,
          reused: true as const,
          status: existing.status,
        };
      }
      // error → restart below
    }

    let explanationId: Id<"acarsExplanations">;

    if (existing) {
      await ctx.db.patch(existing._id, {
        status: "pending",
        text: force || stale || existing.status === "error" ? "" : existing.text,
        error: undefined,
        model: force || stale ? undefined : existing.model,
        updatedAt: now,
      });
      explanationId = existing._id;
    } else {
      explanationId = await ctx.db.insert("acarsExplanations", {
        messageId: args.messageId,
        status: "pending",
        text: "",
        createdAt: now,
        updatedAt: now,
      });
    }

    await ctx.scheduler.runAfter(0, internal.acarsExplain.generate, {
      explanationId,
      messageId: args.messageId,
    });

    return {
      explanationId,
      reused: false as const,
      status: "pending" as const,
    };
  },
});

export const getMessageInternal = internalQuery({
  args: { messageId: v.id("acarsMessages") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.messageId);
  },
});

export const markStreaming = internalMutation({
  args: {
    explanationId: v.id("acarsExplanations"),
    model: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.explanationId);
    if (!row) return;
    await ctx.db.patch(args.explanationId, {
      status: "streaming",
      model: args.model ?? row.model,
      updatedAt: Date.now(),
    });
  },
});

export const setPartialText = internalMutation({
  args: {
    explanationId: v.id("acarsExplanations"),
    text: v.string(),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.explanationId);
    if (!row) return;
    // Ignore late chunks after terminal states.
    if (row.status !== "pending" && row.status !== "streaming") return;
    await ctx.db.patch(args.explanationId, {
      status: "streaming",
      text: args.text,
      updatedAt: Date.now(),
    });
  },
});

export const markReady = internalMutation({
  args: {
    explanationId: v.id("acarsExplanations"),
    text: v.string(),
    model: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.explanationId, {
      status: "ready",
      text: args.text,
      model: args.model,
      error: undefined,
      updatedAt: Date.now(),
    });
  },
});

export const markError = internalMutation({
  args: {
    explanationId: v.id("acarsExplanations"),
    error: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.explanationId, {
      status: "error",
      error: args.error.slice(0, 500),
      updatedAt: Date.now(),
    });
  },
});

/** Stream LLM explanation into acarsExplanations (reactive to clients). */
export const generate = internalAction({
  args: {
    explanationId: v.id("acarsExplanations"),
    messageId: v.id("acarsMessages"),
  },
  handler: async (ctx, args) => {
    const message = await ctx.runQuery(internal.acarsExplain.getMessageInternal, {
      messageId: args.messageId,
    });
    if (!message) {
      await ctx.runMutation(internal.acarsExplain.markError, {
        explanationId: args.explanationId,
        error: "ACARS message missing",
      });
      return null;
    }

    try {
      await ctx.runMutation(internal.acarsExplain.markStreaming, {
        explanationId: args.explanationId,
      });

      const prompt = buildAcarsExplainMessages({
        raw: message.raw,
        category: message.category,
        label: message.label,
        callsign: message.callsign,
        flightNumber: message.flightNumber,
        icao24: message.icao24,
        registration: message.registration,
        decoded: message.decoded,
        timestamp: message.timestamp,
      });
      const { text, model } = await streamChatCompletion({
        instructions: prompt.instructions,
        messages: prompt.messages,
        onPartial: async (fullText) => {
          await ctx.runMutation(internal.acarsExplain.setPartialText, {
            explanationId: args.explanationId,
            text: fullText,
          });
        },
      });

      const finalText =
        text.length > 0
          ? text
          : "No explanation was generated for this message.";

      await ctx.runMutation(internal.acarsExplain.markReady, {
        explanationId: args.explanationId,
        text: finalText,
        model,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await ctx.runMutation(internal.acarsExplain.markError, {
        explanationId: args.explanationId,
        error: msg,
      });
    }

    return null;
  },
});
