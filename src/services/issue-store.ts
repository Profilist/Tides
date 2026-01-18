import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Issue } from "../types/issues";

const DEFAULT_TABLE = "issues";
const DEFAULT_CHUNK_SIZE = 1000;

const getSupabaseClient = (): SupabaseClient => {
  const url = process.env.SUPABASE_URL?.trim();
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.SUPABASE_ANON_KEY?.trim();

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Missing Supabase credentials (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY).",
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
};

const toIssueRow = (issue: Issue) => ({
  id: issue.id,
  metric: issue.metric,
  event_type: issue.eventType,
  direction: issue.direction,
  severity: issue.severity,
  delta_pct: issue.deltaPct,
  value_a: issue.valueA,
  value_b: issue.valueB,
  segment_json: issue.segment,
  window_a_json: issue.windowA,
  window_b_json: issue.windowB,
  sample_a_json: issue.sampleA,
  sample_b_json: issue.sampleB,
  summary: issue.summary ?? null,
  category: issue.category ?? null,
  page_names_json: issue.pageNames ?? null,
  evidence_json: issue.evidence ?? null,
  samples_json: issue.samples ?? null,
  derived_at: new Date().toISOString(),
  payload_json: issue,
});

type IssueRow = {
  payload_json?: Issue | null;
  id?: string | null;
  metric?: Issue["metric"] | null;
  event_type?: string | null;
  direction?: Issue["direction"] | null;
  severity?: Issue["severity"] | null;
  delta_pct?: number | null;
  value_a?: number | null;
  value_b?: number | null;
  segment_json?: Issue["segment"] | null;
  window_a_json?: Issue["windowA"] | null;
  window_b_json?: Issue["windowB"] | null;
  sample_a_json?: Issue["sampleA"] | null;
  sample_b_json?: Issue["sampleB"] | null;
  summary?: string | null;
  category?: string | null;
  page_names_json?: string[] | null;
  evidence_json?: Issue["evidence"] | null;
  samples_json?: Issue["samples"] | null;
};

const toIssue = (row: IssueRow): Issue | null => {
  const payload = row.payload_json ?? null;
  const baseId = payload?.id ?? row.id ?? null;
  const baseMetric = payload?.metric ?? row.metric ?? null;
  const baseEventType = payload?.eventType ?? row.event_type ?? null;
  const baseWindowA = payload?.windowA ?? row.window_a_json ?? null;
  const baseWindowB = payload?.windowB ?? row.window_b_json ?? null;

  if (!baseId || !baseMetric || !baseEventType || !baseWindowA || !baseWindowB) {
    return null;
  }

  return {
    id: baseId,
    metric: baseMetric,
    eventType: baseEventType,
    direction: payload?.direction ?? row.direction ?? "flat",
    severity: payload?.severity ?? row.severity ?? "low",
    deltaPct: payload?.deltaPct ?? row.delta_pct ?? 0,
    valueA: payload?.valueA ?? row.value_a ?? 0,
    valueB: payload?.valueB ?? row.value_b ?? 0,
    segment: payload?.segment ?? row.segment_json ?? {},
    windowA: baseWindowA,
    windowB: baseWindowB,
    sampleA: row.sample_a_json ?? payload?.sampleA ?? { eventCount: 0, uniqueUsers: 0 },
    sampleB: row.sample_b_json ?? payload?.sampleB ?? { eventCount: 0, uniqueUsers: 0 },
    summary: payload?.summary ?? row.summary ?? undefined,
    category: payload?.category ?? row.category ?? undefined,
    pageNames: payload?.pageNames ?? row.page_names_json ?? undefined,
    evidence: row.evidence_json ?? payload?.evidence ?? undefined,
    samples: row.samples_json ?? payload?.samples ?? undefined,
  };
};

export const fetchIssueById = async (issueId: string): Promise<Issue | null> => {
  const trimmedId = issueId.trim();
  if (!trimmedId) {
    return null;
  }

  const client = getSupabaseClient();
  const table = process.env.ISSUES_TABLE?.trim() || DEFAULT_TABLE;

  const { data, error } = await client
    .from(table)
    .select(
      [
        "payload_json",
        "id",
        "metric",
        "event_type",
        "direction",
        "severity",
        "delta_pct",
        "value_a",
        "value_b",
        "segment_json",
        "window_a_json",
        "window_b_json",
        "sample_a_json",
        "sample_b_json",
        "summary",
        "category",
        "page_names_json",
        "evidence_json",
        "samples_json",
      ].join(","),
    )
    .eq("id", trimmedId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    return null;
  }

  return toIssue(data as IssueRow);
};

export const saveIssues = async (
  issues: Issue[],
): Promise<{ savedIssues: number }> => {
  if (issues.length === 0) {
    return { savedIssues: 0 };
  }

  const client = getSupabaseClient();
  const table = process.env.ISSUES_TABLE?.trim() || DEFAULT_TABLE;
  const chunkSizeRaw = Number(process.env.ISSUES_CHUNK_SIZE);
  const chunkSize =
    Number.isFinite(chunkSizeRaw) && chunkSizeRaw > 0
      ? Math.floor(chunkSizeRaw)
      : DEFAULT_CHUNK_SIZE;

  for (let i = 0; i < issues.length; i += chunkSize) {
    const chunk = issues.slice(i, i + chunkSize).map(toIssueRow);
    const { error } = await client.from(table).upsert(chunk, { onConflict: "id" });
    if (error) {
      throw new Error(error.message);
    }
  }

  return { savedIssues: issues.length };
};

export const fetchRecentIssues = async (
  minutes = 5,
  limit = 50,
): Promise<Issue[]> => {
  const client = getSupabaseClient();
  const table = process.env.ISSUES_TABLE?.trim() || DEFAULT_TABLE;
  const clampedMinutes = Number.isFinite(minutes) && minutes > 0 ? minutes : 5;
  const clampedLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 50;
  const cutoff = new Date(Date.now() - clampedMinutes * 60 * 1000).toISOString();

  const { data, error } = await client
    .from(table)
    .select(
      [
        "payload_json",
        "id",
        "metric",
        "event_type",
        "direction",
        "severity",
        "delta_pct",
        "value_a",
        "value_b",
        "segment_json",
        "window_a_json",
        "window_b_json",
        "sample_a_json",
        "sample_b_json",
        "summary",
        "category",
        "page_names_json",
        "evidence_json",
        "samples_json",
        "derived_at",
      ].join(","),
    )
    .gte("derived_at", cutoff)
    .order("derived_at", { ascending: false })
    .limit(clampedLimit);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? [])
    .map((row) => toIssue(row as IssueRow))
    .filter((issue): issue is Issue => issue !== null);
};
