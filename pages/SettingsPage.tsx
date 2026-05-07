
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getCredentials, saveCredentials } from '../services/solisAPIService';
import { useAuth } from '../context/AuthContext';

const SettingsPage: React.FC = () => {
  const { currentUser } = useAuth();
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [apiBaseUrl, setApiBaseUrl] = useState('');
  const [savedMsg, setSavedMsg] = useState('');

  useEffect(() => {
    const creds = getCredentials();
    if (creds) {
      setApiKey(creds.apiKey);
      setApiSecret(creds.apiSecret);
      setApiBaseUrl(creds.apiBaseUrl || '');
    }
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

  const handleSave = () => {
    saveCredentials(apiKey, apiSecret, apiBaseUrl);
    setSavedMsg('Credentials saved successfully.');
    setTimeout(() => setSavedMsg(''), 3000);
  };

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-white mb-2">SolisCloud API Settings</h1>
        <p className="text-solar-text">Configure your SolisCloud credentials for live data and monthly sync.</p>
      </header>

      <div className="bg-solar-card rounded-lg border border-solar-border p-6 space-y-4">
        <div>
          <label className="label">API Base URL</label>
          <input
            type="text"
            placeholder="e.g., https://api.soliscloud.com"
            className="input-field"
            value={apiBaseUrl}
            onChange={(e) => setApiBaseUrl(e.target.value)}
          />
        </div>
        <div>
          <label className="label">API Key</label>
          <input
            type="text"
            placeholder="Enter your SolisCloud API Key"
            className="input-field"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
        </div>
        <div>
          <label className="label">API Secret</label>
          <input
            type="password"
            placeholder="Enter your SolisCloud API Secret"
            className="input-field"
            value={apiSecret}
            onChange={(e) => setApiSecret(e.target.value)}
          />
        </div>
        <p className="text-xs text-gray-500">
          Find your credentials in SolisCloud under "Account" &rarr; "Basic Settings" &rarr; "API Management". Credentials are stored in your browser.
        </p>

        <div className="flex justify-end items-center gap-4 pt-4 border-t border-solar-border">
          {savedMsg && <span className="text-solar-success text-sm">{savedMsg}</span>}
          <button onClick={handleSave} className="px-6 py-2 rounded bg-solar-success text-white font-bold hover:bg-green-600 transition">Save</button>
        </div>
      </div>

      <style>{`
        .label { display: block; font-size: 0.875rem; color: #a0aec0; margin-bottom: 0.25rem; }
        .input-field { width: 100%; background-color: #0D1B2A; border: 1px solid #415A77; border-radius: 4px; padding: 8px; color: white; outline: none; transition: border-color 150ms; }
        .input-field:focus { border-color: #FFD700; }
      `}</style>
    </div>
  );
};

export default SettingsPage;
