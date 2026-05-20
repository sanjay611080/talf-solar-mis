
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Project, Inverter, ModuleBuild } from '../types';
import { calculateProjectStaticCapacity } from '../services/dataService';
import { getModuleBuilds } from '../services/moduleBuildService';

export interface SaveResult {
  success: boolean;
  error?: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSave: (project: Project) => SaveResult;
  initialProject?: Project | null;
}

const createEmptyProject = (): Project => ({
  projectCode: '',
  projectName: '',
  projectState: '',
  projectOwner: '',
  dateOfCommissioning: new Date().toISOString().split('T')[0],
  tariff: 0,
  inverters: [],
  monthlyData: {},
});

const ProjectManagementModal: React.FC<Props> = ({ isOpen, onClose, onSave, initialProject }) => {
  const [project, setProject] = useState<Project>(createEmptyProject);
  const [moduleBuilds, setModuleBuilds] = useState<ModuleBuild[]>([]);
  const [error, setError] = useState('');

  const isEdit = !!initialProject;

  useEffect(() => {
    if (!isOpen) return;
    setError('');
    setModuleBuilds(getModuleBuilds());
    if (initialProject) {
      setProject(JSON.parse(JSON.stringify(initialProject)));
    } else {
      setProject(createEmptyProject());
    }
  }, [isOpen, initialProject]);

  if (!isOpen) return null;

  const handleAddInverter = () => {
    setProject(prev => ({
      ...prev,
      inverters: [...prev.inverters, { name: `${prev.projectCode || 'NEW'} Inverter ${prev.inverters.length + 1}`, kwac: 0 }],
    }));
  };

  const handleRemoveInverter = (invIndex: number) => {
    const newInverters = [...project.inverters];
    newInverters.splice(invIndex, 1);
    setProject(prev => ({ ...prev, inverters: newInverters }));
  };

  const handleInverterChange = (invIndex: number, field: keyof Inverter, value: string | number) => {
    const newInverters = [...project.inverters];
    (newInverters[invIndex] as any)[field] = value;
    setProject(prev => ({ ...prev, inverters: newInverters }));
  };

  const handleSave = () => {
    setError('');
    const result = onSave(project);
    if (result.success) {
      onClose();
    } else {
      setError(result.error || 'Failed to save project.');
    }
  };

  const { totalKWac } = calculateProjectStaticCapacity(project);
  // Total DC capacity = sum of each inverter's (module count x module build Wp).
  const totalKWdc = project.inverters.reduce((sum, inv) => {
    const build = inv.moduleBuildId ? moduleBuilds.find((b) => b.id === inv.moduleBuildId) : undefined;
    return sum + ((inv.moduleCount || 0) * (build?.wp || 0)) / 1000;
  }, 0);

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black bg-opacity-70 backdrop-blur-sm overflow-y-auto">
      <div className="bg-solar-bg w-full max-w-6xl m-4 rounded-lg border border-solar-border shadow-2xl flex flex-col max-h-[90vh]">
        <div className="p-6 border-b border-solar-border flex justify-between items-center">
          <h2 className="text-xl font-bold text-solar-accent">
            {isEdit ? 'Edit Project Configuration' : 'Create New Project'}
          </h2>
          <button onClick={onClose} className="text-2xl text-solar-text hover:text-white" aria-label="Close">&times;</button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            <div>
              <label className="label">Project Code</label>
              <input type="text" className="input-field disabled:bg-gray-700 disabled:cursor-not-allowed" value={project.projectCode} onChange={(e) => setProject({ ...project, projectCode: e.target.value })} disabled={isEdit} />
            </div>
            <div><label className="label">Project Name</label><input type="text" className="input-field" value={project.projectName} onChange={(e) => setProject({ ...project, projectName: e.target.value })} /></div>
            <div><label className="label">State</label><input type="text" className="input-field" value={project.projectState} onChange={(e) => setProject({ ...project, projectState: e.target.value })} /></div>
            <div><label className="label">Project Owner</label><input type="text" className="input-field" value={project.projectOwner} onChange={(e) => setProject({ ...project, projectOwner: e.target.value })} /></div>
            <div><label className="label">Commissioning Date</label><input type="date" className="input-field" value={project.dateOfCommissioning.split('T')[0]} onChange={(e) => setProject({ ...project, dateOfCommissioning: new Date(e.target.value).toISOString() })} /></div>
            <div><label className="label">Fixed Tariff (₹)</label><input type="number" step="0.001" className="input-field" value={project.tariff} onChange={(e) => setProject({ ...project, tariff: parseFloat(e.target.value) })} /></div>
          </div>

          <div className="bg-solar-card p-4 rounded border border-solar-border mb-6 flex justify-around">
            <div className="text-center">
              <p className="text-gray-400 text-xs uppercase">Total Fixed KWac</p>
              <p className="text-xl font-bold text-solar-success">{totalKWac.toLocaleString()}</p>
            </div>
            <div className="text-center">
              <p className="text-gray-400 text-xs uppercase">Total Fixed KWdc</p>
              <p className="text-xl font-bold text-blue-300">{totalKWdc.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold text-white">Inverters & Modules</h3>
              <button onClick={handleAddInverter} className="px-3 py-1 text-sm bg-solar-accent text-solar-bg font-bold rounded hover:bg-yellow-400">+ Add Inverter</button>
            </div>
            {project.inverters.map((inv, iIdx) => {
              // Fixed KWdc is derived: module build's Wp x module count.
              const selectedBuild = inv.moduleBuildId
                ? moduleBuilds.find(b => b.id === inv.moduleBuildId)
                : undefined;
              const fixedKWdc = ((inv.moduleCount || 0) * (selectedBuild?.wp || 0)) / 1000;
              return (
                <div key={iIdx} className="bg-solar-card border border-solar-border rounded p-4 grid grid-cols-1 md:grid-cols-6 gap-4 items-end">
                  <div className="md:col-span-1"><label className="label-sm">Inverter Name</label><input type="text" className="input-field-sm" value={inv.name} onChange={(e) => handleInverterChange(iIdx, 'name', e.target.value)} /></div>
                  <div className="md:col-span-1"><label className="label-sm">Solis SN (for API)</label><input type="text" className="input-field-sm" value={inv.solisSn || ''} onChange={(e) => handleInverterChange(iIdx, 'solisSn', e.target.value)} /></div>
                  <div className="md:col-span-1">
                    <label className="label-sm">Module Build</label>
                    <select value={inv.moduleBuildId || ''} onChange={(e) => handleInverterChange(iIdx, 'moduleBuildId', e.target.value)} className="input-field-sm w-full">
                      <option value="">Select Build...</option>
                      {moduleBuilds.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                  </div>
                  <div className="md:col-span-1"><label className="label-sm">Module Count</label><input type="number" className="input-field-sm" value={inv.moduleCount || ''} onChange={(e) => handleInverterChange(iIdx, 'moduleCount', parseInt(e.target.value, 10))} /></div>
                  <div className="md:col-span-1"><label className="label-sm">Fixed KWac</label><input type="number" className="input-field-sm" value={inv.kwac} onChange={(e) => handleInverterChange(iIdx, 'kwac', parseFloat(e.target.value))} /></div>
                  <div className="flex items-end gap-3">
                    <div className="flex-1">
                      <label className="label-sm">Fixed KWdc</label>
                      <input
                        type="number"
                        className="input-field-sm bg-gray-700/60 cursor-not-allowed"
                        value={Number.isFinite(fixedKWdc) ? fixedKWdc.toFixed(2) : '0'}
                        readOnly
                        title="Auto-calculated: module build Wp x module count"
                      />
                    </div>
                    <button onClick={() => handleRemoveInverter(iIdx)} className="text-red-500 hover:text-red-400 text-2xl pb-1" title="Remove inverter">&times;</button>
                  </div>
                </div>
              );
            })}
            {project.inverters.length === 0 && <p className="text-sm text-gray-500 text-center py-4">No inverters added yet.</p>}
          </div>
        </div>

        {error && <p className="px-6 pb-2 text-solar-danger text-sm">{error}</p>}

        <div className="p-6 border-t border-solar-border flex justify-end gap-4">
          <button onClick={onClose} className="px-4 py-2 rounded text-gray-300 hover:bg-solar-card">Cancel</button>
          <button onClick={handleSave} className="px-4 py-2 rounded bg-solar-success text-white font-bold hover:bg-green-600 transition">
            {isEdit ? 'Save Changes' : 'Create Project'}
          </button>
        </div>
      </div>
      <style>{`
        .label { display: block; font-size: 0.875rem; color: #a0aec0; margin-bottom: 0.25rem; }
        .label-sm { display: block; font-size: 0.75rem; color: #718096; margin-bottom: 0.25rem; }
        .input-field { width: 100%; background-color: #1B263B; border: 1px solid #415A77; border-radius: 4px; padding: 8px; color: white; outline: none; }
        .input-field-sm { width: 100%; background-color: #0D1B2A; border: 1px solid #415A77; border-radius: 4px; padding: 4px 8px; font-size: 0.875rem; color: white; outline: none; }
        .input-field:focus, .input-field-sm:focus { border-color: #FFD700; }
      `}</style>
    </div>,
    document.body
  );
};

export default ProjectManagementModal;
