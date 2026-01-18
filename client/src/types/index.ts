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

