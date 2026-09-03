import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useSelection } from '../../contexts/SelectionContext';
import { Class, User, Role, StudentNotes, ClassNotes, StudentYearSummary } from '../../types';
import { formatPersonName } from '../../lib/utils';

const emailPattern = /([\w.!#$%&'*+/=?^`{|}~-]+@[\w-]+(?:\.[\w-]+)+)/g;

function renderTextWithMailLinks(text?: string) {
  if (!text) return <span className="text-gray-300 italic">Nema unosa</span>;

  return text.split(emailPattern).map((part, index) => {
    if (!part.match(emailPattern)) return <React.Fragment key={index}>{part}</React.Fragment>;

    return (
      <a key={index} href={`mailto:${part}`} className="text-blue-600 hover:underline">
        {part}
      </a>
    );
  });
}

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
          const { data: sData } = await supabase.from('user_profiles').select('*').eq('id', targetStudentId).maybeSingle();
          if (sData) {
            currentStudent = { 
              id: sData.id, 
              name: sData.name, 
              email: sData.email
            } as User;
            setStudentData(currentStudent);
          }
        }

        if (selectedClassId) {
          const { data: cData } = await supabase.from('classes').select('*').eq('id', selectedClassId).maybeSingle();
          if (cData) {
            setClassData(cData as Class);

            if (cData.homeroom_teacher_id) {
              const { data: tData } = await supabase.from('user_profiles').select('id, name, email').eq('id', cData.homeroom_teacher_id).maybeSingle();
              if (tData) setHomeroomTeacher(tData as any);
            }
            if (cData.deputy_teacher_id) {
              const { data: dData } = await supabase.from('user_profiles').select('id, name, email').eq('id', cData.deputy_teacher_id).maybeSingle();
              if (dData) setDeputyTeacher(dData as any);
            }

            // Fetch Notes
            const { data: nData } = await supabase.from('student_notes').select('*').eq('student_id', targetStudentId).eq('class_id', selectedClassId).maybeSingle();
            if (nData) {
              setNotes(nData as StudentNotes);
            } else {
              setNotes(null);
            }

            // Fetch Class Notes
            const { data: cnData } = await supabase.from('class_overall_notes').select('*').eq('class_id', selectedClassId).maybeSingle();
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
          {renderTextWithMailLinks(content)}
        </div>
      </div>
    </div>
  );

  if (loading) return <div className="flex-1 flex items-center justify-center p-8 text-gray-400 font-bold uppercase text-xs tracking-widest">Učitavanje...</div>;

  return (
    <div className="flex-1 overflow-auto bg-white">
      <div className="w-full p-4 md:p-5 space-y-4">

        <div className="space-y-6">
          <div className="border-b border-gray-300 pb-2">
            <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Opće bilješke razreda</h4>
          </div>

          {/* 1. Razrednik */}
          {homeroomTeacher && (
              <div className="space-y-2">
                <h3 className="text-base font-bold text-slate-900">Razrednik</h3>
                <div className="bg-white border border-gray-200 rounded-md p-3 shadow-sm">
                 <div className="flex flex-wrap items-baseline gap-2 text-[13px]">
                  <span className="font-bold text-[14px] text-gray-900">{homeroomTeacher.name}</span>
                  {homeroomTeacher.email && (
                    <a href={`mailto:${homeroomTeacher.email}`} className="text-gray-500 text-[12px] no-underline hover:text-[#005c8d]">
                      {homeroomTeacher.email}
                    </a>
                  )}
                </div>
                {classNotes?.homeroomInfo && (
                    <div className="text-[12px] text-gray-600 leading-relaxed whitespace-pre-wrap mt-2 pt-2 border-t border-gray-100">{renderTextWithMailLinks(classNotes.homeroomInfo)}</div>
                )}
                </div>
              </div>
          )}

          {/* 2. Zamjenik razrednika */}
          {deputyTeacher && (
              <div className="space-y-2">
                <h3 className="text-base font-bold text-slate-900">Zamjenik razrednika</h3>
                <div className="bg-white border border-gray-200 rounded-md p-3 shadow-sm">
                <div className="flex flex-wrap items-baseline gap-2 text-[13px]">
                  <span className="font-bold text-[14px] text-gray-900">{deputyTeacher.name}</span>
                  {deputyTeacher.email && (
                    <a href={`mailto:${deputyTeacher.email}`} className="text-gray-500 text-[12px] no-underline hover:text-[#005c8d]">
                      {deputyTeacher.email}
                    </a>
                  )}
                </div>
                {classNotes?.deputyInfo && (
                  <div className="text-[12px] text-gray-600 leading-relaxed whitespace-pre-wrap mt-2 pt-2 border-t border-gray-100">{renderTextWithMailLinks(classNotes.deputyInfo)}</div>
                )}
                </div>
              </div>
          )}

          <div className="border-b border-gray-300 pb-2 pt-4">
            <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Osobne bilješke</h4>
          </div>

          {/* 3. Bilješka razrednika */}
          <Section 
            title="Bilješka razrednika" 
            content={notes?.homeroomNote}
          />

          {/* 4. Izvanškolske aktivnosti */}
          <Section 
            title="Izvanškolske aktivnosti" 
            content={notes?.extracurricularActivities}
          />

          {/* 5. Izvannastavne aktivnosti */}
          <Section 
            title="Izvannastavne aktivnosti" 
            content={notes?.schoolActivities}
          />

          {/* 6. Vladanje */}
          <div className="space-y-1">
            <h3 className="text-[11px] font-black uppercase text-gray-500 tracking-tight">Vladanje</h3>
            <div className="bg-white border border-gray-300 p-3 text-[12px] min-h-[40px] shadow-sm">
              {studentYearSummary?.finalizedAt ? (
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
            content={notes?.disciplinaryActions}
          />
        </div>
      </div>
    </div>
  );
}
