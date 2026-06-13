import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useSelection } from '../../contexts/SelectionContext';
import { logSystemAction } from '../../utils/auditLogger';
import { 
  Calendar, Check, Plus, Trash2, Edit2, ChevronLeft, ChevronRight, Filter, Clock, 
  MapPin, ShieldAlert, Users, Compass, BookOpen, Star, Sparkles
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useNavigate, useLocation } from 'react-router-dom';

interface SchoolEvent {
  id: string;
  school_id: string;
  date: string; // YYYY-MM-DD (typically start_date)
  time?: string; // HH:MM
  start_date?: string; // YYYY-MM-DD
  end_date?: string; // YYYY-MM-DD
  start_time?: string; // HH:MM
  end_time?: string; // HH:MM
  holiday_type?: 'WINTER_1' | 'WINTER_2' | 'SPRING' | 'SUMMER';
  type: 'PRAZNIK' | 'SJEDNICA' | 'SASTANAK' | 'OBRANA' | 'NATJECANJE' | 'IZLET' | 'DOGAĐAJ' | 'ŠKOLSKI_PRAZNIK';
  title: string;
  classroom?: string;
  notes?: string;
  is_instructional_day?: boolean;
}

export default function SkolskiKalendarPage({ readOnly = false }: { readOnly?: boolean }) {
  const { user, isStaff: authIsStaff, isMainAdmin, userSchoolRoles } = useAuth();
  const isStaff = authIsStaff && !readOnly;
  const { selectedSchoolId } = useSelection();
  const navigate = useNavigate();
  const location = useLocation();

  const isSchoolAdmin = isMainAdmin || (userSchoolRoles && userSchoolRoles.some((r: any) =>
    (r.schoolId === selectedSchoolId || r.school_id === selectedSchoolId)
    && (r.role === 'ADMIN' || r.role === 'SCHOOL_ADMIN' || r.role === 'MAIN_ADMIN')
    && (!r.status || r.status === 'ACTIVE')
  ));

  const [events, setEvents] = useState<SchoolEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  
  // Filtering & Add modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [selectedDayEvents, setSelectedDayEvents] = useState<SchoolEvent[]>([]);
  const [selectedDayDateStr, setSelectedDayDateStr] = useState('');
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Form State
  const [newDate, setNewDate] = useState('');
  const [newTime, setNewTime] = useState('08:00');
  const [newType, setNewType] = useState<'PRAZNIK' | 'SJEDNICA' | 'SASTANAK' | 'OBRANA' | 'NATJECANJE' | 'IZLET' | 'DOGAĐAJ' | 'ŠKOLSKI_PRAZNIK'>('DOGAĐAJ');
  const [newTitle, setNewTitle] = useState('');
  const [newClassroom, setNewClassroom] = useState('');
  const [newNotes, setNewNotes] = useState('');

  // Additional form state for school holidays
  const [holidayStartDate, setHolidayStartDate] = useState('');
  const [holidayEndDate, setHolidayEndDate] = useState('');
  const [holidayStartTime, setHolidayStartTime] = useState('08:00');
  const [holidayEndTime, setHolidayEndTime] = useState('14:00');
  const [holidaySubType, setHolidaySubType] = useState<'WINTER_1' | 'WINTER_2' | 'SPRING' | 'SUMMER'>('WINTER_1');
  const [isInstructionalDay, setIsInstructionalDay] = useState(true);

  useEffect(() => {
    if (!selectedSchoolId) return;
    loadEvents();
  }, [selectedSchoolId]);

  useEffect(() => {
    if (newType === 'PRAZNIK' || newType === 'ŠKOLSKI_PRAZNIK') {
      setIsInstructionalDay(false);
    } else {
      setIsInstructionalDay(true);
    }
  }, [newType]);

  const loadEvents = async () => {
    try {
      setLoading(true);
      // Fetch school events from JSON backend
      const res = await fetch(`/api/school-events?schoolId=${selectedSchoolId}`);
      if (res.ok) {
        const data = await res.json();
        
        // Also fetch defenses & meetings from live tables to populate dynamically!
        const liveEvents: SchoolEvent[] = [...data];

        // 1. Fetch parent meetings from DB
        const { data: dbMeetings } = await supabase
          .from('parent_meetings')
          .select('*')
          .eq('school_id', selectedSchoolId);
        
        (dbMeetings || []).forEach(m => {
          liveEvents.push({
            id: `meeting-${m.id}`,
            school_id: selectedSchoolId || '',
            date: m.date,
            time: m.time,
            type: 'SASTANAK',
            title: `Roditeljski Sastanak: ${m.topic}`,
            classroom: 'Učionica razreda',
            notes: m.minutes || ''
          });
        });

        // 2. Fetch completed final thesis records to map defend dates
        const { data: dbTheses } = await supabase
          .from('final_thesis')
          .select('id, student_note, thesis_title, defense_date, creation_date')
          .eq('school_id', selectedSchoolId || '');

        (dbTheses || []).forEach(t => {
          if (t.defense_date) {
            liveEvents.push({
              id: `defense-${t.id}`,
              school_id: selectedSchoolId || '',
              date: t.defense_date,
              time: '10:00',
              type: 'OBRANA',
              title: `Obrana završnog rada: "${t.thesis_title}"`,
              classroom: 'Ured komisije',
              notes: t.student_note || ''
            });
          }
        });

        setEvents(liveEvents);
      }
    } catch (err) {
      console.error(err);
      toast.error('Nije moguće učitati školski kalendar.');
    } finally {
      setLoading(false);
    }
  };

  const getDefaultHolidayTitle = (subType: string) => {
    switch (subType) {
      case 'WINTER_1': return 'Zimski praznici - 1. dio';
      case 'WINTER_2': return 'Zimski praznici - 2. dio';
      case 'SPRING': return 'Proljetni praznici';
      case 'SUMMER': return 'Ljetni praznici';
      default: return 'Školski praznici';
    }
  };

  const handleEditEvent = (event: SchoolEvent) => {
    setEditingEventId(event.id || null);
    setNewType(event.type);
    
    // Set dates and times
    if (event.type === 'ŠKOLSKI_PRAZNIK') {
      setHolidayStartDate(event.start_date || event.date || '');
      setHolidayEndDate(event.end_date || event.date || '');
      setHolidayStartTime(event.start_time || '08:00');
      setHolidayEndTime(event.end_time || '14:00');
      setHolidaySubType(event.holiday_type || 'WINTER_1');
    } else {
      setNewDate(event.start_date || event.date || '');
      if (event.time && event.time.includes('-')) {
        setNewTime(event.time.split('-')[0].trim());
      } else {
        setNewTime(event.time || event.start_time || '08:00');
      }
    }
    
    setNewTitle(event.title);
    setNewClassroom(event.classroom || '');
    setNewNotes(event.notes || '');
    setIsInstructionalDay(event.is_instructional_day !== undefined ? event.is_instructional_day : true);
    
    setShowDetailsModal(false);
    setShowAddModal(true);
  };

  const handleAddEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const isHoliday = newType === 'ŠKOLSKI_PRAZNIK';
    const computedTitle = isHoliday 
      ? (newTitle.trim() || getDefaultHolidayTitle(holidaySubType))
      : newTitle.trim();
    const computedDate = isHoliday ? holidayStartDate : newDate;

    if (!computedTitle || !computedDate) {
      toast.error('Molimo unesite uočljivi naslov i točan datum.');
      return;
    }

    if (isHoliday && (!holidayStartDate || !holidayEndDate)) {
      toast.error('Molimo unesite datum početka i kraja praznika.');
      return;
    }

    try {
      const startDate = isHoliday ? holidayStartDate : computedDate;
      const endDate = isHoliday ? holidayEndDate : computedDate;
      const startTime = isHoliday ? holidayStartTime : newTime;
      const endTime = isHoliday ? holidayEndTime : null;

      // Calculate school year from date
      let school_year = "2025/2026";
      const dateObj = new Date(startDate);
      if (!isNaN(dateObj.getTime())) {
        const year = dateObj.getFullYear();
        const month = dateObj.getMonth() + 1;
        if (month >= 9) {
          school_year = `${year}/${year + 1}`;
        } else {
          school_year = `${year - 1}/${year}`;
        }
      }

      const dbPayload = {
        school_id: selectedSchoolId || '',
        school_year,
        event_type: newType,
        title: computedTitle,
        description: newNotes || null,
        start_date: startDate,
        end_date: endDate,
        start_time: startTime || null,
        end_time: endTime || null,
        is_instructional_day: isInstructionalDay,
        classroom: isHoliday ? null : (newClassroom || null)
      };

      // 6. Log payload before sending
      console.log("SAVE SCHOOL CALENDAR PAYLOAD", dbPayload);

      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Nedostaje autorizacijski token. Prijavite se ponovno.');
      }

      const response = await fetch('/api/school-events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          ...dbPayload,
          id: editingEventId || undefined,
        }),
      });
      const raw = await response.text();
      console.log('SAVE SCHOOL CALENDAR STATUS', response.status);
      console.log('SAVE SCHOOL CALENDAR RAW RESPONSE', raw);
      const apiResult = raw ? JSON.parse(raw) : null;
      const result = response.ok && apiResult?.success
        ? { error: null, data: apiResult.data }
        : { error: { message: apiResult?.error || raw || 'Nepoznata greška na poslužitelju' }, data: null };

      if (!result.error) {
        toast.success(editingEventId ? 'Školski događaj je ažuriran.' : 'Školski događaj je zabilježen u kalendaru.');
        setShowAddModal(false);
        setEditingEventId(null);
        
        // Log auditing action
        if (user?.id) {
          await logSystemAction({
            executor_id: user.id,
            school_id: selectedSchoolId || '',
            action_type: 'ADD_CALENDAR_EVENT',
            entity_type: 'SCHOOL_CALENDAR',
            entity_id: selectedSchoolId || '',
            new_value: dbPayload
          });
        }

        // Reset form
        setNewTitle('');
        setNewClassroom('');
        setNewNotes('');
        setHolidayStartDate('');
        setHolidayEndDate('');
        setHolidayStartTime('08:00');
        setHolidayEndTime('14:00');
        setHolidaySubType('WINTER_1');
        loadEvents();
      } else {
        const errorObj = new Error(result.error.message || 'Nepoznata greška na poslužitelju');
        throw errorObj;
      }
    } catch (error: any) {
      // 7. Log error in catch
      console.error("SAVE SCHOOL CALENDAR ERROR", error);
      // 5. Display detailed message
      const detailedMsg = [
        error.message,
        error.details,
        error.hint,
        error.code
      ].filter(Boolean).join(" | ");
      toast.error(`Greška pri spremanju kalendara: ${detailedMsg}`);
    }
  };

  const handleDeleteEvent = async (eventId: string) => {
    console.log("DELETE EVENT START", eventId);

    try {
      console.log("DELETE EVENT AFTER START");

      if (!eventId) {
        console.error("Missing eventId");
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Nedostaje autorizacijski token. Prijavite se ponovno.');
      }

      const response = await fetch(
        `/api/school-events?id=${encodeURIComponent(eventId)}&schoolId=${encodeURIComponent(selectedSchoolId || '')}`,
        {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${session.access_token}` },
        },
      );
      const raw = await response.text();
      const apiResult = raw ? JSON.parse(raw) : null;
      if (!response.ok || !apiResult?.success) {
        throw new Error(apiResult?.error || raw || 'Brisanje događaja nije uspjelo.');
      }

      setEvents((prev) => prev.filter((item) => item.id !== eventId));
      setSelectedDayEvents((prev) => prev.filter((item) => item.id !== eventId));
      toast.success('Događaj je obrisan.');
      setShowDetailsModal(false);
    } catch (err: any) {
      console.error("DELETE EVENT CRASHED", err);
      toast.error(err?.message || 'Brisanje događaja nije uspjelo.');
    }
  };

  // Helper date generators for Monthly Grid
  const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (year: number, month: number) => {
    // 0 = Sunday, 1 = Monday ... 6 = Saturday. Let's adjust so 0 = Monday, 6 = Sunday.
    const rawDay = new Date(year, month, 1).getDay();
    return rawDay === 0 ? 6 : rawDay - 1;
  };

  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth();

  const daysInMonth = getDaysInMonth(currentYear, currentMonth);
  const startOffset = getFirstDayOfMonth(currentYear, currentMonth);

  const prevMonthDays = getDaysInMonth(currentYear, currentMonth - 1);

  const daysArray: { dayNum: number; dateStr: string; isCurrentMonth: boolean }[] = [];

  // Outbound/Prev month padding
  for (let s = startOffset - 1; s >= 0; s--) {
    const d = prevMonthDays - s;
    const dateObj = new Date(currentYear, currentMonth - 1, d);
    const dateStr = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
    daysArray.push({ dayNum: d, dateStr, isCurrentMonth: false });
  }

  // Active Month days
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    daysArray.push({ dayNum: d, dateStr, isCurrentMonth: true });
  }

  // Next Month padding to finish full grid row 
  const totalGridCells = 42; // standard 6-row layout
  const cellsLeft = totalGridCells - daysArray.length;
  for (let n = 1; n <= cellsLeft; n++) {
    const dateObj = new Date(currentYear, currentMonth + 1, n);
    const dateStr = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
    daysArray.push({ dayNum: n, dateStr, isCurrentMonth: false });
  }

  const CRO_MONTHS = [
    'Siječanj', 'Veljača', 'Ožujak', 'Travanj', 'Svibanj', 'Lipanj',
    'Srpanj', 'Kolovoz', 'Rujan', 'Listopad', 'Studeni', 'Prosinac'
  ];

  const handlePrevMonth = () => {
    setCurrentDate(new Date(currentYear, currentMonth - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(currentYear, currentMonth + 1, 1));
  };

  // Badge mapping
  const eventBadgeStyle = (type: string) => {
    switch (type) {
      case 'PRAZNIK': return 'bg-emerald-100 text-emerald-800 border-emerald-250 font-black';
      case 'ŠKOLSKI_PRAZNIK': return 'bg-amber-100 text-amber-800 border-amber-250 font-black';
      case 'SJEDNICA': return 'bg-indigo-100 text-indigo-800 border-indigo-250 font-bold';
      case 'SASTANAK': return 'bg-orange-100 text-orange-900 border-orange-250 font-semibold';
      case 'OBRANA': return 'bg-[#005c8d]/10 text-[#005c8d] border-[#005c8d]/20 font-black';
      case 'NATJECANJE': return 'bg-yellow-105 text-yellow-905 border-yellow-250 font-bold';
      case 'IZLET': return 'bg-teal-100 text-teal-800 border-teal-250 font-bold';
      default: return 'bg-slate-100 text-slate-800 border-slate-205 font-bold';
    }
  };

  const eventLabelCro = (type: string) => {
    switch (type) {
      case 'PRAZNIK': return '🌴 Praznik / Blagdan';
      case 'ŠKOLSKI_PRAZNIK': return '🌴 Školski praznici';
      case 'SJEDNICA': return '⚖️ Nastavničko Vijeće / Sjednica';
      case 'SASTANAK': return '👥 Roditeljski Sastanak';
      case 'OBRANA': return '🎓 Obrana Završnog Rada';
      case 'NATJECANJE': return '⭐ Školsko/Državno Natjecanje';
      case 'IZLET': return '🚌 Izlet / Terenska Nastava';
      default: return '🎉 Školski Događaj / Ostalo';
    }
  };

  return (
    <div className="p-6 bg-slate-50 min-h-screen font-sans space-y-6">
      {location.pathname.startsWith('/admin-skole') && (
        <div 
          onClick={() => navigate('/admin-skole')}
          className="flex items-center gap-2 text-[#005c8d] text-xs font-black uppercase tracking-widest mb-2 cursor-pointer hover:underline w-fit"
        >
          &larr; Povratak na administraciju škole
        </div>
      )}
      {/* Upper header controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between border-b pb-4 gap-4">
        <div>
          <span className="text-[10px] bg-slate-200 text-slate-700 font-black uppercase tracking-widest px-2 py-0.5 rounded border inline-flex items-center gap-1 mb-1">
            🗓️ Integrirani Školski kalendar obveza
          </span>
          <h1 className="text-xl md:text-2xl font-black text-slate-900 uppercase tracking-tight">Godišnji školski kalendar</h1>
          <p className="text-xs text-slate-500 font-bold uppercase tracking-tight mt-0.5">Sveobuhvatni raspored praznika, sjednica, dolazaka i obrana završnih ispita</p>
        </div>

        {isStaff && (
          <button 
            onClick={() => {
              setNewDate(new Date().toISOString().substring(0, 10));
              setShowAddModal(true);
            }}
            className="bg-[#005c8d] text-white text-[10px] sm:text-xs font-black px-4 py-2 uppercase rounded-md shadow-sm hover:bg-[#004b73] transition-all inline-flex items-center gap-2 w-fit"
          >
            <Plus size={14} /> Dodaj događaj / Obranu
          </button>
        )}
      </div>

      {/* Month selectors + Filter */}
      <div className="bg-white border rounded-md shadow-sm p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button onClick={handlePrevMonth} className="p-2 hover:bg-slate-100 rounded border transition-all">
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm font-black text-slate-900 uppercase tracking-wide w-[200px] text-center">
            {CRO_MONTHS[currentMonth]} {currentYear}.
          </span>
          <button onClick={handleNextMonth} className="p-2 hover:bg-slate-100 rounded border transition-all">
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Grid Monthly Calendar */}
      <div className="bg-white border rounded-md shadow-sm overflow-hidden grid grid-cols-7 border-collapse">
        {/* Days labels */}
        {['Pon', 'Uto', 'Sri', 'Čet', 'Pet', 'Sub', 'Ned'].map(d => (
          <div key={d} className="bg-slate-50 border-b p-3 text-center text-[10px] font-black uppercase text-slate-400 tracking-wider">
            {d}
          </div>
        ))}

        {/* Gregorian month days */}
        {daysArray.map((cell, idx) => {
          const dayDate = new Date(cell.dateStr);
          const isToday = new Date().toDateString() === dayDate.toDateString();
          
          // Filter matching events
          const dayEvents = events.filter(e => {
            let matchesDate = false;
            if (e.start_date && e.end_date) {
              matchesDate = cell.dateStr >= e.start_date && cell.dateStr <= e.end_date;
            } else if (e.date) {
              matchesDate = e.date === cell.dateStr;
            }
            return matchesDate;
          });

          return (
            <div 
              key={idx} 
              onClick={() => {
                if (dayEvents.length > 0) {
                  setSelectedDayEvents(dayEvents);
                  setSelectedDayDateStr(cell.dateStr);
                  setShowDetailsModal(true);
                } else if (isStaff) {
                  setNewDate(cell.dateStr);
                  setShowAddModal(true);
                }
              }}
              className={`min-h-[105px] border-b border-r border-slate-100 p-2 overflow-y-auto hover:bg-slate-50/50 cursor-pointer transition-all flex flex-col justify-between ${
                cell.isCurrentMonth ? 'bg-white' : 'bg-slate-50/30 opacity-45'
              } ${isToday ? 'ring-2 ring-[#005c8d]/60 bg-[#005c8d]/5' : ''}`}
            >
              <div className="flex justify-between items-center mb-1">
                <span className={`text-[10px] font-black uppercase ${
                  isToday ? 'bg-[#005c8d] text-white px-1.5 py-0.5 rounded' : 
                  cell.isCurrentMonth ? 'text-slate-800' : 'text-slate-400'
                }`}>
                  {cell.dayNum}
                </span>
                
                {dayEvents.length > 0 && (
                  <span className="text-[9px] font-extrabold uppercase text-slate-400">
                    {dayEvents.length} {dayEvents.length === 1 ? 'zapis' : 'zapisa'}
                  </span>
                )}
              </div>

              {/* Event Badge Items */}
              <div className="space-y-1 mt-1 flex-1">
                {dayEvents.slice(0, 3).map((e, evIdx) => (
                  <div 
                    key={evIdx}
                    className={`text-[8px] leading-tight px-1 py-0.5 rounded border truncate whitespace-nowrap block uppercase text-left ${eventBadgeStyle(e.type)}`}
                    title={e.title}
                  >
                    {e.type === 'OBRANA' ? '🎓 ' : ''}{e.title}
                  </div>
                ))}
                {dayEvents.length > 3 && (
                  <div className="text-[7.5px] font-bold text-slate-400 uppercase tracking-widest pl-1">
                    + još {dayEvents.length - 3}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Add Event Modal */}
      {showAddModal && isStaff && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-50 animate-fade-in">
          <form 
            onSubmit={handleAddEvent}
            className="bg-white border rounded-md shadow-md max-w-md w-full p-6 space-y-4"
          >
            <div className="border-b pb-2 flex justify-between items-center">
              <h3 className="text-sm font-black text-slate-950 uppercase">{editingEventId ? 'Uredi Aktivnost' : 'Novi događaj u kalendaru'}</h3>
              <button 
                type="button" 
                onClick={() => {
                  setShowAddModal(false);
                  setEditingEventId(null);
                }}
                className="text-slate-300 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase block mb-1">Kategorija događaja</label>
              <select 
                value={newType}
                onChange={(e: any) => setNewType(e.target.value)}
                className="w-full border rounded text-xs p-1.5 focus:outline-none font-bold"
              >
                <option value="DOGAĐAJ">🎉 OPĆI ŠKOLSKI DOGAĐAJ</option>
                <option value="ŠKOLSKI_PRAZNIK">🌴 ŠKOLSKI PRAZNICI (Zimski, proljetni, ljetni)</option>
                <option value="PRAZNIK">🌴 BLAGDAN / JEDNODNEVNI PRAZNIK (Nema nastave)</option>
                <option value="SJEDNICA">⚖️ NASTAVNIČKO VIJEĆE / SJEDNICA</option>
                <option value="SASTANAK">👥 RODITELJSKI SASTANAK</option>
                <option value="OBRANA">🎓 OBRANA ZAVRŠNOG ISPISTA / RADA</option>
                <option value="NATJECANJE">⭐ NATJECANJE UČENIKA</option>
                <option value="IZLET">🚌 ŠKOLSKI IZLET / POSJET</option>
              </select>
            </div>

            {newType !== 'ŠKOLSKI_PRAZNIK' ? (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase block mb-1">Datum</label>
                  <input 
                    type="date" 
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                    className="w-full border rounded text-xs p-1.5 focus:outline-none font-medium"
                    required
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase block mb-1">Vrijeme</label>
                  <input 
                    type="time" 
                    value={newTime}
                    onChange={(e) => setNewTime(e.target.value)}
                    className="w-full border rounded text-xs p-1.5 focus:outline-none"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-3 bg-amber-50/50 border border-amber-150 p-3 rounded-md">
                <div>
                  <label className="text-[10px] font-black text-amber-800 uppercase block mb-1">Vrsta praznika</label>
                  <select
                    value={holidaySubType}
                    onChange={(e: any) => setHolidaySubType(e.target.value)}
                    className="w-full border bg-white rounded text-xs p-1.5 focus:outline-none font-black text-amber-900"
                  >
                    <option value="WINTER_1">Zimski praznici - 1. dio</option>
                    <option value="WINTER_2">Zimski praznici - 2. dio</option>
                    <option value="SPRING">Proljetni praznici</option>
                    <option value="SUMMER">Ljetni praznici</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-black text-amber-800 block mb-1">DATUM POČETKA</label>
                    <input 
                      type="date" 
                      value={holidayStartDate}
                      onChange={(e) => setHolidayStartDate(e.target.value)}
                      className="w-full border bg-white rounded text-xs p-1.5 focus:outline-none font-medium"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-amber-800 block mb-1">DATUM KRAJA</label>
                    <input 
                      type="date" 
                      value={holidayEndDate}
                      onChange={(e) => setHolidayEndDate(e.target.value)}
                      className="w-full border bg-white rounded text-xs p-1.5 focus:outline-none font-medium"
                      required
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-black text-amber-800 block mb-1">VRIJEME POČETKA</label>
                    <input 
                      type="time" 
                      value={holidayStartTime}
                      onChange={(e) => setHolidayStartTime(e.target.value)}
                      className="w-full border bg-white rounded text-xs p-1.5 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-amber-800 block mb-1">VRIJEME KRAJA</label>
                    <input 
                      type="time" 
                      value={holidayEndTime}
                      onChange={(e) => setHolidayEndTime(e.target.value)}
                      className="w-full border bg-white rounded text-xs p-1.5 focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-center gap-2 py-1 bg-slate-50 border p-2 rounded">
              <input 
                id="is_instructional_day"
                type="checkbox" 
                checked={isInstructionalDay}
                onChange={(e) => setIsInstructionalDay(e.target.checked)}
                className="rounded border-gray-300 text-[#005c8d] focus:ring-[#005c8d] h-4 w-4"
              />
              <label htmlFor="is_instructional_day" className="text-xs font-black text-slate-700 uppercase cursor-pointer select-none">
                Nastavni dan (Održava se nastava)
              </label>
            </div>

            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase block mb-1">
                Naziv događaja / Detalji {newType === 'ŠKOLSKI_PRAZNIK' && '(Opcionalno)'}
              </label>
              <input 
                type="text" 
                placeholder={newType === 'ŠKOLSKI_PRAZNIK' ? 'Opcionalna napomena...' : 'npr. Sjednica vijeća, Ispitni rok...'}
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                className="w-full border rounded text-xs p-1.5 focus:outline-none font-semibold text-slate-800"
                required={newType !== 'ŠKOLSKI_PRAZNIK'}
              />
            </div>

            {/* Render defense / additional fields if type matches */}
            {(newType === 'OBRANA' || newType === 'SJEDNICA') && (
              <div className="grid grid-cols-2 gap-3 bg-slate-50 border p-3 rounded">
                <div>
                  <label className="text-[10px] font-black text-[#005c8d] uppercase block mb-1">Učionica / Kabinet</label>
                  <input 
                    type="text" 
                    placeholder="npr. Učionica 102"
                    value={newClassroom}
                    onChange={(e) => setNewClassroom(e.target.value)}
                    className="w-full border rounded text-xs p-1.5 bg-white"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase block mb-1">Opis / Bilješke</label>
              <textarea 
                rows={2}
                placeholder="Dodatne upute..."
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
                className="w-full border rounded text-xs p-1.5 focus:outline-none"
              />
            </div>

            <div className="flex gap-2 justify-end pt-2 border-t">
              <button 
                type="button" 
                onClick={() => {
                  setShowAddModal(false);
                  setEditingEventId(null);
                }}
                className="text-xs font-black uppercase text-slate-400 hover:text-slate-700 px-4 py-2 border rounded"
              >
                Odustani
              </button>
              <button 
                type="submit" 
                className="bg-[#005c8d] text-white text-xs font-black uppercase tracking-wider px-4 py-2 rounded shadow-sm hover:bg-[#004f79]"
              >
                {editingEventId ? 'Spremi izmjene' : 'Dodaj u kalendar'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Details / Events Modal */}
      {showDetailsModal && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white border rounded-md shadow-md max-w-md w-full p-6 space-y-4">
            <div className="border-b pb-2 flex justify-between items-center">
              <div>
                <h3 className="text-sm font-black text-slate-950 uppercase">Pregled aktivnosti</h3>
                <span className="text-[10px] text-slate-400 font-extrabold uppercase mt-0.5">
                  Datum: {new Date(selectedDayDateStr).toLocaleDateString('hr-HR')}
                </span>
              </div>
              <button 
                onClick={() => setShowDetailsModal(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 max-h-[300px] overflow-y-auto">
              {selectedDayEvents.map((e, idx) => (
                <div key={idx} className="border p-3.5 bg-slate-50/50 rounded-md relative space-y-2">
                  <div className="flex justify-between items-start">
                    <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded border inline-block ${eventBadgeStyle(e.type)}`}>
                      {eventLabelCro(e.type)}
                    </span>
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-slate-950">{e.title}</h4>
                  </div>
                  <div className="text-[10px] text-slate-500 space-y-1 border-t border-dashed pt-2">
                    {e.type === 'ŠKOLSKI_PRAZNIK' && e.start_date && e.end_date ? (
                      <div className="bg-amber-50/50 border border-amber-200 text-amber-900 rounded p-2 text-[9px] font-semibold space-y-0.5">
                        <div className="flex items-center gap-1">
                          <span>📅</span>
                          <span>Trajanje: <span className="font-extrabold">{new Date(e.start_date).toLocaleDateString('hr-HR')}</span> - <span className="font-extrabold">{new Date(e.end_date).toLocaleDateString('hr-HR')}</span></span>
                        </div>
                        {e.start_time && e.end_time && (
                          <div className="flex items-center gap-1">
                            <span>⏰</span>
                            <span>Dnevno vrijeme: <span className="font-bold">{e.start_time} - {e.end_time}</span> sati</span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <>
                        {e.time && (
                          <div className="flex items-center gap-1.5">
                            <Clock size={11} className="text-slate-400" />
                            <span>Vrijeme: <span className="text-slate-800 font-bold">{e.time} sati</span></span>
                          </div>
                        )}
                        {e.classroom && (
                          <div className="flex items-center gap-1.5">
                            <MapPin size={11} className="text-slate-400" />
                            <span>Lokacija: <span className="text-slate-800 font-bold">{e.classroom}</span></span>
                          </div>
                        )}
                      </>
                    )}
                    {e.notes && (
                      <p className="text-[10px] text-slate-600 italic font-medium whitespace-pre-wrap mt-2 p-2 bg-white border border-dashed rounded">
                        " {e.notes} "
                      </p>
                    )}
                  </div>
                  {isSchoolAdmin && e.id && (
                    <div className="flex items-center gap-2 pt-3 mt-2 border-t border-slate-200 justify-end">
                      {!e.id.includes('defense') && !e.id.includes('meeting') && (
                          <button 
                            type="button"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-[#005c8d]/30 bg-blue-50 text-[#005c8d] hover:bg-[#005c8d] hover:text-white text-[10px] font-black uppercase transition-colors"
                            title="Uredi događaj"
                            onClick={() => handleEditEvent(e)}
                          >
                            <Edit2 size={13} />
                            <span>Uredi</span>
                          </button>
                      )}
                      {!e.id.includes('defense') && !e.id.includes('meeting') && (
                        <button 
                          type="button"
                          onClick={() => {
                            console.log("DEBUG: BUTTON CLICKED", e.id);
                            handleDeleteEvent(e.id);
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-red-200 bg-red-50 text-red-700 hover:bg-red-700 hover:text-white text-[10px] font-black uppercase transition-colors"
                          title="Obriši događaj"
                        >
                          <Trash2 size={13} />
                          <span>Obriši</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="flex justify-end pt-2 border-t">
              <button 
                onClick={() => setShowDetailsModal(false)}
                className="bg-slate-900 text-white text-xs font-black uppercase px-4 py-2 rounded"
              >
                Zatvori
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
