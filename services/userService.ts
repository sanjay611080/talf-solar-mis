
import { User, UserRole } from '../types';
import { apiFetch, clearToken, setToken } from './apiClient';
import * as auditService from './auditService';
import * as securityService from './securityService';

const SESSION_STORAGE_KEY = 'helios_mis_current_user';

// --- Login ---

export type LoginResult =
  | { ok: true; user: User }
  | { ok: false; error: 'blocked' | 'invalid' | 'inactive'; remainingAttempts?: number };

/**
 * Authenticates against the backend. The security (IP-block) and audit wrappers
 * are kept; only the credential check moved server-side.
 */
export const login = async (username: string, pass: string): Promise<LoginResult> => {
  const ip = securityService.getCurrentClientFakeIp();

  if (securityService.isCurrentClientBlocked()) {
    auditService.logEvent({
      performedBy: 'system',
      action: 'login_blocked',
      entityType: 'auth',
      description: `Blocked client tried to log in as "${username}"`,
      metadata: { username, ip },
    });
    return { ok: false, error: 'blocked' };
  }

  try {
    const { token, user } = await apiFetch<{ token: string; user: User }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password: pass }),
    });
    setToken(token);
    const fullUser: User = {
      username: user.username,
      role: user.role,
      fullName: user.fullName || user.username,
      email: user.email,
      contact: user.contact,
      isActive: user.isActive !== false,
    };
    try {
      sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(fullUser));
    } catch (e) {
      console.error('Could not save user to session storage', e);
    }
    securityService.clearFailedAttemptsForClient(securityService.getClientId());
    auditService.logEvent({
      performedBy: fullUser.username,
      action: 'login_success',
      entityType: 'auth',
      description: `User "${fullUser.username}" logged in`,
      metadata: { ip, role: fullUser.role },
    });
    return { ok: true, user: fullUser };
  } catch (e) {
    const msg = e instanceof Error ? e.message : '';

    // Backend unreachable — not a credential failure, don't penalize the IP.
    if (/reach the backend/i.test(msg)) {
      return { ok: false, error: 'invalid' };
    }

    // Backend rejected a deactivated account (HTTP 403).
    if (/deactivated/i.test(msg)) {
      auditService.logEvent({
        performedBy: 'system',
        action: 'login_failed',
        entityType: 'auth',
        description: `Login attempt for inactive user "${username}"`,
        metadata: { username, ip },
      });
      return { ok: false, error: 'inactive' };
    }

    // Invalid credentials.
    const result = securityService.recordFailedAttempt(username);
    auditService.logEvent({
      performedBy: 'system',
      action: 'login_failed',
      entityType: 'auth',
      description: `Failed login attempt for "${username}"`,
      metadata: { username, ip, attemptCount: result.attemptCount, wasBlocked: result.wasBlocked },
    });
    if (result.wasBlocked) {
      return { ok: false, error: 'blocked' };
    }
    return { ok: false, error: 'invalid', remainingAttempts: result.remainingAttempts };
  }
};

export const logout = (): void => {
  try {
    const stored = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (stored) {
      const user = JSON.parse(stored);
      auditService.logEvent({
        performedBy: user.username,
        action: 'logout',
        entityType: 'auth',
        description: `User "${user.username}" logged out`,
      });
    }
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
  } catch (e) {
    console.error('Could not remove user from session storage', e);
  }
  clearToken();
};

export const getCurrentUser = (): User | null => {
  try {
    const storedUser = sessionStorage.getItem(SESSION_STORAGE_KEY);
    return storedUser ? (JSON.parse(storedUser) as User) : null;
  } catch (e) {
    console.error('Could not retrieve user from session storage', e);
    return null;
  }
};

// --- User management (backend) ---

export interface UserPayload {
  fullName: string;
  username: string;
  email?: string;
  contact?: string;
  password?: string;
  role: UserRole;
}

export interface ServiceResult {
  success: boolean;
  error?: string;
}

export const getUsers = async (): Promise<User[]> => {
  return apiFetch<User[]>('/users');
};

export const createUser = async (payload: UserPayload): Promise<ServiceResult> => {
  try {
    const created = await apiFetch<User>('/users', { method: 'POST', body: JSON.stringify(payload) });
    auditService.logEvent({
      action: 'create',
      entityType: 'user',
      entityId: created.username,
      entityLabel: created.fullName || created.username,
      description: `Created user "${created.username}" (${created.role})`,
      metadata: { role: created.role, email: created.email, contact: created.contact },
    });
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Failed to create user.' };
  }
};

export const updateUser = async (originalUsername: string, payload: UserPayload): Promise<ServiceResult> => {
  try {
    const saved = await apiFetch<User>(`/users/${encodeURIComponent(originalUsername)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    auditService.logEvent({
      action: 'update',
      entityType: 'user',
      entityId: originalUsername,
      entityLabel: saved.fullName || saved.username,
      description: `Updated user "${saved.username}"`,
    });
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Failed to update user.' };
  }
};

export const setUserActive = async (username: string, active: boolean): Promise<ServiceResult> => {
  try {
    await apiFetch(`/users/${encodeURIComponent(username)}/active`, {
      method: 'PATCH',
      body: JSON.stringify({ active }),
    });
    auditService.logEvent({
      action: active ? 'activate' : 'deactivate',
      entityType: 'user',
      entityId: username,
      entityLabel: username,
      description: `${active ? 'Activated' : 'Deactivated'} user "${username}"`,
    });
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Failed to update user.' };
  }
};

export const deleteUser = async (username: string): Promise<ServiceResult> => {
  try {
    await apiFetch(`/users/${encodeURIComponent(username)}`, { method: 'DELETE' });
    auditService.logEvent({
      action: 'delete',
      entityType: 'user',
      entityId: username,
      entityLabel: username,
      description: `Deleted user "${username}"`,
    });
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Failed to delete user.' };
  }
};
