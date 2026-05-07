
import { Project, MonthlyData, Inverter, SolisRealTimeData } from "../types";
import { SOLIS_API_PATHS, SOLIS_POINT_IDS } from '../constants';
import { getModuleBuilds } from './moduleBuildService';
import * as auditService from './auditService';

const SOLIS_CREDS_KEY = 'solis_api_credentials';

interface SolisCredentials {
  apiKey: string;
  apiSecret: string;
  apiBaseUrl: string;
}

export const saveCredentials = (apiKey: string, apiSecret: string, apiBaseUrl: string) => {
  const before = getCredentials();
  localStorage.setItem(SOLIS_CREDS_KEY, JSON.stringify({ apiKey, apiSecret, apiBaseUrl }));
  const changes: { field: string; before: any; after: any }[] = [];
  if ((before?.apiBaseUrl || '') !== apiBaseUrl) {
    changes.push({ field: 'apiBaseUrl', before: before?.apiBaseUrl || '(empty)', after: apiBaseUrl || '(empty)' });
  }
  if ((before?.apiKey || '') !== apiKey) {
    changes.push({ field: 'apiKey', before: before?.apiKey ? '••••' + before.apiKey.slice(-4) : '(empty)', after: apiKey ? '••••' + apiKey.slice(-4) : '(empty)' });
  }
  if ((before?.apiSecret || '') !== apiSecret) {
    changes.push({ field: 'apiSecret', before: before?.apiSecret ? '•••••• (set)' : '(empty)', after: apiSecret ? '•••••• (changed)' : '(empty)' });
  }
  auditService.logEvent({
    action: 'update',
    entityType: 'settings',
    entityId: 'solis-api',
    entityLabel: 'SolisCloud API credentials',
    description: 'Updated SolisCloud API credentials',
    changes,
  });
};

export const getCredentials = (): SolisCredentials | null => {
  const stored = localStorage.getItem(SOLIS_CREDS_KEY);
  return stored ? JSON.parse(stored) : null;
};

// Generic POST function to handle all API requests to SolisCloud
// NOTE: In a production app, this would live on a secure backend proxy to protect the API Secret.
async function post<T>(path: string, body: object): Promise<T> {
  const creds = getCredentials();
  if (!creds || !creds.apiKey || !creds.apiBaseUrl) {
    throw new Error("SolisCloud API not configured. Please add credentials and Base URL in Settings.");
  }

  // A real implementation would involve generating a signature using the API secret.
  // As this is a frontend simulation, we will pass them in headers which is INSECURE but necessary for this context.
  const headers = {
    'Content-Type': 'application/json',
    'X-API-Key': creds.apiKey,
    'X-API-Secret': creds.apiSecret, // FAKE: This would not be done in a real app
  };
  
  const response = await fetch(creds.apiBaseUrl + path, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`API request failed with status ${response.status}`);
  }

  const data = await response.json();
  
  // Handle Solis API-specific error codes
  if (data.result_code !== '1' && data.result_code !== 1) {
    throw new Error(`Solis API Error: ${data.result_msg || 'Unknown error'} (Code: ${data.result_code})`);
  }
  
  return data.result_data as T;
}

/**
 * A centralized function to generate a realistic, consistent daily generation curve
 * and its derived KPIs for a given inverter and date.
 */
const generateDailyData = (inverter: Inverter, date: Date) => {
  const curveData: { time: string; power: number }[] = [];
  const today = new Date();
  const isToday = date.toDateString() === today.toDateString();
  
  const sunrise = 6;
  const sunset = 18.5;
  const daylightHours = sunset - sunrise;

  let latestPower = 0;
  let dailyYieldKWh = 0;

  for (let i = 0; i < 24 * 4; i++) { // 15-minute intervals
    const hour = Math.floor(i / 4);
    const minute = (i % 4) * 15;
    const currentTime = new Date(date);
    currentTime.setHours(hour, minute, 0, 0);

    if (isToday && currentTime > today) {
      break; // Don't generate data for the future
    }
    
    let power = 0;
    const currentHourDecimal = hour + minute / 60;

    if (currentHourDecimal > sunrise && currentHourDecimal < sunset) {
      // Use a sine wave shape for the generation curve
      const sineValue = Math.sin(( (currentHourDecimal - sunrise) / daylightHours ) * Math.PI);
      const maxPower = inverter.kwac; // Peak AC power
      power = maxPower * sineValue;
      // Add some random noise to simulate clouds, etc.
      power *= (0.95 + Math.random() * 0.1);
    }
    
    power = Math.max(0, power); // ensure no negative power
    const finalPower = parseFloat(power.toFixed(2));

    curveData.push({
      time: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
      power: finalPower,
    });

    dailyYieldKWh += finalPower * 0.25; // power is in kW, interval is 0.25h
    latestPower = finalPower;
  }

  // If viewing a past day, the latest power at the end of the day should be 0.
  if (!isToday) {
      latestPower = 0;
  }

  return { curveData, latestPower, dailyYieldKWh };
};


export const fetchRealTimeData = async (
  inverter: Inverter
): Promise<SolisRealTimeData> => {
  if (!inverter.psKey) {
    throw new Error("Inverter is not configured for live data (missing psKey).");
  }
  
  console.log(`MOCK API: Fetching real-time data for psKey: ${inverter.psKey}`);
  await new Promise(res => setTimeout(res, 300)); // simulate network delay

  const { latestPower, dailyYieldKWh } = generateDailyData(inverter, new Date());
  
  const mockData: any = {
      [SOLIS_POINT_IDS.YIELD_TODAY]: { value: dailyYieldKWh * 1000, unit: 'Wh' },
      [SOLIS_POINT_IDS.YIELD_TOTAL]: { value: 12345 * 1000 + (dailyYieldKWh * 1000), unit: 'Wh' },
      [SOLIS_POINT_IDS.INTERNAL_AIR_TEMP]: { value: 35 + (latestPower / inverter.kwac) * 15 + Math.random() * 5, unit: '°C' },
      [SOLIS_POINT_IDS.TOTAL_DC_POWER]: { value: latestPower * 1000 * 1.1, unit: 'W' },
      [SOLIS_POINT_IDS.TOTAL_ACTIVE_POWER]: { value: latestPower * 1000, unit: 'W' },
      [SOLIS_POINT_IDS.GRID_FREQUENCY]: { value: 49.8 + Math.random() * 0.4, unit: 'Hz' },
      [SOLIS_POINT_IDS.PHASE_A_VOLTAGE]: { value: 225 + Math.random() * 10, unit: 'V' },
      [SOLIS_POINT_IDS.PHASE_B_VOLTAGE]: { value: 225 + Math.random() * 10, unit: 'V' },
      [SOLIS_POINT_IDS.PHASE_C_VOLTAGE]: { value: 225 + Math.random() * 10, unit: 'V' },
      [SOLIS_POINT_IDS.PHASE_A_CURRENT]: { value: latestPower > 0 ? (latestPower * 1000) / 3 / 230 : 0, unit: 'A' },
      [SOLIS_POINT_IDS.PHASE_B_CURRENT]: { value: latestPower > 0 ? (latestPower * 1000) / 3 / 230 : 0, unit: 'A' },
      [SOLIS_POINT_IDS.PHASE_C_CURRENT]: { value: latestPower > 0 ? (latestPower * 1000) / 3 / 230 : 0, unit: 'A' },
      [SOLIS_POINT_IDS.MPPT1_VOLTAGE]: { value: 400 + Math.random() * 50, unit: 'V' },
      [SOLIS_POINT_IDS.MPPT1_CURRENT]: { value: latestPower > 0 ? (latestPower * 1000 * 1.1) / 2 / 425 : 0, unit: 'A' },
      [SOLIS_POINT_IDS.MPPT2_VOLTAGE]: { value: 410 + Math.random() * 50, unit: 'V' },
      [SOLIS_POINT_IDS.MPPT2_CURRENT]: { value: latestPower > 0 ? (latestPower * 1000 * 1.1) / 2 / 435 : 0, unit: 'A' },
      [SOLIS_POINT_IDS.OPERATING_STATUS]: { value: latestPower > 0 ? 64 : 8, unit: '' }, // 64 = "Running", 8 = "Standby"
  };

  const pointIdToName = Object.fromEntries(Object.entries(SOLIS_POINT_IDS).map(([name, id]) => [id, name]));
  Object.keys(mockData).forEach(key => {
    mockData[key].name = pointIdToName[key];
    if(typeof mockData[key].value === 'number') {
      mockData[key].value = Number(mockData[key].value.toFixed(2));
    }
  });
  
  return mockData as SolisRealTimeData;
};

export const fetchDailyGenerationCurve = async (
  inverter: Inverter,
  date: Date
): Promise<{ time: string; power: number }[]> => {
  console.log(`MOCK API: Fetching daily generation curve for inverter ${inverter.name} on ${date.toDateString()}`);
  await new Promise(res => setTimeout(res, 500)); // simulate network delay

  const { curveData } = generateDailyData(inverter, date);
  return curveData;
};


export const syncMonthData = async (
  project: Project,
  month: string, // "YYYY-MM"
): Promise<MonthlyData> => {
  console.log(`(MOCK) Syncing data for project ${project.projectCode} for month ${month}`);

  // This function simulates calling the /getDevicePointMinuteDataList endpoint for each day
  // to get the final "Daily Yield" value, and then summing those up.
  await new Promise(res => setTimeout(res, 1500)); 

  const [year, monthNum] = month.split('-').map(Number);
  const daysInMonth = new Date(year, monthNum, 0).getDate();
  const moduleBuilds = getModuleBuilds();
  const moduleBuildMap = new Map(moduleBuilds.map(b => [b.id, b]));

  const newMonthData: MonthlyData = {
    month,
    electricityImportedKWh: project.monthlyData[month]?.electricityImportedKWh || 0,
    targetNetKWhP50: project.monthlyData[month]?.targetNetKWhP50 || 0,
    inverterExportKWh: Array(project.inverters.length).fill(0),
    inverterTargetOMKWh: project.monthlyData[month]?.inverterTargetOMKWh || Array(project.inverters.length).fill(0),
    inverterIrradiation: Array(project.inverters.length).fill(0),
    inverterDcCapacityKW: Array(project.inverters.length).fill(0),
  };
  
  let totalPlantIrradiation = 0;
  
  const seasonalFactor = 1 - (Math.abs(6.5 - monthNum) / 5.5) * 0.4;
  totalPlantIrradiation = (130 + Math.random() * 40) * seasonalFactor * daysInMonth;

  for (let i = 0; i < project.inverters.length; i++) {
    const inverter = project.inverters[i];
    
    const randomFactor = 0.9 + Math.random() * 0.2;
    const dailyGeneration = inverter.kwac * 4.2 * seasonalFactor * randomFactor;
    const monthlyGeneration = Math.round(dailyGeneration * daysInMonth);

    newMonthData.inverterExportKWh[i] = monthlyGeneration;
    newMonthData.inverterIrradiation[i] = Math.round(totalPlantIrradiation);
    
    const build = inverter.moduleBuildId ? moduleBuildMap.get(inverter.moduleBuildId) : undefined;
    const dcCapacity = (inverter.moduleCount || 0) * (build?.wp || 0) / 1000;
    newMonthData.inverterDcCapacityKW[i] = dcCapacity;
    
    if (i === 0) {
        newMonthData.electricityImportedKWh = Math.round(monthlyGeneration * 0.03 * Math.random());
    }
  }

  return newMonthData;
};
