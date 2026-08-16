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
  Calendar, 
  Check, 
  CheckCircle2, 
  AlertTriangle, 
  ArrowLeft, 
  Building2, 
  Archive,
  Clock
} from 'lucide-react';

interface DBYear {
  id: string;
  name: string;
  starts_at: string;
  ends_at: string;
  is_active: boolean;
  status: string;
  school_id: string;
}

export default function SchoolYearsPage() {
  const { selectedSchoolId } = useSelection();
  const { user, userSchoolRoles } = useAuth();
  const navigate = useNavigate();

  // 1. Identify active schoolId based on user request (selectedSchoolId or profile active_school_id)
  let schoolId = selectedSchoolId;
  if (!schoolId) {
    if (user && (user as any).active_school_id) {
      schoolId = (user as any).active_school_id;
    } else if (user && (user as any).activeSchoolId) {
      schoolId = (user as any).activeSchoolId;
    } else if (user && (user as any).school_id) {
      schoolId = (user as any).school_id;
    } else if (user && (user as any).schoolId) {
      schoolId = (user as any).schoolId;
    } else if (userSchoolRoles && userSchoolRoles.length > 0) {
      schoolId = userSchoolRoles[0].schoolId;
    } else if (user && (user as any).roles && (user as any).roles.length > 0) {
      schoolId = (user as any).roles[0].school_id || (user as any).roles[0].schoolId;
    }
  }

  // Debug statement as requested
  console.log("SCHOOL YEARS PAGE schoolId", schoolId);

  const [years, setYears] = useState<DBYear[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Form states
  const [editingYear, setEditingYear] = useState<DBYear | null>(null);
  const [name, setName] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [status, setStatus] = useState('ACTIVE');

  useEffect(() => {
    if (schoolId) {
      fetchYears();
    } else {
      setLoading(false);
    }
  }, [schoolId]);

  const fetchYears = async () => {
    if (!schoolId) return;
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("school_years")
        .select("*")
        .eq("school_id", schoolId)
        .order("starts_at", { ascending: false });

      // Debug statement as requested
      console.log("SCHOOL YEARS FETCH", data, error);

      if (error) {
        console.warn("Direct fetch from Supabase failed, trying API fallback:", error);
        const res = await fetch(`/api/school-years?schoolId=${schoolId}`);
        const json = await res.json();
        if (json.success && json.data) {
          setYears(json.data);
          return;
        }
        throw error;
      }
      setYears(data || []);
    } catch (err: any) {
      toast.error('Greška pri učitavanju školskih godina: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (year?: DBYear) => {
    if (year) {
      setEditingYear(year);
      setName(year.name);
      setStartsAt(year.starts_at || '');
      setEndsAt(year.ends_at || '');
      setStatus(year.status || (year.is_active ? 'ACTIVE' : 'ARCHIVED'));
    } else {
      setEditingYear(null);
      // Auto-detect next year suggestion such as "2026./2027."
      const currentYear = new Date().getFullYear();
      setName(`${currentYear}./${currentYear + 1}.`);
      setStartsAt(`${currentYear}-09-01`);
      setEndsAt(`${currentYear + 1}-06-30`);
      setStatus('ACTIVE');
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schoolId) {
      toast.error('Nije odabrana aktivna škola.');
      return;
    }

    try {
      // Define if the year starts as active or inactive
      const is_active = status === 'ACTIVE';

      if (editingYear) {
        const payload = {
          name,
          starts_at: startsAt,
          ends_at: endsAt,
          status,
          is_active,
          school_id: schoolId
        };
        console.log("SAVE SCHOOL YEAR PAYLOAD", payload);

        let error: any = null;
        const res = await supabase
          .from('school_years')
          .update({
            name,
            starts_at: startsAt,
            ends_at: endsAt,
            status,
            is_active
          })
          .eq('id', editingYear.id);

        error = res.error;
        if (error) {
          console.warn("Direct Supabase update failed, attempting service role API fallback:", error);
          const apiRes = await fetch(`/api/school-years/${editingYear.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          const apiData = await apiRes.json();
          if (!apiRes.ok || !apiData.success) {
            throw new Error(apiData.error || error.message);
          }
        }

        toast.success('Školska godina je uspješno izmijenjena.');
      } else {
        const payload = {
          name,
          starts_at: startsAt,
          ends_at: endsAt,
          status,
          is_active,
          school_id: schoolId
        };
        console.log("SAVE SCHOOL YEAR PAYLOAD", payload);

        let error: any = null;
        const res = await supabase
          .from('school_years')
          .insert([payload]);

        error = res.error;
        if (error) {
          console.warn("Direct Supabase insert failed, attempting service role API fallback:", error);
          const apiRes = await fetch('/api/school-years', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          const apiData = await apiRes.json();
          if (!apiRes.ok || !apiData.success) {
            throw new Error(apiData.error || error.message);
          }
        }

        toast.success('Uspješno stvorena školska godina.');
      }

      setIsModalOpen(false);
      await fetchYears();
    } catch (err: any) {
      toast.error('Greška pri spremanju školske godine: ' + err.message);
    }
  };

  const handleActivate = async (year: DBYear) => {
    if (!schoolId) return;
    console.log("ACTIVATE SCHOOL YEAR", year);

    if (!window.confirm(`Jeste li sigurni da želite postaviti školsku godinu "${year.name}" kao aktivnu? Sve ostale školske godine za ovu školu bit će automatski arhivirane.`)) {
      return;
    }

    try {
      setLoading(true);
      
      // 1. Inactivate and archive other years for this school
      const { error: deactivateError } = await supabase
        .from('school_years')
        .update({ is_active: false, status: 'ARCHIVED' })
        .eq('school_id', schoolId)
        .neq('id', year.id);

      // 2. Activate selected year
      const { error: activateError } = await supabase
        .from('school_years')
        .update({ is_active: true, status: 'ACTIVE' })
        .eq('id', year.id);

      if (deactivateError || activateError) {
        console.warn("Direct activation encountered an issue, falling back to service role API");
        const apiRes = await fetch(`/api/school-years/${year.id}/activate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ school_id: schoolId })
        });
        const apiData = await apiRes.json();
        if (!apiRes.ok || !apiData.success) {
          throw new Error(apiData.error || deactivateError?.message || activateError?.message);
        }
      }

      toast.success(`Školska godina ${year.name} je sada aktivna.`);
      await fetchYears();
    } catch (err: any) {
      toast.error('Greška pri aktivaciji: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleArchive = async (year: DBYear) => {
    try {
      setLoading(true);
      const { error } = await supabase
        .from('school_years')
        .update({ is_active: false, status: 'ARCHIVED' })
        .eq('id', year.id);

      if (error) {
        console.warn("Direct archive failed, using API fallback:", error);
        const apiRes = await fetch(`/api/school-years/${year.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ is_active: false, status: 'ARCHIVED', school_id: schoolId })
        });
        const apiData = await apiRes.json();
        if (!apiRes.ok || !apiData.success) {
          throw new Error(apiData.error || error.message);
        }
      }

      toast.success(`Školska godina ${year.name} je arhivirana.`);
      await fetchYears();
    } catch (err: any) {
      toast.error('Greška pri arhiviranju: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (year: DBYear) => {
    if (year.is_active) {
      toast.error('Ne možete obrisati aktivnu školsku godinu. Najprije postavite drugu kao aktivnu.');
      return;
    }

    if (!window.confirm(`Jeste li sigurni da želite nepovratno obrisati školsku godinu "${year.name}"? Svi razredni odjeli i ostale informacije u ovoj godini mogu pretrpjeti gubitke.`)) {
      return;
    }

    try {
      setLoading(true);
      const { error } = await supabase
        .from('school_years')
        .delete()
        .eq('id', year.id);

      if (error) {
        console.warn("Direct delete failed, trying API fallback:", error);
        const apiRes = await fetch(`/api/school-years/${year.id}`, {
          method: 'DELETE'
        });
        const apiData = await apiRes.json();
        if (!apiRes.ok || !apiData.success) {
          throw new Error(apiData.error || error.message);
        }
      }

      toast.success('Školska godina uspješno obrisana.');
      await fetchYears();
    } catch (err: any) {
      toast.error('Greška pri brisanju školske godine: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '—';
    try {
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        return `${parts[2]}.${parts[1]}.${parts[0]}.`;
      }
      return new Date(dateStr).toLocaleDateString('hr-HR');
    } catch (e) {
      return dateStr;
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
            <h1 className="text-3xl font-black text-slate-900 tracking-tighter uppercase leading-none mb-2">Školske godine</h1>
            <p className="text-slate-500 font-medium text-sm">Upravljanje nastavnim razdobljima i aktivacija tekuće školske godine</p>
          </div>
          
          <div>
            <button 
              id="add-year-btn"
              onClick={() => handleOpenModal()}
              className="bg-[#005c8d] text-white px-5 py-3 rounded-sm font-black uppercase tracking-wider text-[10px] flex items-center gap-2 hover:bg-[#004a71] transition-all cursor-pointer shadow-sm active:scale-95"
            >
              <Plus size={14} strokeWidth={3} />
              Nova školska godina
            </button>
          </div>
        </div>

        {/* Info panel */}
        <div className="mb-6 bg-blue-50 border border-blue-200 rounded-sm p-4 text-xs text-blue-800 flex gap-3 items-start">
          <Clock size={16} className="mt-0.5 shrink-0 text-[#005c8d]" />
          <div>
            <span className="font-bold uppercase tracking-wider block mb-1">Pravilo aktivne školske godine</span>
            Sustav dopušta samo jednu aktivnu školsku godinu po školi. Prilikom aktivacije odabrane godine, sve ostale se automatski arhiviraju i isključuju iz uobičajenog dnevnika rada.
          </div>
        </div>

        {/* Loading Indicator or Data */}
        {loading ? (
          <div className="flex justify-center py-20 text-[#005c8d] animate-pulse">
            <Calendar size={48} className="animate-bounce" />
          </div>
        ) : !schoolId ? (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 p-6 text-center rounded-sm text-sm font-bold">
            Greška: Nije moguće odrediti aktivnu školu. Molimo odaberite aktivnu školu na popisu škola.
          </div>
        ) : years.length === 0 ? (
          <div className="bg-white border border-[#dee2e6] rounded-sm p-12 text-center shadow-sm">
            <Calendar size={40} className="mx-auto text-slate-300 mb-4" />
            <div className="text-base font-extrabold text-slate-700 uppercase tracking-tight mb-2">Nema školskih godina</div>
            <p className="text-xs text-slate-500 mb-6 max-w-sm mx-auto">Dodajte prvu školsku godinu kako biste mogli unijeti razredne odjele i nastavne planove.</p>
            <button
              onClick={() => handleOpenModal()}
              className="bg-[#005c8d] text-white font-extrabold text-[10px] uppercase px-4 py-2 rounded-sm tracking-wider"
            >
              Dodaj novu školsku godinu
            </button>
          </div>
        ) : (
          <div className="bg-white border border-[#dee2e6] rounded-sm overflow-hidden shadow-sm">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#f1f3f5] border-b border-[#dee2e6] text-[11px] font-black uppercase tracking-wider text-slate-600">
                  <th className="px-6 py-4">Naziv godine</th>
                  <th className="px-6 py-4">Početak</th>
                  <th className="px-6 py-4">Kraj</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Aktivna</th>
                  <th className="px-6 py-4 text-right">Akcije</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#dee2e6]">
                {years.map(year => {
                  const isDbActive = year.is_active;
                  const isStatusArchived = year.status === 'ARCHIVED';

                  return (
                    <tr key={year.id} className={`hover:bg-[#f8f9fa] transition-colors ${isDbActive ? 'bg-blue-50/20' : ''}`}>
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-sm flex items-center justify-center ${isDbActive ? 'bg-blue-100 text-[#005c8d]' : 'bg-slate-100 text-slate-500'}`}>
                            <Calendar size={16} strokeWidth={2.5} />
                          </div>
                          <span className="font-extrabold text-slate-800 text-sm">{year.name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-5 text-xs font-bold text-slate-700">
                        {formatDate(year.starts_at)}
                      </td>
                      <td className="px-6 py-5 text-xs font-bold text-slate-700">
                        {formatDate(year.ends_at)}
                      </td>
                      <td className="px-6 py-5">
                        {isStatusArchived ? (
                          <span className="text-[9px] font-black uppercase tracking-wider py-1 px-2.5 bg-amber-100 text-amber-800 rounded">
                            ARHIVIRANA
                          </span>
                        ) : (
                          <span className="text-[9px] font-black uppercase tracking-wider py-1 px-2.5 bg-green-100 text-green-800 rounded">
                            AKTIVNA
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-5">
                        {isDbActive ? (
                          <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase text-blue-700 bg-blue-100 px-2.5 py-1 rounded">
                            <CheckCircle2 size={11} strokeWidth={3} /> DA
                          </span>
                        ) : (
                          <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">
                            NE
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {!isDbActive ? (
                            <button
                              onClick={() => handleActivate(year)}
                              className="bg-green-600 text-white font-black text-[9px] uppercase tracking-wider py-1.5 px-3 rounded-sm hover:bg-green-700 transition-colors cursor-pointer"
                            >
                              Aktiviraj
                            </button>
                          ) : (
                            <button
                              onClick={() => handleArchive(year)}
                              className="bg-amber-500 text-white font-black text-[9px] uppercase tracking-wider py-1.5 px-3 rounded-sm hover:bg-amber-600 transition-colors cursor-pointer"
                            >
                              Arhiviraj
                            </button>
                          )}
                          
                          <button
                            onClick={() => handleOpenModal(year)}
                            className="p-1 px-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-sm cursor-pointer transition-colors"
                            title="Uredi"
                          >
                            <Edit2 size={13} />
                          </button>
                          
                          <button
                            disabled={isDbActive}
                            onClick={() => handleDelete(year)}
                            className={`p-1 px-2 rounded-sm cursor-pointer transition-colors ${isDbActive ? 'bg-slate-50 text-slate-300 pointer-events-none' : 'bg-red-100 hover:bg-red-200 text-red-600'}`}
                            title={isDbActive ? "Ne možete obrisati aktivnu godinu" : "Obriši"}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
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
              <h2 className="text-lg font-black uppercase tracking-tight">
                {editingYear ? 'Uredi školsku godinu' : 'Nova školska godina'}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-white/80 hover:text-white font-extrabold text-sm uppercase">[ Zatvori ]</button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-1">Naziv godine</label>
                <input 
                  type="text" 
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full bg-[#f8f9fa] border border-[#dee2e6] rounded-sm p-3 font-bold text-slate-900 text-xs focus:border-[#005c8d] focus:bg-white outline-none transition-all"
                  placeholder="npr. 2026./2027."
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-1">Početak nastave</label>
                  <input 
                    type="date" 
                    value={startsAt}
                    onChange={e => setStartsAt(e.target.value)}
                    className="w-full bg-[#f8f9fa] border border-[#dee2e6] rounded-sm p-3 font-bold text-slate-900 text-xs focus:border-[#005c8d] focus:bg-white outline-none transition-all"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-1">Kraj nastave</label>
                  <input 
                    type="date" 
                    value={endsAt}
                    onChange={e => setEndsAt(e.target.value)}
                    className="w-full bg-[#f8f9fa] border border-[#dee2e6] rounded-sm p-3 font-bold text-slate-900 text-xs focus:border-[#005c8d] focus:bg-white outline-none transition-all"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-1">Početni status</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer font-bold text-xs text-slate-800">
                    <input 
                      type="radio" 
                      name="status" 
                      value="ACTIVE"
                      checked={status === 'ACTIVE'}
                      onChange={() => setStatus('ACTIVE')}
                      className="accent-[#005c8d]"
                    />
                    Aktivna (prikazuje se na popisu u tijeku)
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer font-bold text-xs text-slate-800">
                    <input 
                      type="radio" 
                      name="status" 
                      value="ARCHIVED"
                      checked={status === 'ARCHIVED'}
                      onChange={() => setStatus('ARCHIVED')}
                      className="accent-[#005c8d]"
                    />
                    Arhivirana (povijesni pregled)
                  </label>
                </div>
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
                  className="flex-1 bg-[#005c8d] text-white py-3 rounded-sm font-black uppercase tracking-wider text-[10px] hover:bg-[#004a71] transition-colors cursor-pointer text-center shadow-md"
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
