import type { Express } from "express";
import { readFile } from "node:fs/promises";
import { resolve as resolvePath } from "node:path";
import { deriveIssues } from "../services/issue-detector";
import { analyzeIssuesWithGemini, suggestUiImprovementWithGemini } from "../services/llm";
import type {
  IssueAnalysisRequest,
  IssueDetectionOptions,
  Issue,
  IssueAnalysis,
  UiScreenshot,
  UiSuggestionRequest,
} from "../types/issues";

const MAX_EVENTS = 200000;
const MAX_ISSUES = 10;
const MAX_SCREENSHOTS = 5;
const MAX_HTML_CHARS = 250000;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const normalizeEvents = (value: unknown) => {
  if (!Array.isArray(value)) {
    return null;
  }
  return value.filter(isRecord);
};

const normalizeIssues = (value: unknown) => {
  if (!Array.isArray(value)) {
    return null;
  }
  return value.filter(isRecord) as Issue[];
};

const normalizeScreenshots = (value: unknown) => {
  if (!Array.isArray(value)) {
    return [];
  }

  const screenshots: UiScreenshot[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) {
      continue;
    }
    const url = typeof entry.url === "string" ? entry.url.trim() : "";
    if (!url) {
      continue;
    }
    const caption = typeof entry.caption === "string" ? entry.caption.trim() : undefined;
    screenshots.push(caption ? { url, caption } : { url });
    if (screenshots.length >= MAX_SCREENSHOTS) {
      break;
    }
  }

  return screenshots;
};

const loadDemoHtml = async () => {
  try {
    const filePath = resolvePath(process.cwd(), "demo.html");
    return await readFile(filePath, "utf-8");
  } catch {
    return "";
  }
};

const loadSuggestionHtml = async () => {
  try {
    const filePath = resolvePath(process.cwd(), "suggestion_output.html");
    return await readFile(filePath, "utf-8");
  } catch {
    return "";
  }
};

export const registerIssueRoutes = (app: Express) => {
  app.post("/api/derive-issues", (req, res) => {
    const events = normalizeEvents(req.body?.events);
    if (!events) {
      res.status(400).json({ error: "Request body must include events[] array." });
      return;
    }

    if (events.length > MAX_EVENTS) {
      res.status(400).json({ error: "Too many events for issue derivation." });
      return;
    }

    const options = (isRecord(req.body?.options)
      ? req.body.options
      : {}) as IssueDetectionOptions;

    const issues = deriveIssues(events, options);
    res.status(200).json({
      issues,
      meta: {
        totalEvents: events.length,
        windowA: issues[0]?.windowA ?? null,
        windowB: issues[0]?.windowB ?? null,
      },
    });
  });

  app.post("/api/analyze-issues", async (req, res) => {
    const issues = normalizeIssues(req.body?.issues);
    if (!issues) {
      res.status(400).json({ error: "Request body must include issues[] array." });
      return;
    }

    const payload: IssueAnalysisRequest = {
      issues: issues.slice(0, MAX_ISSUES),
      project: isRecord(req.body?.project) ? req.body.project : undefined,
      assets: isRecord(req.body?.assets) ? req.body.assets : undefined,
    };

    try {
      const analyses = await analyzeIssuesWithGemini(payload);
      res.status(200).json({
        analyses,
        meta: {
          totalIssues: issues.length,
          analyzedIssues: payload.issues.length,
        },
      });
    } catch (error) {
      res.status(500).json({
        error: "Failed to analyze issues.",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.post("/api/suggest-ui", async (req, res) => {
    const issue = isRecord(req.body?.issue) ? (req.body.issue as Issue) : null;
    if (!issue) {
      res.status(400).json({ error: "Request body must include issue object." });
      return;
    }

    const analysis = isRecord(req.body?.analysis)
      ? (req.body.analysis as IssueAnalysis)
      : undefined;

    const project = isRecord(req.body?.project) ? req.body.project : undefined;
    const screenshots = normalizeScreenshots(req.body?.assets?.screenshots);
    let demoHtml =
      typeof req.body?.assets?.demoHtml === "string" ? req.body.assets.demoHtml : "";

    if (!demoHtml) {
      demoHtml = await loadDemoHtml();
    }

    if (!demoHtml) {
      res.status(400).json({
        error: "Missing demo HTML.",
        hint: "Provide assets.demoHtml or ensure demo.html exists in the project root.",
      });
      return;
    }

    if (demoHtml.length > MAX_HTML_CHARS) {
      res.status(400).json({ error: "demoHtml is too large for suggestion." });
      return;
    }

    const payload: UiSuggestionRequest = {
      issue,
      analysis,
      project,
      assets: {
        screenshots,
        demoHtml,
      },
    };

    try {
      const suggestion = await suggestUiImprovementWithGemini(payload);
      res.status(200).json({
        suggestion,
        meta: {
          screenshotsUsed: screenshots.length,
          demoHtmlChars: demoHtml.length,
          hasSuggestion: Boolean(suggestion),
        },
      });
    } catch (error) {
      res.status(500).json({
        error: "Failed to suggest UI improvement.",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.get("/api/suggestion-output", async (_req, res) => {
    const html = await loadSuggestionHtml();
    if (!html) {
      res.status(404).json({
        error: "Missing suggestion_output.html.",
        hint: "Add suggestion_output.html to the project root.",
      });
      return;
    }
    res.status(200).json({ html });
  });
};
