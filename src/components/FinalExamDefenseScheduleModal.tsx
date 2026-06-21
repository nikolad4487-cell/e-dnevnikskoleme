import React, { useEffect, useMemo, useState } from 'react';
import { X, Check } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useSelection } from '../contexts/SelectionContext';
import { supabase } from '../lib/supabase';

const MIN_COMMISSION_MEMBERS = 3;
const MAX_COMMISSION_MEMBERS = 5;

interface FinalExamDefenseScheduleModalProps {
  onClose: () => void;
  onSaved: () => void;
  classes: any[];
  mentors: any[];
  schoolId: string;
  initialData?: any;
}

export default function FinalExamDefenseScheduleModal({
  onClose,
  onSaved,
  classes,
  mentors,
  schoolId,
  initialData
}: FinalExamDefenseScheduleModalProps) {
  const { selectedClassId: contextClassId } = useSelection();

  // Raspored obrane uvijek pripada trenutačno odabranom razredu.
  // initialData je samo sigurnosni fallback za uređivanje postojećeg zapisa.
  const selectedClassId = contextClassId || initialData?.class_id || '';
  const currentClass = useMemo(
    () => classes.find(c => c.id === selectedClassId),
    [classes, selectedClassId]
  );

  const [defenseTime, setDefenseTime] = useState(initialData?.defense_time?.substring(0, 5) || '09:00');
  const [classroom, setClassroom] = useState(initialData?.classroom || '');
  const [selectedMentors, setSelectedMentors] = useState<string[]>([]);
  const [eligibleMentors, setEligibleMentors] = useState<any[]>([]);
  const [loadingClassTeachers, setLoadingClassTeachers] = useState(true);
  const [loading, setLoading] = useState(false);

  const homeroomTeacherId =
    currentClass?.homeroom_teacher_id ||
    initialData?.members?.find((member: any) => member.is_homeroom_teacher)?.teacher_profile_id;

  const homeroomTeacherName =
    eligibleMentors.find(mentor => mentor.id === homeroomTeacherId)?.name ||
    mentors.find(mentor => mentor.id === homeroomTeacherId)?.name ||
    '';

  useEffect(() => {
    setDefenseTime(initialData?.defense_time?.substring(0, 5) || '09:00');
    setClassroom(initialData?.classroom || '');
  }, [initialData?.id]);

  useEffect(() => {
    let cancelled = false;

    const loadClassTeachers = async () => {
      if (!selectedClassId) {
        setEligibleMentors([]);
        setSelectedMentors([]);
        setLoadingClassTeachers(false);
        return;
      }

      setLoadingClassTeachers(true);

      try {
        const { data, error } = await supabase
          .from('class_subject_teachers')
          .select(`
            teacher_id,
            teacher:user_profiles (
              id,
              name,
              role
            )
          `)
          .eq('class_id', selectedClassId);

        if (error) throw error;

        const teachersById = new Map<string, any>();

        (data || []).forEach((assignment: any) => {
          const rawTeacher = assignment.teacher;
          const teacher = Array.isArray(rawTeacher) ? rawTeacher[0] : rawTeacher;
          if (teacher?.id) {
            teachersById.set(teacher.id, teacher);
          }
        });

        // Razrednik je obavezni član čak i kada nema vlastito predmetno zaduženje u razredu.
        const homeroomProfile = mentors.find(mentor => mentor.id === homeroomTeacherId);
        if (homeroomProfile?.id) {
          teachersById.set(homeroomProfile.id, homeroomProfile);
        }

        const classTeachers = Array.from(teachersById.values()).sort((a, b) => {
          if (a.id === homeroomTeacherId) return -1;
          if (b.id === homeroomTeacherId) return 1;
          return String(a.name || '').localeCompare(String(b.name || ''), 'hr');
        });

        if (cancelled) return;

        setEligibleMentors(classTeachers);

        const allowedIds = new Set(classTeachers.map(teacher => teacher.id));
        const existingMemberIds = Array.isArray(initialData?.members)
          ? initialData.members
              .map((member: any) => member.teacher_profile_id)
              .filter((teacherId: string) => allowedIds.has(teacherId))
          : [];

        const additionalMembers = existingMemberIds
          .filter((teacherId: string) => teacherId !== homeroomTeacherId)
          .slice(0, MAX_COMMISSION_MEMBERS - 1);

        const initialSelection = homeroomTeacherId
          ? [homeroomTeacherId, ...additionalMembers]
          : additionalMembers.slice(0, MAX_COMMISSION_MEMBERS);

        setSelectedMentors(Array.from(new Set(initialSelection)));
      } catch (error) {
        console.error('LOAD CLASS TEACHERS FOR DEFENSE ERROR:', error);

        if (!cancelled) {
          const homeroomProfile = mentors.find(mentor => mentor.id === homeroomTeacherId);
          setEligibleMentors(homeroomProfile ? [homeroomProfile] : []);
          setSelectedMentors(homeroomTeacherId ? [homeroomTeacherId] : []);
          toast.error('Nije moguće učitati nastavnike koji predaju ovom razredu.');
        }
      } finally {
        if (!cancelled) {
          setLoadingClassTeachers(false);
        }
      }
    };

    loadClassTeachers();

    return () => {
      cancelled = true;
    };
  }, [selectedClassId, homeroomTeacherId, initialData?.id, mentors]);

  const toggleMentor = (mentorId: string) => {
    if (mentorId === homeroomTeacherId) return;
    if (!eligibleMentors.some(mentor => mentor.id === mentorId)) return;

    if (selectedMentors.includes(mentorId)) {
      setSelectedMentors(previous => previous.filter(id => id !== mentorId));
      return;
    }

    if (selectedMentors.length >= MAX_COMMISSION_MEMBERS) {
      toast.error('Možete odabrati najviše 4 nastavnika uz razrednika, ukupno 5 članova komisije.');
      return;
    }

    setSelectedMentors(previous => [...previous, mentorId]);
  };

  const handleSave = async () => {
    if (!selectedClassId || !currentClass) {
      toast.error('Nije odabran razred. Vratite se i ponovno odaberite razred.');
      return;
    }
    if (!homeroomTeacherId) {
      toast.error('Razred nema postavljenog razrednika.');
      return;
    }
    if (!defenseTime) {
      toast.error('Unesite vrijeme obrane.');
      return;
    }
    if (!classroom.trim()) {
      toast.error('Unesite učionicu.');
      return;
    }

    const uniqueMemberIds = Array.from(new Set(selectedMentors));
    const eligibleIds = new Set(eligibleMentors.map(mentor => mentor.id));

    if (!uniqueMemberIds.includes(homeroomTeacherId)) {
      toast.error('Razrednik mora biti član komisije.');
      return;
    }
    if (uniqueMemberIds.some(teacherId => !eligibleIds.has(teacherId))) {
      toast.error('Komisiju mogu činiti samo nastavnici koji predaju odabranom razredu.');
      return;
    }
    if (uniqueMemberIds.length < MIN_COMMISSION_MEMBERS || uniqueMemberIds.length > MAX_COMMISSION_MEMBERS) {
      toast.error('Komisija mora imati između 3 i 5 članova, uključujući razrednika.');
      return;
    }

    try {
      setLoading(true);

      const payload = {
        school_id: schoolId,
        school_year:
          currentClass.school_year ||
          currentClass.schoolYear ||
          currentClass.school_year_id ||
          '2025./2026.',
        class_id: selectedClassId,
        defense_time: defenseTime,
        classroom: classroom.trim(),
        teacher_ids: uniqueMemberIds,
        homeroom_teacher_id: homeroomTeacherId
      };

      console.log('SAVE DEFENSE SCHEDULE PAYLOAD:', payload);

      const response = await fetch(
        initialData
          ? `/api/final-exam-defense-schedules/${initialData.id}`
          : '/api/final-exam-defense-schedules',
        {
          method: initialData ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }
      );

      if (response.ok) {
        toast.success(`Raspored uspješno ${initialData ? 'spremljen' : 'dodan'}`);
        onSaved();
        return;
      }

      const errorData = await response.json().catch(() => ({}));
      toast.error(`Greška: ${errorData.error || 'Nepoznata greška'}`);
    } catch (error) {
      console.error(error);
      toast.error('Greška pri spremanju.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
          <h2 className="text-lg font-black text-gray-800 uppercase tracking-tight">
            {initialData ? 'Uredi raspored obrane' : 'Dodaj raspored obrane'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase block mb-1">Razred</label>
              <div className="w-full min-h-[42px] text-sm border border-gray-100 bg-gray-50 rounded-lg p-2.5 text-gray-700 font-black">
                {currentClass?.name || 'Nije odabran razred'}
              </div>
            </div>

            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase block mb-1">Razrednik</label>
              <div className="w-full min-h-[42px] text-sm border border-gray-100 bg-gray-50 rounded-lg p-2.5 text-gray-600 font-medium">
                {homeroomTeacherName || 'Razrednik nije postavljen'}
              </div>
            </div>

            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase block mb-1">Vrijeme obrane</label>
              <input
                type="time"
                value={defenseTime}
                onChange={event => setDefenseTime(event.target.value)}
                className="w-full text-sm border-gray-200 rounded-lg p-2.5 focus:ring-2 focus:ring-[#005c8d]/20 focus:border-[#005c8d]"
              />
            </div>

            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase block mb-1">Učionica</label>
              <input
                type="text"
                placeholder="Npr. 12"
                value={classroom}
                onChange={event => setClassroom(event.target.value)}
                className="w-full text-sm border-gray-200 rounded-lg p-2.5 focus:ring-2 focus:ring-[#005c8d]/20 focus:border-[#005c8d]"
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase mb-1 flex justify-between gap-3">
              <span>Komisija (3 – 5 članova)</span>
              <span className="text-[#005c8d] whitespace-nowrap">{selectedMentors.length} / 5 članova</span>
            </label>
            <p className="text-[10px] text-slate-500 font-semibold mb-2">
              Razrednik je automatski odabran i računa se kao jedan član. Odaberite još najmanje 2, a najviše 4 nastavnika koji predaju ovom razredu.
            </p>

            <div className="border border-gray-200 rounded-lg max-h-48 overflow-y-auto bg-white">
              {loadingClassTeachers ? (
                <div className="px-4 py-6 text-center text-xs font-semibold text-slate-400">
                  Učitavanje nastavnika razreda...
                </div>
              ) : eligibleMentors.length === 0 ? (
                <div className="px-4 py-6 text-center text-xs font-semibold text-slate-400">
                  Ovom razredu nisu dodijeljeni nastavnici.
                </div>
              ) : (
                eligibleMentors.map(mentor => {
                  const isSelected = selectedMentors.includes(mentor.id);
                  const isHomeroom = mentor.id === homeroomTeacherId;
                  const isLimitReached = selectedMentors.length >= MAX_COMMISSION_MEMBERS && !isSelected;

                  return (
                    <button
                      type="button"
                      key={mentor.id}
                      onClick={() => toggleMentor(mentor.id)}
                      disabled={isHomeroom || isLimitReached}
                      title={isLimitReached ? 'Dosegnut je najveći broj od 5 članova komisije.' : undefined}
                      className={`w-full flex items-center px-4 py-2 border-b border-gray-50 text-left transition-colors ${
                        isSelected ? 'bg-[#005c8d]/5' : 'hover:bg-gray-50'
                      } ${
                        isHomeroom
                          ? 'opacity-70 cursor-default'
                          : isLimitReached
                            ? 'opacity-40 cursor-not-allowed'
                            : 'cursor-pointer'
                      }`}
                    >
                      <span className={`w-4 h-4 mr-3 rounded shrink-0 border flex items-center justify-center ${
                        isSelected ? 'border-[#005c8d] bg-[#005c8d]' : 'border-gray-300 bg-white'
                      }`}>
                        {isSelected && <Check className="w-3 h-3 text-white" />}
                      </span>
                      <span className="flex-1 text-sm font-medium text-gray-700">
                        {mentor.name}
                        {isHomeroom && (
                          <span className="ml-2 text-[10px] font-bold text-[#005c8d] bg-[#005c8d]/10 px-2 py-0.5 rounded-full uppercase">
                            Razrednik
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>

        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3 rounded-b-xl">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 text-sm font-bold text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            Odustani
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={loading || loadingClassTeachers || !currentClass}
            className="px-5 py-2 text-sm font-bold text-white bg-[#005c8d] rounded-lg hover:bg-[#004a70] disabled:opacity-50"
          >
            {loading ? 'Spremanje...' : 'Spremi raspored'}
          </button>
        </div>
      </div>
    </div>
  );
}
