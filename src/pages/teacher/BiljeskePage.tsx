import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useSelection } from '../../contexts/SelectionContext';
import { User, StudentNote, Class, ClassNotes, StudentNotes } from '../../types';
import { cn, formatName, getSurname, matchesSearch, sortStudentsBySurname, formatSubjectDisplayName } from '../../lib/utils';
import { MessageSquare, Plus, Search, Calendar, User as UserIcon, Edit2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { mappers, mapList } from '../../lib/mappers';

// Modal component for editing Notes
const NotesModal = ({ isOpen, onClose, title, content, onSave, loading }: { isOpen: boolean, onClose: () => void, title: string, content: string, onSave: (val: string) => void, loading: boolean }) => {
  const [val, setVal] = useState(content);
  useEffect(() => setVal(content), [content]);
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white max-w-lg w-full p-6 shadow-xl">
        <h3 className="font-bold text-lg mb-4">{title}</h3>
        <textarea className="w-full h-32 border border-gray-300 p-2 text-sm mb-4" value={val} onChange={e => setVal(e.target.value)} />
        <div className="flex justify-end gap-2">
          <button className="px-4 py-2 border border-gray-300 text-sm font-bold" onClick={onClose}>Odustani</button>
          <button className="px-4 py-2 bg-[#005c8d] text-white text-sm font-bold" onClick={() => onSave(val)} disabled={loading}>{loading ? 'Spremanje...' : 'Spremi'}</button>
        </div>
      </div>
    </div>
  );
};

export default function BiljeskePage() {
  console.log("CLASS BILJESKE PAGE RENDERED");
  const { classId: routeClassId, studentId } = useParams<{ classId: string, studentId?: string }>();
  const { user } = useAuth();
  const { selectedClassId: contextClassId } = useSelection();
  
  const effectiveClassId = contextClassId || routeClassId;

  const [notes, setNotes] = useState<StudentNote[]>([]);
  const [students, setStudents] = useState<User[]>([]);
  const [subjects, setSubjects] = useState<{id: string, name: string}[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeClass, setActiveClass] = useState<Class | null>(null);
  const [classNotes, setClassNotes] = useState<ClassNotes | null>(null);
  const [studentOverallNotes, setStudentOverallNotes] = useState<StudentNotes[]>([]);

  // Editing state
  const [editTarget, setEditTarget] = useState<{ type: 'HOMEROOM' | 'DEPUTY' | 'STUDENT', field: string, id: string, studentId?: string, initialValue: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (effectiveClassId) {
      fetchData();
    }
  }, [effectiveClassId]);

  useEffect(() => {
    if (studentId && students.length > 0) {
      const found = students.find(s => s.id === studentId);
      if (found) {
        setSearchTerm(`${found.surname || ''} ${found.name || ''}`.trim());
      }
    }
  }, [studentId, students]);

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
      const uniqueStudents = Array.from(new Map(studentsList.map(s => [s.id, s])).values());
      setStudents(sortStudentsBySurname(uniqueStudents));


      // 3. Fetch Subjects
      const { data: subData } = await supabase.from('subjects').select('id, name');
      const { data: classSubjs } = await supabase
        .from('class_subjects')
        .select('subject_id, subject_type')
        .eq('class_id', effectiveClassId || '');

      const csMap = new Map<string, string>();
      if (classSubjs) {
        for (const cs of classSubjs) {
          csMap.set(cs.subject_id, cs.subject_type || 'REQUIRED');
        }
      }

      const formatted = (subData || []).map((s: any) => ({
        ...s,
        name: formatSubjectDisplayName(s.name, csMap.get(s.id) || 'REQUIRED')
      }));
      setSubjects(formatted);

      // 4. Fetch Dnevničke Bilješke (student_notes)
      const { data: notesData } = await supabase
        .from('student_notes')
        .select(`*`)
        .eq('class_id', effectiveClassId)
        .order('date', { ascending: false });
      if (notesData) setNotes(mapList(notesData, mappers.studentNote));

      // 5. Fetch Class Level Notes
      const { data: cnData } = await supabase
        .from('class_overall_notes')
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

  const handleSaveNote = async (val: string) => {
    if (!editTarget) return;
    setIsSaving(true);
    try {
      if (editTarget.type === 'HOMEROOM' || editTarget.type === 'DEPUTY') {
        // Handle ClassNotes
        if (classNotes?.id) {
          const { error } = await supabase.from('class_overall_notes').update({
            [editTarget.field]: val
          }).eq('id', classNotes.id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from('class_overall_notes').insert({
            class_id: effectiveClassId,
            school_year: activeClass?.schoolYear || '2024/2025',
            [editTarget.field]: val
          });
          if (error) throw error;
        }
      } else if (editTarget.type === 'STUDENT') {
        // Handle StudentNotes
        if (editTarget.id !== 'new') {
          const { error } = await supabase.from('student_overall_notes').update({
            [editTarget.field]: val
          }).eq('id', editTarget.id);
          if (error) throw error;
        } else {
          // New student note record
          const { error } = await supabase.from('student_overall_notes').insert({
            student_id: editTarget.studentId,
            class_id: effectiveClassId,
            school_year: activeClass?.schoolYear || '2024/2025',
            [editTarget.field]: val
          });
          if (error) throw error;
        }
      }
      
      toast.success('Bilješka spremljena');
      fetchData();
      setEditTarget(null);
    } catch (err: any) {
      toast.error('Greška pri spremanju: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const filteredNotes = notes.filter(note => {
    const student = students.find(s => s.id === note.studentId);
    const studentName = student ? (student.name || '') : '';
    const content = note.content;
    const category = (note.category || '');
    return matchesSearch(studentName, searchTerm) || 
           matchesSearch(content, searchTerm) || 
           matchesSearch(category, searchTerm);
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full p-20 text-gray-400 font-bold uppercase text-[10px] tracking-widest animate-pulse">
        Učitavanje podataka...
      </div>
    );
  }

  if (students.length === 0 && (!classNotes || (!classNotes.homeroomInfo && !classNotes.deputyInfo))) {
    return (
      <div className="p-8 font-sans">
        <h1 className="text-xl font-bold mb-2">Bilješke</h1>
        <p className="text-gray-500">Bilješke nisu unesene.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white font-sans">
      <NotesModal isOpen={!!editTarget} onClose={() => setEditTarget(null)} title={editTarget?.type === 'HOMEROOM' ? 'Uredi bilješku razrednika' : 'Uredi bilješku zamjenika'} content={editTarget?.initialValue || ''} onSave={val => handleSaveNote(val)} loading={isSaving} />
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
        <section className="w-full space-y-4">
          <div className="flex items-center gap-2 border-b-2 border-gray-200 pb-1">
             <Calendar size={14} className="text-gray-400"/>
             <h3 className="text-[11px] font-black text-gray-400 uppercase tracking-widest">Službene bilješke razreda</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white border border-gray-300 p-4 shadow-sm relative">
               <div className="text-[10px] font-black text-[#005c8d] uppercase mb-2">Razrednik</div>
               <div className="text-[12px] font-bold text-gray-700 whitespace-pre-wrap">{classNotes?.homeroomInfo || 'Nema upisanih podataka'}</div>
               {(isHomeroom) && (
                 <button className="absolute top-2 right-2 text-gray-400 hover:text-[#005c8d]" onClick={() => setEditTarget({ type: 'HOMEROOM', field: 'homeroom_info', id: classNotes?.id || '', initialValue: classNotes?.homeroomInfo || '' })}><Edit2 size={14}/></button>
               )}
            </div>
            <div className="bg-white border border-gray-300 p-4 shadow-sm relative">
               <div className="text-[10px] font-black text-[#005c8d] uppercase mb-2">Zamjenik razrednika</div>
               <div className="text-[12px] font-bold text-gray-700 whitespace-pre-wrap">{classNotes?.deputyInfo || 'Nema upisanih podataka'}</div>
               {(isDeputy) && (
                 <button className="absolute top-2 right-2 text-gray-400 hover:text-[#005c8d]" onClick={() => setEditTarget({ type: 'DEPUTY', field: 'deputy_info', id: classNotes?.id || '', initialValue: classNotes?.deputyInfo || '' })}><Edit2 size={14}/></button>
               )}
            </div>
          </div>
        </section>

        {/* Individual Student Overall Notes Section */}
        <section className="w-full space-y-4">
          <div className="flex items-center gap-2 border-b-2 border-gray-200 pb-1">
             <UserIcon size={14} className="text-gray-400"/>
             <h3 className="text-[11px] font-black text-gray-400 uppercase tracking-widest">Aktivnosti i pedagoške mjere</h3>
          </div>
          <div className="grid grid-cols-1 gap-6">
            {sortStudentsBySurname(students).map(s => {
              const son = studentOverallNotes.find(n => n.studentId === s.id);
              
              return (
                <div key={s.id} className="bg-white border border-gray-300 shadow-sm overflow-hidden">
                  <div className="bg-gray-100 px-4 py-2 border-b border-gray-200 flex justify-between items-center">
                    <span className="text-[11px] font-black text-[#005c8d] uppercase tracking-tighter">{formatName(s)}</span>
                  </div>
                  <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                    {[
                      {label: 'Izvannastavne aktivnosti', field: 'school_activities', val: son?.schoolActivities},
                      {label: 'Izvanškolske aktivnosti', field: 'extracurricular_activities', val: son?.extracurricularActivities},
                      {label: 'Pedagoške mjere', field: 'disciplinary_actions', val: son?.disciplinaryActions},
                      {label: 'Bilješka razrednika', field: 'homeroom_note', val: son?.homeroomNote},
                    ].map(item => (
                      <div key={item.field} className="space-y-1 relative group border border-transparent p-2 hover:border-gray-200">
                        <div className="text-[9px] font-black text-gray-400 uppercase">{item.label}</div>
                        <div className="text-[11px] font-bold text-gray-600 min-h-[1.5em]">{item.val || '-'}</div>
                        {(isHomeroom || isDeputy) && (
                          <button className="absolute top-2 right-2 text-gray-300 group-hover:text-[#005c8d] opacity-0 group-hover:opacity-100" 
                                  onClick={() => setEditTarget({ type: 'STUDENT', field: item.field, id: son?.id || 'new', studentId: s.id, initialValue: item.val || '' })}>
                             <Edit2 size={12}/>
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Standard Journal Notes Section */}
        <section className="w-full space-y-4">
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
                      <span className="text-[10px] font-black uppercase tracking-tight">{student?.name}</span>
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
