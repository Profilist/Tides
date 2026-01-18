import type { Express } from "express";
import { deriveIssues } from "../services/issue-detector";
import { fetchAmplitudeEvents } from "../services/amplitude-store.ts";
import { derivePersonas } from "../services/persona-synthesizer";
import { savePersonas } from "../services/persona-store";
import type { IssueDetectionOptions } from "../types/issues";
import type { PersonaDerivationOptions } from "../types/personas";

const MAX_EVENTS = 200000;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const parseEventTypes = (value: unknown): string[] | undefined => {
  if (Array.isArray(value)) {
    const types = value
      .filter((item) => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean);
    return types.length > 0 ? types : undefined;
  }
  if (typeof value === "string") {
    const types = value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    return types.length > 0 ? types : undefined;
  }
  return undefined;
};

const parseLimit = (value: unknown) => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }
  return Math.max(1, Math.min(MAX_EVENTS, Math.floor(value)));
};

export const registerInsightRoutes = (app: Express) => {
  app.post("/api/derive-issues-and-personas", async (req, res) => {
    const start =
      typeof req.body?.start === "string"
        ? req.body.start.trim()
        : typeof req.query.start === "string"
          ? req.query.start.trim()
          : undefined;
    const end =
      typeof req.body?.end === "string"
        ? req.body.end.trim()
        : typeof req.query.end === "string"
          ? req.query.end.trim()
          : undefined;
    const limit =
      parseLimit(req.body?.limit) ??
      parseLimit(typeof req.query.limit === "string" ? Number(req.query.limit) : undefined);
    const eventTypes =
      parseEventTypes(req.body?.eventTypes) ?? parseEventTypes(req.query.eventTypes);

    const issueOptions = (isRecord(req.body?.issueOptions)
      ? req.body.issueOptions
      : {}) as IssueDetectionOptions;
    const personaOptions = (isRecord(req.body?.personaOptions)
      ? req.body.personaOptions
      : {}) as PersonaDerivationOptions;

    try {
      const events = await fetchAmplitudeEvents({ start, end, limit, eventTypes });

      if (events.length > MAX_EVENTS) {
        res.status(400).json({ error: "Too many events for derivation." });
        return;
      }

      const issues = deriveIssues(events, issueOptions);
      const personaResult = derivePersonas(events, personaOptions);
      const personaStorage = await savePersonas(personaResult.personas);

      res.status(200).json({
        issues,
        personas: personaStorage.personas,
        snapshots: personaStorage.snapshots,
        meta: {
          totalEvents: events.length,
          issueWindowA: issues[0]?.windowA ?? null,
          issueWindowB: issues[0]?.windowB ?? null,
          personaRangeStart: personaResult.meta.rangeStart,
          personaRangeEnd: personaResult.meta.rangeEnd,
        },
      });
    } catch (error) {
      res.status(500).json({
        error: "Failed to derive insights from Supabase events.",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });
};
