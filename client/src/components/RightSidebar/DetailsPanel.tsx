import type { Issue } from '../../types';

type DetailsPanelProps = {
  issue: Issue | null;
  issuesError: string | null;
};

const formatPercent = (value: number) => `${value.toFixed(1)}%`;
const AMPLITUDE_DASHBOARD_URL = 'https://app.amplitude.com/analytics/curly-credit-817868';
const AMPLITUDE_PROJECT_ID = '777254';

const buildAmplitudeLink = (path: string, params?: Record<string, string>) => {
  const url = new URL(`${AMPLITUDE_DASHBOARD_URL}${path}`);
  if (params) {
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  }
  return url.toString();
};

const truncateUserId = (userId: string) => userId.slice(0, Math.max(0, userId.length - 2));

const buildUserLookupLink = (userId: string) => {
  const encoded = encodeURIComponent(`amplitude_id=${truncateUserId(userId)}`);
  return `${AMPLITUDE_DASHBOARD_URL}/project/${AMPLITUDE_PROJECT_ID}/search/${encoded}/activity?_source=user%20lookup`;
};

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

      {/* {issue.evidence && (
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
      )} */}

      {(issue.samples || issue.sampleA || issue.sampleB) && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-xs uppercase tracking-wide text-slate-400">Events & Users</div>
            <a
              href={buildAmplitudeLink('/dashboard')}
              target="_blank"
              rel="noreferrer"
              className="text-[10px] font-semibold text-[#1e61f0] hover:underline"
            >
              View in Amplitude
            </a>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded border border-slate-200 p-2">
              <div className="text-[10px] uppercase text-slate-400">Window A</div>
              <div className="text-slate-700 font-medium">
                {issue.sampleA?.eventCount ?? issue.evidence?.windowA.eventCount ?? 0} events
                {/* {issue.sampleA?.uniqueUsers ?? issue.evidence?.windowA.uniqueUsers ?? 0} users */}
              </div>
            </div>
            <div className="rounded border border-slate-200 p-2">
              <div className="text-[10px] uppercase text-slate-400">Window B</div>
              <div className="text-slate-700 font-medium">
                {issue.sampleB?.eventCount ?? issue.evidence?.windowB.eventCount ?? 10} events
                {/* {issue.sampleB?.uniqueUsers ?? issue.evidence?.windowB.uniqueUsers ?? 10} users */}
              </div>
            </div>
          </div>

          {issue.samples?.events && issue.samples.events.length > 0 && (
            <div className="rounded border border-slate-200 bg-white p-2">
              <div className="text-[10px] uppercase tracking-wide text-slate-400">
                Sample events
              </div>
              <div className="mt-1 space-y-1 text-xs text-slate-600">
                {issue.samples.events.slice(0, 6).map((event) => (
                  <div key={event.id} className="flex items-center justify-between gap-2">
                    <div className="font-mono text-[10px] text-slate-500">{event.id}</div>
                    <div className="text-[10px] text-slate-400">
                      Window {event.window} · {new Date(event.timestamp).toLocaleString()}
                    </div>
                    <a
                      href={buildAmplitudeLink('/events', { event_id: event.id })}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[10px] font-semibold text-[#1e61f0] hover:underline"
                    >
                      Open
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}

          {issue.samples?.users && issue.samples.users.length > 0 && (
            <div className="rounded border border-slate-200 bg-white p-2">
              <div className="text-[10px] uppercase tracking-wide text-slate-400">
                Sample users
              </div>
              <div className="mt-1 flex flex-wrap gap-2">
                {issue.samples.users.slice(0, 6).map((userId) => {
                  const truncatedUserId = truncateUserId(userId);
                  return (
                  <a
                    key={userId}
                    href={buildUserLookupLink(userId)}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600 hover:bg-slate-200"
                  >
                    {truncatedUserId}
                  </a>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

    </div>
  );
}
