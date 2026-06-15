import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useSelection } from '../../contexts/SelectionContext';
import { Calendar, Plus, MessageCircle, Trash2, Edit, User } from 'lucide-react';
import { DeleteConfirmDialog } from '../../components/DeleteConfirmDialog';
import { Role } from '../../types';
import { toast } from 'react-hot-toast';
import { format } from 'date-fns';
import { mappers } from '../../lib/mappers';

export default function IndividualniRazgovoriPage() {
  const { classId: routeClassId } = useParams<{ classId: string }>();
  const { user } = useAuth();
  const { selectedSchoolId, selectedClassId: contextClassId } = useSelection();
  const effectiveClassId = contextClassId || routeClassId;

  const [discussions, setDiscussions] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingDiscussion, setEditingDiscussion] = useState<any>(null);

  // Form states
  const [studentId, setStudentId] = useState('');
  const [parentName, setParentName] = useState('');
  const [date, setDate] = useState('');
  const [notes, setNotes] = useState('');

  const [deleteDialog, setDeleteDialog] = useState<{
    isOpen: boolean;
    id: string;
    loading: boolean;
  }>({
    isOpen: false,
    id: '',
    loading: false
  });

  const fetchData = async () => {
    if (!selectedSchoolId || !effectiveClassId) return;
    setLoading(true);
    try {
      // 1. Fetch Students in class
      const { data: enrollData, error: enrollError } = await supabase
        .from('student_class_enrollments')
        .select('*, student:user_profiles(*)')
        .eq('class_id', effectiveClassId)
        .eq('status', 'ACTIVE');

      if (enrollError) throw enrollError;
      
      const mappedStudents = (enrollData || []).map(row => mappers.user(row.student));
      const uniqueStudents = Array.from(new Map(mappedStudents.map(s => [s.id, s])).values());
      const sortedStudents = uniqueStudents.sort((a, b) => (a.surname || '').localeCompare(b.surname || ''));
      setStudents(sortedStudents);

      // 2. Fetch Individual discussions
      const { data, error } = await supabase
        .from('individual_discussions')
        .select('*, student:user_profiles(*)')
        .eq('school_id', selectedSchoolId)
        .eq('class_id', effectiveClassId)
        .order('date', { ascending: false });

      if (error) throw error;
      setDiscussions(data || []);
    } catch (error) {
      console.error('Error fetching individual discussions data:', error);
      toast.error('Greška pri dohvaćanju individualnih razgovora');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedSchoolId, effectiveClassId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSchoolId || !effectiveClassId || !studentId) {
      toast.error('Molimo odaberite učenika');
      return;
    }

    try {
      if (editingDiscussion) {
        // Update
        const { error } = await supabase
          .from('individual_discussions')
          .update({
            student_id: studentId,
            parent_name: parentName,
            date,
            notes,
            updated_at: new Date().toISOString()
          })
          .eq('id', editingDiscussion.id);

        if (error) throw error;
        toast.success('Individualni razgovor ažuriran');
      } else {
        // Insert
        const { error } = await supabase
          .from('individual_discussions')
          .insert([{
            school_id: selectedSchoolId,
            class_id: effectiveClassId,
            student_id: studentId,
            parent_name: parentName,
            counselor_id: user?.id,
            date,
            notes
          }]);

        if (error) throw error;
        toast.success('Individualni razgovor evidentiran');
      }

      // Reset
      setShowForm(false);
      setEditingDiscussion(null);
      setStudentId('');
      setParentName('');
      setDate('');
      setNotes('');
      fetchData();
    } catch (error) {
      console.error('Error saving discussion:', error);
      toast.error('Greška pri spremanju razgovora');
    }
  };

  const handleEdit = (disc: any) => {
    setEditingDiscussion(disc);
    setStudentId(disc.student_id);
    setParentName(disc.parent_name);
    setDate(disc.date);
    setNotes(disc.notes);
    setShowForm(true);
  };

  const handleDelete = (id: string) => {
    setDeleteDialog({ isOpen: true, id, loading: false });
  };

  const confirmDelete = async () => {
    if (!deleteDialog.id) return;
    setDeleteDialog(prev => ({ ...prev, loading: true }));
    try {
      const { error } = await supabase
        .from('individual_discussions')
        .delete()
        .eq('id', deleteDialog.id);

      if (error) throw error;
      toast.success('Individualni razgovor obrisan');
      fetchData();
    } catch (error) {
      console.error(error);
      toast.error('Greška pri brisanju razgovora');
    } finally {
      setDeleteDialog({ isOpen: false, id: '', loading: false });
    }
  };

  const formatStudentName = (s: any) => {
    if (!s) return 'Nepoznat učenik';
    return `${s.surname || ''} ${s.name || ''}`.trim() || s.email || 'Nepoznat učenik';
  };

  return (
    <div className="p-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h1 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <MessageCircle className="text-[#005c8d]" size={28} /> Individualni razgovori
          </h1>
          <p className="text-xs text-slate-500 font-bold uppercase mt-1">Trajna evidencija individualnih razgovora s roditeljima</p>
        </div>

        {!showForm && (
          <button
            onClick={() => {
              setEditingDiscussion(null);
              setStudentId(students[0]?.id || '');
              setParentName('');
              setDate(format(new Date(), 'yyyy-MM-dd'));
              setNotes('');
              setShowForm(true);
            }}
            className="px-4 py-2.5 bg-[#005c8d] text-white hover:bg-[#004a71] text-xs font-black uppercase tracking-widest rounded shadow-sm flex items-center gap-2 transition-all cursor-pointer active:scale-95 shrink-0"
          >
            <Plus size={14} /> Novi razgovor
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white border border-gray-300 shadow-sm p-6 mb-6 rounded">
          <h2 className="text-sm font-black text-[#005c8d] uppercase tracking-wider mb-4 border-b pb-2">
            {editingDiscussion ? 'Uredi individualni razgovor' : 'Evidentiraj novi individualni razgovor'}
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
            <div className="md:col-span-2">
              <label className="block text-[10px] font-black uppercase text-slate-400 tracking-wider mb-1">Odaberite učenika</label>
              <select
                required
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                className="w-full border border-gray-300 p-2.5 text-xs font-bold text-slate-800 rounded bg-white focus:outline-[#005c8d]"
              >
                <option value="">-- Odaberite učenika --</option>
                {students.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.surname}, {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase text-slate-400 tracking-wider mb-1">Ime roditelja</label>
              <input
                type="text"
                placeholder="Npr. Marija Horvat"
                required
                value={parentName}
                onChange={(e) => setParentName(e.target.value)}
                className="w-full border border-gray-300 p-2 text-xs font-bold text-slate-800 rounded focus:outline-[#005c8d]"
              />
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase text-slate-400 tracking-wider mb-1">Datum razgovora</label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full border border-gray-300 p-2 text-xs font-bold text-slate-800 rounded focus:outline-[#005c8d]"
              />
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-[10px] font-black uppercase text-slate-400 tracking-wider mb-1">Bilješke i tijek razgovora (trajna pohrana)</label>
            <textarea
              rows={6}
              placeholder="Unesite bilješke o dogovorenom, problemu i zaključcima..."
              required
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full border border-gray-300 p-2.5 text-xs font-medium text-slate-800 rounded focus:outline-[#005c8d]"
            />
          </div>

          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setEditingDiscussion(null);
              }}
              className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-black uppercase tracking-wider rounded transition-all cursor-pointer"
            >
              Odustani
            </button>
            <button
              type="submit"
              className="px-6 py-2 bg-[#005c8d] text-white hover:bg-[#004a71] text-xs font-black uppercase tracking-wider rounded shadow-sm transition-all cursor-pointer"
            >
              Spremi razgovor
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="text-center py-12 text-xs font-bold text-slate-500 uppercase">Učitavanje...</div>
      ) : discussions.length === 0 ? (
        <div className="bg-slate-50 text-slate-500 text-center py-12 text-xs font-extrabold uppercase border border-dashed rounded italic">
          Nema evidentiranih individualnih razgovora za ovaj razred.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {discussions.map((disc) => (
            <div key={disc.id} className="bg-white border border-gray-300 shadow-sm p-5 rounded-md flex flex-col md:flex-row justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <div className="flex items-center gap-1 text-[10px] font-black uppercase tracking-tight bg-slate-100 px-2 py-0.5 rounded text-slate-600 border">
                    <Calendar size={11} />
                    {format(new Date(disc.date), 'dd.MM.yyyy.')}
                  </div>
                  <div className="text-[10px] font-black uppercase tracking-tight text-slate-400">
                    Roditelj: <span className="text-slate-800 font-extrabold">{disc.parent_name}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 mb-3">
                  <span className="text-[10px] font-black uppercase tracking-wider text-[#005c8d] bg-sky-50 border border-sky-200/50 px-2.5 py-1 rounded">
                    Učenik: {formatStudentName(disc.student)}
                  </span>
                </div>

                {disc.notes && (
                  <p className="text-slate-700 text-xs font-medium bg-slate-50/50 p-4 border rounded leading-relaxed whitespace-pre-wrap italic">
                    "{disc.notes}"
                  </p>
                )}
              </div>

              <div className="flex sm:flex-col justify-end gap-2 shrink-0 self-start md:self-stretch select-none">
                <button
                  onClick={() => handleEdit(disc)}
                  className="p-2 text-slate-600 hover:text-[#005c8d] border border-slate-200 rounded hover:bg-slate-50 flex items-center justify-center cursor-pointer transition-all active:scale-95"
                  title="Uredi"
                >
                  <Edit size={14} />
                </button>
                <button
                  onClick={() => handleDelete(disc.id)}
                  className="p-2 text-red-600 hover:text-red-800 border border-red-100 hover:bg-red-50 rounded flex items-center justify-center cursor-pointer transition-all active:scale-95"
                  title="Obriši"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <DeleteConfirmDialog
        isOpen={deleteDialog.isOpen}
        title="Brisanje individualnog razgovora"
        message="Jeste li sigurni da želite obrisati podatke o ovom individualnom razgovoru? Ova radnja će trajno ukloniti zapis."
        loading={deleteDialog.loading}
        onClose={() => setDeleteDialog({ isOpen: false, id: '', loading: false })}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
