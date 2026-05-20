
import { Inverter, MonthlyData, Project, SolisRealTimeData } from '../types';
import { SOLIS_POINT_IDS } from '../constants';
import { apiFetch } from './apiClient';
import * as auditService from './auditService';

/**
 * SolisCloud integration — all real API calls go through the backend, which
 * holds the credentials and signs every request. This module maps the backend's
 * normalized responses into the shapes the UI components expect.
 */

interface InverterRealTime {
  sn: string;
  name: string;
  state: number;
  acPowerKW: number;
  dcPowerKW: number;
  eTodayKWh: number;
  eTotalKWh: number;
  gridFrequencyHz: number;
  acVoltage: [number, number, number];
  temperatureC: number;
  mppt: { voltage: number; current: number }[];
  dataTimestamp: number;
}

export interface SolisStation {
  id: string;
  name: string;
  capacityKW: number;
  address: string;
  dayEnergyKWh: number;
  monthEnergyKWh: number;
  yearEnergyKWh: number;
  totalEnergyKWh: number;
  state: number;
  pricePerKWh: number;
}

export interface SolisCredentialsInfo {
  configured: boolean;
  source: 'environment' | 'database' | 'none';
  apiKey: string; // SolisCloud labels this the "API ID"
  apiSecret: string;
  apiBaseUrl: string;
  hasSecret: boolean;
}

export interface SolisSyncStatus {
  state: 'idle' | 'running' | 'done' | 'error';
  message: string;
  totalSteps: number;
  doneSteps: number;
  startedAt?: number;
  finishedAt?: number;
  lastSyncedAt?: number;
  /** When the next scheduled (cron) sync will run. */
  nextSyncAt?: number;
  /** What kind of sync this status describes. */
  kind?: 'full' | 'incremental' | 'cron';
}

// --- Credentials ---

export const getCredentials = async (): Promise<SolisCredentialsInfo> => {
  const c = await apiFetch<{
    configured: boolean;
    source: 'environment' | 'database' | 'none';
    apiId: string;
    baseUrl: string;
    hasSecret: boolean;
  }>('/solis/credentials');
  return {
    configured: c.configured,
    source: c.source,
    apiKey: c.apiId,
    apiSecret: '',
    apiBaseUrl: c.baseUrl,
    hasSecret: c.hasSecret,
  };
};

export const saveCredentials = async (apiKey: string, apiSecret: string, apiBaseUrl: string): Promise<void> => {
  await apiFetch('/solis/credentials', {
    method: 'PUT',
    body: JSON.stringify({ apiId: apiKey, apiSecret, baseUrl: apiBaseUrl }),
  });
  auditService.logEvent({
    action: 'update',
    entityType: 'settings',
    entityId: 'solis-api',
    entityLabel: 'SolisCloud API credentials',
    description: 'Updated SolisCloud API credentials',
  });
};

/** Verifies the stored credentials against SolisCloud. Throws on failure. */
export const testConnection = async (): Promise<void> => {
  await apiFetch('/solis/test');
};

// --- Sync ---

export const getSyncStatus = (): Promise<SolisSyncStatus> => apiFetch<SolisSyncStatus>('/solis/sync/status');

export const triggerSync = (): Promise<{ started: boolean }> =>
  apiFetch<{ started: boolean }>('/solis/sync', { method: 'POST' });

// --- Device discovery ---

export const listStations = (): Promise<SolisStation[]> => apiFetch<SolisStation[]>('/solis/stations');

// --- Real-time data ---

/** The SolisCloud serial number used to address an inverter against the API. */
export const getSolisSn = (inverter: Inverter): string =>
  inverter.deviceSn || inverter.solisSn || inverter.psKey || '';

const STATE_TO_LEGACY_STATUS: Record<number, number> = {
  1: 64, // online  -> "On-Grid / Running"
  2: 32768, // offline -> "Shutdown"
  3: 256, // alarm   -> "Operation Fault"
};

/** Translates the backend's normalized real-time object into the legacy
 * point-id-keyed structure that InverterLiveData consumes. */
const mapRealTime = (rt: InverterRealTime): SolisRealTimeData => {
  const p = SOLIS_POINT_IDS;
  const entry = (value: number, unit: string, name: string) => ({
    value: Number((value || 0).toFixed(2)),
    unit,
    name,
  });
  return {
    [p.OPERATING_STATUS]: entry(STATE_TO_LEGACY_STATUS[rt.state] ?? 0, '', 'OPERATING_STATUS'),
    [p.TOTAL_ACTIVE_POWER]: entry(rt.acPowerKW * 1000, 'W', 'TOTAL_ACTIVE_POWER'),
    [p.TOTAL_DC_POWER]: entry(rt.dcPowerKW * 1000, 'W', 'TOTAL_DC_POWER'),
    [p.YIELD_TODAY]: entry(rt.eTodayKWh * 1000, 'Wh', 'YIELD_TODAY'),
    [p.YIELD_TOTAL]: entry(rt.eTotalKWh * 1000, 'Wh', 'YIELD_TOTAL'),
    [p.GRID_FREQUENCY]: entry(rt.gridFrequencyHz, 'Hz', 'GRID_FREQUENCY'),
    [p.PHASE_A_VOLTAGE]: entry(rt.acVoltage?.[0] ?? 0, 'V', 'PHASE_A_VOLTAGE'),
    [p.PHASE_B_VOLTAGE]: entry(rt.acVoltage?.[1] ?? 0, 'V', 'PHASE_B_VOLTAGE'),
    [p.PHASE_C_VOLTAGE]: entry(rt.acVoltage?.[2] ?? 0, 'V', 'PHASE_C_VOLTAGE'),
    [p.INTERNAL_AIR_TEMP]: entry(rt.temperatureC, '°C', 'INTERNAL_AIR_TEMP'),
    [p.MPPT1_VOLTAGE]: entry(rt.mppt?.[0]?.voltage ?? 0, 'V', 'MPPT1_VOLTAGE'),
    [p.MPPT1_CURRENT]: entry(rt.mppt?.[0]?.current ?? 0, 'A', 'MPPT1_CURRENT'),
    [p.MPPT2_VOLTAGE]: entry(rt.mppt?.[1]?.voltage ?? 0, 'V', 'MPPT2_VOLTAGE'),
    [p.MPPT2_CURRENT]: entry(rt.mppt?.[1]?.current ?? 0, 'A', 'MPPT2_CURRENT'),
  };
};

export const fetchRealTimeData = async (inverter: Inverter): Promise<SolisRealTimeData> => {
  const sn = getSolisSn(inverter);
  if (!sn) {
    throw new Error('Inverter is not linked to a SolisCloud device (missing serial number).');
  }
  const rt = await apiFetch<InverterRealTime>(`/solis/inverters/${encodeURIComponent(sn)}/realtime`);
  return mapRealTime(rt);
};

export const fetchDailyGenerationCurve = async (
  inverter: Inverter,
  date: Date,
): Promise<{ time: string; power: number }[]> => {
  const sn = getSolisSn(inverter);
  if (!sn) {
    throw new Error('Inverter is not linked to a SolisCloud device (missing serial number).');
  }
  const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;
  return apiFetch<{ time: string; power: number }[]>(
    `/solis/inverters/${encodeURIComponent(sn)}/day?date=${dateStr}`,
  );
};

/** Pulls a month of generation for the project's inverters from SolisCloud. */
export const syncMonthData = async (project: Project, month: string): Promise<MonthlyData> => {
  return apiFetch<MonthlyData>(
    `/solis/projects/${encodeURIComponent(project.projectCode)}/sync?month=${encodeURIComponent(month)}`,
    { method: 'POST' },
  );
};
