
import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import type { LoginResult } from '../services/userService';

const LoginPage: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      const result: LoginResult = await login(username, password);
      if (!result.ok) {
        const failure = result as Extract<LoginResult, { ok: false }>;
        if (failure.error === 'blocked') {
          setError('Access blocked. Too many failed attempts from this IP. Please contact your administrator to unblock.');
        } else if (failure.error === 'inactive') {
          setError('This account is deactivated. Contact your administrator.');
        } else {
          const remaining = failure.remainingAttempts ?? 0;
          setError(
            remaining > 0
              ? `Invalid username or password. ${remaining} ${remaining === 1 ? 'attempt' : 'attempts'} remaining before this IP is blocked.`
              : 'Invalid username or password.'
          );
        }
      }
    } catch (err) {
      setError('An unexpected error occurred.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-solar-bg">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-3 mb-8">
            <div className="w-12 h-12 bg-gradient-to-tr from-yellow-400 to-orange-600 rounded-full"></div>
            <span className="text-3xl font-bold text-white tracking-wide">Talf Solar <span className="font-light text-solar-accent">MIS</span></span>
        </div>
        
        <form 
          onSubmit={handleSubmit}
          className="bg-solar-card shadow-2xl rounded-lg px-8 pt-6 pb-8 mb-4 border border-solar-border"
        >
          <div className="mb-4">
            <label className="block text-solar-text text-sm font-bold mb-2" htmlFor="username">
              Username
            </label>
            <input
              className="input-field"
              id="username"
              type="text"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
            />
          </div>
          <div className="mb-6">
            <label className="block text-solar-text text-sm font-bold mb-2" htmlFor="password">
              Password
            </label>
            <input
              className="input-field"
              id="password"
              type="password"
              placeholder="******************"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          {error && <p className="text-red-500 text-xs italic mb-4">{error}</p>}
          <div className="flex items-center justify-between">
            <button
              className="w-full bg-solar-accent hover:bg-yellow-500 text-black font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline transition duration-150 ease-in-out disabled:opacity-50"
              type="submit"
              disabled={isLoading}
            >
              {isLoading ? 'Signing In...' : 'Sign In'}
            </button>
          </div>
           <div className="text-center text-xs text-gray-500 mt-6">
             <p>Available users for demo:</p>
             <p>admin / password</p>
             <p>ops / password</p>
             <p>viewer / password</p>
           </div>
        </form>
        <p className="text-center text-gray-600 text-xs">
          &copy;{new Date().getFullYear()} Talf Solar India. All rights reserved.
        </p>
      </div>
       <style>{`
        .input-field { width: 100%; background-color: #0D1B2A; border: 1px solid #415A77; border-radius: 4px; padding: 12px; color: white; outline: none; transition: border-color 150ms; }
        .input-field:focus { border-color: #FFD700; }
      `}</style>
    </div>
  );
};

export default LoginPage;
