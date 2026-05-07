
export const CO2_FACTOR = 0.82; // tons per MWh
export const SYSTEM_EFFICIENCY = 0.85; // Standard efficiency factor for theoretical generation calculation

export const SOLIS_API_PATHS = {
  // Note: These are relative paths, the base URL will be configured in settings.
  queryPowerStationList: '/openapi/platform/queryPowerStationList',
  getDeviceListByPsld: '/openapi/platform/getDeviceListByPsld',
  getDeviceRealTimeData: '/openapi/platform/getDeviceRealTimeData',
};

// Based on the provided API documentation for Inverters (Device Type 1)
export const SOLIS_POINT_IDS = {
  YIELD_TODAY: '1',
  YIELD_TOTAL: '2',
  INTERNAL_AIR_TEMP: '4',
  MPPT1_VOLTAGE: '5',
  MPPT1_CURRENT: '6',
  MPPT2_VOLTAGE: '7',
  MPPT2_CURRENT: '8',
  TOTAL_DC_POWER: '14',
  PHASE_A_VOLTAGE: '18',
  PHASE_B_VOLTAGE: '19',
  PHASE_C_VOLTAGE: '20',
  PHASE_A_CURRENT: '21',
  PHASE_B_CURRENT: '22',
  PHASE_C_CURRENT: '23',
  TOTAL_ACTIVE_POWER: '24',
  GRID_FREQUENCY: '27',
  OPERATING_STATUS: '29',
};
