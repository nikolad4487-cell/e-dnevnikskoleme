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
  CalendarDays
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';

const DAYS = [
  { id: 'MONDAY', name: 'Ponedjeljak' },
  { id: 'TUESDAY', name: 'Utorak' },
  { id: 'WEDNESDAY', name: 'Srijeda' },
  { id: 'THURSDAY', name: 'Četvrtak' },
  { id: 'FRIDAY', name: 'Petak' }
];

const PERIODS = [1, 2, 3, 4, 5, 6, 7];

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
      
      // 1. Fetch Class Subjects (to know which subjects can be put in schedule)
      const { data: classSubjects } = await supabase
        .from('class_subject_teachers')
        .select(`
          id,
          subject:subjects(*),
          teacher:user_profiles(*)
        `)
        .eq('class_id', selectedClassId);
      
      setSubjects(classSubjects || []);

      // 2. Fetch Schedule Cells
      const { data: cells } = await supabase
        .from('schedule_cells')
        .select(`
          *,
          subjects:schedule_cell_subjects(
            *,
            subject:subjects(*),
            teacher:user_profiles(*)
          )
        `)
        .eq('class_id', selectedClassId)
        .eq('shift', shift);
      
      setSchedule(cells || []);
    } catch (err: any) {
      toast.error('Problem kod učitavanja rasporeda');
    } finally {
      setLoading(false);
    }
  };

  const handleSetSubject = async (dayOfWeek: string, periodNumber: number, subjectAssignmentId: string) => {
    if (!isAnyAdmin) {
      toast.error('Nemate dozvolu za mijenjanje rasporeda.');
      return;
    }
    if (!subjectAssignmentId) return;
    
    try {
      // 1. Find or create cell
      let cell = schedule.find(c => c.day_of_week === dayOfWeek && c.period_number === periodNumber);
      
      if (!cell) {
        const payload = {
          class_id: selectedClassId,
          day_of_week: dayOfWeek,
          shift,
          period_number: periodNumber
        };
        console.log("schedule cell upsert payload", payload);
        console.log("onConflict", "class_id,day_of_week,shift,period_number");

        const { data: newCell, error: cellError } = await supabase
          .from('schedule_cells')
          .upsert(payload, {
            onConflict: "class_id,day_of_week,shift,period_number"
          })
          .select()
          .maybeSingle();
        
        if (cellError || !newCell) throw cellError || new Error("Cell creation failed");
        cell = newCell;
      }

      // 2. Add subject to cell
      const assignment = subjects.find(s => s.id === subjectAssignmentId);
      if (!assignment) return;

      const { error: subError } = await supabase
        .from('schedule_cell_subjects')
        .upsert({
          schedule_cell_id: cell.id,
          subject_id: assignment.subject_id,
          teacher_id: assignment.teacher_id,
        }, { onConflict: 'schedule_cell_id,subject_id' }); // Simple one subject per cell for now
      
      if (subError) throw subError;

      toast.success('Spremljeno');
      fetchClassData();
    } catch (err: any) {
      toast.error(err.message);
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
      toast.success('Obrisano');
      fetchClassData();
    } catch (err: any) {
      toast.error(err.message);
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
                             {assignedSubject ? (
                               <div className="bg-blue-50 border border-blue-100 rounded-xl p-2 h-full flex flex-col justify-center text-center shadow-sm relative pr-6">
                                  <div className="text-[10px] font-black text-blue-900 uppercase leading-none mb-1">{assignedSubject.subject?.name}</div>
                                  <div className="text-[9px] font-bold text-blue-400 uppercase leading-none truncate">{assignedSubject.teacher?.name}</div>
                                  <button 
                                    onClick={() => clearCell(cell.id)}
                                    className={`absolute top-1 right-1 text-blue-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 ${!isAnyAdmin && 'hidden'}`}
                                  >
                                    <Trash2 size={12} />
                                  </button>
                               </div>
                             ) : (
                               isAnyAdmin ? (
                                 <select 
                                   onChange={(e) => handleSetSubject(day.id, num, e.target.value)}
                                   className="w-full bg-slate-50 border border-transparent hover:border-slate-200 rounded-xl p-2 text-[10px] font-bold text-slate-400 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-all outline-none"
                                 >
                                   <option value="">+</option>
                                   {subjects.map(s => (
                                     <option key={s.id} value={s.id}>{s.subject?.name}</option>
                                   ))}
                                 </select>
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
        </div>
      )}
    </div>
  );
}
