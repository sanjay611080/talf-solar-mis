
import React, { useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { ChartDataPoint, TimeRange } from '../types';

const formatEnergy = (value: number) => {
  if (value >= 10000000) return `${(value / 10000000).toFixed(2)} Cr`;
  if (value >= 100000) return `${(value / 100000).toFixed(2)} L`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
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

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const dataPoint = payload[0].payload as ChartDataPoint;
    const actual = dataPoint.actualEnergy;
    const theoretical = dataPoint.theoreticalEnergy || 0;
    const loss = theoretical - actual;
    const lossPercent = theoretical > 0 ? (loss / theoretical) * 100 : 0;

    return (
      <div className="bg-solar-bg border border-solar-border p-3 rounded shadow-xl text-solar-text text-sm z-50 min-w-[280px]">
        <p className="font-bold mb-2 border-b border-solar-border pb-1 text-white">{label}</p>
        
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 items-center">
          <div className="text-gray-400">Actual Gen</div>
          <div className="text-right font-medium text-solar-success">{actual.toLocaleString()} kWh</div>

          <div className="text-gray-400">Theoretical Max</div>
          <div className="text-right font-medium">{theoretical.toLocaleString()} kWh</div>
          
          <div className="col-span-2 my-1 border-t border-solar-border"></div>

          <div className="text-gray-400">Performance Loss</div>
          <div className={`text-right font-medium ${loss > 0 ? 'text-solar-danger' : 'text-solar-success'}`}>
            {loss.toLocaleString()} kWh ({lossPercent.toFixed(1)}%)
          </div>

          <div className="text-gray-400">PR</div>
          <div className="text-right font-medium text-blue-300">
            {dataPoint.pr !== undefined ? `${dataPoint.pr.toFixed(1)}%` : '-'}
          </div>

          <div className="text-gray-400">Yield</div>
          <div className="text-right font-medium text-blue-300">
            {dataPoint.yield !== undefined ? `${dataPoint.yield.toFixed(1)}` : '-'}
          </div>
        </div>
      </div>
    );
  }
  return null;
};

// FIX: Define Props interface for the component to resolve TypeScript error.
interface Props {
  data: ChartDataPoint[];
  timeRange: TimeRange;
  onTimeRangeChange: (range: TimeRange) => void;
  title: string;
}

const InverterPerformanceChart: React.FC<Props> = ({ data, timeRange, onTimeRangeChange, title }) => {
  
  const filteredData = useMemo(() => {
    if (data.length === 0) return [];
    const sortedData = [...data].sort((a, b) => a.month.localeCompare(b.month));
    
    if (timeRange === 'ALL') return sortedData;
    if (timeRange === '6M') return sortedData.slice(-6);
    if (timeRange === '12M') return sortedData.slice(-12);
    return sortedData;
  }, [data, timeRange]);

  return (
    <div className="w-full bg-solar-card p-4 rounded-lg shadow-lg border border-solar-border">
      <div className="flex flex-col md:flex-row justify-between items-center mb-4 gap-4">
        <h3 className="text-lg font-semibold text-solar-text">{title}</h3>
        
        <div className="flex items-center bg-solar-bg rounded-lg border border-solar-border p-1 px-2">
            <span className="text-xs text-gray-400 px-2 uppercase font-bold">Timeline</span>
            {(['6M', '12M', 'ALL'] as TimeRange[]).map(range => (
              <button
                key={range}
                onClick={() => onTimeRangeChange(range)}
                className={`px-3 py-1 text-xs rounded font-medium transition ${timeRange === range ? 'bg-solar-success text-black' : 'text-gray-300 hover:bg-gray-700'}`}
              >
                {range}
              </button>
            ))}
        </div>
      </div>

      <div style={{ width: '100%', height: 400 }}>
        <ResponsiveContainer>
          <LineChart
            data={filteredData}
            margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#415A77" opacity={0.2} />
            <XAxis dataKey="month" stroke="#E0E1DD" tickFormatter={(tick) => formatXAxis(tick, filteredData)} />
            <YAxis stroke="#E0E1DD" tickFormatter={(val) => formatEnergy(val)} label={{ value: 'Energy (kWh)', angle: -90, position: 'insideLeft', fill: '#E0E1DD' }}/>
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            <Line 
                type="monotone" 
                dataKey="actualEnergy" 
                name="Actual Generation" 
                stroke="#34D399" 
                strokeWidth={3}
                activeDot={{ r: 8 }} 
            />
            <Line 
                type="monotone" 
                dataKey="theoreticalEnergy" 
                name="Theoretical Max" 
                stroke="#FFD700" 
                strokeWidth={2}
                strokeDasharray="5 5"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default InverterPerformanceChart;
