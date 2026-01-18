import type { PersonaImpact } from '../../types';

type InspectPanelProps = {
  personaImpacts: PersonaImpact[];
  personaImpactStatus: 'idle' | 'pending' | 'running' | 'done' | 'error';
  personaImpactError: string | null;
};

export function InspectPanel({
  personaImpacts,
  personaImpactStatus,
  personaImpactError,
}: InspectPanelProps) {
  return (
    <div className="p-4 text-sm text-slate-600 space-y-3">
      <div className="font-semibold text-slate-800">Persona impacts</div>
      {personaImpactStatus === 'idle' && (
        <div className="text-slate-400">Run a suggestion to see persona impacts.</div>
      )}
      {personaImpactStatus === 'pending' || personaImpactStatus === 'running' ? (
        <div className="text-slate-400">Loading persona impacts...</div>
      ) : null}
      {personaImpactStatus === 'error' && (
        <div className="text-rose-500">
          Failed to load persona impacts{personaImpactError ? `: ${personaImpactError}` : '.'}
        </div>
      )}
      {personaImpactStatus === 'done' && personaImpacts.length === 0 && (
        <div className="text-slate-400">No persona impacts returned.</div>
      )}
      {personaImpactStatus === 'done' &&
        personaImpacts.map((impact) => (
          <div key={impact.personaName} className="border border-slate-200 rounded p-3">
            <div className="font-medium text-slate-800">{impact.personaName}</div>
            <div className="text-slate-600 mt-1">{impact.summary}</div>
            {impact.signals.length > 0 && (
              <ul className="mt-2 list-disc list-inside text-slate-500">
                {impact.signals.map((signal) => (
                  <li key={signal}>{signal}</li>
                ))}
              </ul>
            )}
            <div className="mt-2 text-xs text-slate-400">Confidence: {impact.confidence}</div>
          </div>
        ))}
    </div>
  );
}
