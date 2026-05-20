
import React, { useMemo, useState } from 'react';
import { Project, KPIResult, MonthlyData, TimeRange } from '../types';
import { calculateKPIs, operationalSpanInMonth } from '../services/dataService';
import CombinedPerformanceChart from '../components/CombinedPerformanceChart';
import { useAuth } from '../context/AuthContext';
import { formatEnergyKWh, formatINR } from '../utils/format';

interface Props {
  projects: Project[];
}

const Dashboard: React.FC<Props> = ({ projects }) => {
  const { currentUser } = useAuth();
  const [timeRange, setTimeRange] = useState<TimeRange>('12M');

  const aggregate = useMemo(() => {
    const totalStats: Omit<KPIResult, 'tariff' | 'totalDays'> & { weightedAverageTariff: number; weightedAverageYieldPerDay: number, totalDays: number } = {
      totalCapacityKWac: 0,
      totalCapacityKWdc: 0,
      weightedAverageTariff: 0,
      totalExport: 0,
      totalImport: 0,
      netEnergy: 0,
      revenue: 0,
      targetRevenue: 0,
      yield: 0,
      pr: 0,
      cuf: 0,
      dcCuf: 0,
      co2Reduction: 0,
      targetP50: 0,
      targetOM: 0,
      weightedAverageYieldPerDay: 0,
      totalDays: 0,
      averageDailyYield: 0,
    };

    const projectKPIs = projects.map(p => calculateKPIs(p, timeRange));
    let totalWeightedTariffNumerator = 0;

    projectKPIs.forEach(k => {
      totalStats.totalCapacityKWac += k.totalCapacityKWac;
      totalStats.totalCapacityKWdc += k.totalCapacityKWdc;
      // Track gross export AND net separately. Net (export - import) drives
      // revenue and CUF; gross export is what SolisCloud's own dashboard shows.
      totalStats.totalExport += k.totalExport;
      totalStats.totalImport += k.totalImport;
      totalStats.netEnergy += k.netEnergy;
      totalStats.revenue += k.revenue;
      totalStats.targetRevenue += k.targetRevenue;
      totalStats.co2Reduction += k.co2Reduction;
      totalStats.targetOM += k.targetOM;
      totalWeightedTariffNumerator += (k.tariff * k.totalCapacityKWac);
    });

    // Total of (DC capacity × operational days) across the whole portfolio.
    // This is the correct denominator for a portfolio-wide daily-yield figure:
    // each project contributes its own kWdc multiplied by the days it was
    // actually able to generate during the selected window. Using a single
    // project's `totalDays` (the previous behaviour) gave nonsense numbers on
    // the ALL timeline because projects have very different lifetimes.
    const totalCapacityDaysDc = projectKPIs.reduce(
      (sum, k) => sum + k.totalCapacityKWdc * k.totalDays,
      0,
    );
    // Same idea for total operational days, exposed for downstream consumers.
    // It's the sum across projects rather than any single project's value.
    totalStats.totalDays = projectKPIs.reduce((sum, k) => sum + k.totalDays, 0);

    const totalCapAc = totalStats.totalCapacityKWac || 1;
    const totalCapDc = totalStats.totalCapacityKWdc || 1;

    totalStats.weightedAverageTariff = totalStats.totalCapacityKWac ? totalWeightedTariffNumerator / totalStats.totalCapacityKWac : 0;
    totalStats.pr = projectKPIs.reduce((acc, k) => acc + (k.pr * k.totalCapacityKWac), 0) / totalCapAc;
    totalStats.dcCuf = projectKPIs.reduce((acc, k) => acc + (k.dcCuf * k.totalCapacityKWdc), 0) / totalCapDc;
    totalStats.yield = projectKPIs.reduce((acc, k) => acc + (k.yield * k.totalCapacityKWac), 0) / totalCapAc;
    totalStats.averageDailyYield =
      totalCapacityDaysDc > 0 ? totalStats.netEnergy / totalCapacityDaysDc : 0;

    totalStats.weightedAverageYieldPerDay = totalStats.averageDailyYield;

    return totalStats;
  }, [projects, timeRange]);

  const chartData = useMemo(() => {
    const timeMap: Record<string, any> = {};

    projects.forEach(p => {
      Object.values(p.monthlyData).forEach((m: MonthlyData) => {
        if (!timeMap[m.month]) {
          timeMap[m.month] = { month: m.month, actualEnergy: 0, targetEnergyOM: 0, revenue: 0, targetRevenueOM: 0, prDenominator: 0, yieldDenominator: 0, dcCufDenominator: 0 };
        }

        const monthlyTotalExport = (m.inverterExportKWh || []).reduce((s, v) => s + v, 0);
        const monthlyTotalTargetOM = (m.inverterTargetOMKWh || []).reduce((s, v) => s + v, 0);
        const monthlyTotalDcKW = (m.inverterDcCapacityKW || []).reduce((s, v) => s + v, 0);

        const net = monthlyTotalExport - (m.electricityImportedKWh || 0);

        // Operational hours for THIS project in this month — honours its own
        // commissioning date. Different projects contribute different amounts
        // for the same calendar month (a plant commissioned mid-month adds
        // fewer hours than one running for years).
        const commissioningDate = new Date(p.dateOfCommissioning);
        const { hours } = operationalSpanInMonth(m.month, commissioningDate);

        timeMap[m.month].actualEnergy += net;
        timeMap[m.month].targetEnergyOM += monthlyTotalTargetOM;
        timeMap[m.month].revenue += (net * p.tariff);
        timeMap[m.month].targetRevenueOM += (monthlyTotalTargetOM * p.tariff);

        const monthlyPrDenominator = (m.inverterIrradiation || []).reduce((sum, irrad, index) => {
          const dcCap = (m.inverterDcCapacityKW || [])[index] || 0;
          return sum + (irrad * dcCap);
        }, 0);

        timeMap[m.month].prDenominator += monthlyPrDenominator;
        timeMap[m.month].yieldDenominator += monthlyTotalDcKW;
        timeMap[m.month].dcCufDenominator += monthlyTotalDcKW * hours;
      });
    });

    const sorted = Object.values(timeMap).sort((a, b) => a.month.localeCompare(b.month));

    return sorted.map(curr => ({
      ...curr,
      pr: curr.prDenominator > 0 ? (curr.actualEnergy / curr.prDenominator) * 100 : 0,
      yield: curr.yieldDenominator > 0 ? (curr.actualEnergy / curr.yieldDenominator) : 0,
      dcCuf: curr.dcCufDenominator > 0 ? (curr.actualEnergy / curr.dcCufDenominator) * 100 : 0,
    }));
  }, [projects]);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <header className="mb-8 flex flex-col md:flex-row md:justify-between md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Portfolio Dashboard</h1>
          <p className="text-solar-text">Welcome, {currentUser?.username}. Overview of all {projects.length} projects.</p>
        </div>
        {/* Time-range filter — applies to the KPI cards and the trends chart below. */}
        <div className="flex items-center bg-solar-bg rounded-lg border border-solar-border p-1 px-2 self-start md:self-auto">
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
      </header>

      {(() => {
        // "Total Generation":
        //   • ALL  → SolisCloud's authoritative lifetime roll-up (station.allEnergy
        //     stored as project.lifetimeKWh on every sync). Matches SolisCloud
        //     to the kWh even when historic inverters were replaced or the
        //     plant generated before being registered on SolisCloud.
        //   • 12M / 6M → sum of monthly inverter export for the period (the
        //     only granular data we have).
        // Both numbers are gross export — net (export − import) drives revenue
        // and CUF, but Solis's "Total Yield" is gross so we follow suit.
        const totalLifetimeKWh = projects.reduce((sum, p) => sum + (p.lifetimeKWh || 0), 0);
        // Same idea for revenue: on ALL, multiply each project's lifetimeKWh
        // by its tariff and sum, so the figure matches SolisCloud's "Total
        // Earning" (which Solis itself computes from station-level allEnergy).
        const lifetimeRevenue = projects.reduce(
          (sum, p) => sum + (p.lifetimeKWh || 0) * (p.tariff || 0),
          0,
        );
        const usingLifetime = timeRange === 'ALL' && totalLifetimeKWh > 0;
        const generationKWh = usingLifetime ? totalLifetimeKWh : aggregate.totalExport;
        const revenue = usingLifetime && lifetimeRevenue > 0 ? lifetimeRevenue : aggregate.revenue;
        const gen = formatEnergyKWh(generationKWh);
        // Human-readable scope label for every KPI — makes it obvious that the
        // numbers are bounded by the active Timeline filter, not lifetime totals.
        const rangeLabel = timeRange === 'ALL' ? 'Lifetime' : `Last ${timeRange === '6M' ? '6 months' : '12 months'}`;
        return (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <div
              className="kpi-card border-l-yellow-400"
              title={
                usingLifetime
                  ? `Lifetime revenue: sum of (lifetime kWh × tariff) across all projects. Sourced from SolisCloud's station-level energy roll-up so it matches SolisCloud's "Total Earning".`
                  : `Sum of monthly net export × tariff over the selected period (${rangeLabel}).`
              }
            >
              <h3 className="kpi-label">Total Revenue</h3>
              <p className="kpi-value text-solar-accent">{formatINR(revenue)}</p>
              <p className="kpi-range">{rangeLabel}</p>
            </div>
            <div
              className="kpi-card border-l-green-400"
              title={
                timeRange === 'ALL' && totalLifetimeKWh > 0
                  ? `Lifetime gross export. Sourced from SolisCloud's authoritative station-level roll-up (allEnergy) — matches SolisCloud exactly. Net (export − import, from monthly data): ${formatEnergyKWh(aggregate.netEnergy).value} ${formatEnergyKWh(aggregate.netEnergy).unit}.`
                  : `Gross export from all inverters over the selected period (${rangeLabel}). Net used for revenue: ${formatEnergyKWh(aggregate.netEnergy).value} ${formatEnergyKWh(aggregate.netEnergy).unit}.`
              }
            >
              <h3 className="kpi-label">Total Generation</h3>
              <div className="flex items-end gap-2">
                <p className="kpi-value text-solar-success">{gen.value}</p>
                <span className="text-xs text-gray-500 mb-1">{gen.unit}</span>
              </div>
              <p className="kpi-range">{rangeLabel}</p>
            </div>
            <div className="kpi-card border-l-blue-400">
              <h3 className="kpi-label">Weighted DC CUF</h3>
              <p className="kpi-value text-blue-300">{aggregate.dcCuf.toFixed(1)}%</p>
              <p className="kpi-range">{rangeLabel}</p>
            </div>
            <div className="kpi-card border-l-cyan-400">
              <h3 className="kpi-label">Avg. Daily Yield</h3>
              <p className="kpi-value text-cyan-300">{aggregate.averageDailyYield.toFixed(2)} <span className="text-sm font-normal">kWh/kWp/day</span></p>
              <p className="kpi-range">{rangeLabel}</p>
            </div>
            <div className="kpi-card border-l-teal-400">
              <h3 className="kpi-label">CO2 Offset</h3>
              <p className="kpi-value text-teal-300">{Math.floor(aggregate.co2Reduction).toLocaleString()} <span className="text-sm font-normal">tCO2e</span></p>
              <p className="kpi-range">{rangeLabel}</p>
            </div>
          </div>
        );
      })()}

      <CombinedPerformanceChart data={chartData} user={currentUser} title="Performance Trends" />

      <style>{`
        .kpi-card { background-color: #1B263B; padding: 1rem; border-radius: 0.5rem; border: 1px solid #415A77; }
        .kpi-label { color: #E0E1DD; font-size: 0.875rem; text-transform: uppercase; letter-spacing: 0.05em; }
        .kpi-value { font-size: 1.5rem; font-weight: bold; }
        .kpi-range { color: #718096; font-size: 0.7rem; margin-top: 0.25rem; text-transform: uppercase; letter-spacing: 0.05em; }
      `}</style>
    </div>
  );
};

export default Dashboard;
