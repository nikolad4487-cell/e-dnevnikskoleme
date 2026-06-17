import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { matchesSearch } from '../../lib/utils';
import { formatSubjectName } from '../../lib/utils';
import { Subject, Role } from '../../types';
import { useSelection } from '../../contexts/SelectionContext';
import { useAuth } from '../../contexts/AuthContext';
import { Plus, Edit2, Trash2, BookOpen, ChevronLeft, Search } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';

export default function SubjectManagementPage() {
  const { selectedSchoolId } = useSelection();
  const { isMainAdmin, userSchoolRoles } = useAuth();
  const navigate = useNavigate();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const isAnyAdmin = isMainAdmin || userSchoolRoles.some(r => r.schoolId === selectedSchoolId && (r.role === Role.SCHOOL_ADMIN || r.role === Role.ADMIN));

  // Form State
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');

  useEffect(() => {
    if (selectedSchoolId) {
      fetchSubjects();
    } else {
      setSubjects([]);
    }
  }, [selectedSchoolId]);

  const fetchSubjects = async () => {
    if (!selectedSchoolId) return;
    try {
      setLoading(true);
      const { data, error } = await supabase.from('subjects').select('*').eq('school_id', selectedSchoolId).order('name');
      if (error) throw error;
      setSubjects(data || []);
    } catch (err: any) {
      toast.error('Greška pri učitavanju predmeta');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAnyAdmin) {
      console.warn("Attempted subject create/update without admin permissions");
      return;
    }

    if (!selectedSchoolId) {
      toast.error("Nije odabrana škola.");
      return;
    }
    
    const cleanName = name.replace(/\s*\((izborni|elective)\)\s*$/i, '').trim();
    const payload = { 
      name: cleanName, 
      code: code || null,
      school_id: selectedSchoolId
    };
    console.log("SUBJECT INSERT PAYLOAD", payload);

    try {
      if (editingSubject) {
        const { data, error } = await supabase.from('subjects').update(payload).eq('id', editingSubject.id).select();
        console.log("UPDATE SUBJECT RESULT:", { data, error });
        if (error) throw error;
        toast.success('Predmet ažuriran');
      } else {
        const { data, error } = await supabase.from('subjects').insert([payload]).select();
        console.log("CREATE SUBJECT RESULT:", { data, error });
        if (error) throw error;
        toast.success('Predmet dodan');
      }
      setIsModalOpen(false);
      fetchSubjects();
    } catch (err: any) {
      console.error("SUBJECT ACTION FAILED:", err);
      toast.error('Greška pri spremanju predmeta: ' + (err.message || 'Nepoznata greška'));
    }
  };

  const handleDelete = async (id: string) => {
    if (!isAnyAdmin) {
      toast.error('Nemate dozvolu za brisanje predmeta.');
      return;
    }

    console.log("DELETE SUBJECT CLICKED", { id });

    const confirmMsg = isMainAdmin 
      ? 'Brisanjem predmeta uklonit ćete ga iz svih razreda, te obrisati sve ocjene i upise za ovaj predmet u CIJELOM SUSTAVU. Nastaviti?'
      : 'Brisanjem predmeta on će biti uklonjen iz svih razreda u ovoj školi. Nastaviti?';

    if (!window.confirm(confirmMsg)) return;

    try {
      setLoading(true);
      if (isMainAdmin) {
        console.log("PERFORMING GLOBAL CASCADE DELETE for subject:", id);
        // Global cascade
        const results = await Promise.all([
          supabase.from('class_subject_teachers').delete().eq('subject_id', id),
          supabase.from('curriculum_plans').delete().eq('subject_id', id),
          supabase.from('student_subject_enrollments').delete().eq('subject_id', id),
          supabase.from('grading_elements').delete().eq('subject_id', id),
          supabase.from('grades').delete().eq('subject_id', id),
          supabase.from('exams').delete().eq('subject_id', id),
        ]);
        console.log("CASCADE DELETE RESULTS:", results);

        const { data, error } = await supabase.from('subjects').delete().eq('id', id).select();
        console.log("FINAL SUBJECT DELETE RESULT:", { data, error });
        if (error) throw error;
        toast.success('Predmet trajno obrisan.');
      } else {
        const { data, error } = await supabase.from('subjects').delete().eq('id', id).select();
        console.log("REGULAR SUBJECT DELETE RESULT:", { data, error });
        if (error) {
           if (error.message?.includes('foreign key constraint')) {
             toast.error('Predmet sadrži podatke. Samo glavni administrator ga može obrisati.');
           } else {
             throw error;
           }
        } else {
          toast.success('Predmet obrisan.');
        }
      }
      fetchSubjects();
    } catch (err: any) {
      console.error("DELETE SUBJECT FAILED:", err);
      toast.error('Greška pri brisanju predmeta: ' + (err.message || 'Nepoznata greška'));
    } finally {
      setLoading(false);
    }
  };

  const filteredSubjects = subjects.filter(s => 
    matchesSearch(s.name, searchTerm) || 
    matchesSearch(s.code, searchTerm)
  );

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
          <h1 className="text-3xl font-black text-slate-900 tracking-tighter uppercase leading-none mb-2">Predmeti</h1>
          <p className="text-slate-500 font-medium text-sm">Popis svih nastavnih predmeta dostupnih u školi</p>
        </div>
        
        {isAnyAdmin && (
          <button 
            onClick={() => {
              setEditingSubject(null);
              setName('');
              setCode('');
              setIsModalOpen(true);
            }}
            className="bg-[#005c8d] text-white px-6 py-3 rounded-xl font-black uppercase tracking-widest text-xs flex items-center gap-2 hover:bg-[#004a71] transition-all shadow-lg"
          >
            <Plus size={18} strokeWidth={3} />
            Novi predmet
          </button>
        )}
      </div>

      <div className="bg-white p-4 rounded-2xl border border-slate-200 mb-6 flex items-center gap-4">
        <Search className="text-slate-300" size={20} />
        <input 
          type="text" 
          placeholder="Pretraži predmete..." 
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="bg-transparent border-none outline-none font-bold text-slate-900 w-full"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredSubjects.map(subject => (
          <div key={subject.id} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between group hover:border-[#005c8d] transition-all">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center">
                <BookOpen size={20} />
              </div>
              <div>
                <h3 className="font-black text-slate-900 uppercase text-sm tracking-tight">{formatSubjectName(subject)}</h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{subject.code || 'Nema koda'}</p>
              </div>
            </div>
            
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {isAnyAdmin && (
                <>
                  <button 
                    onClick={() => {
                      setEditingSubject(subject);
                      setName(subject.name);
                      setCode(subject.code || '');
                      setIsModalOpen(true);
                    }}
                    className="p-2 text-slate-400 hover:text-blue-500"
                  >
                    <Edit2 size={16} />
                  </button>
                  <button 
                    onClick={() => handleDelete(subject.id)}
                    className="p-2 text-slate-400 hover:text-red-500"
                  >
                    <Trash2 size={16} />
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden">
            <div className="bg-[#005c8d] p-8 text-white">
              <h2 className="text-2xl font-black uppercase tracking-tighter leading-none">
                {editingSubject ? 'Uredi predmet' : 'Novi predmet'}
              </h2>
            </div>
            
            <form onSubmit={handleSubmit} className="p-8 space-y-6">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Naziv predmeta</label>
                <input 
                  type="text" 
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl p-4 font-bold text-slate-900 focus:border-[#005c8d] outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Kratica / Kod</label>
                <input 
                  type="text" 
                  value={code}
                  onChange={e => setCode(e.target.value)}
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl p-4 font-bold text-slate-900 focus:border-[#005c8d] outline-none"
                />
              </div>

              <div className="flex gap-4 pt-4">
                <button 
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 bg-slate-100 text-slate-600 py-4 rounded-xl font-black uppercase tracking-widest text-[10px]"
                >
                  Odustani
                </button>
                <button 
                  type="submit"
                  className="flex-1 bg-[#005c8d] text-white py-4 rounded-xl font-black uppercase tracking-widest text-[10px] shadow-lg"
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
