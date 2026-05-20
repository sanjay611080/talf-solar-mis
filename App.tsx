
import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Project, BreakdownEvent, MonthlyData } from './types';
import { loadProjects, saveProjects } from './services/dataService';
import { initModuleBuilds } from './services/moduleBuildService';
import * as auditService from './services/auditService';
import { AuditChange } from './services/auditService';
import Dashboard from './pages/Dashboard';
import ProjectManagementPage from './pages/ProjectManagementPage';
import ProjectDetailsPage from './pages/ProjectDetailsPage';
import InverterDetailsPage from './pages/InverterDetailsPage';
import SettingsPage from './pages/SettingsPage';
import ModuleBuildsPage from './pages/ModuleBuildsPage';
import UserManagementPage from './pages/UserManagementPage';
import CameraMonitoringPage from './pages/CameraMonitoringPage';
import AuditLogsPage from './pages/AuditLogsPage';
import SecurityPage from './pages/SecurityPage';
import Layout from './components/Layout';
import { SaveResult } from './components/ProjectManagementModal';
import SyncStatusWidget from './components/SyncStatusWidget';
import { useAuth } from './context/AuthContext';
import LoginPage from './pages/LoginPage';

const computeMonthlyDataChanges = (before: Project, after: Project): AuditChange[] => {
  const changes: AuditChange[] = [];
  const allMonths = new Set<string>([
    ...Object.keys(before.monthlyData || {}),
    ...Object.keys(after.monthlyData || {}),
  ]);

  const arrayFields: { key: keyof MonthlyData; label: string }[] = [
    { key: 'inverterExportKWh',    label: 'Export (kWh)' },
    { key: 'inverterTargetOMKWh',  label: 'Target O&M (kWh)' },
    { key: 'inverterIrradiation',  label: 'Irradiation' },
    { key: 'inverterDcCapacityKW', label: 'DC Capacity (kW)' },
  ];

  const sortedMonths = Array.from(allMonths).sort();
  for (const month of sortedMonths) {
    const b = before.monthlyData?.[month];
    const a = after.monthlyData?.[month];

    if (!b && a) {
      const totalExport = (a.inverterExportKWh || []).reduce((s, v) => s + v, 0);
      changes.push({
        field: month,
        before: '(no data)',
        after: `New month — ${totalExport.toLocaleString()} kWh exported across ${(a.inverterExportKWh || []).length} inverter(s)`,
      });
      continue;
    }
    if (b && !a) {
      changes.push({ field: month, before: '(had data)', after: '(removed)' });
      continue;
    }
    if (!b || !a) continue;

    if ((b.electricityImportedKWh ?? 0) !== (a.electricityImportedKWh ?? 0)) {
      changes.push({
        field: `${month} / Project Import (kWh)`,
        before: b.electricityImportedKWh ?? 0,
        after: a.electricityImportedKWh ?? 0,
      });
    }
    if ((b.targetNetKWhP50 ?? 0) !== (a.targetNetKWhP50 ?? 0)) {
      changes.push({
        field: `${month} / P50 Target (kWh)`,
        before: b.targetNetKWhP50 ?? 0,
        after: a.targetNetKWhP50 ?? 0,
      });
    }

    const inverters = after.inverters || before.inverters || [];
    for (const af of arrayFields) {
      const bArr = (b[af.key] as number[]) || [];
      const aArr = (a[af.key] as number[]) || [];
      const len = Math.max(bArr.length, aArr.length, inverters.length);
      for (let i = 0; i < len; i++) {
        const bVal = bArr[i] ?? 0;
        const aVal = aArr[i] ?? 0;
        if (bVal !== aVal) {
          const invName = inverters[i]?.name || `Inverter ${i + 1}`;
          changes.push({
            field: `${month} / ${invName} / ${af.label}`,
            before: bVal,
            after: aVal,
          });
        }
      }
    }
  }

  return changes;
};

const App: React.FC = () => {
  const { currentUser, isLoading: isAuthLoading } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [isDataLoading, setIsDataLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      if (currentUser) {
        try {
          setIsDataLoading(true);
          await initModuleBuilds();
          const data = await loadProjects();
          setProjects(data);
        } catch (err) {
          console.error("Failed to init", err);
        } finally {
          setIsDataLoading(false);
        }
      } else {
        setIsDataLoading(false);
      }
    };
    init();
  }, [currentUser]);

  const handleSaveProject = (projectToSave: Project, isEdit: boolean): SaveResult => {
    if (isEdit) {
      const before = projects.find(p => p.projectCode === projectToSave.projectCode);
      const updatedProjects = projects.map(p => p.projectCode === projectToSave.projectCode ? projectToSave : p);
      setProjects(updatedProjects);
      saveProjects(updatedProjects);

      const topLevelFields = ['projectName', 'projectState', 'projectOwner', 'tariff', 'dateOfCommissioning'];
      const changes = before ? auditService.computeChanges(before, projectToSave, topLevelFields) : [];
      if (before) {
        if (before.inverters.length !== projectToSave.inverters.length) {
          changes.push({
            field: 'inverters',
            before: `${before.inverters.length} inverter(s)`,
            after: `${projectToSave.inverters.length} inverter(s)`,
          });
        }
      }

      auditService.logEvent({
        action: 'update',
        entityType: 'project',
        entityId: projectToSave.projectCode,
        entityLabel: projectToSave.projectName,
        description: `Updated project "${projectToSave.projectName}" (${projectToSave.projectCode})`,
        changes,
      });

      return { success: true };
    }

    if (projects.some(p => p.projectCode === projectToSave.projectCode)) {
      return { success: false, error: `Project code "${projectToSave.projectCode}" already exists.` };
    }
    const updatedProjects = [...projects, projectToSave];
    setProjects(updatedProjects);
    saveProjects(updatedProjects);

    auditService.logEvent({
      action: 'create',
      entityType: 'project',
      entityId: projectToSave.projectCode,
      entityLabel: projectToSave.projectName,
      description: `Created project "${projectToSave.projectName}" (${projectToSave.projectCode})`,
      metadata: {
        state: projectToSave.projectState,
        owner: projectToSave.projectOwner,
        tariff: projectToSave.tariff,
        inverters: projectToSave.inverters.length,
      },
    });

    return { success: true };
  };

  const handleUpdateProject = (updated: Project) => {
    const before = projects.find(p => p.projectCode === updated.projectCode);
    const newProjects = projects.map(p => p.projectCode === updated.projectCode ? updated : p);
    setProjects(newProjects);
    saveProjects(newProjects);

    if (!before) {
      auditService.logEvent({
        action: 'update',
        entityType: 'project',
        entityId: updated.projectCode,
        entityLabel: updated.projectName,
        description: `Updated project "${updated.projectName}"`,
      });
      return;
    }

    // 1. Breakdown event diffs (added / removed / modified, by id)
    const beforeBreakdowns = before.breakdownEvents || [];
    const afterBreakdowns = updated.breakdownEvents || [];
    const beforeIds = new Set(beforeBreakdowns.map(b => b.id));
    const afterIds = new Set(afterBreakdowns.map(b => b.id));
    const addedEvents = afterBreakdowns.filter(b => !beforeIds.has(b.id));
    const removedEvents = beforeBreakdowns.filter(b => !afterIds.has(b.id));
    const modifiedEvents: { before: BreakdownEvent; after: BreakdownEvent }[] = [];
    for (const a of afterBreakdowns) {
      const b = beforeBreakdowns.find(x => x.id === a.id);
      if (b && JSON.stringify(b) !== JSON.stringify(a)) {
        modifiedEvents.push({ before: b, after: a });
      }
    }

    let breakdownLogged = false;

    for (const ev of addedEvents) {
      auditService.logEvent({
        action: 'create',
        entityType: 'project',
        entityId: updated.projectCode,
        entityLabel: updated.projectName,
        description: `Logged breakdown for ${ev.inverterName} on ${ev.date}`,
        changes: [
          { field: 'Inverter', before: '—', after: ev.inverterName },
          { field: 'Date',     before: '—', after: ev.date },
          { field: 'Time',     before: '—', after: `${ev.startTime} - ${ev.endTime}` },
          { field: 'Reason',   before: '—', after: ev.reason },
          { field: 'GII Loss', before: '—', after: `${(ev.giiAtEnd - ev.giiAtStart).toFixed(2)} kWh/m²` },
          ...(ev.notes ? [{ field: 'Notes', before: '—', after: ev.notes }] : []),
        ],
      });
      breakdownLogged = true;
    }

    for (const ev of removedEvents) {
      auditService.logEvent({
        action: 'delete',
        entityType: 'project',
        entityId: updated.projectCode,
        entityLabel: updated.projectName,
        description: `Removed breakdown event for ${ev.inverterName} on ${ev.date}`,
        changes: [
          { field: 'Inverter', before: ev.inverterName, after: '—' },
          { field: 'Date',     before: ev.date, after: '—' },
          { field: 'Time',     before: `${ev.startTime} - ${ev.endTime}`, after: '—' },
          { field: 'Reason',   before: ev.reason, after: '—' },
        ],
      });
      breakdownLogged = true;
    }

    for (const m of modifiedEvents) {
      const changes = auditService.computeChanges(
        m.before, m.after,
        ['inverterName', 'date', 'startTime', 'endTime', 'reason', 'notes', 'giiAtStart', 'giiAtEnd'],
      );
      auditService.logEvent({
        action: 'update',
        entityType: 'project',
        entityId: updated.projectCode,
        entityLabel: updated.projectName,
        description: `Updated breakdown event for ${m.after.inverterName} on ${m.after.date}`,
        changes,
      });
      breakdownLogged = true;
    }

    if (breakdownLogged) return;

    // 2. Monthly data diffs (cell-level: month / inverter / field)
    const monthChanges = computeMonthlyDataChanges(before, updated);
    if (monthChanges.length > 0) {
      const monthsTouched = Array.from(new Set(monthChanges.map(c => c.field.split(' / ')[0]))).sort();
      const monthLabel = monthsTouched.length === 1
        ? monthsTouched[0]
        : `${monthsTouched.length} months: ${monthsTouched.join(', ')}`;
      auditService.logEvent({
        action: 'update',
        entityType: 'project',
        entityId: updated.projectCode,
        entityLabel: updated.projectName,
        description: `Updated monthly data for "${updated.projectName}" — ${monthLabel}`,
        changes: monthChanges,
      });
      return;
    }

    // 3. Generic fallback (nothing detected — shouldn't normally happen)
    auditService.logEvent({
      action: 'update',
      entityType: 'project',
      entityId: updated.projectCode,
      entityLabel: updated.projectName,
      description: `Updated project "${updated.projectName}"`,
    });
  };

  if (isAuthLoading || (currentUser && isDataLoading)) {
    return (
      <div className="min-h-screen bg-[#0D1B2A] flex flex-col items-center justify-center text-white">
        <div className="w-12 h-12 border-4 border-yellow-400 border-t-transparent rounded-full animate-spin mb-4"></div>
        <h2 className="text-xl font-bold">Loading Application...</h2>
        <p className="text-gray-400 text-sm mt-2">{isAuthLoading ? 'Authenticating...' : 'Loading projects...'}</p>
      </div>
    );
  }

  return (
    <BrowserRouter>
      {!currentUser ? (
        <LoginPage />
      ) : (
        <>
          <Layout>
            <Routes>
              <Route
                path="/"
                element={<Dashboard projects={projects} />}
              />
              <Route
                path="/projects"
                element={<ProjectManagementPage projects={projects} onSaveProject={handleSaveProject} />}
              />
              <Route
                path="/project/:projectCode"
                element={
                  <ProjectDetailsPage
                    projects={projects}
                    onUpdateProject={handleUpdateProject}
                  />
                }
              />
              <Route
                path="/project/:projectCode/inverter/:inverterIndex"
                element={
                  <InverterDetailsPage
                    projects={projects}
                    onUpdateProject={handleUpdateProject}
                  />
                }
              />
              <Route path="/cameras" element={<CameraMonitoringPage />} />
              <Route path="/users" element={<UserManagementPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/module-builds" element={<ModuleBuildsPage />} />
              <Route path="/audit-logs" element={<AuditLogsPage />} />
              <Route path="/security" element={<SecurityPage />} />
            </Routes>
          </Layout>
          <SyncStatusWidget />
        </>
      )}
    </BrowserRouter>
  );
};

export default App;
