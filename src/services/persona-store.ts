import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { PersonaDefinition, PersonaSnapshot } from "../types/personas";

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

export const savePersonas = async (
  personas: PersonaDefinition[],
): Promise<{ personas: PersonaDefinition[]; snapshots: PersonaSnapshot[] }> => {
  if (personas.length === 0) {
    return { personas: [], snapshots: [] };
  }

  const client = getSupabaseClient();
  const savedPersonas: PersonaDefinition[] = [];
  const savedSnapshots: PersonaSnapshot[] = [];

  for (const persona of personas) {
    const { data: personaRows, error: personaError } = await client
      .from("personas")
      .upsert(
        {
          project_id: persona.projectId,
          name: persona.name,
          description: persona.description,
          rules_json: persona.rules,
          metrics_json: persona.metrics,
          sample_size: persona.sampleSize,
          range_start: persona.rangeStart,
          range_end: persona.rangeEnd,
        },
        { onConflict: "project_id,name" },
      )
      .select("id, project_id, name, description, rules_json, metrics_json, sample_size, range_start, range_end, created_at")
      .single();

    if (personaError || !personaRows) {
      throw new Error(personaError?.message ?? "Failed to save persona.");
    }

    const personaRecord: PersonaDefinition = {
      id: personaRows.id,
      projectId: personaRows.project_id,
      name: personaRows.name,
      description: personaRows.description,
      rules: personaRows.rules_json,
      metrics: personaRows.metrics_json,
      sampleSize: personaRows.sample_size,
      rangeStart: personaRows.range_start,
      rangeEnd: personaRows.range_end,
      createdAt: personaRows.created_at,
    };

    savedPersonas.push(personaRecord);

    const { data: snapshotRows, error: snapshotError } = await client
      .from("persona_snapshots")
      .insert({
        persona_id: personaRows.id,
        metrics_json: persona.metrics,
        sample_size: persona.sampleSize,
        range_start: persona.rangeStart,
        range_end: persona.rangeEnd,
      })
      .select("id, persona_id, metrics_json, sample_size, range_start, range_end, created_at")
      .single();

    if (snapshotError || !snapshotRows) {
      throw new Error(snapshotError?.message ?? "Failed to save persona snapshot.");
    }

    savedSnapshots.push({
      id: snapshotRows.id,
      personaId: snapshotRows.persona_id,
      metrics: snapshotRows.metrics_json,
      sampleSize: snapshotRows.sample_size,
      rangeStart: snapshotRows.range_start,
      rangeEnd: snapshotRows.range_end,
      createdAt: snapshotRows.created_at,
    });
  }

  return { personas: savedPersonas, snapshots: savedSnapshots };
};

export const fetchLatestPersonas = async (
  projectId: string,
  limit = 20,
): Promise<PersonaDefinition[]> => {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from("persona_snapshots")
    .select(
      "id, persona_id, metrics_json, sample_size, range_start, range_end, created_at, personas(id, project_id, name, description, rules_json, metrics_json, sample_size, range_start, range_end, created_at)",
    )
    .eq("personas.project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(error.message);
  }

  const seen = new Set<string>();
  const personas: PersonaDefinition[] = [];

  for (const row of data ?? []) {
    const persona = Array.isArray(row.personas) ? row.personas[0] : row.personas;
    if (!persona || seen.has(persona.id)) {
      continue;
    }
    seen.add(persona.id);
    personas.push({
      id: persona.id,
      projectId: persona.project_id,
      name: persona.name,
      description: persona.description,
      rules: persona.rules_json,
      metrics: row.metrics_json ?? persona.metrics_json,
      sampleSize: row.sample_size ?? persona.sample_size,
      rangeStart: row.range_start ?? persona.range_start,
      rangeEnd: row.range_end ?? persona.range_end,
      createdAt: row.created_at ?? persona.created_at,
    });
  }

  return personas;
};
