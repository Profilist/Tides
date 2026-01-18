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
  evidence_json: issue.evidence ?? null,
  samples_json: issue.samples ?? null,
  derived_at: new Date().toISOString(),
  payload_json: issue,
});

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
