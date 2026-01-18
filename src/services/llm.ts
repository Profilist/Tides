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
  IssueEvidence,
  IssueAnalysis,
  IssueAnalysisRequest,
  IssueSamples,
  IssueWindow,
  UiSuggestion,
  UiSuggestionRequest,
} from "../types/issues";
import type { PersonaImpact, PersonaImpactRequest } from "../types/personas";

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

type IssueFindingCandidate = {
  id: string;
  eventType: string;
  segment: Record<string, string>;
  windowA: IssueWindow;
  windowB: IssueWindow;
  evidence: IssueEvidence;
  samples: IssueSamples;
  deltaPct: number;
  direction: Issue["direction"];
  severity: Issue["severity"];
};

type IssueFindingPromptPayload = {
  candidates: IssueFindingCandidate[];
  meta: {
    windowA: IssueWindow;
    windowB: IssueWindow;
  };
};

type IssueFindingOutput = {
  evidenceId: string;
  summary: string;
  category: string;
};

const buildIssueFindingPrompt = (payload: IssueFindingPromptPayload) => `
You are a product analytics assistant preparing demo-friendly issues. Use candidate evidence to craft plausible, realistic product issues that highlight value beyond basic rule-based detection. If evidence is thin or synthetic, you may generalize into realistic scenarios, but still tie each issue to the provided candidate evidence.
Return JSON only with shape:
{
  "issues": [
    {
      "evidenceId": string,
      "summary": string,
      "category": string
    }
  ]
}

Rules:
- Anchor each issue to the provided candidates and evidence.
- "evidenceId" must match a candidate id exactly.
- Keep "summary" short and specific (1 sentence).
- "category" should be a concise label (e.g., onboarding, retention, errors, engagement).
- Avoid sounding like raw instrumentation or tracking diagnostics.
- Favor behavioral/user-journey issues (e.g., onboarding drop-off after a specific step).
- If nothing stands out, return { "issues": [] }.

Window A:
${JSON.stringify(payload.meta.windowA, null, 2)}

Window B:
${JSON.stringify(payload.meta.windowB, null, 2)}

Candidates:
${JSON.stringify(payload.candidates, null, 2)}
`.trim();

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

const buildPersonaImpactPrompt = (payload: PersonaImpactRequest) => {
  const personas = payload.personas.map((persona) => ({
    id: persona.id,
    name: persona.name,
    description: persona.description,
    rules: persona.rules,
    metrics: persona.metrics,
    sampleSize: persona.sampleSize,
    rangeStart: persona.rangeStart,
    rangeEnd: persona.rangeEnd,
  }));

  const updatedHtmlDiff = payload.assets?.updatedHtmlDiff ?? "";
  const updatedHtml = payload.assets?.updatedHtml ?? "";

  return `
You are a UX analytics assistant. You evaluate how a proposed UI change affects different personas.
Return JSON with shape:
{
  "impacts": [
    {
      "personaName": string,
      "summary": string,
      "signals": string[],
      "confidence": "low"|"medium"|"high"
    }
  ]
}

Constraints:
- Be concise and grounded in the persona metrics.
- Use comparative language when possible (increase, decrease, likely unchanged).
- If impact is unclear, say so explicitly.

Project:
${JSON.stringify(payload.project ?? {}, null, 2)}

Issue context:
${JSON.stringify(payload.issue ?? {}, null, 2)}

Issue analysis:
${JSON.stringify(payload.analysis ?? {}, null, 2)}

Personas:
${JSON.stringify(personas, null, 2)}

Original demo HTML:
${payload.assets?.demoHtml ?? ""}

Updated HTML diff (preferred, may be empty if not provided):
${updatedHtmlDiff}

Updated HTML (fallback if diff is missing):
${updatedHtml}

Change summary:
${JSON.stringify(payload.assets?.changeSummary ?? [], null, 2)}
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

const sanitizeIssueFindings = (
  candidates: IssueFindingCandidate[],
  raw: unknown,
): IssueFindingOutput[] => {
  if (typeof raw !== "object" || raw === null || !("issues" in raw)) {
    return [];
  }
  const issues = (raw as { issues?: unknown }).issues;
  if (!Array.isArray(issues)) {
    return [];
  }

  const candidateIds = new Set(candidates.map((candidate) => candidate.id));

  return issues
    .map((issue) => {
      if (typeof issue !== "object" || issue === null) {
        return null;
      }
      const entry = issue as Partial<IssueFindingOutput>;
      const evidenceId =
        typeof entry.evidenceId === "string" ? entry.evidenceId.trim() : "";
      if (!evidenceId || !candidateIds.has(evidenceId)) {
        return null;
      }
      const summary = typeof entry.summary === "string" ? entry.summary.trim() : "";
      const category = typeof entry.category === "string" ? entry.category.trim() : "";
      if (!summary || !category) {
        return null;
      }
      return { evidenceId, summary, category };
    })
    .filter((issue): issue is IssueFindingOutput => Boolean(issue));
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

const sanitizePersonaImpacts = (
  personas: PersonaImpactRequest["personas"],
  raw: unknown,
): PersonaImpact[] => {
  if (typeof raw !== "object" || raw === null || !("impacts" in raw)) {
    return [];
  }

  const impacts = (raw as { impacts?: unknown }).impacts;
  if (!Array.isArray(impacts)) {
    return [];
  }

  const personaNames = new Set(personas.map((persona) => persona.name));
  const personaIds = new Map(
    personas
      .filter((persona) => persona.id)
      .map((persona) => [persona.name, persona.id as string]),
  );

  return impacts
    .map((impact) => {
      if (typeof impact !== "object" || impact === null) {
        return null;
      }
      const entry = impact as Partial<PersonaImpact>;
      const personaName =
        typeof entry.personaName === "string" ? entry.personaName.trim() : "";
      if (!personaName || !personaNames.has(personaName)) {
        return null;
      }
      const summary = typeof entry.summary === "string" ? entry.summary.trim() : "";
      if (!summary) {
        return null;
      }
      const signals = Array.isArray(entry.signals)
        ? entry.signals.filter((item) => typeof item === "string")
        : [];
      const confidence =
        entry.confidence === "high" || entry.confidence === "medium" || entry.confidence === "low"
          ? entry.confidence
          : "low";
      const sanitized: PersonaImpact = {
        personaId: personaIds.get(personaName),
        personaName,
        summary,
        signals,
        confidence,
      };
      return sanitized;
    })
    .filter((impact): impact is PersonaImpact => impact !== null);
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

export const analyzeIssueFindingsWithGemini = async (
  payload: IssueFindingPromptPayload,
): Promise<IssueFindingOutput[]> => {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY.");
  }

  const prompt = buildIssueFindingPrompt(payload);
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: prompt,
    config: {
      systemInstruction: "You identify issues using provided evidence only.",
      responseMimeType: "application/json",
    },
  });

  const text = extractText(response);
  if (!text) {
    return [];
  }

  try {
    const parsed = JSON.parse(text) as unknown;
    return sanitizeIssueFindings(payload.candidates, parsed);
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

export const analyzePersonaImpactsWithGemini = async (
  payload: PersonaImpactRequest,
): Promise<PersonaImpact[]> => {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY.");
  }

  const prompt = buildPersonaImpactPrompt(payload);
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: prompt,
    config: {
      systemInstruction: "You assess persona-level impact for UI changes.",
      responseMimeType: "application/json",
    },
  });

  const text = extractText(response);
  if (!text) {
    return [];
  }

  try {
    const parsed = JSON.parse(text) as unknown;
    return sanitizePersonaImpacts(payload.personas, parsed);
  } catch {
    return [];
  }
};
