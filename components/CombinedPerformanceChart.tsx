
import React, { useState, useMemo } from 'react';
import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Brush,
} from 'recharts';
import { ChartDataPoint, TimeRange, User } from '../types';

interface Props {
  data: ChartDataPoint[];
  height?: number;
  timeRange?: TimeRange;
  onTimeRangeChange?: (range: TimeRange) => void;
  title?: string;
  user: User | null;
  hasContainer?: boolean;
}

const formatIndian = (n: number, type: 'curr' | 'unit' = 'unit') => {
  const prefix = type === 'curr' ? '₹' : '';
  if (n === undefined || n === null || isNaN(n)) return '-';
  
  if (n >= 10000000) return `${prefix}${(n / 10000000).toFixed(2)} Cr`;
  if (n >= 100000) return `${prefix}${(n / 100000).toFixed(2)} L`;
  if (n >= 1000) return `${prefix}${(n / 1000).toFixed(1)}k`;
  
  return `${prefix}${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
};

const formatXAxis = (tickItem: string, allData: ChartDataPoint[]) => {
  const date = new Date(tickItem + '-02');
  const month = date.toLocaleString('default', { month: 'short' });
  const isFirstItem = allData.length > 0 && allData[0].month === tickItem;
  
  if (date.getMonth() === 0 || isFirstItem) {
      return `${month} '${date.getFullYear().toString().slice(-2)}`;
  }
  return month;
};


const CustomTooltip = ({ active, payload, label, showTarget }: any) => {
  if (active && payload && payload.length) {
    const dataPoint = payload[0].payload as ChartDataPoint;
    
    const targetRevenue = dataPoint.targetRevenueOM;
    const targetEnergy = dataPoint.targetEnergyOM;

    return (
      <div className="bg-[#0D1B2A] border border-[#415A77] p-3 rounded shadow-xl text-[#E0E1DD] text-sm z-50 min-w-[280px]">
        <p className="font-bold mb-2 border-b border-[#415A77] pb-1 text-white">{label}</p>
        
        <div className="grid grid-cols-3 gap-x-4 gap-y-1 items-center">
          
          <div className="col-span-3 font-semibold text-[#34D399] mt-1 border-b border-gray-700 pb-1 flex justify-between">
            <span>Energy</span>
          </div>
          
          <div className="text-gray-400">Actual</div>
          <div className="col-span-2 text-right font-medium">{formatIndian(dataPoint.actualEnergy, 'unit')}</div>

          {showTarget && (
            <>
              <div className="text-gray-400">Target (O&M)</div>
              <div className="col-span-2 text-right font-medium">{formatIndian(targetEnergy, 'unit')}</div>
            </>
          )}
          
          <div className="text-gray-400">DC CUF</div>
          <div className="col-span-2 text-right font-medium text-blue-300">
            {dataPoint.dcCuf !== undefined ? `${dataPoint.dcCuf.toFixed(1)}%` : '-'}
          </div>

          <div className="text-gray-400">Perf Ratio</div>
          <div className="col-span-2 text-right font-medium text-blue-300">
            {dataPoint.pr !== undefined ? `${dataPoint.pr.toFixed(1)}%` : '-'}
          </div>

          <div className="text-gray-400">Yield</div>
          <div className="col-span-2 text-right font-medium text-blue-300">
            {dataPoint.yield !== undefined ? `${dataPoint.yield.toFixed(1)} kWh/kW` : '-'}
          </div>


          <div className="col-span-3 font-semibold text-[#FFD700] mt-3 border-b border-gray-700 pb-1">Revenue</div>
          
          <div className="text-gray-400">Actual</div>
          <div className="col-span-2 text-right font-medium">{formatIndian(dataPoint.revenue, 'curr')}</div>

          {showTarget && (
            <>
              <div className="text-gray-400">Target (O&M)</div>
              <div className="col-span-2 text-right font-medium">{formatIndian(targetRevenue, 'curr')}</div>
            </>
          )}

          <div className="text-gray-400 text-xs">MoM</div>
          <div className={`col-span-2 text-right text-xs ${(!dataPoint.revenueMom || dataPoint.revenueMom < 0) ? 'text-red-400' : 'text-green-400'}`}>
             {dataPoint.revenueMom ? (dataPoint.revenueMom > 0 ? '▲' : '▼') : ''} {Math.abs(dataPoint.revenueMom || 0).toFixed(1)}%
          </div>
          
          <div className="text-gray-400 text-xs">YoY</div>
          <div className={`col-span-2 text-right text-xs ${(!dataPoint.revenueYoy || dataPoint.revenueYoy < 0) ? 'text-red-400' : 'text-green-400'}`}>
             {dataPoint.revenueYoy ? (dataPoint.revenueYoy > 0 ? '▲' : '▼') : ''} {Math.abs(dataPoint.revenueYoy || 0).toFixed(1)}%
          </div>
        </div>
      </div>
    );
  }
  return null;
};

const CombinedPerformanceChart: React.FC<Props> = ({ data, height = 450, timeRange: controlledTimeRange, onTimeRangeChange, title, user, hasContainer = true }) => {
  const [internalTimeRange, setInternalTimeRange] = useState<TimeRange>('12M');
  const showTarget = user?.role !== 'viewer';
  const activeTimeRange = controlledTimeRange || internalTimeRange;

  const handleTimeRangeChange = (range: TimeRange) => {
    if (onTimeRangeChange) {
      onTimeRangeChange(range);
    } else {
      setInternalTimeRange(range);
    }
  };

  const filteredData = useMemo(() => {
    if (data.length === 0) return [];
    return [...data].sort((a, b) => a.month.localeCompare(b.month));
  }, [data]);

  const { maxEnergy, maxRevenue } = useMemo(() => {
    let mEnergy = 1;
    let mRevenue = 1;
    filteredData.forEach(d => {
      mEnergy = Math.max(mEnergy, d.actualEnergy, d.targetEnergyOM);
      mRevenue = Math.max(mRevenue, d.revenue, d.targetRevenueOM);
    });
    return { maxEnergy: mEnergy, maxRevenue: mRevenue };
  }, [filteredData]);

  const chartBody = (
      <>
        {onTimeRangeChange && (
          <div className="flex flex-col md:flex-row justify-between items-center mb-4 gap-4">
              <h3 className="text-lg font-semibold text-solar-text">{title || 'Performance Trends'}</h3>
              <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center bg-solar-bg rounded-lg border border-solar-border p-1 px-2">
                  <span className="text-xs text-gray-400 px-2 uppercase font-bold">Timeline</span>
                  {(['6M', '12M', 'ALL'] as TimeRange[]).map(range => (
                      <button
                      key={range}
                      onClick={() => handleTimeRangeChange(range)}
                      className={`px-3 py-1 text-xs rounded font-medium transition ${activeTimeRange === range ? 'bg-solar-success text-black' : 'text-gray-300 hover:bg-gray-700'}`}
                      >
                      {range}
                      </button>
                  ))}
                  </div>
              </div>
          </div>
        )}
        <div style={{ width: '100%', height: height }}>
            <ResponsiveContainer>
                <ComposedChart
                    data={filteredData}
                    margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
                >
                    <CartesianGrid stroke="#415A77" strokeDasharray="3 3" vertical={false} opacity={0.2} />
                    <XAxis dataKey="month" stroke="#E0E1DD" tick={{fill: '#E0E1DD'}} tickMargin={10} tickFormatter={(tick) => formatXAxis(tick, filteredData)} />
                    <YAxis yAxisId="left" orientation="left" stroke="#34D399" tick={{fill: '#34D399'}} tickFormatter={(val) => formatIndian(val, 'unit')} domain={[0, maxEnergy * 2.5]} label={{ value: 'Energy (kWh)', angle: -90, position: 'insideLeft', fill: '#34D399' }} />
                    <YAxis yAxisId="right" orientation="right" stroke="#FFD700" tick={{fill: '#FFD700'}} tickFormatter={(val) => formatIndian(val, 'curr')} domain={[-maxRevenue * 1.2, maxRevenue * 1.1]} label={{ value: 'Revenue (₹)', angle: 90, position: 'insideRight', fill: '#FFD700' }} />
                    <Tooltip content={<CustomTooltip showTarget={showTarget} />} />
                    <Legend wrapperStyle={{ paddingTop: '10px' }} />
                    <Line yAxisId="right" type="monotone" dataKey="revenue" name="Revenue" stroke="#FFD700" strokeWidth={3} dot={{ r: 4, fill: '#FFD700' }} activeDot={{ r: 6 }} />
                    {showTarget && <Line yAxisId="right" type="monotone" dataKey="targetRevenueOM" name="Target Rev (O&M)" stroke="#D97706" strokeWidth={2} strokeDasharray="5 5" dot={false} />}
                    <Line yAxisId="left" type="monotone" dataKey="actualEnergy" name="Actual Energy" stroke="#34D399" strokeWidth={3} activeDot={{ r: 6 }} />
                    {showTarget && <Line yAxisId="left" type="monotone" dataKey="targetEnergyOM" name="Target Energy (O&M)" stroke="#34D399" strokeDasharray="5 5" strokeWidth={2} dot={false} />}
                    <Brush dataKey="month" height={30} stroke="#415A77" fill="#1B263B" tickFormatter={() => ''} />
                </ComposedChart>
            </ResponsiveContainer>
        </div>
        <p className="text-xs text-gray-500 text-center mt-1">Tip: Drag the slider to zoom in on a specific date range.</p>
      </>
  );

  if (!hasContainer) {
      return <div className="p-4">{chartBody}</div>;
  }

  return (
    <div className="w-full bg-solar-card p-4 rounded-lg shadow-lg border border-solar-border">
      {chartBody}
    </div>
  );
};

export default CombinedPerformanceChart;
