import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useSelection } from '../../contexts/SelectionContext';
import { FileText, Plus, Calendar, User as UserIcon, Trash2 } from 'lucide-react';
import { DeleteConfirmDialog } from '../../components/DeleteConfirmDialog';
import { Role, User } from '../../types';
import { toast } from 'react-hot-toast';
import { mappers, mapList } from '../../lib/mappers';
import { formatPersonName } from '../../lib/utils';

export default function ZapisniciPage() {
  const { classId: routeClassId } = useParams<{ classId: string }>();
  const { user, isMainAdmin, highestRole } = useAuth();
  const { selectedSchoolId, selectedClassId: contextClassId } = useSelection();
  
  const effectiveClassId = contextClassId || routeClassId;

  const [zapisnici, setZapisnici] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');

  const [deleteDialog, setDeleteDialog] = useState<{
    isOpen: boolean;
    id: string;
    loading: boolean;
  }>({
    isOpen: false,
    id: '',
    loading: false
  });

  const fetchZapisnici = async () => {
    if (!selectedSchoolId) return;
    try {
      let query = supabase
        .from('zapisnici')
        .select('*')
        .eq('school_id', selectedSchoolId);
      
      if (effectiveClassId) {
        query = query.eq('class_id', effectiveClassId);
      }

      const { data, error } = await query.order('timestamp', { ascending: false });
      
      if (error) throw error;
      setZapisnici(data || []);
    } catch (error) {
      console.error(error);
      toast.error('Greška pri dohvaćanju zapisnika');
    }
  };

  useEffect(() => {
    fetchZapisnici();
  }, [selectedSchoolId, effectiveClassId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { error } = await supabase.from('zapisnici').insert([{
        title,
        content,
        school_id: selectedSchoolId,
        class_id: effectiveClassId,
        author_id: user?.id,
        author_name: formatPersonName(user),
        timestamp: new Date().toISOString()
      }]);
      
      if (error) throw error;
      
      setTitle('');
      setContent('');
      setShowForm(false);
      fetchZapisnici();
      toast.success('Zapisnik spremljen');
    } catch (err) {
      console.error(err);
      toast.error('Greška pri spremanju zapisnika');
    }
  };

  const handleDelete = (id: string) => {
    const zapisnik = zapisnici.find(z => z.id === id);
    if (!zapisnik) return;

    const isAdmin = isMainAdmin || highestRole === Role.ADMIN || highestRole === Role.SCHOOL_ADMIN;
    if (!isAdmin && zapisnik.author_id !== user?.id) {
      toast.error('Niste ovlašteni za brisanje ovog zapisnika.');
      return;
    }

    setDeleteDialog({ isOpen: true, id, loading: false });
  };

  const confirmDelete = async () => {
    if (!deleteDialog.id) return;
    setDeleteDialog(prev => ({ ...prev, loading: true }));
    try {
      const { error } = await supabase.from('zapisnici').delete().eq('id', deleteDialog.id);
      if (error) throw error;
      
      toast.success('Zapis je uspješno obrisan.');
      fetchZapisnici();
    } catch (err) {
      console.error(err);
      toast.error('Brisanje nije uspjelo.');
    } finally {
      setDeleteDialog({ isOpen: false, id: '', loading: false });
    }
  };

  return (
    <div className="flex flex-col h-full bg-white font-sans">
      <div className="bg-[#f8fafc] border-b border-gray-300 px-4 py-2 flex items-center justify-between">
        <h2 className="text-sm font-black text-[#005c8d] flex items-center gap-2 uppercase tracking-widest leading-none">
          <FileText size={16} />
          Zapisnici
        </h2>
        <button 
          onClick={() => setShowForm(!showForm)}
          className="bg-[#005c8d] text-white px-4 py-1 border border-[#004a70] text-[10px] font-black uppercase tracking-widest flex items-center gap-2 hover:bg-[#004a70] shadow-sm"
        >
          {showForm ? 'Zatvori obrazac' : '+ Novi zapisnik'}
        </button>
      </div>

      <div className="flex-1 overflow-auto p-6 scrollbar-thin">
        {showForm && (
          <form onSubmit={handleSubmit} className="mb-8 border border-gray-300 bg-gray-50/50 p-4 max-w-2xl mx-auto shadow-sm animate-in slide-in-from-top-2 duration-200">
            <div className="text-[10px] font-black text-gray-400 uppercase mb-4 border-b pb-1">Unos novog službenog zapisnika</div>
            <div className="space-y-3">
              <div className="space-y-1">
                 <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Naslov zapisnika</label>
                 <input 
                    type="text" 
                    placeholder="npr. Roditeljski sastanak 4.A" 
                    className="w-full border border-gray-300 p-2 text-xs outline-none focus:border-[#005c8d] bg-white"
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    required
                  />
              </div>
              <div className="space-y-1">
                 <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Sadržaj / Tekst zapisnika</label>
                 <textarea 
                    placeholder="Unesite detaljan tekst zapisnika..." 
                    rows={8} 
                    className="w-full border border-gray-300 p-2 text-xs outline-none focus:border-[#005c8d] bg-white leading-relaxed"
                    value={content}
                    onChange={e => setContent(e.target.value)}
                    required
                  />
              </div>
              <div className="flex gap-2 pt-2">
                <button type="submit" className="bg-[#005c8d] text-white px-6 py-2 border border-[#004a70] font-black text-[10px] uppercase tracking-widest hover:bg-[#004a70]">Spremi zapis</button>
                <button type="button" onClick={() => setShowForm(false)} className="bg-white border border-gray-300 px-6 py-2 font-black text-[10px] uppercase tracking-widest text-gray-600 hover:bg-gray-50">Odustani</button>
              </div>
            </div>
          </form>
        )}

        <div className="w-full border border-gray-300 bg-white">
          <div className="bg-gray-100 border-b border-gray-300 px-4 py-2 flex items-center justify-between">
             <div className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Kronološki popis zapisnika ({zapisnici.length})</div>
             <div className="text-[9px] text-gray-400 font-bold uppercase tracking-tighter">Prikazuju se svi službeni zapisi</div>
          </div>
          <div className="divide-y divide-gray-200">
            {zapisnici.map(z => (
              <div key={z.id} className="p-4 hover:bg-blue-50/30 transition-colors group">
                <div className="flex items-start justify-between gap-4 mb-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-1">
                       <h4 className="font-black text-sm text-[#005c8d] uppercase tracking-tight">{z.title}</h4>
                       <div className="h-px flex-1 bg-gray-100 group-hover:bg-blue-100 transition-colors"></div>
                    </div>
                    <p className="text-xs text-gray-600 leading-relaxed italic border-l-2 border-gray-100 pl-3 py-1 bg-gray-50/50 group-hover:bg-white transition-colors">"{z.content}"</p>
                  </div>
                  <button 
                    onClick={() => handleDelete(z.id)}
                    className="text-gray-300 hover:text-red-500 transition-colors shrink-0 pt-1"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className="flex items-center gap-6 mt-4 text-[9px] font-black text-gray-400 uppercase tracking-widest">
                  <div className="flex items-center gap-1.5"><Calendar size={12} className="text-gray-300" /> {new Date(z.timestamp).toLocaleDateString('hr-HR')}</div>
                  <div className="flex items-center gap-1.5"><UserIcon size={12} className="text-gray-300" /> {z.author_name}</div>
                  <div className="ml-auto text-gray-300">ID: {z.id.slice(0, 8)}</div>
                </div>
              </div>
            ))}
            {zapisnici.length === 0 && !showForm && (
              <div className="py-20 text-center flex flex-col items-center justify-center bg-gray-50/50">
                 <FileText size={32} className="text-gray-200 mb-3" strokeWidth={1} />
                 <div className="text-[10px] font-black text-gray-300 uppercase tracking-widest italic">Arhiva zapisnika je prazna</div>
              </div>
            )}
          </div>
        </div>
      </div>
      <DeleteConfirmDialog 
        isOpen={deleteDialog.isOpen}
        onClose={() => setDeleteDialog({ ...deleteDialog, isOpen: false })}
        onConfirm={confirmDelete}
        loading={deleteDialog.loading}
      />
    </div>
  );
}
