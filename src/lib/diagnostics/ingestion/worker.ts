// src/lib/diagnostics/ingestion/worker.ts
// Background processor for schematic-ingestion jobs. Runs only when the engine
// is configured; otherwise it is a no-op that leaves jobs in PENDING for later.
// A real deployment would drive this from a queue (BullMQ/Redis) or a cron;
// for now it is invoked manually / on demand.

import { db } from "@/lib/db";
import { schematicIngestionJobs } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { config, ingestionReady } from "@/lib/config";
import { NullProvider, type SchematicProvider } from "./provider";
import { ClaudeProvider } from "./claude";

export function getProvider(): SchematicProvider {
  if (!config.schematicIngestionEnabled) return new NullProvider();
  switch (config.ingestionProvider) {
    case "ANTHROPIC":
      return new ClaudeProvider(config.anthropicApiKey, config.anthropicModel);
    // case "DOCUMENT_AI": return new DocumentAiProvider(...)  // future
    default:
      return new NullProvider();
  }
}

// Process queued jobs. Returns a small summary; safe to call anytime.
export async function processPendingJobs(limit = 5): Promise<{ processed: number; skipped: boolean; reason?: string }> {
  const ready = ingestionReady();
  if (!ready.ready) {
    return { processed: 0, skipped: true, reason: ready.reason };
  }

  const provider = getProvider();
  const jobs = (
    await db
      .select()
      .from(schematicIngestionJobs)
      .where(inArray(schematicIngestionJobs.status, ["PENDING", "QUEUED"]))
  ).slice(0, limit);

  let processed = 0;
  for (const job of jobs) {
    try {
      await db
        .update(schematicIngestionJobs)
        .set({ status: "PROCESSING", attempts: (job.attempts ?? 0) + 1, updatedAt: new Date().toISOString() })
        .where(eq(schematicIngestionJobs.id, job.id));

      const result = await provider.extract({
        fileUrl: job.fileUrl ?? undefined,
        pdfKind: job.pdfKind ?? undefined,
      });

      await db
        .update(schematicIngestionJobs)
        .set({
          status: "NEEDS_REVIEW", // extraction done → technician confirms before it feeds the engine
          provider: provider.name,
          extractedData: JSON.stringify(result),
          error: null,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(schematicIngestionJobs.id, job.id));
      processed++;
    } catch (e) {
      await db
        .update(schematicIngestionJobs)
        .set({ status: "FAILED", error: e instanceof Error ? e.message : String(e), updatedAt: new Date().toISOString() })
        .where(eq(schematicIngestionJobs.id, job.id));
    }
  }
  return { processed, skipped: false };
}
