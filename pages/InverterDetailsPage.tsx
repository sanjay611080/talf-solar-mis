
import React, { useMemo, useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Project, ChartDataPoint, TimeRange, InverterKPIResult, BreakdownEvent } from '../types';
import { calculateInverterKPIs, filterMonthlyData } from '../services/dataService';
import { getModuleBuilds } from '../services/moduleBuildService';
import InverterPerformanceChart from '../components/InverterPerformanceChart';
import { SYSTEM_EFFICIENCY } from '../constants';
import { useAuth } from '../context/AuthContext';
import InverterBreakdownAnalysis from '../components/InverterBreakdownAnalysis';
import BreakdownEntryModal from '../components/BreakdownEntryModal';
import InverterLiveData from '../components/InverterLiveData';

interface Props {
  projects: Project[];
  onUpdateProject: (p: Project) => void;
}

const formatIndian = (val: number | undefined) => {
   if (val === undefined || val === null || isNaN(val)) return '-';
   if (val >= 10000000) return `${(val / 10000000).toFixed(2)} Cr`;
   if (val >= 100000) return `${(val / 100000).toFixed(2)} L`;
   if (val >= 1000) return `${(val / 1000).toFixed(1)}k`;
   return `${val.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
};

const SortIcon = ({ direction }: { direction: 'asc' | 'desc' | null }) => {
  if (!direction) return <span className="text-gray-600 ml-1 opacity-0 group-hover:opacity-50">⇅</span>;
  return <span className="text-solar-accent ml-1">{direction === 'asc' ? '▲' : '▼'}</span>;
};


const InverterDetailsPage: React.FC<Props> = ({ projects, onUpdateProject }) => {
  const { projectCode, inverterIndex: inverterIndexStr } = useParams();
  const { currentUser } = useAuth();
  const [timeRange, setTimeRange] = useState<TimeRange>('12M');
  const [activeTab, setActiveTab] = useState<'performance' | 'breakdown' | 'live'>('performance');
  const [isBreakdownModalOpen, setBreakdownModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<BreakdownEvent | null>(null);
  const [breakdownMonthFilter, setBreakdownMonthFilter] = useState<string>(new Date().toISOString().slice(0, 7));
  const [sortConfig, setSortConfig] = useState<{ key: string, dir: 'asc' | 'desc' }>({ key: 'month', dir: 'desc' });
  
  const canEditBreakdowns = currentUser?.role === 'admin' || currentUser?.role === 'operations';

  if (currentUser?.role === 'viewer') {
    return (
      <div className="p-10 text-center text-white flex flex-col items-center justify-center h-full">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-solar-danger mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
        <h2 className="text-2xl font-bold text-solar-danger mb-4">Access Denied</h2>
        <p className="text-gray-400 mb-6 max-w-md">
          Your user role does not have permission to view detailed inverter data. Please contact an administrator if you require access.
        </p>
        <Link to={`/project/${projectCode}`} className="bg-solar-accent text-black font-bold px-6 py-2 rounded shadow hover:bg-yellow-400 transition-colors">
          ← Back to Project Details
        </Link>
      </div>
    );
  }

  const { project, inverter, inverterIndex } = useMemo(() => {
    const proj = projects.find(p => p.projectCode === projectCode);
    const idx = parseInt(inverterIndexStr || '', 10);
    if (proj && !isNaN(idx) && proj.inverters[idx]) {
      return { project: proj, inverter: proj.inverters[idx], inverterIndex: idx };
    }
    return { project: null, inverter: null, inverterIndex: null };
  }, [projects, projectCode, inverterIndexStr]);

  const moduleBuilds = useMemo(() => getModuleBuilds(), []);
  const moduleBuildMap = useMemo(() => new Map(moduleBuilds.map(b => [b.id, b])), [moduleBuilds]);

  const kpis: InverterKPIResult | null = useMemo(() => {
    if (!project || inverter === null || inverterIndex === null) return null;
    return calculateInverterKPIs(project, inverter, inverterIndex, timeRange, moduleBuilds);
  }, [project, inverter, inverterIndex, timeRange, moduleBuilds]);

  const chartData: ChartDataPoint[] = useMemo(() => {
    if (!project || inverterIndex === null) return [];
    
    const monthlyValues = filterMonthlyData(project.monthlyData, 'ALL');
    const commissioningDate = new Date(project.dateOfCommissioning);
    
    return monthlyValues.map(m => {
      const monthlyExport = m.inverterExportKWh?.[inverterIndex] || 0;
      const monthlyDcKW = m.inverterDcCapacityKW?.[inverterIndex] || 0;
      const irradiation = m.inverterIrradiation?.[inverterIndex] || 0;
      const theoreticalEnergy = irradiation * monthlyDcKW * SYSTEM_EFFICIENCY;

      const monthDate = new Date(m.month + '-02');
      const monthsDiff = monthDate.getMonth() - commissioningDate.getMonth() + 12 * (monthDate.getFullYear() - commissioningDate.getFullYear());
      let prDenominator = 0;
      
      const build = project.inverters[inverterIndex].moduleBuildId ? moduleBuildMap.get(project.inverters[inverterIndex].moduleBuildId!) : undefined;

      if (build && project.inverters[inverterIndex].moduleCount && irradiation > 0) {
          const firstYearDegradationPerMonth = build.degradation.firstYear / 12;
          const subsequentYearDegradationPerMonth = build.degradation.subsequentYears / 12;
          let totalDegradationPercent = 0;
          if (monthsDiff >= 0) {
            if (monthsDiff < 12) totalDegradationPercent = (monthsDiff + 1) * firstYearDegradationPerMonth;
            else totalDegradationPercent = build.degradation.firstYear + (monthsDiff - 11) * subsequentYearDegradationPerMonth;
          }
          prDenominator += irradiation * (project.inverters[inverterIndex].moduleCount! * build.area * (1 - totalDegradationPercent / 100));
      }
      
      const pr = prDenominator > 0 ? (monthlyExport / prDenominator) * 100 : 0;

      return {
        month: m.month, actualEnergy: monthlyExport, theoreticalEnergy, pr,
        yield: monthlyDcKW > 0 ? (monthlyExport / monthlyDcKW) : 0,
        targetEnergyP50: 0, targetEnergyOM: 0, revenue: 0, targetRevenueP50: 0, targetRevenueOM: 0,
      };
    });
  }, [project, inverterIndex, moduleBuildMap]);

  const monthlyTableData = useMemo(() => {
    if (!project || !inverter) return [];
    const dataWithBreakdowns = chartData.map(cd => {
        const breakdownCount = (project.breakdownEvents || [])
            .filter(be => be.inverterName === inverter.name && be.date.startsWith(cd.month))
            .length;
        return { ...cd, breakdownCount };
    });

    return [...dataWithBreakdowns].sort((a: any, b: any) => {
        const valA = a[sortConfig.key];
        const valB = b[sortConfig.key];
        let comparison = 0;
        if (valA > valB) comparison = 1;
        else if (valA < valB) comparison = -1;
        return sortConfig.dir === 'desc' ? -comparison : comparison;
    });
  }, [chartData, project, inverter, sortConfig]);
  
  const handleSort = (key: string) => {
    setSortConfig(prev => ({ key, dir: prev.key === key && prev.dir === 'asc' ? 'desc' : 'asc' }));
  };

  const handleViewBreakdowns = (month: string) => {
    setBreakdownMonthFilter(month);
    setActiveTab('breakdown');
  };
  
  const handleOpenNewBreakdown = () => {
    setEditingEvent(null);
    setBreakdownModalOpen(true);
  };
  
  const handleEditBreakdown = (event: BreakdownEvent) => {
    setEditingEvent(event);
    setBreakdownModalOpen(true);
  };

  const handleSaveBreakdown = (event: BreakdownEvent) => {
    if (!project) return;
    const existingEvents = project.breakdownEvents || [];
    let updatedEvents;
    if (existingEvents.some(e => e.id === event.id)) {
      updatedEvents = existingEvents.map(e => e.id === event.id ? event : e);
    } else {
      updatedEvents = [...existingEvents, event];
    }
    onUpdateProject({ ...project, breakdownEvents: updatedEvents });
    setBreakdownModalOpen(false);
  };

  const handleDeleteBreakdown = (eventId: string) => {
    if (!project) return;
    const updatedEvents = (project.breakdownEvents || []).filter(e => e.id !== eventId);
    onUpdateProject({ ...project, breakdownEvents: updatedEvents });
  };
  

  if (!project || !inverter || kpis === null || inverterIndex === null) {
      return <div className="p-10 text-center text-white">Inverter not found. <Link to="/" className="link">Go Home</Link></div>;
  }
  
  const inverterDcCapacity = useMemo(() => {
    const lastMonthKey = Object.keys(project.monthlyData).sort().pop();
    if (lastMonthKey) {
        return project.monthlyData[lastMonthKey].inverterDcCapacityKW[inverterIndex] || 0;
    }
    return 0;
  }, [project, inverterIndex]);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <nav className="flex items-center gap-2 text-sm mb-2 flex-wrap">
          <Link to="/projects" className="text-blue-400 hover:text-blue-300 hover:underline transition">Projects</Link>
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
          <Link to={`/project/${project.projectCode}`} className="text-blue-400 hover:text-blue-300 hover:underline transition">{project.projectName}</Link>
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
          <span className="text-white font-medium">{inverter.name}</span>
        </nav>
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold text-white">Inverter: {inverter.name}</h1>
          {canEditBreakdowns && activeTab === 'breakdown' && (
            <button onClick={handleOpenNewBreakdown} className="bg-solar-danger text-white font-bold px-4 py-2 rounded shadow hover:bg-red-500 transition">+ Log Breakdown</button>
          )}
        </div>
      </div>

      <div className="border-b border-solar-border flex items-center gap-4">
        <button onClick={() => setActiveTab('performance')} className={`tab-button ${activeTab === 'performance' ? 'tab-active' : ''}`}>Performance</button>
        <button onClick={() => setActiveTab('breakdown')} className={`tab-button ${activeTab === 'breakdown' ? 'tab-active' : ''}`}>Breakdown Analysis</button>
        <button onClick={() => setActiveTab('live')} className={`tab-button ${activeTab === 'live' ? 'tab-active' : ''}`}>Live Data</button>
      </div>

      {activeTab === 'performance' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="kpi-card"><p className="kpi-label">Total Generation</p><p className="kpi-value text-solar-success">{formatIndian(kpis.totalExport)} kWh</p></div>
            <div className="kpi-card"><p className="kpi-label">Theoretical Max</p><p className="kpi-value text-solar-accent">{formatIndian(kpis.totalTheoreticalEnergy)} kWh</p></div>
            <div className="kpi-card"><p className="kpi-label">Performance Loss</p><p className="kpi-value text-solar-danger">{formatIndian(kpis.totalTheoreticalEnergy - kpis.totalExport)} kWh</p></div>
            <div className="kpi-card"><p className="kpi-label">Average PR</p><p className="kpi-value text-blue-300">{kpis.pr.toFixed(1)}%</p></div>
          </div>
          <InverterPerformanceChart title="Actual vs. Theoretical Generation" data={chartData} timeRange={timeRange} onTimeRangeChange={setTimeRange} />
          
          <div className="bg-solar-card rounded-lg border border-solar-border">
            <h3 className="p-4 font-bold text-white border-b border-solar-border">Monthly Performance Log</h3>
            <div className="overflow-y-auto max-h-[400px]">
              <table className="w-full text-left text-sm">
                <thead className="table-header">
                  <tr>
                    <th className="table-cell cursor-pointer" onClick={() => handleSort('month')}>Month <SortIcon direction={sortConfig.key === 'month' ? sortConfig.dir : null} /></th>
                    <th className="table-cell text-right cursor-pointer" onClick={() => handleSort('actualEnergy')}>Gen (Actual) <SortIcon direction={sortConfig.key === 'actualEnergy' ? sortConfig.dir : null} /></th>
                    <th className="table-cell text-right cursor-pointer" onClick={() => handleSort('theoreticalEnergy')}>Gen (Theoretical) <SortIcon direction={sortConfig.key === 'theoreticalEnergy' ? sortConfig.dir : null} /></th>
                    <th className="table-cell text-right cursor-pointer" onClick={() => handleSort('pr')}>PR (%) <SortIcon direction={sortConfig.key === 'pr' ? sortConfig.dir : null} /></th>
                    <th className="table-cell text-right cursor-pointer" onClick={() => handleSort('breakdownCount')}>Breakdowns <SortIcon direction={sortConfig.key === 'breakdownCount' ? sortConfig.dir : null} /></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-solar-border">
                  {monthlyTableData.map((row: any) => (
                    <tr key={row.month} className="hover:bg-solar-bg">
                      <td className="p-3 font-mono text-solar-accent">{row.month}</td>
                      <td className="p-3 text-right font-medium text-solar-success">{Math.round(row.actualEnergy).toLocaleString()}</td>
                      <td className="p-3 text-right text-gray-400">{Math.round(row.theoreticalEnergy).toLocaleString()}</td>
                      <td className="p-3 text-right text-blue-300">{row.pr?.toFixed(2)}%</td>
                      <td className="p-3 text-right">
                        {row.breakdownCount > 0 ? (
                           <button onClick={() => handleViewBreakdowns(row.month)} className="text-solar-danger font-bold hover:underline">
                            {row.breakdownCount}
                          </button>
                        ) : (
                          <span className="text-gray-500">{row.breakdownCount}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'breakdown' && (
        <InverterBreakdownAnalysis 
            inverter={inverter} 
            project={project}
            inverterDcCapacity={inverterDcCapacity}
            onEditEvent={handleEditBreakdown}
            onDeleteEvent={handleDeleteBreakdown}
            monthFilter={breakdownMonthFilter}
            onMonthFilterChange={setBreakdownMonthFilter}
        />
      )}

      {activeTab === 'live' && (
        <InverterLiveData inverter={inverter} dateOfCommissioning={project.dateOfCommissioning} />
      )}
      
      {isBreakdownModalOpen && (
        <BreakdownEntryModal
            isOpen={isBreakdownModalOpen}
            onClose={() => setBreakdownModalOpen(false)}
            onSave={handleSaveBreakdown}
            inverterName={inverter.name}
            initialEvent={editingEvent}
        />
      )}

      <style>{`
        .kpi-card { background-color: #1B263B; padding: 1rem; border-radius: 0.5rem; border: 1px solid #415A77; } .kpi-label { color: #A0AEC0; font-size: 0.75rem; text-transform: uppercase; } .kpi-value { font-size: 1.25rem; font-weight: bold; color: white; }
        .link { color: #63B3ED; }
        .tab-button { padding: 0.5rem 1rem; color: #A0AEC0; font-weight: 500; border-bottom: 2px solid transparent; }
        .tab-button:hover { color: white; }
        .tab-active { color: #FFD700; border-bottom-color: #FFD700; }
        .table-header { background-color: #0D1B2A; color: #A0AEC0; text-transform: uppercase; font-weight: 500; position: sticky; top: 0; z-index: 10; }
        .table-cell { padding: 0.75rem; }
      `}</style>
    </div>
  );
};

export default InverterDetailsPage;
