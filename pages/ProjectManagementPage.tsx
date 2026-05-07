
import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Project, TimeRange } from '../types';
import { calculateKPIs } from '../services/dataService';
import { useAuth } from '../context/AuthContext';
import ProjectManagementModal, { SaveResult } from '../components/ProjectManagementModal';

interface Props {
  projects: Project[];
  onSaveProject: (project: Project, isEdit: boolean) => SaveResult;
}

const SortIcon = ({ direction }: { direction: 'asc' | 'desc' | null }) => {
  if (!direction) return <span className="text-gray-600 ml-1 opacity-0 group-hover:opacity-50">⇅</span>;
  return <span className="text-solar-accent ml-1">{direction === 'asc' ? '▲' : '▼'}</span>;
};

const formatIndian = (n: number, type: 'curr' | 'unit' = 'unit') => {
  const prefix = type === 'curr' ? '₹' : '';
  if (n === undefined || n === null || isNaN(n)) return '-';
  if (n >= 10000000) return `${prefix}${(n / 10000000).toFixed(2)} Cr`;
  if (n >= 100000)   return `${prefix}${(n / 100000).toFixed(2)} L`;
  if (n >= 1000)     return `${prefix}${(n / 1000).toFixed(1)}k`;
  return `${prefix}${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
};

const ProjectManagementPage: React.FC<Props> = ({ projects, onSaveProject }) => {
  const { currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'admin';

  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' | null }>({ key: '', direction: null });
  const [timeRange, setTimeRange] = useState<TimeRange>('12M');
  const [isModalOpen, setModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);

  const projectKPIs = useMemo(
    () => projects.map(p => calculateKPIs(p, timeRange)),
    [projects, timeRange]
  );

  const aggregateTotals = useMemo(() => {
    const totals = { netEnergy: 0, revenue: 0, totalCapacityKWdc: 0, totalDays: 0 };
    projectKPIs.forEach(k => {
      totals.netEnergy += k.netEnergy;
      totals.revenue += k.revenue;
      totals.totalCapacityKWdc += k.totalCapacityKWdc;
    });
    totals.totalDays = projectKPIs.length > 0 ? projectKPIs[0].totalDays : 0;

    const totalCapDc = totals.totalCapacityKWdc || 1;
    const dcCuf = projectKPIs.reduce((acc, k) => acc + (k.dcCuf * k.totalCapacityKWdc), 0) / totalCapDc;
    const averageDailyYield = (totals.totalDays > 0 && totals.totalCapacityKWdc > 0)
      ? (totals.netEnergy / totals.totalCapacityKWdc / totals.totalDays)
      : 0;

    return { ...totals, dcCuf, averageDailyYield };
  }, [projectKPIs]);

  const tableData = useMemo(() => {
    return projects.map((p, idx) => {
      const kpi = projectKPIs[idx];
      return {
        projectCode: p.projectCode,
        projectName: p.projectName,
        projectState: p.projectState,
        capacityKWdc: kpi.totalCapacityKWdc,
        revenue: kpi.revenue,
        targetRevenue: kpi.targetRevenue,
        netEnergy: kpi.netEnergy,
        dcCuf: kpi.dcCuf,
        co2Reduction: kpi.co2Reduction,
        averageDailyYield: kpi.averageDailyYield,
        isAboveTarget: kpi.netEnergy >= kpi.targetOM,
      };
    });
  }, [projects, projectKPIs]);

  const filteredTableData = useMemo(() => {
    return tableData.filter(item =>
      item.projectName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.projectState.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [tableData, searchTerm]);

  const sortedTableData = useMemo(() => {
    if (!sortConfig.key || !sortConfig.direction) return filteredTableData;
    return [...filteredTableData].sort((a, b) => {
      const valA = (a as any)[sortConfig.key];
      const valB = (b as any)[sortConfig.key];
      if (typeof valA === 'string') {
        return sortConfig.direction === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return sortConfig.direction === 'asc' ? valA - valB : valB - valA;
    });
  }, [filteredTableData, sortConfig]);

  const handleSort = (key: string) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  const openCreateModal = () => {
    setEditingProject(null);
    setModalOpen(true);
  };

  const openEditModal = (p: Project) => {
    setEditingProject(p);
    setModalOpen(true);
  };

  const handleSave = (project: Project): SaveResult => {
    return onSaveProject(project, !!editingProject);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <header className="flex justify-between items-start gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Project Management</h1>
          <p className="text-solar-text">Browse, search, and manage your portfolio of solar projects.</p>
        </div>
        {isAdmin && (
          <button
            onClick={openCreateModal}
            className="bg-solar-accent text-black font-bold px-4 py-2 rounded shadow hover:bg-yellow-400 transition flex items-center gap-2 shrink-0"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Add Project
          </button>
        )}
      </header>

      <div className="bg-solar-card rounded-lg border border-solar-border shadow-lg flex flex-col">
        <div className="p-4 border-b border-solar-border bg-solar-bg flex flex-wrap justify-between items-center gap-3">
          <h3 className="font-bold text-white">Project Summary</h3>
          <div className="flex flex-wrap items-center gap-3">
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
            <input
              type="text"
              placeholder="Filter..."
              className="input-sm"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div className="overflow-y-auto max-h-[500px] custom-scrollbar">
          <table className="w-full text-left text-sm relative">
            <thead className="table-header">
              <tr>
                <th className="table-cell cursor-pointer" onClick={() => handleSort('projectName')}>Project <SortIcon direction={sortConfig.key === 'projectName' ? sortConfig.direction : null} /></th>
                <th className="table-cell text-right cursor-pointer" onClick={() => handleSort('netEnergy')}>Gen (kWh) <SortIcon direction={sortConfig.key === 'netEnergy' ? sortConfig.direction : null} /></th>
                <th className="table-cell text-right cursor-pointer" onClick={() => handleSort('averageDailyYield')}>Daily Yield <SortIcon direction={sortConfig.key === 'averageDailyYield' ? sortConfig.direction : null} /></th>
                <th className="table-cell text-right cursor-pointer" onClick={() => handleSort('dcCuf')}>DC CUF % <SortIcon direction={sortConfig.key === 'dcCuf' ? sortConfig.direction : null} /></th>
                <th className="table-cell text-right cursor-pointer" onClick={() => handleSort('revenue')}>Revenue <SortIcon direction={sortConfig.key === 'revenue' ? sortConfig.direction : null} /></th>
                {isAdmin && <th className="table-cell text-center">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-solar-border">
              {!searchTerm && (
                <tr className="bg-[#122033] font-bold text-white">
                  <td className="p-4">ALL PROJECTS</td>
                  <td className="p-4 text-right text-solar-success">{formatIndian(aggregateTotals.netEnergy, 'unit')}</td>
                  <td className="p-4 text-right text-cyan-300">{aggregateTotals.averageDailyYield.toFixed(2)}</td>
                  <td className="p-4 text-right">{aggregateTotals.dcCuf.toFixed(1)}%</td>
                  <td className="p-4 text-right text-solar-accent">{formatIndian(aggregateTotals.revenue, 'curr')}</td>
                  {isAdmin && <td className="p-4 text-center"></td>}
                </tr>
              )}
              {sortedTableData.length === 0 && (
                <tr>
                  <td colSpan={isAdmin ? 6 : 5} className="text-center py-8 text-gray-500">No projects match.</td>
                </tr>
              )}
              {sortedTableData.map(row => (
                <tr key={row.projectCode} className="hover:bg-solar-bg">
                  <td className="p-4">
                    <Link to={`/project/${row.projectCode}`} className="link">{row.projectName}</Link>
                    <span className="subtext">{row.projectState}</span>
                  </td>
                  <td className={`p-4 text-right font-medium ${row.isAboveTarget ? 'text-solar-success' : 'text-red-400'}`}>{formatIndian(row.netEnergy, 'unit')}</td>
                  <td className="p-4 text-right font-mono text-cyan-300">{row.averageDailyYield.toFixed(2)}</td>
                  <td className="p-4 text-right">{row.dcCuf.toFixed(1)}%</td>
                  <td className="p-4 text-right">{formatIndian(row.revenue, 'curr')}</td>
                  {isAdmin && (
                    <td className="p-4 text-center">
                      <button
                        onClick={() => openEditModal(projects.find(p => p.projectCode === row.projectCode)!)}
                        className="text-xs bg-solar-border hover:bg-gray-600 text-white px-3 py-1 rounded transition"
                      >
                        Edit
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {isAdmin && (
        <ProjectManagementModal
          isOpen={isModalOpen}
          onClose={() => setModalOpen(false)}
          initialProject={editingProject}
          onSave={handleSave}
        />
      )}

      <style>{`
        .input-sm { background-color: #1B263B; border: 1px solid #415A77; border-radius: 0.25rem; padding: 0.25rem 0.75rem; font-size: 0.875rem; color: white; outline: none; }
        .input-sm:focus { border-color: #FFD700; }
        .table-header { background-color: #0D1B2A; color: #A0AEC0; text-transform: uppercase; font-weight: 500; position: sticky; top: 0; z-index: 10; }
        .table-cell { padding: 1rem; }
        .link { color: #63B3ED; font-weight: 500; }
        .link:hover { text-decoration: underline; color: #90CDF4; }
        .subtext { display: block; font-size: 0.75rem; color: #718096; }
      `}</style>
    </div>
  );
};

export default ProjectManagementPage;
