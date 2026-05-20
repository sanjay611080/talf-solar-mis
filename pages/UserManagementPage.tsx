
import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { User, UserRole } from '../types';
import * as userService from '../services/userService';
import { useAuth } from '../context/AuthContext';
import UserFormModal from '../components/UserFormModal';
import ConfirmModal from '../components/ConfirmModal';

interface ConfirmConfig {
  title: string;
  message: string;
  variant: 'danger' | 'warning' | 'info';
  confirmLabel: string;
  onConfirm: () => void;
}

type RoleFilter = UserRole | 'all';
type StatusFilter = 'all' | 'active' | 'inactive';

const roleBadgeClass = (role: UserRole) => {
  if (role === 'admin') return 'bg-red-500/20 text-red-300 border border-red-500/40';
  if (role === 'operations') return 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/40';
  return 'bg-blue-500/20 text-blue-300 border border-blue-500/40';
};

const UserManagementPage: React.FC = () => {
  const { currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [isModalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [confirmConfig, setConfirmConfig] = useState<ConfirmConfig | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setUsers(await userService.getUsers());
      } catch (e) {
        console.error('Failed to load users', e);
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

  const refreshUsers = async () => {
    try {
      setUsers(await userService.getUsers());
    } catch (e) {
      console.error('Failed to refresh users', e);
    }
  };

  const handleSave = async (
    payload: userService.UserPayload,
    isEdit: boolean,
    originalUsername?: string,
  ): Promise<userService.ServiceResult> => {
    const result = isEdit && originalUsername
      ? await userService.updateUser(originalUsername, payload)
      : await userService.createUser(payload);
    if (result.success) await refreshUsers();
    return result;
  };

  const openCreateModal = () => {
    setEditingUser(null);
    setModalOpen(true);
  };

  const openEditModal = (u: User) => {
    setEditingUser(u);
    setModalOpen(true);
  };

  const handleToggleActive = (u: User) => {
    const willDeactivate = u.isActive !== false;
    const displayName = u.fullName || u.username;

    if (!willDeactivate) {
      // Activating doesn't need confirmation
      (async () => {
        const result = await userService.setUserActive(u.username, true);
        if (!result.success) alert(result.error || 'Failed to activate user.');
        await refreshUsers();
      })();
      return;
    }

    setConfirmConfig({
      title: 'Deactivate user?',
      message: `"${displayName}" will not be able to log in until you reactivate this account.`,
      variant: 'warning',
      confirmLabel: 'Deactivate',
      onConfirm: async () => {
        const result = await userService.setUserActive(u.username, false);
        if (!result.success) alert(result.error || 'Failed to deactivate user.');
        await refreshUsers();
      },
    });
  };

  const handleDelete = (u: User) => {
    const displayName = u.fullName || u.username;
    setConfirmConfig({
      title: 'Delete user?',
      message: `"${displayName}" will be permanently removed. This action cannot be undone.`,
      variant: 'danger',
      confirmLabel: 'Delete',
      onConfirm: async () => {
        const result = await userService.deleteUser(u.username);
        if (!result.success) alert(result.error || 'Failed to delete user.');
        await refreshUsers();
      },
    });
  };

  const filteredUsers = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return users.filter(u => {
      const matchesSearch = !term
        || (u.fullName && u.fullName.toLowerCase().includes(term))
        || u.username.toLowerCase().includes(term)
        || (u.email && u.email.toLowerCase().includes(term))
        || (u.contact && u.contact.toLowerCase().includes(term));
      const matchesRole = roleFilter === 'all' || u.role === roleFilter;
      const matchesStatus =
        statusFilter === 'all'
        || (statusFilter === 'active' && u.isActive !== false)
        || (statusFilter === 'inactive' && u.isActive === false);
      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [users, searchTerm, roleFilter, statusFilter]);

  const clearFilters = () => {
    setSearchTerm('');
    setRoleFilter('all');
    setStatusFilter('all');
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <header className="flex justify-between items-start gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">User Management</h1>
          <p className="text-solar-text">Create and manage users with operations or viewer access.</p>
        </div>
        <button
          onClick={openCreateModal}
          className="bg-solar-accent text-black font-bold px-4 py-2 rounded shadow hover:bg-yellow-400 transition flex items-center gap-2 shrink-0"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Add User
        </button>
      </header>

      <div className="bg-solar-card rounded-lg border border-solar-border p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div className="md:col-span-2">
            <label className="label">Search</label>
            <input
              type="text"
              className="input-field"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Search by name, username, email, or contact"
            />
          </div>
          <div>
            <label className="label">Role</label>
            <select className="input-field" value={roleFilter} onChange={e => setRoleFilter(e.target.value as RoleFilter)}>
              <option value="all">All Roles</option>
              <option value="admin">Admin</option>
              <option value="operations">Operations</option>
              <option value="viewer">Viewer</option>
            </select>
          </div>
          <div>
            <label className="label">Status</label>
            <select className="input-field" value={statusFilter} onChange={e => setStatusFilter(e.target.value as StatusFilter)}>
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </div>
        {(searchTerm || roleFilter !== 'all' || statusFilter !== 'all') && (
          <div className="mt-3 flex justify-between items-center text-xs text-gray-400">
            <span>Showing {filteredUsers.length} of {users.length} users</span>
            <button onClick={clearFilters} className="text-solar-accent hover:underline">Clear filters</button>
          </div>
        )}
      </div>

      <div className="bg-solar-card rounded-lg border border-solar-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="table-header">
              <tr>
                <th className="table-cell">User</th>
                <th className="table-cell">Email</th>
                <th className="table-cell">Contact</th>
                <th className="table-cell">Role</th>
                <th className="table-cell">Status</th>
                <th className="table-cell text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-solar-border">
              {filteredUsers.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-gray-500">No users match the current filters.</td>
                </tr>
              )}
              {filteredUsers.map(u => {
                const isSelf = u.username === currentUser?.username;
                const isAdminUser = u.role === 'admin';
                const canManage = !isAdminUser;
                const isActive = u.isActive !== false;

                return (
                  <tr key={u.username} className="hover:bg-solar-bg">
                    <td className="table-cell">
                      <p className="font-semibold text-white">{u.fullName || u.username}</p>
                      <p className="text-xs text-gray-500">@{u.username}{isSelf && <span className="ml-2 text-solar-accent">(you)</span>}</p>
                    </td>
                    <td className="table-cell text-gray-300">{u.email || <span className="text-gray-600">—</span>}</td>
                    <td className="table-cell text-gray-300">{u.contact || <span className="text-gray-600">—</span>}</td>
                    <td className="table-cell">
                      <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${roleBadgeClass(u.role)}`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="table-cell">
                      {isActive ? (
                        <span className="inline-flex items-center gap-1.5 text-xs text-solar-success">
                          <span className="w-2 h-2 rounded-full bg-solar-success"></span> Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs text-gray-400">
                          <span className="w-2 h-2 rounded-full bg-gray-500"></span> Inactive
                        </span>
                      )}
                    </td>
                    <td className="table-cell">
                      {canManage ? (
                        <div className="flex justify-center gap-2 flex-wrap">
                          <button onClick={() => openEditModal(u)} className="text-xs text-blue-400 hover:text-blue-300">Edit</button>
                          <button onClick={() => handleToggleActive(u)} className={`text-xs ${isActive ? 'text-yellow-400 hover:text-yellow-300' : 'text-solar-success hover:text-green-300'}`}>
                            {isActive ? 'Deactivate' : 'Activate'}
                          </button>
                          <button onClick={() => handleDelete(u)} className="text-xs text-red-400 hover:text-red-300">Delete</button>
                        </div>
                      ) : (
                        <p className="text-xs text-gray-600 text-center">Protected</p>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <UserFormModal
        isOpen={isModalOpen}
        onClose={() => setModalOpen(false)}
        initialUser={editingUser}
        onSave={handleSave}
      />

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
      `}</style>
    </div>
  );
};

export default UserManagementPage;
