
import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import * as auditService from '../services/auditService';
import { AuditAction, AuditEntityType, AuditLog } from '../services/auditService';
import { useAuth } from '../context/AuthContext';
import ConfirmModal from '../components/ConfirmModal';

const ACTION_LABELS: Record<AuditAction, string> = {
  create: 'Create',
  update: 'Update',
  delete: 'Delete',
  activate: 'Activate',
  deactivate: 'Deactivate',
  login_success: 'Login Success',
  login_failed: 'Login Failed',
  login_blocked: 'Login Blocked',
  logout: 'Logout',
  block: 'Block',
  unblock: 'Unblock',
  sync: 'Sync',
};

const ENTITY_LABELS: Record<AuditEntityType, string> = {
  user: 'User',
  project: 'Project',
  module_build: 'Module Build',
  auth: 'Authentication',
  settings: 'Settings',
  security: 'Security',
  sync: 'Sync',
};

const actionBadgeClass = (action: AuditAction) => {
  switch (action) {
    case 'create':         return 'bg-green-500/20 text-green-300 border border-green-500/40';
    case 'update':         return 'bg-blue-500/20 text-blue-300 border border-blue-500/40';
    case 'delete':         return 'bg-red-500/20 text-red-300 border border-red-500/40';
    case 'activate':       return 'bg-teal-500/20 text-teal-300 border border-teal-500/40';
    case 'deactivate':     return 'bg-gray-500/20 text-gray-300 border border-gray-500/40';
    case 'login_success':  return 'bg-green-500/20 text-green-300 border border-green-500/40';
    case 'login_failed':   return 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/40';
    case 'login_blocked':  return 'bg-red-500/20 text-red-300 border border-red-500/40';
    case 'logout':         return 'bg-gray-500/20 text-gray-300 border border-gray-500/40';
    case 'block':          return 'bg-red-500/20 text-red-300 border border-red-500/40';
    case 'unblock':        return 'bg-green-500/20 text-green-300 border border-green-500/40';
    case 'sync':           return 'bg-purple-500/20 text-purple-300 border border-purple-500/40';
    default:               return 'bg-gray-500/20 text-gray-300 border border-gray-500/40';
  }
};

const formatTimestamp = (iso: string) => {
  const date = new Date(iso);
  return date.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
};

const formatValue = (value: any): string => {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string') return value || '(empty)';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return `[${value.length} items]`;
  return JSON.stringify(value);
};

const AuditLogsPage: React.FC = () => {
  const { currentUser } = useAuth();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [userFilter, setUserFilter] = useState<string>('all');
  const [actionFilter, setActionFilter] = useState<AuditAction | 'all'>('all');
  const [entityFilter, setEntityFilter] = useState<AuditEntityType | 'all'>('all');
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);

  const refresh = async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const data = await auditService.getLogs();
      setLogs(data);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load audit logs');
    } finally {
      setIsLoading(false);
    }
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
        <p className="text-gray-400 mb-6 max-w-md">Audit logs are only viewable by administrators.</p>
        <Link to="/" className="bg-solar-accent text-black font-bold px-6 py-2 rounded shadow hover:bg-yellow-400 transition-colors">← Back to Dashboard</Link>
      </div>
    );
  }

  const distinctUsers = useMemo(
    () => Array.from(new Set(logs.map(log => log.performedBy))).sort(),
    [logs],
  );

  const filteredLogs = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return logs.filter(log => {
      const matchesSearch = !term
        || log.description.toLowerCase().includes(term)
        || log.performedBy.toLowerCase().includes(term)
        || (log.entityLabel && log.entityLabel.toLowerCase().includes(term))
        || (log.entityId && log.entityId.toLowerCase().includes(term));
      const matchesUser = userFilter === 'all' || log.performedBy === userFilter;
      const matchesAction = actionFilter === 'all' || log.action === actionFilter;
      const matchesEntity = entityFilter === 'all' || log.entityType === entityFilter;
      return matchesSearch && matchesUser && matchesAction && matchesEntity;
    });
  }, [logs, searchTerm, userFilter, actionFilter, entityFilter]);

  const clearFilters = () => {
    setSearchTerm('');
    setUserFilter('all');
    setActionFilter('all');
    setEntityFilter('all');
  };

  const handleClearLogs = async () => {
    try {
      await auditService.clearLogs();
    } catch (err) {
      console.error('Failed to clear logs', err);
    }
    setExpandedLogId(null);
    await refresh();
  };

  const filtersActive = searchTerm || userFilter !== 'all' || actionFilter !== 'all' || entityFilter !== 'all';

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <header className="flex justify-between items-start gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Audit Logs</h1>
          <p className="text-solar-text">Version history of every action — who did what, when, and what changed.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {isLoading && <span className="text-sm text-yellow-400 animate-pulse">Loading…</span>}
          {loadError && <span className="text-sm text-red-400">{loadError}</span>}
          <button
            onClick={refresh}
            disabled={isLoading}
            className="px-3 py-2 rounded bg-solar-bg border border-solar-border text-gray-300 hover:text-white hover:border-solar-accent transition flex items-center gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
          <button
            onClick={() => setConfirmClearOpen(true)}
            disabled={logs.length === 0}
            className="px-3 py-2 rounded bg-solar-bg border border-solar-border text-red-400 hover:text-red-300 hover:border-red-500 transition text-sm disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Clear All Logs
          </button>
        </div>
      </header>

      {/* Filters */}
      <div className="bg-solar-card rounded-lg border border-solar-border p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="md:col-span-1">
            <label className="label">Search</label>
            <input
              type="text"
              className="input-field"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Description, user, entity..."
            />
          </div>
          <div>
            <label className="label">User</label>
            <select className="input-field" value={userFilter} onChange={e => setUserFilter(e.target.value)}>
              <option value="all">All users</option>
              {distinctUsers.map(name => <option key={name} value={name}>{name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Action</label>
            <select className="input-field" value={actionFilter} onChange={e => setActionFilter(e.target.value as any)}>
              <option value="all">All actions</option>
              {Object.keys(ACTION_LABELS).map(action => (
                <option key={action} value={action}>{ACTION_LABELS[action as AuditAction]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Entity</label>
            <select className="input-field" value={entityFilter} onChange={e => setEntityFilter(e.target.value as any)}>
              <option value="all">All entities</option>
              {Object.keys(ENTITY_LABELS).map(entity => (
                <option key={entity} value={entity}>{ENTITY_LABELS[entity as AuditEntityType]}</option>
              ))}
            </select>
          </div>
        </div>
        {filtersActive && (
          <div className="mt-3 flex justify-between items-center text-xs text-gray-400">
            <span>Showing {filteredLogs.length} of {logs.length} entries</span>
            <button onClick={clearFilters} className="text-solar-accent hover:underline">Clear filters</button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-solar-card rounded-lg border border-solar-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="table-header">
              <tr>
                <th className="table-cell w-44">Timestamp</th>
                <th className="table-cell w-32">User</th>
                <th className="table-cell w-32">Action</th>
                <th className="table-cell w-32">Entity</th>
                <th className="table-cell">Description</th>
                <th className="table-cell w-12 text-center"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-solar-border">
              {filteredLogs.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-gray-500">
                    {isLoading
                      ? 'Loading audit logs…'
                      : loadError
                        ? loadError
                        : logs.length === 0
                          ? 'No activity logged yet.'
                          : 'No entries match the current filters.'}
                  </td>
                </tr>
              )}
              {filteredLogs.map(log => {
                const isExpanded = expandedLogId === log.id;
                const hasDetails = (log.changes && log.changes.length > 0) || (log.metadata && Object.keys(log.metadata).length > 0);
                return (
                  <React.Fragment key={log.id}>
                    <tr
                      className={`hover:bg-solar-bg ${hasDetails ? 'cursor-pointer' : ''}`}
                      onClick={() => hasDetails && setExpandedLogId(isExpanded ? null : log.id)}
                    >
                      <td className="table-cell text-gray-400 font-mono text-xs">{formatTimestamp(log.timestamp)}</td>
                      <td className="table-cell">
                        <span className="font-medium text-white">{log.performedBy}</span>
                      </td>
                      <td className="table-cell">
                        <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${actionBadgeClass(log.action)}`}>
                          {ACTION_LABELS[log.action]}
                        </span>
                      </td>
                      <td className="table-cell text-gray-300">
                        {ENTITY_LABELS[log.entityType]}
                        {log.entityLabel && <p className="text-xs text-gray-500">{log.entityLabel}</p>}
                      </td>
                      <td className="table-cell text-gray-200">{log.description}</td>
                      <td className="table-cell text-center text-gray-500">
                        {hasDetails && (
                          <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 inline transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                          </svg>
                        )}
                      </td>
                    </tr>
                    {isExpanded && hasDetails && (
                      <tr className="bg-solar-bg">
                        <td colSpan={6} className="px-6 py-4">
                          {log.changes && log.changes.length > 0 && (
                            <div className="mb-3">
                              <p className="text-xs uppercase text-gray-400 mb-2 font-bold">Changes</p>
                              <div className="border border-solar-border rounded overflow-hidden">
                                <table className="w-full text-xs">
                                  <thead className="bg-solar-card">
                                    <tr>
                                      <th className="text-left p-2 w-32 text-gray-400">Field</th>
                                      <th className="text-left p-2 text-gray-400">Before</th>
                                      <th className="text-left p-2 text-gray-400">After</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {log.changes.map((change, i) => (
                                      <tr key={i} className="border-t border-solar-border">
                                        <td className="p-2 font-mono text-solar-accent">{change.field}</td>
                                        <td className="p-2 text-red-300 font-mono break-all">{formatValue(change.before)}</td>
                                        <td className="p-2 text-green-300 font-mono break-all">{formatValue(change.after)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}
                          {log.metadata && Object.keys(log.metadata).length > 0 && (
                            <div>
                              <p className="text-xs uppercase text-gray-400 mb-2 font-bold">Metadata</p>
                              <pre className="text-xs text-gray-300 bg-solar-card p-3 rounded border border-solar-border overflow-x-auto">{JSON.stringify(log.metadata, null, 2)}</pre>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <ConfirmModal
        isOpen={confirmClearOpen}
        title="Clear all audit logs?"
        message={`This will permanently delete all ${logs.length} log entries. This action cannot be undone.`}
        variant="danger"
        confirmLabel="Clear All"
        onConfirm={handleClearLogs}
        onClose={() => setConfirmClearOpen(false)}
      />

      <style>{`
        .label { display: block; font-size: 0.75rem; color: #a0aec0; margin-bottom: 0.25rem; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 500; }
        .input-field { width: 100%; background-color: #0D1B2A; border: 1px solid #415A77; border-radius: 4px; padding: 8px; color: white; outline: none; transition: border-color 150ms; }
        .input-field:focus { border-color: #FFD700; }
        .table-header { background-color: #0D1B2A; color: #A0AEC0; text-transform: uppercase; font-weight: 500; font-size: 0.75rem; letter-spacing: 0.05em; }
        .table-cell { padding: 0.75rem 1rem; vertical-align: middle; }
      `}</style>
    </div>
  );
};

export default AuditLogsPage;
