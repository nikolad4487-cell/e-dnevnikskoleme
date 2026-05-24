import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useSelection } from '../../contexts/SelectionContext';
import { Search, User, Mail, Hash, BookOpen } from 'lucide-react';
import { cn, getSurname, matchesSearch } from '../../lib/utils';
import { Role } from '../../types';

export default function PretrazivanjePage() {
  const { selectedSchoolId } = useSelection();
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState<{ students: any[], lessons: any[] }>({ students: [], lessons: [] });
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'STUDENTS' | 'LESSONS'>('STUDENTS');

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchTerm.trim()) return;
    
    setLoading(true);
    try {
      // Search Students
      let studentQ = supabase.from('user_school_roles')
        .select('*, student:user_profiles(*)')
        .eq('role', Role.STUDENT);
      
      if (selectedSchoolId) {
        studentQ = studentQ.eq('school_id', selectedSchoolId);
      }
      
      const { data: rolesData } = await studentQ;
      
      const filteredStudents = (rolesData || [])
        .map(r => r.student)
        .filter(p => !searchTerm || matchesSearch(p.name, searchTerm) || p.oib?.includes(searchTerm));

      const mappedStudents = filteredStudents.map(p => ({
        ...p,
        globalRole: Role.STUDENT
      }));

      // Search Lessons
      let lessonQ = supabase.from('lessons')
        .select('*')
        .or(`topic.ilike.%${searchTerm}%,notes.ilike.%${searchTerm}%`);

      if (selectedSchoolId) {
        lessonQ = lessonQ.eq('school_id', selectedSchoolId);
      }
      const { data: lessonsData } = await lessonQ;

      setResults({ students: mappedStudents, lessons: lessonsData || [] });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white font-sans">
      <div className="bg-[#f8fafc] border-b border-gray-300 px-4 py-2 flex items-center justify-between">
        <h2 className="text-sm font-black text-[#005c8d] flex items-center gap-2 uppercase tracking-widest leading-none">
          <Search size={16} />
          Pretraživanje sustava
        </h2>
        <div className="text-[10px] text-gray-400 font-bold uppercase tracking-widest leading-none underline decoration-dotted">Baza podataka škole</div>
      </div>

      <div className="p-6 overflow-auto">
        <div className="max-w-4xl mx-auto space-y-8">
          <div className="bg-[#f8fafc] border border-gray-300 p-4 shadow-sm">
            <div className="flex border-b border-gray-300 mb-4 px-1">
              <button 
                onClick={() => setActiveTab('STUDENTS')}
                className={cn("px-4 py-2 text-[10px] font-black uppercase tracking-widest transition-all border-b-2 h-10", activeTab === 'STUDENTS' ? "border-[#005c8d] text-[#005c8d]" : "border-transparent text-gray-400 hover:text-gray-600")}
              >
                Učenici
              </button>
              <button 
                onClick={() => setActiveTab('LESSONS')}
                className={cn("px-4 py-2 text-[10px] font-black uppercase tracking-widest transition-all border-b-2 h-10", activeTab === 'LESSONS' ? "border-[#005c8d] text-[#005c8d]" : "border-transparent text-gray-400 hover:text-gray-600")}
              >
                Sadržaj nastave
              </button>
            </div>

            <form onSubmit={handleSearch} className="flex gap-2">
              <div className="relative flex-1">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                  <Search size={16} />
                </div>
                <input 
                  type="text" 
                  placeholder={activeTab === 'STUDENTS' ? "Pretražite po imenu, prezimenu ili OIB-u..." : "Pretražite po temi, nastavnoj jedinici ili bilješci..."}
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-300 text-sm outline-none focus:border-[#005c8d] shadow-inner bg-white"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
              </div>
              <button 
                type="submit"
                className="bg-[#005c8d] text-white px-8 border border-[#004a70] font-black text-[10px] uppercase tracking-widest hover:bg-[#004a70] shadow-sm"
              >
                Traži
              </button>
            </form>
          </div>

          <div className="space-y-4">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 bg-[#f8fafc] border border-dashed border-gray-300">
                <div className="w-8 h-8 border-4 border-blue-100 border-t-[#005c8d] rounded-full animate-spin mb-4" />
                <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Pretraživanje baze podataka...</div>
              </div>
            ) : (activeTab === 'STUDENTS' ? results.students.length : results.lessons.length) > 0 ? (
              <div className="border border-gray-300 bg-white">
                <div className="bg-gray-100 border-b border-gray-300 px-4 py-2 text-[10px] font-black text-gray-500 uppercase tracking-widest">
                  Rezultati pretrage: {activeTab === 'STUDENTS' ? results.students.length : results.lessons.length} zapisa
                </div>
                <div className="divide-y divide-gray-200">
                  {activeTab === 'STUDENTS' && results.students.sort((a, b) => {
                    const surnameA = getSurname(String(a.name || ''));
                    const surnameB = getSurname(String(b.name || ''));
                    return surnameA.localeCompare(surnameB, 'hr', { sensitivity: 'base' });
                  }).map(u => (
                    <div key={u.id} className="p-4 flex items-center gap-6 hover:bg-blue-50 transition-colors">
                      <div className="w-12 h-12 border border-gray-200 bg-gray-50 flex items-center justify-center text-[#94a3b8] shrink-0">
                        <User size={24} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-base text-[#005c8d] uppercase tracking-tight">{u.name}</div>
                        <div className="flex flex-wrap gap-x-6 gap-y-1 mt-1">
                          <div className="flex items-center gap-2 text-[10px] text-gray-400 font-bold uppercase"><Mail size={12} className="text-gray-300" /> {u.email}</div>
                          <div className="flex items-center gap-2 text-[10px] text-gray-400 font-bold uppercase"><Hash size={12} className="text-gray-300" /> OIB: {u.oib || 'N/A'}</div>
                        </div>
                      </div>
                      <button className="text-[10px] font-black text-[#005c8d] uppercase border border-gray-200 px-3 py-1 hover:bg-[#005c8d] hover:text-white transition-all whitespace-nowrap">Otvori dosje</button>
                    </div>
                  ))}
                  {activeTab === 'LESSONS' && results.lessons.sort((a,b) => (String(b.date || "")).localeCompare(a.date)).map(l => (
                    <div key={l.id} className="p-4 hover:bg-blue-50 transition-colors flex gap-4">
                       <div className="w-10 h-10 border border-gray-200 bg-gray-50 flex items-center justify-center text-[#94a3b8] shrink-0">
                        <BookOpen size={20} />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <div className="text-[10px] font-black text-[#005c8d] uppercase tracking-widest">{l.date} • {l.hour}. nastavni sat</div>
                          <div className="text-[9px] text-gray-400 font-bold uppercase">ID: {l.id.slice(0, 8)}</div>
                        </div>
                        <div className="font-bold text-sm text-gray-800 leading-tight uppercase tracking-tight">{l.topic}</div>
                        {l.notes && <p className="text-[11px] text-gray-400 italic mt-1 leading-relaxed">"{l.notes}"</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : searchTerm && (
              <div className="text-center py-20 bg-gray-50 border border-gray-200">
                 <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest italic">Nije pronađeno ništa za traženi pojam "{searchTerm}"</div>
              </div>
            )}

            {!searchTerm && (
              <div className="text-center py-32 border border-dashed border-gray-300 bg-gray-50/30 flex flex-col items-center">
                <Search size={48} className="mb-4 text-gray-200" strokeWidth={1} />
                <p className="text-[10px] font-black text-gray-300 uppercase tracking-[0.2em]">Sustav za pretraživanje baze e-Dnevnika</p>
                <p className="text-[9px] font-bold text-gray-300 uppercase mt-1 tracking-tighter">Unesite traženi pojam iznad za početak rada</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
