
import React from 'react';
import { Camera } from '../types';

interface Props {
  camera: Camera;
  onMaximize?: () => void;
}

const CameraTile: React.FC<Props> = ({ camera, onMaximize }) => {
  const isInactive = camera.isActive === false;
  const hasIframeStream = !!camera.streamUrl && /^https?:\/\//.test(camera.streamUrl);
  const isVideoFile = !!camera.streamUrl && /\.(mp4|webm)(\?.*)?$/.test(camera.streamUrl);

  return (
    <div className="group relative bg-gradient-to-br from-gray-800 to-gray-950 aspect-video rounded-lg overflow-hidden border border-solar-border shadow-lg">
      {/* Status indicator */}
      {isInactive ? (
        <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5 bg-gray-600/90 px-2 py-0.5 rounded text-xs font-bold text-white">
          <span className="w-2 h-2 rounded-full bg-gray-300"></span>
          OFFLINE
        </div>
      ) : (
        <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5 bg-red-600/90 px-2 py-0.5 rounded text-xs font-bold text-white">
          <span className="w-2 h-2 rounded-full bg-white animate-pulse"></span>
          LIVE
        </div>
      )}

      {/* Maximize button */}
      {onMaximize && (
        <button
          onClick={onMaximize}
          className="absolute top-3 right-3 z-10 bg-black/60 hover:bg-solar-accent hover:text-solar-bg text-white p-1.5 rounded transition opacity-70 group-hover:opacity-100"
          title="Open in large view"
          aria-label="Open in large view"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-5h-4m4 0v4m0-4l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
          </svg>
        </button>
      )}

      {/* Stream / placeholder */}
      {isInactive ? (
        <div className="w-full h-full flex flex-col items-center justify-center relative bg-gradient-to-br from-gray-900 to-black">
          <div
            className="absolute inset-0 opacity-10"
            style={{
              backgroundImage:
                'linear-gradient(rgba(115, 115, 115, 0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(115, 115, 115, 0.3) 1px, transparent 1px)',
              backgroundSize: '32px 32px',
            }}
          />
          <svg xmlns="http://www.w3.org/2000/svg" className="h-14 w-14 text-gray-700 relative" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
          </svg>
          <p className="text-xs text-gray-500 mt-3 relative uppercase tracking-wider">Camera offline</p>
        </div>
      ) : isVideoFile ? (
        <video src={camera.streamUrl} className="w-full h-full object-cover" autoPlay loop muted playsInline />
      ) : hasIframeStream ? (
        <iframe
          src={camera.streamUrl}
          className="w-full h-full border-0"
          title={camera.name}
          allow="autoplay; encrypted-media"
          allowFullScreen
        />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center relative">
          <div
            className="absolute inset-0 opacity-20"
            style={{
              backgroundImage:
                'linear-gradient(rgba(65, 90, 119, 0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(65, 90, 119, 0.3) 1px, transparent 1px)',
              backgroundSize: '32px 32px',
            }}
          />
          <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-gray-700 relative" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          <p className="text-xs text-gray-500 mt-3 relative">No stream configured</p>
        </div>
      )}

      {/* Name + location overlay */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-3 z-10">
        <p className={`font-semibold text-sm ${isInactive ? 'text-gray-400' : 'text-white'}`}>{camera.name}</p>
        {camera.location && <p className="text-xs text-gray-400">{camera.location}</p>}
      </div>
    </div>
  );
};

export default CameraTile;
