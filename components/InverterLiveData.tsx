
import React, { useState, useEffect } from 'react';
import { Inverter, SolisRealTimeData } from '../types';
import { fetchRealTimeData, fetchDailyGenerationCurve } from '../services/solisAPIService';
import { SOLIS_POINT_IDS } from '../constants';
import DailyGenerationChart from './DailyGenerationChart';

interface Props {
  inverter: Inverter;
  dateOfCommissioning: string;
}

const HISTORICAL_COLORS = ['#34D399', '#63B3ED', '#A78BFA', '#F472B6'];

const getStatusString = (status: number): { text: string, color: string } => {
    // Based on "Operating status" (29) from documentation
    if (status === 64) return { text: "On-Grid / Running", color: "text-solar-success" };
    if (status === 256) return { text: "Operation Fault", color: "text-solar-danger" };
    if (status === 8) return { text: "Standby", color: "text-blue-400" };
    if (status === 32768) return { text: "Shutdown", color: "text-gray-500" };
    if (status === 21760) return { text: "Shutdown due to Fault", color: "text-red-600" };
    if (status === 33024) return { text: "Derated Running", color: "text-yellow-500" };
    return { text: `Unknown (${status})`, color: "text-gray-400" };
}

const LiveDataCard: React.FC<{label: string, value: string, unit?: string, color?: string}> = ({ label, value, unit, color = "text-white" }) => (
    <div className="bg-solar-card p-4 rounded-lg border border-solar-border text-center">
        <p className="text-sm text-gray-400 uppercase">{label}</p>
        <p className={`text-2xl font-bold ${color}`}>
            {value} <span className="text-base font-normal text-gray-300">{unit}</span>
        </p>
    </div>
);

const InverterLiveData: React.FC<Props> = ({ inverter, dateOfCommissioning }) => {
  const [data, setData] = useState<SolisRealTimeData | null>(null);
  const [comparisonChartData, setComparisonChartData] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [visibleYears, setVisibleYears] = useState<string[]>(['Today']);
  const [chartSeries, setChartSeries] = useState<any[]>([]);

  useEffect(() => {
    // Determine available historical years for comparison
    const commissioningYear = new Date(dateOfCommissioning).getFullYear();
    const currentYear = new Date().getFullYear();
    const years: number[] = [];
    for (let y = currentYear - 1; y >= commissioningYear; y--) {
      years.push(y);
    }
    setAvailableYears(years);

    const fetchAllData = async () => {
      if (!inverter.psKey) {
        setError("Inverter is not configured for live data (missing psKey).");
        setIsLoading(false);
        return;
      }
      try {
        setIsLoading(true);
        setError(null);
        
        const today = new Date();
        const promises = [
          fetchRealTimeData(inverter),
          fetchDailyGenerationCurve(inverter, today),
        ];

        const historicalDates = years.map(year => {
            const histDate = new Date(today);
            histDate.setFullYear(year);
            return histDate;
        });
        
        historicalDates.forEach(date => {
            promises.push(fetchDailyGenerationCurve(inverter, date));
        });

        const results = await Promise.all(promises);
        const realtimeResult = results[0] as SolisRealTimeData;
        const todayCurve = results[1] as { time: string; power: number }[];
        
        setData(realtimeResult);
        setLastUpdated(new Date());

        const historicalCurves = results.slice(2) as { time: string; power: number }[][];

        // Merge data for comparison chart
        const mergedData = todayCurve.map(point => ({
            time: point.time,
            'Today': point.power,
        }));

        historicalCurves.forEach((curve, index) => {
            const year = years[index];
            curve.forEach((point, i) => {
                if (mergedData[i]) {
                    mergedData[i][year] = point.power;
                }
            });
        });

        setComparisonChartData(mergedData);

      } catch (err: any) {
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };

    fetchAllData();
  }, [inverter, dateOfCommissioning]);

  useEffect(() => {
     // Effect for interval updates of real-time KPI data (only)
    const interval = setInterval(async () => {
      if (!inverter.psKey || document.hidden) return; // don't fetch if tab is not active
      try {
        const realtimeResult = await fetchRealTimeData(inverter);
        setData(realtimeResult);
        setLastUpdated(new Date());
      } catch (err) {
        console.log("Silent refresh failed for realtime data", err);
      }
    }, 60000);

    return () => clearInterval(interval);
  }, [inverter.psKey]);
  
  useEffect(() => {
    // Update chart series when visibility changes
    const series = [];
    if (visibleYears.includes('Today')) {
        series.push({ key: 'Today', name: 'Today', color: '#FFD700', type: 'area' });
    }
    availableYears.forEach((year, i) => {
        if (visibleYears.includes(String(year))) {
            series.push({ key: String(year), name: String(year), color: HISTORICAL_COLORS[i % HISTORICAL_COLORS.length], type: 'line' });
        }
    });
    setChartSeries(series);
  }, [visibleYears, availableYears]);


  const handleYearToggle = (year: string) => {
    setVisibleYears(prev => 
        prev.includes(year) ? prev.filter(y => y !== year) : [...prev, year]
    );
  };

  const status = getStatusString(Number(data?.[SOLIS_POINT_IDS.OPERATING_STATUS]?.value || 0));

  if (isLoading) {
    return <div className="text-center p-10"><div className="w-8 h-8 border-4 border-yellow-400 border-t-transparent rounded-full animate-spin mx-auto"></div><p className="mt-2">Loading live data...</p></div>;
  }

  if (error) {
    return <div className="bg-red-900/50 border border-solar-danger text-red-300 p-4 rounded-lg">{error}</div>;
  }
  
  if (!data) {
    return <div className="text-center p-10 text-gray-500">No live data available.</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Real-Time Status</h3>
        <p className="text-xs text-gray-500">Last updated: {lastUpdated?.toLocaleTimeString() || 'N/A'}</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <LiveDataCard label="Operating Status" value={status.text} color={status.color} />
        <LiveDataCard label="AC Power" value={(Number(data[SOLIS_POINT_IDS.TOTAL_ACTIVE_POWER].value) / 1000).toFixed(2)} unit="kW" color="text-solar-accent" />
        <LiveDataCard label="DC Power" value={(Number(data[SOLIS_POINT_IDS.TOTAL_DC_POWER].value) / 1000).toFixed(2)} unit="kW" color="text-blue-400" />
        <LiveDataCard label="Daily Yield" value={(Number(data[SOLIS_POINT_IDS.YIELD_TODAY].value) / 1000).toFixed(1)} unit="kWh" color="text-solar-success" />
      </div>

       <div className="bg-solar-card rounded-lg border border-solar-border p-4">
        <h4 className="font-semibold mb-4 text-white">Daily Generation Curve</h4>
        {comparisonChartData.length > 0 ? (
          <>
            <DailyGenerationChart data={comparisonChartData} series={chartSeries} />
            <div className="flex items-center justify-center gap-2 mt-4">
                <span className="text-xs text-gray-400 mr-2">Compare with:</span>
                 <button 
                    onClick={() => handleYearToggle('Today')}
                    className={`px-3 py-1 text-xs rounded font-medium transition ${visibleYears.includes('Today') ? 'bg-solar-accent text-black' : 'bg-solar-bg text-gray-300 hover:bg-gray-700'}`}
                >
                    Today
                </button>
                {availableYears.map(year => (
                    <button 
                        key={year}
                        onClick={() => handleYearToggle(String(year))}
                        className={`px-3 py-1 text-xs rounded font-medium transition ${visibleYears.includes(String(year)) ? 'bg-solar-success text-black' : 'bg-solar-bg text-gray-300 hover:bg-gray-700'}`}
                    >
                        {year}
                    </button>
                ))}
            </div>
          </>
        ) : (
          <div className="text-center h-64 flex items-center justify-center text-gray-500">No generation data for today yet.</div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-solar-card rounded-lg border border-solar-border p-4">
            <h4 className="font-semibold mb-2">Grid Vitals</h4>
            <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-gray-400">Frequency</span><span>{Number(data[SOLIS_POINT_IDS.GRID_FREQUENCY].value).toFixed(2)} Hz</span></div>
                <div className="flex justify-between"><span className="text-gray-400">Phase A Voltage</span><span>{Number(data[SOLIS_POINT_IDS.PHASE_A_VOLTAGE].value).toFixed(1)} V</span></div>
                <div className="flex justify-between"><span className="text-gray-400">Phase B Voltage</span><span>{Number(data[SOLIS_POINT_IDS.PHASE_B_VOLTAGE].value).toFixed(1)} V</span></div>
                <div className="flex justify-between"><span className="text-gray-400">Phase C Voltage</span><span>{Number(data[SOLIS_POINT_IDS.PHASE_C_VOLTAGE].value).toFixed(1)} V</span></div>
            </div>
        </div>
        <div className="bg-solar-card rounded-lg border border-solar-border p-4">
            <h4 className="font-semibold mb-2">General Info</h4>
            <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-gray-400">Internal Temp.</span><span>{Number(data[SOLIS_POINT_IDS.INTERNAL_AIR_TEMP].value).toFixed(1)} °C</span></div>
                <div className="flex justify-between"><span className="text-gray-400">Total Yield</span><span>{(Number(data[SOLIS_POINT_IDS.YIELD_TOTAL].value) / 1000).toLocaleString(undefined, {maximumFractionDigits: 0})} kWh</span></div>
            </div>
        </div>
      </div>
      
      <div className="bg-solar-card rounded-lg border border-solar-border">
        <h3 className="p-4 font-bold text-white border-b border-solar-border">MPPT Performance</h3>
        <table className="w-full text-left text-sm">
            <thead className="text-xs text-gray-400 uppercase"><tr>
                <th className="px-4 py-2">MPPT</th>
                <th className="px-4 py-2 text-right">Voltage (V)</th>
                <th className="px-4 py-2 text-right">Current (A)</th>
                <th className="px-4 py-2 text-right">Power (kW)</th>
            </tr></thead>
            <tbody className="divide-y divide-solar-border">
                {[...Array(2)].map((_, i) => { // Assuming up to 2 MPPTs for this example
                    const mppt = i + 1;
                    const voltage = Number(data[SOLIS_POINT_IDS[`MPPT${mppt}_VOLTAGE` as keyof typeof SOLIS_POINT_IDS]]?.value || 0);
                    const current = Number(data[SOLIS_POINT_IDS[`MPPT${mppt}_CURRENT` as keyof typeof SOLIS_POINT_IDS]]?.value || 0);
                    const power = (voltage * current) / 1000;
                    return (
                        <tr key={mppt}><td className="p-3 font-medium text-gray-300">MPPT {mppt}</td>
                        <td className="p-3 text-right text-blue-300">{voltage.toFixed(1)}</td>
                        <td className="p-3 text-right text-green-300">{current.toFixed(2)}</td>
                        <td className="p-3 text-right text-yellow-300">{power.toFixed(2)}</td></tr>
                    )
                })}
            </tbody>
        </table>
      </div>
    </div>
  );
};

export default InverterLiveData;
