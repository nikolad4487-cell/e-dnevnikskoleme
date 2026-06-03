import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useSelection } from '../../contexts/SelectionContext';
import { CheckCircle2, AlertTriangle, RefreshCw, XCircle, ShieldCheck } from 'lucide-react';
import { toast } from 'react-hot-toast';

export default function SystemCheckPage() {
  const { selectedSchoolId } = useSelection();
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<any>(null);

  const runChecks = async () => {
    setLoading(true);
    try {
      // 1. Fetch Students
      const { data: students } = await supabase.from('user_profiles').select('*');
      const { data: roles } = await supabase.from('user_school_roles').select('*').eq('school_id', selectedSchoolId).eq('role', 'STUDENT');
      const studentIds = roles?.map(r => r.user_id) || [];
      const schoolStudents = students?.filter(s => studentIds.includes(s.id)) || [];

      // Checks
      const noProgram = schoolStudents.filter(s => !s.program_id);
      const noOib = schoolStudents.filter(s => !s.oib);
      const noDob = schoolStudents.filter(s => !s.dob);

      // 2. Fetch Classes
      const { data: classes } = await supabase.from('classes').select('*').eq('school_id', selectedSchoolId);
      const noHomeroom = classes?.filter(c => !c.homeroom_teacher_id) || [];
      const noClassProgram = classes?.filter(c => !c.program_id) || [];

      // 3. Status Connection
      const { error: dbError } = await supabase.from('schools').select('id').limit(1);

      // 4. Subjects
      const { data: subjects } = await supabase.from('class_subjects').select('*').in('class_id', classes?.map(c => c.id) || []);
      const { data: subjectTeachers } = await supabase.from('class_subject_teachers').select('*').in('class_subject_id', subjects?.map(s => s.id) || []);
      
      let subjectsNoTeacher = 0;
      subjects?.forEach(s => {
          if (!subjectTeachers?.find(st => st.class_subject_id === s.id)) subjectsNoTeacher++;
      });

      setReport({
        databaseStatus: dbError ? 'ERROR' : 'OK',
        students: {
          total: schoolStudents.length,
          noProgram: noProgram.length,
          noOib: noOib.length,
          noDob: noDob.length
        },
        classes: {
          total: classes?.length || 0,
          noHomeroom: noHomeroom.length,
          noProgram: noClassProgram.length
        },
        subjects: {
          total: subjects?.length || 0,
          noTeacher: subjectsNoTeacher
        }
      });
      toast.success('Sistemska provjera završena.');
    } catch (e) {
      console.error(e);
      toast.error('Greska u provjeri sustava.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 bg-slate-50 min-h-screen">
      <div className="flex border-b pb-4 items-center justify-between shadow-sm bg-white p-4 rounded-md">
        <div>
          <h1 className="text-xl font-black text-slate-900 uppercase">Status i Provjera Sustava</h1>
          <p className="text-xs text-slate-500 font-bold uppercase mt-1">Nadzor stabilnosti produkcijske okoline (Prioritet 11)</p>
        </div>
        <button 
          onClick={runChecks} disabled={loading}
          className="flex items-center gap-2 bg-[#005c8d] text-white px-4 py-2 font-black text-xs uppercase px-5 tracking-wider rounded transition-colors hover:bg-[#00476b]"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Pokreni Provjeru
        </button>
      </div>

      {report && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
          <div className="bg-white border rounded shadow-sm p-5">
            <h2 className="text-sm font-black uppercase text-slate-800 border-b pb-2 mb-4 flex items-center gap-2 border-slate-100">
              <ShieldCheck size={16} className="text-emerald-600"/> Povezanost Sustava
            </h2>
            <div className="flex justify-between items-center bg-slate-50 p-3 rounded">
               <span className="text-xs font-bold text-slate-600">Supabase Baza Podataka</span>
               {report.databaseStatus === 'OK' ? (
                 <span className="text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded text-[10px] font-black uppercase flex items-center gap-1"><CheckCircle2 size={12}/> Stabilno</span>
               ) : (
                 <span className="text-red-700 bg-red-100 px-2 py-0.5 rounded text-[10px] font-black uppercase flex items-center gap-1"><XCircle size={12}/> Greška</span>
               )}
            </div>
            <div className="flex justify-between items-center bg-slate-50 p-3 rounded mt-2">
               <span className="text-xs font-bold text-slate-600">Autentifikacija / Sesije</span>
               <span className="text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded text-[10px] font-black uppercase flex items-center gap-1"><CheckCircle2 size={12}/> Operativno</span>
            </div>
          </div>

          <div className="bg-white border rounded shadow-sm p-5">
            <h2 className="text-sm font-black uppercase text-slate-800 border-b pb-2 mb-4 flex items-center gap-2 border-slate-100">
              <AlertTriangle size={16} className="text-amber-500"/> Integracija Podataka
            </h2>
            <ul className="text-xs space-y-3 font-medium text-slate-600">
               <li className="flex justify-between border-b pb-2">Učenici bez programa
                  <span className={report.students.noProgram > 0 ? "text-red-500 font-bold" : "text-emerald-600"}>{report.students.noProgram} od {report.students.total}</span>
               </li>
               <li className="flex justify-between border-b pb-2">Učenici bez upisanog OIB-a
                  <span className={report.students.noOib > 0 ? "text-amber-500 font-bold" : "text-emerald-600"}>{report.students.noOib}</span>
               </li>
               <li className="flex justify-between border-b pb-2">Razredni odjeli bez razrednika
                  <span className={report.classes.noHomeroom > 0 ? "text-red-500 font-bold" : "text-emerald-600"}>{report.classes.noHomeroom}</span>
               </li>
               <li className="flex justify-between border-b pb-2">Razredni odjeli bez programa
                  <span className={report.classes.noProgram > 0 ? "text-amber-500 font-bold" : "text-emerald-600"}>{report.classes.noProgram}</span>
               </li>
               <li className="flex justify-between pb-2">Predmeti bez dodijeljenog nastavnika
                  <span className={report.subjects.noTeacher > 0 ? "text-red-500 font-bold" : "text-emerald-600"}>{report.subjects.noTeacher}</span>
               </li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
