
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { User, UserRole } from '../types';
import { UserPayload, ServiceResult } from '../services/userService';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  initialUser?: User | null;
  onSave: (payload: UserPayload, isEdit: boolean, originalUsername?: string) => Promise<ServiceResult>;
}

interface FormState {
  fullName: string;
  username: string;
  email: string;
  contact: string;
  password: string;
  role: UserRole;
}

const emptyForm: FormState = {
  fullName: '',
  username: '',
  email: '',
  contact: '',
  password: '',
  role: 'viewer',
};

const UserFormModal: React.FC<Props> = ({ isOpen, onClose, initialUser, onSave }) => {
  const isEdit = !!initialUser;
  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setError('');
    if (initialUser) {
      setForm({
        fullName: initialUser.fullName || '',
        username: initialUser.username,
        email: initialUser.email || '',
        contact: initialUser.contact || '',
        password: '',
        role: initialUser.role === 'admin' ? 'viewer' : initialUser.role,
      });
    } else {
      setForm(emptyForm);
    }
  }, [isOpen, initialUser]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const payload: UserPayload = {
      fullName: form.fullName,
      username: form.username,
      email: form.email,
      contact: form.contact,
      password: form.password || undefined,
      role: form.role,
    };

    const result = await onSave(payload, isEdit, initialUser?.username);
    if (!result.success) {
      setError(result.error || 'Failed to save.');
      return;
    }
    onClose();
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black bg-opacity-70 backdrop-blur-sm overflow-y-auto">
      <div className="bg-solar-bg w-full max-w-lg m-4 rounded-lg border border-solar-border shadow-2xl flex flex-col max-h-[90vh]">
        <div className="p-6 border-b border-solar-border flex justify-between items-center">
          <h2 className="text-xl font-bold text-solar-accent">
            {isEdit ? 'Edit User' : 'Add User'}
          </h2>
          <button onClick={onClose} className="text-2xl text-solar-text hover:text-white" aria-label="Close">&times;</button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto flex-1 space-y-4">
          <div>
            <label className="label">Full Name</label>
            <input
              type="text"
              className="input-field"
              value={form.fullName}
              onChange={e => setForm({ ...form, fullName: e.target.value })}
              placeholder="e.g. Rohit Sharma"
              required
            />
          </div>
          <div>
            <label className="label">Username</label>
            <input
              type="text"
              className="input-field disabled:bg-gray-700 disabled:cursor-not-allowed"
              value={form.username}
              onChange={e => setForm({ ...form, username: e.target.value })}
              placeholder="e.g. rohit.sharma"
              disabled={isEdit}
              autoComplete="off"
              required
            />
            {isEdit && <p className="text-xs text-gray-500 mt-1">Username cannot be changed.</p>}
          </div>
          <div>
            <label className="label">Email</label>
            <input
              type="email"
              className="input-field"
              value={form.email}
              onChange={e => setForm({ ...form, email: e.target.value })}
              placeholder="user@example.com"
            />
          </div>
          <div>
            <label className="label">Contact Number</label>
            <input
              type="tel"
              className="input-field"
              value={form.contact}
              onChange={e => setForm({ ...form, contact: e.target.value })}
              placeholder="+91 ..."
            />
          </div>
          <div>
            <label className="label">{isEdit ? 'New Password' : 'Password'}</label>
            <input
              type="password"
              className="input-field"
              value={form.password}
              onChange={e => setForm({ ...form, password: e.target.value })}
              placeholder={isEdit ? 'Leave blank to keep existing' : 'Set initial password'}
              autoComplete="new-password"
              required={!isEdit}
            />
          </div>
          <div>
            <label className="label">Role</label>
            <select
              className="input-field"
              value={form.role}
              onChange={e => setForm({ ...form, role: e.target.value as UserRole })}
            >
              <option value="viewer">Viewer</option>
              <option value="operations">Operations</option>
            </select>
          </div>

          {error && <p className="text-solar-danger text-sm">{error}</p>}

          <div className="flex justify-end gap-2 pt-4 border-t border-solar-border">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded text-gray-300 hover:bg-solar-card transition">Cancel</button>
            <button type="submit" className="px-6 py-2 rounded bg-solar-success text-white font-bold hover:bg-green-600 transition">
              {isEdit ? 'Save Changes' : 'Create User'}
            </button>
          </div>
        </form>

        <style>{`
          .label { display: block; font-size: 0.875rem; color: #a0aec0; margin-bottom: 0.25rem; }
          .input-field { width: 100%; background-color: #1B263B; border: 1px solid #415A77; border-radius: 4px; padding: 8px; color: white; outline: none; transition: border-color 150ms; }
          .input-field:focus { border-color: #FFD700; }
        `}</style>
      </div>
    </div>,
    document.body
  );
};

export default UserFormModal;
