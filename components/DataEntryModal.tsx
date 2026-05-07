import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Project, MonthlyData } from '../types';
import * as solisAPIService from '../services/solisAPIService';
import { useAuth } from '../context/AuthContext';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  project: Project;
  onSave: (monthlyData: Record<string, MonthlyData>) => void;
}

const DataEntryModal: React.FC<Props> = ({ isOpen, onClose, project, onSave }) => {
  const { currentUser } = useAuth();
  const [localData, setLocalData] = useState<Record<string, MonthlyData>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [syncingMonth, setSyncingMonth] = useState<string | null>(null);
  const [tableRows, setTableRows] = useState<string[]>([]);
  const [openMonth, setOpenMonth] = useState<string | null>(null);

  const isViewer = currentUser?.role === 'viewer';
  const isAdmin = currentUser?.role === 'admin';
  const isOps = currentUser?.role ==='operations';


  const createDefaultMonthData = (month: string): MonthlyData => ({
    month,
    electricityImportedKWh: 0,
    targetNetKWhP50: 0,
    inverterExportKWh: project.inverters.map(() => 0),
    inverterTargetOMKWh: project.inverters.map(() => 0),
    inverterIrradiation: project.inverters.map(() => 0),
    inverterDcCapacityKW: project.inverters.map(() => 0),
  });

  useEffect(() => {
    if (isOpen && project) {
      setLocalData(JSON.parse(JSON.stringify(project.monthlyData)));
      
      const startDate = new Date(project.dateOfCommissioning);
      const endDate = new Date();
      const rows: string[] = [];
      const current = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
      
      while (current <= endDate) {
        const key = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`;
        rows.push(key);
        current.setMonth(current.getMonth() + 1);
      }
      setTableRows(rows.reverse()); // Show most recent first
      
      if (rows.length > 0) {
        setOpenMonth(rows[0]);
      }

    }
  }, [isOpen, project]);
  
  const handleProjectDataChange = (month: string, field: 'electricityImportedKWh' | 'targetNetKWhP50', value: number) => {
    setLocalData(prev => ({
      ...prev,
      [month]: {
        ...(prev[month] || createDefaultMonthData(month)),
        [field]: value
      }
    }));
  };

  // FIX: Corrected the type for the `field` parameter to only include keys associated
  // with array values (`number[]`). This prevents a spread operator error that occurred
  // when attempting to iterate over a non-iterable `number` type.
  const handleInverterDataChange = (month: string, invIndex: number, field: keyof Omit<MonthlyData, 'month' | 'electricityImportedKWh' | 'targetNetKWhP50'>, value: number) => {
    setLocalData(prev => {
      const monthData = prev[month] || createDefaultMonthData(month);
      const newValues = [...(monthData[field] || project.inverters.map(() => 0))];
      newValues[invIndex] = value;
      return {
        ...prev,
        [month]: { ...monthData, [field]: newValues }
      };
    });
  };
  
  const handleSyncMonth = async (e: React.MouseEvent, month: string) => {
    e.stopPropagation();
    setSyncingMonth(month);
    try {
      const syncedData = await solisAPIService.syncMonthData(project, month);
      setLocalData(prev => ({ ...prev, [month]: syncedData }));
    } catch (error: any) {
      alert(`Error syncing data for ${month}: ${error.message}`);
    } finally {
      setSyncingMonth(null);
    }
  };


  const handleSaveClick = async () => {
    setIsSaving(true);
    await onSave(localData);
    setIsSaving(false);
  };

  if (!isOpen) return null;
  
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black bg-opacity-80 backdrop-blur-sm">
      <div className="bg-solar-bg w-full max-w-screen-xl h-[95vh] rounded-lg border border-solar-border shadow-2xl flex flex-col">
        
        <div className="p-4 border-b border-solar-border flex justify-between items-center bg-solar-card">
          <div>
            <h2 className="text-xl font-bold text-white">Data Entry: {project.projectName}</h2>
            <p className="text-sm text-gray-400">Sync from API or manually adjust targets. Measured values are read-only for Operations.</p>
          </div>
          <button onClick={onClose} className="text-2xl text-gray-400 hover:text-white">&times;</button>
        </div>
        
        <div className="flex-1 overflow-auto p-4 space-y-2">
            {tableRows.map(month => {
              const isExpanded = openMonth === month;
              const rowData = localData[month] || createDefaultMonthData(month);
              return (
                <div key={month} className="bg-solar-card border border-solar-border rounded-lg overflow-hidden">
                  <div 
                    className="flex items-center p-3 cursor-pointer hover:bg-solar-border/30 transition"
                    onClick={() => setOpenMonth(isExpanded ? null : month)}
                  >
                    <div className="w-1/4 font-mono text-solar-accent">{month}</div>
                    <div className="w-1/4 flex items-center gap-2">
                      <label className="text-xs text-gray-400">Import (kWh):</label>
                      <input 
                        type="number" 
                        className="input-field-sm w-28" 
                        value={rowData.electricityImportedKWh || ''} 
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => handleProjectDataChange(month, 'electricityImportedKWh', parseFloat(e.target.value))} 
                        disabled={isViewer || isOps}
                        />
                    </div>
                     <div className="w-1/4 flex items-center gap-2">
                      <label className="text-xs text-gray-400">P50 Target (kWh):</label>
                      <input 
                        type="number" 
                        className="input-field-sm w-28" 
                        value={rowData.targetNetKWhP50 || ''} 
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => handleProjectDataChange(month, 'targetNetKWhP50', parseFloat(e.target.value))} 
                        disabled={isViewer || isOps}
                        />
                    </div>
                    <div className="flex-1 text-right text-xs text-gray-500">Click to {isExpanded ? 'collapse' : 'expand'}</div>
                    <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 ml-4 transform transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </div>

                  {isExpanded && (
                    <div className="bg-solar-bg border-t border-solar-border p-4">
                       {(isAdmin || isOps) && (
                         <div className="text-right mb-4">
                           <button onClick={(e) => handleSyncMonth(e, month)} disabled={syncingMonth === month} className="btn-secondary">
                             {syncingMonth === month ? <><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h5" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 20v-5h-5" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 9a9 9 0 0114.65-5.65L20 5" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 15a9 9 0 01-14.65 5.65L4 19" /></svg> Syncing...</> : 'Sync Month from API'}
                           </button>
                         </div>
                       )}
                      <div className="grid grid-cols-5 gap-x-4 text-xs text-gray-400 uppercase font-bold px-3 pb-2 border-b border-solar-border">
                        <div className="col-span-1">Inverter</div>
                        <div className="text-right">Export (kWh)</div>
                        <div className="text-right">Target O&M</div>
                        <div className="text-right">Irradiation</div>
                        <div className="text-right">DC (kW)</div>
                      </div>
                      <div className="space-y-2 mt-2">
                        {project.inverters.map((inv, idx) => (
                          <div key={inv.name} className="grid grid-cols-5 gap-x-4 items-center px-3 py-1 rounded hover:bg-solar-border/20">
                            <div className="col-span-1 font-semibold text-gray-300">{inv.name}</div>
                            <input type="number" className="input-field" value={rowData.inverterExportKWh?.[idx] || ''} onChange={(e) => handleInverterDataChange(month, idx, 'inverterExportKWh', parseFloat(e.target.value))} disabled={isViewer || isOps}/>
                            <input type="number" className="input-field" value={rowData.inverterTargetOMKWh?.[idx] || ''} onChange={(e) => handleInverterDataChange(month, idx, 'inverterTargetOMKWh', parseFloat(e.target.value))} disabled={isViewer} />
                            <input type="number" className="input-field" value={rowData.inverterIrradiation?.[idx] || ''} onChange={(e) => handleInverterDataChange(month, idx, 'inverterIrradiation', parseFloat(e.target.value))} disabled={isViewer || isOps} />
                            <input type="number" className="input-field" value={rowData.inverterDcCapacityKW?.[idx] || ''} onChange={(e) => handleInverterDataChange(month, idx, 'inverterDcCapacityKW', parseFloat(e.target.value))} disabled={isViewer || isOps}/>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
        </div>
        
        {!isViewer && (
            <div className="p-4 border-t border-solar-border flex justify-end bg-solar-card items-center gap-4">
            {isSaving && <span className="text-yellow-400 text-sm animate-pulse">Syncing...</span>}
            <button onClick={handleSaveClick} disabled={isSaving} className="px-6 py-2 bg-solar-success text-white font-bold rounded shadow-lg shadow-green-900/50 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-green-600 transition">
                {isSaving ? 'Saving...' : 'Save Changes'}
            </button>
            </div>
        )}
      </div>
      <style>{`
        .input-field { width: 100%; background-color: #0D1B2A; border: 1px solid #415A77; border-radius: 4px; padding: 4px 8px; color: white; text-align: right; outline: none;} 
        .input-field:disabled { background-color: #2d3748; cursor: not-allowed; color: #718096; }
        .input-field-sm { background-color: #0D1B2A; border: 1px solid #415A77; border-radius: 4px; padding: 2px 6px; font-size: 0.875rem; color: white; text-align: right; outline: none;}
        .input-field-sm:disabled { background-color: #2d3748; cursor: not-allowed; color: #718096; }
        .input-field:focus, .input-field-sm:focus { border-color: #FFD700; }
        .btn-secondary { display:inline-flex; align-items: center; gap: 0.5rem; padding: 0.5rem 1rem; font-size: 0.875rem; border: 1px solid #415A77; color: #E0E1DD; background-color: #1B263B; border-radius: 0.375rem; transition: background-color 150ms; }
        .btn-secondary:hover { background-color: #415A77; }
        .btn-secondary:disabled { background-color: #4A5568; cursor: wait; }
      `}</style>
    </div>,
    document.body
  );
};

export default DataEntryModal;