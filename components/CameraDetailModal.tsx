
import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Camera, Project } from '../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  camera: Camera | null;
  project: Project | null;
}

const CameraDetailModal: React.FC<Props> = ({ isOpen, onClose, camera, project }) => {
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen || !camera) return null;

  const isInactive = camera.isActive === false;
  const hasIframeStream = !!camera.streamUrl && /^https?:\/\//.test(camera.streamUrl);
  const isVideoFile = !!camera.streamUrl && /\.(mp4|webm)(\?.*)?$/.test(camera.streamUrl);

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 backdrop-blur-sm p-4 sm:p-8"
      onClick={onClose}
    >
      <div
        className="w-full max-w-7xl flex flex-col gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-start gap-4">
          <div className="min-w-0">
            <p className="text-xl sm:text-2xl font-bold text-white truncate">{camera.name}</p>
            <p className="text-sm text-gray-400 truncate">
              {project && <span>{project.projectName} · {project.projectState}</span>}
              {camera.location && project && <span> · </span>}
              {camera.location && <span>{camera.location}</span>}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white p-2 rounded transition shrink-0"
            aria-label="Close"
            title="Close (Esc)"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Large viewport */}
        <div className="relative bg-gradient-to-br from-gray-800 to-gray-950 aspect-video rounded-lg overflow-hidden border border-solar-border shadow-2xl">
          {isInactive ? (
            <div className="absolute top-4 left-4 z-10 flex items-center gap-1.5 bg-gray-600/90 px-3 py-1 rounded text-sm font-bold text-white">
              <span className="w-2.5 h-2.5 rounded-full bg-gray-300"></span>
              OFFLINE
            </div>
          ) : (
            <div className="absolute top-4 left-4 z-10 flex items-center gap-1.5 bg-red-600/90 px-3 py-1 rounded text-sm font-bold text-white">
              <span className="w-2.5 h-2.5 rounded-full bg-white animate-pulse"></span>
              LIVE
            </div>
          )}

          {isInactive ? (
            <div className="w-full h-full flex flex-col items-center justify-center relative bg-gradient-to-br from-gray-900 to-black">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-24 w-24 text-gray-700 relative" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
              </svg>
              <p className="text-sm text-gray-500 mt-4 relative uppercase tracking-wider">Camera is currently offline</p>
            </div>
          ) : isVideoFile ? (
            <video src={camera.streamUrl} className="w-full h-full object-cover" autoPlay loop muted playsInline />
          ) : hasIframeStream ? (
            <iframe
              src={camera.streamUrl}
              className="w-full h-full border-0"
              title={camera.name}
              allow="autoplay; encrypted-media; fullscreen"
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
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-24 w-24 text-gray-700 relative"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              <p className="text-sm text-gray-500 mt-4 relative">No stream configured</p>
            </div>
          )}
        </div>

        <p className="text-xs text-gray-500 text-center">Click outside or press <kbd className="bg-solar-card px-1.5 py-0.5 rounded text-gray-300 border border-solar-border">Esc</kbd> to close</p>
      </div>
    </div>,
    document.body
  );
};

export default CameraDetailModal;
