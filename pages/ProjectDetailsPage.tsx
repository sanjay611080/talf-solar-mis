
import React, { useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Project, ChartDataPoint, TimeRange, ModuleBuild, KPIResult, InverterKPIResult } from '../types';
import { calculateKPIs, filterMonthlyData, calculateInverterKPIs } from '../services/dataService';
import { getModuleBuilds } from '../services/moduleBuildService';
import CombinedPerformanceChart from '../components/CombinedPerformanceChart';
import DataEntryModal from '../components/DataEntryModal';
import { useAuth } from '../context/AuthContext';
import InverterComparisonTable from '../components/InverterComparisonTable';
import InverterComparisonChart from '../components/InverterComparisonChart';
import ProjectManagementModal, { SaveResult } from '../components/ProjectManagementModal';

interface Props {
  projects: Project[];
  onUpdateProject: (p: Project) => void;
}

const formatIndian = (val: number, type: 'curr' | 'unit' = 'unit') => {
  const prefix = type === 'curr' ? '₹' : '';
  if (val === undefined || val === null || isNaN(val)) return '-';
  if (val >= 10000000) return `${prefix}${(val / 10000000).toFixed(2)} Cr`;
  if (val >= 100000) return `${prefix}${(val / 100000).toFixed(2)} L`;
  if (val >= 1000) return `${prefix}${(val / 1000).toFixed(1)}k`;
  return `${prefix}${val.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
};

const ProjectDetailsPage: React.FC<Props> = ({ projects, onUpdateProject }) => {
  const { currentUser } = useAuth();
  const { projectCode } = useParams();
  const [isEntryModalOpen, setEntryModalOpen] = useState(false);
  const [isEditModalOpen, setEditModalOpen] = useState(false);
  const [timeRange, setTimeRange] = useState<TimeRange>('12M');

  const canEdit = currentUser?.role === 'admin';
  const canUpdateData = currentUser?.role === 'admin' || currentUser?.role === 'operations';

  const moduleBuilds = useMemo(() => getModuleBuilds(), []);
  const moduleBuildMap = useMemo(() => new Map(moduleBuilds.map(b => [b.id, b])), [moduleBuilds]);

  const project = useMemo(() => 
    projects.find(p => p.projectCode === projectCode), 
  [projects, projectCode]);
  
  const kpis: KPIResult | null = useMemo(() => {
    if (!project) return null;
    return calculateKPIs(project, timeRange, moduleBuilds);
  }, [project, timeRange, moduleBuilds]);

  const chartData: ChartDataPoint[] = useMemo(() => {
    if (!project) return [];
    
    const monthlyValues = filterMonthlyData(project.monthlyData, timeRange);
    const commissioningDate = new Date(project.dateOfCommissioning);
    
    return monthlyValues.sort((a, b) => a.month.localeCompare(b.month)).map(m => {
      const monthlyExport = (m.inverterExportKWh || []).reduce((s, v) => s + v, 0);
      const monthlyTargetOM = (m.inverterTargetOMKWh || []).reduce((s, v) => s + v, 0);
      const monthlyDcKW = (m.inverterDcCapacityKW || []).reduce((s, v) => s + v, 0);
      const net = monthlyExport - (m.electricityImportedKWh || 0);

      const year = parseInt(m.month.split('-')[0]), monthVal = parseInt(m.month.split('-')[1]);
      const hours = new Date(year, monthVal, 0).getDate() * 24;

      const monthDate = new Date(m.month + '-02');
      const monthsDiff = monthDate.getMonth() - commissioningDate.getMonth() + 12 * (monthDate.getFullYear() - commissioningDate.getFullYear());
      let prDenominator = 0;
      
      project.inverters.forEach((inv, idx) => {
        const build = inv.moduleBuildId ? moduleBuildMap.get(inv.moduleBuildId) : undefined;
        const irradiation = m.inverterIrradiation?.[idx] || 0;
        if (build && inv.moduleCount && irradiation > 0) {
          const firstYearDegradationPerMonth = build.degradation.firstYear / 12;
          const subsequentYearDegradationPerMonth = build.degradation.subsequentYears / 12;
          let totalDegradationPercent = 0;
          if (monthsDiff >= 0) {
            if (monthsDiff < 12) totalDegradationPercent = (monthsDiff + 1) * firstYearDegradationPerMonth;
            else totalDegradationPercent = build.degradation.firstYear + (monthsDiff - 11) * subsequentYearDegradationPerMonth;
          }
          prDenominator += irradiation * (inv.moduleCount * build.area * (1 - totalDegradationPercent / 100));
        }
      });
      const pr = prDenominator > 0 ? (net / prDenominator) * 100 : 0;

      return {
        month: m.month, actualEnergy: net, targetEnergyP50: m.targetNetKWhP50 || 0,
        targetEnergyOM: monthlyTargetOM, revenue: net * project.tariff, targetRevenueP50: (m.targetNetKWhP50 || 0) * project.tariff,
        targetRevenueOM: monthlyTargetOM * project.tariff, dcCuf: (monthlyDcKW * hours) > 0 ? (net / (monthlyDcKW * hours)) * 100 : 0,
        pr, yield: monthlyDcKW > 0 ? (net / monthlyDcKW) : 0
      };
    });
  }, [project, timeRange, moduleBuildMap]);

  const inverterStats = useMemo(() => {
    if (!project) return [];
    return project.inverters.map((inverter, index) => {
      const kpis = calculateInverterKPIs(project, inverter, index, timeRange, moduleBuilds);
      return {
        ...kpis,
        name: inverter.name,
      };
    });
  }, [project, timeRange, moduleBuilds]);
  
  const inverterChartData = useMemo(() => {
    if (!project) return [];
    const monthlyValues = filterMonthlyData(project.monthlyData, timeRange);
    const chartMap: Record<string, any> = {};

    monthlyValues.forEach(m => {
        chartMap[m.month] = { month: m.month };
        project.inverters.forEach((inv, idx) => {
            chartMap[m.month][inv.name] = m.inverterExportKWh?.[idx] || 0;
        });
    });
    return Object.values(chartMap);
  }, [project, timeRange]);

  const handleSaveData = (data: Record<string, any>) => { if (project) { onUpdateProject({ ...project, monthlyData: data }); setEntryModalOpen(false); } };
  if (!project || !kpis) return <div className="p-10 text-center text-white">Project not found. <Link to="/" className="link">Go Home</Link></div>;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex justify-between items-start">
        <div>
           <Link to="/projects" className="text-gray-400 hover:text-white text-sm mb-2 inline-block">← Back to Projects</Link>
           <h1 className="text-3xl font-bold text-white">{project.projectName}</h1>
           <p className="text-solar-text text-sm mt-1">{project.projectState} • Commissioned: {new Date(project.dateOfCommissioning).toLocaleDateString()}</p>
        </div>
        <div className="flex items-center gap-4">
            <div className="flex items-center bg-solar-bg rounded-lg border border-solar-border p-1 px-2">
                <span className="text-xs text-gray-400 px-2 uppercase font-bold">Timeline</span>
                {(['6M', '12M', 'ALL'] as TimeRange[]).map(range => (
                    <button
                    key={range}
                    onClick={() => setTimeRange(range)}
                    className={`px-3 py-1 text-xs rounded font-medium transition ${timeRange === range ? 'bg-solar-success text-black' : 'text-gray-300 hover:bg-gray-700'}`}
                    >
                    {range}
                    </button>
                ))}
            </div>
            {canEdit && <button onClick={() => setEditModalOpen(true)} className="bg-solar-border text-white font-bold px-4 py-2 rounded shadow hover:bg-gray-600 transition">Edit Configuration</button>}
            {canUpdateData && <button onClick={() => setEntryModalOpen(true)} className="bg-solar-accent text-black font-bold px-4 py-2 rounded shadow hover:bg-yellow-400 transition">Update Monthly Data</button>}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="kpi-card"><p className="kpi-label">Capacity (KW DC)</p><p className="kpi-value">{kpis.totalCapacityKWdc.toLocaleString(undefined, {maximumFractionDigits: 1})}</p></div>
        <div className="kpi-card"><p className="kpi-label">Fixed Tariff</p><p className="kpi-value text-solar-accent">₹{kpis.tariff.toFixed(3)}</p></div>
        <div className="kpi-card"><p className="kpi-label">Avg PR</p><p className="kpi-value text-blue-300">{kpis.pr.toFixed(1)}%</p></div>
        <div className="kpi-card"><p className="kpi-label">Avg DC CUF</p><p className="kpi-value text-teal-300">{kpis.dcCuf.toFixed(1)}%</p></div>
        <div className="kpi-card"><p className="kpi-label">Avg. Daily Yield</p><p className="kpi-value">{kpis.averageDailyYield.toFixed(2)} <span className="text-sm font-normal text-gray-400">kWh/kW/day</span></p></div>
      </div>

      <div className="bg-solar-card rounded-lg border border-solar-border">
        <div className="p-4 border-b border-solar-border">
          <h3 className="text-lg font-semibold text-white">Project Performance Trends</h3>
        </div>
        <CombinedPerformanceChart data={chartData} height={450} user={currentUser} hasContainer={false} />
        <div className="p-6 border-t border-solar-border">
            <h3 className="text-lg font-semibold text-white mb-4">Period Totals ({timeRange})</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
              <div className="kpi-card text-center">
                <p className="kpi-label">Revenue</p>
                <p className="kpi-value text-solar-accent font-mono">{formatIndian(kpis.revenue, 'curr')}</p>
              </div>
              <div className="kpi-card text-center">
                <p className="kpi-label">Target Rev (O&M)</p>
                <p className="kpi-value text-orange-400 font-mono">{formatIndian(kpis.targetRevenue, 'curr')}</p>
              </div>
              <div className="kpi-card text-center">
                <p className="kpi-label">Net Energy</p>
                <div className="flex items-baseline justify-center gap-1">
                  <p className="kpi-value text-solar-success font-mono">{formatIndian(kpis.netEnergy, 'unit')}</p>
                  <span className="text-sm text-gray-400">kWh</span>
                </div>
              </div>
              <div className="kpi-card text-center">
                <p className="kpi-label">Target (O&M)</p>
                 <div className="flex items-baseline justify-center gap-1">
                  <p className="kpi-value font-mono">{formatIndian(kpis.targetOM, 'unit')}</p>
                   <span className="text-sm text-gray-400">kWh</span>
                </div>
              </div>
              <div className="kpi-card text-center">
                <p className="kpi-label">CO2 Offset</p>
                <p className="kpi-value text-teal-300 font-mono">{Math.floor(kpis.co2Reduction)} <span className="text-sm font-normal">Tons</span></p>
              </div>
            </div>
        </div>
      </div>
      
      <div className="bg-solar-card rounded-lg border border-solar-border p-6 space-y-4">
          <h3 className="text-lg font-semibold text-white">Inverter wise snapshot</h3>
          <InverterComparisonChart data={inverterChartData} inverters={project.inverters} />
          <InverterComparisonTable data={inverterStats} />
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 pt-4">
            {project.inverters.map((inv, idx) => {
              const build = inv.moduleBuildId ? moduleBuildMap.get(inv.moduleBuildId) : null;
              const canViewInverterDetails = currentUser?.role !== 'viewer';

              const inverterCardContent = (
                <>
                  <p className="font-semibold text-solar-accent">{inv.name}</p>
                  <p className="text-sm text-gray-300">{inv.kwac} <span className="text-xs text-gray-500">KWac</span></p>
                  {build && inv.moduleCount && <p className="text-xs text-gray-400 mt-1">{inv.moduleCount} x {build.name}</p>}
                </>
              );

              if (canViewInverterDetails) {
                return (
                  <Link to={`/project/${project.projectCode}/inverter/${idx}`} key={idx} className="bg-solar-bg p-3 rounded border border-solar-border hover:border-solar-accent hover:scale-105 transition-all duration-200 block">
                    {inverterCardContent}
                  </Link>
                );
              }

              return (
                <div key={idx} className="bg-solar-bg p-3 rounded border border-solar-border cursor-not-allowed opacity-70" title="Access restricted for viewer role">
                  {inverterCardContent}
                </div>
              );
            })}
          </div>
      </div>

      {isEntryModalOpen && <DataEntryModal isOpen={isEntryModalOpen} onClose={() => setEntryModalOpen(false)} project={project} onSave={handleSaveData} />}
      {canEdit && (
        <ProjectManagementModal
          isOpen={isEditModalOpen}
          onClose={() => setEditModalOpen(false)}
          initialProject={project}
          onSave={(updated): SaveResult => {
            onUpdateProject(updated);
            return { success: true };
          }}
        />
      )}
      <style>{`.kpi-card { background-color: #1B263B; padding: 1rem; border-radius: 0.5rem; border: 1px solid #415A77; } .kpi-label { color: #A0AEC0; font-size: 0.75rem; text-transform: uppercase; } .kpi-value { font-size: 1.25rem; font-weight: bold; color: white; } .input-sm { background-color: #1B263B; border: 1px solid #415A77; border-radius: 0.25rem; padding: 0.25rem 0.75rem; font-size: 0.875rem; color: white; outline: none; } .input-sm:focus { border-color: #FFD700; } .table-header { background-color: #0D1B2A; color: #A0AEC0; text-transform: uppercase; font-weight: 500; position: sticky; top: 0; z-index: 10; } .table-cell { padding: 0.75rem; } .link { color: #63B3ED; }`}</style>
    </div>
  );
};

export default ProjectDetailsPage;
