export type IssueWindow = {
  start: string;
  end: string;
};

export type IssueMetric = "event_rate";

export type Issue = {
  id: string;
  metric: IssueMetric;
  eventType: string;
  segment: Record<string, string>;
  windowA: IssueWindow;
  windowB: IssueWindow;
  valueA: number;
  valueB: number;
  deltaPct: number;
  direction: "increase" | "decrease" | "flat";
  severity: "low" | "medium" | "high";
  sampleA: {
    eventCount: number;
    uniqueUsers: number;
  };
  sampleB: {
    eventCount: number;
    uniqueUsers: number;
  };
  summary?: string;
  category?: string;
  pageNames?: string[];
  evidence?: IssueEvidence;
  samples?: IssueSamples;
};

export type IssueEvidence = {
  windowA: {
    eventCount: number;
    uniqueUsers: number;
  };
  windowB: {
    eventCount: number;
    uniqueUsers: number;
  };
  delta: {
    eventCount: number;
    uniqueUsers: number;
  };
  deltaPct: {
    eventCount: number;
    uniqueUsers: number;
  };
};

export type IssueSamples = {
  events: Array<{
    id: string;
    timestamp: string;
    window: "A" | "B";
  }>;
  users: string[];
};

export type IssueDetectionOptions = {
  eventType?: string;
  segmentBy?: string[];
  minUsers?: number;
  minDeltaPct?: number;
  topN?: number;
  windowA?: IssueWindow;
  windowB?: IssueWindow;
};

export type IssueFindOptions = {
  windowDays?: number;
  topN?: number;
  segmentBy?: string[];
  minUsers?: number;
  sampleSize?: number;
};

export type IssueAnalysis = {
  issueId: string;
  summary: string;
  evidence: string[];
  confidence: "low" | "medium" | "high";
};

export type IssueAnalysisRequest = {
  issues: Issue[];
  project?: {
    id?: string;
    name?: string;
  };
  assets?: {
    screenshotUrl?: string;
    codeSnippet?: string;
  };
};

export type UiScreenshot = {
  url: string;
  caption?: string;
};

export type UiSuggestionRequest = {
  issue: Issue;
  analysis?: IssueAnalysis;
  project?: {
    id?: string;
    name?: string;
  };
  assets?: {
    screenshots?: UiScreenshot[];
    demoHtml?: string;
  };
};

export type UiSuggestion = {
  updatedHtml: string;
  changeSummary: string[];
  rationale: string;
  confidence: "low" | "medium" | "high";
  warnings?: string[];
};
