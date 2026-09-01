import React, { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useSelection } from '../../contexts/SelectionContext';
import { Absence, AbsenceStatus, User, Lesson, Role } from '../../types';
import { cn, getSurname, formatPersonName, sortStudentsBySurname } from '../../lib/utils';
import { UserX, ArrowLeft, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { mappers, mapList } from '../../lib/mappers';
import { DeleteConfirmDialog } from '../../components/DeleteConfirmDialog';
import { usePageTitle } from '../../hooks/usePageTitle';

const absenceTypeOptions = [
  'Bolest - roditelj',
  'Bolest - liječnik',
  'Smrtni slučaj',
  'Natjecanje',
  'Promet',
  'Obiteljski razlog',
  'Ostalo'
];

export default function TeacherIzostanciPage() {
  usePageTitle("Izostanci");
  const { classId: routeClassId, studentId } = useParams<{ classId: string, studentId?: string }>();
  const { user, isMainAdmin, highestRole } = useAuth();
  const { selectedClassId: contextClassId } = useSelection();
  
  const effectiveClassId = contextClassId || routeClassId;

  const [absences, setAbsences] = useState<Absence[]>([]);
  const [students, setStudents] = useState<User[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [isHomeroomTeacher, setIsHomeroomTeacher] = useState(false);
  
  const [selectedStudent, setSelectedStudent] = useState<User | null>(null);
  const [justifyingDate, setJustifyingDate] = useState<string | null>(null);
  
  const [deleteDialog, setDeleteDialog] = useState<{
    isOpen: boolean;
    id: string;
    loading: boolean;
  }>({
    isOpen: false,
    id: '',
    loading: false
  });

  useEffect(() => {
    if (effectiveClassId) {
      fetchData();
    }
  }, [effectiveClassId]);

  useEffect(() => {
    if (studentId && students.length > 0) {
      const found = students.find(s => s.id === studentId);
      if (found) {
        setSelectedStudent(found);
      }
    }
  }, [studentId, students]);

  const fetchData = async () => {
    setLoading(true);
    try {
      if (effectiveClassId) {
        const { data: classData } = await supabase
          .from('classes')
          .select('homeroom_teacher_id')
          .eq('id', effectiveClassId)
          .maybeSingle();
        if (classData && classData.homeroom_teacher_id === user?.id) {
          setIsHomeroomTeacher(true);
        } else {
          setIsHomeroomTeacher(false);
        }
      }

      const { data: enrollData } = await supabase
        .from('student_class_enrollments')
        .select('student:user_profiles(*)')
        .eq('class_id', effectiveClassId)
        .eq('status', 'ACTIVE');
      
      const studentsList = (enrollData || []).map((e: any) => mappers.user(e.student));
      setStudents(sortStudentsBySurname(studentsList));

      const { data: absData } = await supabase
        .from('absences')
        .select(`*, lessons(*, subjects(*))`)
        .eq('class_id', effectiveClassId)
        .order('date', { ascending: false });

      setAbsences(mapList(absData, mappers.absence));
      
      const { data: lessonsData } = await supabase.from('lessons').select('*').eq('class_id', effectiveClassId);
      setLessons(mapList(lessonsData, mappers.lesson));
      
    } catch (error) {
      console.error(error);
      toast.error('Greška pri učitavanju podataka');
    } finally {
      setLoading(false);
    }
  };

  const confirmDeleteAbsence = async (totpCode?: string) => {
    if (!deleteDialog.id) return;

    const absence = absences.find(a => a.id === deleteDialog.id);
    if (!absence || !canDeleteAbsence(absence)) {
      toast.error('Nemate ovlasti za brisanje ovog izostanka.');
      return;
    }

    setDeleteDialog(prev => ({ ...prev, loading: true }));
    try {
        const { error } = await supabase.from('absences').delete().eq('id', deleteDialog.id);
        if (error) throw error;

        // Audit log
        await fetch('/api/audit-log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                actionType: 'DELETE_ABSENCE',
                recordId: deleteDialog.id,
                userId: user?.id,
                userRole: highestRole,
                details: `Deleted absence ${deleteDialog.id}`
            })
        });

        toast.success('Izostanak obrisan.');
        fetchData();
    } catch (e) {
        toast.error('Greška pri brisanju izostanka.');
    } finally {
        setDeleteDialog({ isOpen: false, id: '', loading: false });
    }
  };

  const isAdminForAbsences = isMainAdmin || [Role.ADMIN, Role.SCHOOL_ADMIN, Role.MAIN_ADMIN, Role.SUPER_ADMIN].includes(highestRole as Role);

  const isWithin48Hours = (absence: Absence) => {
    const timestamp = absence.createdAt || (absence as any).created_at;
    const createdAt = timestamp ? new Date(timestamp).getTime() : Date.now();
    if (!Number.isFinite(createdAt)) return true;
    return Date.now() - createdAt <= 48 * 60 * 60 * 1000;
  };

  const canDeleteAbsence = (absence: Absence) => {
    if (isAdminForAbsences || isHomeroomTeacher) return true;
    return absence.teacherId === user?.id && isWithin48Hours(absence);
  };

  const studentStats = useMemo(() => {
    const rawStats = students.map(s => {
      const studAbs = absences.filter(a => a.studentId === s.id);
      return {
        ...s,
        total: studAbs.length,
        justified: studAbs.filter(a => a.status === AbsenceStatus.JUSTIFIED).length,
        unjustified: studAbs.filter(a => a.status === AbsenceStatus.UNJUSTIFIED).length,
        pending: studAbs.filter(a => a.status === AbsenceStatus.PENDING).length
      };
    });
    return sortStudentsBySurname(rawStats);
  }, [students, absences]);

  const stats = useMemo(() => ({
    total: absences.length,
    justified: absences.filter(a => a.status === AbsenceStatus.JUSTIFIED).length,
    unjustified: absences.filter(a => a.status === AbsenceStatus.UNJUSTIFIED).length,
    pending: absences.filter(a => a.status === AbsenceStatus.PENDING).length,
  }), [absences]);
  
  if (loading) return <div>Učitavanje...</div>;

  return (
    <div className="flex flex-col h-full bg-white">
      {justifyingDate && selectedStudent && (
        <JustifyModal 
          date={justifyingDate} 
          absences={absences.filter(a => a.date === justifyingDate && a.studentId === selectedStudent.id)} 
          onClose={() => setJustifyingDate(null)} 
          onSuccess={() => { setJustifyingDate(null); fetchData(); }}
          user={user!}
        />
      )}

      {/* Header with stats */}
      <div className="bg-[#f8f9fa] border-b border-gray-300 p-6 flex items-center justify-between">
        <h2 className="text-xl font-black text-gray-800 uppercase tracking-tighter flex items-center gap-2">
            {selectedStudent && <button onClick={() => setSelectedStudent(null)} className="mr-2"><ArrowLeft /></button>}
            <UserX size={20} className="text-[#005c8d]" />
            {selectedStudent ? `Izostanci učenika - ${formatPersonName(selectedStudent)}` : "Pregled i pravdanje izostanaka"}
        </h2>
        
        <div className="flex items-center gap-6">
           <div className="text-center"><div className="text-[9px] font-black text-gray-400 uppercase">Ukupno</div><div className="text-lg font-black">{stats.total}</div></div>
           <div className="text-center"><div className="text-[9px] font-black text-green-600 uppercase">Opravdano</div><div className="text-lg font-black text-green-600">{stats.justified}</div></div>
           <div className="text-center"><div className="text-[9px] font-black text-red-600 uppercase">Neopravd.</div><div className="text-lg font-black text-red-600">{stats.unjustified}</div></div>
           <div className="text-center"><div className="text-[9px] font-black text-black uppercase">Čeka odluku</div><div className="text-lg font-black text-black">{stats.pending}</div></div>
        </div>
      </div>

      <div className="p-6 overflow-auto">
        {!selectedStudent ? (
          <table className="w-full text-left border border-gray-300">
            <thead className="bg-gray-100 text-[10px] font-bold uppercase text-gray-500">
              <tr>
                <th className="p-3 border-r">Učenik</th>
                <th className="p-3 border-r text-center">Ukupno</th>
                <th className="p-3 border-r text-center">Opravdano</th>
                <th className="p-3 border-r text-center">Neopravdano</th>
                <th className="p-3 text-center">Čeka odluku</th>
              </tr>
            </thead>
            <tbody className="divide-y text-[12px]">
              {studentStats.map(s => (
                <tr key={s.id} onClick={() => setSelectedStudent(s)} className="hover:bg-blue-50 cursor-pointer">
                  <td className="p-3 border-r font-bold">{s.name}</td>
                  <td className="p-3 text-center font-bold">{s.total}</td>
                  <td className="p-3 text-center font-bold text-green-600">{s.justified}</td>
                  <td className="p-3 text-center font-bold text-red-600">{s.unjustified}</td>
                  <td className="p-3 text-center font-bold text-orange-500">{s.pending}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <StudentDetailView 
            student={selectedStudent} 
            absences={absences.filter(a => a.studentId === selectedStudent.id)} 
            lessons={lessons} 
            onJustify={(date: string) => setJustifyingDate(date)}
            onDelete={(id: string) => setDeleteDialog({ isOpen: true, id, loading: false })}
            canDeleteAbsence={canDeleteAbsence}
            showJustifyButton={isAdminForAbsences || isHomeroomTeacher}
          />
        )}
      </div>
      
      <DeleteConfirmDialog
          isOpen={deleteDialog.isOpen}
          onClose={() => setDeleteDialog({ ...deleteDialog, isOpen: false })}
          onConfirm={confirmDeleteAbsence}
          loading={deleteDialog.loading}
          showTotp={false}
          title="Potvrda brisanja izostanka"
          message="Jeste li sigurni da želite obrisati ovaj izostanak?"
      />
    </div>
  );
}

const StudentDetailView = ({ student, absences, lessons, onJustify, onDelete, canDeleteAbsence, showJustifyButton }: any) => {
    // Group absences by date
    const grouped = absences.reduce((acc: any, a: any) => {
        if (!acc[a.date]) acc[a.date] = [];
        acc[a.date].push(a);
        return acc;
    }, {});
    
    // Sort dates descending
    const dates = Object.keys(grouped).sort((a,b) => b.localeCompare(a));
    
    // Hrs 0-12
    const hours = Array.from({length: 13}, (_, i) => i);
    
    return (
        <table className="w-full border-collapse border border-gray-300 text-[11px]">
            <thead>
                <tr className="bg-gray-100 uppercase font-bold text-gray-500">
                    <th className="p-2 border-r">Datum</th>
                    {hours.map(h => <th key={h} className="p-2 border-r">{h}.</th>)}
                    <th className="p-2">Akcije</th>
                </tr>
            </thead>
            <tbody>
                {dates.map(date => {
                    const absList = grouped[date];
                    const hasPending = absList.some((a: any) => a.status === AbsenceStatus.PENDING);
                    const deletableAbsence = absList.find((a: any) => canDeleteAbsence(a));
                    return (
                        <tr key={date} className="border-b">
                            <td className="p-2 border-r font-bold">{new Date(date).toLocaleDateString()}</td>
                            {hours.map(h => {
                                const abs = absList.find((a: any) => a.hour === h);
                                if (!abs) return <td key={h} className="p-2 border-r text-center text-gray-300">/</td>;
                                
                                const color = abs.status === AbsenceStatus.JUSTIFIED ? 'bg-green-500' :
                                              abs.status === AbsenceStatus.UNJUSTIFIED ? 'bg-red-500' :
                                              abs.status === AbsenceStatus.OTHER ? 'bg-yellow-400' :
                                              'bg-orange-500';
                                              
                                // Subject abbreviation
                                const lesson = lessons.find((l: any) => l.id === abs.lessonId);
                                const subjCode = lesson?.subject?.code || lesson?.subject?.name.substring(0,3).toUpperCase() || '---';
                                
                                return (
                                    <td key={h} className={cn("p-2 border-r text-white font-bold text-center", color)}>
                                        {subjCode}
                                    </td>
                                );
                            })}
                            <td className="p-2 text-center flex gap-1 justify-center">
                                {hasPending && showJustifyButton && <button onClick={() => onJustify(date)} className="bg-[#005c8d] text-white px-2 py-1 uppercase text-[9px] font-bold">Opravdaj</button>}
                                {deletableAbsence && <button onClick={() => onDelete(deletableAbsence.id)} className="bg-red-600 text-white px-2 py-1 uppercase text-[9px] font-bold"><Trash2 size={10} /></button>}
                            </td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
    );
};

const JustifyModal = ({ date, absences, onClose, onSuccess, user }: any) => {
    const pendingIds = absences.filter((a: any) => a.status === AbsenceStatus.PENDING).map((a: any) => a.id);
    const allIds = absences.map((a: any) => a.id);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(pendingIds.length > 0 ? pendingIds : allIds));
    const [status, setStatus] = useState<AbsenceStatus | ''>(absences[0]?.status === AbsenceStatus.PENDING ? '' : absences[0]?.status || '');
    const [type, setType] = useState<string>(absences[0]?.absenceType || '');
    const [note, setNote] = useState<string>(absences[0]?.note || '');
    const [saving, setSaving] = useState(false);
    const selectedCount = selectedIds.size;

    const onJustify = async () => {
      if (selectedIds.size === 0) return toast.error('Odaberite barem jedan sat.');
      if (!status || !type) return toast.error('Status i tip su obavezni!');
      if ((status === AbsenceStatus.UNJUSTIFIED || status === AbsenceStatus.OTHER) && !note.trim()) return toast.error('Razlog je obavezan za neopravdano ili ostalo.');
      setSaving(true);
      try {
        const payload = {
          status: status,
          absence_type: type,
          note: note.trim() || null,
          resolved_by: user.id,
          resolved_at: new Date().toISOString(),
          justified_by: user.name || user.id
        };
        const { error } = await supabase.from('absences').update(payload).in('id', Array.from(selectedIds));
        
        if (error) throw error;
        toast.success('Izostanci ažurirani');
        onSuccess();
      } catch (err: any) { toast.error("Greška pri ažuriranju izostanka: " + err.message); } finally { setSaving(false); }
    };

    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <div className="bg-white border border-gray-700 max-w-2xl w-full">
          <div className="bg-[#06476b] text-white px-3 py-2 flex items-center justify-between">
            <h3 className="text-[18px] font-normal">Uređivanje izostanaka za {new Date(date).toLocaleDateString('hr-HR')}</h3>
            <button type="button" onClick={onClose} className="text-white/80 hover:text-white">×</button>
          </div>

          <div className="p-4 space-y-5">
            <div>
              <label className="block mb-2 text-[12px] font-bold">Odaberite sate: <span className="text-[#005c8d]">*</span></label>
              <div className="flex flex-wrap gap-2 bg-red-50 border border-red-200 p-2">
                {absences.sort((a: any, b: any) => Number(a.hour || 0) - Number(b.hour || 0)).map((absence: any) => {
                  const isSelected = selectedIds.has(absence.id);
                  return (
                    <button
                      key={absence.id}
                      type="button"
                      onClick={() => {
                        const next = new Set(selectedIds);
                        if (isSelected) next.delete(absence.id);
                        else next.add(absence.id);
                        setSelectedIds(next);
                      }}
                      className={cn(
                        "w-9 h-8 border text-[12px] font-bold",
                        isSelected ? "bg-[#005c8d] text-white border-[#005c8d]" : "bg-red-100 text-red-300 border-red-200"
                      )}
                    >
                      {absence.hour}
                    </button>
                  );
                })}
              </div>
              <div className="text-center mt-2">
                <button
                  type="button"
                  onClick={() => setSelectedIds(new Set(allIds))}
                  className="px-12 py-2 border border-red-300 bg-red-50 text-red-900 text-[12px] font-bold hover:bg-red-100"
                >
                  Odaberi sve
                </button>
              </div>
            </div>

            <div className="bg-red-50 border border-red-200 p-3">
              <div className="flex flex-col md:flex-row md:items-center gap-3 text-[13px]">
                <label className="font-bold">Status:</label>
                <select value={status} onChange={e => setStatus(e.target.value as any)} className="border border-red-200 bg-white px-2 py-1">
                  <option value="">---status---</option>
                  <option value={AbsenceStatus.JUSTIFIED}>opravdano</option>
                  <option value={AbsenceStatus.UNJUSTIFIED}>neopravdano</option>
                  <option value={AbsenceStatus.OTHER}>ostalo</option>
                </select>
                <span className="text-[#005c8d] font-bold">*</span>

                <label className="font-bold md:ml-3">Tip:</label>
                <select value={type} onChange={e => setType(e.target.value)} className="border border-red-200 bg-white px-2 py-1 min-w-44">
                  <option value="">---tip---</option>
                  {absenceTypeOptions.map(option => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
                <span className="text-[#005c8d] font-bold">*</span>
              </div>

              <div className="border-t border-red-200 mt-4 pt-4">
                <div className="text-center text-[12px] text-gray-600 mb-3">Napomena nastavnika:</div>
                <label className="block mb-1 text-[13px] font-bold">Razlog:</label>
                <textarea className="w-full border border-gray-300 p-2 text-[13px]" rows={3} value={note} onChange={e => setNote(e.target.value)} />
              </div>
            </div>

            <div className="border-t border-gray-200 pt-4 text-center">
              <button onClick={onJustify} disabled={saving || selectedCount === 0} className="bg-[#005c8d] disabled:bg-gray-300 text-white px-5 py-2 font-bold">
                Unesi
              </button>
            </div>
          </div>
        </div>
      </div>
    );
};
