
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ModuleBuild } from '../types';
import * as moduleBuildService from '../services/moduleBuildService';
import { useAuth } from '../context/AuthContext';

const emptyBuild: Omit<ModuleBuild, 'id'> = {
  name: '',
  wp: 0,
  area: 0,
  degradation: { firstYear: 2.0, subsequentYears: 0.55 },
};

const ModuleBuildsPage: React.FC = () => {
  const { currentUser } = useAuth();
  const [builds, setBuilds] = useState<ModuleBuild[]>([]);
  const [editingBuild, setEditingBuild] = useState<Partial<ModuleBuild> | null>(null);

  useEffect(() => {
    setBuilds(moduleBuildService.getModuleBuilds());
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

  const handleSave = async () => {
    if (!editingBuild || !editingBuild.name) return;

    try {
      if (editingBuild.id) {
        await moduleBuildService.updateModuleBuild(editingBuild as ModuleBuild);
      } else {
        await moduleBuildService.addModuleBuild(editingBuild as Omit<ModuleBuild, 'id'>);
      }
      setBuilds(moduleBuildService.getModuleBuilds());
      setEditingBuild(null);
    } catch (e) {
      alert(`Failed to save module build: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this module build?')) {
      try {
        await moduleBuildService.deleteModuleBuild(id);
        setBuilds(moduleBuildService.getModuleBuilds());
      } catch (e) {
        alert(`Failed to delete module build: ${e instanceof Error ? e.message : 'Unknown error'}`);
      }
    }
  };

  const startNew = () => setEditingBuild({ ...emptyBuild });

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-white mb-2">Manage Module Builds</h1>
        <p className="text-solar-text">Define solar panel specifications used across all projects.</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-solar-card rounded-lg border border-solar-border p-4 flex flex-col">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-semibold text-white">Existing Builds</h3>
            <button onClick={startNew} className="text-sm bg-solar-accent text-black px-3 py-1 rounded font-bold hover:bg-yellow-300 transition">+ New</button>
          </div>
          <div className="space-y-2">
            {builds.map(build => (
              <div key={build.id} className="bg-solar-bg border border-solar-border p-3 rounded flex justify-between items-center">
                <div>
                  <p className="font-semibold text-white">{build.name}</p>
                  <p className="text-xs text-gray-400">{build.wp} Wp · {build.area} m² · {build.degradation.firstYear}% / {build.degradation.subsequentYears}% p.a.</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setEditingBuild(build)} className="text-xs text-blue-400 hover:text-blue-300">Edit</button>
                  <button onClick={() => handleDelete(build.id)} className="text-xs text-red-400 hover:text-red-300">Delete</button>
                </div>
              </div>
            ))}
            {builds.length === 0 && <p className="text-sm text-gray-500 text-center py-4">No module builds configured.</p>}
          </div>
        </div>

        <div className="bg-solar-card rounded-lg border border-solar-border p-4">
          {editingBuild ? (
            <div className="space-y-4">
              <h3 className="font-semibold text-white">{editingBuild.id ? 'Edit Build' : 'New Build'}</h3>
              <div>
                <label className="label">Build Name</label>
                <input type="text" value={editingBuild.name} onChange={e => setEditingBuild(p => ({ ...p, name: e.target.value }))} className="input-field" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Wp</label>
                  <input type="number" value={editingBuild.wp} onChange={e => setEditingBuild(p => ({ ...p, wp: parseFloat(e.target.value) }))} className="input-field" />
                </div>
                <div>
                  <label className="label">Area (m²)</label>
                  <input type="number" step="0.01" value={editingBuild.area} onChange={e => setEditingBuild(p => ({ ...p, area: parseFloat(e.target.value) }))} className="input-field" />
                </div>
              </div>
              <div>
                <label className="label">Degradation (%)</label>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="label text-xs">First Year</label>
                    <input type="number" step="0.01" value={editingBuild.degradation?.firstYear} onChange={e => setEditingBuild(p => ({ ...p, degradation: { ...p!.degradation!, firstYear: parseFloat(e.target.value) } }))} className="input-field" />
                  </div>
                  <div>
                    <label className="label text-xs">Subsequent</label>
                    <input type="number" step="0.01" value={editingBuild.degradation?.subsequentYears} onChange={e => setEditingBuild(p => ({ ...p, degradation: { ...p!.degradation!, subsequentYears: parseFloat(e.target.value) } }))} className="input-field" />
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <button onClick={() => setEditingBuild(null)} className="px-3 py-1 text-sm rounded text-gray-300 hover:bg-solar-border">Cancel</button>
                <button onClick={handleSave} className="px-3 py-1 text-sm rounded bg-solar-success text-white font-bold hover:bg-green-600">Save</button>
              </div>
            </div>
          ) : (
            <div className="text-center text-gray-500 pt-10">Select a build to edit or create a new one.</div>
          )}
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

export default ModuleBuildsPage;
