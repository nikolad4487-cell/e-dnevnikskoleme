import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useSelection } from '../../contexts/SelectionContext';
import { Grade, Subject, FinalGrade, User, Role } from '../../types';
import { cn } from '../../lib/utils';
import { BookOpen, GraduationCap, Clock, ChevronRight } from 'lucide-react';
import { mappers } from '../../lib/mappers';

export default function OcjenePage() {
  const { user, isParent } = useAuth();
  const { selectedClassId, selectedChildId } = useSelection();
  const [grades, setGrades] = useState<Grade[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [finalGrades, setFinalGrades] = useState<FinalGrade[]>([]);
  const [loading, setLoading] = useState(true);
  const [targetStudent, setTargetStudent] = useState<User | null>(null);

  useEffect(() => {
    if (!user || !selectedClassId) return;
    
    const fetchData = async () => {
      setLoading(true);
      
      try {
        const targetStudentId = isParent ? selectedChildId : user.id;

        if (!targetStudentId) {
          setLoading(false);
          return;
        }

        // Fetch target student profile if it's parent view
        if (isParent) {
          const { data: profile } = await supabase.from('user_profiles').select('*').eq('id', targetStudentId).single();
          if (profile) {
            setTargetStudent({
              id: profile.id,
              name: profile.name?.split(' ')[0] || '',
              surname: profile.name?.split(' ').slice(1).join(' ') || '',
              email: profile.email
            } as User);
          }
        } else {
          setTargetStudent(user);
        }

        // Get student's enrollments for THIS class
        const { data: enrollData } = await supabase
          .from('student_subject_enrollments')
          .select('*')
          .eq('student_id', targetStudentId)
          .eq('class_id', selectedClassId);
        
        const enrollments = (enrollData || []).map(row => mappers.studentSubjectEnrollment(row));

        // Get all active subjects for these enrollments
        const { data: subjectsData } = await supabase.from('subjects').select('*');
        const activeSubjects = (subjectsData || [])
          .map(row => mappers.subject(row))
          .filter(s => {
            const e = enrollments.find(en => en.subjectId === s.id);
            return e?.status === 'ACTIVE';
          }) as Subject[];
        
        setSubjects(activeSubjects);
        if (activeSubjects.length > 0) setSelectedSubject(activeSubjects[0].id);

        // Get student's grades for THIS class
        const { data: gradesData } = await supabase
          .from('grades')
          .select('*')
          .eq('student_id', targetStudentId)
          .eq('class_id', selectedClassId);
        
        setGrades(gradesData || []);

        // Get final grades for THIS class
        const { data: finalData } = await supabase
          .from('final_grades')
          .select('*')
          .eq('student_id', targetStudentId)
          .eq('class_id', selectedClassId);
        
        setFinalGrades(finalData || []);
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [user, selectedClassId, selectedChildId]);

  const CATEGORIES = [
    'Usvojenost nastavnih sadržaja',
    'Primjena nastavnih sadržaja',
    'Samostalan rad i aktivnost'
  ];

  const MONTHS_ORDER = ['IX', 'X', 'XI', 'XII', 'I', 'II', 'III', 'IV', 'V', 'VI'];
  const MONTH_MAP = { 9: 'IX', 10: 'X', 11: 'XI', 12: 'XII', 1: 'I', 2: 'II', 3: 'III', 4: 'IV', 5: 'V', 6: 'VI' };

  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);

  // Group grades for current view
  const activeSubject = subjects.find(s => s.id === selectedSubject) || subjects[0];
  const activeGrades = grades.filter(g => g.subjectId === activeSubject?.id);
  const average = activeGrades.length > 0 
    ? (activeGrades.reduce((acc, curr) => acc + curr.value, 0) / activeGrades.length).toFixed(2)
    : '0.00';

  const gridGrades: Record<string, Record<string, number[]>> = {};
  CATEGORIES.forEach(cat => gridGrades[cat] = {});
  activeGrades.forEach(g => {
    const month = new Date(g.timestamp).getMonth() + 1;
    const monthLabel = MONTH_MAP[month as keyof typeof MONTH_MAP];
    if (monthLabel) {
      if (!gridGrades[g.category]) gridGrades[g.category] = {};
      if (!gridGrades[g.category][monthLabel]) gridGrades[g.category][monthLabel] = [];
      gridGrades[g.category][monthLabel].push(g.value);
    }
  });

  return (
    <div className="flex flex-col h-full bg-white overflow-auto text-[13px]">
      <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto w-full">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-200 pb-4">
          <h1 className="text-lg font-bold text-gray-800 uppercase tracking-tight">{activeSubject?.name || 'Odaberite predmet'}</h1>
          <select 
            className="w-full md:w-64 border border-gray-300 p-2 font-bold text-[12px] uppercase bg-white text-[#005c8d] outline-none cursor-pointer focus:border-[#005c8d]"
            value={selectedSubject || subjects[0]?.id || ''}
            onChange={e => setSelectedSubject(e.target.value)}
          >
            {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>

        {/* Monthly Grid Table */}
        <div className="bg-white border border-gray-300 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead>
                <tr className="bg-gray-100 border-b border-gray-300 text-[10px] font-bold text-gray-600 uppercase">
                  <th className="p-2 border-r border-gray-300 w-1/4">Elementi vrednovanja</th>
                  {MONTHS_ORDER.map(m => (
                    <th key={m} className="p-2 border-r border-gray-300 text-center w-12">{m}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {CATEGORIES.map((cat) => (
                  <tr key={cat} className="border-b border-gray-300">
                    <td className="p-2 border-r border-gray-300 font-bold bg-[#fbfbfb]">{cat}</td>
                    {MONTHS_ORDER.map(m => (
                      <td key={m} className="p-1 border-r border-gray-300 text-center align-top bg-white">
                        <div className="flex flex-wrap justify-center gap-1 min-h-[30px]">
                          {gridGrades[cat]?.[m]?.map((v, i) => (
                            <span key={i} className="text-[14px] font-bold text-[#005c8d]">{v}</span>
                          ))}
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
                {/* Final row */}
                <tr className="bg-gray-50 font-bold">
                  <td className="p-2 border-r border-gray-300 uppercase">ZAKLJUČENA OCJENA</td>
                  {MONTHS_ORDER.map(m => {
                    const isSemester1 = ['IX', 'X', 'XI', 'XII'].includes(m);
                    const isSemester2 = ['V', 'VI'].includes(m);
                    const val = finalGrades.find(f => f.subjectId === activeSubject?.id && f.period === (isSemester1 ? '1' : '2'))?.value;
                    return (
                      <td key={m} className="p-2 border-r border-gray-300 text-center text-[#d9534f] text-[15px]">
                        {(m === 'XII' || m === 'VI') ? val : ''}
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-[#f8f9fa] border border-gray-200 p-3 flex justify-between items-center">
            <span className="text-[11px] font-bold uppercase text-gray-500 tracking-wider">Aritmetička sredina:</span>
            <div className="flex items-center gap-3">
              <span className="text-lg font-bold text-[#005c8d]">{average}</span>
            </div>
        </div>

        <div className="space-y-3">
           <h2 className="text-md font-bold text-gray-800 uppercase tracking-tight border-b border-gray-200 pb-1">Bilješke i ocjene</h2>
           <div className="bg-white border border-gray-300 overflow-hidden">
             <table className="w-full text-left border-collapse">
                <thead>
                   <tr className="bg-[#f8f9fa] border-b border-gray-300 text-gray-600">
                      <th className="p-2 text-[10px] font-bold uppercase text-center w-24 border-r border-gray-200">Datum</th>
                      <th className="p-2 text-[10px] font-bold uppercase text-center w-16 border-r border-gray-200">Ocjena</th>
                      <th className="p-2 text-[10px] font-bold uppercase border-r border-gray-200">Element</th>
                      <th className="p-2 text-[10px] font-bold uppercase">Bilješka</th>
                   </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                   {activeGrades.sort((a,b) => b.timestamp.localeCompare(a.timestamp)).map(g => (
                      <tr key={g.id} className="hover:bg-gray-50">
                         <td className="p-2 text-center text-[12px] font-bold text-gray-500 border-r border-gray-200">
                            {new Date(g.timestamp).toLocaleDateString('hr-HR', { day: '2-digit', month: '2-digit' })}.
                         </td>
                         <td className="p-2 text-center text-[14px] font-bold text-[#005c8d] border-r border-gray-200">{g.value}</td>
                         <td className="p-2 text-[12px] font-bold text-gray-700 border-r border-gray-200">
                            {g.category}
                         </td>
                         <td className="p-2 text-[12px] text-gray-600 leading-normal italic">
                            {g.note || '—'}
                         </td>
                      </tr>
                   ))}
                   {activeGrades.length === 0 && (
                     <tr>
                       <td colSpan={4} className="p-8 text-center text-gray-400 italic font-medium">Nema unesenih ocjena za odabrani predmet.</td>
                     </tr>
                   )}
                </tbody>
             </table>
           </div>
        </div>
      </div>
    </div>
  );
}
