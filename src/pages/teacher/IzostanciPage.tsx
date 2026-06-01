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

export default function TeacherIzostanciPage() {
  const { classId: routeClassId } = useParams<{ classId: string }>();
  const { user, isMainAdmin } = useAuth();
  const { selectedClassId: contextClassId } = useSelection();
  
  const effectiveClassId = contextClassId || routeClassId;

  const [absences, setAbsences] = useState<Absence[]>([]);
  const [students, setStudents] = useState<User[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);
  
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

  const fetchData = async () => {
    setLoading(true);
    try {
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
    
    // TOTP check
    if (isMainAdmin || user?.role === Role.ADMIN) {
      if (!totpCode) {
        toast.error('Potreban je autentifikator kod.');
        return;
      }
      
      const res = await fetch('/api/verify-totp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ authUserId: user?.id, totpCode })
      });
      const { success } = await res.json();
      
      if (!success) {
        toast.error('Neispravan autentifikator kod.');
        return;
      }
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
                userRole: user?.role,
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
            showDeleteButton={isMainAdmin || user?.role === Role.ADMIN}
          />
        )}
      </div>
      
      <DeleteConfirmDialog
          isOpen={deleteDialog.isOpen}
          onClose={() => setDeleteDialog({ ...deleteDialog, isOpen: false })}
          onConfirm={confirmDeleteAbsence}
          loading={deleteDialog.loading}
          showTotp={isMainAdmin || user?.role === Role.ADMIN}
          title="Potvrda brisanja izostanka"
          message="Za brisanje izostanka potrebno je potvrditi radnju kodom iz autentifikatora."
      />
    </div>
  );
}

const StudentDetailView = ({ student, absences, lessons, onJustify, onDelete, showDeleteButton }: any) => {
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
                                {hasPending && <button onClick={() => onJustify(date)} className="bg-[#005c8d] text-white px-2 py-1 uppercase text-[9px] font-bold">Opravdaj</button>}
                                {showDeleteButton && <button onClick={() => onDelete(absList[0].id)} className="bg-red-600 text-white px-2 py-1 uppercase text-[9px] font-bold"><Trash2 size={10} /></button>}
                            </td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
    );
};

const JustifyModal = ({ date, absences, onClose, onSuccess, user }: any) => {
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(absences.filter((a: any) => a.status === AbsenceStatus.PENDING).map((a: any) => a.id)));
    const [status, setStatus] = useState<AbsenceStatus | ''>('');
    const [type, setType] = useState<string>('');
    const [note, setNote] = useState<string>('');
    const [saving, setSaving] = useState(false);

    const onJustify = async () => {
      if (!status || !type) return toast.error('Status i tip su obavezni!');
      if ((status === AbsenceStatus.UNJUSTIFIED || status === AbsenceStatus.OTHER) && !note) return toast.error('Napomena je obavezna!');
      setSaving(true);
      try {
        const payload = {
          status: status,
          absence_type: type,
          note: note,
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
        <div className="bg-white max-w-lg w-full p-6">
           <h3 className="font-bold mb-4">Opravdanje za {new Date(date).toLocaleDateString()}</h3>
           <div className="space-y-4">
             {absences.map((a: any) => (
               <div key={a.id} className="flex gap-2">
                 <input type="checkbox" checked={selectedIds.has(a.id)} onChange={e => {
                    const next = new Set(selectedIds);
                    if (e.target.checked) next.add(a.id); else next.delete(a.id);
                    setSelectedIds(next);
                 }}/> 
                 <span>{a.hour}. sat ({a.status})</span>
               </div>
             ))}
             <select onChange={e => setStatus(e.target.value as any)} className="w-full border p-2">
                <option value="">Status...</option>
                <option value={AbsenceStatus.JUSTIFIED}>Opravdano</option>
                <option value={AbsenceStatus.UNJUSTIFIED}>Neopravdano</option>
                <option value={AbsenceStatus.OTHER}>Ostalo</option>
             </select>
             <select onChange={e => setType(e.target.value)} className="w-full border p-2">
                <option value="">Tip...</option>
                <option value="Bolest - roditelj">Bolest - roditelj</option>
                <option value="Bolest - liječnik">Bolest - liječnik</option>
                <option value="Promet">Promet</option>
                <option value="Natjecanje">Natjecanje</option>
                <option value="Ostalo">Ostalo</option>
             </select>
             <textarea className="w-full border p-2" placeholder="Napomena" onChange={e => setNote(e.target.value)}/>
             <div className="flex gap-2"><button onClick={onClose} className="border px-4 py-2">Odustani</button><button onClick={onJustify} disabled={saving} className="bg-[#005c8d] text-white px-4 py-2">Unesi</button></div>
           </div>
        </div>
      </div>
    );
};
