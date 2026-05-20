import React, { useEffect, useState } from 'react';
import { getSyncStatus, SolisSyncStatus } from '../services/solisAPIService';

/**
 * Bottom-right floating status pill for the SolisCloud cron sync.
 *
 * Polls the backend every few seconds and shows, depending on state:
 *  • running  — progress bar + "Syncing X / Y inverter(s)"
 *  • idle/done — countdown to the next scheduled sync
 *  • error    — the error message with a manual-retry hint
 *
 * The widget collapses to a small badge by default; clicking expands it to show
 * the full message, the last-synced timestamp and the next-sync countdown.
 */

const POLL_RUNNING_MS = 3_000;   // tight polling while a sync is in flight
const POLL_IDLE_MS    = 30_000;  // relaxed when there's nothing to show

function formatCountdown(ms: number): string {
  if (ms <= 0) return 'any moment now';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes >= 1) return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
  return `${seconds}s`;
}

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'just now';
  const min = Math.floor(diff / 60_000);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

const SyncStatusWidget: React.FC = () => {
  const [status, setStatus] = useState<SolisSyncStatus | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [tick, setTick] = useState(0); // forces countdown re-render every second

  // Re-render once a second so the countdown text stays live.
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // Poll the backend. Tight polling while a sync is in flight, relaxed otherwise.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      try {
        const s = await getSyncStatus();
        if (!cancelled) setStatus(s);
        if (cancelled) return;
        const next = s.state === 'running' ? POLL_RUNNING_MS : POLL_IDLE_MS;
        timer = setTimeout(poll, next);
      } catch {
        // Backend might be briefly unreachable — back off and try again.
        if (!cancelled) timer = setTimeout(poll, POLL_IDLE_MS);
      }
    };

    poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  if (!status) return null;
  void tick;

  const isRunning = status.state === 'running';
  const isError = status.state === 'error';
  const pct = status.totalSteps > 0 ? Math.min(100, Math.round((status.doneSteps / status.totalSteps) * 100)) : 0;
  const countdownMs = status.nextSyncAt ? status.nextSyncAt - Date.now() : 0;

  // Pill colour by state.
  const dotColor = isRunning ? 'bg-cyan-400 animate-pulse' : isError ? 'bg-red-500' : 'bg-emerald-400';
  const headline = isRunning
    ? `Syncing ${status.doneSteps}/${status.totalSteps}`
    : isError
      ? 'Sync error'
      : status.nextSyncAt
        ? `Next sync in ${formatCountdown(countdownMs)}`
        : 'Sync idle';

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <div
        className={`bg-solar-card border border-solar-border rounded-lg shadow-2xl text-xs text-solar-text transition-all ${
          expanded ? 'w-80' : 'w-auto'
        }`}
      >
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="w-full flex items-center gap-2 px-3 py-2 hover:bg-solar-bg/60 rounded-t-lg"
          title={expanded ? 'Collapse sync status' : 'Expand sync status'}
        >
          <span className={`w-2.5 h-2.5 rounded-full ${dotColor}`} />
          <span className="font-medium text-white whitespace-nowrap">{headline}</span>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className={`h-3 w-3 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {isRunning && (
          <div className="px-3 pb-2">
            <div className="h-1.5 w-full bg-solar-bg rounded overflow-hidden">
              <div className="h-full bg-cyan-400 transition-all" style={{ width: `${pct}%` }} />
            </div>
            {expanded && (
              <p className="mt-1 text-[11px] text-gray-400 truncate" title={status.message}>
                {status.message} — {pct}%
              </p>
            )}
          </div>
        )}

        {expanded && !isRunning && (
          <div className="px-3 pb-3 space-y-1.5 border-t border-solar-border pt-2">
            <p className={`text-[11px] ${isError ? 'text-red-400' : 'text-gray-400'}`} title={status.message}>
              {status.message}
            </p>
            {status.lastSyncedAt && (
              <p className="text-[11px] text-gray-500">
                Last synced: <span className="text-gray-300">{formatRelative(status.lastSyncedAt)}</span>
              </p>
            )}
            {status.nextSyncAt && (
              <p className="text-[11px] text-gray-500">
                Next sync: <span className="text-gray-300">{formatCountdown(countdownMs)}</span>
              </p>
            )}
            {status.kind && (
              <p className="text-[11px] text-gray-500">
                Mode:{' '}
                <span className="text-gray-300">
                  {status.kind === 'cron' ? 'Auto (every 10 min)' : status.kind === 'incremental' ? 'Current year' : 'Full history'}
                </span>
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default SyncStatusWidget;
