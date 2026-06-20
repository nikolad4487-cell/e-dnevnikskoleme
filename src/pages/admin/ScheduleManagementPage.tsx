import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useSelection } from '../../contexts/SelectionContext';
import { Class, Subject, User, Role } from '../../types';
import { mappers, mapList } from '../../lib/mappers';
import { useAuth } from '../../contexts/AuthContext';
import { 
  ChevronLeft, 
  Plus, 
  Trash2, 
  Search, 
  Clock, 
  Save,
  Download,
  Printer,
  CalendarDays,
  X,
  AlertTriangle,
  HelpCircle,
  Pencil
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { formatSubjectDisplayName } from '../../lib/utils';

const DAYS = [
  { id: 'MONDAY', name: 'Ponedjeljak' },
  { id: 'TUESDAY', name: 'Utorak' },
  { id: 'WEDNESDAY', name: 'Srijeda' },
  { id: 'THURSDAY', name: 'Četvrtak' },
  { id: 'FRIDAY', name: 'Petak' }
];

const PERIODS = [0, 1, 2, 3, 4, 5, 6, 7];

export default function ScheduleManagementPage() {
  const { selectedSchoolId } = useSelection();
  const { isMainAdmin, userSchoolRoles } = useAuth();
  const navigate = useNavigate();
  const [classes, setClasses] = useState<Class[]>([]);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [subjects, setSubjects] = useState<any[]>([]); // Subjects assigned to this class
  const [schedule, setSchedule] = useState<any[]>([]); // Schedule entries
  const [loading, setLoading] = useState(false);
  const [shift, setShift] = useState<'MORNING' | 'AFTERNOON'>('MORNING');

  // Assignment Modal States
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [selectedDay, setSelectedDay] = useState('');
  const [selectedPeriod, setSelectedPeriod] = useState(1);
  const [modalSubjectAssignmentId, setModalSubjectAssignmentId] = useState('');
  const [modalConsecutive, setModalConsecutive] = useState(1);
  const [modalClassroom, setModalClassroom] = useState('');
  const [validationError, setValidationError] = useState('');
  const [conflicts, setConflicts] = useState<{ period: number; subjectName: string }[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [editingSubjectId, setEditingSubjectId] = useState<string | null>(null);

  // Delete/Clear Block Modal States
  const [isDeleteBlockModalOpen, setIsDeleteBlockModalOpen] = useState(false);
  const [deleteCellId, setDeleteCellId] = useState('');
  const [deleteSubjectId, setDeleteSubjectId] = useState('');
  const [deleteSubjectName, setDeleteSubjectName] = useState('');
  const [deleteDay, setDeleteDay] = useState('');

  const isAnyAdmin = isMainAdmin || userSchoolRoles.some(r => r.schoolId === selectedSchoolId && (r.role === Role.SCHOOL_ADMIN || r.role === Role.ADMIN));

  useEffect(() => {
    if (!selectedSchoolId) {
      navigate('/admin/schools');
      return;
    }
    fetchClasses();
  }, [selectedSchoolId]);

  useEffect(() => {
    if (selectedClassId) {
      fetchClassData();
    }
  }, [selectedClassId, shift]);

  const fetchClasses = async () => {
    if (!selectedSchoolId) return;
    const { data } = await supabase
      .from('classes')
      .select('*')
      .eq('school_id', selectedSchoolId)
      .order('name');
    
    if (data) {
      setClasses(mapList(data, mappers.class));
    }
  };

  const fetchClassData = async () => {
    try {
      setLoading(true);
      
      // Fetch Subject Types to format names correctly
      const { data: basicClassSubjects } = await supabase
        .from('class_subjects')
        .select('subject_id, subject_type')
        .eq('class_id', selectedClassId);

      const csMap = new Map<string, string>();
      const validSubjectIds = new Set<string>();
      if (basicClassSubjects) {
        for (const cs of basicClassSubjects) {
          csMap.set(cs.subject_id, cs.subject_type || 'REQUIRED');
          validSubjectIds.add(cs.subject_id);
        }
      }

      // 1. Fetch Class Subjects (Metadata - Canonical list)
      console.log("selectedSchoolId:", selectedSchoolId);
      console.log("selectedClassId:", selectedClassId);
      const { data: classSubjectsRaw, error: csError } = await supabase
        .from('class_subjects')
        .select(`
          subject_id, 
          subject_type,
          subject:subjects(id, name, code)
        `)
        .eq('class_id', selectedClassId)
        .eq('school_id', selectedSchoolId);
      
      console.log("classSubjectsRaw:", classSubjectsRaw);
      console.log("DEBUG: classSubjectsError:", csError);

      // 2. Fetch Assignments to join teachers
      console.log("DEBUG: Fetching class_subject_teachers for classId:", selectedClassId, "schoolId:", selectedSchoolId);
      const { data: assignments, error: assignError } = await supabase
        .from('class_subject_teachers')
        .select(`
          subject_id,
          teacher_id,
          teacher:user_profiles(id, name)
        `)
        .eq('class_id', selectedClassId)
        .eq('school_id', selectedSchoolId);

      console.log("DEBUG: assignments:", assignments);
      console.log("DEBUG: assignError:", assignError);

      const teacherMap = new Map<string, any>();
      (assignments || []).forEach(a => {
        teacherMap.set(a.subject_id, a.teacher);
      });

      const formattedClassSubjects = (classSubjectsRaw || []).map((cs: any) => {
        const typeValue = cs.subject_type || 'REQUIRED';
        return {
          id: cs.subject_id, // Subject ID used for assignment selection
          subject: cs.subject ? {
            ...cs.subject,
            name: formatSubjectDisplayName(cs.subject.name, typeValue)
          } : null,
          teacher: teacherMap.get(cs.subject_id)
        };
      });
      console.log("DEBUG: Final classSubjectsRaw before formatting:", classSubjectsRaw);
      console.log("DEBUG: Final formattedClassSubjects:", formattedClassSubjects);
      setSubjects(formattedClassSubjects);

      // 2. Fetch Schedule Cells
      const { data: cells } = await supabase
        .from('schedule_cells')
        .select(`
          *,
          subjects:schedule_cell_subjects(
            *,
            subject:subjects(id, name, code),
            teacher:user_profiles(id, name)
          )
        `)
        .eq('class_id', selectedClassId)
        .eq('school_id', selectedSchoolId)
        .eq('shift', shift);
      
      const formattedCells = (cells || []).map(cell => {
        const formattedCellSubjects = (cell.subjects || []).map((cs: any) => {
          const typeValue = csMap.get(cs.subject?.id || '') || 'REQUIRED';
          return {
            ...cs,
            subject: cs.subject ? {
              ...cs.subject,
              name: formatSubjectDisplayName(cs.subject.name, typeValue)
            } : null
          };
        });
        return {
          ...cell,
          subjects: formattedCellSubjects
        };
      });
      setSchedule(formattedCells);
    } catch (err: any) {
      toast.error('Problem kod učitavanja rasporeda');
    } finally {
      setLoading(false);
    }
  };

  const openAssignModal = (dayId: string, periodNumber: number) => {
    setSelectedDay(dayId);
    setSelectedPeriod(periodNumber);
    setModalSubjectAssignmentId('');
    setModalConsecutive(1);
    setModalClassroom('');
    setValidationError('');
    setConflicts([]);
    setEditingSubjectId(null);
    setIsAssignModalOpen(true);
  };

  const handleBulkAssign = async (bypassConflicts = false) => {
    if (!modalSubjectAssignmentId) {
      setValidationError('Molimo odaberite predmet.');
      return;
    }

    const assignment = subjects.find(s => s.id === modalSubjectAssignmentId);
    if (!assignment) {
      setValidationError('Neispravan odabir predmeta.');
      return;
    }

    if (editingSubjectId) {
      try {
        setIsSaving(true);
        const { error } = await supabase
          .from('schedule_cell_subjects')
          .update({
            subject_id: assignment.id,
            teacher_id: assignment.teacher?.id || null,
            classroom: modalClassroom || null
          })
          .eq('id', editingSubjectId);

        if (error) throw error;
        toast.success('Predmet uspješno izmijenjen');
        setIsAssignModalOpen(false);
        setEditingSubjectId(null);
        fetchClassData();
      } catch (err: any) {
        toast.error(err.message);
      } finally {
        setIsSaving(false);
      }
      return;
    }

    const start = selectedPeriod;
    const count = Number(modalConsecutive);
    const end = start + count - 1;

    if (end > 7) {
      setValidationError(`Nema dovoljno preostalih sati u danu. Maksimalna pozicija je 7. sat (odabrali ste do ${end}. sata).`);
      return;
    }

    setValidationError('');

    // Check for occupied slots
    if (!bypassConflicts) {
      const foundConflicts: { period: number; subjectName: string }[] = [];
      for (let p = start; p <= end; p++) {
        const cell = schedule.find(c => c.day_of_week === selectedDay && c.period_number === p);
        // NEW: Check if the specific subject is ALREADY assigned in this cell
        const isAlreadyAssigned = cell?.subjects?.some((s: any) => s.subject_id === assignment.id);
        if (isAlreadyAssigned) {
          foundConflicts.push({
            period: p,
            subjectName: assignment.subject?.name || 'Nepoznat predmet'
          });
        }
      }

      if (foundConflicts.length > 0) {
        setConflicts(foundConflicts);
        return; // Triggers displaying conflict warning step inside the modal
      }
    }

    try {
      setIsSaving(true);
      const payload = {
          classId: selectedClassId,
          dayOfWeek: selectedDay,
          shift,
          startPeriod: start,
          consecutivePeriods: count,
          subjectId: assignment.id,
          teacherId: assignment.teacher?.id || null,
          classroom: modalClassroom || null,
          shouldAdd: true
        };
      console.log("FRONTEND PAYLOAD", JSON.stringify(payload, null, 2));
      const res = await fetch('/api/admin/bulk-schedule-assign', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const resData = await res.json();
      if (!res.ok || !resData.success) {
        throw new Error(resData.error || 'Neuspjelo spremanje rasporeda.');
      }

      toast.success('Raspored uspješno spremljen');
      setIsAssignModalOpen(false);
      fetchClassData();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteClick = (cell: any, assignedSubject: any, dayId: string) => {
    if (!isAnyAdmin) {
      toast.error('Nemate dozvolu za brisanje rasporeda.');
      return;
    }

    const subjectId = assignedSubject.subject_id;
    // Check if there are other cells on the same day with matching subject to trigger block-delete question
    const sameSubjectCells = schedule.filter(c => 
      c.day_of_week === dayId && 
      c.subjects?.some((s: any) => s.subject_id === subjectId)
    );

    if (sameSubjectCells.length > 1) {
      setDeleteCellId(cell.id);
      setDeleteSubjectId(subjectId);
      setDeleteSubjectName(assignedSubject.subject?.name || 'predmeta');
      setDeleteDay(dayId);
      setIsDeleteBlockModalOpen(true);
    } else {
      clearCell(cell.id);
    }
  };

  const clearCell = async (cellId: string) => {
    if (!isAnyAdmin) {
      toast.error('Nemate dozvolu za mijenjanje rasporeda.');
      return;
    }
    try {
      const { error } = await supabase.from('schedule_cell_subjects').delete().eq('schedule_cell_id', cellId);
      if (error) throw error;
      toast.success('Sat obrisan iz rasporeda');
      fetchClassData();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleBulkDelete = async () => {
    try {
      setIsSaving(true);
      const searchParams = new URLSearchParams({
        classId: selectedClassId,
        dayOfWeek: deleteDay,
        shift,
        subjectId: deleteSubjectId
      });

      const res = await fetch(`/api/admin/bulk-schedule-assign?${searchParams.toString()}`, {
        method: 'DELETE'
      });

      const resData = await res.json();
      if (!res.ok || !resData.success) {
        throw new Error(resData.error || 'Neuspjelo brisanje bloka.');
      }

      toast.success('Cijeli blok predmeta je uspješno obrisan.');
      setIsDeleteBlockModalOpen(false);
      fetchClassData();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="p-6 font-sans w-full">
      <div className="flex justify-between items-end mb-8 border-b-2 border-slate-100 pb-6">
        <div>
          <button 
            onClick={() => navigate('/admin-skole')}
            className="flex items-center gap-1 text-slate-400 hover:text-slate-600 transition-colors uppercase font-black text-[9px] tracking-widest mb-4"
          >
            <ChevronLeft size={12} strokeWidth={3} />
            Natrag na pregled
          </button>
          <h1 className="text-3xl font-black text-slate-900 tracking-tighter uppercase leading-none mb-2">Raspored sati</h1>
          <p className="text-slate-500 font-medium text-sm">Upravljanje tjednim rasporedom sati po razrednim odjelima</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div>
          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Razredni odjel</label>
          <select 
            value={selectedClassId}
            onChange={e => setSelectedClassId(e.target.value)}
            className="w-full bg-white border-2 border-slate-200 rounded-xl p-4 font-bold text-slate-900 outline-none focus:border-[#005c8d] shadow-sm"
          >
             <option value="">Odaberi razred...</option>
             {classes.map(c => (
               <option key={c.id} value={c.id}>{c.name}</option>
             ))}
          </select>
        </div>

        <div>
           <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Smjena</label>
           <div className="flex bg-slate-100 p-1 rounded-xl gap-1 h-[58px]">
              <button 
                onClick={() => setShift('MORNING')}
                className={`flex-1 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${shift === 'MORNING' ? 'bg-white text-[#005c8d] shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
              >
                Jutarnja
              </button>
              <button 
                onClick={() => setShift('AFTERNOON')}
                className={`flex-1 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${shift === 'AFTERNOON' ? 'bg-white text-[#005c8d] shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
              >
                Popodnevna
              </button>
           </div>
        </div>
      </div>

      {!selectedClassId ? (
          <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-3xl p-20 text-center">
            <CalendarDays size={48} className="text-slate-200 mx-auto mb-4" />
            <p className="text-slate-300 font-black uppercase tracking-widest text-xs">Odaberite razredni odjel za prikaz rasporeda</p>
          </div>
      ) : loading ? (
        <div className="p-20 text-center animate-pulse font-black uppercase text-slate-300 tracking-widest">Učitavanje rasporeda...</div>
      ) : (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-xl overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[900px]">
             <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-center">
                   <th className="p-4 w-16 border-r">#</th>
                   {DAYS.map(day => (
                     <th key={day.id} className="p-4 border-r">
                        <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">{day.name}</span>
                     </th>
                   ))}
                </tr>
             </thead>
             <tbody className="divide-y divide-slate-50">
                {PERIODS.map(num => (
                   <tr key={num} className="hover:bg-slate-50/30">
                      <td className="p-4 border-r text-center font-black text-slate-400 bg-slate-50/50">{num}.</td>
                      {DAYS.map(day => {
                        const cell = schedule.find(c => c.day_of_week === day.id && c.period_number === num);
                        const assignedSubject = cell?.subjects?.[0];
                        
                        return (
                          <td key={day.id} className="p-2 border-r group relative h-24">
                             {cell?.subjects && cell.subjects.length > 0 ? (
                           <div className="bg-blue-50 border border-blue-100 rounded-xl p-2 h-full flex flex-col justify-start text-center shadow-sm overflow-y-auto">
                             {cell.subjects.map((sub: any) => (
                               <div key={sub.id} className="border-b last:border-b-0 border-blue-100/50 py-1 relative group/subject">
                                  <div className="text-[10px] font-black text-blue-900 uppercase leading-none mb-0.5">{sub.subject?.name}</div>
                                  <div className="text-[8px] font-bold text-blue-500 uppercase leading-none truncate mb-0.5">{sub.teacher?.name}</div>
                                  {sub.classroom && (
                                    <span className="text-[8px] font-bold text-slate-500 uppercase bg-slate-200/50 rounded px-1">
                                      Uč: {sub.classroom}
                                    </span>
                                  )}
                                  <button 
                                    onClick={() => handleDeleteClick(cell, sub, day.id)}
                                    className={`absolute top-0 right-0 text-blue-300 hover:text-red-500 transition-colors opacity-0 group-hover/subject:opacity-100 ${!isAnyAdmin && 'hidden'}`}
                                  >
                                    <Trash2 size={10} />
                                  </button>
                               </div>
                             ))}
                           </div>
                         ) : (
                           isAnyAdmin ? (
                             <button 
                               onClick={() => openAssignModal(day.id, num)}
                               className="w-full h-full bg-slate-50 border-2 border-dashed border-slate-200 hover:border-[#005c8d]/50 hover:bg-[#005c8d]/5 hover:text-[#005c8d] rounded-xl flex items-center justify-center text-slate-400 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-all cursor-pointer text-xs font-black/50"
                               title="Dodaj sat"
                             >
                               <Plus size={16} />
                              </button>
                           ) : (
                             <div className="text-[9px] text-slate-200 uppercase font-black tracking-widest text-center py-2">—</div>
                           )
                         )}
                          </td>
                        );
                      })}
                   </tr>
                ))}
             </tbody>
          </table>
        </div>
      )}

      {selectedClassId && !loading && (
        <div className="mt-8 flex justify-end gap-3">
           <button className="flex items-center gap-2 px-6 py-3 bg-white border-2 border-slate-100 rounded-xl text-[10px] font-black uppercase text-slate-500 hover:bg-slate-50 transition-all">
             <Printer size={14} /> Ispis rasporeda
           </button>
           <button 
             onClick={() => fetchClassData()}
             className="flex items-center gap-2 px-6 py-3 bg-[#005c8d] text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg hover:shadow-xl transition-all"
           >
             <Save size={14} /> Spremi promjene
           </button>

      {/* Dynamic Bulk Lesson Assignment Modal */}
      {isAssignModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in animate-duration-150 text-left">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 max-w-md w-full overflow-hidden transform scale-100 transition-all font-sans text-left">
            {/* Header */}
            <div className="bg-slate-50 border-b border-slate-100 p-5 flex justify-between items-center text-left">
              <div>
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">
                  {conflicts.length > 0 ? 'Upozorenje o preklapanju' : 'Dodaj nastavu u raspored'}
                </h3>
                <p className="text-xs font-bold text-slate-400 mt-0.5">
                  {DAYS.find(d => d.id === selectedDay)?.name} — {selectedPeriod}. sat {shift === 'MORNING' ? '(Jutarnja)' : '(Popodnevna)'}
                </p>
              </div>
              <button 
                onClick={() => setIsAssignModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors"
                type="button"
              >
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            {conflicts.length > 0 ? (
              <div className="p-6 text-left">
                <div className="flex gap-3 bg-amber-50 border border-amber-100 rounded-xl p-4 mb-4 text-left">
                  <AlertTriangle className="text-amber-500 shrink-0 mt-0.5 animate-bounce" size={20} />
                  <div>
                    <h4 className="text-xs font-black text-amber-800 uppercase tracking-wide">Pronađeni su popunjeni sati</h4>
                    <p className="text-xs font-medium text-amber-600 mt-1">
                      Sljedeći predviđeni sati su već popunjeni u rasporedu:
                    </p>
                    <ul className="list-disc pl-4 text-xs font-bold text-amber-950 mt-2 space-y-1">
                      {conflicts.map(c => (
                        <li key={c.period}>{c.period}. sat ({c.subjectName})</li>
                      ))}
                    </ul>
                    <p className="text-xs font-medium text-amber-600 mt-2">
                      Želite li ih svejedno prepisati (stari unosi će biti pobrisani u korist novog)?
                    </p>
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-2 text-left">
                  <button
                    onClick={() => setConflicts([])}
                    className="px-4 py-2 bg-slate-50 border-2 border-slate-100 hover:bg-slate-100 rounded-xl text-xs font-black uppercase text-slate-500 transition-all font-sans"
                    type="button"
                  >
                    Natrag
                  </button>
                  <button
                    onClick={() => handleBulkAssign(true)}
                    disabled={isSaving}
                    className="px-4 py-2 bg-amber-700 hover:bg-amber-800 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-md font-sans"
                    type="button"
                  >
                    {isSaving ? 'Spremanje...' : 'Prepiši i spremi'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-6 space-y-4 text-left">
                {validationError && (
                  <div className="p-3 bg-red-50 border border-red-100 text-red-600 rounded-xl text-xs font-bold font-sans">
                    {validationError}
                  </div>
                )}

                {/* Existing subjects section */}
                {(() => {
                  const cell = schedule.find(c => c.day_of_week === selectedDay && c.period_number === selectedPeriod);
                  const existingCellSubjects = cell?.subjects || [];
                  if (existingCellSubjects.length === 0) return null;
                  return (
                    <div className="border border-slate-200 rounded-xl p-3 bg-slate-50/50 space-y-2">
                      <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Dodani predmeti u ovaj sat</h4>
                      <div className="space-y-1.5 max-h-48 overflow-y-auto">
                        {existingCellSubjects.map((sub: any) => (
                          <div key={sub.id} className="flex justify-between items-center bg-white p-2 rounded-lg border border-slate-100 text-xs shadow-sm">
                            <div className="flex-1 min-w-0 pr-2">
                              <span className="font-extrabold text-slate-800 break-words block">{sub.subject?.name}</span>
                              <span className="text-slate-400 font-bold block text-[10px] truncate">{sub.teacher?.name || 'Bez nastavnika'}</span>
                              {sub.classroom && <span className="text-[9px] font-bold text-slate-500 bg-slate-100 px-1 rounded mt-0.5 inline-block">Uč: {sub.classroom}</span>}
                            </div>
                            <div className="flex gap-1 shrink-0">
                              <button
                                onClick={() => {
                                  setEditingSubjectId(sub.id);
                                  setModalSubjectAssignmentId(sub.subject_id);
                                  setModalClassroom(sub.classroom || '');
                                }}
                                className="text-blue-500 hover:bg-blue-50 p-1.5 rounded-md transition-colors cursor-pointer"
                                type="button"
                                title="Uredi predmet"
                              >
                                <Pencil size={12} />
                              </button>
                              <button
                                onClick={async () => {
                                  if (confirm(`Jeste li sigurni da želite obrisati predmet ${sub.subject?.name || ''}?`)) {
                                    try {
                                      const { error } = await supabase.from('schedule_cell_subjects').delete().eq('id', sub.id);
                                      if (error) throw error;
                                      toast.success('Predmet obrisan');
                                      fetchClassData();
                                      if (editingSubjectId === sub.id) {
                                        setEditingSubjectId(null);
                                        setModalSubjectAssignmentId('');
                                        setModalClassroom('');
                                      }
                                    } catch (err: any) {
                                      toast.error(err.message);
                                    }
                                  }
                                }}
                                className="text-red-500 hover:bg-red-50 p-1.5 rounded-md transition-colors cursor-pointer"
                                type="button"
                                title="Obriši"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {editingSubjectId && (
                  <div className="flex justify-between items-center bg-blue-50 border border-blue-100 p-2.5 rounded-xl text-xs text-blue-700">
                    <span className="font-bold">Uređivanje odabranog predmeta...</span>
                    <button
                      onClick={() => {
                        setEditingSubjectId(null);
                        setModalSubjectAssignmentId('');
                        setModalClassroom('');
                      }}
                      className="text-[10px] font-black uppercase text-blue-600 hover:text-blue-800"
                      type="button"
                    >
                      Poništi
                    </button>
                  </div>
                )}

                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 font-sans">Odaberite predmet s nastavnikom</label>
                  <select
                    value={modalSubjectAssignmentId}
                    onChange={e => {
                      setModalSubjectAssignmentId(e.target.value);
                      setValidationError('');
                    }}
                    className="w-full bg-slate-50 border-2 border-slate-100 hover:border-slate-200 rounded-xl p-3 font-semibold text-slate-800 text-sm outline-none focus:border-[#005c8d] transition-colors font-sans"
                  >
                    <option value="">-- Odaberi predmet --</option>
                    {subjects.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.subject?.name} ({s.teacher?.name || 'Bez nastavnika'})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4 text-left font-sans">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 font-sans">Uzastopnih sati (1-8)</label>
                    <select
                      value={modalConsecutive}
                      onChange={e => {
                        setModalConsecutive(Number(e.target.value));
                        setValidationError('');
                      }}
                      className="w-full bg-slate-50 border-2 border-slate-100 hover:border-slate-200 rounded-xl p-3 font-semibold text-slate-800 text-sm outline-none focus:border-[#005c8d] transition-colors font-sans"
                    >
                      {[1, 2, 3, 4, 5, 6, 7, 8].map(n => (
                        <option key={n} value={n}>{n} {n === 1 ? 'sat' : n >= 2 && n <= 4 ? 'sata' : 'sati'}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 font-sans">Učionica (opcionalno)</label>
                    <input
                      type="text"
                      placeholder="npr. 12, Kabinet"
                      value={modalClassroom}
                      onChange={e => setModalClassroom(e.target.value)}
                      className="w-full bg-slate-50 border-2 border-slate-100 hover:border-slate-200 rounded-xl p-3 font-semibold text-slate-800 text-sm outline-none focus:border-[#005c8d] transition-colors font-sans"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 text-left">
                  <button
                    onClick={() => setIsAssignModalOpen(false)}
                    className="px-4 py-2.5 bg-slate-50 border-2 border-slate-100 hover:bg-slate-100 rounded-xl text-xs font-black uppercase text-slate-400 transition-all font-sans"
                    type="button"
                  >
                    Odustani
                  </button>
                  <button
                    onClick={() => handleBulkAssign(false)}
                    disabled={isSaving}
                    className="px-6 py-2.5 bg-[#005c8d] hover:bg-[#004b73] text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-md hover:shadow-lg font-sans"
                    type="button"
                  >
                    {isSaving ? 'Spremanje...' : editingSubjectId ? 'Spremi promjene' : 'Spremi unose'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Bulk Delete Block Modal */}
      {isDeleteBlockModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in animate-duration-150">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 max-w-sm w-full overflow-hidden transform scale-100 transition-all font-sans text-left">
            <div className="bg-red-50 border-b border-red-100 p-5 text-center">
              <HelpCircle className="text-red-500 mx-auto mb-2 animate-pulse" size={32} />
              <h3 className="text-sm font-black text-red-800 uppercase tracking-wider">Brisanje nastave</h3>
              <p className="text-xs font-bold text-slate-500 mt-1">
                Pronađen je povezani blok predmeta <strong className="text-slate-800 font-extrabold">{deleteSubjectName}</strong>.
              </p>
            </div>

            <div className="p-6 space-y-4 text-center">
              <p className="text-xs text-slate-600 font-medium text-center font-sans">
                Želite li ukloniti samo ovaj pojedinačni sat ili cijeli uzastopni blok za taj dan?
              </p>

              <div className="flex flex-col gap-2 text-left">
                <button
                  onClick={() => {
                    setIsDeleteBlockModalOpen(false);
                    clearCell(deleteCellId);
                  }}
                  disabled={isSaving}
                  className="w-full py-3 bg-white border-2 border-slate-200 text-slate-700 hover:bg-slate-50 rounded-xl text-xs font-black uppercase tracking-wider transition-all font-sans text-center"
                  type="button"
                >
                  Samo pojedinačni sat
                </button>
                <button
                  onClick={handleBulkDelete}
                  disabled={isSaving}
                  className="w-full py-3 bg-red-600 text-white hover:bg-red-700 rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-md font-sans text-center"
                  type="button"
                >
                  {isSaving ? 'Brisanje bloka...' : 'Cijeli uzastopni blok'}
                </button>
                <button
                  onClick={() => setIsDeleteBlockModalOpen(false)}
                  className="w-full py-2.5 text-xs text-slate-400 font-black uppercase tracking-widest hover:text-slate-600 transition-colors font-sans text-center"
                  type="button"
                >
                  Odustani
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
        </div>
      )}
    </div>
  );
}
