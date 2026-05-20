
import { ModuleBuild } from '../types';
import { apiFetch } from './apiClient';
import * as auditService from './auditService';

/**
 * Module builds live on the backend. The KPI engine reads them synchronously,
 * so an in-memory cache is filled once at startup via `initModuleBuilds()` and
 * returned synchronously by `getModuleBuilds()`. Mutations hit the backend and
 * then refresh the cache.
 */
let cache: ModuleBuild[] = [];

/** Fetches module builds from the backend into the cache. Call once at startup. */
export const initModuleBuilds = async (): Promise<ModuleBuild[]> => {
  cache = await apiFetch<ModuleBuild[]>('/module-builds');
  return cache;
};

/** Synchronous read of the cached module builds. */
export const getModuleBuilds = (): ModuleBuild[] => cache;

export const addModuleBuild = async (newBuild: Omit<ModuleBuild, 'id'>): Promise<ModuleBuild> => {
  const created = await apiFetch<ModuleBuild>('/module-builds', {
    method: 'POST',
    body: JSON.stringify(newBuild),
  });
  cache = [...cache, created];
  auditService.logEvent({
    action: 'create',
    entityType: 'module_build',
    entityId: created.id,
    entityLabel: created.name,
    description: `Created module build "${created.name}"`,
    metadata: { wp: created.wp, area: created.area, degradation: created.degradation },
  });
  return created;
};

export const updateModuleBuild = async (updatedBuild: ModuleBuild): Promise<ModuleBuild> => {
  const before = cache.find((b) => b.id === updatedBuild.id);
  const saved = await apiFetch<ModuleBuild>(`/module-builds/${updatedBuild.id}`, {
    method: 'PUT',
    body: JSON.stringify(updatedBuild),
  });
  cache = cache.map((b) => (b.id === saved.id ? saved : b));
  auditService.logEvent({
    action: 'update',
    entityType: 'module_build',
    entityId: saved.id,
    entityLabel: saved.name,
    description: `Updated module build "${saved.name}"`,
    changes: before ? auditService.computeChanges(before, saved) : [],
  });
  return saved;
};

export const deleteModuleBuild = async (id: string): Promise<void> => {
  const target = cache.find((b) => b.id === id);
  await apiFetch<void>(`/module-builds/${id}`, { method: 'DELETE' });
  cache = cache.filter((b) => b.id !== id);
  auditService.logEvent({
    action: 'delete',
    entityType: 'module_build',
    entityId: id,
    entityLabel: target?.name,
    description: `Deleted module build "${target?.name || id}"`,
  });
};
