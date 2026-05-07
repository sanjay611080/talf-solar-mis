
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
  actor: string;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId?: string;
  entityLabel?: string;
  description: string;
  changes?: AuditChange[];
  metadata?: Record<string, any>;
}

const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const getActor = (): string => {
  try {
    const stored = sessionStorage.getItem(SESSION_USER_KEY);
    if (stored) {
      const user = JSON.parse(stored);
      return user?.username || 'unknown';
    }
  } catch (e) {
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
  actor?: string;
}

export const logEvent = (payload: LogPayload): AuditLog => {
  const log: AuditLog = {
    id: newId(),
    timestamp: new Date().toISOString(),
    actor: payload.actor || getActor(),
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
    ])
  );
  for (const key of keys) {
    const b = before?.[key];
    const a = after?.[key];
    if (JSON.stringify(b) !== JSON.stringify(a)) {
      changes.push({ field: key, before: b, after: a });
    }
  }
  return changes;
};

export const clearLogs = () => {
  saveLogs([]);
};

/**
 * Seeds the audit log with realistic sample entries for previewing the page.
 * Returns true if seed was applied, false if logs already existed (and force=false).
 */
export const seedSampleLogs = (force: boolean = false): boolean => {
  if (!force && getLogs().length > 0) return false;

  const now = Date.now();
  const ago = (mins: number) => new Date(now - mins * 60000).toISOString();

  const samples: AuditLog[] = [
    {
      id: 'sample-01',
      timestamp: ago(2),
      actor: 'admin',
      action: 'login_success',
      entityType: 'auth',
      description: 'User "admin" logged in',
      metadata: { ip: '203.45.78.12', role: 'admin' },
    },
    {
      id: 'sample-02',
      timestamp: ago(8),
      actor: 'admin',
      action: 'create',
      entityType: 'user',
      entityId: 'rohit.sharma',
      entityLabel: 'Rohit Sharma',
      description: 'Created user "rohit.sharma" (operations)',
      metadata: { role: 'operations', email: 'rohit@talfsolar.in', contact: '+91 98765 43210' },
    },
    {
      id: 'sample-03',
      timestamp: ago(15),
      actor: 'admin',
      action: 'update',
      entityType: 'user',
      entityId: 'priya.patel',
      entityLabel: 'Priya Patel',
      description: 'Updated user "priya.patel"',
      changes: [
        { field: 'role',  before: 'viewer',          after: 'operations' },
        { field: 'email', before: 'priya@old.com',   after: 'priya.patel@talfsolar.in' },
      ],
    },
    {
      id: 'sample-04',
      timestamp: ago(30),
      actor: 'admin',
      action: 'create',
      entityType: 'project',
      entityId: 'TALF-PB-01',
      entityLabel: 'Punjab Industrial Rooftop',
      description: 'Created project "Punjab Industrial Rooftop" (TALF-PB-01)',
      metadata: { state: 'Punjab', tariff: 4.5, inverters: 2, cameras: 4, siteStatus: 'under-construction' },
    },
    {
      id: 'sample-05',
      timestamp: ago(45),
      actor: 'ops',
      action: 'update',
      entityType: 'project',
      entityId: 'TALF-GGN-01',
      entityLabel: 'Gurgaon Commercial Rooftop',
      description: 'Updated monthly data for "Gurgaon Commercial Rooftop"',
      metadata: { monthlyDataChanged: true, breakdownsBefore: 3, breakdownsAfter: 3 },
    },
    {
      id: 'sample-06',
      timestamp: ago(60),
      actor: 'admin',
      action: 'update',
      entityType: 'project',
      entityId: 'TALF-RJ-01',
      entityLabel: 'Bhadla Solar Park (Phase IV)',
      description: 'Updated project "Bhadla Solar Park (Phase IV)" (TALF-RJ-01)',
      changes: [
        { field: 'tariff',  before: 2.15,            after: 2.25 },
        { field: 'cameras', before: '6 camera(s)',    after: '7 camera(s)' },
      ],
    },
    {
      id: 'sample-07',
      timestamp: ago(90),
      actor: 'admin',
      action: 'deactivate',
      entityType: 'user',
      entityId: 'temp.user',
      entityLabel: 'Temp Contractor',
      description: 'Deactivated user "temp.user"',
    },
    {
      id: 'sample-08',
      timestamp: ago(120),
      actor: 'system',
      action: 'login_failed',
      entityType: 'auth',
      description: 'Failed login attempt for "admin"',
      metadata: { ip: '198.51.100.42', attemptCount: 1, wasBlocked: false },
    },
    {
      id: 'sample-09',
      timestamp: ago(125),
      actor: 'system',
      action: 'login_failed',
      entityType: 'auth',
      description: 'Failed login attempt for "admin"',
      metadata: { ip: '198.51.100.42', attemptCount: 2, wasBlocked: false },
    },
    {
      id: 'sample-10',
      timestamp: ago(130),
      actor: 'system',
      action: 'login_failed',
      entityType: 'auth',
      description: 'Failed login attempt for "admin"',
      metadata: { ip: '198.51.100.42', attemptCount: 3, wasBlocked: true },
    },
    {
      id: 'sample-11',
      timestamp: ago(180),
      actor: 'admin',
      action: 'unblock',
      entityType: 'security',
      entityId: '198.51.100.42',
      entityLabel: '198.51.100.42',
      description: 'Unblocked IP 198.51.100.42 (auto-block reset)',
    },
    {
      id: 'sample-12',
      timestamp: ago(240),
      actor: 'admin',
      action: 'update',
      entityType: 'module_build',
      entityId: 'mb-540wp',
      entityLabel: 'Default 540Wp Mono PERC',
      description: 'Updated module build "Default 540Wp Mono PERC"',
      changes: [
        { field: 'wp',          before: 540, after: 545 },
        { field: 'degradation', before: { firstYear: 2.0, subsequentYears: 0.55 }, after: { firstYear: 1.8, subsequentYears: 0.5 } },
      ],
    },
    {
      id: 'sample-13',
      timestamp: ago(360),
      actor: 'admin',
      action: 'update',
      entityType: 'settings',
      entityId: 'solis-api',
      entityLabel: 'SolisCloud API credentials',
      description: 'Updated SolisCloud API credentials',
      changes: [
        { field: 'apiBaseUrl', before: '(empty)', after: 'https://api.soliscloud.com' },
        { field: 'apiKey',     before: '(empty)', after: '••••a4f9' },
        { field: 'apiSecret',  before: '(empty)', after: '•••••• (changed)' },
      ],
    },
    {
      id: 'sample-14',
      timestamp: ago(480),
      actor: 'admin',
      action: 'block',
      entityType: 'security',
      entityId: '45.123.78.99',
      entityLabel: '45.123.78.99',
      description: 'Manually blocked IP 45.123.78.99',
      metadata: { reason: 'Suspicious port scanning detected' },
    },
    {
      id: 'sample-15',
      timestamp: ago(600),
      actor: 'ops',
      action: 'logout',
      entityType: 'auth',
      description: 'User "ops" logged out',
    },
    {
      id: 'sample-16',
      timestamp: ago(720),
      actor: 'admin',
      action: 'delete',
      entityType: 'user',
      entityId: 'old.intern',
      entityLabel: 'Old Intern',
      description: 'Deleted user "old.intern"',
      metadata: { role: 'viewer', email: 'intern@example.com', contact: undefined },
    },
    {
      id: 'sample-17',
      timestamp: ago(840),
      actor: 'admin',
      action: 'login_success',
      entityType: 'auth',
      description: 'User "admin" logged in',
      metadata: { ip: '203.45.78.12', role: 'admin' },
    },
  ];

  saveLogs(samples);
  return true;
};
