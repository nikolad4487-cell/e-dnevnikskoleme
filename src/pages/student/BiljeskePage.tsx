import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useSelection } from '../../contexts/SelectionContext';
import { Class, User, Role, StudentNotes, ClassNotes, StudentYearSummary } from '../../types';
import { ClipboardList, User as UserIcon } from 'lucide-react';

export default function BiljeskePage() {
  const { user } = useAuth();
  const { selectedClassId, selectedChildId } = useSelection();
  const [targetStudentId, setTargetStudentId] = useState<string | null>(null);
  const [studentData, setStudentData] = useState<User | null>(null);
  const [classData, setClassData] = useState<Class | null>(null);
  const [homeroomTeacher, setHomeroomTeacher] = useState<User | null>(null);
  const [deputyTeacher, setDeputyTeacher] = useState<User | null>(null);
  const [notes, setNotes] = useState<StudentNotes | null>(null);
  const [classNotes, setClassNotes] = useState<ClassNotes | null>(null);
  const [studentYearSummary, setStudentYearSummary] = useState<StudentYearSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    // Assuming we can determine role from user object or session
    // For now purely relying on selectedChildId if parent
    if (selectedChildId) {
      setTargetStudentId(selectedChildId);
    } else {
      setTargetStudentId(user.id);
      setStudentData(user);
    }
  }, [user, selectedChildId]);

  useEffect(() => {
    if (!targetStudentId || !selectedClassId) return;

    const fetchData = async () => {
      setLoading(true);
      try {
        let currentStudent = studentData;
        if (!currentStudent) {
          const { data: sData } = await supabase.from('user_profiles').select('*').eq('id', targetStudentId).single();
          if (sData) {
            currentStudent = { 
              id: sData.id, 
              name: sData.name.split(' ')[0], 
              surname: sData.name.split(' ').slice(1).join(' '),
              email: sData.email
            } as User;
            setStudentData(currentStudent);
          }
        }

        if (selectedClassId) {
          const { data: cData } = await supabase.from('classes').select('*').eq('id', selectedClassId).single();
          if (cData) {
            setClassData(cData as Class);

            if (cData.homeroom_teacher_id) {
              const { data: tData } = await supabase.from('user_profiles').select('*').eq('id', cData.homeroom_teacher_id).single();
              if (tData) setHomeroomTeacher({ id: tData.id, name: tData.name.split(' ')[0], surname: tData.name.split(' ').slice(1).join(' ') } as User);
            }
            if (cData.deputy_homeroom_teacher_id) {
              const { data: dData } = await supabase.from('user_profiles').select('*').eq('id', cData.deputy_homeroom_teacher_id).single();
              if (dData) setDeputyTeacher({ id: dData.id, name: dData.name.split(' ')[0], surname: dData.name.split(' ').slice(1).join(' ') } as User);
            }

            // Fetch Notes
            const { data: nData } = await supabase.from('student_notes').select('*').eq('student_id', targetStudentId).eq('class_id', selectedClassId).maybeSingle();
            if (nData) {
              setNotes(nData as StudentNotes);
            } else {
              setNotes(null);
            }

            // Fetch Class Notes
            const { data: cnData } = await supabase.from('class_notes').select('*').eq('class_id', selectedClassId).maybeSingle();
            if (cnData) {
              setClassNotes(cnData as ClassNotes);
            } else {
              setClassNotes(null);
            }

            // Fetch Year Summary for Behavior
            const { data: sumData } = await supabase.from('student_year_summaries').select('*').eq('student_id', targetStudentId).eq('class_id', selectedClassId).maybeSingle();
            if (sumData) {
              setStudentYearSummary(sumData as StudentYearSummary);
            } else {
              setStudentYearSummary(null);
            }
          }
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [targetStudentId, selectedClassId]);

  const Section = ({ title, content }: { title: string, content?: string }) => (
    <div className="space-y-1">
      <h3 className="text-[11px] font-black uppercase text-gray-500 tracking-tight">{title}</h3>
      <div className="bg-white border border-gray-300 p-3 text-[12px] min-h-[40px] shadow-sm">
        <div className="text-gray-700 whitespace-pre-wrap leading-relaxed">
          {content || <span className="text-gray-300 italic">Nema unosa</span>}
        </div>
      </div>
    </div>
  );

  if (loading) return <div className="flex-1 flex items-center justify-center p-8 text-gray-400 font-bold uppercase text-xs tracking-widest">Učitavanje...</div>;

  return (
    <div className="flex-1 overflow-auto bg-[#f1f5f9]">
      <div className="max-w-4xl mx-auto p-4 md:p-8 space-y-6">
        <div className="flex items-center gap-3 border-b-2 border-[#005c8d]/10 pb-4">
          <ClipboardList className="text-[#005c8d]" size={20} />
          <h2 className="text-sm font-black uppercase text-[#005c8d] tracking-widest">Bilješke i opći podaci</h2>
        </div>

        <div className="space-y-6">
          <div className="border-b border-gray-300 pb-2">
            <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Opće bilješke razreda</h4>
          </div>

          {/* 1. Razrednik */}
          <Section 
            title="Razrednik" 
            content={classNotes?.homeroom_info || (homeroomTeacher ? `${homeroomTeacher.name} ${homeroomTeacher.surname}` : '')}
          />

          {/* 2. Zamjenik razrednika */}
          <Section 
            title="Zamjenik razrednika" 
            content={classNotes?.deputy_info || (deputyTeacher ? `${deputyTeacher.name} ${deputyTeacher.surname}` : '')}
          />

          <div className="border-b border-gray-300 pb-2 pt-4">
            <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Osobne bilješke</h4>
          </div>

          {/* 3. Bilješka razrednika */}
          <Section 
            title="Bilješka razrednika" 
            content={notes?.homeroom_note}
          />

          {/* 4. Izvanškolske aktivnosti */}
          <Section 
            title="Izvanškolske aktivnosti" 
            content={notes?.extracurricular_activities}
          />

          {/* 5. Izvannastavne aktivnosti */}
          <Section 
            title="Izvannastavne aktivnosti" 
            content={notes?.school_activities}
          />

          {/* 6. Vladanje */}
          <div className="space-y-1">
            <h3 className="text-[11px] font-black uppercase text-gray-500 tracking-tight">Vladanje</h3>
            <div className="bg-white border border-gray-300 p-3 text-[12px] min-h-[40px] shadow-sm">
              {studentYearSummary?.finalized_at ? (
                <div className="text-gray-700 font-black uppercase tracking-widest">
                  {studentYearSummary?.behavior || 'Uzorno'}
                </div>
              ) : (
                <div className="text-gray-400 italic">Vladanje još nije zaključeno.</div>
              )}
            </div>
          </div>

          {/* 7. Pedagoške mjere */}
          <Section 
            title="Pedagoške mjere" 
            content={notes?.disciplinary_actions}
          />
        </div>
      </div>
    </div>
  );
}
