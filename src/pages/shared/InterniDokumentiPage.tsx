import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useSelection } from '../../contexts/SelectionContext';
import { logSystemAction } from '../../utils/auditLogger';
import { jsPDF } from 'jspdf';
import { 
  FileText, Search, Plus, Trash2, Download, Filter,
  BookOpen, Calendar, RefreshCw, PenTool, ShieldCheck, Link2, Archive
} from 'lucide-react';
import { toast } from 'react-hot-toast';

interface SchoolDocument {
  id: string;
  school_id: string;
  school_year_id?: string;
  title: string;
  description: string;
  category: string;
  document_type: string;
  visibility: string;
  status: string;
  uploaded_by: string;
  created_at: string;
  updated_at: string;
}

export default function InterniDokumentiPage() {
  const { user, isStaff } = useAuth();
  const { selectedSchoolId } = useSelection();

  const [docs, setDocs] = useState<SchoolDocument[]>([]);
  const [filteredDocs, setFilteredDocs] = useState<SchoolDocument[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters State
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState<string>('SVE');

  // New / Edit Doc Form
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingDocId, setEditingDocId] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [newType, setNewType] = useState('PRAVILNIK');
  const [newCat, setNewCat] = useState('Opći akti');
  const [newAccess, setNewAccess] = useState('INTERNAL');
  const [newContent, setNewContent] = useState('');

  useEffect(() => {
    if (!selectedSchoolId) return;
    loadDocuments();
  }, [selectedSchoolId]);

  const loadDocuments = async () => {
    try {
      setLoading(true);
      console.log("[DOKUMENTI] Loading documents");
      const { data, error } = await supabase
        .from('school_documents')
        .select('*')
        .eq('school_id', selectedSchoolId)
        .order('created_at', { ascending: false });
        
      if (error) {
         if (error.code === '42P01') {
            console.log("[DOKUMENTI] Table does not exist. Treating as empty.");
            setDocs([]);
            setFilteredDocs([]);
            return;
         }
         throw error;
      }
      console.log("[DOKUMENTI] Query result", data);
      setDocs(data || []);
      setFilteredDocs(data || []);
    } catch (err: any) {
      console.error("[DOKUMENTI] Error", err);
      toast.error(`Neuspješno učitavanje dokumenata: ${err.message || 'Nepoznata greška'}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let res = [...docs];
    if (searchTerm) {
      const s = searchTerm.toLowerCase();
      res = res.filter(d => 
        (d.title || '').toLowerCase().includes(s) || 
        (d.description || '').toLowerCase().includes(s) ||
        (d.category || '').toLowerCase().includes(s)
      );
    }
    if (selectedType !== 'SVE') {
      res = res.filter(d => d.document_type === selectedType);
    }
    setFilteredDocs(res);
  }, [searchTerm, selectedType, docs]);

  const handleAddDoc = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newContent.trim()) {
      toast.error('Naziv i sadržaj su obavezni.');
      return;
    }

    try {
      const payload = {
        school_id: selectedSchoolId,
        title: newTitle,
        document_type: newType,
        category: newCat,
        description: newContent,
        visibility: newAccess,
        status: editingDocId ? undefined : 'ODOBREN',
        uploaded_by: user?.id
      };

      if (editingDocId) {
        const { error } = await supabase.from('school_documents').update(payload).eq('id', editingDocId);
        if (error) throw error;
        toast.success('Dokument je ažuriran.');
      } else {
        const { data, error } = await supabase.from('school_documents').insert([payload]).select().single();
        if (error) throw error;
        toast.success('Novi dokument je pohranjen.');
        if (user?.id && data) {
          await logSystemAction({
            executor_id: user.id,
            school_id: selectedSchoolId || '',
            action_type: 'PUBLISH_DOCUMENT',
            entity_type: 'INTERNAL_DOCUMENT',
            entity_id: data.id,
            new_value: { title: newTitle, document_type: newType }
          });
        }
      }

      setShowAddModal(false);
      setEditingDocId(null);
      setNewTitle('');
      setNewContent('');
      loadDocuments();
    } catch (err) {
      console.error(err);
      toast.error('Spremanje dokumenta nije uspjelo.');
    }
  };

  const openAddModal = () => {
    setEditingDocId(null);
    setNewTitle('');
    setNewType('PRAVILNIK');
    setNewCat('Opći akti');
    setNewAccess('INTERNAL');
    setNewContent('');
    setShowAddModal(true);
  };

  const openEditModal = (doc: SchoolDocument) => {
    setEditingDocId(doc.id);
    setNewTitle(doc.title);
    setNewType(doc.document_type || 'PRAVILNIK');
    setNewCat(doc.category || 'Opći akti');
    setNewAccess(doc.visibility || 'INTERNAL');
    setNewContent(doc.description || '');
    setShowAddModal(true);
  };

  const handleArchiveDoc = async (doc: SchoolDocument) => {
    if (!window.confirm(`Arhivirati dokument "${doc.title}"?`)) return;
    try {
      const { error } = await supabase.from('school_documents').update({ status: 'ARHIVIRAN' }).eq('id', doc.id);
      if (error) throw error;
      toast.success('Dokument arhiviran.');
      loadDocuments();
    } catch (e) {
      console.error(e);
      toast.error('Greška pri arhiviranju.');
    }
  };

  const handleDeleteDoc = async (doc: SchoolDocument) => {
    if (!window.confirm(`Izbrisati dokument "${doc.title}"?`)) return;
    try {
      const { error } = await supabase.from('school_documents').delete().eq('id', doc.id);
      if (error) throw error;
      
      toast.success('Dokument izbrisan.');
      if (user?.id) {
        await logSystemAction({
          executor_id: user.id,
          school_id: selectedSchoolId || '',
          action_type: 'DELETE_DOCUMENT',
          entity_type: 'INTERNAL_DOCUMENT',
          entity_id: doc.id,
          old_value: { title: doc.title }
        });
      }
      loadDocuments();
    } catch (e) {
      console.error(e);
      toast.error('Greška pri brisanju.');
    }
  };

  const handleDownloadPdf = async (doc: SchoolDocument) => {
    try {
      if (user?.id) {
        await logSystemAction({
          executor_id: user.id,
          school_id: selectedSchoolId || '',
          action_type: 'DOWNLOAD_DOCUMENT_PDF',
          entity_type: 'INTERNAL_DOCUMENT',
          entity_id: doc.id,
          new_value: { title: doc.title }
        });
      }

      const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
      pdf.setFont('helvetica', 'normal');
      
      pdf.setFontSize(10);
      pdf.setTextColor(100);
      pdf.text(`KLASA: ${doc.id.substring(0,8)}`, 20, 20);
      pdf.text(`RAZINA POSJETA: ${doc.visibility}`, 20, 25);
      pdf.text(`STATUS: ${doc.status}`, 20, 30);

      pdf.setFontSize(16);
      pdf.setTextColor(0);
      pdf.text(doc.title || '', 105, 50, { align: 'center' });

      pdf.setFontSize(11);
      const splitBody = pdf.splitTextToSize(doc.description || '', 170);
      pdf.text(splitBody, 20, 70);

      pdf.save(`${(doc.title || '').replace(/\s+/g, '_')}.pdf`);
    } catch (e) {
      console.error(e);
      toast.error('Generiranje PDF-a nije uspjelo.');
    }
  };

  return (
    <div className="p-6 bg-slate-50 min-h-screen font-sans">
      <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-slate-200 pb-4 mb-6">
        <div>
          <h1 className="text-2xl font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
            <BookOpen size={24} className="text-[#005c8d]" />
            Sustav upravljanja dokumentima
          </h1>
          <p className="text-xs font-bold text-slate-400 mt-1 uppercase tracking-wider">
            Središnja baza školskih dokumenata
          </p>
        </div>
        <div className="mt-4 md:mt-0 flex gap-2">
          {isStaff && (
            <button
              onClick={openAddModal}
              className="bg-[#005c8d] text-white px-4 py-2 rounded-md font-bold text-xs uppercase tracking-wider flex items-center gap-2 hover:bg-[#00476b] transition-colors shadow-sm"
            >
              <Plus size={16} /> Novi dokument
            </button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-md border border-slate-200 shadow-sm overflow-hidden flex flex-col md:flex-row items-center gap-4 p-4 mb-6">
         <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input 
              type="text" 
              placeholder="Pretraži po nazivu, izrazu..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-md text-sm outline-none focus:border-[#005c8d]/50 bg-slate-50 transition-all"
            />
         </div>
         <div className="flex items-center gap-2 w-full md:w-auto">
            <Filter size={14} className="text-slate-400" />
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="border border-slate-200 rounded-md text-sm outline-none px-3 py-2 bg-slate-50 w-full md:w-48 text-slate-700"
            >
              <option value="SVE">Sve vrste</option>
              <option value="PRAVILNIK">Pravilnici</option>
              <option value="ODLUKA">Odluke</option>
              <option value="OBRAZAC">Obrasci</option>
              <option value="KURIKULUM">Kurikuli</option>
              <option value="PLAN">Nastavni planovi</option>
              <option value="ZAPISNIK">Zapisnici</option>
              <option value="INTERNI">Interni dokumenti</option>
              <option value="OSTALO">Ostalo</option>
            </select>
         </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-sm text-slate-400 uppercase font-black tracking-widest animate-pulse">Učitavanje...</div>
      ) : filteredDocs.length === 0 ? (
        <div className="bg-white border-2 border-dashed border-slate-200 rounded-xl p-12 text-center text-slate-400">
          <BookOpen size={48} className="mx-auto text-slate-300 mb-4" />
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">Nema dokumenata škole.</h2>
          <p className="text-xs mt-2">Pokušajte primijeniti drugačije filtere.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredDocs.map((doc) => (
            <div key={doc.id} className="bg-white rounded-md border border-slate-200 shadow-sm p-5 hover:shadow-md transition-shadow relative group flex flex-col">
              <div className="flex justify-between items-start mb-3">
                <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded font-black uppercase tracking-wider inline-flex gap-1 items-center">
                  <FileText size={10} /> {doc.document_type}
                </span>
                <span className="text-[9px] text-[#005c8d] font-bold uppercase tracking-wider bg-[#005c8d]/10 px-2 py-0.5 rounded border border-[#005c8d]/20">
                  {doc.visibility}
                </span>
              </div>
              <h3 className="font-bold text-slate-800 leading-snug mb-2 line-clamp-2">{doc.title}</h3>
              <p className="text-xs text-slate-500 font-medium mb-4 bg-slate-50 p-2 rounded border border-slate-100 line-clamp-4 leading-relaxed flex-1">
                {doc.description || 'Nema sažetka dokumenta.'}
              </p>
              <div className="flex justify-between items-end mt-auto pt-4 border-t border-slate-100">
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] text-slate-400 font-bold uppercase flex items-center gap-1"><PenTool size={10} /> {new Date(doc.created_at).toLocaleDateString('hr-HR')}</span>
                  <span className="text-[10px] text-slate-400 font-bold uppercase flex items-center gap-1"><ShieldCheck size={10} /> {doc.status}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => handleDownloadPdf(doc)}
                    className="p-1.5 text-[#005c8d] hover:bg-[#005c8d]/10 rounded transition-colors" title="Preuzmi PDF"
                  >
                    <Download size={16} />
                  </button>
                  {isStaff && (
                    <>
                      <button 
                        onClick={() => openEditModal(doc)}
                        className="p-1.5 text-orange-500 hover:bg-orange-50 rounded transition-colors" title="Uredi dokument"
                      >
                        <PenTool size={16} />
                      </button>
                      <button 
                        onClick={() => handleArchiveDoc(doc)}
                        className="p-1.5 text-gray-500 hover:bg-gray-100 rounded transition-colors" title="Arhiviraj dokument"
                      >
                        <Archive size={16} />
                      </button>
                      <button 
                        onClick={() => handleDeleteDoc(doc)}
                        className="p-1.5 text-red-500 hover:bg-red-50 rounded transition-colors" title="Obriši dokument"
                      >
                        <Trash2 size={16} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showAddModal && isStaff && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
              <h2 className="text-sm font-black uppercase tracking-wider text-slate-800 border-l-4 border-[#005c8d] pl-3">
                {editingDocId ? 'Uredi Dokument' : 'Upload Novog Dokumenta'}
              </h2>
              <button 
                onClick={() => {
                  setShowAddModal(false);
                  setEditingDocId(null);
                }} 
                className="text-slate-400 hover:text-slate-600 font-bold px-2 py-1"
              >
                ✕
              </button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto">
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Naziv dokumenta</label>
                <input 
                  type="text" value={newTitle} onChange={e => setNewTitle(e.target.value)}
                  className="w-full border border-slate-200 rounded p-2 text-sm focus:border-[#005c8d] outline-none" placeholder="Unesite puni naziv..."
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Kategorija</label>
                  <input 
                    type="text" value={newCat} onChange={e => setNewCat(e.target.value)}
                    className="w-full border border-slate-200 rounded p-2 text-sm focus:border-[#005c8d] outline-none" placeholder="Npr. Opći akti"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Tip</label>
                  <select 
                    value={newType} onChange={e => setNewType(e.target.value)}
                    className="w-full border border-slate-200 rounded p-2 text-sm focus:border-[#005c8d] outline-none bg-white"
                  >
                    <option value="PRAVILNIK">Pravilnici</option>
                    <option value="ODLUKA">Odluke</option>
                    <option value="OBRAZAC">Obrasci</option>
                    <option value="KURIKULUM">Kurikuli</option>
                    <option value="PLAN">Nastavni planovi</option>
                    <option value="ZAPISNIK">Zapisnici</option>
                    <option value="INTERNI">Interni dokumenti</option>
                    <option value="OSTALO">Ostalo</option>
                  </select>
                </div>
              </div>
              <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Razina pristupa</label>
                  <select 
                    value={newAccess} onChange={e => setNewAccess(e.target.value)}
                    className="w-full border border-slate-200 rounded p-2 text-sm focus:border-[#005c8d] outline-none bg-white"
                  >
                    <option value="PRIVATE">Privatno (Samo admini i autori)</option>
                    <option value="INTERNAL">Interno (Svi djelatnici i učenici)</option>
                    <option value="PUBLIC">Javno (Vanjski posjetitelji)</option>
                  </select>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1"><FileText size={12}/> Sadržaj dokumenta</label>
                <textarea 
                  value={newContent} onChange={e => setNewContent(e.target.value)}
                  className="w-full border border-slate-200 rounded p-3 text-sm focus:border-[#005c8d] outline-none resize-y min-h-[200px]" placeholder="Unesite ili zalijepite formalni tekst dokumenta..."
                />
              </div>
            </div>
            <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex justify-end gap-3">
              <button 
                onClick={() => {
                  setShowAddModal(false);
                  setEditingDocId(null);
                }}
                className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-500 hover:text-slate-800 transition-colors"
              >
                Odustani
              </button>
              <button 
                onClick={handleAddDoc}
                className="px-5 py-2 text-xs font-black uppercase tracking-wider text-white bg-[#005c8d] rounded shadow hover:bg-[#00476b] transition-all"
              >
                {editingDocId ? 'Spremi izmjene' : 'Pohrani Dokument'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
