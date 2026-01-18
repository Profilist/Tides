import type { Express } from "express";
import { derivePersonas } from "../services/persona-synthesizer";
import { fetchLatestPersonas, savePersonas } from "../services/persona-store";
import type { PersonaDerivationOptions } from "../types/personas";

const MAX_EVENTS = 200000;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const normalizeEvents = (value: unknown) => {
  if (!Array.isArray(value)) {
    return null;
  }
  return value.filter(isRecord);
};

export const registerPersonaRoutes = (app: Express) => {
  app.post("/api/derive-personas", async (req, res) => {
    const events = normalizeEvents(req.body?.events);
    if (!events) {
      res.status(400).json({ error: "Request body must include events[] array." });
      return;
    }

    if (events.length > MAX_EVENTS) {
      res.status(400).json({ error: "Too many events for persona derivation." });
      return;
    }

    const options = (isRecord(req.body?.options)
      ? req.body.options
      : {}) as PersonaDerivationOptions;

    try {
      const result = derivePersonas(events, options);
      const storage = await savePersonas(result.personas);

      res.status(200).json({
        personas: storage.personas,
        snapshots: storage.snapshots,
        meta: result.meta,
      });
    } catch (error) {
      res.status(500).json({
        error: "Failed to derive personas.",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.get("/api/personas", async (req, res) => {
    const projectId =
      typeof req.query.projectId === "string" ? req.query.projectId.trim() : "default";
    const limit =
      typeof req.query.limit === "string" ? Number(req.query.limit) : undefined;
    const safeLimit = Number.isFinite(limit) && limit ? Math.max(1, Math.min(50, limit)) : 20;

    try {
      const personas = await fetchLatestPersonas(projectId, safeLimit);
      res.status(200).json({
        personas,
        meta: {
          projectId,
          returned: personas.length,
        },
      });
    } catch (error) {
      res.status(500).json({
        error: "Failed to fetch personas.",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });
};
