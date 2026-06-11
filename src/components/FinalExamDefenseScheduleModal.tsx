import React, { useState, useEffect } from 'react';
import { X, Check } from 'lucide-react';
import { toast } from 'react-hot-toast';

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
  const [selectedClassId, setSelectedClassId] = useState(initialData?.class_id || '');
  const [defenseTime, setDefenseTime] = useState(initialData?.defense_time?.substring(0, 5) || '09:00');
  const [classroom, setClassroom] = useState(initialData?.classroom || '');
  
  const initialMentorsFromData = initialData?.members ? initialData.members.map((m: any) => m.teacher_profile_id) : [];
  const [selectedMentors, setSelectedMentors] = useState<string[]>(Array.from(new Set(initialMentorsFromData)));
  const [loading, setLoading] = useState(false);

  const homeroomTeacherId = classes.find(c => c.id === selectedClassId)?.homeroom_teacher_id || initialData?.members?.find((m: any) => m.is_homeroom_teacher)?.teacher_profile_id;
  const homeroomTeacherName = mentors.find(m => m.id === homeroomTeacherId)?.name || '';

  // Filter classes: only final year classes
  const finalClasses = classes.filter(c => {
    if (c.name === '4.K') return false;
    // If we have grade_level and programs info, rely on that
    if (c.grade_level && c.programs?.duration_years) {
      return c.grade_level === c.programs.duration_years;
    }
    // Fallback logic
    if (c.name.startsWith('1.') || c.name.startsWith('2.')) return false;
    return c.name.startsWith('3.') || c.name.startsWith('4.');
  });

  useEffect(() => {
    if (homeroomTeacherId && !selectedMentors.includes(homeroomTeacherId)) {
      setSelectedMentors(prev => Array.from(new Set([...prev, homeroomTeacherId])));
    }
  }, [selectedClassId, homeroomTeacherId]);


  const toggleMentor = (mentorId: string) => {
    if (mentorId === homeroomTeacherId) return; // Cannot remove homeroom teacher
    if (selectedMentors.includes(mentorId)) {
      setSelectedMentors(selectedMentors.filter(id => id !== mentorId));
    } else {
      setSelectedMentors([...selectedMentors, mentorId]);
    }
  };

  const handleSave = async () => {
    if (!selectedClassId) {
      toast.error('Odaberite razred.');
      return;
    }
    if (!defenseTime) {
      toast.error('Unesite vrijeme obrane.');
      return;
    }
    if (!classroom) {
      toast.error('Unesite učionicu.');
      return;
    }
    if (selectedMentors.length < 3 || selectedMentors.length > 5) {
      toast.error('Komisija mora imati između 3 i 5 članova.');
      return;
    }

    try {
      setLoading(true);
      const payload = {
        school_id: schoolId,
        school_year: '2025./2026.', // Hardcoded or dynamic?
        class_id: selectedClassId,
        defense_time: defenseTime,
        classroom,
        teacher_ids: Array.from(new Set(selectedMentors)),
        homeroom_teacher_id: homeroomTeacherId
      };
      
      const classObj = classes.find(c => c.id === selectedClassId);
      if (classObj && classObj.school_year) {
        payload.school_year = classObj.school_year;
      }

      console.log("SAVE DEFENSE SCHEDULE PAYLOAD:", payload);

      const res = await fetch(initialData ? `/api/final-exam-defense-schedules/${initialData.id}` : '/api/final-exam-defense-schedules', {
        method: initialData ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        toast.success(`Raspored uspješno ${initialData ? 'spremljen' : 'dodan'}`);
        onSaved();
      } else {
        const errData = await res.json().catch(() => ({}));
        toast.error(`Greška: ${errData.error || 'Nepoznata greška'}`);
      }
    } catch (err: any) {
      console.error(err);
      toast.error('Greška pri spremanju.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
          <h2 className="text-lg font-black text-gray-800 uppercase tracking-tight">{initialData ? 'Uredi raspored obrane' : 'Dodaj raspored obrane'}</h2>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase block mb-1">Razred</label>
              <select
                value={selectedClassId}
                onChange={e => setSelectedClassId(e.target.value)}
                className="w-full text-sm border-gray-200 rounded-lg p-2.5 focus:ring-2 focus:ring-[#005c8d]/20 focus:border-[#005c8d]"
              >
                <option value="">-- Odaberite razred --</option>
                {finalClasses.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase block mb-1">Razrednik</label>
              <div className="w-full text-sm border border-gray-100 bg-gray-50 rounded-lg p-2.5 text-gray-600 font-medium">
                {homeroomTeacherName || 'Nije odabran razred'}
              </div>
            </div>
            
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase block mb-1">Vrijeme obrane</label>
              <input
                type="time"
                value={defenseTime}
                onChange={e => setDefenseTime(e.target.value)}
                className="w-full text-sm border-gray-200 rounded-lg p-2.5 focus:ring-2 focus:ring-[#005c8d]/20 focus:border-[#005c8d]"
              />
            </div>
            
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase block mb-1">Učionica</label>
              <input
                type="text"
                placeholder="Npr. 12"
                value={classroom}
                onChange={e => setClassroom(e.target.value)}
                className="w-full text-sm border-gray-200 rounded-lg p-2.5 focus:ring-2 focus:ring-[#005c8d]/20 focus:border-[#005c8d]"
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase block mb-2 flex justify-between">
              <span>Komisija (3 - 5 članova)</span>
              <span className="text-[#005c8d]">{selectedMentors.length} odabrano</span>
            </label>
            <div className="border border-gray-200 rounded-lg max-h-48 overflow-y-auto bg-white">
              {mentors.map(mentor => {
                const isSelected = selectedMentors.includes(mentor.id);
                const isHomeroom = mentor.id === homeroomTeacherId;
                return (
                  <div 
                    key={mentor.id}
                    onClick={() => toggleMentor(mentor.id)}
                    className={`flex items-center px-4 py-2 border-b border-gray-50 cursor-pointer transition-colors ${
                      isSelected ? 'bg-[#005c8d]/5' : 'hover:bg-gray-50'
                    } ${isHomeroom ? 'opacity-70' : ''}`}
                  >
                    <div className={`w-4 h-4 mr-3 rounded shrink-0 border flex items-center justify-center ${
                      isSelected ? 'border-[#005c8d] bg-[#005c8d]' : 'border-gray-300 bg-white'
                    }`}>
                      {isSelected && <Check className="w-3 h-3 text-white" />}
                    </div>
                    <div className="flex-1 text-sm font-medium text-gray-700">
                      {mentor.name}
                      {isHomeroom && <span className="ml-2 text-[10px] font-bold text-[#005c8d] bg-[#005c8d]/10 px-2 py-0.5 rounded-full uppercase">Razrednik</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3 rounded-b-xl">
          <button
            onClick={onClose}
            className="px-5 py-2 text-sm font-bold text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            Odustani
          </button>
          <button
            onClick={handleSave}
            disabled={loading}
            className="px-5 py-2 text-sm font-bold text-white bg-[#005c8d] rounded-lg hover:bg-[#004a70] disabled:opacity-50"
          >
            {loading ? 'Spremanje...' : 'Spremi raspored'}
          </button>
        </div>
      </div>
    </div>
  );
}
