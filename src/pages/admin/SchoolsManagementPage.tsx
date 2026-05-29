import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { School, Role, SchoolType, SecondarySubtype } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { useSelection } from '../../contexts/SelectionContext';
import { useNavigate } from 'react-router-dom';
import { Plus, List, Edit2, Trash2, ExternalLink, School as SchoolIcon } from 'lucide-react';
import { toast } from 'react-hot-toast';

export default function SchoolsManagementPage() {
  const { user, isMainAdmin } = useAuth();
  const { setSelectedSchoolId } = useSelection();
  const navigate = useNavigate();
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  // Form State
  const [editingSchool, setEditingSchool] = useState<School | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState<SchoolType>('SECONDARY');
  const [subtype, setSubtype] = useState<SecondarySubtype | null>(null);

  useEffect(() => {
    fetchSchools();
  }, []);

  const fetchSchools = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.from('schools').select('*').order('name');
      if (error) throw error;
      setSchools(data || []);
    } catch (err: any) {
      toast.error('Greška pri učitavanju škola: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (school?: School) => {
    if (!isMainAdmin) {
      toast.error('Samo glavni administrator može uređivati škole.');
      return;
    }
    if (school) {
      setEditingSchool(school);
      setName(school.name);
      setType(school.type);
      setSubtype(school.subtype || null);
    } else {
      setEditingSchool(null);
      setName('');
      setType('SECONDARY');
      setSubtype(null);
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isMainAdmin) {
      console.warn("Attempted school create/update without MAIN_ADMIN role");
      return;
    }
    
    console.log(`${editingSchool ? 'UPDATE' : 'CREATE'} SCHOOL CLICKED`, { name, type, subtype });
    
    try {
      const payload = {
        name,
        type,
        subtype: type === 'SECONDARY' ? subtype : null
      };

      if (editingSchool) {
        const { data, error } = await supabase.from('schools').update(payload).eq('id', editingSchool.id).select();
        console.log("UPDATE SCHOOL RESULT:", { data, error });
        if (error) throw error;
        toast.success('Škola uspješno ažurirana');
      } else {
        // ID must be string for schools
        const id = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
        const { data, error } = await supabase.from('schools').insert([{ ...payload, id }]).select();
        console.log("CREATE SCHOOL RESULT:", { data, error });
        if (error) throw error;
        toast.success('Škola uspješno dodana');
      }
      
      setIsModalOpen(false);
      fetchSchools();
    } catch (err: any) {
      console.error("SCHOOL ACTION FAILED:", err);
      toast.error('Greška pri spremanju škole: ' + (err.message || 'Nepoznata greška'));
    }
  };

  const handleDelete = async (id: string) => {
    if (!isMainAdmin) {
      toast.error('Samo glavni administrator može brisati škole.');
      return;
    }
    
    console.log("DELETE SCHOOL CLICKED", { id });
    
    if (!window.confirm('Jeste li sigurni da želite obrisati ovu školu i SVE njezine podatke (korisnike, razrede, ocjene)? Ova radnja je nepovratna.')) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase.from('schools').delete().eq('id', id).select();
      console.log("DELETE SCHOOL RESULT:", { data, error });
      
      if (error) throw error;
      toast.success('Škola i svi njezini podaci su obrisani.');
      fetchSchools();
    } catch (err: any) {
      console.error("DELETE SCHOOL FAILED:", err);
      toast.error('Greška pri brisanju škole: ' + (err.message || 'Nepoznata greška'));
    } finally {
      setLoading(false);
    }
  };

  const handleSelectSchool = (id: string) => {
    setSelectedSchoolId(id);
    navigate('/admin-skole');
  };

  return (
    <div className="p-6 font-sans">
      <div className="flex justify-between items-end mb-8 border-b-2 border-slate-100 pb-6">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tighter uppercase leading-none mb-2">Upravljanje školama</h1>
          <p className="text-slate-500 font-medium text-sm">Pregled i administracija svih obrazovnih ustanova u sustavu</p>
        </div>
        
        {isMainAdmin && (
          <button 
            id="add-school-btn"
            onClick={() => handleOpenModal()}
            className="bg-[#005c8d] text-white px-6 py-3 rounded-xl font-black uppercase tracking-widest text-xs flex items-center gap-2 hover:bg-[#004a71] transition-all shadow-lg active:scale-95"
          >
            <Plus size={18} strokeWidth={3} />
            Dodaj školu
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center p-20 animate-pulse text-slate-300">
          <SchoolIcon size={48} />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {schools.map(school => (
            <div key={school.id} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden group hover:shadow-xl transition-all hover:-translate-y-1">
              <div className="p-6">
                <div className="w-12 h-12 bg-slate-50 rounded-xl flex items-center justify-center text-[#005c8d] mb-4 group-hover:bg-[#005c8d] group-hover:text-white transition-colors">
                  <SchoolIcon size={24} strokeWidth={2.5} />
                </div>
                
                <h3 className="text-xl font-black text-slate-900 mb-1 leading-tight uppercase tracking-tight">{school.name}</h3>
                <div className="flex gap-2 mb-6">
                  <span className="bg-slate-100 text-slate-600 text-[10px] font-black uppercase px-2 py-1 rounded tracking-tighter">
                    {school.type === 'PRIMARY' ? 'Osnovna škola' : 'Srednja škola'}
                  </span>
                  {school.subtype && (
                    <span className="bg-blue-50 text-[#005c8d] text-[10px] font-black uppercase px-2 py-1 rounded tracking-tighter">
                      {school.subtype === 'GENERAL' ? 'Gimnazija' : 'Strukovna'}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 mt-auto">
                  <button 
                    onClick={() => handleSelectSchool(school.id)}
                    className="flex items-center justify-center gap-2 bg-[#005c8d] text-white py-3 rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-[#004a71] transition-colors"
                  >
                    <ExternalLink size={14} />
                    Otvori
                  </button>
                  {isMainAdmin && (
                    <div className="flex gap-2">
                      <button 
                        onClick={() => handleOpenModal(school)}
                        className="flex-1 flex items-center justify-center bg-slate-50 text-slate-600 py-3 rounded-xl hover:bg-slate-100 transition-colors"
                        title="Uredi"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button 
                        onClick={() => handleDelete(school.id)}
                        className="flex-1 flex items-center justify-center bg-red-50 text-red-500 py-3 rounded-xl hover:bg-red-100 transition-colors"
                        title="Obriši"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}

          {schools.length === 0 && (
            <div className="col-span-full bg-slate-50 border-2 border-dashed border-slate-200 rounded-3xl p-20 text-center">
              <SchoolIcon size={64} className="mx-auto text-slate-200 mb-6" />
              <h2 className="text-2xl font-black text-slate-400 uppercase tracking-tighter">Nema registriranih škola</h2>
            </div>
          )}
        </div>
      )}

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="bg-[#005c8d] p-8 text-white">
              <h2 className="text-2xl font-black uppercase tracking-tighter leading-none">
                {editingSchool ? 'Uredi školu' : 'Nova škola'}
              </h2>
            </div>
            
            <form onSubmit={handleSubmit} className="p-8 space-y-6">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Naziv škole</label>
                <input 
                  type="text" 
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl p-4 font-bold text-slate-900 focus:border-[#005c8d] outline-none transition-all"
                  required
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Tip škole</label>
                <div className="grid grid-cols-2 gap-3">
                  <button 
                    type="button"
                    onClick={() => setType('PRIMARY')}
                    className={`p-4 rounded-xl font-black uppercase text-[10px] tracking-widest border-2 transition-all ${type === 'PRIMARY' ? 'bg-blue-50 border-[#005c8d] text-[#005c8d]' : 'bg-slate-50 border-slate-100 text-slate-400'}`}
                  >
                    Osnovna
                  </button>
                  <button 
                    type="button"
                    onClick={() => setType('SECONDARY')}
                    className={`p-4 rounded-xl font-black uppercase text-[10px] tracking-widest border-2 transition-all ${type === 'SECONDARY' ? 'bg-blue-50 border-[#005c8d] text-[#005c8d]' : 'bg-slate-50 border-slate-100 text-slate-400'}`}
                  >
                    Srednja
                  </button>
                </div>
              </div>

              {type === 'SECONDARY' && (
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Podtip srednje škole</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button 
                      type="button"
                      onClick={() => setSubtype('GENERAL')}
                      className={`p-4 rounded-xl font-black uppercase text-[10px] tracking-widest border-2 transition-all ${subtype === 'GENERAL' ? 'bg-blue-50 border-[#005c8d] text-[#005c8d]' : 'bg-slate-50 border-slate-100 text-slate-400'}`}
                    >
                      Gimnazija
                    </button>
                    <button 
                      type="button"
                      onClick={() => setSubtype('VOCATIONAL')}
                      className={`p-4 rounded-xl font-black uppercase text-[10px] tracking-widest border-2 transition-all ${subtype === 'VOCATIONAL' ? 'bg-blue-50 border-[#005c8d] text-[#005c8d]' : 'bg-slate-50 border-slate-100 text-slate-400'}`}
                    >
                      Strukovna
                    </button>
                  </div>
                </div>
              )}

              <div className="flex gap-4 pt-4">
                <button 
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 bg-slate-100 text-slate-600 py-4 rounded-xl font-black uppercase tracking-widest text-[10px] hover:bg-slate-200 transition-colors"
                >
                  Odustani
                </button>
                <button 
                  type="submit"
                  className="flex-1 bg-[#005c8d] text-white py-4 rounded-xl font-black uppercase tracking-widest text-[10px] hover:bg-[#004a71] transition-colors shadow-lg"
                >
                  Spremi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
