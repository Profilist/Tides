import type { Issue } from '../../types';

type DetailsPanelProps = {
  issue: Issue | null;
  issuesError: string | null;
};

const formatPercent = (value: number) => `${value.toFixed(1)}%`;

export function DetailsPanel({
  issue,
  issuesError,
}: DetailsPanelProps) {
  if (issuesError) {
    return (
      <div className="p-4 text-sm text-rose-500">
        Failed to load issues{issuesError ? `: ${issuesError}` : '.'}
      </div>
    );
  }

  if (!issue) {
    return (
      <div className="p-4 text-sm text-slate-400">
        Select a task to see issue details.
      </div>
    );
  }

  return (
    <div className="p-4 text-sm text-slate-600 space-y-4">
      <div>
        <div className="text-xs uppercase tracking-wide text-slate-400">Category</div>
        <div className="text-slate-900 font-semibold">{issue.category ?? 'Uncategorized'}</div>
      </div>

      <div>
        <div className="text-xs uppercase tracking-wide text-slate-400">Summary</div>
        <div className="text-slate-700">{issue.summary ?? 'No summary available.'}</div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded border border-slate-200 p-2">
          <div className="text-[10px] uppercase text-slate-400">Severity</div>
          <div className="text-slate-700 font-medium">{issue.severity}</div>
        </div>
        <div className="rounded border border-slate-200 p-2">
          <div className="text-[10px] uppercase text-slate-400">Delta</div>
          <div className="text-slate-700 font-medium">{formatPercent(issue.deltaPct)}</div>
        </div>
      </div>

      {issue.pageNames && issue.pageNames.length > 0 && (
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-400">Pages</div>
          <div className="flex flex-wrap gap-2 mt-1">
            {issue.pageNames.map((page) => (
              <span
                key={page}
                className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
              >
                {page}
              </span>
            ))}
          </div>
        </div>
      )}

      {issue.evidence && (
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-400">Evidence</div>
          <div className="mt-2 space-y-2 text-xs text-slate-500">
            <div>
              Window A: {issue.evidence.windowA.eventCount} events ·{' '}
              {issue.evidence.windowA.uniqueUsers} users
            </div>
            <div>
              Window B: {issue.evidence.windowB.eventCount} events ·{' '}
              {issue.evidence.windowB.uniqueUsers} users
            </div>
            <div>
              Delta: {issue.evidence.delta.eventCount} events ·{' '}
              {issue.evidence.delta.uniqueUsers} users
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
