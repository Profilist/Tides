import type { Express, Request } from "express";
import { createWriteStream } from "fs";
import { mkdir } from "fs/promises";
import path from "path";
import { gunzipSync, unzipSync } from "fflate";
import { saveAmplitudeEvents } from "../services/amplitude-store.ts";

const AMPLITUDE_DEFAULT_LIMIT = 1000;
const AMPLITUDE_MAX_LIMIT = 10000;
const AMPLITUDE_DEFAULT_HOURS_BACK = 24;

const zeroPad = (value: number, length = 2) =>
  String(value).padStart(length, "0");

const formatUtcHour = (date: Date) => {
  const year = date.getUTCFullYear();
  const month = zeroPad(date.getUTCMonth() + 1);
  const day = zeroPad(date.getUTCDate());
  const hour = zeroPad(date.getUTCHours());
  return `${year}${month}${day}T${hour}`;
};

const getAmplitudeEndpoint = () => {
  const explicitEndpoint = process.env.AMPLITUDE_EXPORT_ENDPOINT?.trim();
  if (explicitEndpoint) {
    return explicitEndpoint;
  }

  const region = process.env.AMPLITUDE_REGION?.trim().toLowerCase();
  if (region === "eu" || region === "europe" || region === "eu-residency") {
    return "https://analytics.eu.amplitude.com/api/2/export";
  }

  return "https://amplitude.com/api/2/export";
};

const getAmplitudeAuthHeader = () => {
  const apiKey = process.env.AMPLITUDE_API_KEY?.trim();
  const secretKey = process.env.AMPLITUDE_SECRET_KEY?.trim();

  if (!apiKey || !secretKey) {
    return null;
  }

  const token = Buffer.from(`${apiKey}:${secretKey}`).toString("base64");
  return `Basic ${token}`;
};

const clampLimit = (value: number) =>
  Math.min(Math.max(Math.trunc(value), 1), AMPLITUDE_MAX_LIMIT);

const parseRangeFromQuery = (query: Request["query"]) => {
  const start = typeof query.start === "string" ? query.start.trim() : "";
  const end = typeof query.end === "string" ? query.end.trim() : "";

  if (start && end) {
    return { start, end };
  }

  const hoursBackRaw =
    typeof query.hoursBack === "string" ? Number(query.hoursBack) : NaN;
  const hoursBack =
    Number.isFinite(hoursBackRaw) && hoursBackRaw > 0
      ? hoursBackRaw
      : AMPLITUDE_DEFAULT_HOURS_BACK;
  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - hoursBack * 60 * 60 * 1000);

  return {
    start: formatUtcHour(startDate),
    end: formatUtcHour(endDate),
  };
};

const parseAmplitudeZip = (
  zippedData: ArrayBuffer,
  limit: number,
  eventTypes?: Set<string>,
  onEvent?: (event: Record<string, unknown>) => void,
) => {
  const files = unzipSync(new Uint8Array(zippedData));
  const decoder = new TextDecoder("utf-8");
  const events: Record<string, unknown>[] = [];
  let totalEvents = 0;

  for (const data of Object.values(files)) {
    const bytes =
      data[0] === 0x1f && data[1] === 0x8b ? gunzipSync(data) : data;
    const text = decoder.decode(bytes);
    const lines = text.split("\n");

    for (const line of lines) {
      if (!line.trim()) {
        continue;
      }

      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(line) as Record<string, unknown>;
      } catch {
        continue;
      }

      if (eventTypes && typeof parsed.event_type === "string") {
        if (!eventTypes.has(parsed.event_type)) {
          totalEvents += 1;
          continue;
        }
      }

      totalEvents += 1;
      onEvent?.(parsed);
      if (events.length < limit) {
        events.push(parsed);
      }
    }
  }

  return {
    events,
    totalEvents,
    fileCount: Object.keys(files).length,
  };
};

export const registerAmplitudeRoutes = (app: Express) => {
  app.get("/api/sync-amplitude", async (req, res) => {
    const authHeader = getAmplitudeAuthHeader();
    if (!authHeader) {
      res.status(500).json({
        error: "Missing Amplitude API credentials.",
        hint: "Set AMPLITUDE_API_KEY and AMPLITUDE_SECRET_KEY in the environment.",
      });
      return;
    }

    const { start, end } = parseRangeFromQuery(req.query);
    const limitRaw =
      typeof req.query.limit === "string" ? Number(req.query.limit) : NaN;
    const limit = clampLimit(
      Number.isFinite(limitRaw) ? limitRaw : AMPLITUDE_DEFAULT_LIMIT,
    );
    const eventTypesRaw =
      typeof req.query.eventTypes === "string" ? req.query.eventTypes : "";
    const eventTypes = eventTypesRaw
      ? new Set(
          eventTypesRaw.split(",").map((item) => item.trim()).filter(Boolean),
        )
      : undefined;
    const saveToRaw =
      typeof req.query.saveTo === "string" ? req.query.saveTo.trim() : "";
    const saveToValue = saveToRaw.toLowerCase();
    const saveToSupabase =
      saveToValue === "supabase" ||
      saveToValue === "db" ||
      saveToValue === "database";
    const saveToEnabled = Boolean(saveToRaw);
    let savePath: string | null = null;
    let savedEvents = 0;
    let skippedEvents = 0;
    let fileStream: ReturnType<typeof createWriteStream> | null = null;
    const supabaseEvents: Record<string, unknown>[] = [];

    const endpoint = getAmplitudeEndpoint();
    const url = new URL(endpoint);
    url.searchParams.set("start", start);
    url.searchParams.set("end", end);

    try {
      const response = await fetch(url.toString(), {
        headers: {
          Authorization: authHeader,
        },
      });

      if (response.status === 404) {
        res.status(200).json({
          range: { start, end },
          fileCount: 0,
          totalEvents: 0,
          returnedEvents: 0,
          events: [],
        });
        return;
      }

      if (!response.ok) {
        const details = await response.text();
        res.status(response.status).json({
          error: "Amplitude export request failed.",
          status: response.status,
          details,
        });
        return;
      }

      const buffer = await response.arrayBuffer();
      if (saveToEnabled && !saveToSupabase) {
        const defaultDir = path.join(process.cwd(), "data", "amplitude");
        const isDefault =
          saveToRaw === "1" ||
          saveToRaw.toLowerCase() === "true" ||
          saveToRaw.toLowerCase() === "yes";
        savePath = isDefault
          ? path.join(defaultDir, `amplitude-${start}-${end}.jsonl`)
          : saveToRaw;
        await mkdir(path.dirname(savePath), { recursive: true });
        fileStream = createWriteStream(savePath, { encoding: "utf8" });
      }
      const { events, totalEvents, fileCount } = parseAmplitudeZip(
        buffer,
        limit,
        eventTypes,
        fileStream || saveToSupabase
          ? (event) => {
              if (fileStream) {
                fileStream.write(`${JSON.stringify(event)}\n`);
                savedEvents += 1;
              }
              if (saveToSupabase) {
                supabaseEvents.push(event);
              }
            }
          : undefined,
      );
      if (fileStream) {
        await new Promise<void>((resolve, reject) => {
          fileStream?.end();
          fileStream?.on("finish", resolve);
          fileStream?.on("error", reject);
        });
      }
      if (saveToSupabase) {
        const result = await saveAmplitudeEvents(supabaseEvents);
        savedEvents = result.savedEvents;
        skippedEvents = result.skippedEvents;
      }

      res.status(200).json({
        range: { start, end },
        fileCount,
        totalEvents,
        returnedEvents: events.length,
        events,
        ...(savePath ? { savedTo: savePath, savedEvents } : {}),
        ...(saveToSupabase
          ? { savedTo: "supabase", savedEvents, skippedEvents }
          : {}),
      });
    } catch (error) {
      res.status(500).json({
        error: "Failed to fetch Amplitude export data.",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });
};
