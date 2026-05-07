
import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Inverter } from '../types';

interface ChartData {
  month: string;
  [key: string]: string | number;
}

interface Props {
  data: ChartData[];
  inverters: Inverter[];
}

const COLORS = ['#FFD700', '#34D399', '#63B3ED', '#EF4444', '#A78BFA', '#FBBF24', '#F472B6', '#14B8A6'];

const formatEnergy = (value: number) => {
  if (value >= 1000) return `${(value / 1000).toFixed(1)} MWh`;
  return `${value.toFixed(0)} kWh`;
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-solar-bg border border-solar-border p-3 rounded shadow-xl text-solar-text text-sm z-50">
        <p className="font-bold mb-2">{label}</p>
        <div className="space-y-1">
          {payload.sort((a: any, b: any) => b.value - a.value).map((p: any, index: number) => (
            <div key={index} className="flex items-center justify-between gap-4">
              <span style={{ color: p.color }}>● {p.name}:</span>
              <span className="font-mono font-bold">{p.value.toLocaleString()} kWh</span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  return null;
};

const InverterComparisonChart: React.FC<Props> = ({ data, inverters }) => {
  if (!data || data.length === 0) {
    return <div className="text-center text-gray-500 py-10">Not enough data to display chart.</div>;
  }

  return (
    <div className="w-full h-80">
        <ResponsiveContainer>
            <LineChart data={data} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                <CartesianGrid stroke="#415A77" strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="month" stroke="#E0E1DD" fontSize={12} tickMargin={5} />
                <YAxis stroke="#E0E1DD" fontSize={12} tickFormatter={formatEnergy} />
                <Tooltip content={<CustomTooltip />} />
                <Legend iconSize={10} />
                {inverters.map((inv, index) => (
                    <Line
                        key={inv.name}
                        type="monotone"
                        dataKey={inv.name}
                        stroke={COLORS[index % COLORS.length]}
                        strokeWidth={2}
                        dot={{ r: 3 }}
                        activeDot={{ r: 6 }}
                    />
                ))}
            </LineChart>
        </ResponsiveContainer>
    </div>
  );
};

export default InverterComparisonChart;
