
import React from 'react';
import { createPortal } from 'react-dom';

type Variant = 'danger' | 'warning' | 'info';

interface Props {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: Variant;
  onConfirm: () => void;
  onClose: () => void;
}

const variantStyles: Record<Variant, { btn: string; icon: string }> = {
  danger:  { btn: 'bg-solar-danger hover:bg-red-600 text-white',     icon: 'text-solar-danger' },
  warning: { btn: 'bg-yellow-500 hover:bg-yellow-400 text-black',     icon: 'text-yellow-400' },
  info:    { btn: 'bg-solar-success hover:bg-green-600 text-white',   icon: 'text-blue-400' },
};

const ConfirmModal: React.FC<Props> = ({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'warning',
  onConfirm,
  onClose,
}) => {
  if (!isOpen) return null;

  const { btn, icon } = variantStyles[variant];

  const handleConfirm = () => {
    onConfirm();
    onClose();
  };

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black bg-opacity-70 backdrop-blur-sm p-4">
      <div className="bg-solar-bg w-full max-w-md rounded-lg border border-solar-border shadow-2xl">
        <div className="p-6">
          <div className="flex items-start gap-4">
            <svg xmlns="http://www.w3.org/2000/svg" className={`h-10 w-10 shrink-0 ${icon}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div className="flex-1">
              <h2 className="text-lg font-bold text-white mb-2">{title}</h2>
              <p className="text-sm text-gray-300 leading-relaxed">{message}</p>
            </div>
          </div>
        </div>
        <div className="p-4 border-t border-solar-border flex justify-end gap-2 bg-solar-card/50">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded text-gray-300 hover:bg-solar-card transition"
          >
            {cancelLabel}
          </button>
          <button
            onClick={handleConfirm}
            className={`px-4 py-2 rounded font-bold transition ${btn}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ConfirmModal;
