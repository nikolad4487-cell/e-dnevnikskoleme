import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { toast } from 'react-hot-toast';
import { formatPersonName, sortStudentsBySurname } from '../lib/utils';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  classId?: string;
  subjectId?: string;
  term: 'FIRST_SEMESTER' | 'SECOND_SEMESTER';
  students: any[];
  onSuccess: () => void;
}

const STATUSES = ["NEOCIJENJEN", "OSLOBODEN", "ODRADENO", "NEODRADENO"];

export default function GroupFinalGradesModal({ isOpen, onClose, classId, subjectId, term, students, onSuccess }: Props) {
  const [studentData, setStudentData] = useState<Record<string, { grade: number | null, status: string | null }>>(
      students.reduce((acc, s) => ({...acc, [s.student_id]: { grade: null, status: null }}), {})
  );

  const [isSaving, setIsSaving] = useState(false);

  if (!isOpen) return null;

  const handleSave = async () => {
    if (!classId || !subjectId) return;
    setIsSaving(true);
    try {
      const payloads = Object.entries(studentData)
        .filter(([_, data]) => data.grade !== null || data.status !== null)
        .map(([studentId, data]) => ({
            student_id: studentId,
            subject_id: subjectId,
            class_id: classId,
            period: term,
            term: term === 'FIRST_SEMESTER' ? 'FIRST_SEMESTER' : 'FINAL',
            value: data.grade ? data.grade.toString() : (data.status || ''),
            note: 'Zaključna ocjena'
        }));
      
      if (payloads.length === 0) {
          toast.error('Nema unesenih podataka za spremanje.');
          return;
      }
      
      // Upsert: Need to be careful. In this simplified version, let's just insert for now.
      // E-dnevnik usually manages existing ones. 
      const { error } = await supabase.from('final_grades').insert(payloads);
      
      if (error) throw error;
      toast.success('Zaključne ocjene uspješno unesene.');
      onSuccess();
      onClose();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setIsSaving(false);
    }
  };

  const getOptionLabel = (val: string | number) => {
      const labels: Record<string, string> = {
          '1': 'Nedovoljan (1)', '2': 'Dovoljan (2)', '3': 'Dobar (3)', '4': 'Vrlo dobar (4)', '5': 'Odličan (5)',
          'NEOCIJENJEN': 'Neocijenjen', 'OSLOBODEN': 'Oslobođen', 'ODRADENO': 'Odrađeno', 'NEODRADENO': 'Neodrađeno'
      };
      return labels[val] || val;
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl p-6 h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-black text-gray-900 mb-4">Grupno zaključivanje ocjena ({term === 'FIRST_SEMESTER' ? '1. polugodište' : '2. polugodište'})</h2>
        
        <table className="w-full text-xs">
            <thead>
                <tr className='border-b'>
                    <th className='text-left pb-2'>Učenik</th>
                    <th className='pb-2'> Zaključivanje</th>
                </tr>
            </thead>
            <tbody>
                {sortStudentsBySurname(students).map(s => (
                    <tr key={s.student_id} className='border-b'>
                        <td className='py-2'>{formatPersonName(s.student)}</td>
                        <td className='py-2'>
                             <div className="flex flex-wrap gap-1 justify-start">
                                {[1, 2, 3, 4, 5].map(g => (
                                    <button key={g} onClick={() => setStudentData(prev => ({...prev, [s.student_id]: {grade: g, status: null}}))} className={`w-8 h-8 rounded ${studentData[s.student_id].grade === g ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}>{g}</button>
                                ))}
                                {STATUSES.map(st => (
                                    <button key={st} onClick={() => setStudentData(prev => ({...prev, [s.student_id]: {grade: null, status: st}}))} className={`px-2 py-1 rounded text-[10px] ${studentData[s.student_id].status === st ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}>{getOptionLabel(st)}</button>
                                ))}
                            </div>
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>

        <div className="mt-6 flex justify-end gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded">Odustani</button>
            <button onClick={handleSave} disabled={isSaving} className="bg-blue-600 text-white px-4 py-2 rounded">{isSaving ? 'Spremanje...' : 'Spremi zaključne ocjene'}</button>
        </div>
      </div>
    </div>
  );
}
