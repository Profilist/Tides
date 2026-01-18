import { createHash } from "node:crypto";
import type {
  Issue,
  IssueEvidence,
  IssueFindOptions,
  IssueSamples,
  IssueWindow,
} from "../types/issues";
import { analyzeIssueFindingsWithGemini } from "./llm";

type RawEvent = Record<string, unknown>;

type WindowStats = {
  eventCount: number;
  users: Set<string>;
  samples: IssueSamples["events"];
  sampleUsers: Set<string>;
};

type Candidate = {
  id: string;
  eventType: string;
  segment: Record<string, string>;
  windowA: IssueWindow;
  windowB: IssueWindow;
  valueA: number;
  valueB: number;
  deltaPct: number;
  direction: Issue["direction"];
  severity: Issue["severity"];
  sampleA: Issue["sampleA"];
  sampleB: Issue["sampleB"];
  evidence: IssueEvidence;
  samples: IssueSamples;
};

type LlmIssue = {
  evidenceId: string;
  summary: string;
  category: string;
};

const EVENT_TIME_FIELDS = [
  "event_time",
  "server_received_time",
  "server_upload_time",
  "client_event_time",
];

const USER_ID_FIELDS = ["user_id", "device_id", "amplitude_id", "uuid"];

const DEFAULT_WINDOW_DAYS = 7;
const DEFAULT_TOP_N = 6;
const DEFAULT_MIN_USERS = 1;
const DEFAULT_SAMPLE_SIZE = 3;

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
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === "string" || typeof value === "number") {
    const normalized = typeof value === "string" ? normalizeTimestamp(value) : value;
    const date = new Date(normalized);
    return Number.isNaN(date.getTime()) ? null : date;
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

const anonymizeUserId = (userId: string) =>
  `user_${createHash("sha256").update(userId).digest("hex").slice(0, 8)}`;

const getEventType = (event: RawEvent) =>
  typeof event.event_type === "string" && event.event_type.trim()
    ? event.event_type.trim()
    : "unknown";

const getEventId = (event: RawEvent) => {
  if (typeof event.$insert_id === "string" && event.$insert_id.trim()) {
    return event.$insert_id.trim();
  }
  if (typeof event.uuid === "string" && event.uuid.trim()) {
    return event.uuid.trim();
  }
  if (typeof event.event_id === "number") {
    return String(event.event_id);
  }
  return null;
};

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

const buildWindow = (start: Date, end: Date): IssueWindow => ({
  start: start.toISOString(),
  end: end.toISOString(),
});

const initStats = (): WindowStats => ({
  eventCount: 0,
  users: new Set<string>(),
  samples: [],
  sampleUsers: new Set<string>(),
});

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

const computeDeltaPct = (valueA: number, valueB: number) =>
  valueB === 0 ? (valueA === 0 ? 0 : 100) : ((valueA - valueB) / valueB) * 100;

const buildEvidence = (
  windowA: WindowStats,
  windowB: WindowStats,
): IssueEvidence => {
  const deltaEventCount = windowA.eventCount - windowB.eventCount;
  const deltaUsers = windowA.users.size - windowB.users.size;
  const deltaPctEventCount = computeDeltaPct(
    windowA.eventCount,
    windowB.eventCount,
  );
  const deltaPctUsers = computeDeltaPct(windowA.users.size, windowB.users.size);

  return {
    windowA: {
      eventCount: windowA.eventCount,
      uniqueUsers: windowA.users.size,
    },
    windowB: {
      eventCount: windowB.eventCount,
      uniqueUsers: windowB.users.size,
    },
    delta: {
      eventCount: deltaEventCount,
      uniqueUsers: deltaUsers,
    },
    deltaPct: {
      eventCount: deltaPctEventCount,
      uniqueUsers: deltaPctUsers,
    },
  };
};

const buildSamples = (
  windowA: WindowStats,
  windowB: WindowStats,
  sampleSize: number,
): IssueSamples => {
  const events = [...windowA.samples, ...windowB.samples].slice(0, sampleSize * 2);
  const users = [
    ...new Set([
      ...[...windowA.sampleUsers].map(anonymizeUserId),
      ...[...windowB.sampleUsers].map(anonymizeUserId),
    ]),
  ].slice(0, sampleSize);
  return { events, users };
};

const toCandidate = (
  id: string,
  eventType: string,
  segment: Record<string, string>,
  windowAStats: WindowStats,
  windowBStats: WindowStats,
  windowA: IssueWindow,
  windowB: IssueWindow,
  sampleSize: number,
): Candidate => {
  const usersA = windowAStats.users.size;
  const usersB = windowBStats.users.size;
  const valueA = usersA === 0 ? 0 : windowAStats.eventCount / usersA;
  const valueB = usersB === 0 ? 0 : windowBStats.eventCount / usersB;
  const deltaPct = computeDeltaPct(valueA, valueB);
  const direction: Issue["direction"] =
    deltaPct > 0 ? "increase" : deltaPct < 0 ? "decrease" : "flat";

  const evidence = buildEvidence(windowAStats, windowBStats);
  const samples = buildSamples(windowAStats, windowBStats, sampleSize);

  return {
    id,
    eventType,
    segment,
    windowA,
    windowB,
    valueA,
    valueB,
    deltaPct,
    direction,
    severity: getSeverity(deltaPct),
    sampleA: {
      eventCount: windowAStats.eventCount,
      uniqueUsers: usersA,
    },
    sampleB: {
      eventCount: windowBStats.eventCount,
      uniqueUsers: usersB,
    },
    evidence,
    samples,
  };
};

const buildCandidates = (events: RawEvent[], options: IssueFindOptions = {}) => {
  const windowDays = options.windowDays ?? DEFAULT_WINDOW_DAYS;
  const minUsers = options.minUsers ?? DEFAULT_MIN_USERS;
  const sampleSize = options.sampleSize ?? DEFAULT_SAMPLE_SIZE;
  const segmentBy = options.segmentBy ?? ["event_type"];

  const validEvents = events
    .map((event) => ({ event, time: getEventTime(event) }))
    .filter((entry) => entry.time !== null) as Array<{ event: RawEvent; time: Date }>;

  if (validEvents.length === 0) {
    return { candidates: [] as Candidate[], windowA: null, windowB: null };
  }

  const firstEvent = validEvents[0];
  if (!firstEvent) {
    return { candidates: [] as Candidate[], windowA: null, windowB: null };
  }
  const endDate = validEvents.reduce(
    (latest, entry) => (entry.time > latest ? entry.time : latest),
    firstEvent.time,
  );
  const startA = new Date(endDate.getTime() - windowDays * 24 * 60 * 60 * 1000);
  const endA = endDate;
  const endB = startA;
  const startB = new Date(endB.getTime() - windowDays * 24 * 60 * 60 * 1000);

  const windowA = buildWindow(startA, endA);
  const windowB = buildWindow(startB, endB);

  const stats = new Map<
    string,
    { values: Record<string, string>; windowA: WindowStats; windowB: WindowStats }
  >();

  for (const { event, time } of validEvents) {
    const { key, values } = normalizeSegment(event, segmentBy);
    const entry =
      stats.get(key) ??
      (() => {
        const created = { values, windowA: initStats(), windowB: initStats() };
        stats.set(key, created);
        return created;
      })();
    const userId = getUserId(event);
    const eventId = getEventId(event);
    const timestamp = time.toISOString();
    const window =
      time >= startA && time <= endA ? "A" : time >= startB && time <= endB ? "B" : null;
    if (!window) {
      continue;
    }
    const target = window === "A" ? entry.windowA : entry.windowB;
    target.eventCount += 1;
    target.users.add(userId);
    if (eventId && target.samples.length < sampleSize) {
      target.samples.push({ id: eventId, timestamp, window });
    }
    if (target.sampleUsers.size < sampleSize) {
      target.sampleUsers.add(userId);
    }
  }

  const candidates: Candidate[] = [];
  let index = 1;
  for (const [key, entry] of stats.entries()) {
    const usersA = entry.windowA.users.size;
    const usersB = entry.windowB.users.size;
    if (usersA < minUsers && usersB < minUsers) {
      continue;
    }
    const eventType = entry.values.event_type ?? "all";
    const candidateId = `ai_${index}_${key.replace(/[^a-zA-Z0-9_-]+/g, "_")}`;
    candidates.push(
      toCandidate(
        candidateId,
        eventType,
        entry.values,
        entry.windowA,
        entry.windowB,
        windowA,
        windowB,
        sampleSize,
      ),
    );
    index += 1;
  }

  return { candidates, windowA, windowB };
};

const toLlmCandidate = (candidate: Candidate) => ({
  id: candidate.id,
  eventType: candidate.eventType,
  segment: candidate.segment,
  windowA: candidate.windowA,
  windowB: candidate.windowB,
  evidence: candidate.evidence,
  samples: candidate.samples,
  deltaPct: candidate.deltaPct,
  direction: candidate.direction,
  severity: candidate.severity,
});

export const deriveIssues = async (
  events: RawEvent[],
  options: IssueFindOptions = {},
): Promise<Issue[]> => {
  const topN = options.topN ?? DEFAULT_TOP_N;
  const { candidates, windowA, windowB } = buildCandidates(events, options);
  if (!windowA || !windowB || candidates.length === 0) {
    return [];
  }

  const ranked = [...candidates].sort(
    (a, b) => Math.abs(b.deltaPct) - Math.abs(a.deltaPct),
  );
  const llmCandidates = ranked.slice(0, topN).map(toLlmCandidate);

  const aiIssues = await analyzeIssueFindingsWithGemini({
    candidates: llmCandidates,
    meta: { windowA, windowB },
  });

  if (aiIssues.length === 0) {
    return [];
  }

  const candidateMap = new Map(candidates.map((candidate) => [candidate.id, candidate]));

  const results: Issue[] = [];
  for (const issue of aiIssues) {
    const candidate = candidateMap.get(issue.evidenceId);
    if (!candidate) {
      continue;
    }
    results.push({
      id: candidate.id,
      metric: "event_rate",
      eventType: candidate.eventType,
      segment: candidate.segment,
      windowA: candidate.windowA,
      windowB: candidate.windowB,
      valueA: candidate.valueA,
      valueB: candidate.valueB,
      deltaPct: candidate.deltaPct,
      direction: candidate.direction,
      severity: candidate.severity,
      sampleA: candidate.sampleA,
      sampleB: candidate.sampleB,
      summary: issue.summary,
      category: issue.category,
      evidence: candidate.evidence,
      samples: candidate.samples,
    });
  }
  return results;
};
