import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { toast } from 'react-hot-toast';
import { getGradeDateBounds, getLocalDateISO, isGradeDateAllowed } from '../lib/utils';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  classId?: string;
  subjectId?: string;
  students: any[];
  gradingElements: string[];
  onSuccess: () => void;
}

export default function GroupGradesModal({ isOpen, onClose, classId, subjectId, students, gradingElements, onSuccess }: Props) {
  const [selectedElement, setSelectedElement] = useState(gradingElements[0] || '');
  const gradeDateBounds = getGradeDateBounds();
  const [selectedDate, setSelectedDate] = useState(getLocalDateISO());
  const [sharedGrade, setSharedGrade] = useState<number | null>(null);
  const [sharedNote, setSharedNote] = useState('');
  
  const [studentData, setStudentData] = useState<Record<string, { grade: number | null, note: string }>>(
      students.reduce((acc, s) => ({...acc, [s.student_id]: { grade: null, note: '' }}), {})
  );

  const [isSaving, setIsSaving] = useState(false);

  if (!isOpen) return null;

  const applySharedToAll = () => {
      setStudentData(prev => students.reduce((acc, s) => ({...acc, [s.student_id]: { grade: sharedGrade, note: sharedNote }}), {}));
  };

  const handleSave = async () => {
    if (!classId || !subjectId) return;
    if (!isGradeDateAllowed(selectedDate)) {
      toast.error('Datum ocjene može biti samo u prethodnom ili tekućem mjesecu.');
      return;
    }
    setIsSaving(true);
    try {
      const payloads = Object.entries(studentData)
        .filter(([_, data]) => data.grade !== null)
        .map(([studentId, data]) => ({
            student_id: studentId,
            subject_id: subjectId,
            class_id: classId,
            value: data.grade,
            element: selectedElement,
            note: data.note,
            date: selectedDate,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        }));
      
      if (payloads.length === 0) {
          toast.error('Nema odabranih ocjena za spremanje.');
          return;
      }

      const { error } = await supabase.from('grades').insert(payloads);
      if (error) throw error;
      toast.success('Ocjene uspješno unesene.');
      onSuccess();
      onClose();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl p-6 h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-black text-gray-900 mb-4">Grupni unos ocjena</h2>
        
        <div className="bg-slate-50 p-4 rounded mb-4 space-y-3">
             <div className='flex gap-2'>
                <select value={selectedElement} onChange={e => setSelectedElement(e.target.value)} className="flex-grow border rounded p-2 text-sm">
                    {gradingElements.map(el => <option key={el} value={el}>{el}</option>)}
                </select>
                <input type="date" value={selectedDate} min={gradeDateBounds.min} max={gradeDateBounds.max} onChange={e => setSelectedDate(e.target.value)} className="border rounded p-2 text-sm" />
             </div>
            
            <div className="flex gap-2 items-center">
                <span className='text-xs text-slate-600'>Zajednička ocjena:</span>
                {[1, 2, 3, 4, 5].map(g => (
                    <button key={g} onClick={() => setSharedGrade(g)} className={`w-8 h-8 rounded ${sharedGrade === g ? 'bg-blue-600 text-white' : 'bg-gray-200 text-xs'}`}>{g}</button>
                ))}
            </div>
            
            <div className='flex gap-2 items-center'>
                <input type="text" placeholder="Zajednička bilješka" value={sharedNote} onChange={e => setSharedNote(e.target.value)} className="flex-grow border rounded p-2 text-sm" />
                <button onClick={applySharedToAll} className="bg-blue-600 text-white px-4 py-2 rounded text-xs">Kopiraj svima</button>
            </div>
        </div>

        <table className="w-full text-xs">
            <thead>
                <tr className='border-b'>
                    <th className='text-left pb-2'>Učenik</th>
                    <th className='pb-2'>Ocjena</th>
                    <th className='text-left pb-2'>Bilješka</th>
                </tr>
            </thead>
            <tbody>
                {students.map(s => (
                    <tr key={s.student_id} className='border-b'>
                        <td className='py-2'>{s.student.surname} {s.student.name}</td>
                        <td className='py-2 text-center'>
                             <div className="flex gap-1 justify-center">
                                {[1, 2, 3, 4, 5].map(g => (
                                    <button key={g} onClick={() => setStudentData(prev => ({...prev, [s.student_id]: {...prev[s.student_id], grade: g}}))} className={`w-6 h-6 rounded ${studentData[s.student_id].grade === g ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}>{g}</button>
                                ))}
                            </div>
                        </td>
                        <td className='py-2'>
                            <input type="text" value={studentData[s.student_id].note} onChange={e => setStudentData(prev => ({...prev, [s.student_id]: {...prev[s.student_id], note: e.target.value}}))} className="w-full border rounded p-1" />
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>

        <div className="mt-6 flex justify-end gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded">Odustani</button>
            <button onClick={handleSave} disabled={isSaving} className="bg-blue-600 text-white px-4 py-2 rounded">{isSaving ? 'Spremanje...' : 'Spremi ocjene'}</button>
        </div>
      </div>
    </div>
  );
}
