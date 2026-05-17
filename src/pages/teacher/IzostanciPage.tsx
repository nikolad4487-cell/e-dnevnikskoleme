import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useSelection } from '../../contexts/SelectionContext';
import { Absence, AbsenceStatus, User, Class } from '../../types';
import { cn } from '../../lib/utils';
import { UserX, Clock, CheckCircle2, XCircle, Search, Filter } from 'lucide-react';
import toast from 'react-hot-toast';
import { mappers, mapList } from '../../lib/mappers';

export default function TeacherIzostanciPage() {
  const { classId: routeClassId } = useParams<{ classId: string }>();
  const { user } = useAuth();
  
  const effectiveClassId = routeClassId;

  const [absences, setAbsences] = useState<Absence[]>([]);
  const [students, setStudents] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<AbsenceStatus | 'ALL'>('ALL');

  useEffect(() => {
    if (effectiveClassId) {
      fetchData();
    }
  }, [effectiveClassId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. Fetch Students
      const { data: enrollData, error: enrollError } = await supabase
        .from('student_class_enrollments')
        .select('student:user_profiles(*)')
        .eq('class_id', effectiveClassId)
        .eq('status', 'ACTIVE');

      if (enrollError) throw enrollError;
      const studentsList = (enrollData || []).map((e: any) => mappers.user(e.student)).filter(Boolean);
      
const uniqueStudents = Array.from(new Map(studentsList.map(s => [s.id, s])).values());
setStudents(uniqueStudents);


      // 2. Fetch Absences
      const { data: absData, error: absError } = await supabase
        .from('absences')
        .select(`*`)
        .eq('class_id', effectiveClassId)
        .order('date', { ascending: false });

      if (absError) throw absError;
      setAbsences(mapList(absData, mappers.absence));
    } catch (error) {
      console.error(error);
      toast.error('Greška pri učitavanju izostanaka');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateStatus = async (absenceId: string, status: AbsenceStatus) => {
    try {
      const { error } = await supabase
        .from('absences')
        .update({ 
          status,
          updated_at: new Date().toISOString()
        })
        .eq('id', absenceId);

      if (error) throw error;
      toast.success('Status izmijenjen');
      fetchData();
    } catch (error) {
      console.error(error);
      toast.error('Greška pri spremanju');
    }
  };

  const filteredAbsences = absences.filter(abs => {
    const student = students.find(s => s.id === abs.studentId);
    const studentName = student ? (student.name + ' ' + student.surname).toLowerCase() : '';
    const matchesSearch = studentName.includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'ALL' || abs.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const stats = {
    total: absences.length,
    justified: absences.filter(a => a.status === AbsenceStatus.OPRAVDANO).length,
    unjustified: absences.filter(a => a.status === AbsenceStatus.NEOPRAVDANO).length,
    pending: absences.filter(a => a.status === AbsenceStatus.CEKA).length,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full p-20 text-gray-400 font-bold uppercase text-[10px] tracking-widest animate-pulse">
        Učitavanje podataka...
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white font-sans">
      <div className="bg-[#f8f9fa] border-b border-gray-300 p-6 flex items-center justify-between">
        <div>
           <h2 className="text-xl font-black text-gray-800 uppercase tracking-tighter flex items-center gap-2">
            <UserX size={20} className="text-[#005c8d]" />
            Pregled i pravdanje izostanaka
          </h2>
          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">Svi izostanci za ovaj razredni odjel</p>
        </div>

        <div className="flex items-center gap-6">
           <div className="text-center">
             <div className="text-[9px] font-black text-gray-400 uppercase leading-none mb-1">Ukupno sati</div>
             <div className="text-lg font-black text-gray-800">{stats.total}</div>
           </div>
           <div className="h-8 w-px bg-gray-200"></div>
           <div className="text-center">
             <div className="text-[9px] font-black text-green-600 uppercase leading-none mb-1 text-right">Opravdano</div>
             <div className="text-lg font-black text-green-600">{stats.justified}</div>
           </div>
           <div className="text-center">
             <div className="text-[9px] font-black text-red-600 uppercase leading-none mb-1 text-right">Neopravdano</div>
             <div className="text-lg font-black text-red-600">{stats.unjustified}</div>
           </div>
           <div className="text-center">
             <div className="text-[9px] font-black text-orange-500 uppercase leading-none mb-1 text-right">Čeka</div>
             <div className="text-lg font-black text-orange-500">{stats.pending}</div>
           </div>
        </div>
      </div>

      <div className="p-6 bg-white border-b border-gray-100 flex flex-wrap gap-4 items-center">
         <div className="flex-1 min-w-[300px] relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" size={16} />
            <input 
              type="text" 
              placeholder="Pretraži učenike..." 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 text-xs font-bold uppercase placeholder:text-gray-300 focus:border-[#005c8d] outline-none"
            />
         </div>
         <div className="flex items-center gap-2">
            <Filter size={16} className="text-gray-400" />
            <select 
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as any)}
              className="border border-gray-300 p-2 text-xs font-black uppercase focus:border-[#005c8d] outline-none"
            >
              <option value="ALL">Svi statusi</option>
              <option value={AbsenceStatus.CEKA}>Čeka na pravdanje</option>
              <option value={AbsenceStatus.OPRAVDANO}>Opravdano</option>
              <option value={AbsenceStatus.NEOPRAVDANO}>Neopravdano</option>
            </select>
         </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <table className="w-full text-left border-collapse border border-gray-300">
          <thead>
            <tr className="bg-gray-100 border-b border-gray-300 text-[10px] font-bold uppercase text-gray-500 tracking-wider">
              <th className="p-3 border-r border-gray-300">Učenik</th>
              <th className="p-3 border-r border-gray-300">Datum i sat</th>
              <th className="p-3 border-r border-gray-300">Napomena</th>
              <th className="p-3 border-r border-gray-300 text-center">Status</th>
              <th className="p-3 text-right">Akcije</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {filteredAbsences.length > 0 ? filteredAbsences.map(abs => {
              const student = students.find(s => s.id === abs.studentId);
              return (
              <tr key={abs.id} className="hover:bg-gray-50 text-[11px] font-bold">
                <td className="p-3 border-r border-gray-200 text-slate-900 uppercase">
                  {student?.name} {student?.surname}
                </td>
                <td className="p-3 border-r border-gray-200 text-gray-600">
                  {new Date(abs.date).toLocaleDateString('hr-HR')} • <span className="text-[#005c8d]">{abs.lessonHour || abs.hour || '?'}. sat</span>
                </td>
                <td className="p-3 border-r border-gray-200 text-gray-500 italic max-w-xs truncate">
                  {abs.note || 'Nema napomene'}
                </td>
                <td className="p-3 border-r border-gray-200 text-center">
                   <div className={cn(
                     "inline-block px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-tighter border",
                     abs.status === AbsenceStatus.OPRAVDANO ? "bg-green-100 text-green-700 border-green-200" :
                     abs.status === AbsenceStatus.NEOPRAVDANO ? "bg-red-100 text-red-700 border-red-200" :
                     "bg-orange-100 text-orange-700 border-orange-200"
                   )}>
                     {abs.status === AbsenceStatus.OPRAVDANO ? 'Opravdano' :
                      abs.status === AbsenceStatus.NEOPRAVDANO ? 'Neopravdano' : 'Na čekanju'}
                   </div>
                </td>
                <td className="p-3 text-right flex items-center justify-end gap-2">
                   {abs.status === AbsenceStatus.CEKA ? (
                     <>
                        <button 
                          onClick={() => handleUpdateStatus(abs.id, AbsenceStatus.OPRAVDANO)}
                          className="bg-green-600 text-white px-2 py-1 uppercase text-[9px] font-black hover:bg-green-700"
                        >
                          Opravdaj
                        </button>
                        <button 
                          onClick={() => handleUpdateStatus(abs.id, AbsenceStatus.NEOPRAVDANO)}
                          className="bg-red-600 text-white px-2 py-1 uppercase text-[9px] font-black hover:bg-red-700"
                        >
                          Neopravdaj
                        </button>
                     </>
                   ) : (
                     <button 
                       onClick={() => handleUpdateStatus(abs.id, AbsenceStatus.CEKA)}
                       className="text-gray-400 hover:text-gray-600 uppercase text-[9px] font-black"
                     >
                       Vrati na čekanje
                     </button>
                   )}
                </td>
              </tr>
            );
          }) : (
              <tr>
                <td colSpan={5} className="p-20 text-center text-gray-400 uppercase font-bold text-[11px] italic tracking-widest">
                  Nema pronađenih izostanaka
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
