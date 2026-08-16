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
  GraduationCap,
  Sparkles,
  Layers
} from 'lucide-react';
import { 
  FACULTY_STUDY_TYPE_LABELS, 
  UCITELJSKI_FACULTY_MODULES 
} from '../../types';

interface ProgramDB {
  id: string;
  school_id: string;
  name: string;
  duration_years: number;
  type: string;
  continuation_type: string;
  module_or_track?: string | null;
}

interface SchoolDB {
  id: string;
  name: string;
  type: string;
  subtype?: string | null;
}

const SECONDARY_PROGRAM_TYPE_LABELS: Record<string, string> = {
  VOCATIONAL_3Y: 'Strukovni 3G',
  COMMERCIALIST_4Y: 'Uobičajeni stručni 4G',
  GYMNASIUM_4Y: 'Gimnazijski',
  CONTINUATION_FREE: 'Nastavak obrazovanja (Sufinanciran)',
  CONTINUATION_PAID: 'Nastavak obrazovanja (Uz plaćanje)'
};

const CONTINUATION_TYPE_LABELS: Record<string, string> = {
  NONE: 'Nema mogućnost direktnog nastavka',
  FREE: 'Nastavak obrazovanja (Redoviti / Sufinancirani)',
  PAID: 'Nastavak obrazovanja (Uz plaćanje / Izvanredni)'
};

export default function ProgramsPage() {
  const { selectedSchoolId } = useSelection();
  const { user, userSchoolRoles } = useAuth();
  const navigate = useNavigate();

  // Resolve School ID
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

  const [school, setSchool] = useState<SchoolDB | null>(null);
  const [programs, setPrograms] = useState<ProgramDB[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState<{
    isOpen: boolean;
    program: ProgramDB | null;
    loading: boolean;
  }>({
    isOpen: false,
    program: null,
    loading: false
  });

  // Form states
  const [editingProgram, setEditingProgram] = useState<ProgramDB | null>(null);
  const [name, setName] = useState('');
  const [durationYears, setDurationYears] = useState(4);
  const [type, setType] = useState('COMMERCIALIST_4Y');
  const [continuationType, setContinuationType] = useState('NONE');
  const [moduleOrTrack, setModuleOrTrack] = useState('');
  const [isCustomModule, setIsCustomModule] = useState(false);

  // Determine if this institution is a Faculty / Higher education
  const isFaculty = school?.type === 'FAKULTET' || 
    (school?.name ? /fakultet|veleučilišt|sveučilišt|akademij/i.test(school.name) : false);

  const isUciteljski = isFaculty && 
    (school?.name ? /učiteljsk|uciteljsk/i.test(school.name) : false);

  useEffect(() => {
    if (schoolId) {
      fetchSchoolAndPrograms();
    } else {
      setLoading(false);
    }
  }, [schoolId]);

  const fetchSchoolAndPrograms = async () => {
    if (!schoolId) return;
    try {
      setLoading(true);
      
      // Fetch school info
      const { data: sData } = await supabase
        .from('schools')
        .select('id, name, type, subtype')
        .eq('id', schoolId)
        .single();
      
      if (sData) {
        setSchool(sData);
      }

      // Fetch programs
      const { data: pData, error } = await supabase
        .from('programs')
        .select('*')
        .eq('school_id', schoolId)
        .order('name');

      if (error) {
        console.warn('Direct fetch from Supabase failed, trying API fallback:', error);
        const res = await fetch(`/api/programs?schoolId=${schoolId}`);
        const json = await res.json();
        if (json.success && json.data) {
          setPrograms(json.data);
          return;
        }
        throw error;
      }
      setPrograms(pData || []);
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
      const trackVal = program.module_or_track || '';
      setModuleOrTrack(trackVal);
      setIsCustomModule(!!trackVal && !UCITELJSKI_FACULTY_MODULES.includes(trackVal));
    } else {
      setEditingProgram(null);
      if (isFaculty) {
        // Faculty default values
        setName(isUciteljski ? 'Integrirani prijediplomski i diplomski sveučilišni studij - Učiteljski studij' : '');
        setDurationYears(5);
        setType('INTEGRATED_UNDERGRAD_GRAD');
        setContinuationType('NONE');
        setModuleOrTrack(isUciteljski ? 'Modul informatika' : '');
        setIsCustomModule(false);
      } else {
        // Secondary school default values
        setName('');
        setDurationYears(4);
        setType('COMMERCIALIST_4Y');
        setContinuationType('NONE');
        setModuleOrTrack('');
        setIsCustomModule(false);
      }
    }
    setIsModalOpen(true);
  };

  const handleFacultyTypeChange = (newType: string) => {
    setType(newType);
    // Suggest appropriate default duration for faculty studies
    if (newType === 'INTEGRATED_UNDERGRAD_GRAD' || newType === 'INTEGRIRANI_SVEUCILISNI') {
      setDurationYears(5);
    } else if (newType === 'UNDERGRADUATE_UNIVERSITY' || newType === 'PRIJEDIPLOMSKI_SVEUCILISNI' || newType === 'PROFESSIONAL_UNDERGRADUATE' || newType === 'STRUCNI_PRIJEDIPLOMSKI') {
      setDurationYears(3);
    } else if (newType === 'GRADUATE_UNIVERSITY' || newType === 'DIPLOMSKI_SVEUCILISNI' || newType === 'PROFESSIONAL_GRADUATE' || newType === 'STRUCNI_DIPLOMSKI') {
      setDurationYears(2);
    } else if (newType === 'DOCTORAL' || newType === 'DOKTORSKI') {
      setDurationYears(3);
    } else if (newType === 'SPECIALIST_GRADUATE_PROFESSIONAL' || newType === 'POSLIJEDIPLOMSKI_SPECIJALISTICKI') {
      setDurationYears(2);
    }
  };

  const handleApplyUciteljskiPreset = (moduleName: string = 'Modul informatika') => {
    setName('Integrirani prijediplomski i diplomski sveučilišni studij - Učiteljski studij');
    setType('INTEGRATED_UNDERGRAD_GRAD');
    setDurationYears(5);
    setContinuationType('NONE');
    setModuleOrTrack(moduleName);
    setIsCustomModule(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schoolId) {
      toast.error('Škola/fakultet nije odabran.');
      return;
    }

    if (!name.trim()) {
      toast.error(isFaculty ? 'Unesite naziv studijskog programa.' : 'Unesite naziv programa.');
      return;
    }

    try {
      setLoading(true);
      const effectiveTrack = moduleOrTrack.trim();

      const payload = {
        name: name.trim(),
        duration_years: durationYears,
        type,
        continuation_type: continuationType,
        module_or_track: effectiveTrack || null,
        school_id: schoolId
      };

      console.log("SAVE PROGRAM PAYLOAD", payload);

      if (editingProgram) {
        let { error } = await supabase
          .from('programs')
          .update(payload)
          .eq('id', editingProgram.id);

        if (error) {
          console.warn("Direct Supabase update failed, attempting service role API fallback:", error);
          const apiRes = await fetch(`/api/programs/${editingProgram.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          const apiData = await apiRes.json();
          if (!apiRes.ok || !apiData.success) {
            throw new Error(apiData.error || error.message);
          }
        }
        toast.success(isFaculty ? 'Studijski program je uspješno ažuriran.' : 'Program je uspješno ažuriran.');
      } else {
        let { error } = await supabase
          .from('programs')
          .insert([payload]);

        if (error) {
          console.warn("Direct Supabase insert failed, attempting service role API fallback:", error);
          const apiRes = await fetch('/api/programs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          const apiData = await apiRes.json();
          if (!apiRes.ok || !apiData.success) {
            throw new Error(apiData.error || error.message);
          }
        }
        toast.success(isFaculty ? 'Studijski program je uspješno dodan.' : 'Program je uspješno dodan.');
      }

      setIsModalOpen(false);
      await fetchSchoolAndPrograms();
    } catch (err: any) {
      toast.error('Pogreška pri spremanju: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteClick = (program: ProgramDB) => {
    console.log("DELETE PROGRAM CLICKED", program);
    console.log("DELETE PROGRAM ID", program?.id);
    setDeleteDialog({
      isOpen: true,
      program,
      loading: false
    });
  };

  const handleConfirmDelete = async () => {
    const program = deleteDialog.program;
    if (!program || !program.id) {
      console.error("No program selected for deletion");
      setDeleteDialog({ isOpen: false, program: null, loading: false });
      return;
    }

    try {
      setDeleteDialog(prev => ({ ...prev, loading: true }));
      console.log("EXECUTING DELETE FOR PROGRAM ID:", program.id);

      // Check existing program first
      const { data: existingProgram, error: checkErr } = await supabase
        .from("programs")
        .select("id, name, school_id, module_or_track")
        .eq("id", program.id)
        .maybeSingle();

      console.log("EXISTING PROGRAM BEFORE DELETE", existingProgram);
      if (checkErr) {
        console.warn("Could not fetch existing program pre-check:", checkErr);
      }

      // Check if student enrollments exist
      const { data: enrollments } = await supabase
        .from('student_class_enrollments')
        .select('id')
        .eq('program_id', program.id)
        .limit(1);

      if (enrollments && enrollments.length > 0) {
        throw new Error('Program se ne može obrisati jer postoje učenici ili upisi povezani s njim.');
      }

      // Check if classes exist
      const { data: linkedClasses } = await supabase
        .from('classes')
        .select('id, name')
        .eq('program_id', program.id)
        .limit(1);

      if (linkedClasses && linkedClasses.length > 0) {
        throw new Error(`Program se ne može obrisati jer je dodijeljen razrednom odjelu/grupi (${linkedClasses[0].name}).`);
      }

      // 1. Try deleting with Supabase Client (RLS)
      const { data: deletedRows, error: sbError } = await supabase
        .from("programs")
        .delete()
        .eq("id", program.id)
        .select();

      console.log("SUPABASE CLIENT DELETE RESULT:", { deletedRows, sbError });

      // 2. If RLS fails or returns nothing, fallback to backend API endpoint
      if (sbError || !deletedRows || deletedRows.length === 0) {
        console.log("Calling API delete fallback for program ID:", program.id);
        const response = await fetch(`/api/programs/${program.id}`, {
          method: 'DELETE'
        });

        const raw = await response.text();
        console.log("DELETE PROGRAM STATUS", response.status);
        console.log("DELETE PROGRAM RAW RESPONSE", raw);

        let result = null;
        if (raw) {
          try {
            result = JSON.parse(raw);
          } catch (jsonErr) {
            console.error("Failed to parse delete JSON response:", jsonErr);
          }
        }

        if (!response.ok) {
          throw new Error(result?.error || raw || "Brisanje programa nije uspjelo.");
        }
      }

      toast.success(isFaculty ? 'Studijski program je uspješno obrisan.' : 'Program je uspješno obrisan.');
      
      // Update local state immediately & refresh from DB
      setPrograms(prev => prev.filter(p => p.id !== program.id));
      setDeleteDialog({ isOpen: false, program: null, loading: false });
      
      await fetchSchoolAndPrograms();
    } catch (err: any) {
      console.error("DELETE PROGRAM ERROR:", err);
      toast.error('Brisanje nije uspjelo: ' + (err.message || 'Nepoznata greška'));
      setDeleteDialog(prev => ({ ...prev, loading: false }));
    }
  };

  const getDisplayProgramType = (typeKey: string) => {
    if (FACULTY_STUDY_TYPE_LABELS[typeKey]) {
      return FACULTY_STUDY_TYPE_LABELS[typeKey];
    }
    if (SECONDARY_PROGRAM_TYPE_LABELS[typeKey]) {
      return SECONDARY_PROGRAM_TYPE_LABELS[typeKey];
    }
    return typeKey;
  };

  return (
    <div className="p-6 font-sans bg-[#f8f9fa] min-h-screen">
      <div className="max-w-7xl mx-auto">
        
        {/* Navigation & Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 border-b border-[#dee2e6] pb-6">
          <div>
            <div 
              id="back-to-admin-btn"
              className="flex items-center gap-2 text-[#005c8d] text-xs font-black uppercase tracking-widest mb-2 cursor-pointer hover:underline" 
              onClick={() => navigate('/admin-skole')}
            >
              <ArrowLeft size={14} /> Natrag u administraciju
            </div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tighter uppercase leading-none mb-2">
              {isFaculty ? 'Studijski programi i smjerovi' : 'Smjerovi i programi'}
            </h1>
            <p className="text-slate-500 font-medium text-sm">
              {isFaculty 
                ? `Upravljanje studijskim programima, vrstama studija, trajanjem i smjerovima/modulima (${school?.name || 'Fakultet'})`
                : 'Upravljanje obrazovnim programima, smjerovima, trajanju stručnih kvalifikacija'
              }
            </p>
          </div>
          
          <div>
            <button 
              id="add-program-btn"
              onClick={() => handleOpenModal()}
              className="bg-[#005c8d] text-white px-5 py-3 rounded-sm font-black uppercase tracking-wider text-[10px] flex items-center gap-2 hover:bg-[#004a71] transition-all cursor-pointer shadow-sm active:scale-95"
            >
              <Plus size={14} strokeWidth={3} />
              {isFaculty ? 'Novi studijski program' : 'Novi smjer / program'}
            </button>
          </div>
        </div>

        {/* Informative advice */}
        <div className="mb-6 bg-slate-100 border border-slate-200 rounded-sm p-4 text-xs text-slate-700 flex gap-3 items-start">
          {isFaculty ? (
            <GraduationCap size={18} className="mt-0.5 shrink-0 text-[#005c8d]" />
          ) : (
            <BookOpen size={16} className="mt-0.5 shrink-0 text-[#005c8d]" />
          )}
          <div>
            <span className="font-bold uppercase tracking-wider block mb-1">
              {isFaculty ? 'Fakultetski studijski programi i moduli' : 'Strukovni i opći programi'}
            </span>
            {isFaculty ? (
              <span>
                Za fakultete definirate vrstu studija (prijediplomski, diplomski, integrirani, doktorski), normativno trajanje (npr. 5 godina za Učiteljski studij) te pripadajuće smjerove i module (npr. Modul informatika, hrvatski jezik, likovna kultura itd.).
              </span>
            ) : (
              <span>
                Definiranjem programa određujete normativno trajanje školovanja (npr. 3 ili 4 godine), pripadajuće tipove razrednih odjela te uvjete vezane uz nastavak obrazovanja i izračune svjedodžbi.
              </span>
            )}
          </div>
        </div>

        {/* Loading / Table / Empty */}
        {loading && programs.length === 0 ? (
          <div className="flex justify-center py-20 text-[#005c8d] animate-pulse">
            <BookOpen size={48} className="animate-bounce" />
          </div>
        ) : !schoolId ? (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 p-6 text-center rounded-sm text-sm font-bold">
            Greška: Nije moguće utvrditi aktivnu ustanovu.
          </div>
        ) : programs.length === 0 ? (
          <div className="bg-white border border-[#dee2e6] rounded-sm p-12 text-center shadow-xs">
            <BookOpen size={40} className="mx-auto text-slate-300 mb-4" />
            <div className="text-sm font-extrabold text-slate-700 uppercase tracking-tight mb-2">
              {isFaculty ? 'Nema definiranih studijskih programa' : 'Nema definiranih smjerova'}
            </div>
            <p className="text-xs text-slate-400 mb-6 max-w-md mx-auto">
              {isFaculty 
                ? 'Kreirajte studijske programe i module (npr. Integrirani prijediplomski i diplomski sveučilišni studij - Učiteljski studij) kako biste ih dodijelili studijskim grupama i studentima.'
                : 'Kreirajte obrazovne smjerove (npr. Komercijalist, Prodavač) kako biste ih mogli dodijeliti razrednim odjelima.'}
            </p>
            <button
              id="empty-add-program-btn"
              onClick={() => handleOpenModal()}
              className="bg-[#005c8d] text-white font-extrabold text-[10px] uppercase px-4 py-2 rounded-sm tracking-wider"
            >
              {isFaculty ? 'Dodaj novi studijski program' : 'Dodaj novi program'}
            </button>
          </div>
        ) : (
          <div className="bg-white border border-[#dee2e6] rounded-sm overflow-hidden shadow-xs">
            <table id="programs-table" className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#f1f3f5] border-b border-[#dee2e6] text-[11px] font-black uppercase tracking-wider text-slate-600">
                  <th className="px-6 py-4">{isFaculty ? 'Studijski program' : 'Naziv smjera / programa'}</th>
                  {isFaculty && <th className="px-6 py-4">Smjer / modul</th>}
                  <th className="px-6 py-4">Trajanje</th>
                  <th className="px-6 py-4">{isFaculty ? 'Vrsta studija' : 'Tip programa'}</th>
                  <th className="px-6 py-4">Nastavak obrazovanja</th>
                  <th className="px-6 py-4 text-right">Akcije</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#dee2e6]">
                {programs.map(prog => {
                  const trackVal = prog.module_or_track;
                  return (
                    <tr key={prog.id} className="hover:bg-[#f8f9fa] transition-colors">
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-sm bg-blue-50 text-[#005c8d] flex items-center justify-center font-bold">
                            {isFaculty ? <GraduationCap size={16} /> : <Award size={16} />}
                          </div>
                          <div>
                            <span className="font-extrabold text-slate-800 text-sm uppercase block">{prog.name}</span>
                            {!isFaculty && trackVal && (
                              <span className="text-[10px] text-slate-500 font-bold">Modul: {trackVal}</span>
                            )}
                          </div>
                        </div>
                      </td>

                      {isFaculty && (
                        <td className="px-6 py-5">
                          {trackVal ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-blue-50 border border-blue-200 text-[#005c8d] font-bold text-xs">
                              <Layers size={12} />
                              {trackVal}
                            </span>
                          ) : (
                            <span className="text-slate-400 text-xs italic font-medium">Opći smjer</span>
                          )}
                        </td>
                      )}

                      <td className="px-6 py-5 text-sm font-extrabold text-slate-700">
                        {prog.duration_years} {prog.duration_years === 1 ? 'godina' : prog.duration_years < 5 ? 'godine' : 'godina'}
                      </td>
                      <td className="px-6 py-5 text-xs text-slate-700 font-bold">
                        <span className="bg-slate-100 text-slate-800 px-2 py-1 rounded border border-slate-200 text-[11px]">
                          {getDisplayProgramType(prog.type)}
                        </span>
                      </td>
                      <td className="px-6 py-5">
                        <span className="text-[10px] font-extrabold text-slate-800 bg-slate-100 px-2 py-1 rounded">
                          {CONTINUATION_TYPE_LABELS[prog.continuation_type] || prog.continuation_type || 'Nema mogućnost direktnog nastavka'}
                        </span>
                      </td>
                      <td className="px-6 py-5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            id={`edit-program-${prog.id}`}
                            onClick={() => handleOpenModal(prog)}
                            className="p-1.5 px-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-sm cursor-pointer transition-colors"
                            title="Uredi"
                          >
                            <Edit2 size={13} />
                          </button>
                          
                          <button
                            id={`delete-program-${prog.id}`}
                            onClick={() => handleDeleteClick(prog)}
                            className="p-1.5 px-2 bg-red-100 hover:bg-red-200 text-red-600 rounded-sm cursor-pointer transition-colors"
                            title="Obriši"
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
          <div className="bg-white w-full max-w-lg rounded-sm shadow-2xl overflow-hidden border border-[#dee2e6] animate-in fade-in duration-150 max-h-[90vh] overflow-y-auto">
            <div className="bg-[#005c8d] p-6 text-white flex items-center justify-between">
              <div>
                <h2 className="text-base font-black uppercase tracking-tight">
                  {editingProgram 
                    ? (isFaculty ? 'Uredi studijski program' : 'Uredi program')
                    : (isFaculty ? 'Novi studijski program / modul' : 'Novi program / smjer')
                  }
                </h2>
                {isFaculty && (
                  <p className="text-white/80 text-[11px] font-semibold mt-0.5">
                    {school?.name || 'Fakultetski studijski program'}
                  </p>
                )}
              </div>
              <button 
                id="close-program-modal-btn"
                onClick={() => setIsModalOpen(false)} 
                className="text-white/80 hover:text-white font-extrabold text-xs uppercase cursor-pointer"
              >
                [ Zatvori ]
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              
              {/* Preset button for Faculty / Učiteljski */}
              {isFaculty && !editingProgram && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-sm flex items-center justify-between gap-2">
                  <div className="text-[11px] text-[#005c8d] font-bold">
                    <span className="flex items-center gap-1">
                      <Sparkles size={13} className="text-amber-500" />
                      Brzi predložak: Učiteljski studij (5G)
                    </span>
                  </div>
                  <button
                    type="button"
                    id="apply-uciteljski-preset-btn"
                    onClick={() => handleApplyUciteljskiPreset()}
                    className="text-[10px] font-black uppercase tracking-wider bg-[#005c8d] text-white px-2.5 py-1.5 rounded-sm hover:bg-[#004a71] transition-colors cursor-pointer"
                  >
                    Učitaj predložak
                  </button>
                </div>
              )}

              {/* Program / Study Name */}
              <div>
                <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-1">
                  {isFaculty ? 'Studijski program (Naziv programa)' : 'Naziv programa'}
                </label>
                <input 
                  id="program-name-input"
                  type="text" 
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full bg-[#f8f9fa] border border-[#dee2e6] rounded-sm p-3 font-bold text-slate-900 text-xs focus:border-[#005c8d] focus:bg-white outline-none transition-all"
                  placeholder={isFaculty 
                    ? 'npr. Integrirani prijediplomski i diplomski sveučilišni studij - Učiteljski studij' 
                    : 'npr. Komercijalist ili Tehničar za računalstvo'
                  }
                  required
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Duration */}
                <div>
                  <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-1">
                    Trajanje
                  </label>
                  <select 
                    id="program-duration-select"
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
                    <option value={6}>6 godina</option>
                  </select>
                </div>

                {/* Program Type / Study Type */}
                <div>
                  <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-1">
                    {isFaculty ? 'Vrsta studija' : 'Tip programa'}
                  </label>
                  
                  {isFaculty ? (
                    <select 
                      id="program-type-select"
                      value={type}
                      onChange={e => handleFacultyTypeChange(e.target.value)}
                      className="w-full bg-[#f8f9fa] border border-[#dee2e6] rounded-sm p-3 font-bold text-slate-900 text-xs focus:border-[#005c8d] outline-none"
                      required
                    >
                      <option value="INTEGRATED_UNDERGRAD_GRAD">Integrirani prijediplomski i diplomski sveučilišni studij</option>
                      <option value="UNDERGRADUATE_UNIVERSITY">Prijediplomski sveučilišni studij</option>
                      <option value="GRADUATE_UNIVERSITY">Diplomski sveučilišni studij</option>
                      <option value="PROFESSIONAL_UNDERGRADUATE">Stručni prijediplomski studij</option>
                      <option value="PROFESSIONAL_GRADUATE">Stručni diplomski studij</option>
                      <option value="SPECIALIST_GRADUATE_PROFESSIONAL">Specijalistički diplomski stručni studij</option>
                      <option value="POSTGRADUATE_SPECIALIST">Poslijediplomski specijalistički studij</option>
                      <option value="DOCTORAL">Doktorski studij</option>
                    </select>
                  ) : (
                    <select 
                      id="program-type-select"
                      value={type}
                      onChange={e => setType(e.target.value)}
                      className="w-full bg-[#f8f9fa] border border-[#dee2e6] rounded-sm p-3 font-bold text-slate-900 text-xs focus:border-[#005c8d] outline-none"
                      required
                    >
                      <option value="COMMERCIALIST_4Y">Uobičajeni stručni 4G</option>
                      <option value="VOCATIONAL_3Y">Strukovni 3G</option>
                      <option value="GYMNASIUM_4Y">Gimnazijski</option>
                      <option value="CONTINUATION_FREE">Nastavak obrazovanja (Sufinanciran)</option>
                      <option value="CONTINUATION_PAID">Nastavak obrazovanja (Uz plaćanje)</option>
                    </select>
                  )}
                </div>
              </div>

              {/* Faculty specific: Smjer / modul */}
              {isFaculty && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">
                      Smjer / modul
                    </label>
                    <button
                      type="button"
                      onClick={() => setIsCustomModule(!isCustomModule)}
                      className="text-[10px] font-bold text-[#005c8d] hover:underline"
                    >
                      {isCustomModule ? 'Odaberi iz liste modula' : 'Prilagođeni unos smjera'}
                    </button>
                  </div>

                  {!isCustomModule ? (
                    <select
                      id="faculty-module-select"
                      value={moduleOrTrack}
                      onChange={e => {
                        if (e.target.value === '__CUSTOM__') {
                          setIsCustomModule(true);
                          setModuleOrTrack('');
                        } else {
                          setModuleOrTrack(e.target.value);
                        }
                      }}
                      className="w-full bg-[#f8f9fa] border border-[#dee2e6] rounded-sm p-3 font-bold text-slate-900 text-xs focus:border-[#005c8d] outline-none"
                    >
                      <option value="">[ Bez posebnog modula / Opći smjer ]</option>
                      {UCITELJSKI_FACULTY_MODULES.map(mod => (
                        <option key={mod} value={mod}>{mod}</option>
                      ))}
                      <option value="__CUSTOM__">➕ Drugi smjer / modul (ručni unos)...</option>
                    </select>
                  ) : (
                    <input
                      id="faculty-module-custom-input"
                      type="text"
                      value={moduleOrTrack}
                      onChange={e => setModuleOrTrack(e.target.value)}
                      placeholder="npr. Modul informatika ili Smjer engleski jezik"
                      className="w-full bg-[#f8f9fa] border border-[#dee2e6] rounded-sm p-3 font-bold text-slate-900 text-xs focus:border-[#005c8d] focus:bg-white outline-none"
                    />
                  )}
                  <p className="text-[10px] text-slate-400 mt-1">
                    Odaberite modul za Učiteljski studij (npr. Modul informatika, hrvatski jezik, likovna kultura) ili unesite prilagođeni smjer.
                  </p>
                </div>
              )}

              {/* Continuation conditions */}
              <div>
                <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-1">
                  Uvjet za nastavak obrazovanja
                </label>
                <select 
                  id="program-continuation-select"
                  value={continuationType}
                  onChange={e => setContinuationType(e.target.value)}
                  className="w-full bg-[#f8f9fa] border border-[#dee2e6] rounded-sm p-3 font-bold text-slate-900 text-xs focus:border-[#005c8d] outline-none"
                  required
                >
                  <option value="NONE">Nema mogućnost direktnog nastavka</option>
                  <option value="FREE">Pokriven nastavak (Redoviti studenti / Sufinancirano)</option>
                  <option value="PAID">Izvanredan nastavak (Uz troškove školarine / Uz plaćanje)</option>
                </select>
              </div>

              <div className="flex gap-3 pt-4 border-t border-[#dee2e6]">
                <button 
                  type="button"
                  id="cancel-program-btn"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 bg-slate-100 text-slate-700 py-3 rounded-sm font-black uppercase tracking-wider text-[10px] hover:bg-slate-200 transition-colors cursor-pointer text-center"
                >
                  Odustani
                </button>
                <button 
                  type="submit"
                  id="save-program-btn"
                  className="flex-1 bg-[#005c8d] text-white py-3 rounded-sm font-black uppercase tracking-wider text-[10px] hover:bg-[#004a71] transition-all cursor-pointer text-center shadow-md"
                >
                  {isFaculty ? 'Spremi studijski program' : 'Spremi smjer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Custom React Delete Program Confirmation Modal */}
      {deleteDialog.isOpen && deleteDialog.program && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-sm shadow-2xl overflow-hidden border border-[#dee2e6] animate-in fade-in duration-150">
            <div className="bg-red-700 p-5 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Trash2 size={18} />
                <h2 className="text-sm font-black uppercase tracking-tight">
                  {isFaculty ? 'Brisanje studijskog programa' : 'Brisanje programa / smjera'}
                </h2>
              </div>
              <button 
                id="close-delete-modal-btn"
                disabled={deleteDialog.loading}
                onClick={() => setDeleteDialog({ isOpen: false, program: null, loading: false })} 
                className="text-white/80 hover:text-white font-extrabold text-xs uppercase cursor-pointer"
              >
                [ Zatvori ]
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <p className="text-xs text-slate-700 font-medium leading-relaxed">
                Jeste li sigurni da želite obrisati {isFaculty ? 'studijski program' : 'program'}{' '}
                <strong className="text-slate-900 font-bold uppercase underline">
                  "{deleteDialog.program.name}"
                </strong>
                {deleteDialog.program.module_or_track ? ` (${deleteDialog.program.module_or_track})` : ''}?
              </p>

              <div className="bg-amber-50 border border-amber-200 text-amber-900 text-[11px] p-3 rounded-sm">
                <strong>Upozorenje:</strong> Ova radnja trajno uklanja program iz baze podataka. Program se ne može obrisati ako postoje povezani učenici ili aktivni razredni odjeli.
              </div>

              <div className="flex gap-3 pt-3 border-t border-[#dee2e6]">
                <button 
                  type="button"
                  id="cancel-delete-program-btn"
                  disabled={deleteDialog.loading}
                  onClick={() => setDeleteDialog({ isOpen: false, program: null, loading: false })}
                  className="flex-1 bg-slate-100 text-slate-700 py-2.5 rounded-sm font-black uppercase tracking-wider text-[10px] hover:bg-slate-200 transition-colors cursor-pointer text-center"
                >
                  Odustani
                </button>
                <button 
                  type="button"
                  id="confirm-delete-program-btn"
                  disabled={deleteDialog.loading}
                  onClick={handleConfirmDelete}
                  className="flex-1 bg-red-600 text-white py-2.5 rounded-sm font-black uppercase tracking-wider text-[10px] hover:bg-red-700 transition-all cursor-pointer text-center shadow-md flex items-center justify-center gap-2"
                >
                  {deleteDialog.loading ? 'Brisanje...' : 'Potvrdi i obriši'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
