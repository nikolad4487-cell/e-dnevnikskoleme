import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { toast } from 'react-hot-toast';
import { getLocalDateISO } from '../lib/utils';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  classId?: string;
  subjectId?: string;
  students: any[];
  onSuccess: () => void;
}

export default function GroupNotesModal({ isOpen, onClose, classId, subjectId, students, onSuccess }: Props) {
  const [selectedDate, setSelectedDate] = useState(getLocalDateISO());
  const [sharedNote, setSharedNote] = useState('');
  
  const [studentData, setStudentData] = useState<Record<string, { note: string }>>(
      students.reduce((acc, s) => ({...acc, [s.student_id]: { note: '' }}), {})
  );

  const [isSaving, setIsSaving] = useState(false);

  if (!isOpen) return null;

  const applySharedToAll = () => {
      setStudentData(prev => students.reduce((acc, s) => ({...acc, [s.student_id]: { note: sharedNote }}), {}));
  };

  const handleSave = async () => {
    if (!classId || !subjectId) return;
    setIsSaving(true);
    try {
      const payloads = Object.entries(studentData)
        .filter(([_, data]) => data.note.trim() !== '')
        .map(([studentId, data]) => ({
            student_id: studentId,
            subject_id: subjectId,
            class_id: classId,
            note: data.note,
            date: selectedDate
        }));
      
      if (payloads.length === 0) {
          toast.error('Nema unesenih bilješki za spremanje.');
          return;
      }

      const { error } = await supabase.from('student_notes').insert(payloads);
      if (error) throw error;
      toast.success('Bilješke uspješno unesene.');
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
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl p-6 h-[80vh] overflow-y-auto">
        <h2 className="text-lg font-black text-gray-900 mb-4">Grupni unos bilješki</h2>
        
        <div className="bg-slate-50 p-4 rounded mb-4 space-y-3">
            <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="w-full border rounded p-2 text-sm" />
            
            <div className='flex gap-2 items-center'>
                <input type="text" placeholder="Zajednička bilješka" value={sharedNote} onChange={e => setSharedNote(e.target.value)} className="flex-grow border rounded p-2 text-sm" />
                <button onClick={applySharedToAll} className="bg-blue-600 text-white px-4 py-2 rounded text-xs">Kopiraj svima</button>
            </div>
        </div>

        <table className="w-full text-xs">
            <thead>
                <tr className='border-b'>
                    <th className='text-left pb-2'>Učenik</th>
                    <th className='text-left pb-2'>Bilješka</th>
                </tr>
            </thead>
            <tbody>
                {students.map(s => (
                    <tr key={s.student_id} className='border-b'>
                        <td className='py-2'>{s.student.surname} {s.student.name}</td>
                        <td className='py-2'>
                            <input type="text" value={studentData[s.student_id].note} onChange={e => setStudentData(prev => ({...prev, [s.student_id]: { note: e.target.value}}))} className="w-full border rounded p-1" />
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>

        <div className="mt-6 flex justify-end gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded">Odustani</button>
            <button onClick={handleSave} disabled={isSaving} className="bg-blue-600 text-white px-4 py-2 rounded">{isSaving ? 'Spremanje...' : 'Spremi bilješke'}</button>
        </div>
      </div>
    </div>
  );
}
