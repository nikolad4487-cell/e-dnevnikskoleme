import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useSelection } from '../../contexts/SelectionContext';
import { User, ClipboardList, Shield, Save, Edit, X, Phone, Mail, MapPin, Notebook, UserPlus } from 'lucide-react';
import toast from 'react-hot-toast';
import { cn, getSurname, sortStudentsBySurname } from '../../lib/utils';

const PROGRAM_ADJUSTMENTS = [
  { value: 'NONE', label: '—' },
  { value: 'REGULAR_WITH_ADAPTATION', label: 'Redovni program uz prilagodbu' },
  { value: 'REGULAR_WITH_INDIVIDUALIZATION', label: 'Redovni program uz individualizaciju' }
];

export default function OsobniPodaciPage() {
  const { user: currentUser } = useAuth();
  const { selectedClassId, selectedChildId } = useSelection();

  // Selected student resolution
  const targetStudentId = selectedChildId || currentUser?.id;

  // State
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [canEdit, setCanEdit] = useState(false);

  // Data State
  const [studentProfile, setStudentProfile] = useState<any>(null);
  const [classInfo, setClassInfo] = useState<any>(null);
  const [programInfo, setProgramInfo] = useState<any>(null);
  const [redniBroj, setRedniBroj] = useState<number | string>('—');
  const [parentContact, setParentContact] = useState<any>(null);

  // Form Edit State
  const [editForm, setEditForm] = useState({
    address: '',
    birthplace: '',
    mobile: '',
    studentRegistryNumber: '',
    programAdjustment: 'NONE',
  });

  const [editParentForm, setEditParentForm] = useState({
    parent_name: '',
    parent_phone: '',
    parent_email: '',
    notes: '',
  });

  // Read student and class information
  const loadData = async () => {
    if (!targetStudentId) return;
    setLoading(true);

    let profile = null;
    let profileError = null;
    let enrollment = null;
    let enrollmentError = null;
    let guardians = null;
    let guardiansError = null;

    // 1. Fetch Student Profile
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', targetStudentId)
        .maybeSingle();
      
      profile = data;
      profileError = error;
    } catch (err: any) {
      profileError = err;
    }

    if (profile) {
      setStudentProfile(profile);

      // Populate edit fields
      setEditForm({
        address: profile.address || '',
        birthplace: profile.birthplace || profile.pob || '',
        mobile: profile.mobile || '',
        studentRegistryNumber: profile.student_registry_number || '',
        programAdjustment: profile.program_adjustment || 'NONE',
      });
    } else if (profileError) {
      console.error("error loading user profile", profileError);
    }

    // 2. Fetch Enrollment
    try {
      const { data, error } = await supabase
        .from('student_class_enrollments')
        .select(`
          *,
          classes:class_id (*),
          programs:program_id (*)
        `)
        .eq('student_id', targetStudentId)
        .eq('status', 'ACTIVE')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      enrollment = data;
      enrollmentError = error;
    } catch (err: any) {
      enrollmentError = err;
    }

    let cls = null;
    let prg = null;

    if (enrollment) {
      cls = enrollment.classes;
      prg = enrollment.programs;
      setClassInfo(cls);
      setProgramInfo(prg);

      // Fetch ordinal position sorted alphabetically in real-time
      try {
        const { data: classEnrollments } = await supabase
          .from('student_class_enrollments')
          .select('student:user_profiles(id, name)')
          .eq('class_id', cls.id)
          .eq('status', 'ACTIVE');

        if (classEnrollments) {
          const rawList = classEnrollments
            .map((e: any) => e.student)
            .filter(Boolean);
          const studentsList = sortStudentsBySurname(rawList);

          const index = studentsList.findIndex((s: any) => s.id === targetStudentId);
          if (index !== -1) {
            setRedniBroj(index + 1);
          } else {
            setRedniBroj('—');
          }
        }
      } catch (err) {
        console.error("Error setting redni broj:", err);
      }
    } else {
      setClassInfo(null);
      setProgramInfo(null);
      setRedniBroj('—');
    }

    // Determine editing permissions (Admin, main admin, or homeroom/deputy of the class)
    const isUserAdmin = currentUser?.role === 'ADMIN' || currentUser?.role === 'MAIN_ADMIN';
    const isUserHomeroom = cls && (cls.homeroom_teacher_id === currentUser?.id || cls.deputy_teacher_id === currentUser?.id);
    setCanEdit(isUserAdmin || isUserHomeroom);

    // 3. Fetch Guardians/Parent Contacts with fallbacks
    try {
      const { data, error } = await supabase
        .from('student_parent_contacts')
        .select('*')
        .eq('student_id', targetStudentId)
        .maybeSingle();

      guardians = data;
      guardiansError = error;
    } catch (err: any) {
      guardiansError = err;
    }

    // Fallback to student_guardians if student_parent_contacts fails or has no record
    if (guardiansError || !guardians) {
      try {
        const { data: fallbackGuardians, error: fbError } = await supabase
          .from('student_guardians')
          .select('*')
          .eq('student_id', targetStudentId)
          .maybeSingle();
        
        if (fallbackGuardians) {
          guardians = {
            parent_name: fallbackGuardians.parent_name || fallbackGuardians.name || '',
            parent_phone: fallbackGuardians.parent_phone || fallbackGuardians.phone || '',
            parent_email: fallbackGuardians.parent_email || fallbackGuardians.email || '',
            notes: fallbackGuardians.notes || fallbackGuardians.relationship || '',
          };
        }
      } catch (fbErr) {
        console.warn("Fallback to student_guardians also failed:", fbErr);
      }
    }

    setParentContact(guardians);

    if (guardians) {
      setEditParentForm({
        parent_name: guardians.parent_name || '',
        parent_phone: guardians.parent_phone || '',
        parent_email: guardians.parent_email || '',
        notes: guardians.notes || '',
      });
    } else {
      setEditParentForm({
        parent_name: '',
        parent_phone: '',
        parent_email: '',
        notes: '',
      });
    }

    // Setup debug variables as requested
    const selectedClass = cls;
    const selectedSchoolYear = enrollment?.school_year || enrollment?.school_year_id || null;

    // Direct requested log calls
    console.log("PERSONAL DATA currentUser", currentUser);
    console.log("PERSONAL DATA selectedClass", selectedClass);
    console.log("PERSONAL DATA selectedSchoolYear", selectedSchoolYear);
    console.log("PERSONAL DATA profile", profile, profileError);
    console.log("PERSONAL DATA enrollment", enrollment, enrollmentError);
    console.log("PERSONAL DATA guardians", guardians, guardiansError);

    // End loading regardless of side-errors
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, [targetStudentId, selectedClassId]);

  // Handle Form Save
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) {
      toast.error("Nemate pravo na uređivanje ovih podataka.");
      return;
    }

    const saveToast = toast.loading("Spremanje podataka...");
    try {
      // 1. Update user_profile
      const { error: profileError } = await supabase
        .from('user_profiles')
        .update({
          address: editForm.address,
          birthplace: editForm.birthplace,
          mobile: editForm.mobile,
          student_registry_number: editForm.studentRegistryNumber,
          program_adjustment: editForm.programAdjustment,
          updated_at: new Date().toISOString()
        })
        .eq('id', targetStudentId);

      if (profileError) throw profileError;

      // 2. Insert or update Parent Contacts using upsert on conflict student_id
      const { error: gError } = await supabase
        .from('student_parent_contacts')
        .upsert({
          student_id: targetStudentId,
          parent_name: editParentForm.parent_name,
          parent_phone: editParentForm.parent_phone,
          parent_email: editParentForm.parent_email,
          notes: editParentForm.notes,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'student_id'
        });

      if (gError) throw gError;

      toast.success("Osobni podaci uspješno spremljeni!", { id: saveToast });
      setIsEditing(false);
      loadData();
    } catch (err: any) {
      console.error("Greška pri spremanju podataka:", err);
      toast.error("Spremanje neuspješno: " + err.message, { id: saveToast });
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center space-y-3">
          <div className="inline-block w-8 h-8 border-4 border-t-[#005c8d] border-r-transparent rounded-full animate-spin"></div>
          <p className="text-xs text-slate-500 font-bold uppercase tracking-wider animate-pulse">Učitavanje osobnih podataka...</p>
        </div>
      </div>
    );
  }

  const formatAdjustment = (val: string) => {
    const adj = PROGRAM_ADJUSTMENTS.find(a => a.value === val);
    return adj ? adj.label : '—';
  };

  const hasParentContact = parentContact && (parentContact.parent_name || parentContact.parent_phone || parentContact.parent_email);

  const studentNameParts = (studentProfile?.name || '').trim().split(/\s+/);
  const studentFirstName = studentNameParts.slice(0, -1).join(' ') || studentProfile?.name || '—';
  const studentLastName = studentNameParts.length > 1 ? studentNameParts.at(-1) : '';
  const studentRows = [
    ['Redni broj', redniBroj],
    ['Ime', studentFirstName],
    ['Prezime', studentLastName || '—'],
    ['OIB', studentProfile?.oib || '—'],
    ['Datum rođenja', studentProfile?.dob ? new Date(studentProfile.dob).toLocaleDateString('hr') : '—'],
    ['Mjesto rođenja', studentProfile?.birthplace || studentProfile?.pob || '—'],
    ['Adresa', studentProfile?.address || '—'],
    ['Program', programInfo?.name || classInfo?.program?.name || '—'],
  ];

  if (!isEditing) {
    return (
      <div className="flex-1 bg-white overflow-auto">
        <div className="w-full px-4 md:px-5 py-3">
          {canEdit && (
            <div className="flex justify-end mb-3">
              <button
                onClick={() => setIsEditing(true)}
                type="button"
                className="px-4 py-2 bg-[#1780c2] text-white rounded-md text-sm font-medium flex items-center gap-2"
              >
                <Edit size={14} /> Uredi podatke
              </button>
            </div>
          )}

          <section className="border-y border-slate-200 py-3 text-center">
            <h1 className="font-bold text-sm text-slate-950 mb-3">Podaci o učeniku</h1>
            <div className="space-y-1 text-sm">
              {studentRows.map(([label, value]) => (
                <div key={label} className="flex justify-center gap-2 leading-6">
                  <span className="font-bold">{label}</span>
                  <span>{value}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="border-b border-slate-200 py-3 text-center">
            <h2 className="font-bold text-sm text-slate-950 mb-3">Kontakt podaci</h2>
            {!hasParentContact ? (
              <p className="text-sm text-slate-500">Nema unesenih kontakata.</p>
            ) : (
              <div className="space-y-3 text-sm">
                <div className="space-y-1">
                  <div className="flex justify-center gap-2 leading-6">
                    <span className="font-bold">Ime i prezime</span>
                    <span>{parentContact.parent_name || '—'}</span>
                  </div>
                  <div className="flex justify-center gap-2 leading-6">
                    <span className="font-bold">Adresa</span>
                    <span>{parentContact.address || parentContact.parent_address || '—'}</span>
                  </div>
                  <div className="flex justify-center gap-2 leading-6">
                    <span className="font-bold">Telefon</span>
                    <span>{parentContact.parent_phone || '—'}</span>
                  </div>
                  <div className="flex justify-center gap-2 leading-6">
                    <span className="font-bold">Napomena</span>
                    <span>{parentContact.notes || '—'}</span>
                  </div>
                  <div className="flex justify-center gap-2 leading-6">
                    <span className="font-bold">E-mail</span>
                    <span>{parentContact.parent_email || '—'}</span>
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 p-6 space-y-6 max-w-5xl mx-auto w-full">
      {/* Title block */}
      <div className="flex justify-between items-center bg-white p-5 border border-gray-200 shadow-sm rounded-lg shrink-0">
        <div>
          <h1 className="text-base font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
            <ClipboardList className="text-[#005c8d]" size={18} />
            Osobni podaci učenika
          </h1>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-1">
            Osnovni dosje, adrese i kontakt detalji roditelja / skrbnika
          </p>
        </div>

        {canEdit && !isEditing && (
          <button
            onClick={() => setIsEditing(true)}
            type="button"
            className="px-4 py-2 border border-[#005c8d] text-[#005c8d] bg-sky-50 hover:bg-sky-100 text-[10px] font-black uppercase tracking-widest rounded-md shadow-sm transition-all flex items-center gap-2 cursor-pointer"
          >
            <Edit size={12} /> Uredi podatke
          </button>
        )}
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Section: Osnovni podaci */}
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
          <div className="bg-slate-50 px-5 py-4 border-b border-gray-200 flex items-center justify-between shrink-0">
            <h2 className="text-xs font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
              <Shield className="text-[#005c8d]" size={14} />
              Podaci o učeniku
            </h2>
            {studentProfile?.program_adjustment && studentProfile?.program_adjustment !== 'NONE' && (
              <span className="bg-emerald-50 text-emerald-800 border border-emerald-200 text-[9px] font-black px-2.5 py-1 rounded uppercase tracking-wider">
                Prilagodba programa aktivna
              </span>
            )}
          </div>

          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5 text-xs font-bold text-slate-700">
            {/* Redni broj */}
            <div className="border-b border-slate-100 pb-3 flex justify-between items-center">
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Redni broj u razredu</span>
              <span className="font-mono text-sm text-[#005c8d] font-black">{redniBroj}</span>
            </div>

            {/* Ime i Prezime */}
            <div className="border-b border-slate-100 pb-3 flex justify-between items-center">
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Ime i prezime</span>
              <span className="text-slate-900 uppercase tracking-tight">{studentProfile?.name}</span>
            </div>

            {/* OIB */}
            <div className="border-b border-slate-100 pb-3 flex justify-between items-center">
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">OIB</span>
              <span className="font-mono text-slate-900 tracking-tight">{studentProfile?.oib || '—'}</span>
            </div>

            {/* Datum rođenja */}
            <div className="border-b border-slate-100 pb-3 flex justify-between items-center">
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Datum rođenja</span>
              <span className="text-slate-950 font-semibold">{studentProfile?.dob ? new Date(studentProfile.dob).toLocaleDateString('hr') : '—'}</span>
            </div>

            {/* Mjesto rođenja */}
            <div className="border-b border-slate-100 pb-3 flex justify-between items-center">
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Mjesto rođenja</span>
              {isEditing ? (
                <input
                  type="text"
                  value={editForm.birthplace}
                  onChange={e => setEditForm({ ...editForm, birthplace: e.target.value })}
                  className="border border-[#de4d57]/30 focus:border-[#005c8d] p-1.5 font-bold outline-none rounded bg-[#f0f2f5]/30 text-right text-xs uppercase"
                />
              ) : (
                <span className="text-slate-900 uppercase">{studentProfile?.birthplace || studentProfile?.pob || '—'}</span>
              )}
            </div>

            {/* Matični broj */}
            <div className="border-b border-slate-100 pb-3 flex justify-between items-center">
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Matični broj (Reg. No.)</span>
              {isEditing ? (
                <input
                  type="text"
                  value={editForm.studentRegistryNumber}
                  onChange={e => setEditForm({...editForm, studentRegistryNumber: e.target.value})}
                  className="border border-[#de4d57]/30 focus:border-[#005c8d] p-1.5 font-mono font-bold outline-none rounded bg-[#f0f2f5]/30 text-right text-xs"
                />
              ) : (
                <span className="font-mono text-slate-900 font-black">{studentProfile?.student_registry_number || '—'}</span>
              )}
            </div>

            {/* Telefon/Mobitel */}
            <div className="border-b border-slate-100 pb-3 flex justify-between items-center">
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Telefon / mobitel</span>
              {isEditing ? (
                <input
                  type="text"
                  value={editForm.mobile}
                  onChange={e => setEditForm({...editForm, mobile: e.target.value})}
                  className="border border-[#de4d57]/30 focus:border-[#005c8d] p-1.5 font-bold outline-none rounded bg-[#f0f2f5]/30 text-right text-xs"
                />
              ) : (
                <span className="text-slate-900">{studentProfile?.mobile || '—'}</span>
              )}
            </div>

            {/* Adresa prebivališta */}
            <div className="border-b border-slate-100 pb-3 flex justify-between items-center">
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Adresa</span>
              {isEditing ? (
                <input
                  type="text"
                  value={editForm.address}
                  onChange={e => setEditForm({...editForm, address: e.target.value})}
                  className="border border-[#de4d57]/30 focus:border-[#005c8d] p-1.5 font-bold outline-none rounded bg-[#f0f2f5]/30 text-right text-xs"
                />
              ) : (
                <span className="text-slate-900 uppercase">{studentProfile?.address || '—'}</span>
              )}
            </div>

            {/* Razred */}
            <div className="border-b border-slate-100 pb-3 flex justify-between items-center">
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Razredni odjel</span>
              <span className="text-slate-900 uppercase tracking-tight">{classInfo?.name || '—'}</span>
            </div>

            {/* Program obrazovanja */}
            <div className="border-b border-slate-100 pb-3 flex justify-between items-center">
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Program</span>
              <span className="text-slate-900 uppercase tracking-tight">{programInfo?.name || classInfo?.program?.name || '—'}</span>
            </div>

            {/* Prilagodba programa */}
            <div className="border-b border-slate-100 pb-3 flex justify-between items-center md:col-span-2">
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Prilagodba programa</span>
              {isEditing ? (
                <select
                  value={editForm.programAdjustment}
                  onChange={e => setEditForm({...editForm, programAdjustment: e.target.value})}
                  className="border border-[#de4d57]/30 focus:border-[#005c8d] p-1.5 font-bold outline-none rounded bg-[#f0f2f5]/20 text-xs w-64 text-right"
                >
                  {PROGRAM_ADJUSTMENTS.map(adj => (
                    <option key={adj.value} value={adj.value}>{adj.label}</option>
                  ))}
                </select>
              ) : (
                <span className={cn(
                  "font-black tracking-tight text-right",
                  studentProfile?.program_adjustment && studentProfile.program_adjustment !== 'NONE'
                    ? "text-emerald-700 font-extrabold uppercase animate-pulse"
                    : "text-slate-400"
                )}>
                  {formatAdjustment(studentProfile?.program_adjustment)}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Section: Kontakt podaci roditelja/skrbnika */}
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
          <div className="bg-slate-50 px-5 py-4 border-b border-gray-200">
            <h2 className="text-xs font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
              <UserPlus className="text-[#005c8d]" size={14} />
              Kontakt podaci roditelja / skrbnika
            </h2>
          </div>

          <div className="p-6">
            {isEditing ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 font-bold text-slate-700 text-xs">
                <div className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-[8.5px] font-black text-slate-400 uppercase tracking-wider block">Ime i prezime roditelja/skrbnika</label>
                    <input
                      type="text"
                      value={editParentForm.parent_name}
                      onChange={e => setEditParentForm({ ...editParentForm, parent_name: e.target.value })}
                      className="w-full border border-gray-300 p-2 font-bold focus:border-[#005c8d] outline-none text-xs rounded"
                      placeholder="npr. Ana Horvat"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[8.5px] font-black text-slate-400 uppercase tracking-wider block">Telefon</label>
                    <input
                      type="text"
                      value={editParentForm.parent_phone}
                      onChange={e => setEditParentForm({ ...editParentForm, parent_phone: e.target.value })}
                      className="w-full border border-gray-300 p-2 font-bold focus:border-[#005c8d] outline-none text-xs rounded"
                      placeholder="+385 91..."
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-[8.5px] font-black text-slate-400 uppercase tracking-wider block">E-mail</label>
                    <input
                      type="email"
                      value={editParentForm.parent_email}
                      onChange={e => setEditParentForm({ ...editParentForm, parent_email: e.target.value })}
                      className="w-full border border-gray-300 p-2 font-bold focus:border-[#005c8d] outline-none text-xs rounded"
                      placeholder="roditelj@email.com"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[8.5px] font-black text-slate-400 uppercase tracking-wider block">Napomena / Informacije</label>
                    <textarea
                      value={editParentForm.notes}
                      onChange={e => setEditParentForm({ ...editParentForm, notes: e.target.value })}
                      className="w-full border border-gray-300 p-2 font-bold focus:border-[#005c8d] outline-none text-xs rounded min-h-[60px]"
                      placeholder="npr. Zvati nakon 16 sati..."
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div>
                {!hasParentContact ? (
                  <div className="text-center py-8 text-slate-400 font-bold uppercase tracking-wider text-xs">
                    Nema unesenih kontakata.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-50/20 p-5 border border-gray-100 rounded">
                    <div className="space-y-4 font-bold text-xs text-slate-700">
                      <div className="flex items-center gap-3">
                        <UserPlus size={14} className="text-[#005c8d] shrink-0" />
                        <div>
                          <span className="text-[8px] font-black text-slate-400 uppercase block tracking-wider">Ime i prezime roditelja/skrbnika</span>
                          <span className="text-slate-900 text-sm uppercase">{parentContact.parent_name || '—'}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Phone size={14} className="text-[#005c8d] shrink-0" />
                        <div>
                          <span className="text-[8px] font-black text-slate-400 uppercase block tracking-wider">Telefon</span>
                          <span className="text-slate-600 font-mono">{parentContact.parent_phone || '—'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4 font-bold text-xs text-slate-700">
                      <div className="flex items-center gap-3">
                        <Mail size={14} className="text-[#005c8d] shrink-0" />
                        <div>
                          <span className="text-[8px] font-black text-slate-400 uppercase block tracking-wider">E-mail</span>
                          <span className="text-slate-600">{parentContact.parent_email || '—'}</span>
                        </div>
                      </div>
                      <div className="flex items-start gap-3 bg-white p-3 border border-gray-100 rounded shadow-sm">
                        <Notebook size={14} className="text-[#005c8d] shrink-0 mt-0.5" />
                        <div className="space-y-0.5">
                          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Napomena</span>
                          <p className="text-slate-600 italic leading-relaxed font-semibold">{parentContact.notes || 'Nema napomene'}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Edit Action Buttons */}
        {isEditing && (
          <div className="flex gap-4 items-center justify-end border-t border-gray-100 pt-6">
            <button
              type="button"
              onClick={() => {
                setIsEditing(false);
                // Reset edit data to currently loaded
                setEditForm({
                  address: studentProfile.address || '',
                  birthplace: studentProfile.birthplace || studentProfile.pob || '',
                  mobile: studentProfile.mobile || '',
                  studentRegistryNumber: studentProfile.student_registry_number || '',
                  programAdjustment: studentProfile.program_adjustment || 'NONE',
                });
                setEditParentForm({
                  parent_name: parentContact?.parent_name || '',
                  parent_phone: parentContact?.parent_phone || '',
                  parent_email: parentContact?.parent_email || '',
                  notes: parentContact?.notes || '',
                });
              }}
              className="px-5 py-2.5 border border-gray-300 text-slate-600 hover:text-slate-800 rounded bg-white text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer shadow-sm"
            >
              Odustani
            </button>
            <button
              type="submit"
              className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[10px] font-black uppercase tracking-widest transition-all shadow-md flex items-center gap-2 cursor-pointer"
            >
              <Save size={13} /> Spremi promjene
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
