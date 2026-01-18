export type PersonaRule = {
  kind: "activity" | "engagement" | "conversion" | "event";
  field: string;
  operator: "gte" | "lte" | "eq";
  value: number | string;
};

export type PersonaMetrics = {
  avgEventCount: number;
  avgUniqueEventTypes: number;
  avgActiveSpanMinutes: number;
  avgConversionRate: number;
  topEvents: Array<{ eventType: string; count: number }>;
};

export type PersonaDefinition = {
  id?: string;
  projectId: string;
  name: string;
  description: string;
  rules: PersonaRule[];
  metrics: PersonaMetrics;
  sampleSize: number;
  rangeStart: string;
  rangeEnd: string;
  createdAt?: string;
};

export type PersonaSnapshot = {
  id?: string;
  personaId: string;
  metrics: PersonaMetrics;
  sampleSize: number;
  rangeStart: string;
  rangeEnd: string;
  createdAt?: string;
};

export type PersonaDerivationOptions = {
  projectId?: string;
  daysBack?: number;
  minUsers?: number;
  maxPersonas?: number;
  rangeStart?: string;
  rangeEnd?: string;
};

export type PersonaDerivationResult = {
  personas: PersonaDefinition[];
  meta: {
    totalEvents: number;
    totalUsers: number;
    rangeStart: string;
    rangeEnd: string;
  };
};

export type PersonaImpact = {
  personaId?: string;
  personaName: string;
  summary: string;
  signals: string[];
  confidence: "low" | "medium" | "high";
};

export type PersonaImpactRequest = {
  personas: PersonaDefinition[];
  issue?: import("./issues").Issue;
  analysis?: import("./issues").IssueAnalysis;
  project?: {
    id?: string;
    name?: string;
  };
  assets?: {
    demoHtml?: string;
    updatedHtml?: string;
    updatedHtmlDiff?: string;
    changeSummary?: string[];
  };
};
