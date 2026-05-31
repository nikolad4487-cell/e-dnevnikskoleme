import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useSelection } from '../../contexts/SelectionContext';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { 
  Plus, 
  Edit2, 
  Trash2, 
  BookOpen, 
  ArrowLeft, 
  Award,
  AlertCircle
} from 'lucide-react';
import { PROGRAM_TYPES, CONTINUATION_TYPES } from '../../types';

interface ProgramDB {
  id: string;
  school_id: string;
  name: string;
  duration_years: number;
  type: string;
  continuation_type: string;
}

const PROGRAM_TYPE_LABELS: Record<string, string> = {
  VOCATIONAL_3Y: 'Trogodišnji strukovni program',
  COMMERCIALIST_4Y: 'Četverogodišnji strukovni program',
  CONTINUATION_FREE: 'Nastavak obrazovanja (Sufinanciran)',
  CONTINUATION_PAID: 'Nastavak obrazovanja (Uz plaćanje)'
};

const CONTINUATION_TYPE_LABELS: Record<string, string> = {
  NONE: 'Bez nastavka obrazovanja',
  FREE: 'Nastavak obrazovanja (Redoviti)',
  PAID: 'Nastavak obrazovanja (Uz plaćanje)'
};

export default function ProgramsPage() {
  const { selectedSchoolId } = useSelection();
  const { user, userSchoolRoles } = useAuth();
  const navigate = useNavigate();

  // Resolve School ID
  let schoolId = selectedSchoolId;
  if (!schoolId) {
    if (user && (user as any).school_id) {
      schoolId = (user as any).school_id;
    } else if (user && (user as any).schoolId) {
      schoolId = (user as any).schoolId;
    } else if (userSchoolRoles && userSchoolRoles.length > 0) {
      schoolId = userSchoolRoles[0].schoolId;
    } else if (user && (user as any).roles && (user as any).roles.length > 0) {
      schoolId = (user as any).roles[0].school_id || (user as any).roles[0].schoolId;
    }
  }

  const [programs, setPrograms] = useState<ProgramDB[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Form states
  const [editingProgram, setEditingProgram] = useState<ProgramDB | null>(null);
  const [name, setName] = useState('');
  const [durationYears, setDurationYears] = useState(4);
  const [type, setType] = useState('COMMERCIALIST_4Y');
  const [continuationType, setContinuationType] = useState('NONE');

  useEffect(() => {
    if (schoolId) {
      fetchPrograms();
    } else {
      setLoading(false);
    }
  }, [schoolId]);

  const fetchPrograms = async () => {
    if (!schoolId) return;
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('programs')
        .select('*')
        .eq('school_id', schoolId)
        .order('name');

      if (error) throw error;
      setPrograms(data || []);
    } catch (err: any) {
      toast.error('Greška pri učitavanju programa: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (program?: ProgramDB) => {
    if (program) {
      setEditingProgram(program);
      setName(program.name);
      setDurationYears(program.duration_years);
      setType(program.type);
      setContinuationType(program.continuation_type || 'NONE');
    } else {
      setEditingProgram(null);
      setName('');
      setDurationYears(4);
      setType('COMMERCIALIST_4Y');
      setContinuationType('NONE');
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schoolId) {
      toast.error('Škola nije odabrana.');
      return;
    }

    if (!name.trim()) {
      toast.error('Unesite naziv programa.');
      return;
    }

    try {
      setLoading(true);
      const payload = {
        name: name.trim(),
        duration_years: durationYears,
        type,
        continuation_type: continuationType,
        school_id: schoolId
      };

      if (editingProgram) {
        const { error } = await supabase
          .from('programs')
          .update(payload)
          .eq('id', editingProgram.id);

        if (error) throw error;
        toast.success('Program je uspješno ažuriran.');
      } else {
        const { error } = await supabase
          .from('programs')
          .insert([payload]);

        if (error) throw error;
        toast.success('Program je uspješno dodan.');
      }

      setIsModalOpen(false);
      fetchPrograms();
    } catch (err: any) {
      toast.error('Pogreška pri spremanju programa: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (program: ProgramDB) => {
    if (!window.confirm(`Jeste li sigurni da želite obrisati program "${program.name}"? Učenici i razredni odjeli koji koriste ovaj program mogu ostati bez definiranog smjera.`)) {
      return;
    }

    try {
      setLoading(true);
      
      // Nullify references in classes/enrollments if any first, or let postgres handle cascade/set null
      await Promise.all([
        supabase.from('classes').update({ program_id: null }).eq('program_id', program.id),
        supabase.from('student_class_enrollments').update({ program_id: null }).eq('program_id', program.id)
      ]);

      const { error } = await supabase
        .from('programs')
        .delete()
        .eq('id', program.id);

      if (error) throw error;
      toast.success('Program je izbrisan.');
      fetchPrograms();
    } catch (err: any) {
      toast.error('Pogreška pri brisanju programa: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 font-sans bg-[#f8f9fa] min-h-screen">
      <div className="max-w-7xl mx-auto">
        
        {/* Navigation & Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 border-b border-[#dee2e6] pb-6">
          <div>
            <div className="flex items-center gap-2 text-[#005c8d] text-xs font-black uppercase tracking-widest mb-2 cursor-pointer hover:underline" onClick={() => navigate('/admin-skole')}>
              <ArrowLeft size={14} /> Natrag u administraciju
            </div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tighter uppercase leading-none mb-2">Smjerovi i programi</h1>
            <p className="text-slate-500 font-medium text-sm">Upravljanje obrazovnim programima, smjerovima, trajanju stručnih kvalifikacija</p>
          </div>
          
          <div>
            <button 
              id="add-program-btn"
              onClick={() => handleOpenModal()}
              className="bg-[#005c8d] text-white px-5 py-3 rounded-sm font-black uppercase tracking-wider text-[10px] flex items-center gap-2 hover:bg-[#004a71] transition-all cursor-pointer shadow-sm active:scale-95"
            >
              <Plus size={14} strokeWidth={3} />
              Novi smjer / program
            </button>
          </div>
        </div>

        {/* Informative advice */}
        <div className="mb-6 bg-slate-100 border border-slate-200 rounded-sm p-4 text-xs text-slate-700 flex gap-3 items-start">
          <BookOpen size={16} className="mt-0.5 shrink-0 text-[#005c8d]" />
          <div>
            <span className="font-bold uppercase tracking-wider block mb-1">Strukovni i opći programi</span>
            Definiranjem programa određujete normativno trajanje školovanja (npr. 3 ili 4 godine), pripadajuće tipove razrednih odjela te uvjete vezane uz nastavak obrazovanja i izračune svjedodžbi.
          </div>
        </div>

        {/* Loading / Table / Empty */}
        {loading && programs.length === 0 ? (
          <div className="flex justify-center py-20 text-[#005c8d] animate-pulse">
            <BookOpen size={48} className="animate-bounce" />
          </div>
        ) : !schoolId ? (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 p-6 text-center rounded-sm text-sm font-bold">
            Greška: Nije moguće utvrditi aktivnu školu.
          </div>
        ) : programs.length === 0 ? (
          <div className="bg-white border border-[#dee2e6] rounded-sm p-12 text-center shadow-xs">
            <BookOpen size={40} className="mx-auto text-slate-300 mb-4" />
            <div className="text-sm font-extrabold text-slate-700 uppercase tracking-tight mb-2">Nema definiranih smjerova</div>
            <p className="text-xs text-slate-400 mb-6 max-w-sm mx-auto">Kreirajte obrazovne smjerove (npr. Komercijalist, Prodavač) kako biste ih mogli dodijeliti razrednim odjelima.</p>
            <button
              onClick={() => handleOpenModal()}
              className="bg-[#005c8d] text-white font-extrabold text-[10px] uppercase px-4 py-2 rounded-sm tracking-wider"
            >
              Dodaj novi program
            </button>
          </div>
        ) : (
          <div className="bg-white border border-[#dee2e6] rounded-sm overflow-hidden shadow-xs">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#f1f3f5] border-b border-[#dee2e6] text-[11px] font-black uppercase tracking-wider text-slate-600">
                  <th className="px-6 py-4">Naziv smjera / programa</th>
                  <th className="px-6 py-4">Trajanje (Godine)</th>
                  <th className="px-6 py-4">Tip programa</th>
                  <th className="px-6 py-4">Nastavak obrazovanja</th>
                  <th className="px-6 py-4 text-right">Akcije</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#dee2e6]">
                {programs.map(prog => (
                  <tr key={prog.id} className="hover:bg-[#f8f9fa] transition-colors">
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-sm bg-blue-50 text-[#005c8d] flex items-center justify-center font-bold">
                          <Award size={16} />
                        </div>
                        <span className="font-extrabold text-slate-800 text-sm uppercase">{prog.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-5 text-sm font-extrabold text-slate-700">
                      {prog.duration_years} {prog.duration_years === 1 ? 'godina' : prog.duration_years < 5 ? 'godine' : 'godina'}
                    </td>
                    <td className="px-6 py-5 text-xs text-slate-600 font-bold">
                      {PROGRAM_TYPE_LABELS[prog.type] || prog.type}
                    </td>
                    <td className="px-6 py-5">
                      <span className="text-[10px] font-extrabold text-slate-800 bg-slate-100 px-2 py-1 rounded">
                        {CONTINUATION_TYPE_LABELS[prog.continuation_type] || prog.continuation_type || 'NONE'}
                      </span>
                    </td>
                    <td className="px-6 py-5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleOpenModal(prog)}
                          className="p-1.5 px-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-sm cursor-pointer transition-colors"
                          title="Uredi"
                        >
                          <Edit2 size={13} />
                        </button>
                        
                        <button
                          onClick={() => handleDelete(prog)}
                          className="p-1.5 px-2 bg-red-100 hover:bg-red-200 text-red-600 rounded-sm cursor-pointer transition-colors"
                          title="Obriši"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Form modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-sm shadow-2xl overflow-hidden border border-[#dee2e6] animate-in fade-in duration-150">
            <div className="bg-[#005c8d] p-6 text-white flex items-center justify-between">
              <h2 className="text-base font-black uppercase tracking-tight">
                {editingProgram ? 'Uredi program' : 'Novi program / smjer'}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-white/80 hover:text-white font-extrabold text-xs uppercase">[ Zatvori ]</button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-1">Naziv programa</label>
                <input 
                  type="text" 
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full bg-[#f8f9fa] border border-[#dee2e6] rounded-sm p-3 font-bold text-slate-900 text-xs focus:border-[#005c8d] focus:bg-white outline-none transition-all"
                  placeholder="npr. Komercijalist"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-1">Trajanje (U godinama)</label>
                  <select 
                    value={durationYears}
                    onChange={e => setDurationYears(parseInt(e.target.value))}
                    className="w-full bg-[#f8f9fa] border border-[#dee2e6] rounded-sm p-3 font-bold text-slate-900 text-xs focus:border-[#005c8d] outline-none"
                    required
                  >
                    <option value={1}>1 godina</option>
                    <option value={2}>2 godine</option>
                    <option value={3}>3 godine</option>
                    <option value={4}>4 godine</option>
                    <option value={5}>5 godina</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-1">Tip programa</label>
                  <select 
                    value={type}
                    onChange={e => setType(e.target.value)}
                    className="w-full bg-[#f8f9fa] border border-[#dee2e6] rounded-sm p-3 font-bold text-slate-900 text-xs focus:border-[#005c8d] outline-none"
                    required
                  >
                    <option value="COMMERCIALIST_4Y">Uobičajeni stručni 4G</option>
                    <option value="VOCATIONAL_3Y">Uobičajeni strukovni 3G</option>
                    <option value="CONTINUATION_FREE">Sufinancirani nastavak</option>
                    <option value="CONTINUATION_PAID">Nastavak uz plaćanje</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-1">Uvjeti za nastavak obrazovanja</label>
                <select 
                  value={continuationType}
                  onChange={e => setContinuationType(e.target.value)}
                  className="w-full bg-[#f8f9fa] border border-[#dee2e6] rounded-sm p-3 font-bold text-slate-900 text-xs focus:border-[#005c8d] outline-none"
                  required
                >
                  <option value="NONE">Nema mogućnost direktnog nastavka</option>
                  <option value="FREE">Pokriven nastavak (Redoviti studenti)</option>
                  <option value="PAID">Izvanredan nastavak (Uz troškove školarine)</option>
                </select>
              </div>

              <div className="flex gap-3 pt-4 border-t border-[#dee2e6]">
                <button 
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 bg-slate-100 text-slate-700 py-3 rounded-sm font-black uppercase tracking-wider text-[10px] hover:bg-slate-200 transition-colors cursor-pointer text-center"
                >
                  Odustani
                </button>
                <button 
                  type="submit"
                  className="flex-1 bg-[#005c8d] text-white py-3 rounded-sm font-black uppercase tracking-wider text-[10px] hover:bg-[#004a71] transition-all cursor-pointer text-center shadow-md animate-pulse-slow"
                >
                  Spremi smjer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
