
const STORAGE_KEY = 'helios_mis_audit_logs_v1';
const SESSION_USER_KEY = 'helios_mis_current_user';
const MAX_LOGS = 1000;

export type AuditAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'activate'
  | 'deactivate'
  | 'login_success'
  | 'login_failed'
  | 'login_blocked'
  | 'logout'
  | 'block'
  | 'unblock';

export type AuditEntityType =
  | 'user'
  | 'project'
  | 'module_build'
  | 'auth'
  | 'settings'
  | 'security';

export interface AuditChange {
  field: string;
  before: any;
  after: any;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  /** Username of the person (or 'system') who performed the action. */
  performedBy: string;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId?: string;
  entityLabel?: string;
  description: string;
  changes?: AuditChange[];
  metadata?: Record<string, any>;
}

const newLogId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/** Returns the username of the currently logged-in user, or 'system'. */
const getCurrentUsername = (): string => {
  try {
    const stored = sessionStorage.getItem(SESSION_USER_KEY);
    if (stored) {
      const user = JSON.parse(stored);
      return user?.username || 'unknown';
    }
  } catch {
    // ignore
  }
  return 'system';
};

export const getLogs = (): AuditLog[] => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.error('Failed to load audit logs', e);
  }
  return [];
};

const saveLogs = (logs: AuditLog[]) => {
  try {
    const trimmed = logs.length > MAX_LOGS ? logs.slice(-MAX_LOGS) : logs;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch (e) {
    console.error('Failed to save audit logs', e);
  }
};

interface LogPayload {
  action: AuditAction;
  entityType: AuditEntityType;
  entityId?: string;
  entityLabel?: string;
  description: string;
  changes?: AuditChange[];
  metadata?: Record<string, any>;
  /** Override the actor — defaults to the current user. */
  performedBy?: string;
}

export const logEvent = (payload: LogPayload): AuditLog => {
  const log: AuditLog = {
    id: newLogId(),
    timestamp: new Date().toISOString(),
    performedBy: payload.performedBy || getCurrentUsername(),
    action: payload.action,
    entityType: payload.entityType,
    entityId: payload.entityId,
    entityLabel: payload.entityLabel,
    description: payload.description,
    changes: payload.changes && payload.changes.length > 0 ? payload.changes : undefined,
    metadata: payload.metadata,
  };
  const logs = getLogs();
  logs.push(log);
  saveLogs(logs);
  return log;
};

export const computeChanges = (
  before: any,
  after: any,
  fields?: string[],
): AuditChange[] => {
  const changes: AuditChange[] = [];
  const keys = fields || Array.from(
    new Set([
      ...Object.keys(before || {}),
      ...Object.keys(after || {}),
    ]),
  );
  for (const key of keys) {
    const beforeValue = before?.[key];
    const afterValue = after?.[key];
    if (JSON.stringify(beforeValue) !== JSON.stringify(afterValue)) {
      changes.push({ field: key, before: beforeValue, after: afterValue });
    }
  }
  return changes;
};

export const clearLogs = () => {
  saveLogs([]);
};
