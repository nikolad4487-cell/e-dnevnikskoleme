import React from 'react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  classId?: string;
  subjectId?: string;
}

export default function GroupGradesModal({ isOpen, onClose, classId, subjectId }: Props) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6">
        <h2 className="text-lg font-black text-gray-900 mb-4">Grupni unos ocjena</h2>
        <p className="text-gray-600 mb-4">Placeholder modal za razred {classId} i predmet {subjectId}.</p>
        <button onClick={onClose} className="bg-slate-800 text-white px-4 py-2 rounded text-xs font-bold uppercase">Zatvori</button>
      </div>
    </div>
  );
}
