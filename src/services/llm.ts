import {
  GoogleGenAI,
  createPartFromUri,
  createUserContent,
} from "@google/genai";
import { writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import type {
  Issue,
  IssueAnalysis,
  IssueAnalysisRequest,
  UiSuggestion,
  UiSuggestionRequest,
} from "../types/issues";

const GEMINI_MODEL = "gemini-3-flash-preview";

const buildPrompt = (payload: IssueAnalysisRequest) => {
  const issues = payload.issues.map((issue) => ({
    id: issue.id,
    metric: issue.metric,
    eventType: issue.eventType,
    segment: issue.segment,
    windowA: issue.windowA,
    windowB: issue.windowB,
    valueA: issue.valueA,
    valueB: issue.valueB,
    deltaPct: issue.deltaPct,
    direction: issue.direction,
    severity: issue.severity,
    sampleA: issue.sampleA,
    sampleB: issue.sampleB,
  }));

  return `
You are a UX analytics assistant. You only summarize issues; do not suggest changes or fixes.
Use ONLY the provided issue data. Do not recalculate metrics.
Return JSON with shape: { "analyses": [{ "issueId": string, "summary": string, "evidence": string[], "confidence": "low"|"medium"|"high" }] }.
If you cannot provide analysis, return { "analyses": [] }.

Project:
${JSON.stringify(payload.project ?? {}, null, 2)}

Assets:
${JSON.stringify(payload.assets ?? {}, null, 2)}

Issues:
${JSON.stringify(issues, null, 2)}
`.trim();
};

const buildUiSuggestionPrompt = (payload: UiSuggestionRequest) => {
  const issue = {
    id: payload.issue.id,
    metric: payload.issue.metric,
    eventType: payload.issue.eventType,
    segment: payload.issue.segment,
    windowA: payload.issue.windowA,
    windowB: payload.issue.windowB,
    valueA: payload.issue.valueA,
    valueB: payload.issue.valueB,
    deltaPct: payload.issue.deltaPct,
    direction: payload.issue.direction,
    severity: payload.issue.severity,
    sampleA: payload.issue.sampleA,
    sampleB: payload.issue.sampleB,
  };
  const analysis = payload.analysis
    ? {
        issueId: payload.analysis.issueId,
        summary: payload.analysis.summary,
        evidence: payload.analysis.evidence,
        confidence: payload.analysis.confidence,
      }
    : null;
  const screenshots = payload.assets?.screenshots ?? [];
  const demoHtml = payload.assets?.demoHtml ?? "";

  return `
You are a UX improvement assistant. Propose a small UI change that addresses the issue.
Return JSON with shape:
{
  "updatedHtml": string,
  "changeSummary": string[],
  "rationale": string,
  "confidence": "low"|"medium"|"high",
  "warnings": string[]
}

Constraints:
- Make the smallest possible change that still helps.
- Keep the overall layout, typography, and brand style intact.
- Do not introduce new dependencies or external assets.
- Return the FULL updated HTML document.
- Keep scripts and IDs intact unless necessary for the change.
- If the issue cannot be addressed, return an empty updatedHtml and explain why in warnings.

Project:
${JSON.stringify(payload.project ?? {}, null, 2)}

Issue:
${JSON.stringify(issue, null, 2)}

Analysis:
${JSON.stringify(analysis ?? {}, null, 2)}

Screenshots:
${screenshots.length ? `${screenshots.length} screenshot(s) provided.` : "None."}

Current demo HTML:
${demoHtml}
  `.trim();
};

const extractText = (response: unknown) => {
  if (response && typeof response === "object" && "text" in response) {
    const text = (response as { text?: unknown }).text;
    if (typeof text === "string") {
      return text;
    }
  }
  return null;
};

const getFileExtension = (url: string, mimeType?: string) => {
  if (mimeType) {
    if (mimeType.includes("png")) {
      return ".png";
    }
    if (mimeType.includes("jpeg") || mimeType.includes("jpg")) {
      return ".jpg";
    }
    if (mimeType.includes("webp")) {
      return ".webp";
    }
    if (mimeType.includes("gif")) {
      return ".gif";
    }
  }
  const baseUrl = url.split("?")[0] ?? url;
  const ext = extname(baseUrl);
  return ext || ".png";
};

const downloadScreenshot = async (url: string, index: number) => {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return null;
    }
    const mimeType = response.headers.get("content-type") ?? undefined;
    const buffer = Buffer.from(await response.arrayBuffer());
    const ext = getFileExtension(url, mimeType);
    const filePath = join(tmpdir(), `tides-shot-${Date.now()}-${index}${ext}`);
    await writeFile(filePath, buffer);
    return { filePath, mimeType };
  } catch {
    return null;
  }
};

const buildUiSuggestionContents = async (
  ai: GoogleGenAI,
  payload: UiSuggestionRequest,
) => {
  const prompt = buildUiSuggestionPrompt(payload);
  const parts: Array<string | ReturnType<typeof createPartFromUri>> = [prompt];
  const tempFiles: string[] = [];
  const screenshots = payload.assets?.screenshots ?? [];

  for (const [index, shot] of screenshots.entries()) {
    const downloaded = await downloadScreenshot(shot.url, index);
    if (!downloaded) {
      const fallback = shot.caption ? `Screenshot: ${shot.caption}` : `Screenshot: ${shot.url}`;
      parts.push(fallback);
      continue;
    }

    tempFiles.push(downloaded.filePath);
    const uploaded = await ai.files.upload({ file: downloaded.filePath });
    if (shot.caption) {
      parts.push(`Screenshot: ${shot.caption}`);
    }
    if (uploaded.uri) {
      parts.push(createPartFromUri(uploaded.uri, uploaded.mimeType ?? "image/png"));
    }
  }

  return {
    contents: [createUserContent(parts)],
    cleanup: async () => {
      await Promise.all(
        tempFiles.map(async (filePath) => {
          try {
            await unlink(filePath);
          } catch {
            // ignore cleanup failures
          }
        }),
      );
    },
  };
};

const sanitizeAnalyses = (issues: Issue[], raw: unknown): IssueAnalysis[] => {
  if (typeof raw !== "object" || raw === null || !("analyses" in raw)) {
    return [];
  }

  const analyses = (raw as { analyses?: unknown }).analyses;
  if (!Array.isArray(analyses)) {
    return [];
  }

  const issueIds = new Set(issues.map((issue) => issue.id));

  return analyses
    .map((analysis) => {
      if (typeof analysis !== "object" || analysis === null) {
        return null;
      }
      const entry = analysis as Partial<IssueAnalysis>;
      if (!entry.issueId || !issueIds.has(entry.issueId)) {
        return null;
      }
      const summary = typeof entry.summary === "string" ? entry.summary : "";
      const evidence = Array.isArray(entry.evidence)
        ? entry.evidence.filter((item) => typeof item === "string")
        : [];
      const confidence =
        entry.confidence === "high" || entry.confidence === "medium" || entry.confidence === "low"
          ? entry.confidence
          : "low";
      if (!summary) {
        return null;
      }
      return {
        issueId: entry.issueId,
        summary,
        evidence,
        confidence,
      };
    })
    .filter((analysis): analysis is IssueAnalysis => Boolean(analysis));
};

const sanitizeUiSuggestion = (raw: unknown): UiSuggestion | null => {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }

  const entry = raw as Partial<UiSuggestion>;
  const updatedHtml =
    typeof entry.updatedHtml === "string" ? entry.updatedHtml.trim() : "";
  if (!updatedHtml) {
    return null;
  }
  const changeSummary = Array.isArray(entry.changeSummary)
    ? entry.changeSummary.filter((item) => typeof item === "string")
    : [];
  const rationale = typeof entry.rationale === "string" ? entry.rationale : "";
  const confidence =
    entry.confidence === "high" || entry.confidence === "medium" || entry.confidence === "low"
      ? entry.confidence
      : "low";
  const warnings = Array.isArray(entry.warnings)
    ? entry.warnings.filter((item) => typeof item === "string")
    : undefined;

  return {
    updatedHtml,
    changeSummary,
    rationale,
    confidence,
    warnings: warnings && warnings.length > 0 ? warnings : undefined,
  };
};

export const analyzeIssuesWithGemini = async (
  payload: IssueAnalysisRequest,
): Promise<IssueAnalysis[]> => {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY.");
  }

  const prompt = buildPrompt(payload);
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: prompt,
    config: {
      systemInstruction: "You only summarize issues; do not suggest changes or fixes.",
      responseMimeType: "application/json",
    },
  });

  const text = extractText(response);
  if (!text) {
    return [];
  }

  try {
    const parsed = JSON.parse(text) as unknown;
    return sanitizeAnalyses(payload.issues, parsed);
  } catch {
    return [];
  }
};

export const suggestUiImprovementWithGemini = async (
  payload: UiSuggestionRequest,
): Promise<UiSuggestion | null> => {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY.");
  }

  const ai = new GoogleGenAI({ apiKey });
  const { contents, cleanup } = await buildUiSuggestionContents(ai, payload);
  let response: unknown;
  try {
    response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents,
      config: {
        systemInstruction: "You suggest small UI improvements and return JSON only.",
        responseMimeType: "application/json",
      },
    });
  } finally {
    await cleanup();
  }

  const text = extractText(response);
  if (!text) {
    return null;
  }

  try {
    const parsed = JSON.parse(text) as unknown;
    return sanitizeUiSuggestion(parsed);
  } catch {
    return null;
  }
};
