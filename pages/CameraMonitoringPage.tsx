
import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { SiteStatus, Camera } from '../types';
import { useAuth } from '../context/AuthContext';
import CameraTile from '../components/CameraTile';
import CameraDetailModal from '../components/CameraDetailModal';

interface MockCameraSite {
  projectName: string;
  projectState: string;
  siteStatus: SiteStatus;
  cameras: Camera[];
}

const MOCK_CAMERA_SITES: MockCameraSite[] = [
  {
    projectName: 'Gurgaon Commercial Rooftop',
    projectState: 'Haryana',
    siteStatus: 'operational',
    cameras: [
      { id: 'cam-ggn-01', name: 'Rooftop North', location: 'North Wing', isActive: true },
      { id: 'cam-ggn-02', name: 'Rooftop South', location: 'South Wing', isActive: true },
      { id: 'cam-ggn-03', name: 'Inverter Room', location: 'Ground Floor', isActive: false },
      { id: 'cam-ggn-04', name: 'Main Gate', location: 'Entry Plaza', isActive: true },
    ],
  },
  {
    projectName: 'Bhadla Solar Park (Phase IV)',
    projectState: 'Rajasthan',
    siteStatus: 'operational',
    cameras: [
      { id: 'cam-bhd-01', name: 'Field Block A', location: 'Sector 1', isActive: true },
      { id: 'cam-bhd-02', name: 'Field Block B', location: 'Sector 2', isActive: true },
      { id: 'cam-bhd-03', name: 'Field Block C', location: 'Sector 3', isActive: true },
      { id: 'cam-bhd-04', name: 'Inverter Yard', location: 'Central', isActive: false },
      { id: 'cam-bhd-05', name: 'Substation', location: 'East', isActive: true },
      { id: 'cam-bhd-06', name: 'Main Gate', location: 'South Boundary', isActive: true },
    ],
  },
  {
    projectName: 'Mumbai Industrial Park (Phase I)',
    projectState: 'Maharashtra',
    siteStatus: 'under-construction',
    cameras: [
      { id: 'cam-mh-01', name: 'Main Gate', location: 'Site Entrance', isActive: true },
      { id: 'cam-mh-02', name: 'Module Yard', location: 'Storage Area', isActive: true },
      { id: 'cam-mh-03', name: 'Crane Operations', location: 'Mounting Zone', isActive: true },
      { id: 'cam-mh-04', name: 'Workforce Camp', location: 'South Side', isActive: false },
      { id: 'cam-mh-05', name: 'Substation Build', location: 'East', isActive: true },
    ],
  },
  {
    projectName: 'Bangalore Tech Park Rooftop',
    projectState: 'Karnataka',
    siteStatus: 'under-construction',
    cameras: [
      { id: 'cam-ka-01', name: 'Rooftop North', location: 'North Block', isActive: true },
      { id: 'cam-ka-02', name: 'Rooftop South', location: 'South Block', isActive: true },
      { id: 'cam-ka-03', name: 'Material Storage', location: 'Ground Floor', isActive: false },
      { id: 'cam-ka-04', name: 'Main Lobby', location: 'Entry', isActive: true },
    ],
  },
];

const ROTATION_OPTIONS = [
  { label: '10 sec', value: 10 },
  { label: '15 sec', value: 15 },
  { label: '30 sec', value: 30 },
  { label: '1 min',  value: 60 },
  { label: '2 min',  value: 120 },
];

const CameraMonitoringPage: React.FC = () => {
  const { currentUser } = useAuth();
  const [mode, setMode] = useState<SiteStatus>('operational');
  const [currentSiteIdx, setCurrentSiteIdx] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [rotationInterval, setRotationInterval] = useState(15);
  const [selectedCamera, setSelectedCamera] = useState<Camera | null>(null);

  if (currentUser?.role !== 'admin' && currentUser?.role !== 'operations') {
    return (
      <div className="p-10 text-center text-white flex flex-col items-center justify-center">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-solar-danger mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
        <h2 className="text-2xl font-bold text-solar-danger mb-4">Access Denied</h2>
        <p className="text-gray-400 mb-6 max-w-md">Camera monitoring is available to admin and operations roles only.</p>
        <Link to="/" className="bg-solar-accent text-black font-bold px-6 py-2 rounded shadow hover:bg-yellow-400 transition-colors">← Back to Dashboard</Link>
      </div>
    );
  }

  const sitesForMode = useMemo(
    () => MOCK_CAMERA_SITES.filter(s => s.siteStatus === mode && s.cameras.length > 0),
    [mode],
  );

  const stats = useMemo(() => {
    const allCameras = MOCK_CAMERA_SITES.flatMap(s => s.cameras);
    const total = allCameras.length;
    const active = allCameras.filter(c => c.isActive !== false).length;
    const withStream = allCameras.filter(c => !!c.streamUrl).length;

    const opCams = MOCK_CAMERA_SITES.filter(s => s.siteStatus === 'operational').flatMap(s => s.cameras);
    const ucCams = MOCK_CAMERA_SITES.filter(s => s.siteStatus === 'under-construction').flatMap(s => s.cameras);

    return {
      total,
      active,
      inactive: total - active,
      withStream,
      opTotal: opCams.length,
      opActive: opCams.filter(c => c.isActive !== false).length,
      ucTotal: ucCams.length,
      ucActive: ucCams.filter(c => c.isActive !== false).length,
    };
  }, []);

  // Reset index when mode or sites list changes
  useEffect(() => {
    setCurrentSiteIdx(0);
  }, [mode, sitesForMode.length]);

  // Auto rotation (paused while a camera is maximized)
  useEffect(() => {
    if (isPaused || sitesForMode.length <= 1 || selectedCamera) return;
    const id = setInterval(() => {
      setCurrentSiteIdx(prev => (prev + 1) % sitesForMode.length);
    }, rotationInterval * 1000);
    return () => clearInterval(id);
  }, [isPaused, rotationInterval, sitesForMode.length, selectedCamera]);

  const currentSite = sitesForMode[currentSiteIdx];

  const goPrev = () => setCurrentSiteIdx(prev => (prev - 1 + sitesForMode.length) % sitesForMode.length);
  const goNext = () => setCurrentSiteIdx(prev => (prev + 1) % sitesForMode.length);

  const cameraGridClass = currentSite && currentSite.cameras.length > 4
    ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
    : 'grid-cols-1 sm:grid-cols-2';

  const tabBaseClass = 'px-4 py-2 rounded font-medium text-sm transition flex items-center gap-2';
  const activeTabClass = 'bg-solar-accent text-solar-bg';
  const inactiveTabClass = 'bg-solar-bg text-gray-300 hover:bg-solar-border';

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <header className="flex justify-between items-start gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Camera Monitoring</h1>
          <p className="text-solar-text">Live surveillance feeds across all sites. Auto-rotates between sites for HO display walls.</p>
        </div>
        <span className="text-xs bg-solar-bg border border-solar-border text-yellow-300 px-3 py-1.5 rounded">
          Preview — mock feed data
        </span>
      </header>

      {/* Camera health KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="bg-solar-card border border-solar-border rounded-lg p-4">
          <p className="kpi-label">Total Cameras</p>
          <p className="kpi-value text-white">{stats.total}</p>
        </div>
        <div className="bg-solar-card border border-solar-border rounded-lg p-4 border-l-2 border-l-solar-success">
          <p className="kpi-label">Active</p>
          <div className="flex items-baseline gap-2">
            <p className="kpi-value text-solar-success">{stats.active}</p>
            <p className="text-xs text-gray-400">
              {stats.total > 0 ? `${Math.round((stats.active / stats.total) * 100)}%` : '—'}
            </p>
          </div>
        </div>
        <div className="bg-solar-card border border-solar-border rounded-lg p-4 border-l-2 border-l-gray-500">
          <p className="kpi-label">Inactive</p>
          <div className="flex items-baseline gap-2">
            <p className="kpi-value text-gray-400">{stats.inactive}</p>
            <p className="text-xs text-gray-500">
              {stats.total > 0 ? `${Math.round((stats.inactive / stats.total) * 100)}%` : '—'}
            </p>
          </div>
        </div>
        <div className="bg-solar-card border border-solar-border rounded-lg p-4 border-l-2 border-l-solar-accent">
          <p className="kpi-label">Operational Cams</p>
          <div className="flex items-baseline gap-2">
            <p className="kpi-value text-solar-accent">{stats.opTotal}</p>
            <p className="text-xs text-gray-400">{stats.opActive} active</p>
          </div>
        </div>
        <div className="bg-solar-card border border-solar-border rounded-lg p-4 border-l-2 border-l-yellow-400">
          <p className="kpi-label">Under-Construction Cams</p>
          <div className="flex items-baseline gap-2">
            <p className="kpi-value text-yellow-300">{stats.ucTotal}</p>
            <p className="text-xs text-gray-400">{stats.ucActive} active</p>
          </div>
        </div>
      </div>

      {/* Mode tabs + controls */}
      <div className="bg-solar-card rounded-lg border border-solar-border p-4 space-y-4">
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setMode('operational')}
            className={`${tabBaseClass} ${mode === 'operational' ? activeTabClass : inactiveTabClass}`}
          >
            <span className="w-2 h-2 rounded-full bg-solar-success"></span>
            Operational Sites
            <span className="text-xs opacity-70 ml-1">
              ({MOCK_CAMERA_SITES.filter(s => s.siteStatus === 'operational').length})
            </span>
          </button>
          <button
            onClick={() => setMode('under-construction')}
            className={`${tabBaseClass} ${mode === 'under-construction' ? activeTabClass : inactiveTabClass}`}
          >
            <span className="w-2 h-2 rounded-full bg-yellow-400"></span>
            Under Construction
            <span className="text-xs opacity-70 ml-1">
              ({MOCK_CAMERA_SITES.filter(s => s.siteStatus === 'under-construction').length})
            </span>
          </button>
        </div>

        {sitesForMode.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <p>No {mode === 'under-construction' ? 'under-construction' : 'operational'} sites with cameras configured.</p>
          </div>
        ) : (
          <div className="flex justify-between items-center flex-wrap gap-3">
            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={goPrev}
                disabled={sitesForMode.length <= 1}
                className="p-2 rounded bg-solar-bg border border-solar-border text-gray-300 hover:text-white hover:border-solar-accent transition disabled:opacity-40 disabled:cursor-not-allowed"
                title="Previous site"
                aria-label="Previous site"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
              </button>
              <div className="min-w-[200px]">
                <p className="text-lg font-bold text-white leading-tight">{currentSite.projectName}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {currentSite.projectState} · {currentSite.cameras.filter(c => c.isActive !== false).length}/{currentSite.cameras.length} active · Site {currentSiteIdx + 1} of {sitesForMode.length}
                </p>
              </div>
              <button
                onClick={goNext}
                disabled={sitesForMode.length <= 1}
                className="p-2 rounded bg-solar-bg border border-solar-border text-gray-300 hover:text-white hover:border-solar-accent transition disabled:opacity-40 disabled:cursor-not-allowed"
                title="Next site"
                aria-label="Next site"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
              </button>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={rotationInterval}
                onChange={(e) => setRotationInterval(parseInt(e.target.value, 10))}
                className="bg-solar-bg border border-solar-border text-sm text-gray-300 rounded px-2 py-2 outline-none focus:border-solar-accent"
                disabled={sitesForMode.length <= 1}
              >
                {ROTATION_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>Rotate every {opt.label}</option>
                ))}
              </select>
              <button
                onClick={() => setIsPaused(p => !p)}
                disabled={sitesForMode.length <= 1}
                className="px-4 py-2 rounded bg-solar-bg border border-solar-border text-gray-300 hover:text-white hover:border-solar-accent transition flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isPaused ? (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                    Resume
                  </>
                ) : (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
                    Pause
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Rotation progress bar */}
        {sitesForMode.length > 1 && (
          <div className="h-1 bg-solar-bg overflow-hidden rounded">
            <div
              key={`${currentSiteIdx}-${rotationInterval}-${isPaused}-${mode}`}
              className="h-full bg-solar-accent"
              style={{
                width: isPaused ? '0%' : '100%',
                animation: isPaused ? 'none' : `cameraProgressBar ${rotationInterval}s linear`,
              }}
            />
          </div>
        )}
      </div>

      {/* Camera grid */}
      {currentSite && currentSite.cameras.length > 0 && (
        <div className={`grid gap-3 ${cameraGridClass}`}>
          {currentSite.cameras.map(camera => (
            <CameraTile
              key={camera.id}
              camera={camera}
              onMaximize={() => setSelectedCamera(camera)}
            />
          ))}
        </div>
      )}

      <CameraDetailModal
        isOpen={!!selectedCamera}
        camera={selectedCamera}
        project={currentSite ? { projectName: currentSite.projectName, projectState: currentSite.projectState } : null}
        onClose={() => setSelectedCamera(null)}
      />

      <style>{`
        @keyframes cameraProgressBar {
          from { width: 0%; }
          to { width: 100%; }
        }
        .kpi-label { color: #A0AEC0; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 500; margin-bottom: 0.25rem; }
        .kpi-value { font-size: 1.5rem; font-weight: bold; }
      `}</style>
    </div>
  );
};

export default CameraMonitoringPage;
