
export type UserRole = 'admin' | 'operations' | 'viewer';

export interface User {
  username: string;
  role: UserRole;
  fullName?: string;
  email?: string;
  contact?: string;
  isActive?: boolean;
}

export interface ModuleBuild {
  id: string;
  name: string;
  wp: number;
  area: number;
  degradation: {
    firstYear: number;
    subsequentYears: number;
  };
}

export interface Inverter {
  name: string;
  kwac: number; // Fixed AC capacity
  solisSn?: string; // Kept for backward compatibility / reference
  deviceSn?: string; // The primary SN from the API
  psKey?: string; // The unique device key from the API for real-time data
  moduleCount?: number;
  moduleBuildId?: string;
}

export interface MonthlyData {
  month: string; // YYYY-MM format
  electricityImportedKWh: number; // Project-level as per requirement
  targetNetKWhP50: number; // Project-level P50 target, retained

  // Inverter-specific data. Each array's index corresponds to the project's inverters array.
  inverterExportKWh: number[];
  inverterTargetOMKWh: number[];
  inverterIrradiation: number[];
  inverterDcCapacityKW: number[]; // Was already inverter-specific
}

export enum BreakdownReason {
  GRID_FAILURE = 'Grid Failure',
  GRID_OVER_VOLTAGE = 'Grid Over Voltage',
  GRID_UNDER_VOLTAGE = 'Grid Under Voltage',
  TRANSMISSION_LINE = 'Transmission Line Breakdown',
  PLANT_BREAKDOWN = 'Plant Breakdown',
  OTHER = 'Other'
}

export interface BreakdownEvent {
  id: string; // Unique ID for the event
  inverterName: string; // Link to the specific inverter
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  reason: BreakdownReason;
  notes?: string;
  giiAtStart: number; // GII (Global Horizontal Irradiance) in kWh/m^2
  giiAtEnd: number; // GII in kWh/m^2
}

export type SiteStatus = 'operational' | 'under-construction';

export interface Camera {
  id: string;
  name: string;
  location?: string;
  streamUrl?: string;
  isActive?: boolean;
}

export interface Project {
  projectCode: string;
  projectState: string;
  projectName: string;
  projectOwner: string;
  dateOfCommissioning: string; // ISO String
  tariff: number; // Project-level fixed tariff
  plantId?: number; // Corresponding Plant ID from SolisCloud API
  /**
   * SolisCloud's authoritative lifetime generation (kWh). Set by the backend
   * sync and used for the ALL-timeline "Total Generation" KPI so the number
   * matches what SolisCloud's own dashboard reports — sum of per-month export
   * can under-count when inverters have been replaced or the plant generated
   * before being registered on SolisCloud.
   */
  lifetimeKWh?: number;
  inverters: Inverter[];
  monthlyData: Record<string, MonthlyData>; // Keyed by YYYY-MM
  breakdownEvents?: BreakdownEvent[];
}

export interface KPIResult {
  totalCapacityKWac: number;
  totalCapacityKWdc: number; // This will now be the *latest* dynamic DC capacity
  tariff: number;
  totalExport: number;
  totalImport: number;
  netEnergy: number;
  revenue: number;
  targetRevenue: number; // Based on O&M Target
  yield: number; // kWh / kW
  pr: number; // Performance Ratio %
  cuf: number; // AC CUF %
  dcCuf: number; // DC CUF %
  co2Reduction: number; // Tons
  targetP50: number;
  targetOM: number; // O&M Target
  totalDays: number;
  averageDailyYield: number; // kWh/kW/day
}

export interface InverterKPIResult extends Omit<KPIResult, 'totalImport' | 'targetP50' | 'netEnergy'> {
  totalTheoreticalEnergy: number;
}

export interface BreakdownStats {
  totalBreakdownDurationMinutes: number;
  totalGenerationLossKwh: number;
  totalGiiLoss: number;
  availabilityPercent: number;
  byReason: {
    [key in BreakdownReason]?: {
      durationMinutes: number;
      giiLoss: number;
      generationLossKwh: number;
      count: number;
    }
  };
}

export type SolisRealTimeData = {
  [pointId: string]: {
    value: number | string;
    unit: string;
    name: string;
  }
}

export type TimeRange = '6M' | '12M' | 'ALL';

export interface ChartDataPoint {
  month: string;
  actualEnergy: number;
  targetEnergyP50: number;
  targetEnergyOM: number;
  theoreticalEnergy?: number; // Added for inverter chart
  revenue: number;
  targetRevenueP50: number;
  targetRevenueOM: number;
  // Growth metrics for Tooltip
  energyMom?: number;
  energyYoy?: number;
  revenueMom?: number;
  revenueYoy?: number;
  // Technical Monthly KPIs
  dcCuf?: number;
  pr?: number;
  yield?: number;
  // History for comparisons
  history?: { year: number; energy: number }[];
}
