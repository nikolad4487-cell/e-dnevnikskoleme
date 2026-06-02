import React, { useState } from 'react';
import { ThesisApplication } from '../types';

interface ThesisGradingModalProps {
  app: ThesisApplication;
  onClose: () => void;
  onSubmit: (data: any) => void;
  students: any[];
}

export default function ThesisGradingModal({ app, onClose, onSubmit, students }: ThesisGradingModalProps) {
  const [workGrade, setWorkGrade] = useState(app.work_grade?.toString() || '');
  const [workDate, setWorkDate] = useState(app.work_grade_date || new Date().toISOString().split('T')[0]);
  const [defenseGrade, setDefenseGrade] = useState(app.defense_grade?.toString() || '');
  const [defenseDate, setDefenseDate] = useState(app.defense_grade_date || new Date().toISOString().split('T')[0]);
  const [finalGrade, setFinalGrade] = useState(app.final_grade?.toString() || '');
  
  const student = students.find(s => s.id === app.student_id);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      work_grade: workGrade ? parseInt(workGrade) : null,
      work_grade_date: workDate || null,
      defense_grade: defenseGrade ? parseInt(defenseGrade) : null,
      defense_grade_date: defenseDate || null,
      final_grade: finalGrade ? parseInt(finalGrade) : null,
      final_grade_date: finalGrade ? new Date().toISOString().split('T')[0] : null
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6 animate-in zoom-in-95 duration-200">
        <h3 className="text-base font-black text-gray-800 uppercase tracking-tight mb-2">Ocjenjivanje završnog rada</h3>
        <p className="text-xs text-gray-500 mb-4">Učenik: <strong>{student?.name}</strong>, Rad: <em>"{app.title}"</em></p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-black uppercase text-gray-400 mb-1">Ocjena izrade</label>
              <select value={workGrade} onChange={(e) => setWorkGrade(e.target.value)} className="w-full text-xs p-2.5 border border-gray-300 rounded">
                <option value="">Odaberi...</option>
                {[1, 2, 3, 4, 5].map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-black uppercase text-gray-400 mb-1">Datum izrade</label>
              <input type="date" value={workDate} onChange={(e) => setWorkDate(e.target.value)} className="w-full text-xs p-2.5 border border-gray-300 rounded" />
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-black uppercase text-gray-400 mb-1">Ocjena obrane</label>
              <select value={defenseGrade} onChange={(e) => setDefenseGrade(e.target.value)} className="w-full text-xs p-2.5 border border-gray-300 rounded">
                <option value="">Odaberi...</option>
                {[1, 2, 3, 4, 5].map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-black uppercase text-gray-400 mb-1">Datum obrane</label>
              <input type="date" value={defenseDate} onChange={(e) => setDefenseDate(e.target.value)} className="w-full text-xs p-2.5 border border-gray-300 rounded" />
            </div>
          </div>

          <div>
             <label className="block text-xs font-black uppercase text-gray-400 mb-1">Konačna ocjena</label>
             <select value={finalGrade} onChange={(e) => setFinalGrade(e.target.value)} className="w-full text-xs p-2.5 border border-gray-300 rounded">
                <option value="">Odaberi...</option>
                {[1, 2, 3, 4, 5].map(g => <option key={g} value={g}>{g}</option>)}
              </select>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 border border-gray-300 text-gray-600 rounded text-xs font-black uppercase tracking-wider">Odustani</button>
            <button type="submit" className="px-4 py-2 bg-[#005c8d] text-white rounded text-xs font-black uppercase tracking-wider">Spremi ocjene</button>
          </div>
        </form>
      </div>
    </div>
  );
}
