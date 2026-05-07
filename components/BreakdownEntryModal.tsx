
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { BreakdownEvent, BreakdownReason } from '../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSave: (event: BreakdownEvent) => void;
  inverterName: string;
  initialEvent?: BreakdownEvent | null;
}

const BreakdownEntryModal: React.FC<Props> = ({ isOpen, onClose, onSave, inverterName, initialEvent }) => {
  const [event, setEvent] = useState<Partial<BreakdownEvent>>({});

  useEffect(() => {
    if (isOpen) {
      if (initialEvent) {
        setEvent(initialEvent);
      } else {
        setEvent({
          id: `evt-${crypto.randomUUID()}`,
          inverterName: inverterName,
          date: new Date().toISOString().split('T')[0],
          startTime: '12:00',
          endTime: '13:00',
          reason: BreakdownReason.GRID_FAILURE,
          giiAtStart: 0,
          giiAtEnd: 0,
          notes: '',
        });
      }
    }
  }, [isOpen, initialEvent, inverterName]);
  
  const handleSave = () => {
    // Basic validation
    if (!event.date || !event.startTime || !event.endTime || !event.reason) {
      alert("Please fill all required fields.");
      return;
    }
    onSave(event as BreakdownEvent);
  };
  
  if (!isOpen) return null;

  const handleChange = (field: keyof BreakdownEvent, value: any) => {
    setEvent(prev => ({...prev, [field]: value}));
  }

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black bg-opacity-70 backdrop-blur-sm">
      <div className="bg-solar-bg w-full max-w-lg m-4 rounded-lg border border-solar-border shadow-2xl flex flex-col">
        <div className="p-6 border-b border-solar-border flex justify-between items-center">
          <h2 className="text-xl font-bold text-solar-accent">{initialEvent ? 'Edit' : 'Log'} Breakdown Event</h2>
          <button onClick={onClose} className="text-2xl text-solar-text hover:text-white">&times;</button>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-sm text-gray-400">For Inverter: <span className="font-bold text-white">{inverterName}</span></p>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="label">Date</label>
              <input type="date" className="input-field" value={event.date} onChange={e => handleChange('date', e.target.value)} />
            </div>
            <div>
              <label className="label">Start Time</label>
              <input type="time" className="input-field" value={event.startTime} onChange={e => handleChange('startTime', e.target.value)} />
            </div>
            <div>
              <label className="label">End Time</label>
              <input type="time" className="input-field" value={event.endTime} onChange={e => handleChange('endTime', e.target.value)} />
            </div>
          </div>
          
          <div>
            <label className="label">Reason</label>
            <select className="input-field" value={event.reason} onChange={e => handleChange('reason', e.target.value)}>
                {Object.values(BreakdownReason).map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
                <label className="label">GII at Start (kWh/m²)</label>
                <input type="number" step="0.01" className="input-field" value={event.giiAtStart} onChange={e => handleChange('giiAtStart', parseFloat(e.target.value))} />
            </div>
            <div>
                <label className="label">GII at End (kWh/m²)</label>
                <input type="number" step="0.01" className="input-field" value={event.giiAtEnd} onChange={e => handleChange('giiAtEnd', parseFloat(e.target.value))} />
            </div>
          </div>

          <div>
            <label className="label">Notes (Optional)</label>
            <textarea className="input-field" value={event.notes} onChange={e => handleChange('notes', e.target.value)} rows={2}></textarea>
          </div>
        </div>

        <div className="p-6 border-t border-solar-border flex justify-end gap-4">
          <button onClick={onClose} className="px-4 py-2 rounded text-gray-300 hover:bg-solar-card">Cancel</button>
          <button onClick={handleSave} className="px-4 py-2 rounded bg-solar-success text-white font-bold hover:bg-green-600">Save Event</button>
        </div>
      </div>
      <style>{`
        .label { display: block; font-size: 0.875rem; color: #a0aec0; margin-bottom: 0.25rem; }
        .input-field { width: 100%; background-color: #1B263B; border: 1px solid #415A77; border-radius: 4px; padding: 8px; color: white; outline: none; }
        .input-field:focus { border-color: #FFD700; }
      `}</style>
    </div>,
    document.body
  );
};

export default BreakdownEntryModal;
