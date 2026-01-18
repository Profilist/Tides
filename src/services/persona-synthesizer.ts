import type {
  PersonaDefinition,
  PersonaDerivationOptions,
  PersonaDerivationResult,
  PersonaMetrics,
  PersonaRule,
} from "../types/personas";

type RawEvent = Record<string, unknown>;

type UserStats = {
  eventCount: number;
  uniqueEventTypes: Set<string>;
  firstEventAt: Date | null;
  lastEventAt: Date | null;
  eventTypeCounts: Map<string, number>;
  viewCount: number;
  clickCount: number;
  conversionCount: number;
};

const DEFAULT_DAYS_BACK = 30;
const DEFAULT_MIN_USERS = 20;
const DEFAULT_MAX_PERSONAS = 4;

const EVENT_TIME_FIELDS = [
  "event_time",
  "server_received_time",
  "server_upload_time",
  "client_event_time",
];

const USER_ID_FIELDS = ["user_id", "device_id", "amplitude_id", "uuid"];

const CONVERSION_KEYWORDS = [
  "purchase",
  "checkout",
  "order",
  "payment",
  "subscribe",
  "signup",
  "sign_up",
  "complete",
];

const VIEW_KEYWORDS = ["view", "page_view", "screen_view", "product_view"];
const CLICK_KEYWORDS = ["click", "tap", "press"];

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

const getEventType = (event: RawEvent) =>
  typeof event.event_type === "string" ? event.event_type.trim() : "unknown";

const matchesKeyword = (value: string, keywords: string[]) => {
  const lower = value.toLowerCase();
  return keywords.some((keyword) => lower.includes(keyword));
};

const percentile = (values: number[], pct: number): number => {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor(pct * sorted.length)));
  return sorted[index] ?? 0;
};

const toIso = (date: Date) => date.toISOString();

const buildMetrics = (users: UserStats[]): PersonaMetrics => {
  if (users.length === 0) {
    return {
      avgEventCount: 0,
      avgUniqueEventTypes: 0,
      avgActiveSpanMinutes: 0,
      avgConversionRate: 0,
      topEvents: [],
    };
  }

  let totalEvents = 0;
  let totalUnique = 0;
  let totalSpan = 0;
  let totalConversionRate = 0;
  const eventCounts = new Map<string, number>();

  for (const user of users) {
    totalEvents += user.eventCount;
    totalUnique += user.uniqueEventTypes.size;
    const spanMinutes =
      user.firstEventAt && user.lastEventAt
        ? (user.lastEventAt.getTime() - user.firstEventAt.getTime()) / 60000
        : 0;
    totalSpan += spanMinutes;
    const denom = user.viewCount + user.clickCount;
    const conversionRate = denom > 0 ? user.conversionCount / denom : 0;
    totalConversionRate += conversionRate;

    for (const [eventType, count] of user.eventTypeCounts.entries()) {
      eventCounts.set(eventType, (eventCounts.get(eventType) ?? 0) + count);
    }
  }

  const topEvents = [...eventCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([eventType, count]) => ({ eventType, count }));

  return {
    avgEventCount: totalEvents / users.length,
    avgUniqueEventTypes: totalUnique / users.length,
    avgActiveSpanMinutes: totalSpan / users.length,
    avgConversionRate: totalConversionRate / users.length,
    topEvents,
  };
};

const buildPersona = (
  projectId: string,
  name: string,
  description: string,
  rules: PersonaRule[],
  users: UserStats[],
  rangeStart: Date,
  rangeEnd: Date,
): PersonaDefinition => ({
  projectId,
  name,
  description,
  rules,
  metrics: buildMetrics(users),
  sampleSize: users.length,
  rangeStart: toIso(rangeStart),
  rangeEnd: toIso(rangeEnd),
});

export const derivePersonas = (
  events: RawEvent[],
  options: PersonaDerivationOptions = {},
): PersonaDerivationResult => {
  const projectId = options.projectId?.trim() || "default";
  const daysBack = options.daysBack ?? DEFAULT_DAYS_BACK;
  const minUsers = options.minUsers ?? DEFAULT_MIN_USERS;
  const maxPersonas = options.maxPersonas ?? DEFAULT_MAX_PERSONAS;

  const now = new Date();
  const rangeEnd = options.rangeEnd ? parseDate(options.rangeEnd) ?? now : now;
  const rangeStart =
    options.rangeStart ? parseDate(options.rangeStart) ?? null : null;
  const derivedStart =
    rangeStart ??
    new Date(rangeEnd.getTime() - daysBack * 24 * 60 * 60 * 1000);

  const userStats = new Map<string, UserStats>();
  let totalEvents = 0;

  for (const event of events) {
    const eventTime = getEventTime(event);
    if (!eventTime) {
      continue;
    }
    if (eventTime < derivedStart || eventTime > rangeEnd) {
      continue;
    }

    totalEvents += 1;
    const userId = getUserId(event);
    const eventType = getEventType(event);
    const stats =
      userStats.get(userId) ??
      ({
        eventCount: 0,
        uniqueEventTypes: new Set<string>(),
        firstEventAt: null,
        lastEventAt: null,
        eventTypeCounts: new Map<string, number>(),
        viewCount: 0,
        clickCount: 0,
        conversionCount: 0,
      } satisfies UserStats);

    stats.eventCount += 1;
    stats.uniqueEventTypes.add(eventType);
    stats.eventTypeCounts.set(eventType, (stats.eventTypeCounts.get(eventType) ?? 0) + 1);
    stats.firstEventAt = stats.firstEventAt
      ? new Date(Math.min(stats.firstEventAt.getTime(), eventTime.getTime()))
      : eventTime;
    stats.lastEventAt = stats.lastEventAt
      ? new Date(Math.max(stats.lastEventAt.getTime(), eventTime.getTime()))
      : eventTime;

    if (matchesKeyword(eventType, VIEW_KEYWORDS)) {
      stats.viewCount += 1;
    }
    if (matchesKeyword(eventType, CLICK_KEYWORDS)) {
      stats.clickCount += 1;
    }
    if (matchesKeyword(eventType, CONVERSION_KEYWORDS)) {
      stats.conversionCount += 1;
    }

    userStats.set(userId, stats);
  }

  const allUsers = [...userStats.values()];
  const eventCounts = allUsers.map((user) => user.eventCount);
  const uniqueEventCounts = allUsers.map((user) => user.uniqueEventTypes.size);
  const p25Events = percentile(eventCounts, 0.25);
  const p75Events = percentile(eventCounts, 0.75);
  const p75Unique = percentile(uniqueEventCounts, 0.75);

  const candidates: Array<{
    name: string;
    description: string;
    rules: PersonaRule[];
    users: UserStats[];
  }> = [];

  const highActivityUsers = allUsers.filter((user) => user.eventCount >= p75Events);
  candidates.push({
    name: "High Activity",
    description: "Users with higher-than-normal activity in the last 30 days.",
    rules: [
      { kind: "activity", field: "eventCount", operator: "gte", value: p75Events },
    ],
    users: highActivityUsers,
  });

  const lowActivityUsers = allUsers.filter((user) => user.eventCount <= p25Events);
  candidates.push({
    name: "Low Activity",
    description: "Users with minimal engagement recently.",
    rules: [
      { kind: "activity", field: "eventCount", operator: "lte", value: p25Events },
    ],
    users: lowActivityUsers,
  });

  const explorerUsers = allUsers.filter(
    (user) => user.uniqueEventTypes.size >= p75Unique,
  );
  candidates.push({
    name: "Explorers",
    description: "Users who touch many different event types.",
    rules: [
      { kind: "engagement", field: "uniqueEventTypes", operator: "gte", value: p75Unique },
    ],
    users: explorerUsers,
  });

  const converterUsers = allUsers.filter((user) => {
    const denom = user.viewCount + user.clickCount;
    const conversionRate = denom > 0 ? user.conversionCount / denom : 0;
    return user.conversionCount > 0 && conversionRate >= 0.2;
  });
  candidates.push({
    name: "Converters",
    description: "Users who frequently reach conversion events.",
    rules: [
      { kind: "conversion", field: "conversionRate", operator: "gte", value: 0.2 },
    ],
    users: converterUsers,
  });

  const personas = candidates
    .filter((candidate) => candidate.users.length >= minUsers)
    .sort((a, b) => b.users.length - a.users.length)
    .slice(0, maxPersonas)
    .map((candidate) =>
      buildPersona(
        projectId,
        candidate.name,
        candidate.description,
        candidate.rules,
        candidate.users,
        derivedStart,
        rangeEnd,
      ),
    );

  if (personas.length === 0 && allUsers.length >= minUsers) {
    personas.push(
      buildPersona(
        projectId,
        "All Users",
        "All active users within the selected window.",
        [{ kind: "activity", field: "eventCount", operator: "gte", value: 1 }],
        allUsers,
        derivedStart,
        rangeEnd,
      ),
    );
  }

  return {
    personas,
    meta: {
      totalEvents,
      totalUsers: allUsers.length,
      rangeStart: toIso(derivedStart),
      rangeEnd: toIso(rangeEnd),
    },
  };
};
