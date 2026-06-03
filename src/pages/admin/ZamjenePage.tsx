import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useSelection } from '../../contexts/SelectionContext';
import { User, Class } from '../../types';
import { Loader2, Plus, Calendar, Clock, RefreshCw, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { formatPersonName, cn } from '../../lib/utils';

export default function ZamjenePage() {
  const { selectedSchoolId, selectedYearId } = useSelection();
  const [substitutions, setSubstitutions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [teachers, setTeachers] = useState<User[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formData, setFormData] = useState({
      class_id: '',
      subject_id: '',
      original_teacher_id: '',
      substitute_teacher_id: '',
      date: new Date().toISOString().split('T')[0],
      hour: '',
      notes: ''
  });

  useEffect(() => {
    if (selectedSchoolId) {
        fetchData();
    }
  }, [selectedSchoolId, selectedYearId]);

  const fetchData = async () => {
      setLoading(true);
      try {
          // fetch substitutions
          const { data: subsData } = await supabase
            .from('teacher_substitutions')
            .select(`
                *,
                classes (name),
                subjects (name),
                original_teacher:user_profiles!original_teacher_id(name),
                substitute_teacher:user_profiles!substitute_teacher_id(name)
            `)
            .eq('school_id', selectedSchoolId)
            .order('date', { ascending: false });

          setSubstitutions(subsData || []);

          // fetch teachers
          const { data: tp } = await supabase.from('school_user_roles')
             .select('user_id, user_profiles(name, email)')
             .eq('school_id', selectedSchoolId)
             .in('role', ['TEACHER', 'HOMEROOM', 'DEPUTY', 'SCHOOL_ADMIN']);
             
          const uniqueTeachers = Array.from(new Map((tp || []).map(r => [r.user_id, { id: r.user_id, name: r.user_profiles?.name || 'Nepoznato' }])).values());
          setTeachers(uniqueTeachers as any);

          // fetch classes
          const { data: cl } = await supabase.from('classes').select('*').eq('school_id', selectedSchoolId).eq('school_year_id', selectedYearId || '');
          setClasses(cl as Class[]);

          // fetch subjects (all for school)
          const { data: sl } = await supabase.from('subjects').select('*').eq('school_id', selectedSchoolId);
          setSubjects(sl || []);

      } catch (err: any) {
          console.error(err);
          toast.error("Greška pri dohvaćanju zamjena");
      } finally {
          setLoading(false);
      }
  };

  const handleSave = async () => {
      if (!formData.class_id || !formData.subject_id || !formData.original_teacher_id || !formData.substitute_teacher_id || !formData.date) {
          toast.error("Popunite sva obvezna polja");
          return;
      }
      try {
         const { error } = await supabase.from('teacher_substitutions').insert({
             school_id: selectedSchoolId,
             class_id: formData.class_id,
             subject_id: formData.subject_id,
             original_teacher_id: formData.original_teacher_id,
             substitute_teacher_id: formData.substitute_teacher_id,
             date: formData.date,
             hour: formData.hour ? parseInt(formData.hour) : null,
             notes: formData.notes
         });
         if (error) throw error;
         toast.success("Zamjena uspješno evidentirana");
         setIsFormOpen(false);
         fetchData();
      } catch (err: any) {
          console.error(err);
          toast.error("Greška pri spremanju zamjene");
      }
  };

  const handleDelete = async (id: string) => {
      if (!confirm("Jeste li sigurni?")) return;
      try {
          const { error } = await supabase.from('teacher_substitutions').delete().eq('id', id);
          if (error) throw error;
          toast.success("Zamjena obrisana");
          fetchData();
      } catch (err: any) {
          toast.error("Greška pri brisanju");
      }
  };

  return (
      <div className="flex flex-col h-full bg-white font-sans overflow-hidden">
        <div className="bg-[#f8fafc] border-b border-gray-300 px-6 py-4 flex items-center justify-between shadow-sm z-10">
            <h2 className="text-xl font-black text-[#005c8d] uppercase tracking-widest flex items-center gap-3 relative">
                <div className="w-10 h-10 bg-[#005c8d]/10 rounded-full flex items-center justify-center text-[#005c8d]">
                    <RefreshCw size={20} />
                </div>
                Evidencija zamjena
            </h2>
            <button
                onClick={() => setIsFormOpen(true)}
                className="flex items-center gap-2 bg-[#005c8d] text-white px-5 py-2.5 rounded-sm hover:bg-[#004a70] transition-colors text-xs font-bold uppercase tracking-widest"
            >
                <Plus size={16} /> Nova zamjena
            </button>
        </div>

        <div className="flex-1 overflow-auto p-6 bg-slate-50">
           {isFormOpen && (
               <div className="bg-white border-l-4 border-l-[#005c8d] shadow p-6 mb-8 relative">
                   <h3 className="text-sm border-b border-gray-100 pb-2 font-bold mb-4">Nova zamjena</h3>
                   <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                       <div>
                           <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">Date</label>
                           <input type="date" className="w-full border p-2 text-sm" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} />
                       </div>
                       <div>
                           <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">Razred</label>
                           <select className="w-full border p-2 text-sm" value={formData.class_id} onChange={e => setFormData({...formData, class_id: e.target.value})}>
                               <option value="">Odaberi razred</option>
                               {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                           </select>
                       </div>
                       <div>
                           <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">Predmet</label>
                           <select className="w-full border p-2 text-sm" value={formData.subject_id} onChange={e => setFormData({...formData, subject_id: e.target.value})}>
                               <option value="">Odaberi predmet</option>
                               {subjects.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                           </select>
                       </div>
                       <div>
                           <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">Originalni nastavnik</label>
                           <select className="w-full border p-2 text-sm" value={formData.original_teacher_id} onChange={e => setFormData({...formData, original_teacher_id: e.target.value})}>
                               <option value="">Odaberi...</option>
                               {teachers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                           </select>
                       </div>
                       <div>
                           <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">Zamjenski nastavnik</label>
                           <select className="w-full border p-2 text-sm" value={formData.substitute_teacher_id} onChange={e => setFormData({...formData, substitute_teacher_id: e.target.value})}>
                               <option value="">Odaberi...</option>
                               {teachers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                           </select>
                       </div>
                       <div>
                           <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">Sat (opcionalno)</label>
                           <input type="number" min="1" max="15" className="w-full border p-2 text-sm" value={formData.hour} onChange={e => setFormData({...formData, hour: e.target.value})} placeholder="Npr. 2" />
                       </div>
                   </div>
                   <div className="mt-6 flex justify-end gap-3 border-t border-gray-100 pt-4">
                       <button onClick={() => setIsFormOpen(false)} className="px-4 py-2 text-xs font-bold bg-gray-100 uppercase tracking-widest text-gray-600">Odustani</button>
                       <button onClick={handleSave} className="px-4 py-2 text-xs font-bold bg-blue-600 text-white uppercase tracking-widest hover:bg-blue-700">Spremi</button>
                   </div>
               </div>
           )}

           {loading ? (
               <div className="py-12 flex justify-center"><Loader2 className="animate-spin text-gray-400" /></div>
           ) : substitutions.length === 0 ? (
               <div className="bg-white border p-12 text-center text-gray-400 font-bold uppercase tracking-widest">Nema evidentiranih zamjena</div>
           ) : (
               <div className="bg-white border rounded overflow-hidden shadow-sm">
                   <table className="w-full text-left">
                       <thead className="bg-[#f8fafc] border-b text-[10px] font-black uppercase text-gray-500 tracking-widest">
                           <tr>
                               <th className="p-3 pl-6">Datum / Sat</th>
                               <th className="p-3">Razred / Predmet</th>
                               <th className="p-3">Originalni nastavnik</th>
                               <th className="p-3 border-x bg-blue-50/50">Zamjena (Tko održava)</th>
                               <th className="p-3 pr-6 text-right">Akcije</th>
                           </tr>
                       </thead>
                       <tbody className="divide-y text-sm">
                           {substitutions.map(s => (
                               <tr key={s.id} className="hover:bg-gray-50">
                                   <td className="p-3 pl-6">
                                       <div className="font-bold flex items-center gap-1"><Calendar size={14} className="text-gray-400" /> {new Date(s.date).toLocaleDateString('hr-HR')}</div>
                                       {s.hour && <div className="text-xs text-gray-500 mt-1 flex items-center gap-1"><Clock size={12} /> {s.hour}. sat</div>}
                                   </td>
                                   <td className="p-3">
                                       <div className="font-bold text-[#005c8d]">{s.classes?.name}</div>
                                       <div className="text-xs text-gray-500 h-4 line-clamp-1">{s.subjects?.name}</div>
                                   </td>
                                   <td className="p-3 text-gray-600">
                                       <div className="line-through decoration-red-400 decoration-2">{s.original_teacher?.name}</div>
                                   </td>
                                   <td className="p-3 border-x bg-blue-50/20 font-bold text-green-700">
                                       {s.substitute_teacher?.name}
                                   </td>
                                   <td className="p-3 pr-6 text-right">
                                       <button onClick={() => handleDelete(s.id)} className="text-red-500 hover:bg-red-50 p-1.5 rounded" title="Obriši zamjenu"><Trash2 size={16} /></button>
                                   </td>
                               </tr>
                           ))}
                       </tbody>
                   </table>
               </div>
           )}
        </div>
      </div>
  );
}
