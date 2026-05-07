
import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import * as securityService from '../services/securityService';
import * as auditService from '../services/auditService';
import { BlockedClient, FailedAttempt, ManualIpBlock, MAX_LOGIN_ATTEMPTS } from '../services/securityService';
import { useAuth } from '../context/AuthContext';
import ConfirmModal from '../components/ConfirmModal';

const formatTimestamp = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
};

interface ConfirmConfig {
  title: string;
  message: string;
  variant: 'danger' | 'warning' | 'info';
  confirmLabel: string;
  onConfirm: () => void;
}

const SecurityPage: React.FC = () => {
  const { currentUser } = useAuth();
  const [blockedClients, setBlockedClients] = useState<BlockedClient[]>([]);
  const [manualBlocks, setManualBlocks] = useState<ManualIpBlock[]>([]);
  const [failedAttempts, setFailedAttempts] = useState<FailedAttempt[]>([]);
  const [ipInput, setIpInput] = useState('');
  const [reasonInput, setReasonInput] = useState('');
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');
  const [confirmConfig, setConfirmConfig] = useState<ConfirmConfig | null>(null);

  const refresh = () => {
    setBlockedClients(securityService.getBlockedClients());
    setManualBlocks(securityService.getManualIpBlocks());
    setFailedAttempts(securityService.getFailedAttempts().slice().reverse());
  };

  useEffect(() => {
    refresh();
  }, []);

  if (currentUser?.role !== 'admin') {
    return (
      <div className="p-10 text-center text-white flex flex-col items-center justify-center">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-solar-danger mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
        <h2 className="text-2xl font-bold text-solar-danger mb-4">Access Denied</h2>
        <p className="text-gray-400 mb-6 max-w-md">Security controls are only available to administrators.</p>
        <Link to="/" className="bg-solar-accent text-black font-bold px-6 py-2 rounded shadow hover:bg-yellow-400 transition-colors">← Back to Dashboard</Link>
      </div>
    );
  }

  // Failed attempts in last 24h (not yet blocked)
  const blockedClientIds = useMemo(() => new Set(blockedClients.map(b => b.clientId)), [blockedClients]);
  const recentFailedAttempts = useMemo(() => {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    return failedAttempts.filter(a => new Date(a.timestamp).getTime() >= cutoff);
  }, [failedAttempts]);

  const activeFailedAttempts = useMemo(() => {
    return recentFailedAttempts.filter(a => !blockedClientIds.has(a.clientId));
  }, [recentFailedAttempts, blockedClientIds]);

  const handleManualBlock = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setFormSuccess('');
    const result = securityService.blockIp(ipInput, currentUser.username, reasonInput || 'Manual block');
    if (!result.success) {
      setFormError(result.error || 'Failed to block IP.');
      return;
    }
    auditService.logEvent({
      action: 'block',
      entityType: 'security',
      entityId: ipInput.trim(),
      entityLabel: ipInput.trim(),
      description: `Manually blocked IP ${ipInput.trim()}`,
      metadata: { reason: reasonInput || 'Manual block' },
    });
    setFormSuccess(`IP ${ipInput.trim()} blocked successfully.`);
    setIpInput('');
    setReasonInput('');
    refresh();
    setTimeout(() => setFormSuccess(''), 3000);
  };

  const askUnblockClient = (b: BlockedClient) => {
    setConfirmConfig({
      title: 'Unblock this IP?',
      message: `${b.fakeIp} will be unblocked. The user gets ${MAX_LOGIN_ATTEMPTS} fresh login attempts.`,
      variant: 'info',
      confirmLabel: 'Unblock',
      onConfirm: () => {
        securityService.unblockClient(b.clientId);
        auditService.logEvent({
          action: 'unblock',
          entityType: 'security',
          entityId: b.fakeIp,
          entityLabel: b.fakeIp,
          description: `Unblocked IP ${b.fakeIp} (auto-block reset)`,
        });
        refresh();
      },
    });
  };

  const askUnblockManual = (m: ManualIpBlock) => {
    setConfirmConfig({
      title: 'Unblock this IP?',
      message: `${m.ip} will be removed from the manual block list.`,
      variant: 'info',
      confirmLabel: 'Unblock',
      onConfirm: () => {
        securityService.unblockIp(m.ip);
        auditService.logEvent({
          action: 'unblock',
          entityType: 'security',
          entityId: m.ip,
          entityLabel: m.ip,
          description: `Unblocked IP ${m.ip} (manual block removed)`,
        });
        refresh();
      },
    });
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-white mb-2">Security & Access Control</h1>
        <p className="text-solar-text">Auto-block after {MAX_LOGIN_ATTEMPTS} failed login attempts. Review, unblock, or manually block IP addresses.</p>
      </header>

      <div className="bg-yellow-900/20 border border-yellow-600/40 rounded-lg p-3 text-xs text-yellow-200/90">
        <strong>Note:</strong> Real IP-level blocking happens server-side. This frontend prototype simulates an IP per browser session
        (a stable identifier stored in localStorage, mapped deterministically to a fake IP for display). When you migrate to a real backend,
        replace the lookup in <code className="bg-black/30 px-1 rounded">securityService.ts</code> with the request's real IP — the rest of this
        page works unchanged.
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-solar-card border border-solar-border p-4 rounded">
          <p className="kpi-label">Auto-Blocked</p>
          <p className="kpi-value text-red-400">{blockedClients.length}</p>
        </div>
        <div className="bg-solar-card border border-solar-border p-4 rounded">
          <p className="kpi-label">Manual Blocks</p>
          <p className="kpi-value text-orange-400">{manualBlocks.length}</p>
        </div>
        <div className="bg-solar-card border border-solar-border p-4 rounded">
          <p className="kpi-label">Failed (last 24h)</p>
          <p className="kpi-value text-yellow-400">{recentFailedAttempts.length}</p>
        </div>
        <div className="bg-solar-card border border-solar-border p-4 rounded">
          <p className="kpi-label">Threshold</p>
          <p className="kpi-value text-blue-300">{MAX_LOGIN_ATTEMPTS} <span className="text-xs font-normal text-gray-400">attempts</span></p>
        </div>
      </div>

      {/* Manual block form */}
      <div className="bg-solar-card rounded-lg border border-solar-border p-6">
        <h3 className="font-semibold text-white text-lg mb-4">Manually Block an IP</h3>
        <form onSubmit={handleManualBlock} className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="label">IP Address</label>
            <input
              type="text"
              className="input-field"
              value={ipInput}
              onChange={e => setIpInput(e.target.value)}
              placeholder="e.g. 192.168.1.50"
            />
          </div>
          <div>
            <label className="label">Reason (optional)</label>
            <input
              type="text"
              className="input-field"
              value={reasonInput}
              onChange={e => setReasonInput(e.target.value)}
              placeholder="Suspicious activity, brute force..."
            />
          </div>
          <div className="flex items-end">
            <button type="submit" className="px-6 py-2 rounded bg-solar-danger text-white font-bold hover:bg-red-600 transition w-full">
              Block IP
            </button>
          </div>
        </form>
        {formError && <p className="text-solar-danger text-sm mt-3">{formError}</p>}
        {formSuccess && <p className="text-solar-success text-sm mt-3">{formSuccess}</p>}
      </div>

      {/* Auto-blocked clients */}
      <div className="bg-solar-card rounded-lg border border-solar-border overflow-hidden">
        <div className="p-4 border-b border-solar-border bg-solar-bg">
          <h3 className="font-bold text-white">Auto-Blocked IPs <span className="text-sm font-normal text-gray-400">({blockedClients.length})</span></h3>
          <p className="text-xs text-gray-500 mt-1">IPs blocked automatically after {MAX_LOGIN_ATTEMPTS} failed login attempts.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="table-header">
              <tr>
                <th className="table-cell">IP Address</th>
                <th className="table-cell">Blocked At</th>
                <th className="table-cell">By</th>
                <th className="table-cell">Reason</th>
                <th className="table-cell">Tried Usernames</th>
                <th className="table-cell text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-solar-border">
              {blockedClients.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-6 text-gray-500">No IPs are currently auto-blocked.</td>
                </tr>
              )}
              {blockedClients.map(b => (
                <tr key={b.clientId} className="hover:bg-solar-bg">
                  <td className="table-cell font-mono text-red-300">{b.fakeIp}</td>
                  <td className="table-cell text-gray-400 text-xs font-mono">{formatTimestamp(b.blockedAt)}</td>
                  <td className="table-cell text-gray-300">{b.blockedBy}</td>
                  <td className="table-cell text-gray-300">{b.reason}</td>
                  <td className="table-cell text-gray-300">
                    {b.attemptedUsernames.length > 0
                      ? b.attemptedUsernames.join(', ')
                      : <span className="text-gray-600">—</span>}
                  </td>
                  <td className="table-cell text-center">
                    <button
                      onClick={() => askUnblockClient(b)}
                      className="text-xs bg-solar-success hover:bg-green-600 text-white px-3 py-1 rounded transition"
                    >
                      Unblock
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Manual blocks */}
      <div className="bg-solar-card rounded-lg border border-solar-border overflow-hidden">
        <div className="p-4 border-b border-solar-border bg-solar-bg">
          <h3 className="font-bold text-white">Manual IP Blocks <span className="text-sm font-normal text-gray-400">({manualBlocks.length})</span></h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="table-header">
              <tr>
                <th className="table-cell">IP Address</th>
                <th className="table-cell">Blocked At</th>
                <th className="table-cell">By</th>
                <th className="table-cell">Reason</th>
                <th className="table-cell text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-solar-border">
              {manualBlocks.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center py-6 text-gray-500">No manual blocks.</td>
                </tr>
              )}
              {manualBlocks.map(m => (
                <tr key={m.ip} className="hover:bg-solar-bg">
                  <td className="table-cell font-mono text-orange-300">{m.ip}</td>
                  <td className="table-cell text-gray-400 text-xs font-mono">{formatTimestamp(m.blockedAt)}</td>
                  <td className="table-cell text-gray-300">{m.blockedBy}</td>
                  <td className="table-cell text-gray-300">{m.reason || '—'}</td>
                  <td className="table-cell text-center">
                    <button
                      onClick={() => askUnblockManual(m)}
                      className="text-xs bg-solar-success hover:bg-green-600 text-white px-3 py-1 rounded transition"
                    >
                      Unblock
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent failed attempts (not yet blocked) */}
      <div className="bg-solar-card rounded-lg border border-solar-border overflow-hidden">
        <div className="p-4 border-b border-solar-border bg-solar-bg">
          <h3 className="font-bold text-white">Recent Failed Attempts <span className="text-sm font-normal text-gray-400">(last 24h, {activeFailedAttempts.length})</span></h3>
          <p className="text-xs text-gray-500 mt-1">Failed attempts from IPs that have not yet hit the {MAX_LOGIN_ATTEMPTS}-attempt limit.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="table-header">
              <tr>
                <th className="table-cell">Time</th>
                <th className="table-cell">Username Tried</th>
                <th className="table-cell">IP</th>
                <th className="table-cell">Attempts from this IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-solar-border">
              {activeFailedAttempts.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-center py-6 text-gray-500">No recent failed attempts (last 24h).</td>
                </tr>
              )}
              {activeFailedAttempts.map((a, i) => {
                const sameIpCount = activeFailedAttempts.filter(x => x.clientId === a.clientId).length;
                return (
                  <tr key={`${a.clientId}-${a.timestamp}-${i}`} className="hover:bg-solar-bg">
                    <td className="table-cell text-gray-400 text-xs font-mono">{formatTimestamp(a.timestamp)}</td>
                    <td className="table-cell text-gray-300">{a.username}</td>
                    <td className="table-cell font-mono text-yellow-300">{a.fakeIp}</td>
                    <td className="table-cell">
                      <span className={`text-xs font-bold ${sameIpCount >= MAX_LOGIN_ATTEMPTS - 1 ? 'text-red-400' : 'text-yellow-300'}`}>
                        {sameIpCount} / {MAX_LOGIN_ATTEMPTS}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <ConfirmModal
        isOpen={!!confirmConfig}
        title={confirmConfig?.title || ''}
        message={confirmConfig?.message || ''}
        variant={confirmConfig?.variant}
        confirmLabel={confirmConfig?.confirmLabel}
        onConfirm={() => confirmConfig?.onConfirm()}
        onClose={() => setConfirmConfig(null)}
      />

      <style>{`
        .label { display: block; font-size: 0.75rem; color: #a0aec0; margin-bottom: 0.25rem; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 500; }
        .input-field { width: 100%; background-color: #0D1B2A; border: 1px solid #415A77; border-radius: 4px; padding: 8px; color: white; outline: none; transition: border-color 150ms; }
        .input-field:focus { border-color: #FFD700; }
        .table-header { background-color: #0D1B2A; color: #A0AEC0; text-transform: uppercase; font-weight: 500; font-size: 0.75rem; letter-spacing: 0.05em; }
        .table-cell { padding: 0.75rem 1rem; vertical-align: middle; }
        .kpi-label { color: #A0AEC0; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 500; }
        .kpi-value { font-size: 1.5rem; font-weight: bold; }
      `}</style>
    </div>
  );
};

export default SecurityPage;
