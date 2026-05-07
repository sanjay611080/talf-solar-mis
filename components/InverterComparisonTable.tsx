
import React, { useState, useMemo } from 'react';
import { InverterKPIResult } from '../types';

interface InverterStats extends InverterKPIResult {
  name: string;
}

interface Props {
  data: InverterStats[];
}

const SortIcon = ({ direction }: { direction: 'asc' | 'desc' | null }) => {
  if (!direction) return <span className="text-gray-600 ml-1 opacity-0 group-hover:opacity-50">⇅</span>;
  return <span className="text-solar-accent ml-1">{direction === 'asc' ? '▲' : '▼'}</span>;
};

const formatNumber = (val: number, digits = 1) => val.toLocaleString(undefined, { maximumFractionDigits: digits });

const InverterComparisonTable: React.FC<Props> = ({ data }) => {
  const [sortConfig, setSortConfig] = useState<{ key: keyof InverterStats | string; direction: 'asc' | 'desc' | null }>({ key: 'totalExport', direction: 'desc' });

  const sortedData = useMemo(() => {
    if (!sortConfig.key || !sortConfig.direction) return data;

    return [...data].sort((a, b) => {
      const valA = (a as any)[sortConfig.key];
      const valB = (b as any)[sortConfig.key];
      
      if (typeof valA === 'string') {
        return sortConfig.direction === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return sortConfig.direction === 'asc' ? valA - valB : valB - valA;
    });
  }, [data, sortConfig]);

  const handleSort = (key: keyof InverterStats | string) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  if (!data || data.length === 0) {
    return <div className="text-center text-gray-500 py-10">No inverter data available for this period.</div>;
  }

  const renderHeader = (label: string, key: keyof InverterStats | string) => (
    <th className="table-cell-inv cursor-pointer group" onClick={() => handleSort(key)}>
      {label}
      <SortIcon direction={sortConfig.key === key ? sortConfig.direction : null} />
    </th>
  );

  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="table-header-inv">
          <tr>
            {renderHeader('Inverter', 'name')}
            {renderHeader('Generation (kWh)', 'totalExport')}
            {renderHeader('Avg PR (%)', 'pr')}
            {renderHeader('Avg DC CUF (%)', 'dcCuf')}
            {renderHeader('Yield (kWh/kW)', 'yield')}
          </tr>
        </thead>
        <tbody className="divide-y divide-solar-border">
          {sortedData.map((inv, idx) => (
            <tr key={idx} className="hover:bg-solar-bg">
              <td className="p-3 font-medium text-solar-accent">{inv.name}</td>
              <td className="p-3 text-right font-mono text-solar-success">{formatNumber(inv.totalExport, 0)}</td>
              <td className="p-3 text-right font-mono text-blue-300">{formatNumber(inv.pr)}%</td>
              <td className="p-3 text-right font-mono text-teal-300">{formatNumber(inv.dcCuf)}%</td>
              <td className="p-3 text-right font-mono">{formatNumber(inv.yield, 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <style>{`
        .table-header-inv { background-color: #0D1B2A; color: #A0AEC0; text-transform: uppercase; font-size: 0.7rem; letter-spacing: 0.05em; }
        .table-cell-inv { padding: 0.5rem 0.75rem; text-align: right; }
        .table-cell-inv:first-child { text-align: left; }
      `}</style>
    </div>
  );
};

export default InverterComparisonTable;
