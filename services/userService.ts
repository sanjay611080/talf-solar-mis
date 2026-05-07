
import { User, UserRole } from "../types";
import * as auditService from './auditService';
import * as securityService from './securityService';

const SESSION_STORAGE_KEY = 'helios_mis_current_user';
const USERS_STORAGE_KEY = 'helios_mis_users_v1';

interface StoredUser {
  username: string;
  password: string;
  role: UserRole;
  fullName?: string;
  email?: string;
  contact?: string;
  isActive?: boolean;
}

const defaultUsers: StoredUser[] = [
  { username: 'admin',  password: 'password', role: 'admin',      fullName: 'Administrator',   isActive: true },
  { username: 'ops',    password: 'password', role: 'operations', fullName: 'Operations User', isActive: true },
  { username: 'viewer', password: 'password', role: 'viewer',     fullName: 'Viewer User',     isActive: true },
];

const getStoredUsers = (): StoredUser[] => {
  try {
    const stored = localStorage.getItem(USERS_STORAGE_KEY);
    if (stored) {
      const data = JSON.parse(stored);
      if (Array.isArray(data) && data.length > 0) {
        return data.map((u: any) => ({ ...u, isActive: u.isActive !== false }));
      }
    }
  } catch (e) {
    console.error("Failed to load users from local storage", e);
  }
  saveStoredUsers(defaultUsers);
  return defaultUsers;
};

const saveStoredUsers = (users: StoredUser[]) => {
  try {
    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
  } catch (e) {
    console.error("Failed to save users to local storage", e);
  }
};

const toPublicUser = (u: StoredUser): User => ({
  username: u.username,
  role: u.role,
  fullName: u.fullName,
  email: u.email,
  contact: u.contact,
  isActive: u.isActive !== false,
});

// --- Login result ---

export type LoginResult =
  | { ok: true; user: User }
  | { ok: false; error: 'blocked' | 'invalid' | 'inactive'; remainingAttempts?: number };

export const login = (username: string, pass: string): Promise<LoginResult> => {
  return new Promise((resolve) => {
    setTimeout(() => {
      const ip = securityService.getCurrentClientFakeIp();

      // Block check first — even valid creds don't get through if blocked.
      if (securityService.isCurrentClientBlocked()) {
        auditService.logEvent({
          actor: 'system',
          action: 'login_blocked',
          entityType: 'auth',
          description: `Blocked client tried to log in as "${username}"`,
          metadata: { username, ip },
        });
        resolve({ ok: false, error: 'blocked' });
        return;
      }

      const users = getStoredUsers();
      const dbUser = users.find(u => u.username.toLowerCase() === username.toLowerCase());

      if (!dbUser || dbUser.password !== pass) {
        const result = securityService.recordFailedAttempt(username);
        auditService.logEvent({
          actor: 'system',
          action: 'login_failed',
          entityType: 'auth',
          description: `Failed login attempt for "${username}"`,
          metadata: {
            username,
            ip,
            attemptCount: result.attemptCount,
            wasBlocked: result.wasBlocked,
          },
        });
        if (result.wasBlocked) {
          resolve({ ok: false, error: 'blocked' });
        } else {
          resolve({ ok: false, error: 'invalid', remainingAttempts: result.remainingAttempts });
        }
        return;
      }

      if (dbUser.isActive === false) {
        auditService.logEvent({
          actor: 'system',
          action: 'login_failed',
          entityType: 'auth',
          description: `Login attempt for inactive user "${username}"`,
          metadata: { username, ip },
        });
        resolve({ ok: false, error: 'inactive' });
        return;
      }

      // Success
      const user = toPublicUser(dbUser);
      try {
        sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(user));
      } catch (e) {
        console.error('Could not save user to session storage', e);
      }
      securityService.clearFailedAttemptsForClient(securityService.getClientId());
      auditService.logEvent({
        actor: user.username,
        action: 'login_success',
        entityType: 'auth',
        description: `User "${user.username}" logged in`,
        metadata: { ip, role: user.role },
      });
      resolve({ ok: true, user });
    }, 500);
  });
};

export const logout = (): void => {
  try {
    const stored = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (stored) {
      const user = JSON.parse(stored);
      auditService.logEvent({
        actor: user.username,
        action: 'logout',
        entityType: 'auth',
        description: `User "${user.username}" logged out`,
      });
    }
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
  } catch (e) {
    console.error('Could not remove user from session storage', e);
  }
};

export const getCurrentUser = (): User | null => {
  try {
    const storedUser = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (storedUser) {
      return JSON.parse(storedUser);
    }
    return null;
  } catch (e) {
    console.error('Could not retrieve user from session storage', e);
    return null;
  }
};

export const getUsers = (): User[] => {
  return getStoredUsers().map(toPublicUser);
};

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

export const createUser = (payload: UserPayload): ServiceResult => {
  if (!payload.username.trim() || !payload.fullName.trim()) {
    return { success: false, error: 'Full name and username are required.' };
  }
  if (!payload.password) {
    return { success: false, error: 'Password is required for new users.' };
  }

  const users = getStoredUsers();
  const usernameLc = payload.username.trim().toLowerCase();
  if (users.some(u => u.username.toLowerCase() === usernameLc)) {
    return { success: false, error: `Username "${payload.username}" already exists.` };
  }

  const newUser: StoredUser = {
    username: payload.username.trim(),
    password: payload.password,
    role: payload.role,
    fullName: payload.fullName.trim(),
    email: payload.email?.trim() || undefined,
    contact: payload.contact?.trim() || undefined,
    isActive: true,
  };

  saveStoredUsers([...users, newUser]);

  auditService.logEvent({
    action: 'create',
    entityType: 'user',
    entityId: newUser.username,
    entityLabel: newUser.fullName || newUser.username,
    description: `Created user "${newUser.username}" (${newUser.role})`,
    metadata: {
      role: newUser.role,
      email: newUser.email,
      contact: newUser.contact,
    },
  });

  return { success: true };
};

export const updateUser = (originalUsername: string, payload: UserPayload): ServiceResult => {
  if (!payload.username.trim() || !payload.fullName.trim()) {
    return { success: false, error: 'Full name and username are required.' };
  }

  const users = getStoredUsers();
  const idx = users.findIndex(u => u.username === originalUsername);
  if (idx === -1) return { success: false, error: 'User not found.' };

  const newUsername = payload.username.trim();
  if (
    newUsername.toLowerCase() !== originalUsername.toLowerCase() &&
    users.some(u => u.username.toLowerCase() === newUsername.toLowerCase())
  ) {
    return { success: false, error: `Username "${newUsername}" already in use.` };
  }

  const before = users[idx];
  const after: StoredUser = {
    username: newUsername,
    password: payload.password ? payload.password : before.password,
    role: payload.role,
    fullName: payload.fullName.trim(),
    email: payload.email?.trim() || undefined,
    contact: payload.contact?.trim() || undefined,
    isActive: before.isActive !== false,
  };
  users[idx] = after;
  saveStoredUsers(users);

  const changes = auditService.computeChanges(
    { fullName: before.fullName, email: before.email, contact: before.contact, role: before.role, username: before.username },
    { fullName: after.fullName,  email: after.email,  contact: after.contact,  role: after.role,  username: after.username },
  );
  if (payload.password) {
    changes.push({ field: 'password', before: '••••••', after: '•••••• (changed)' });
  }

  auditService.logEvent({
    action: 'update',
    entityType: 'user',
    entityId: originalUsername,
    entityLabel: after.fullName || after.username,
    description: `Updated user "${after.username}"`,
    changes,
  });

  return { success: true };
};

export const setUserActive = (username: string, active: boolean): ServiceResult => {
  const users = getStoredUsers();
  const idx = users.findIndex(u => u.username === username);
  if (idx === -1) return { success: false, error: 'User not found.' };
  users[idx].isActive = active;
  saveStoredUsers(users);

  auditService.logEvent({
    action: active ? 'activate' : 'deactivate',
    entityType: 'user',
    entityId: username,
    entityLabel: users[idx].fullName || username,
    description: `${active ? 'Activated' : 'Deactivated'} user "${username}"`,
  });

  return { success: true };
};

export const deleteUser = (username: string): ServiceResult => {
  const users = getStoredUsers();
  const target = users.find(u => u.username === username);
  if (!target) return { success: false, error: 'User not found.' };
  saveStoredUsers(users.filter(u => u.username !== username));

  auditService.logEvent({
    action: 'delete',
    entityType: 'user',
    entityId: username,
    entityLabel: target.fullName || username,
    description: `Deleted user "${username}"`,
    metadata: {
      role: target.role,
      email: target.email,
      contact: target.contact,
    },
  });

  return { success: true };
};
