
import React, { useState, useMemo } from 'react';
import { Project, Inverter, BreakdownEvent, BreakdownReason, BreakdownStats } from '../types';
import { calculateBreakdownStats } from '../services/dataService';
import { useAuth } from '../context/AuthContext';

interface Props {
  project: Project;
  inverter: Inverter;
  inverterDcCapacity: number;
  onEditEvent: (event: BreakdownEvent) => void;
  onDeleteEvent: (eventId: string) => void;
  monthFilter: string;
  onMonthFilterChange: (month: string) => void;
}

const formatMinutes = (mins: number) => {
  if (isNaN(mins) || mins < 0) return '00:00';
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

const SortIcon = ({ direction }: { direction: 'asc' | 'desc' | null }) => {
  if (!direction) return <span className="text-gray-600 ml-1 opacity-0 group-hover:opacity-50">⇅</span>;
  return <span className="text-solar-accent ml-1">{direction === 'asc' ? '▲' : '▼'}</span>;
};


const InverterBreakdownAnalysis: React.FC<Props> = ({ project, inverter, inverterDcCapacity, onEditEvent, onDeleteEvent, monthFilter, onMonthFilterChange }) => {
  const { currentUser } = useAuth();
  const [sortConfig, setSortConfig] = useState<{ key: keyof BreakdownEvent, dir: 'asc' | 'desc' }>({ key: 'date', dir: 'desc' });

  const canEdit = currentUser?.role === 'admin' || currentUser?.role === 'operations';

  const { filteredEvents, stats, daysInMonth } = useMemo(() => {
    const events = (project.breakdownEvents || [])
      .filter(e => e.inverterName === inverter.name && e.date.startsWith(monthFilter));
    
    const [year, month] = monthFilter.split('-').map(Number);
    const d = new Date(year, month, 0).getDate();

    const calculatedStats = calculateBreakdownStats(events, inverterDcCapacity, d);
    return { filteredEvents: events, stats: calculatedStats, daysInMonth: d };
  }, [project.breakdownEvents, inverter.name, monthFilter, inverterDcCapacity]);

  const sortedEvents = useMemo(() => {
    return [...filteredEvents].sort((a, b) => {
      const valA = a[sortConfig.key];
      const valB = b[sortConfig.key];
      let comparison = 0;
      if (valA > valB) comparison = 1;
      else if (valA < valB) comparison = -1;
      return sortConfig.dir === 'desc' ? -comparison : comparison;
    });
  }, [filteredEvents, sortConfig]);

  const handleSort = (key: keyof BreakdownEvent) => {
    setSortConfig(prev => ({ key, dir: prev.key === key && prev.dir === 'asc' ? 'desc' : 'asc' }));
  };

  const getDuration = (start: string, end: string) => {
      const [sh, sm] = start.split(':').map(Number);
      const [eh, em] = end.split(':').map(Number);
      return (eh*60+em) - (sh*60+sm);
  }
  
  return (
    <div className="space-y-6">
      <div className="bg-solar-card p-4 rounded-lg border border-solar-border">
        <label htmlFor="month-filter" className="text-sm text-gray-400 mr-2">Select Month:</label>
        <input 
            type="month" 
            id="month-filter"
            value={monthFilter}
            onChange={(e) => onMonthFilterChange(e.target.value)}
            className="bg-solar-bg border border-solar-border rounded p-2 text-white"
        />
      </div>
      
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="kpi-card"><p className="kpi-label">Total Downtime</p><p className="kpi-value text-solar-danger">{formatMinutes(stats.totalBreakdownDurationMinutes)}</p></div>
        <div className="kpi-card"><p className="kpi-label">Generation Loss</p><p className="kpi-value text-orange-400">{stats.totalGenerationLossKwh.toFixed(1)} <span className="text-sm font-normal">kWh</span></p></div>
        <div className="kpi-card"><p className="kpi-label">Availability</p><p className="kpi-value text-solar-success">{stats.availabilityPercent.toFixed(2)}%</p></div>
        <div className="kpi-card"><p className="kpi-label">Incidents</p><p className="kpi-value">{filteredEvents.length}</p></div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-solar-card rounded-lg border border-solar-border">
            <h3 className="p-4 font-bold text-white border-b border-solar-border">Breakdown by Cause</h3>
            <div className="p-4 space-y-2">
            {/* FIX: Cast `data` to the correct type to avoid property access errors on 'unknown'. */}
            {Object.entries(stats.byReason).map(([reason, data]) => {
                const reasonData = data as { count: number; durationMinutes: number; };
                return (
                    <div key={reason}>
                        <div className="flex justify-between text-sm mb-1">
                            <span className="font-semibold text-gray-300">{reason} ({reasonData.count})</span>
                            <span className="text-gray-400">{formatMinutes(reasonData.durationMinutes)}</span>
                        </div>
                        <div className="w-full bg-solar-bg rounded-full h-2.5">
                            <div className="bg-solar-danger h-2.5 rounded-full" style={{ width: `${(reasonData.durationMinutes / (stats.totalBreakdownDurationMinutes || 1)) * 100}%` }}></div>
                        </div>
                    </div>
                );
            })}
            {Object.keys(stats.byReason).length === 0 && <p className="text-sm text-gray-500 text-center py-4">No breakdown events recorded for this month.</p>}
            </div>
        </div>
         <div className="bg-solar-card rounded-lg border border-solar-border">
            <h3 className="p-4 font-bold text-white border-b border-solar-border">Impact by Cause</h3>
            <table className="w-full text-sm text-left">
                <thead className="text-xs text-gray-400 uppercase"><tr><th className="px-4 py-2">Reason</th><th className="px-4 py-2 text-right">Gen Loss (kWh)</th><th className="px-4 py-2 text-right">GII Loss</th></tr></thead>
                <tbody className="divide-y divide-solar-border">
                {/* FIX: Cast `data` to the correct type to avoid property access errors on 'unknown'. */}
                {Object.entries(stats.byReason).map(([reason, data]) => {
                    const reasonData = data as { generationLossKwh: number; giiLoss: number; };
                    return (
                        <tr key={reason}><td className="p-3 font-medium text-gray-300">{reason}</td><td className="p-3 text-right text-orange-400">{reasonData.generationLossKwh.toFixed(1)}</td><td className="p-3 text-right text-yellow-400">{reasonData.giiLoss.toFixed(2)}</td></tr>
                    );
                })}
                </tbody>
            </table>
        </div>
      </div>

      <div className="bg-solar-card rounded-lg border border-solar-border">
        <h3 className="p-4 font-bold text-white border-b border-solar-border">Event Log</h3>
        <div className="overflow-y-auto max-h-[400px]">
          <table className="w-full text-left text-sm"><thead className="table-header"><tr>
            <th className="table-cell cursor-pointer" onClick={() => handleSort('date')}>Date <SortIcon direction={sortConfig.key === 'date' ? sortConfig.dir : null} /></th>
            <th className="table-cell">Time</th>
            <th className="table-cell">Duration</th>
            <th className="table-cell cursor-pointer" onClick={() => handleSort('reason')}>Reason <SortIcon direction={sortConfig.key === 'reason' ? sortConfig.dir : null} /></th>
            <th className="table-cell text-right">Gen Loss (kWh)</th>
            {canEdit && <th className="table-cell text-center">Actions</th>}
          </tr></thead>
            <tbody className="divide-y divide-solar-border">
              {sortedEvents.map((event) => (
                <tr key={event.id} className="hover:bg-solar-bg">
                  <td className="p-3 font-mono">{event.date}</td>
                  <td className="p-3 font-mono">{event.startTime} - {event.endTime}</td>
                  <td className="p-3">{formatMinutes(getDuration(event.startTime, event.endTime))}</td>
                  <td className="p-3">{event.reason}</td>
                  <td className="p-3 text-right text-orange-400">{((event.giiAtEnd - event.giiAtStart) * inverterDcCapacity * 0.85).toFixed(2)}</td>
                  {canEdit && <td className="p-3 text-center">
                    <button onClick={() => onEditEvent(event)} className="text-xs text-blue-400 hover:text-blue-300">Edit</button> | <button onClick={() => onDeleteEvent(event.id)} className="text-xs text-red-400 hover:text-red-300">Delete</button>
                  </td>}
                </tr>
              ))}
            </tbody>
          </table>
          {sortedEvents.length === 0 && <p className="text-center py-8 text-gray-500">No events for the selected month.</p>}
        </div>
      </div>
      <style>{`
        .table-header { background-color: #0D1B2A; color: #A0AEC0; text-transform: uppercase; font-weight: 500; position: sticky; top: 0; z-index: 10; } .table-cell { padding: 0.75rem 1rem; }
        .kpi-card { background-color: #1B263B; padding: 1rem; border-radius: 0.5rem; border: 1px solid #415A77; } .kpi-label { color: #A0AEC0; font-size: 0.75rem; text-transform: uppercase; } .kpi-value { font-size: 1.25rem; font-weight: bold; }
      `}</style>
    </div>
  );
};

export default InverterBreakdownAnalysis;
