import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { PersonaImpact, PersonaImpactRequest } from "../types/personas";
import { analyzePersonaImpactsWithGemini } from "./llm";

export type PersonaImpactJobStatus = "pending" | "running" | "done" | "error";

export type PersonaImpactJob = {
  id: string;
  projectId: string;
  status: PersonaImpactJobStatus;
  request: PersonaImpactRequest;
  result?: PersonaImpact[];
  error?: string;
  createdAt: string;
  updatedAt: string;
};

const getSupabaseClient = (): SupabaseClient => {
  const url = process.env.SUPABASE_URL?.trim();
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.SUPABASE_ANON_KEY?.trim();

  if (!url || !serviceRoleKey) {
    throw new Error("Missing Supabase credentials (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY).");
  }

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
};

const toJob = (row: Record<string, unknown>): PersonaImpactJob => ({
  id: String(row.id),
  projectId: String(row.project_id ?? "default"),
  status: row.status as PersonaImpactJobStatus,
  request: row.request_json as PersonaImpactRequest,
  result: Array.isArray(row.result_json) ? (row.result_json as PersonaImpact[]) : undefined,
  error: typeof row.error === "string" ? row.error : undefined,
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at),
});

export const createPersonaImpactJob = async (
  payload: PersonaImpactRequest,
  projectId: string,
): Promise<PersonaImpactJob> => {
  const client = getSupabaseClient();
  const now = new Date().toISOString();
  const { data, error } = await client
    .from("persona_impact_jobs")
    .insert({
      project_id: projectId,
      status: "pending",
      request_json: payload,
      created_at: now,
      updated_at: now,
    })
    .select("id, project_id, status, request_json, result_json, error, created_at, updated_at")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create persona impact job.");
  }

  return toJob(data as Record<string, unknown>);
};

export const fetchPersonaImpactJob = async (jobId: string): Promise<PersonaImpactJob | null> => {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from("persona_impact_jobs")
    .select("id, project_id, status, request_json, result_json, error, created_at, updated_at")
    .eq("id", jobId)
    .single();

  if (error || !data) {
    return null;
  }

  return toJob(data as Record<string, unknown>);
};

const updatePersonaImpactJob = async (
  jobId: string,
  updates: Partial<Pick<PersonaImpactJob, "status" | "result" | "error">>,
): Promise<void> => {
  const client = getSupabaseClient();
  const payload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (updates.status) {
    payload.status = updates.status;
  }
  if (updates.result) {
    payload.result_json = updates.result;
  }
  if (updates.error !== undefined) {
    payload.error = updates.error;
  }

  const { error } = await client.from("persona_impact_jobs").update(payload).eq("id", jobId);
  if (error) {
    throw new Error(error.message);
  }
};

export const runPersonaImpactJob = async (jobId: string): Promise<PersonaImpactJob> => {
  const job = await fetchPersonaImpactJob(jobId);
  if (!job) {
    throw new Error("Persona impact job not found.");
  }
  if (job.status === "done") {
    return job;
  }

  await updatePersonaImpactJob(jobId, { status: "running", error: undefined });

  try {
    const personaImpacts = await analyzePersonaImpactsWithGemini(job.request);
    await updatePersonaImpactJob(jobId, { status: "done", result: personaImpacts });
  } catch (error) {
    await updatePersonaImpactJob(jobId, {
      status: "error",
      error: error instanceof Error ? error.message : String(error),
    });
  }

  const updated = await fetchPersonaImpactJob(jobId);
  if (!updated) {
    throw new Error("Persona impact job not found after update.");
  }
  return updated;
};
