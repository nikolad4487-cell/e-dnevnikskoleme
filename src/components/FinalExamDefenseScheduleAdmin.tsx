import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { toast } from 'react-hot-toast';
import { 
  Building, Calendar, Clock, MapPin, Users, Plus, 
  Trash2, Edit, Save, X, ShieldAlert, CheckCircle, HelpCircle
} from 'lucide-react';

interface CommissionMember {
  id: string;
  schedule_id: string;
  teacher_profile_id: string;
  is_homeroom_teacher: boolean;
}

interface DefenseSchedule {
  id: string;
  school_id: string;
  school_year: string;
  class_id: string;
  defense_time: string;
  classroom: string;
  members: CommissionMember[];
  created_at: string;
}

export function FinalExamDefenseScheduleAdmin() {
  const { user } = useAuth();
  
  // Data states
  const [schedules, setSchedules] = useState<DefenseSchedule[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [schoolYears, setSchoolYears] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Form states
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const [formSchoolYear, setFormSchoolYear] = useState('');
  const [formClassId, setFormClassId] = useState('');
  const [formDefenseTime, setFormDefenseTime] = useState('13:00');
  const [formClassroom, setFormClassroom] = useState('');
  const [formTeacherIds, setFormTeacherIds] = useState<string[]>([]); // holds selected commission teacher IDs
  
  // Track resolved class info for form validations
  const [selectedClassObj, setSelectedClassObj] = useState<any | null>(null);
  const [homeroomTeacherObj, setHomeroomTeacherObj] = useState<any | null>(null);

  // Load baseline details
  const loadData = async () => {
    setLoading(true);
    try {
      // 1. Fetch schedules
      const sRes = await fetch('/api/final-exam-defense-schedules');
      let scheduleData: DefenseSchedule[] = [];
      if (sRes.ok) {
        scheduleData = await sRes.json();
      }

      // 2. Fetch classes with their programs & teachers
      const { data: cData } = await supabase
        .from('classes')
        .select('*, program:program_id(*), homeroom:homeroom_teacher_id(*)');

      // 3. Fetch all teacher profiles
      const { data: tData } = await supabase
        .from('user_profiles')
        .select('*')
        .in('role', ['TEACHER', 'HOMEROOM', 'ADMIN', 'SCHOOL_ADMIN']);

      // 4. Fetch school years
      const { data: syData } = await supabase
        .from('school_years')
        .select('*');

      setSchedules(scheduleData || []);
      setClasses(cData || []);
      setTeachers(tData || []);
      setSchoolYears(syData || []);

      // Defaults for form
      if (syData && syData.length > 0) {
        const activeYear = syData.find(y => y.isActive) || syData[0];
        setFormSchoolYear(activeYear.name);
      } else {
        setFormSchoolYear('2025/2026');
      }

    } catch (err) {
      console.error('Error loading admin defense data:', err);
      toast.error('Učitavanje podataka nije uspjelo.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Update homeroom teacher automatically when class selection changes in the form
  useEffect(() => {
    if (!formClassId) {
      setSelectedClassObj(null);
      setHomeroomTeacherObj(null);
      return;
    }

    const matchedClass = classes.find(c => c.id === formClassId);
    setSelectedClassObj(matchedClass || null);

    if (matchedClass) {
      const hTeacherId = matchedClass.homeroom_teacher_id;
      const tObj = teachers.find(t => t.id === hTeacherId);
      setHomeroomTeacherObj(tObj || null);

      // Automatically add homeroom teacher to formTeacherIds and lock them in
      if (hTeacherId) {
        setFormTeacherIds(prev => {
          if (!prev.includes(hTeacherId)) {
            return [...prev, hTeacherId];
          }
          return prev;
        });
      }
    } else {
      setHomeroomTeacherObj(null);
    }
  }, [formClassId, classes, teachers]);

  // Handle checking/unchecking members in multi-select checkboxes
  const handleTeacherCheckboxChange = (teacherId: string, checked: boolean) => {
    // If it is the homeroom teacher, they CANNOT be unchecked
    if (selectedClassObj && teacherId === selectedClassObj.homeroom_teacher_id) {
      return; // Locked (read-only)
    }

    if (checked) {
      setFormTeacherIds(prev => [...prev, teacherId]);
    } else {
      setFormTeacherIds(prev => prev.filter(tid => tid !== teacherId));
    }
  };

  const handleOpenNewForm = () => {
    setEditingId(null);
    setFormClassId('');
    setFormDefenseTime('13:00');
    setFormClassroom('');
    setFormTeacherIds([]);
    
    // Choose active school year by default
    const activeYear = schoolYears.find(y => y.isActive);
    if (activeYear) {
      setFormSchoolYear(activeYear.name);
    }

    setIsFormOpen(true);
  };

  const handleOpenEditForm = (schedule: DefenseSchedule) => {
    setEditingId(schedule.id);
    setFormSchoolYear(schedule.school_year);
    setFormClassId(schedule.class_id);
    setFormDefenseTime(schedule.defense_time);
    setFormClassroom(schedule.classroom);

    // Load active members profiles
    const memberIds = (schedule.members || []).map(m => m.teacher_profile_id);
    setFormTeacherIds(memberIds);

    setIsFormOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formSchoolYear) {
      toast.error('Molimo odaberite školsku godinu.');
      return;
    }
    if (!formClassId) {
      toast.error('Molimo odaberite razred.');
      return;
    }

    // Rule 3: If no homeroom teacher, block saving
    const matchedClass = classes.find(c => c.id === formClassId);
    if (!matchedClass || !matchedClass.homeroom_teacher_id) {
      toast.error('Razred nema dodijeljenog razrednika. Prvo dodijelite razrednika u razredom odjelu.');
      return;
    }

    const homeroomTeacherId = matchedClass.homeroom_teacher_id;

    // Rule: homeroom teacher must be a member of the commission
    if (!formTeacherIds.includes(homeroomTeacherId)) {
      toast.error('Razrednik mora biti član komisije.');
      return;
    }

    // Rule: commission must have at least 3, at most 5 members
    const uniqueTeacherIds = Array.from(new Set(formTeacherIds));
    if (uniqueTeacherIds.length < 3 || uniqueTeacherIds.length > 5) {
      toast.error(`Komisija mora imati između 3 i 5 članova. Trenutno odabrano: ${uniqueTeacherIds.length}`);
      return;
    }

    if (!formClassroom.trim()) {
      toast.error('Učionica ne smije biti prazna.');
      return;
    }
    if (!formDefenseTime.trim()) {
      toast.error('Vrijeme obrane mora biti uneseno.');
      return;
    }

    // Filter duplicates
    const teacherIdsPayload = uniqueTeacherIds;

    const payload = {
      school_id: matchedClass.school_id || matchedClass.schoolId,
      school_year: formSchoolYear,
      class_id: formClassId,
      defense_time: formDefenseTime,
      classroom: formClassroom,
      teacher_ids: teacherIdsPayload,
      homeroom_teacher_id: homeroomTeacherId
    };

    try {
      let response;
      if (editingId) {
        // Edit Schedule
        response = await fetch(`/api/final-exam-defense-schedules/${editingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } else {
        // Create Schedule
        response = await fetch('/api/final-exam-defense-schedules', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }

      if (response.ok) {
        toast.success(editingId ? 'Raspored uspješno ažuriran!' : 'Raspored uspješno kreiran!');
        setIsFormOpen(false);
        loadData();
      } else {
        const errData = await response.json();
        toast.error(errData.error || 'Došlo je do pogreške pri spremanju.');
      }
    } catch (err) {
      console.error(err);
      toast.error('Fatalna greška kod spremanja rasporeda.');
    }
  };

  const handleDelete = async (scheduleId: string, classNameStr?: string) => {
    const confirmMsg = classNameStr 
      ? `Jeste li sigurni da želite obrisati raspored obrane za razred ${classNameStr}?` 
      : 'Jeste li sigurni da želite obrisati ovaj raspored obrane?';

    if (!window.confirm(confirmMsg)) {
      return;
    }

    console.log("DELETE DEFENSE SCHEDULE CLICKED", scheduleId);

    try {
      const response = await fetch(`/api/final-exam-defense-schedules/${scheduleId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        toast.success('Raspored obrane je obrisan.');
        setSchedules(prev => prev.filter(s => s.id !== scheduleId));
      } else {
        const errData = await response.json();
        console.error("DELETE DEFENSE SCHEDULE ERROR", errData);
        toast.error(`Greška: ${errData.error || errData.details || 'Brisanje nije uspjelo.'}`);
      }
    } catch (err: any) {
      console.error("DELETE DEFENSE SCHEDULE ERROR", err);
      toast.error(`Sustavna pogreška prilikom brisanja: ${err.message}`);
    }
  };

  // Check if a class is eligible under završni classes rules just to add a helper badge
  const isClassEligible = (c: any) => {
    const is3rdYearCatering = c.grade_level === 3 && (
      c.name.includes('3.A') || c.name.includes('3.B') || c.name.includes('3.C') ||
      c.program?.name?.toLowerCase().includes('kuhar') || 
      c.program?.name?.toLowerCase().includes('konobar') || 
      c.program?.name?.toLowerCase().includes('slastičar')
    );
    const is4thYearCatering = c.grade_level === 4 && (
      c.program?.name?.toLowerCase().includes('ugostiteljstvo') || 
      c.program?.name?.toLowerCase().includes('turističko') ||
      c.program?.name?.toLowerCase().includes('hotelijer')
    );
    return is3rdYearCatering || is4thYearCatering;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  return (
    <div className="bg-slate-50 min-h-screen p-6 font-sans space-y-6">
      
      {/* Upper header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between border-b pb-4 gap-4">
        <div>
          <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight">
            Raspored obrana završnih radova (Administracija)
          </h2>
          <p className="text-xs text-slate-500 font-bold uppercase mt-1">
            Uredite komisije, vrijeme i učionice obrane po završnim razrednim odjelima
          </p>
        </div>
        
        {!isFormOpen && (
          <button
            onClick={handleOpenNewForm}
            className="inline-flex items-center gap-2 bg-[#005c8d] text-white px-4 py-2 rounded font-black text-xs uppercase tracking-wider shadow hover:bg-[#004b73] transition"
          >
            <Plus size={14} />
            Dodaj novi raspored
          </button>
        )}
      </div>

      {/* Editor Panel Form */}
      {isFormOpen && (
        <form onSubmit={handleSave} className="bg-white rounded-lg border-2 border-[#005c8d]/30 shadow-md p-6 space-y-6 animate-in slide-in-from-top-4 duration-300">
          <div className="flex justify-between items-center border-b pb-3">
            <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">
              {editingId ? '📝 Uredi raspored obrane' : '✨ Dodaj novi raspored obrane'}
            </h3>
            <button
              type="button"
              onClick={() => setIsFormOpen(false)}
              className="p-1 text-slate-400 hover:text-slate-600"
            >
              <X size={18} />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* Column 1: Metadata Fields */}
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-1">
                  Školska godina <span className="text-red-500">*</span>
                </label>
                <select
                  value={formSchoolYear}
                  onChange={(e) => setFormSchoolYear(e.target.value)}
                  className="w-full text-xs font-semibold p-2.5 border rounded focus:ring-1 focus:ring-emerald-500 outline-none"
                  disabled={!!editingId}
                >
                  {schoolYears.map(sy => (
                    <option key={sy.id} value={sy.name}>{sy.name} {sy.isActive ? '(Aktivna)' : ''}</option>
                  ))}
                  {schoolYears.length === 0 && (
                    <option value="2025/2026">2025/2026</option>
                  )}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-1">
                  Završni Razred <span className="text-red-500">*</span>
                </label>
                <select
                  value={formClassId}
                  onChange={(e) => setFormClassId(e.target.value)}
                  className="w-full text-xs font-semibold p-2.5 border rounded focus:ring-1 focus:ring-emerald-500 outline-none"
                  required
                  disabled={!!editingId}
                >
                  <option value="">-- Odaberite završni razred --</option>
                  {classes.map(c => {
                    const eligible = isClassEligible(c);
                    return (
                      <option key={c.id} value={c.id}>
                        {c.name} {c.program ? `(${c.program.name})` : ''} {eligible ? '✓' : ''}
                      </option>
                    );
                  })}
                </select>
                <p className="text-[9px] text-slate-400 font-bold uppercase mt-1">
                  ✓ označava razred koji pripada kuharskim, ugostiteljskim ili turističkim završnim programima.
                </p>
              </div>

              {/* Automatic Homeroom Informer */}
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-2">
                <span className="text-[10px] font-black text-slate-400 uppercase block tracking-wider">RAZREDNIK</span>
                {formClassId ? (
                  homeroomTeacherObj ? (
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                      <CheckCircle size={15} className="text-emerald-600" />
                      <span>{homeroomTeacherObj.name} {homeroomTeacherObj.surname || ''}</span>
                    </div>
                  ) : (
                    <div className="bg-red-50 border border-red-200 text-red-900 rounded p-2 text-[11px] leading-normal font-semibold">
                      <ShieldAlert size={14} className="text-red-600 inline mr-1" />
                      Razred nema dodijeljenog razrednika. Prvo dodijelite razrednika u razrednom odjelu.
                    </div>
                  )
                ) : (
                  <span className="text-slate-400 text-[11px] italic">Odaberite razred za prikaz razrednika...</span>
                )}
              </div>

              {/* Classroom & Time */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase block mb-1">vrijeme <span className="text-red-500">*</span></label>
                  <input
                    type="time"
                    value={formDefenseTime}
                    onChange={(e) => setFormDefenseTime(e.target.value)}
                    className="w-full text-xs font-bold p-2.5 border rounded outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase block mb-1">učionica <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={formClassroom}
                    onChange={(e) => setFormClassroom(e.target.value)}
                    placeholder="npr. 006"
                    className="w-full text-xs font-bold p-2.5 border rounded outline-none"
                    required
                  />
                </div>
              </div>

            </div>

            {/* Column 2 & 3: Commission Checkboxes Multi-select */}
            <div className="md:col-span-2 space-y-3">
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">
                  Članovi Komisije (Odaberite Između 3 i 5 Članova) <span className="text-red-500">*</span>
                </label>
                <span className="text-[10px] text-slate-400 font-bold block mb-2 leading-relaxed">
                  Razrednik je automatski dodan i zaključan u komisiji. Dodajte barem još 2 nastavnika, a najviše još 4 (maksimalno 5 članova ukupno).
                </span>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 max-h-[280px] overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-2">
                {teachers.map(teacher => {
                  const isHomeroom = selectedClassObj && (teacher.id === selectedClassObj.homeroom_teacher_id);
                  const isChecked = formTeacherIds.includes(teacher.id) || isHomeroom;

                  return (
                    <label 
                      key={teacher.id} 
                      className={`flex items-center gap-2 p-2.5 rounded border text-xs font-semibold cursor-pointer select-none transition ${
                        isHomeroom 
                          ? 'bg-[#005c8d]/5 border-[#005c8d]/20 text-[#005c8d]' 
                          : isChecked 
                            ? 'bg-emerald-50/50 border-emerald-300 text-emerald-900' 
                            : 'bg-white border-slate-200 hover:bg-slate-100 text-slate-700'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => handleTeacherCheckboxChange(teacher.id, e.target.checked)}
                        disabled={isHomeroom}
                        className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 h-4 w-4"
                      />
                      <div className="truncate">
                        <span className="font-bold">{teacher.name} {teacher.surname || ''}</span>
                        {isHomeroom && <span className="text-[9px] font-black uppercase text-[#005c8d] bg-[#005c8d]/10 px-1 py-0.5 rounded ml-1.5 inline-block">razrednik</span>}
                      </div>
                    </label>
                  );
                })}
              </div>

              <div className="text-[11px] text-[#005c8d] bg-[#005c8d]/5 border border-[#005c8d]/10 p-3 rounded-lg flex items-center gap-2">
                <HelpCircle size={15} className="flex-shrink-0" />
                <span>
                  Trenutni broj odabranih članova: <strong className="font-black text-slate-800">{formTeacherIds.length}</strong> (isključivi nastavnici, bez duplikata).
                </span>
              </div>
            </div>

          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <button
              type="button"
              onClick={() => setIsFormOpen(false)}
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs uppercase px-4 py-2.5 rounded tracking-wider"
            >
              Odustani
            </button>
            <button
              type="submit"
              disabled={formClassId && selectedClassObj && !selectedClassObj.homeroom_teacher_id}
              className={`inline-flex items-center gap-1.5 text-white font-black text-xs uppercase px-5 py-2.5 rounded tracking-widest shadow transition ${
                formClassId && selectedClassObj && !selectedClassObj.homeroom_teacher_id
                  ? 'bg-gray-300 cursor-not-allowed text-gray-500 shadow-none'
                  : 'bg-emerald-600 hover:bg-emerald-700'
              }`}
            >
              <Save size={14} />
              Spremi raspored
            </button>
          </div>
        </form>
      )}

      {/* Schedule Table Management */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
        <div className="bg-slate-100/60 px-5 py-3 border-b border-slate-200">
          <h3 className="text-xs font-black text-slate-700 uppercase tracking-wider">
            Uneseni rasporedi obrana završnih radova (Ukupno: {schedules.length})
          </h3>
        </div>

        {schedules.length === 0 ? (
          <div className="p-8 text-center text-slate-400 italic text-xs leading-relaxed">
            Niti jedan raspored obrane završnog rada još nije unesen u sustav. Kliknite "Dodaj novi raspored" kako biste počeli.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 font-bold text-slate-500 uppercase tracking-wider text-[10px]">
                  <th className="p-4Column">Šk. Godina</th>
                  <th className="p-4">Razred</th>
                  <th className="p-4">Razrednik</th>
                  <th className="p-4">Vrijeme i učionica</th>
                  <th className="p-4">Članovi komisije</th>
                  <th className="p-4 text-right">Akcije</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {schedules.map((schedule) => {
                  const classObj = classes.find(c => c.id === schedule.class_id);
                  const className = classObj?.name || 'Nepoznat razred';
                  
                  // Homeroom
                  const homeroomTeacherId = classObj?.homeroom_teacher_id;
                  const homeroomTeacher = teachers.find(t => t.id === homeroomTeacherId);
                  const homeroomName = homeroomTeacher ? `${homeroomTeacher.name} ${homeroomTeacher.surname || ''}` : 'Nije dodijeljen';

                  // Commission teachers names
                  const memberNames = (schedule.members || []).map(member => {
                    const teacherObj = teachers.find(t => t.id === member.teacher_profile_id);
                    if (!teacherObj) return '—';
                    const labelSuffix = member.teacher_profile_id === homeroomTeacherId ? ' (razrednik)' : '';
                    return `${teacherObj.name} ${teacherObj.surname || ''}${labelSuffix}`;
                  });

                  return (
                    <tr key={schedule.id} className="hover:bg-slate-50/50 transition">
                      <td className="p-4 font-semibold text-slate-600">
                        {schedule.school_year}
                      </td>
                      <td className="p-4 font-black text-[#005c8d]">
                        {className}
                      </td>
                      <td className="p-4 font-bold text-slate-800">
                        {homeroomName}
                      </td>
                      <td className="p-4 space-y-1">
                        <div className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 px-2 py-0.5 rounded font-bold">
                          <Clock size={12} />
                          {schedule.defense_time}h
                        </div>
                        <div className="block text-[10px] text-slate-500 font-semibold">
                          Učionica <strong className="text-slate-700">{schedule.classroom}</strong>
                        </div>
                      </td>
                      <td className="p-4">
                        {memberNames.length > 0 ? (
                          <div className="flex flex-wrap gap-1 max-w-sm">
                            {memberNames.map((name, idx) => (
                              <span 
                                key={idx} 
                                className={`text-[9px] px-2 py-0.5 rounded font-bold ${
                                  name.includes('(razrednik)') 
                                    ? 'bg-[#005c8d]/10 text-[#005c8d]' 
                                    : 'bg-slate-100 text-slate-700'
                                }`}
                              >
                                {name}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">Prazno</span>
                        )}
                      </td>
                      <td className="p-4 text-right">
                        <div className="inline-flex gap-2">
                          <button
                            type="button"
                            onClick={() => handleOpenEditForm(schedule)}
                            className="bg-slate-100 hover:bg-[#005c8d]/10 text-slate-600 hover:text-[#005c8d] p-2 rounded transition"
                            title="Uredi raspored"
                          >
                            <Edit size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(schedule.id, className)}
                            className="bg-slate-100 hover:bg-red-50 text-slate-600 hover:text-red-600 p-2 rounded transition"
                            title="Obriši raspored"
                          >
                            <Trash2 size={14} />
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

    </div>
  );
}
