
import React from 'react';
import { AreaChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface DailyDataPoint {
  time: string;
  [key: string]: number | string;
}

interface Series {
    key: string;
    name: string;
    color: string;
    type: 'area' | 'line';
}

interface Props {
  data: DailyDataPoint[];
  series: Series[];
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-solar-bg border border-solar-border p-2 rounded shadow-xl text-solar-text text-sm z-50">
        <p className="font-bold">{label}</p>
        {payload.map((p: any) => (
             <p key={p.name} style={{ color: p.stroke }}>{p.name}: {Number(p.value).toFixed(2)} kW</p>
        ))}
      </div>
    );
  }
  return null;
};

const DailyGenerationChart: React.FC<Props> = ({ data, series }) => {
  return (
    <div className="w-full h-64">
      <ResponsiveContainer>
        <AreaChart
          data={data}
          margin={{
            top: 10,
            right: 30,
            left: 0,
            bottom: 0,
          }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#415A77" opacity={0.2} />
          <XAxis 
            dataKey="time" 
            stroke="#E0E1DD" 
            fontSize={12} 
            tickMargin={5} 
            interval={data.length > 24 ? Math.floor(data.length / 12) : 3} 
          />
          <YAxis 
            stroke="#E0E1DD" 
            fontSize={12} 
            unit=" kW"
            label={{ value: 'Power (kW)', angle: -90, position: 'insideLeft', fill: '#E0E1DD', fontSize: 12, dy: -10 }} 
          />
          <Tooltip content={<CustomTooltip />} />
          <defs>
            {series.filter(s => s.type === 'area').map(s => (
                <linearGradient key={s.key} id={`color-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={s.color} stopOpacity={0.8}/>
                    <stop offset="95%" stopColor={s.color} stopOpacity={0}/>
                </linearGradient>
            ))}
          </defs>
          
          {series.map(s => {
            if (s.type === 'area') {
                return <Area key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color} fillOpacity={1} fill={`url(#color-${s.key})`} />
            }
            return <Line key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2} dot={false} activeDot={{r: 6}} />
          })}

        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

export default DailyGenerationChart;
