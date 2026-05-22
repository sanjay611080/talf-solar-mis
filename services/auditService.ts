
import { apiFetch, getToken } from './apiClient';

// ---------------------------------------------------------------------------
// Types (unchanged from the original — all callers depend on these)
// ---------------------------------------------------------------------------

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
  | 'unblock'
  | 'sync';

export type AuditEntityType =
  | 'user'
  | 'project'
  | 'module_build'
  | 'auth'
  | 'settings'
  | 'security'
  | 'sync';

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

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const SESSION_USER_KEY = 'helios_mis_current_user';

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

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

interface LogPayload {
  action: AuditAction;
  entityType: AuditEntityType;
  entityId?: string;
  entityLabel?: string;
  description: string;
  changes?: AuditChange[];
  metadata?: Record<string, any>;
  /** Override the actor — defaults to the current user from session. */
  performedBy?: string;
}

/**
 * Fires an audit event to the backend database.
 *
 * Completely non-blocking: the POST is sent in the background. Failures are
 * swallowed so a logging hiccup never breaks the UI. Login events where the
 * user doesn't yet have a token are also sent — if the backend rejects them
 * (401) the error is silently dropped.
 */
export const logEvent = (payload: LogPayload): void => {
  const body = {
    performedBy: payload.performedBy || getCurrentUsername(),
    action: payload.action,
    entityType: payload.entityType,
    entityId: payload.entityId,
    entityLabel: payload.entityLabel,
    description: payload.description,
    changes: payload.changes && payload.changes.length > 0 ? payload.changes : undefined,
    metadata: payload.metadata,
    timestamp: new Date().toISOString(),
  };

  // Always attempt the POST. Callers that fire this before a token exists
  // (e.g. login_failed from userService) will silently fail — those events
  // are also logged server-side by the auth route, so nothing is lost.
  const token = getToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  fetch(
    (import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api') + '/audit',
    { method: 'POST', headers, body: JSON.stringify(body) },
  ).catch(() => {
    // Never let audit failures surface to the user.
  });
};

/**
 * Fetches all audit logs from the backend.
 * Admin-only on the backend (non-admins receive a 403).
 * Returns newest-first (the backend already orders by timestamp DESC).
 */
export const getLogs = async (): Promise<AuditLog[]> => {
  return apiFetch<AuditLog[]>('/audit');
};

/**
 * Permanently deletes all audit log entries.
 * Admin-only on the backend.
 */
export const clearLogs = async (): Promise<void> => {
  await apiFetch<void>('/audit', { method: 'DELETE' });
};

/**
 * Computes field-level diffs between two objects.
 * Fields in `fields` are compared in order; if omitted, all keys are diffed.
 */
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
