import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useSelection } from '../../contexts/SelectionContext';
import { User, StudentNote, Class, ClassNotes, StudentNotes } from '../../types';
import { cn } from '../../lib/utils';
import { MessageSquare, Plus, Search, Calendar, User as UserIcon } from 'lucide-react';
import toast from 'react-hot-toast';
import { mappers, mapList } from '../../lib/mappers';

export default function BiljeskePage() {
  const { classId: routeClassId } = useParams<{ classId: string }>();
  const { user } = useAuth();
  
  const effectiveClassId = routeClassId;

  const [notes, setNotes] = useState<StudentNote[]>([]);
  const [students, setStudents] = useState<User[]>([]);
  const [subjects, setSubjects] = useState<{id: string, name: string}[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeClass, setActiveClass] = useState<Class | null>(null);
  const [classNotes, setClassNotes] = useState<ClassNotes | null>(null);
  const [studentOverallNotes, setStudentOverallNotes] = useState<StudentNotes[]>([]);

  useEffect(() => {
    if (effectiveClassId) {
      fetchData();
    }
  }, [effectiveClassId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. Fetch Class Info
      const { data: classData } = await supabase
        .from('classes')
        .select('*')
        .eq('id', effectiveClassId)
        .maybeSingle();
      if (classData) setActiveClass(mappers.class(classData));

      // 2. Fetch Students
      const { data: enrollData } = await supabase
        .from('student_class_enrollments')
        .select('student:user_profiles(*)')
        .eq('class_id', effectiveClassId)
        .eq('status', 'ACTIVE');

      const studentsList = (enrollData || []).map((e: any) => mappers.user(e.student)).filter(Boolean);
      setStudents(studentsList);

      // 3. Fetch Subjects
      const { data: subData } = await supabase.from('subjects').select('id, name');
      setSubjects(subData || []);

      // 4. Fetch Dnevničke Bilješke (student_notes)
      const { data: notesData } = await supabase
        .from('student_notes')
        .select(`*`)
        .eq('class_id', effectiveClassId)
        .order('date', { ascending: false });
      if (notesData) setNotes(mapList(notesData, mappers.studentNote));

      // 5. Fetch Class Level Notes
      const { data: cnData } = await supabase
        .from('class_notes')
        .select('*')
        .eq('class_id', effectiveClassId)
        .maybeSingle();
      if (cnData) setClassNotes(mappers.classOverallNotes(cnData));

      // 6. Fetch Student Overall Notes
      const { data: snData } = await supabase
        .from('student_overall_notes')
        .select('*')
        .eq('class_id', effectiveClassId);
      if (snData) setStudentOverallNotes(mapList(snData, mappers.studentOverallNotes));

    } catch (error) {
      console.error(error);
      toast.error('Greška pri učitavanju bilježaka');
    } finally {
      setLoading(false);
    }
  };

  const isHomeroom = user?.id === activeClass?.homeroomTeacherId;
  const isDeputy = user?.id === activeClass?.deputyTeacherId;

  const filteredNotes = notes.filter(note => {
    const student = students.find(s => s.id === note.studentId);
    const studentName = student ? (student.name + ' ' + (student.surname || '')).toLowerCase() : '';
    const content = note.content.toLowerCase();
    const category = (note.category || '').toLowerCase();
    const matchesSearch = studentName.includes(searchTerm.toLowerCase()) || 
                         content.includes(searchTerm.toLowerCase()) || 
                         category.includes(searchTerm.toLowerCase());
    return matchesSearch;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full p-20 text-gray-400 font-bold uppercase text-[10px] tracking-widest animate-pulse">
        Učitavanje podataka...
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white font-sans">
      <div className="bg-[#f8f9fa] border-b border-gray-300 p-6 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-black text-gray-800 uppercase tracking-tighter flex items-center gap-2">
              <MessageSquare size={20} className="text-[#005c8d]" />
              Bilješke - {activeClass?.name}
            </h2>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">Pregled pedagoških bilježaka, aktivnosti i službenih podataka razreda</p>
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" size={16} />
          <input 
            type="text" 
            placeholder="Traži po imenu, sadržaju ili kategoriji (npr. Pedagoška mjera)..." 
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-3 border border-gray-300 text-xs font-bold uppercase placeholder:text-gray-300 focus:border-[#005c8d] outline-none"
          />
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6 bg-gray-50 space-y-8">
        {/* Class Level Notes Section */}
        <section className="max-w-4xl mx-auto space-y-4">
          <div className="flex items-center gap-2 border-b-2 border-gray-200 pb-1">
             <Calendar size={14} className="text-gray-400"/>
             <h3 className="text-[11px] font-black text-gray-400 uppercase tracking-widest">Službene bilješke razreda</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white border border-gray-300 p-4 shadow-sm">
               <div className="text-[10px] font-black text-[#005c8d] uppercase mb-2">Razrednik</div>
               <div className="text-[12px] font-bold text-gray-700 whitespace-pre-wrap">{classNotes?.homeroomInfo || 'Nema upisanih podataka'}</div>
            </div>
            <div className="bg-white border border-gray-300 p-4 shadow-sm">
               <div className="text-[10px] font-black text-[#005c8d] uppercase mb-2">Zamjenik razrednika</div>
               <div className="text-[12px] font-bold text-gray-700 whitespace-pre-wrap">{classNotes?.deputyInfo || 'Nema upisanih podataka'}</div>
            </div>
          </div>
        </section>

        {/* Individual Student Overall Notes Section */}
        <section className="max-w-4xl mx-auto space-y-4">
          <div className="flex items-center gap-2 border-b-2 border-gray-200 pb-1">
             <UserIcon size={14} className="text-gray-400"/>
             <h3 className="text-[11px] font-black text-gray-400 uppercase tracking-widest">Aktivnosti i pedagoške mjere</h3>
          </div>
          <div className="grid grid-cols-1 gap-6">
            {students.sort((a,b) => a.surname?.localeCompare(b.surname || '') || 0).map(s => {
              const son = studentOverallNotes.find(n => n.studentId === s.id);
              if (!son || (!son.schoolActivities && !son.extracurricularActivities && !son.disciplinaryActions && !son.homeroomNote)) return null;
              
              return (
                <div key={s.id} className="bg-white border border-gray-300 shadow-sm overflow-hidden">
                  <div className="bg-gray-100 px-4 py-2 border-b border-gray-200 flex justify-between items-center">
                    <span className="text-[11px] font-black text-[#005c8d] uppercase tracking-tighter">{s.surname} {s.name}</span>
                  </div>
                  <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {son.schoolActivities && (
                      <div className="space-y-1">
                        <div className="text-[9px] font-black text-gray-400 uppercase">Izvannastavne aktivnosti</div>
                        <div className="text-[11px] font-bold text-gray-600">{son.schoolActivities}</div>
                      </div>
                    )}
                    {son.extracurricularActivities && (
                      <div className="space-y-1">
                        <div className="text-[9px] font-black text-gray-400 uppercase">Izvanškolske aktivnosti</div>
                        <div className="text-[11px] font-bold text-gray-600">{son.extracurricularActivities}</div>
                      </div>
                    )}
                    {son.disciplinaryActions && (
                      <div className="space-y-1">
                        <div className="text-[9px] font-black text-red-400 uppercase">Pedagoške mjere</div>
                        <div className="text-[11px] font-bold text-red-700">{son.disciplinaryActions}</div>
                      </div>
                    )}
                     {son.homeroomNote && (
                      <div className="space-y-1">
                        <div className="text-[9px] font-black text-gray-400 uppercase">Bilješka razrednika</div>
                        <div className="text-[11px] font-bold text-gray-600 italic">"{son.homeroomNote}"</div>
                      </div>
                    )}
                  </div>
                </div>
              );
            }).filter(Boolean)}
          </div>
        </section>

        {/* Standard Journal Notes Section */}
        <section className="max-w-4xl mx-auto space-y-4">
          <div className="flex items-center gap-2 border-b-2 border-gray-200 pb-1">
             <MessageSquare size={14} className="text-gray-400"/>
             <h3 className="text-[11px] font-black text-gray-400 uppercase tracking-widest">Dnevnički zapisi (Bilješke po predmetima)</h3>
          </div>
          <div className="space-y-4">
            {filteredNotes.length > 0 ? filteredNotes.map(note => {
              const student = students.find(s => s.id === note.studentId);
              const subject = subjects.find(sub => sub.id === note.subjectId);
              return (
              <div key={note.id} className="bg-white border border-gray-300 shadow-sm overflow-hidden flex flex-col">
                 <div className="bg-[#005c8d] px-4 py-2 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-white">
                      <UserIcon size={12} className="opacity-50" />
                      <span className="text-[10px] font-black uppercase tracking-tight">{student?.name} {student?.surname}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[9px] font-black uppercase bg-white/20 text-white px-2 py-0.5">
                        {subject?.name || note.category || 'Opća bilješka'}
                      </span>
                      <span className="text-[9px] font-black uppercase text-white/60">
                        {new Date(note.date).toLocaleDateString('hr-HR')}
                      </span>
                    </div>
                 </div>
                 <div className="p-4 bg-white text-[12px] text-gray-800 leading-relaxed font-bold">
                    {note.content}
                 </div>
                 <div className="px-4 py-1.5 bg-gray-50 border-t border-gray-100 flex justify-between items-center">
                    <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Službeni e-Dnevnik zapis</span>
                 </div>
              </div>
            )}) : (
              <div className="p-12 text-center text-gray-400 uppercase font-bold text-[10px] italic tracking-widest bg-white border border-gray-200 border-dashed">
                Nema pronađenih bilježaka
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
