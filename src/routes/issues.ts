import type { Express } from "express";
import { readFile } from "node:fs/promises";
import { resolve as resolvePath } from "node:path";
import { createPatch } from "diff";
import { deriveIssues } from "../services/issue-detector";
import { fetchIssueById, fetchRecentIssues } from "../services/issue-store";
import { fetchPagesWithScreenshots } from "../services/page-store";
import {
  analyzeIssuesWithGemini,
  analyzePersonaImpactsWithGemini,
  generateChatResponseWithGemini,
  generateSuggestionSummaryWithGemini,
  suggestUiImprovementWithGemini,
} from "../services/llm";
import {
  createPersonaImpactJob,
  fetchPersonaImpactJob,
  runPersonaImpactJob,
} from "../services/persona-impact-jobs";
import { fetchLatestPersonas } from "../services/persona-store";
import type {
  IssueAnalysisRequest,
  IssueDetectionOptions,
  Issue,
  IssueAnalysis,
  UiScreenshot,
  UiSuggestionRequest,
} from "../types/issues";
import type { PersonaDefinition, PersonaImpact } from "../types/personas";

const MAX_EVENTS = 200000;
const MAX_ISSUES = 10;
const MAX_SCREENSHOTS = 5;
const MAX_HTML_CHARS = 250000;
const MAX_DIFF_CHARS = 20000;
const DEFAULT_RECENT_MINUTES = 10000;
const DEFAULT_RECENT_LIMIT = 50;

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

const parseNumberParam = (value: unknown) => {
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  return null;
};

const formatPct = (value: number) => `${Math.abs(value).toFixed(1)}%`;

const buildChatEvidence = (
  issue: Issue,
  context: { suggestionSummary?: string | null; hasSuggestionHtml: boolean },
) => {
  const trend =
    issue.direction === "increase" ? "up" : issue.direction === "decrease" ? "down" : "flat";
  const metricEvidence = {
    type: "metric" as const,
    title: "Event rate change",
    value: formatPct(issue.deltaPct),
    delta: issue.direction === "flat" ? "Flat vs prior window" : `${issue.direction} vs prior window`,
    trend,
    caption: issue.eventType,
  };

  const sampleEvents =
    issue.samples?.events?.slice(0, 3).map((event) => ({
      id: event.id,
      timestamp: event.timestamp,
      label: `Window ${event.window}`,
    })) ?? [];

  const eventEvidence =
    sampleEvents.length > 0
      ? {
          type: "event_sample" as const,
          title: "Event samples",
          events: sampleEvents,
        }
      : {
          type: "note" as const,
          title: "Event samples",
          body: "No sample events available for this issue yet.",
        };

  const suggestionEvidence =
    context.hasSuggestionHtml || context.suggestionSummary
      ? {
          type: "note" as const,
          title: "Suggestion context",
          body:
            context.suggestionSummary?.trim() ||
            "A UI suggestion is available for this issue, and the reply is scoped to it.",
        }
      : {
          type: "note" as const,
          title: "Suggestion context",
          body: "No UI suggestion is attached yet; the reply is scoped to the issue only.",
        };

  return [metricEvidence, eventEvidence, suggestionEvidence];
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

const normalizePersonas = (value: unknown) => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(isRecord) as PersonaDefinition[];
};

const normalizeStringArray = (value: unknown) => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item) => typeof item === "string").map((item) => item.trim());
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

const buildHtmlDiff = (originalHtml: string, updatedHtml: string) => {
  if (!originalHtml || !updatedHtml) {
    return "";
  }
  const patch = createPatch("demo.html", originalHtml, updatedHtml, "original", "updated");
  if (patch.length <= MAX_DIFF_CHARS) {
    return patch;
  }
  return `${patch.slice(0, MAX_DIFF_CHARS)}\n...diff truncated...`;
};

export const registerIssueRoutes = (app: Express) => {
  app.get("/api/issues/:id/pages", async (req, res) => {
    const issueId = typeof req.params.id === "string" ? req.params.id.trim() : "";
    if (!issueId) {
      res.status(400).json({ error: "Missing issue id." });
      return;
    }

    try {
      const issue = await fetchIssueById(issueId);
      if (!issue) {
        res.status(404).json({ error: "Issue not found." });
        return;
      }

      const pageNames = issue.pageNames ?? [];
      const pages = await fetchPagesWithScreenshots(pageNames);

      res.status(200).json({
        pages,
        meta: {
          issueId,
          pageCount: pages.length,
          requestedPages: pageNames,
        },
      });
    } catch (error) {
      res.status(500).json({
        error: "Failed to fetch issue pages.",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.get("/api/issues", async (req, res) => {
    const minutes = parseNumberParam(req.query.minutes) ?? DEFAULT_RECENT_MINUTES;
    const limit = parseNumberParam(req.query.limit) ?? DEFAULT_RECENT_LIMIT;

    try {
      const issues = await fetchRecentIssues(minutes, limit);
      res.status(200).json({
        issues,
        meta: {
          minutes,
          limit,
          returned: issues.length,
        },
      });
    } catch (error) {
      res.status(500).json({
        error: "Failed to fetch recent issues.",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });

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
      const personas = normalizePersonas(req.body?.personas);
      let personaImpacts: PersonaImpact[] = [];
      let personaImpactJobId: string | null = null;
      const updatedHtmlDiff =
        suggestion && suggestion.updatedHtml ? buildHtmlDiff(demoHtml, suggestion.updatedHtml) : "";

      if (suggestion && personas.length > 0) {
        const job = await createPersonaImpactJob(
          {
            personas,
            issue,
            analysis,
            project,
            assets: {
              demoHtml,
              updatedHtmlDiff,
              changeSummary: suggestion.changeSummary,
            },
          },
          project?.id ?? "default",
        );
        personaImpactJobId = job.id;
        void runPersonaImpactJob(job.id);
      }
      res.status(200).json({
        suggestion,
        updatedHtmlDiff,
        personaImpacts,
        personaImpactJobId,
        meta: {
          screenshotsUsed: screenshots.length,
          demoHtmlChars: demoHtml.length,
          hasSuggestion: Boolean(suggestion),
          personasUsed: personas.length,
        },
      });
    } catch (error) {
      res.status(500).json({
        error: "Failed to suggest UI improvement.",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.post("/api/issues/:id/chat", async (req, res) => {
    const issueId = typeof req.params.id === "string" ? req.params.id.trim() : "";
    if (!issueId) {
      res.status(400).json({ error: "Missing issue id." });
      return;
    }

    const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
    if (!message) {
      res.status(400).json({ error: "Request body must include a message." });
      return;
    }

    const context = isRecord(req.body?.context) ? req.body.context : {};
    const suggestionSummary =
      typeof context.suggestionSummary === "string" ? context.suggestionSummary : null;
    const suggestionHtml = typeof context.suggestionHtml === "string" ? context.suggestionHtml : "";

    try {
      const issue = await fetchIssueById(issueId);
      if (!issue) {
        res.status(404).json({ error: "Issue not found." });
        return;
      }

      const chatResult = await generateChatResponseWithGemini({
        issue,
        userMessage: message,
        suggestionSummary,
        suggestionHtml,
      });
      const assistantMessage =
        chatResult.reply ||
        issue.summary ||
        `Users are seeing a ${issue.direction} in ${issue.eventType} for the selected segment.`;
      const updatedHtml = chatResult.updatedHtml?.trim() ?? "";
      const updatedHtmlDiff =
        updatedHtml && suggestionHtml ? buildHtmlDiff(suggestionHtml, updatedHtml) : "";

      res.status(200).json({
        reply: {
          content: assistantMessage,
          evidence: buildChatEvidence(issue, {
            suggestionSummary,
            hasSuggestionHtml: Boolean(suggestionHtml.trim()),
          }),
        },
        updatedHtml: updatedHtml || undefined,
        updatedHtmlDiff: updatedHtmlDiff || undefined,
        changeSummary: chatResult.changeSummary,
        meta: {
          issueId,
        },
      });
    } catch (error) {
      res.status(500).json({
        error: "Failed to generate chat response.",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.post("/api/issues/:id/suggestion-summary", async (req, res) => {
    const issueId = typeof req.params.id === "string" ? req.params.id.trim() : "";
    if (!issueId) {
      res.status(400).json({ error: "Missing issue id." });
      return;
    }

    const suggestionHtml =
      typeof req.body?.suggestionHtml === "string" ? req.body.suggestionHtml.trim() : "";
    if (!suggestionHtml) {
      res.status(400).json({ error: "Request body must include suggestionHtml." });
      return;
    }
    const suggestionDiff =
      typeof req.body?.suggestionDiff === "string" ? req.body.suggestionDiff.trim() : "";
    const changeSummary = normalizeStringArray(req.body?.changeSummary);

    try {
      const issue = await fetchIssueById(issueId);
      if (!issue) {
        res.status(404).json({ error: "Issue not found." });
        return;
      }

      let resolvedDiff = suggestionDiff;
      if (!resolvedDiff) {
        const demoHtml = await loadDemoHtml();
        if (demoHtml) {
          resolvedDiff = buildHtmlDiff(demoHtml, suggestionHtml);
        }
      }

      const summary = await generateSuggestionSummaryWithGemini({
        issue,
        suggestionHtml,
        suggestionDiff: resolvedDiff,
        changeSummary,
      });

      res.status(200).json({
        message: {
          content: summary.content,
          evidence: summary.evidence,
        },
        meta: {
          issueId,
        },
      });
    } catch (error) {
      res.status(500).json({
        error: "Failed to generate suggestion summary.",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.post("/api/test/analyze-persona-impacts", async (req, res) => {
    const personas = normalizePersonas(req.body?.personas);
    if (personas.length === 0) {
      res.status(400).json({ error: "Request body must include personas[] array." });
      return;
    }

    const issue = isRecord(req.body?.issue) ? (req.body.issue as Issue) : undefined;
    const analysis = isRecord(req.body?.analysis)
      ? (req.body.analysis as IssueAnalysis)
      : undefined;
    const project = isRecord(req.body?.project) ? req.body.project : undefined;

    let demoHtml =
      typeof req.body?.assets?.demoHtml === "string" ? req.body.assets.demoHtml : "";
    let updatedHtml =
      typeof req.body?.assets?.updatedHtml === "string" ? req.body.assets.updatedHtml : "";
    let updatedHtmlDiff =
      typeof req.body?.assets?.updatedHtmlDiff === "string"
        ? req.body.assets.updatedHtmlDiff
        : "";
    const changeSummary = Array.isArray(req.body?.assets?.changeSummary)
      ? req.body.assets.changeSummary.filter((item: unknown) => typeof item === "string")
      : [];

    if (!demoHtml) {
      demoHtml = await loadDemoHtml();
    }
    if (!updatedHtml) {
      updatedHtml = await loadSuggestionHtml();
    }
    if (!updatedHtmlDiff && demoHtml && updatedHtml) {
      updatedHtmlDiff = buildHtmlDiff(demoHtml, updatedHtml);
    }

    try {
      const personaImpacts = await analyzePersonaImpactsWithGemini({
        personas,
        issue,
        analysis,
        project,
        assets: {
          demoHtml,
          updatedHtml,
          updatedHtmlDiff,
          changeSummary,
        },
      });

      res.status(200).json({
        personaImpacts,
        meta: {
          personasUsed: personas.length,
          hasDemoHtml: Boolean(demoHtml),
          hasUpdatedHtml: Boolean(updatedHtml),
          hasDiff: Boolean(updatedHtmlDiff),
        },
      });
    } catch (error) {
      res.status(500).json({
        error: "Failed to analyze persona impacts.",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.get("/api/persona-impact-jobs/:id", async (req, res) => {
    const jobId = typeof req.params.id === "string" ? req.params.id.trim() : "";
    if (!jobId) {
      res.status(400).json({ error: "Missing job id." });
      return;
    }

    try {
      const job = await fetchPersonaImpactJob(jobId);
      if (!job) {
        res.status(404).json({ error: "Persona impact job not found." });
        return;
      }
      res.status(200).json({
        status: job.status,
        personaImpacts: job.result ?? [],
        error: job.error ?? null,
      });
    } catch (error) {
      res.status(500).json({
        error: "Failed to fetch persona impact job.",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.post("/api/test/persona-impact-job", async (req, res) => {
    const projectId =
      typeof req.body?.projectId === "string" ? req.body.projectId.trim() : "default";

    try {
      const personas = await fetchLatestPersonas(projectId, 10);
      if (personas.length === 0) {
        res.status(400).json({ error: "No personas available for test job." });
        return;
      }

      const issue = isRecord(req.body?.issue) ? (req.body.issue as Issue) : undefined;
      const analysis = isRecord(req.body?.analysis)
        ? (req.body.analysis as IssueAnalysis)
        : undefined;
      const project = isRecord(req.body?.project) ? req.body.project : { id: projectId };
      const changeSummary = Array.isArray(req.body?.assets?.changeSummary)
        ? req.body.assets.changeSummary.filter((item: unknown) => typeof item === "string")
        : ["Generated from suggestion_output.html"];

      const demoHtml = await loadDemoHtml();
      const updatedHtml = await loadSuggestionHtml();
      const updatedHtmlDiff = buildHtmlDiff(demoHtml, updatedHtml);

      const job = await createPersonaImpactJob(
        {
          personas,
          issue,
          analysis,
          project,
          assets: {
            demoHtml,
            updatedHtmlDiff,
            changeSummary,
          },
        },
        projectId,
      );

      void runPersonaImpactJob(job.id);

      res.status(200).json({
        personaImpactJobId: job.id,
        meta: {
          personasUsed: personas.length,
        },
      });
    } catch (error) {
      res.status(500).json({
        error: "Failed to create persona impact test job.",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.post("/api/persona-impact-jobs/:id/run", async (req, res) => {
    const jobId = typeof req.params.id === "string" ? req.params.id.trim() : "";
    if (!jobId) {
      res.status(400).json({ error: "Missing job id." });
      return;
    }

    try {
      const job = await runPersonaImpactJob(jobId);
      res.status(200).json({
        status: job.status,
        personaImpacts: job.result ?? [],
        error: job.error ?? null,
      });
    } catch (error) {
      res.status(500).json({
        error: "Failed to run persona impact job.",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.get("/api/test/suggestion-output", async (_req, res) => {
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
