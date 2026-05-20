/**
 * Display formatters used across the dashboards.
 *
 * Currency stays in Indian numbering (₹, Lakhs, Crores) because that's how the
 * tariff and revenue figures are naturally read here. Energy values use SI
 * (kWh / MWh / GWh) so they match what the SolisCloud dashboard shows — Indian
 * numbering would render generation as "84.89 L kWh", which is the same as
 * "8.49 GWh" but harder to compare against Solis at a glance.
 */

/** Format an INR amount in Indian numbering (k / L / Cr). */
export function formatINR(amount: number): string {
  if (amount === undefined || amount === null || isNaN(amount)) return '-';
  const abs = Math.abs(amount);
  if (abs >= 10_000_000) return `₹${(amount / 10_000_000).toFixed(2)} Cr`;
  if (abs >= 100_000) return `₹${(amount / 100_000).toFixed(2)} L`;
  if (abs >= 1_000) return `₹${(amount / 1_000).toFixed(1)}k`;
  return `₹${amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

/** Format a kWh-scale energy value in SI units (kWh / MWh / GWh). */
export function formatEnergyKWh(kWh: number): { value: string; unit: 'kWh' | 'MWh' | 'GWh' } {
  if (kWh === undefined || kWh === null || isNaN(kWh)) return { value: '-', unit: 'kWh' };
  const abs = Math.abs(kWh);
  if (abs >= 1_000_000) return { value: (kWh / 1_000_000).toFixed(2), unit: 'GWh' };
  if (abs >= 1_000) return { value: (kWh / 1_000).toFixed(2), unit: 'MWh' };
  return { value: kWh.toLocaleString(undefined, { maximumFractionDigits: 0 }), unit: 'kWh' };
}

/** Convenience: render an energy value as a single string, e.g. "8.49 GWh". */
export function formatEnergyKWhString(kWh: number): string {
  const { value, unit } = formatEnergyKWh(kWh);
  return value === '-' ? '-' : `${value} ${unit}`;
}
