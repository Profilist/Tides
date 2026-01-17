import type { Issue, IssueDetectionOptions, IssueWindow } from "../types/issues";

type RawEvent = Record<string, unknown>;

type SegmentStats = {
  eventCount: number;
  users: Set<string>;
};

const DEFAULT_WINDOW_DAYS = 7;
const DEFAULT_TOP_N = 5;
const DEFAULT_MIN_USERS = 20;
const DEFAULT_MIN_DELTA_PCT = 20;

const EVENT_TIME_FIELDS = [
  "event_time",
  "server_received_time",
  "server_upload_time",
  "client_event_time",
];

const USER_ID_FIELDS = ["user_id", "device_id", "amplitude_id", "uuid"];

const isValidDate = (value: Date) => !Number.isNaN(value.getTime());

const normalizeTimestamp = (value: string) => {
  const trimmed = value.trim();
  const match = trimmed.match(
    /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?$/,
  );
  if (!match) {
    return trimmed;
  }
  const [, date, time, fractional = ""] = match;
  const millis = fractional.padEnd(3, "0").slice(0, 3);
  return `${date}T${time}.${millis}Z`;
};

const parseDate = (value: unknown) => {
  if (value instanceof Date) {
    return isValidDate(value) ? value : null;
  }
  if (typeof value === "string" || typeof value === "number") {
    const normalized = typeof value === "string" ? normalizeTimestamp(value) : value;
    const date = new Date(normalized);
    return isValidDate(date) ? date : null;
  }
  return null;
};

const getEventTime = (event: RawEvent) => {
  for (const field of EVENT_TIME_FIELDS) {
    const date = parseDate(event[field]);
    if (date) {
      return date;
    }
  }
  return null;
};

const getUserId = (event: RawEvent) => {
  for (const field of USER_ID_FIELDS) {
    const value = event[field];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
    if (typeof value === "number") {
      return String(value);
    }
  }
  return "anonymous";
};

const toWindow = (start: Date, end: Date): IssueWindow => ({
  start: start.toISOString(),
  end: end.toISOString(),
});

const parseWindow = (window?: IssueWindow) => {
  if (!window?.start || !window?.end) {
    return null;
  }
  const start = parseDate(window.start);
  const end = parseDate(window.end);
  if (!start || !end) {
    return null;
  }
  return { start, end };
};

const createDefaultWindows = () => {
  const now = new Date();
  const endA = now;
  const startA = new Date(now.getTime() - DEFAULT_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const endB = startA;
  const startB = new Date(
    startA.getTime() - DEFAULT_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  );
  return {
    windowA: { start: startA, end: endA },
    windowB: { start: startB, end: endB },
  };
};

const isWithinWindow = (date: Date, window: { start: Date; end: Date }) =>
  date >= window.start && date <= window.end;

const normalizeSegment = (event: RawEvent, segmentBy: string[]) => {
  if (segmentBy.length === 0) {
    return { key: "all", values: {} as Record<string, string> };
  }

  const values: Record<string, string> = {};
  const parts: string[] = [];

  for (const field of segmentBy) {
    const raw = event[field];
    const value =
      raw === undefined || raw === null ? "unknown" : String(raw).trim() || "unknown";
    values[field] = value;
    parts.push(`${field}:${value}`);
  }

  return { key: parts.join("|"), values };
};

const getOrCreateStats = (map: Map<string, SegmentStats>, key: string) => {
  const existing = map.get(key);
  if (existing) {
    return existing;
  }
  const stats: SegmentStats = { eventCount: 0, users: new Set<string>() };
  map.set(key, stats);
  return stats;
};

const getSeverity = (deltaPct: number): Issue["severity"] => {
  const absDelta = Math.abs(deltaPct);
  if (absDelta >= 50) {
    return "high";
  }
  if (absDelta >= 25) {
    return "medium";
  }
  return "low";
};

export const deriveIssues = (
  events: RawEvent[],
  options: IssueDetectionOptions = {},
) => {
  const eventType = options.eventType?.trim();
  const segmentBy = options.segmentBy ?? ["country"];
  const minUsers = options.minUsers ?? DEFAULT_MIN_USERS;
  const minDeltaPct = options.minDeltaPct ?? DEFAULT_MIN_DELTA_PCT;
  const topN = options.topN ?? DEFAULT_TOP_N;

  const parsedWindowA = parseWindow(options.windowA);
  const parsedWindowB = parseWindow(options.windowB);
  const fallbackWindows = createDefaultWindows();
  const windowA = parsedWindowA ?? fallbackWindows.windowA;
  const windowB = parsedWindowB ?? fallbackWindows.windowB;

  const windowAStats = new Map<string, SegmentStats>();
  const windowBStats = new Map<string, SegmentStats>();
  const segmentValues = new Map<string, Record<string, string>>();

  for (const event of events) {
    if (eventType && event.event_type !== eventType) {
      continue;
    }

    const eventTime = getEventTime(event);
    if (!eventTime) {
      continue;
    }

    const { key, values } = normalizeSegment(event, segmentBy);
    segmentValues.set(key, values);
    const userId = getUserId(event);

    if (isWithinWindow(eventTime, windowA)) {
      const stats = getOrCreateStats(windowAStats, key);
      stats.eventCount += 1;
      stats.users.add(userId);
    } else if (isWithinWindow(eventTime, windowB)) {
      const stats = getOrCreateStats(windowBStats, key);
      stats.eventCount += 1;
      stats.users.add(userId);
    }
  }

  const issues: Issue[] = [];
  let index = 1;

  for (const [key, values] of segmentValues.entries()) {
    const statsA = windowAStats.get(key) ?? { eventCount: 0, users: new Set() };
    const statsB = windowBStats.get(key) ?? { eventCount: 0, users: new Set() };
    const usersA = statsA.users.size;
    const usersB = statsB.users.size;

    if (usersA < minUsers || usersB < minUsers) {
      continue;
    }

    const valueA = usersA === 0 ? 0 : statsA.eventCount / usersA;
    const valueB = usersB === 0 ? 0 : statsB.eventCount / usersB;
    const deltaPct =
      valueB === 0 ? (valueA === 0 ? 0 : 100) : ((valueA - valueB) / valueB) * 100;

    if (Math.abs(deltaPct) < minDeltaPct) {
      continue;
    }

    const direction: Issue["direction"] =
      deltaPct > 0 ? "increase" : deltaPct < 0 ? "decrease" : "flat";

    issues.push({
      id: `iss_${index}_${key.replace(/[^a-zA-Z0-9_-]+/g, "_")}`,
      metric: "event_rate",
      eventType: eventType ?? "all",
      segment: values,
      windowA: toWindow(windowA.start, windowA.end),
      windowB: toWindow(windowB.start, windowB.end),
      valueA,
      valueB,
      deltaPct,
      direction,
      severity: getSeverity(deltaPct),
      sampleA: {
        eventCount: statsA.eventCount,
        uniqueUsers: usersA,
      },
      sampleB: {
        eventCount: statsB.eventCount,
        uniqueUsers: usersB,
      },
    });
    index += 1;
  }

  issues.sort((a, b) => Math.abs(b.deltaPct) - Math.abs(a.deltaPct));
  return issues.slice(0, topN);
};
