
import { Project, KPIResult, MonthlyData, TimeRange, ModuleBuild, Inverter, InverterKPIResult, BreakdownEvent, BreakdownReason, BreakdownStats } from '../types';
import { CO2_FACTOR, SYSTEM_EFFICIENCY } from '../constants';
import { getModuleBuilds } from './moduleBuildService';

const STORAGE_KEY = 'helios_mis_data_v4'; 

// --- Normalization ---
const normalizeProject = (p: any): Project => ({
  projectCode: p.projectCode || 'N/A',
  projectState: p.projectState || 'N/A',
  projectName: p.projectName || 'Unnamed Project',
  projectOwner: p.projectOwner || 'N/A',
  dateOfCommissioning: p.dateOfCommissioning || new Date().toISOString(),
  tariff: p.tariff || 0,
  inverters: p.inverters || [],
  monthlyData: p.monthlyData || {},
  breakdownEvents: p.breakdownEvents || [],
  siteStatus: p.siteStatus === 'under-construction' ? 'under-construction' : 'operational',
  cameras: p.cameras || [],
});

// --- Calculations ---

export const calculateProjectStaticCapacity = (project: Project) => {
  const totalKWac = (project.inverters || []).reduce((sum, inv) => sum + inv.kwac, 0);
  return { totalKWac };
};

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
  
  months.forEach(m => {
    const year = parseInt(m.month.split('-')[0]);
    const month = parseInt(m.month.split('-')[1]);
    const daysInMonth = new Date(year, month, 0).getDate();
    const hours = daysInMonth * 24;
    totalDays += daysInMonth;

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
            const degradedArea = inv.moduleCount * build.area * degradationFactor;

            return sum + (irradiation * degradedArea);
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
  
  months.forEach(m => {
    const year = parseInt(m.month.split('-')[0]);
    const month = parseInt(m.month.split('-')[1]);
    const daysInMonth = new Date(year, month, 0).getDate();
    const hours = daysInMonth * 24;
    totalDays += daysInMonth;

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
        const degradedArea = inverter.moduleCount * build.area * degradationFactor;
        prDenominator += irradiation * degradedArea;
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


// --- Storage Service (Local Storage Only) ---

export const loadProjects = async (): Promise<Project[]> => {
  const localData = getProjectsFromLocalStorage();
  if (localData.length > 0) {
    console.log("Loaded data from local storage.");
    return localData;
  }

  console.log("No local data found. Generating fresh mock data.");
  const dummyData = createDummyProjects();
  await saveProjects(dummyData);
  return dummyData;
};

const getProjectsFromLocalStorage = (): Project[] => {
   try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const data = JSON.parse(stored);
      if (Array.isArray(data) && data.length > 0) {
        return data.map(normalizeProject);
      }
    }
  } catch (e) {
    console.error("Failed to load from local storage", e);
  }
  return [];
}

export const saveProjects = async (projects: Project[]) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
    console.log('Projects saved to local storage.');
  } catch (e) {
    console.error("Failed to save to local storage", e);
  }
};


// ====================================================================================
// ========================== DUMMY DATA GENERATION ===================================
// ====================================================================================
const createDummyProjects = (): Project[] => {
  console.log("Generating enhanced dummy project data for first-time setup...");
  const moduleBuilds = getModuleBuilds();
  const defaultBuildId = moduleBuilds.length > 0 ? moduleBuilds[0].id : undefined;

  const generateMonthlyData = (
    doc: Date,
    inverters: { name: string, kwac: number, moduleCount?: number }[],
    projectCode: string
  ): Record<string, MonthlyData> => {
    const data: Record<string, MonthlyData> = {};
    const today = new Date();
    const currentMonth = new Date(doc.getFullYear(), doc.getMonth(), 1);

    const anomalyDate = new Date();
    anomalyDate.setMonth(anomalyDate.getMonth() - 2);
    const anomalyMonthKey = `${anomalyDate.getFullYear()}-${String(anomalyDate.getMonth() + 1).padStart(2, '0')}`;

    while (currentMonth <= today) {
      const monthKey = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}`;
      const monthNum = currentMonth.getMonth() + 1;
      const seasonalFactor = 1 - (Math.abs(6.5 - monthNum) / 5.5) * 0.4;

      const monthData: MonthlyData = {
        month: monthKey,
        electricityImportedKWh: 0,
        targetNetKWhP50: 0,
        inverterExportKWh: [],
        inverterTargetOMKWh: [],
        inverterIrradiation: [],
        inverterDcCapacityKW: [],
      };

      let projectImport = 0;
      let projectTargetP50 = 0;

      inverters.forEach(inv => {
        const randomFactor = 0.9 + Math.random() * 0.2;
        const dailyGen = inv.kwac * 4.2 * seasonalFactor * randomFactor;
        let monthlyGen = Math.round(dailyGen * 30);
        
        if (projectCode === 'TALF-GGN-01' && inv.name === 'GGN-INV-02' && monthKey === anomalyMonthKey) {
          monthlyGen = 0;
        }

        const monthlyTargetOM = Math.round(dailyGen * 30 * 0.95);
        const monthlyTargetP50 = Math.round(monthlyTargetOM * 1.05);
        
        const dcCapacity = (inv.moduleCount || 0) * 0.540;

        monthData.inverterExportKWh.push(monthlyGen);
        monthData.inverterTargetOMKWh.push(monthlyTargetOM);
        monthData.inverterIrradiation.push(Math.round((130 + Math.random() * 40) * seasonalFactor * (dcCapacity / (inv.kwac * 1.2))));
        monthData.inverterDcCapacityKW.push(dcCapacity);
        
        projectImport += Math.round(monthlyGen * 0.02 * Math.random());
        projectTargetP50 += monthlyTargetP50;
      });
      
      monthData.electricityImportedKWh = projectImport;
      monthData.targetNetKWhP50 = projectTargetP50;
      data[monthKey] = monthData;
      currentMonth.setMonth(currentMonth.getMonth() + 1);
    }
    return data;
  };

  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const fiveDaysAgo = new Date();
  fiveDaysAgo.setDate(today.getDate() - 5);

  const formatDate = (d: Date) => d.toISOString().split('T')[0];
  
  const projects: Project[] = [
    {
      projectCode: 'TALF-GGN-01',
      projectName: 'Gurgaon Commercial Rooftop',
      projectState: 'Haryana',
      projectOwner: 'Talf Solar',
      dateOfCommissioning: '2022-04-15T00:00:00.000Z',
      tariff: 4.75,
      siteStatus: 'operational',
      inverters: [
        { name: 'GGN-INV-01', kwac: 50, moduleCount: 120, moduleBuildId: defaultBuildId, solisSn: '1234567890123', psKey: 'pskey-ggn-01' },
        { name: 'GGN-INV-02', kwac: 50, moduleCount: 120, moduleBuildId: defaultBuildId, psKey: 'pskey-ggn-02' },
        { name: 'GGN-INV-03', kwac: 25, moduleCount: 60, moduleBuildId: defaultBuildId, psKey: 'pskey-ggn-03' },
      ],
      monthlyData: {},
      breakdownEvents: [
        { id: 'bd-1', inverterName: 'GGN-INV-02', date: formatDate(fiveDaysAgo), startTime: '11:30', endTime: '13:00', reason: BreakdownReason.GRID_FAILURE, giiAtStart: 2.1, giiAtEnd: 2.8, notes: 'Feeder E-11 tripped.'},
        { id: 'bd-2', inverterName: 'GGN-INV-02', date: formatDate(yesterday), startTime: '14:00', endTime: '14:20', reason: BreakdownReason.PLANT_BREAKDOWN, giiAtStart: 3.5, giiAtEnd: 3.7, notes: 'ACDB fuse blown, replaced.'},
        { id: 'bd-3', inverterName: 'GGN-INV-01', date: formatDate(yesterday), startTime: '09:15', endTime: '10:45', reason: BreakdownReason.GRID_OVER_VOLTAGE, giiAtStart: 1.1, giiAtEnd: 1.9},
      ],
      cameras: [
        { id: 'cam-ggn-01', name: 'Rooftop North',  location: 'North Wing',     isActive: true },
        { id: 'cam-ggn-02', name: 'Rooftop South',  location: 'South Wing',     isActive: true },
        { id: 'cam-ggn-03', name: 'Inverter Room',  location: 'Ground Floor',   isActive: false },
        { id: 'cam-ggn-04', name: 'Main Gate',      location: 'Entry Plaza',    isActive: true },
      ],
    },
    {
      projectCode: 'TALF-RJ-01',
      projectName: 'Bhadla Solar Park (Phase IV)',
      projectState: 'Rajasthan',
      projectOwner: 'Talf Solar',
      dateOfCommissioning: '2023-11-01T00:00:00.000Z',
      tariff: 2.15,
      siteStatus: 'operational',
      inverters: [
        { name: 'BHD-INV-01', kwac: 100, moduleCount: 240, moduleBuildId: defaultBuildId, psKey: 'pskey-bhd-01' },
        { name: 'BHD-INV-02', kwac: 100, moduleCount: 240, moduleBuildId: defaultBuildId, psKey: 'pskey-bhd-02' },
        { name: 'BHD-INV-03', kwac: 100, moduleCount: 240, moduleBuildId: defaultBuildId, psKey: 'pskey-bhd-03' },
        { name: 'BHD-INV-04', kwac: 100, moduleCount: 240, moduleBuildId: defaultBuildId, psKey: 'pskey-bhd-04' },
      ],
      monthlyData: {},
      breakdownEvents: [],
      cameras: [
        { id: 'cam-bhd-01', name: 'Field Block A',   location: 'Sector 1',        isActive: true },
        { id: 'cam-bhd-02', name: 'Field Block B',   location: 'Sector 2',        isActive: true },
        { id: 'cam-bhd-03', name: 'Field Block C',   location: 'Sector 3',        isActive: true },
        { id: 'cam-bhd-04', name: 'Inverter Yard',   location: 'Central',         isActive: true },
        { id: 'cam-bhd-05', name: 'Substation',      location: 'East',            isActive: true },
        { id: 'cam-bhd-06', name: 'Main Gate',       location: 'South Boundary',  isActive: true },
      ],
    },
    {
      projectCode: 'TALF-DL-RES-01',
      projectName: 'Delhi Residential Rooftop',
      projectState: 'Delhi',
      projectOwner: 'Private Owner',
      dateOfCommissioning: '2023-01-20T00:00:00.000Z',
      tariff: 5.50,
      siteStatus: 'operational',
      inverters: [
        { name: 'DL-INV-01', kwac: 10, moduleCount: 22, moduleBuildId: defaultBuildId, psKey: 'pskey-dl-01' },
      ],
      monthlyData: {},
      breakdownEvents: [],
      cameras: [
        { id: 'cam-dl-01', name: 'Rooftop',         location: 'Terrace',     isActive: true },
        { id: 'cam-dl-02', name: 'Front Gate',      location: 'Entry',       isActive: true },
        { id: 'cam-dl-03', name: 'Inverter Cabinet',location: 'Side Wall',   isActive: true },
        { id: 'cam-dl-04', name: 'Garage',          location: 'Driveway',    isActive: true },
      ],
    },
    {
      projectCode: 'TALF-MH-UC-01',
      projectName: 'Mumbai Industrial Park (Phase I)',
      projectState: 'Maharashtra',
      projectOwner: 'Talf Solar',
      dateOfCommissioning: '2026-09-15T00:00:00.000Z',
      tariff: 3.80,
      siteStatus: 'under-construction',
      inverters: [
        { name: 'MH-INV-01', kwac: 250, moduleCount: 600, moduleBuildId: defaultBuildId },
        { name: 'MH-INV-02', kwac: 250, moduleCount: 600, moduleBuildId: defaultBuildId },
      ],
      monthlyData: {},
      breakdownEvents: [],
      cameras: [
        { id: 'cam-mh-01', name: 'Main Gate',         location: 'Site Entrance',   isActive: true },
        { id: 'cam-mh-02', name: 'Module Yard',       location: 'Storage Area',    isActive: true },
        { id: 'cam-mh-03', name: 'Crane Operations',  location: 'Mounting Zone',   isActive: true },
        { id: 'cam-mh-04', name: 'Workforce Camp',    location: 'South Side',      isActive: false },
        { id: 'cam-mh-05', name: 'Substation Build',  location: 'East',            isActive: true },
      ],
    },
    {
      projectCode: 'TALF-KA-UC-01',
      projectName: 'Bangalore Tech Park Rooftop',
      projectState: 'Karnataka',
      projectOwner: 'Talf Solar',
      dateOfCommissioning: '2026-07-01T00:00:00.000Z',
      tariff: 4.20,
      siteStatus: 'under-construction',
      inverters: [
        { name: 'KA-INV-01', kwac: 75, moduleCount: 180, moduleBuildId: defaultBuildId },
        { name: 'KA-INV-02', kwac: 75, moduleCount: 180, moduleBuildId: defaultBuildId },
      ],
      monthlyData: {},
      breakdownEvents: [],
      cameras: [
        { id: 'cam-ka-01', name: 'Rooftop North',     location: 'North Block',    isActive: true },
        { id: 'cam-ka-02', name: 'Rooftop South',     location: 'South Block',    isActive: true },
        { id: 'cam-ka-03', name: 'Material Storage',  location: 'Ground Floor',   isActive: true },
        { id: 'cam-ka-04', name: 'Main Lobby',        location: 'Entry',          isActive: true },
      ],
    },
  ];

  projects.forEach(p => {
    p.monthlyData = generateMonthlyData(new Date(p.dateOfCommissioning), p.inverters, p.projectCode);
  });

  return projects;
};
