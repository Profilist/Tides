import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const DEFAULT_TABLE = "amplitude_events";
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

const toAmplitudeRow = (event: Record<string, unknown>) => {
  const insertId =
    typeof event.$insert_id === "string"
      ? event.$insert_id
      : typeof event.uuid === "string"
        ? event.uuid
        : null;

  if (!insertId) {
    return null;
  }

  return {
    insert_id: insertId,
    event_type: typeof event.event_type === "string" ? event.event_type : null,
    event_time: typeof event.event_time === "string" ? event.event_time : null,
    user_id: typeof event.user_id === "string" ? event.user_id : null,
    device_id: typeof event.device_id === "string" ? event.device_id : null,
    amplitude_id:
      typeof event.amplitude_id === "number" ? event.amplitude_id : null,
    payload_json: event,
  };
};

export const saveAmplitudeEvents = async (
  events: Record<string, unknown>[],
): Promise<{ savedEvents: number; skippedEvents: number }> => {
  if (events.length === 0) {
    return { savedEvents: 0, skippedEvents: 0 };
  }

  const client = getSupabaseClient();
  const table = process.env.AMPLITUDE_EVENTS_TABLE?.trim() || DEFAULT_TABLE;
  const chunkSizeRaw = Number(process.env.AMPLITUDE_EVENTS_CHUNK_SIZE);
  const chunkSize =
    Number.isFinite(chunkSizeRaw) && chunkSizeRaw > 0
      ? Math.floor(chunkSizeRaw)
      : DEFAULT_CHUNK_SIZE;

  const rows: ReturnType<typeof toAmplitudeRow>[] = [];
  let skippedEvents = 0;

  for (const event of events) {
    const row = toAmplitudeRow(event);
    if (row) {
      rows.push(row);
    } else {
      skippedEvents += 1;
    }
  }

  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await client
      .from(table)
      .upsert(chunk, { onConflict: "insert_id" });

    if (error) {
      throw new Error(error.message);
    }
  }

  return { savedEvents: rows.length, skippedEvents };
};
