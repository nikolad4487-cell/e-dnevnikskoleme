import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useSelection } from '../../contexts/SelectionContext';
import { Calendar, Plus, Users, Clock, FileText, Trash2, Edit } from 'lucide-react';
import { DeleteConfirmDialog } from '../../components/DeleteConfirmDialog';
import { Role } from '../../types';
import { toast } from 'react-hot-toast';
import { format } from 'date-fns';

export default function RoditeljskiSastanciPage() {
  const { classId: routeClassId } = useParams<{ classId: string }>();
  const { user } = useAuth();
  const { selectedSchoolId, selectedClassId: contextClassId } = useSelection();
  const effectiveClassId = contextClassId || routeClassId;

  const [meetings, setMeetings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingMeeting, setEditingMeeting] = useState<any>(null);

  // Form states
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [topic, setTopic] = useState('');
  const [leader, setLeader] = useState(user?.name || '');
  const [minutes, setMinutes] = useState('');

  const [deleteDialog, setDeleteDialog] = useState<{
    isOpen: boolean;
    id: string;
    loading: boolean;
  }>({
    isOpen: false,
    id: '',
    loading: false
  });

  const fetchMeetings = async () => {
    if (!selectedSchoolId || !effectiveClassId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('parent_meetings')
        .select('*')
        .eq('school_id', selectedSchoolId)
        .eq('class_id', effectiveClassId)
        .order('date', { ascending: false });

      if (error) throw error;
      setMeetings(data || []);
    } catch (error) {
      console.error('Error fetching parent meetings:', error);
      toast.error('Greška pri dohvaćanju roditeljskih sastanaka');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMeetings();
  }, [selectedSchoolId, effectiveClassId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSchoolId || !effectiveClassId) return;

    try {
      if (editingMeeting) {
        // Update
        const { error } = await supabase
          .from('parent_meetings')
          .update({
            date,
            time,
            topic,
            leader,
            minutes,
            updated_at: new Date().toISOString()
          })
          .eq('id', editingMeeting.id);

        if (error) throw error;
        toast.success('Roditeljski sastanak ažuriran');
      } else {
        // Insert
        const { error } = await supabase
          .from('parent_meetings')
          .insert([{
            school_id: selectedSchoolId,
            class_id: effectiveClassId,
            date,
            time,
            topic,
            leader,
            minutes
          }]);

        if (error) throw error;
        toast.success('Roditeljski sastanak dodan');
      }

      // Reset form
      setShowForm(false);
      setEditingMeeting(null);
      setDate('');
      setTime('');
      setTopic('');
      setLeader(user?.name || '');
      setMinutes('');
      fetchMeetings();
    } catch (error) {
      console.error('Error saving meeting:', error);
      toast.error('Greška pri spremanju sastanka');
    }
  };

  const handleEdit = (meeting: any) => {
    setEditingMeeting(meeting);
    setDate(meeting.date);
    setTime(meeting.time);
    setTopic(meeting.topic);
    setLeader(meeting.leader);
    setMinutes(meeting.minutes || '');
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
        .from('parent_meetings')
        .delete()
        .eq('id', deleteDialog.id);

      if (error) throw error;
      toast.success('Roditeljski sastanak obrisan');
      fetchMeetings();
    } catch (error) {
      console.error(error);
      toast.error('Greška pri brisanju sastanka');
    } finally {
      setDeleteDialog({ isOpen: false, id: '', loading: false });
    }
  };

  return (
    <div className="p-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h1 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <Users className="text-[#005c8d]" size={28} /> Roditeljski sastanci
          </h1>
          <p className="text-xs text-slate-500 font-bold uppercase mt-1">Zapisnici i evidencija održanih roditeljskih sastanaka razreda</p>
        </div>

        {!showForm && (
          <button
            onClick={() => {
              setEditingMeeting(null);
              setDate(format(new Date(), 'yyyy-MM-dd'));
              setTime('18:00');
              setTopic('');
              setLeader(user?.name || '');
              setMinutes('');
              setShowForm(true);
            }}
            className="px-4 py-2.5 bg-[#005c8d] text-white hover:bg-[#004a71] text-xs font-black uppercase tracking-widest rounded shadow-sm flex items-center gap-2 transition-all cursor-pointer active:scale-95 shrink-0"
          >
            <Plus size={14} /> Novi sastanak
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white border border-gray-300 shadow-sm p-6 mb-6 rounded">
          <h2 className="text-sm font-black text-[#005c8d] uppercase tracking-wider mb-4 border-b pb-2">
            {editingMeeting ? 'Uredi roditeljski sastanak' : 'Evidentiraj novi roditeljski sastanak'}
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-[10px] font-black uppercase text-slate-400 tracking-wider mb-1">Datum održavanja</label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full border border-gray-300 p-2 text-xs font-bold text-slate-800 rounded focus:outline-[#005c8d]"
              />
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase text-slate-400 tracking-wider mb-1">Vrijeme održavanja</label>
              <input
                type="text"
                placeholder="Npr. 18:00"
                required
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full border border-gray-300 p-2 text-xs font-bold text-slate-800 rounded focus:outline-[#005c8d]"
              />
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase text-slate-400 tracking-wider mb-1">Voditelj sastanka</label>
              <input
                type="text"
                placeholder="Npr. Ivan Horvat"
                required
                value={leader}
                onChange={(e) => setLeader(e.target.value)}
                className="w-full border border-gray-300 p-2 text-xs font-bold text-slate-800 rounded focus:outline-[#005c8d]"
              />
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-[10px] font-black uppercase text-slate-400 tracking-wider mb-1">Tema roditeljskog sastanka</label>
            <input
              type="text"
              placeholder="Npr. Prvi roditeljski sastanak - upoznavanje s kućnim redom"
              required
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              className="w-full border border-gray-300 p-2 text-xs font-bold text-slate-800 rounded focus:outline-[#005c8d]"
            />
          </div>

          <div className="mb-4">
            <label className="block text-[10px] font-black uppercase text-slate-400 tracking-wider mb-1">Zapisnik (odluke, zaključci, nazočni roditelji...)</label>
            <textarea
              rows={6}
              placeholder="Unesite zaključke i tijek roditeljskog sastanka..."
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              className="w-full border border-gray-300 p-2 text-xs font-medium text-slate-800 rounded focus:outline-[#005c8d] font-mono"
            />
          </div>

          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setEditingMeeting(null);
              }}
              className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-black uppercase tracking-wider rounded transition-all cursor-pointer"
            >
              Odustani
            </button>
            <button
              type="submit"
              className="px-6 py-2 bg-[#005c8d] text-white hover:bg-[#004a71] text-xs font-black uppercase tracking-wider rounded shadow-sm transition-all cursor-pointer"
            >
              Spremi zapisnik
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="text-center py-12 text-xs font-bold text-slate-500 uppercase">Učitavanje...</div>
      ) : meetings.length === 0 ? (
        <div className="bg-slate-50 text-slate-500 text-center py-12 text-xs font-extrabold uppercase border border-dashed rounded italic">
          Nema evidentiranih roditeljskih sastanaka za ovaj razred.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {meetings.map((meeting) => (
            <div key={meeting.id} className="bg-white border border-gray-300 shadow-sm p-5 rounded-md flex flex-col md:flex-row justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <div className="flex items-center gap-1 text-[10px] font-black uppercase tracking-tight bg-slate-100 px-2 py-0.5 rounded text-slate-600 border">
                    <Calendar size={11} />
                    {format(new Date(meeting.date), 'dd.MM.yyyy.')}
                  </div>
                  <div className="flex items-center gap-1 text-[10px] font-black uppercase tracking-tight bg-slate-100 px-2 py-0.5 rounded text-slate-600 border">
                    <Clock size={11} />
                    {meeting.time}
                  </div>
                  <div className="text-[10px] font-black uppercase tracking-tight text-slate-400">
                    Voditelj: <span className="text-slate-700 font-black">{meeting.leader}</span>
                  </div>
                </div>

                <h3 className="text-sm font-black text-slate-900 tracking-tight uppercase">{meeting.topic}</h3>

                {meeting.minutes && (
                  <div className="mt-4 bg-slate-50/50 p-4 border rounded font-mono text-[10.5px] leading-relaxed text-slate-700 whitespace-pre-wrap">
                    {meeting.minutes}
                  </div>
                )}
              </div>

              <div className="flex sm:flex-col justify-end gap-2 shrink-0 self-start md:self-stretch select-none">
                <button
                  onClick={() => handleEdit(meeting)}
                  className="p-2 text-slate-600 hover:text-[#005c8d] border border-slate-200 rounded hover:bg-slate-50 flex items-center justify-center cursor-pointer transition-all active:scale-95"
                  title="Uredi"
                >
                  <Edit size={14} />
                </button>
                <button
                  onClick={() => handleDelete(meeting.id)}
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
        title="Brisanje roditeljskog sastanka"
        message="Jeste li sigurni da želite obrisati podatke o ovom roditeljskom sastanku? Ova radnja se ne može poništiti."
        loading={deleteDialog.loading}
        onClose={() => setDeleteDialog({ isOpen: false, id: '', loading: false })}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
