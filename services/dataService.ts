
import { Project, KPIResult, MonthlyData, TimeRange, ModuleBuild, Inverter, InverterKPIResult, BreakdownEvent, BreakdownStats } from '../types';
import { CO2_FACTOR, SYSTEM_EFFICIENCY } from '../constants';
import { getModuleBuilds } from './moduleBuildService';
import { apiFetch } from './apiClient';

// --- Calculations ---

export const calculateProjectStaticCapacity = (project: Project) => {
  const totalKWac = (project.inverters || []).reduce((sum, inv) => sum + inv.kwac, 0);
  return { totalKWac };
};

/**
 * Hours and days a project was actually able to generate during the calendar
 * month identified by `monthKey` (YYYY-MM).
 *
 *  • If the plant was commissioned mid-month, the partial start is honoured —
 *    e.g. commissioning on the 28th of a 31-day month counts as 4 days, not 31.
 *  • If `monthKey` is the current month, the span ends at `now` — e.g. on the
 *    20th of a 31-day month, the month contributes 20 days, not 31.
 *  • Past months entirely after commissioning return the full month length.
 *
 * Used as the time denominator for CUF, PR and daily-yield calculations so
 * those KPIs reflect actual operational time rather than calendar time.
 */
export function operationalSpanInMonth(
  monthKey: string,
  commissioningDate: Date,
  now: Date = new Date(),
): { hours: number; days: number } {
  const [yearStr, monthStr] = monthKey.split('-');
  const year = parseInt(yearStr, 10);
  const monthIdx = parseInt(monthStr, 10) - 1; // JS month is 0-indexed

  const monthStartMs = new Date(year, monthIdx, 1).getTime();
  const monthEndMs = new Date(year, monthIdx + 1, 1).getTime();
  const commissioningMs = commissioningDate.getTime();
  const nowMs = now.getTime();

  // Commissioning falls inside this month → clamp the start to it.
  const opStart =
    commissioningMs > monthStartMs && commissioningMs < monthEndMs ? commissioningMs : monthStartMs;
  // "Now" falls inside this month → clamp the end to it.
  const opEnd = nowMs > monthStartMs && nowMs < monthEndMs ? nowMs : monthEndMs;

  if (opEnd <= opStart) return { hours: 0, days: 0 };

  const ms = opEnd - opStart;
  return {
    hours: ms / 3_600_000,
    days: ms / 86_400_000,
  };
}

export const filterMonthlyData = (monthlyData: Record<string, MonthlyData>, range: TimeRange): MonthlyData[] => {
  const sorted = Object.values(monthlyData).sort((a, b) => a.month.localeCompare(b.month));

  if (range === 'ALL') return sorted;
  if (sorted.length === 0) return [];

  if (range === '6M') {
    return sorted.slice(-6);
  }

  if (range === '12M') {
    return sorted.slice(-12);
  }

  return sorted;
};

export const calculateKPIs = (project: Project, timeRange: TimeRange = 'ALL', moduleBuilds?: ModuleBuild[]): KPIResult => {
  const allModuleBuilds = moduleBuilds || getModuleBuilds();
  const moduleBuildMap = new Map(allModuleBuilds.map(b => [b.id, b]));

  const { totalKWac } = calculateProjectStaticCapacity(project);

  let totalExport = 0;
  let totalImport = 0;
  let totalTargetP50 = 0;
  let totalTargetOM = 0;
  let totalDays = 0;

  let prDenominator = 0;
  let dcCufDenominator = 0;
  let acCufDenominator = 0;

  const months = filterMonthlyData(project.monthlyData, timeRange);
  const commissioningDate = new Date(project.dateOfCommissioning);
  const now = new Date();

  months.forEach(m => {
    // Use actual operational time, not calendar time. A plant commissioned on
    // the 28th of a 31-day month only contributed 4 days to its CUF for that
    // month — counting the full 31 makes CUF and daily-yield look artificially
    // low. Same applies to the current (incomplete) month.
    const { hours, days } = operationalSpanInMonth(m.month, commissioningDate, now);
    totalDays += days;

    const monthlyTotalDcKW = (m.inverterDcCapacityKW || []).reduce((sum, dc) => sum + dc, 0);
    const monthlyTotalExport = (m.inverterExportKWh || []).reduce((sum, exp) => sum + exp, 0);
    const monthlyTotalTargetOM = (m.inverterTargetOMKWh || []).reduce((sum, om) => sum + om, 0);

    totalExport += monthlyTotalExport;
    totalImport += m.electricityImportedKWh || 0;
    totalTargetP50 += m.targetNetKWhP50 || 0;
    totalTargetOM += monthlyTotalTargetOM;

    const monthDate = new Date(m.month + '-02');
    const monthsDiff = monthDate.getMonth() - commissioningDate.getMonth() + 12 * (monthDate.getFullYear() - commissioningDate.getFullYear());

    const monthlyPrDenominator = project.inverters.reduce((sum, inv, index) => {
        const build = inv.moduleBuildId ? moduleBuildMap.get(inv.moduleBuildId) : undefined;
        const irradiation = (m.inverterIrradiation || [])[index] || 0;

        if (build && inv.moduleCount && irradiation > 0) {
            const firstYearDegradationPerMonth = build.degradation.firstYear / 12;
            const subsequentYearDegradationPerMonth = build.degradation.subsequentYears / 12;
            let totalDegradationPercent = 0;

            if (monthsDiff >= 0) {
              if (monthsDiff < 12) {
                  totalDegradationPercent = (monthsDiff + 1) * firstYearDegradationPerMonth;
              } else {
                  totalDegradationPercent = build.degradation.firstYear + (monthsDiff - 11) * subsequentYearDegradationPerMonth;
              }
            }

            const degradationFactor = 1 - totalDegradationPercent / 100;
            // IEC 61724 PR denominator: H_POA × P_DC_rated × (1 − degradation),
            // with G_STC = 1 kW/m² so the irradiance term is just kWh/m². The
            // rated DC power of this inverter's array is (count × Wp) / 1000.
            // The previous code used (count × area), which is incident energy
            // and omits the module efficiency η_STC = Wp / (area × 1000) —
            // that's what was making PR display ~5× too low.
            const dcCapacityKW = (inv.moduleCount * build.wp) / 1000;
            const degradedDcCapacityKW = dcCapacityKW * degradationFactor;

            return sum + (irradiation * degradedDcCapacityKW);
        }
        return sum;
    }, 0);

    prDenominator += monthlyPrDenominator;

    dcCufDenominator += monthlyTotalDcKW * hours;
    acCufDenominator += totalKWac * hours;
  });

  const netEnergy = totalExport - totalImport;
  const tariff = project.tariff || 0;
  const revenue = netEnergy * tariff;
  const targetRevenue = totalTargetOM * tariff;
  const co2Reduction = (netEnergy / 1000) * CO2_FACTOR;

  let latestTotalKWdc = 0;
  if (months.length > 0) {
    const lastMonth = months[months.length - 1];
    latestTotalKWdc = (lastMonth.inverterDcCapacityKW || []).reduce((sum, dc) => sum + dc, 0);
  }

  const yieldVal = latestTotalKWdc > 0 ? (netEnergy / latestTotalKWdc) : 0;
  const averageDailyYield = (latestTotalKWdc > 0 && totalDays > 0) ? (netEnergy / latestTotalKWdc / totalDays) : 0;
  const pr = prDenominator > 0 ? (netEnergy / prDenominator) * 100 : 0;
  const cuf = acCufDenominator > 0 ? (netEnergy / acCufDenominator) * 100 : 0;
  const dcCuf = dcCufDenominator > 0 ? (netEnergy / dcCufDenominator) * 100 : 0;

  return {
    totalCapacityKWac: totalKWac,
    totalCapacityKWdc: latestTotalKWdc,
    tariff: tariff,
    totalExport,
    totalImport,
    netEnergy,
    revenue,
    targetRevenue,
    yield: yieldVal,
    pr,
    cuf,
    dcCuf,
    co2Reduction,
    targetP50: totalTargetP50,
    targetOM: totalTargetOM,
    totalDays,
    averageDailyYield,
  };
};

export const calculateInverterKPIs = (project: Project, inverter: Inverter, inverterIndex: number, timeRange: TimeRange = 'ALL', moduleBuilds?: ModuleBuild[]): InverterKPIResult => {
  const allModuleBuilds = moduleBuilds || getModuleBuilds();
  const moduleBuildMap = new Map(allModuleBuilds.map(b => [b.id, b]));

  let totalExport = 0;
  let totalTargetOM = 0;
  let totalTheoreticalEnergy = 0;
  let totalDays = 0;

  let prDenominator = 0;
  let dcCufDenominator = 0;
  let acCufDenominator = 0;

  const months = filterMonthlyData(project.monthlyData, timeRange);
  const commissioningDate = new Date(project.dateOfCommissioning);
  const now = new Date();

  months.forEach(m => {
    // Operational time in the month (honours commissioning date + today's date),
    // not raw calendar time — see operationalSpanInMonth for the rationale.
    const { hours, days } = operationalSpanInMonth(m.month, commissioningDate, now);
    totalDays += days;

    const monthlyDcKW = (m.inverterDcCapacityKW || [])[inverterIndex] || 0;
    const monthlyExport = (m.inverterExportKWh || [])[inverterIndex] || 0;
    const monthlyTargetOM = (m.inverterTargetOMKWh || [])[inverterIndex] || 0;
    const irradiation = (m.inverterIrradiation || [])[inverterIndex] || 0;

    totalExport += monthlyExport;
    totalTargetOM += monthlyTargetOM;
    totalTheoreticalEnergy += irradiation * monthlyDcKW * SYSTEM_EFFICIENCY;

    const monthDate = new Date(m.month + '-02');
    const monthsDiff = monthDate.getMonth() - commissioningDate.getMonth() + 12 * (monthDate.getFullYear() - commissioningDate.getFullYear());

    const build = inverter.moduleBuildId ? moduleBuildMap.get(inverter.moduleBuildId) : undefined;

    if (build && inverter.moduleCount && irradiation > 0) {
        const firstYearDegradationPerMonth = build.degradation.firstYear / 12;
        const subsequentYearDegradationPerMonth = build.degradation.subsequentYears / 12;
        let totalDegradationPercent = 0;

        if (monthsDiff >= 0) {
          if (monthsDiff < 12) {
              totalDegradationPercent = (monthsDiff + 1) * firstYearDegradationPerMonth;
          } else {
              totalDegradationPercent = build.degradation.firstYear + (monthsDiff - 11) * subsequentYearDegradationPerMonth;
          }
        }

        const degradationFactor = 1 - totalDegradationPercent / 100;
        // IEC 61724 PR denominator (see calculateKPIs for the full derivation):
        // H_POA × P_DC × (1 − degradation), with P_DC = moduleCount × Wp / 1000.
        const dcCapacityKW = (inverter.moduleCount * build.wp) / 1000;
        const degradedDcCapacityKW = dcCapacityKW * degradationFactor;
        prDenominator += irradiation * degradedDcCapacityKW;
    }

    dcCufDenominator += monthlyDcKW * hours;
    acCufDenominator += inverter.kwac * hours;
  });

  const tariff = project.tariff || 0;
  const revenue = totalExport * tariff;
  const targetRevenue = totalTargetOM * tariff;
  const co2Reduction = (totalExport / 1000) * CO2_FACTOR;

  let latestTotalKWdc = 0;
  if (months.length > 0) {
    const lastMonth = months[months.length - 1];
    latestTotalKWdc = (lastMonth.inverterDcCapacityKW || [])[inverterIndex] || 0;
  }

  const yieldVal = latestTotalKWdc > 0 ? (totalExport / latestTotalKWdc) : 0;
  const averageDailyYield = (latestTotalKWdc > 0 && totalDays > 0) ? (totalExport / latestTotalKWdc / totalDays) : 0;
  const pr = prDenominator > 0 ? (totalExport / prDenominator) * 100 : 0;
  const cuf = acCufDenominator > 0 ? (totalExport / acCufDenominator) * 100 : 0;
  const dcCuf = dcCufDenominator > 0 ? (totalExport / dcCufDenominator) * 100 : 0;

  return {
    totalCapacityKWac: inverter.kwac,
    totalCapacityKWdc: latestTotalKWdc,
    tariff: tariff,
    totalExport,
    revenue,
    targetRevenue,
    yield: yieldVal,
    pr,
    cuf,
    dcCuf,
    co2Reduction,
    targetOM: totalTargetOM,
    totalTheoreticalEnergy,
    totalDays,
    averageDailyYield,
  };
};

export const calculateBreakdownStats = (
  events: BreakdownEvent[],
  inverterDcCapacity: number,
  periodDays: number,
): BreakdownStats => {
  const stats: BreakdownStats = {
    totalBreakdownDurationMinutes: 0,
    totalGenerationLossKwh: 0,
    totalGiiLoss: 0,
    availabilityPercent: 100,
    byReason: {},
  };

  events.forEach(event => {
    const [startH, startM] = event.startTime.split(':').map(Number);
    const [endH, endM] = event.endTime.split(':').map(Number);
    const durationMinutes = (endH * 60 + endM) - (startH * 60 + startM);

    if(durationMinutes < 0) return; // Ignore invalid events

    const giiLoss = event.giiAtEnd - event.giiAtStart;
    const generationLossKwh = giiLoss * inverterDcCapacity * SYSTEM_EFFICIENCY;

    stats.totalBreakdownDurationMinutes += durationMinutes;
    stats.totalGiiLoss += giiLoss;
    stats.totalGenerationLossKwh += generationLossKwh;

    if (!stats.byReason[event.reason]) {
      stats.byReason[event.reason] = {
        durationMinutes: 0,
        giiLoss: 0,
        generationLossKwh: 0,
        count: 0,
      };
    }
    const reasonStats = stats.byReason[event.reason]!;
    reasonStats.durationMinutes += durationMinutes;
    reasonStats.giiLoss += giiLoss;
    reasonStats.generationLossKwh += generationLossKwh;
    reasonStats.count += 1;
  });

  const totalPeriodMinutes = periodDays * 24 * 60;
  if (totalPeriodMinutes > 0) {
      stats.availabilityPercent = ((totalPeriodMinutes - stats.totalBreakdownDurationMinutes) / totalPeriodMinutes) * 100;
  }

  return stats;
}


// --- Storage Service (Backend API) ---

/** Loads every project from the backend. Requires an authenticated session. */
export const loadProjects = async (): Promise<Project[]> => {
  return apiFetch<Project[]>('/projects');
};

/** Persists the full project collection to the backend (bulk replace). */
export const saveProjects = async (projects: Project[]): Promise<void> => {
  await apiFetch<Project[]>('/projects', {
    method: 'PUT',
    body: JSON.stringify(projects),
  });
};
