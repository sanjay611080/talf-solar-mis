
const CLIENT_ID_KEY = 'helios_mis_client_id';
const FAILED_ATTEMPTS_KEY = 'helios_mis_failed_attempts_v1';
const BLOCKED_CLIENTS_KEY = 'helios_mis_blocked_clients_v1';
const MANUAL_BLOCKS_KEY = 'helios_mis_manual_ip_blocks_v1';

export const MAX_LOGIN_ATTEMPTS = 3;

export interface FailedAttempt {
  clientId: string;
  fakeIp: string;
  username: string;
  timestamp: string;
}

export interface BlockedClient {
  clientId: string;
  fakeIp: string;
  blockedAt: string;
  blockedBy: string; // 'system' for auto-block, otherwise username
  reason: string;
  attemptedUsernames: string[];
}

export interface ManualIpBlock {
  ip: string;
  blockedAt: string;
  blockedBy: string;
  reason?: string;
}

const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `cli-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const loadJSON = <T>(key: string, fallback: T): T => {
  try {
    const stored = localStorage.getItem(key);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed != null) return parsed;
    }
  } catch (e) {
    console.error(`Failed to load ${key}`, e);
  }
  return fallback;
};

const saveJSON = (key: string, val: any) => {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch (e) {
    console.error(`Failed to save ${key}`, e);
  }
};

// --- Client identification ---

export const getClientId = (): string => {
  let id = localStorage.getItem(CLIENT_ID_KEY);
  if (!id) {
    id = newId();
    localStorage.setItem(CLIENT_ID_KEY, id);
  }
  return id;
};

/**
 * Generate a deterministic fake IP from a client ID for display.
 * Real IP-level blocking is server-side; this is a UI placeholder.
 */
export const getFakeIpFromClientId = (clientId: string): string => {
  let hash = 0;
  for (let i = 0; i < clientId.length; i++) {
    hash = (hash << 5) - hash + clientId.charCodeAt(i);
    hash = hash & hash;
  }
  hash = Math.abs(hash);
  const a = (hash % 223) + 1;          // 1-223
  const b = (hash >> 8) % 256;
  const c = (hash >> 16) % 256;
  const d = ((hash >> 24) % 254) + 1;  // 1-254
  return `${a}.${b}.${c}.${d}`;
};

export const getCurrentClientFakeIp = (): string => {
  return getFakeIpFromClientId(getClientId());
};

// --- Failed attempts ---

export const getFailedAttempts = (): FailedAttempt[] => {
  return loadJSON<FailedAttempt[]>(FAILED_ATTEMPTS_KEY, []);
};

const saveFailedAttempts = (attempts: FailedAttempt[]) => {
  // Cap at 500 to avoid bloat
  saveJSON(FAILED_ATTEMPTS_KEY, attempts.slice(-500));
};

export const getFailedAttemptsForClient = (clientId: string): FailedAttempt[] => {
  return getFailedAttempts().filter(a => a.clientId === clientId);
};

export const recordFailedAttempt = (
  username: string,
): { wasBlocked: boolean; remainingAttempts: number; attemptCount: number } => {
  const clientId = getClientId();
  const fakeIp = getFakeIpFromClientId(clientId);
  const attempts = getFailedAttempts();
  attempts.push({
    clientId,
    fakeIp,
    username,
    timestamp: new Date().toISOString(),
  });
  saveFailedAttempts(attempts);

  const myAttempts = getFailedAttemptsForClient(clientId);
  const attemptCount = myAttempts.length;

  if (attemptCount >= MAX_LOGIN_ATTEMPTS) {
    blockClient({
      clientId,
      blockedBy: 'system',
      reason: `Auto-blocked after ${attemptCount} failed login attempts`,
    });
    return { wasBlocked: true, remainingAttempts: 0, attemptCount };
  }

  return {
    wasBlocked: false,
    remainingAttempts: MAX_LOGIN_ATTEMPTS - attemptCount,
    attemptCount,
  };
};

export const clearFailedAttemptsForClient = (clientId: string) => {
  const all = getFailedAttempts();
  saveFailedAttempts(all.filter(a => a.clientId !== clientId));
};

// --- Blocked clients (auto-blocked) ---

export const getBlockedClients = (): BlockedClient[] => {
  return loadJSON<BlockedClient[]>(BLOCKED_CLIENTS_KEY, []);
};

const saveBlockedClients = (blocks: BlockedClient[]) => {
  saveJSON(BLOCKED_CLIENTS_KEY, blocks);
};

interface BlockClientPayload {
  clientId: string;
  blockedBy: string;
  reason?: string;
}

export const blockClient = (payload: BlockClientPayload): BlockedClient | null => {
  const blocks = getBlockedClients();
  if (blocks.some(b => b.clientId === payload.clientId)) {
    return null; // already blocked
  }
  const fakeIp = getFakeIpFromClientId(payload.clientId);
  const usernames = Array.from(
    new Set(getFailedAttemptsForClient(payload.clientId).map(a => a.username))
  );
  const block: BlockedClient = {
    clientId: payload.clientId,
    fakeIp,
    blockedAt: new Date().toISOString(),
    blockedBy: payload.blockedBy,
    reason: payload.reason || 'Blocked',
    attemptedUsernames: usernames,
  };
  blocks.push(block);
  saveBlockedClients(blocks);
  return block;
};

export const unblockClient = (clientId: string): void => {
  const blocks = getBlockedClients();
  saveBlockedClients(blocks.filter(b => b.clientId !== clientId));
  // Reset their failure counter so they get a fresh 3 chances
  clearFailedAttemptsForClient(clientId);
};

// --- Manual IP blocks (admin-typed) ---

export const getManualIpBlocks = (): ManualIpBlock[] => {
  return loadJSON<ManualIpBlock[]>(MANUAL_BLOCKS_KEY, []);
};

const saveManualIpBlocks = (blocks: ManualIpBlock[]) => {
  saveJSON(MANUAL_BLOCKS_KEY, blocks);
};

const isValidIp = (ip: string): boolean => {
  if (!/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip)) return false;
  return ip.split('.').every(part => {
    const n = parseInt(part, 10);
    return n >= 0 && n <= 255;
  });
};

export const blockIp = (
  ip: string,
  blockedBy: string,
  reason?: string,
): { success: boolean; error?: string } => {
  const trimmed = ip.trim();
  if (!trimmed) return { success: false, error: 'IP address is required.' };
  if (!isValidIp(trimmed)) return { success: false, error: 'Invalid IP format. Use d.d.d.d (each part 0-255).' };

  const blocks = getManualIpBlocks();
  if (blocks.some(b => b.ip === trimmed)) {
    return { success: false, error: 'This IP is already in the manual block list.' };
  }
  blocks.push({
    ip: trimmed,
    blockedAt: new Date().toISOString(),
    blockedBy,
    reason,
  });
  saveManualIpBlocks(blocks);
  return { success: true };
};

export const unblockIp = (ip: string): void => {
  const manual = getManualIpBlocks();
  saveManualIpBlocks(manual.filter(b => b.ip !== ip));
  // Also remove any auto-blocked clients whose fakeIp matches
  const clientBlocks = getBlockedClients();
  const matchingClientIds = clientBlocks.filter(b => b.fakeIp === ip).map(b => b.clientId);
  if (matchingClientIds.length > 0) {
    saveBlockedClients(clientBlocks.filter(b => b.fakeIp !== ip));
    const allAttempts = getFailedAttempts();
    saveFailedAttempts(allAttempts.filter(a => !matchingClientIds.includes(a.clientId)));
  }
};

// --- Blocked check (used by login) ---

export const isClientBlocked = (clientId: string): boolean => {
  if (getBlockedClients().some(b => b.clientId === clientId)) return true;
  const fakeIp = getFakeIpFromClientId(clientId);
  return getManualIpBlocks().some(m => m.ip === fakeIp);
};

export const isCurrentClientBlocked = (): boolean => isClientBlocked(getClientId());
