export interface SelectedShape {
  id: string;
  type: string;
  name?: string;
}

export interface ChatContextShape {
  id: string;
  type: string;
  name: string;
}

export interface PersonaImpact {
  personaId?: string;
  personaName: string;
  summary: string;
  signals: string[];
  confidence: 'low' | 'medium' | 'high';
}

export interface IssueWindow {
  start: string;
  end: string;
}

export interface IssueEvidence {
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
}

export interface IssueSamples {
  events: Array<{
    id: string;
    timestamp: string;
    window: 'A' | 'B';
  }>;
  users: string[];
}

export interface Issue {
  id: string;
  metric: 'event_rate';
  eventType: string;
  segment: Record<string, string>;
  windowA: IssueWindow;
  windowB: IssueWindow;
  valueA: number;
  valueB: number;
  deltaPct: number;
  direction: 'increase' | 'decrease' | 'flat';
  severity: 'low' | 'medium' | 'high';
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
}

export interface PageScreenshot {
  id: string;
  url: string;
  label?: string | null;
  width?: number | null;
  height?: number | null;
}

export interface IssuePage {
  id: string;
  name: string;
  title?: string | null;
  screenshots: PageScreenshot[];
}

