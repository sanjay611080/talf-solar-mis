
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getCredentials, getSyncStatus, SolisSyncStatus, testConnection, triggerSync } from '../services/solisAPIService';
import { useAuth } from '../context/AuthContext';

/** "3m 24s" / "42s" / "2h 05m". */
function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '0s';
  const totalSeconds = Math.round(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`;
  return `${s}s`;
}

/** "just now" / "5 min ago" / "2h ago". */
function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'just now';
  const min = Math.floor(diff / 60_000);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

const SettingsPage: React.FC = () => {
  const { currentUser } = useAuth();
  const [hasSecret, setHasSecret] = useState(false);
  const [source, setSource] = useState<'environment' | 'database' | 'none'>('none');
  const [savedMsg, setSavedMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SolisSyncStatus | null>(null);
  // Re-render every second so the ETA / elapsed counters tick live without
  // hammering the backend with another poll.
  const [, setTick] = useState(0);

  // Live re-render for the ETA / elapsed time numbers.
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // Poll the backend's sync status. Tight loop while a sync is running, relaxed
  // otherwise so we don't keep waking the page when nothing is happening.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      try {
        const s = await getSyncStatus();
        if (cancelled) return;
        setSyncStatus(s);
        const next = s.state === 'running' ? 2000 : 30000;
        timer = setTimeout(poll, next);
      } catch {
        if (!cancelled) timer = setTimeout(poll, 30000);
      }
    };

    poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const creds = await getCredentials();
        setHasSecret(creds.hasSecret);
        setSource(creds.source);
      } catch {
        /* backend unreachable */
      }
    })();
  }, []);

  if (currentUser?.role !== 'admin') {
    return (
      <div className="p-10 text-center text-white flex flex-col items-center justify-center">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-solar-danger mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
        <h2 className="text-2xl font-bold text-solar-danger mb-4">Access Denied</h2>
        <p className="text-gray-400 mb-6 max-w-md">Admin access is required to view this page.</p>
        <Link to="/" className="bg-solar-accent text-black font-bold px-6 py-2 rounded shadow hover:bg-yellow-400 transition-colors">← Back to Dashboard</Link>
      </div>
    );
  }

  const flash = (msg: string, ms = 3500) => {
    setSavedMsg(msg);
    setTimeout(() => setSavedMsg(''), ms);
  };

  const handleTest = async () => {
    setBusy(true);
    try {
      await testConnection();
      flash('Connected to SolisCloud successfully.');
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Connection test failed.', 5000);
    } finally {
      setBusy(false);
    }
  };

  const handleResync = async () => {
    if (!window.confirm('Re-fetch the full history from SolisCloud?\n\nThis runs in the background and can take several minutes. Refresh the dashboard once it finishes.')) {
      return;
    }
    setBusy(true);
    try {
      await triggerSync();
      flash('SolisCloud sync started — it runs in the background.', 5000);
      // Pull the freshly-running status now so the progress bar appears
      // immediately instead of waiting for the next poll tick.
      try {
        setSyncStatus(await getSyncStatus());
      } catch {
        /* the polling effect will pick it up shortly */
      }
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Could not start sync.', 5000);
    } finally {
      setBusy(false);
    }
  };

  // --- Sync-card derived state ---
  const isSyncRunning = syncStatus?.state === 'running';
  const syncPct = syncStatus && syncStatus.totalSteps > 0
    ? Math.min(100, Math.round((syncStatus.doneSteps / syncStatus.totalSteps) * 100))
    : 0;
  // ETA: extrapolate elapsed/step to the remaining steps. Only meaningful once
  // a few steps have completed — otherwise the estimate is wildly noisy.
  const syncEtaMs = (() => {
    if (!syncStatus || !isSyncRunning) return 0;
    const { startedAt, doneSteps, totalSteps } = syncStatus;
    if (!startedAt || doneSteps < 2 || doneSteps >= totalSteps) return 0;
    const elapsed = Date.now() - startedAt;
    const perStep = elapsed / doneSteps;
    return perStep * (totalSteps - doneSteps);
  })();
  const syncElapsedMs = syncStatus?.startedAt ? Date.now() - syncStatus.startedAt : 0;
  const syncKindLabel =
    syncStatus?.kind === 'cron'
      ? 'Auto (current month)'
      : syncStatus?.kind === 'incremental'
        ? 'Current year'
        : 'Full history';

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-white mb-2">SolisCloud API Settings</h1>
        <p className="text-solar-text">Configure your SolisCloud credentials for live data and monthly sync.</p>
      </header>

      <div className="bg-solar-card rounded-lg border border-solar-border p-6 space-y-4">
        <h2 className="text-base font-semibold text-white">API Credentials</h2>

        {/* Status row */}
        <div className="flex items-center justify-between gap-4 bg-solar-bg rounded-lg border border-solar-border px-4 py-3">
          <div className="flex items-center gap-3">
            <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${hasSecret && source !== 'none' ? 'bg-emerald-400' : 'bg-red-500'}`} />
            <div>
              <p className="text-sm font-medium text-white">
                {hasSecret && source !== 'none' ? 'Credentials configured' : 'No credentials saved'}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                {source === 'environment'
                  ? 'Loaded from server environment variables'
                  : source === 'database'
                    ? 'Loaded from backend database'
                    : 'Set SOLIS_API_ID and SOLIS_API_SECRET in the backend environment'}
              </p>
            </div>
          </div>

          {/* Masked credential badges */}
          {hasSecret && source !== 'none' && (
            <div className="flex items-center gap-3 text-xs font-mono text-gray-400">
              <span className="bg-solar-border px-2 py-1 rounded">ID ••••••••</span>
              <span className="bg-solar-border px-2 py-1 rounded">Secret ••••••••</span>
            </div>
          )}
        </div>

        <p className="text-xs text-gray-500">
          Credentials are managed via backend environment variables (<code className="text-gray-300">SOLIS_API_ID</code>, <code className="text-gray-300">SOLIS_API_SECRET</code>, <code className="text-gray-300">SOLIS_BASE_URL</code>) and are never exposed to the browser.
        </p>

        <div className="flex flex-wrap justify-end items-center gap-3 pt-3 border-t border-solar-border">
          {savedMsg && <span className={`text-sm mr-auto ${savedMsg.toLowerCase().includes('fail') || savedMsg.toLowerCase().includes('error') ? 'text-red-400' : 'text-solar-success'}`}>{savedMsg}</span>}
          <button
            onClick={handleTest}
            disabled={busy || !hasSecret}
            className="px-4 py-2 rounded bg-solar-border text-white hover:bg-gray-600 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy ? 'Testing…' : 'Test Connection'}
          </button>
        </div>
      </div>

      <div className="bg-solar-card rounded-lg border border-solar-border p-6 space-y-4">
        <div className="flex justify-between items-start gap-4 flex-wrap">
          <div>
            <h2 className="text-lg font-bold text-white">Data Sync</h2>
            <p className="text-sm text-gray-400 mt-1">
              Re-fetch the full generation history for every project from SolisCloud. Existing fetched data is replaced with a fresh pull.
            </p>
          </div>
          <button
            onClick={handleResync}
            disabled={busy || isSyncRunning}
            className="px-4 py-2 rounded bg-solar-accent text-black font-bold hover:bg-yellow-400 transition disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
          >
            ↻ Re-sync full history from SolisCloud
          </button>
        </div>

        {/* Progress block: visible whenever there's any meaningful sync state. */}
        {syncStatus && syncStatus.state !== 'idle' && (
          <div className="border-t border-solar-border pt-4 space-y-3">
            <div className="flex justify-between items-baseline gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <span
                  className={`w-2.5 h-2.5 rounded-full ${
                    isSyncRunning
                      ? 'bg-cyan-400 animate-pulse'
                      : syncStatus.state === 'error'
                        ? 'bg-red-500'
                        : 'bg-emerald-400'
                  }`}
                />
                <span className="font-semibold text-white">
                  {isSyncRunning
                    ? 'Sync in progress'
                    : syncStatus.state === 'error'
                      ? 'Sync failed'
                      : 'Sync complete'}
                </span>
                <span className="text-xs text-gray-500">— {syncKindLabel}</span>
              </div>
              {isSyncRunning && (
                <span className="text-sm font-mono text-cyan-300">{syncPct}%</span>
              )}
            </div>

            {/* Progress bar — even when finished, leave it filled so the card
                visually communicates that the last run succeeded. */}
            <div className="h-2.5 w-full bg-solar-bg rounded overflow-hidden">
              <div
                className={`h-full transition-all duration-500 ${
                  syncStatus.state === 'error'
                    ? 'bg-red-500'
                    : isSyncRunning
                      ? 'bg-cyan-400'
                      : 'bg-emerald-400'
                }`}
                style={{ width: `${isSyncRunning ? syncPct : 100}%` }}
              />
            </div>

            {/* Step counter + ETA / elapsed time. */}
            {isSyncRunning && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div>
                  <p className="text-gray-500 uppercase">Step</p>
                  <p className="font-mono text-white">
                    {syncStatus.doneSteps.toLocaleString()} / {syncStatus.totalSteps.toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500 uppercase">Elapsed</p>
                  <p className="font-mono text-white">{formatDuration(syncElapsedMs)}</p>
                </div>
                <div>
                  <p className="text-gray-500 uppercase">Est. remaining</p>
                  <p className="font-mono text-white">
                    {syncEtaMs > 0 ? `~${formatDuration(syncEtaMs)}` : 'calculating…'}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500 uppercase">Phase</p>
                  <p className="text-gray-300 truncate" title={syncStatus.message}>
                    {syncStatus.message}
                  </p>
                </div>
              </div>
            )}

            {/* Once finished, show the last-synced timestamp + final message. */}
            {!isSyncRunning && (
              <div className="text-xs text-gray-400 space-y-1">
                <p className={syncStatus.state === 'error' ? 'text-red-400' : ''}>
                  {syncStatus.message}
                </p>
                {syncStatus.lastSyncedAt && (
                  <p>
                    Last successful sync:{' '}
                    <span className="text-gray-200">{formatRelative(syncStatus.lastSyncedAt)}</span>
                    {syncStatus.startedAt && syncStatus.finishedAt && (
                      <>
                        {' '}
                        · took{' '}
                        <span className="text-gray-200">
                          {formatDuration(syncStatus.finishedAt - syncStatus.startedAt)}
                        </span>
                      </>
                    )}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <style>{`
        .label { display: block; font-size: 0.875rem; color: #a0aec0; margin-bottom: 0.25rem; }
        .input-field { width: 100%; background-color: #0D1B2A; border: 1px solid #415A77; border-radius: 4px; padding: 8px; color: white; outline: none; transition: border-color 150ms; }
        .input-field:focus { border-color: #FFD700; }
      `}</style>
    </div>
  );
};

export default SettingsPage;
