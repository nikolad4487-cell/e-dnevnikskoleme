import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useSelection } from '../../contexts/SelectionContext';
import { BarChart3, PieChart, TrendingUp, Users, Award, AlertTriangle, FileText, User } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Role } from '../../types';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart as RechartsPieChart, Pie } from 'recharts';

type ReportTab = 'GENERAL' | 'STUDENTS' | 'CLASSES' | 'SUBJECTS' | 'ABSENCES' | 'FINAL_GRADES' | 'MEASURES' | 'EXPERT' | 'MEETINGS';

export default function IzvjestajiPage() {
  const { classId: routeClassId } = useParams<{ classId: string }>();
  const { selectedSchoolId, selectedClassId: contextClassId } = useSelection();
  
  const effectiveClassId = contextClassId || routeClassId;

  const [activeTab, setActiveTab] = useState<ReportTab>('GENERAL');
  const [loading, setLoading] = useState(false);

  const [stats, setStats] = useState({
    totalStudents: 0,
    avgGrade: 0,
    totalAbsences: 0,
    gradesDistribution: [0, 0, 0, 0, 0] // 1-5
  });

  const [reportData, setReportData] = useState<any[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      if (activeTab === 'GENERAL') {
          // Students count
          let studentsQ = supabase.from('student_class_enrollments').select('id', { count: 'exact', head: true }).eq('status', 'ACTIVE');
          if (effectiveClassId) studentsQ = studentsQ.eq('class_id', effectiveClassId);
          else if (selectedSchoolId) studentsQ = studentsQ.eq('school_id', selectedSchoolId);
          const { count: studentsCount } = await studentsQ;

          // Grades
          let gradeQ = supabase.from('grades').select('value');
          if (effectiveClassId) gradeQ = gradeQ.eq('class_id', effectiveClassId);
          else if (selectedSchoolId) gradeQ = gradeQ.eq('school_id', selectedSchoolId);
          const { data: gradesData } = await gradeQ;

          // Absences count
          let absenceQ = supabase.from('absences').select('id', { count: 'exact', head: true });
          if (effectiveClassId) absenceQ = absenceQ.eq('class_id', effectiveClassId);
          else if (selectedSchoolId) absenceQ = absenceQ.eq('school_id', selectedSchoolId);
          const { count: absencesCount } = await absenceQ;

          const grades = (gradesData || []).map(d => d.value);
          const avg = grades.length > 0 ? (grades.reduce((a, b) => a + b, 0) / grades.length).toFixed(2) : '0';
          
          const distribution = [0, 0, 0, 0, 0];
          grades.forEach(v => {
            if (v >= 1 && v <= 5) distribution[v-1]++;
          });

          setStats({
            totalStudents: studentsCount || 0,
            avgGrade: Number(avg),
            totalAbsences: absencesCount || 0,
            gradesDistribution: distribution
          });
      } else if (activeTab === 'STUDENTS') {
          // fetch students stats
          let studentsQ = supabase.from('student_class_enrollments').select('student_id, user_profiles(name, email)').eq('status', 'ACTIVE');
          if (effectiveClassId) studentsQ = studentsQ.eq('class_id', effectiveClassId);
          
          const { data: stdData } = await studentsQ;
          if (stdData) {
              const studentRows = await Promise.all(stdData.map(async (st: any) => {
                  let { data: gr } = await supabase.from('grades').select('value').eq('student_id', st.student_id);
                  let { count: absCount } = await supabase.from('absences').select('id', { count: 'exact', head: true }).eq('student_id', st.student_id);
                  
                  const avg = gr && gr.length > 0 ? (gr.reduce((a,b)=>a+b.value, 0)/gr.length).toFixed(2) : '0';
                  return {
                      id: st.student_id,
                      name: st.user_profiles?.name || 'Nepoznato',
                      avg: Number(avg),
                      absences: absCount || 0
                  };
              }));
              setReportData(studentRows.sort((a,b)=> a.name.localeCompare(b.name)));
          }
      } else if (activeTab === 'CLASSES') {
          // fetch classes stats
          const { data: clsData } = await supabase.from('classes').select('id, name, school_year');
          if (clsData) {
              const classRows = await Promise.all(clsData.map(async (c: any) => {
                  let { data: gr } = await supabase.from('grades').select('value').eq('class_id', c.id);
                  const avg = gr && gr.length > 0 ? (gr.reduce((a,b)=>a+b.value, 0)/gr.length).toFixed(2) : '0';
                  return {
                      id: c.id,
                      name: c.name + " (" + (c.school_year || "") + ")",
                      avg: Number(avg),
                      gradesCount: gr ? gr.length : 0
                  };
              }));
              setReportData(classRows.sort((a,b)=> b.avg - a.avg)); // sort by avg grade descending
          }
      } else if (activeTab === 'SUBJECTS') {
         // Subjects
         let subQ = supabase.from('class_subjects').select('subject_id, subjects(name)').eq('class_id', effectiveClassId || '');
         const { data: csData } = effectiveClassId ? await subQ : await supabase.from('subjects').select('id, name').eq('school_id', selectedSchoolId || '');
         
         const subList = effectiveClassId ? (csData||[]).map((c:any)=>({id: c.subject_id, name: c.subjects?.name})) : (csData||[]);
         const subRows = await Promise.all(subList.map(async (s:any) => {
               let q = supabase.from('grades').select('value').eq('subject_id', s.id);
               if(effectiveClassId) q = q.eq('class_id', effectiveClassId);
               const { data: gr } = await q;
               const avg = gr && gr.length > 0 ? (gr.reduce((a,b)=>a+b.value, 0)/gr.length).toFixed(2) : '0';
               return { id: s.id, name: s.name, avg: Number(avg), count: gr?gr.length:0 };
         }));
         setReportData(subRows.sort((a,b)=> b.avg - a.avg));
      } else if (activeTab === 'ABSENCES') {
         // Absences breakdown
         let absQ = supabase.from('absences').select('status');
         if (effectiveClassId) absQ = absQ.eq('class_id', effectiveClassId);
         const { data: abData } = await absQ;
         
         const breakdown = { EXCUSED: 0, UNEXCUSED: 0, UNRESOLVED: 0 };
         (abData||[]).forEach(a => {
             if(a.status === 'EXCUSED') breakdown.EXCUSED++;
             else if(a.status === 'UNEXCUSED') breakdown.UNEXCUSED++;
             else breakdown.UNRESOLVED++;
         });
         setReportData([{ status: 'Opravdani', count: breakdown.EXCUSED, color: '#16a34a' }, { status: 'Neopravdani', count: breakdown.UNEXCUSED, color: '#dc2626' }, { status: 'Neriješeni', count: breakdown.UNRESOLVED, color: '#f59e0b'}]);
      } else if (activeTab === 'FINAL_GRADES') {
         let subQ = supabase.from('class_subjects').select('subject_id, subjects(name)').eq('class_id', effectiveClassId || '');
         const { data: csData } = effectiveClassId ? await subQ : await supabase.from('subjects').select('id, name').eq('school_id', selectedSchoolId || '');
         
         const subList = effectiveClassId ? (csData||[]).map((c:any)=>({id: c.subject_id, name: c.subjects?.name})) : (csData||[]);
         const subRows = await Promise.all(subList.map(async (s:any) => {
               let q = supabase.from('final_grades').select('grade').eq('subject_id', s.id);
               if(effectiveClassId) q = q.eq('class_id', effectiveClassId);
               const { data: gr } = await q;
               const avg = gr && gr.length > 0 ? (gr.reduce((a,b)=>a+b.grade, 0)/gr.length).toFixed(2) : '0';
               return { id: s.id, name: s.name, avg: Number(avg), count: gr?gr.length:0 };
         }));
         setReportData(subRows.sort((a,b)=> b.avg - a.avg));
      } else if (activeTab === 'MEASURES') {
         // Fetch pedagogical measures
         let q = supabase.from('pedagogical_measures').select('*, user_profiles!student_id(name)');
         if (effectiveClassId) q = q.eq('class_id', effectiveClassId);
         else if (selectedSchoolId) q = q.eq('school_id', selectedSchoolId);
         const { data: pMeasures } = await q;
         setReportData(pMeasures || []);
      } else if (activeTab === 'EXPERT') {
         // Fetch expert service entries
         let q = supabase.from('expert_service_activities').select('*, user_profiles!student_id(name)');
         if (effectiveClassId) q = q.eq('class_id', effectiveClassId);
         else if (selectedSchoolId) q = q.eq('school_id', selectedSchoolId);
         const { data: eActivities } = await q;
         setReportData(eActivities || []);
      } else if (activeTab === 'MEETINGS') {
         // Gather meetings, discussions and arrivals for effectiveClassId
         const meetings: any[] = [];
         
         if (effectiveClassId) {
            const { data: parentMeet } = await supabase.from('parent_teacher_meetings').select('*').eq('class_id', effectiveClassId);
            const { data: indivDisc } = await supabase.from('individual_discussions').select('*, user_profiles!student_id(name)').eq('class_id', effectiveClassId);
            const { data: arrivals } = await supabase.from('parent_arrivals').select('*, user_profiles!student_id(name)').eq('class_id', effectiveClassId);
            
            (parentMeet || []).forEach(m => {
               meetings.push({ ...m, rType: 'Sastanak', displayTitle: m.topic, dateStr: m.date, person: m.leader });
            });
            (indivDisc || []).forEach(d => {
               meetings.push({ ...d, rType: 'Informativka / Razgovor', displayTitle: `Individualni razgovor za učenika: ${d.user_profiles?.name || 'Nepoznato'}`, dateStr: d.date, person: `Roditelj: ${d.parent_name || 'Nije upisano'}` });
            });
            (arrivals || []).forEach(a => {
               meetings.push({ ...a, rType: 'Dolazak', displayTitle: `Evidencija dolaska roditelja za učenika: ${a.user_profiles?.name || 'Nepoznato'}`, dateStr: a.date, person: `Roditelj: ${a.parent_name}` });
            });
         }
         
         setReportData(meetings.sort((a,b) => b.dateStr.localeCompare(a.dateStr)));
      }
      setLoading(false);
    };
    fetchData();
  }, [selectedSchoolId, effectiveClassId, activeTab]);

  return (
    <div className="flex flex-col h-full bg-white font-sans">
      <div className="bg-[#f8fafc] border-b border-gray-300 px-4 py-0 flex flex-col pt-3">
        <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-black text-[#005c8d] flex items-center gap-2 uppercase tracking-widest leading-none">
            <BarChart3 size={16} />
            Izvještaji i statistika
            </h2>
            <div className="text-[10px] text-gray-400 font-bold uppercase tracking-widest underline decoration-dotted">Školska godina 2023/2024</div>
        </div>
        
        <div className="flex gap-4 overflow-x-auto">
            {(['GENERAL', 'STUDENTS', 'CLASSES', 'SUBJECTS', 'ABSENCES', 'FINAL_GRADES', 'MEASURES', 'EXPERT', 'MEETINGS'] as ReportTab[]).map((tab) => (
               <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={cn(
                    "px-4 py-2 text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-colors border-b-2",
                    activeTab === tab ? "border-[#005c8d] text-[#005c8d]" : "border-transparent text-gray-500 hover:text-gray-800"
                  )}
               >
                 {tab === 'GENERAL' ? 'Opći izvještaj' : 
                  tab === 'STUDENTS' ? 'Po učeniku' : 
                  tab === 'CLASSES' ? 'Po razredu' : 
                  tab === 'SUBJECTS' ? 'Po predmetu' : 
                  tab === 'ABSENCES' ? 'Izostanci' : 
                  tab === 'FINAL_GRADES' ? 'Zaključne ocjene' :
                  tab === 'MEASURES' ? 'Pedagoške mjere' :
                  tab === 'EXPERT' ? 'Stručna služba' :
                  'Roditeljski sastanci'}
               </button>
            ))}
        </div>
      </div>

      <div className="p-6 overflow-auto">
        {loading ? (
           <div className="py-12 text-center text-sm font-bold text-gray-400">Učitavanje...</div>
        ) : activeTab === 'GENERAL' ? (
        <>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-0 border border-gray-300 divide-x divide-gray-300 mb-8 shadow-sm">
          <div className="bg-white p-6">
            <div className="flex items-center justify-between mb-4">
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100 pb-1">Ukupno učenika</span>
              <Users size={16} className="text-blue-500" />
            </div>
            <div className="text-4xl font-black text-gray-900 leading-none">{stats.totalStudents}</div>
            <div className="text-[9px] text-gray-400 font-bold uppercase mt-2 tracking-tighter">U svim razrednim odjelima škole</div>
          </div>

          <div className="bg-white p-6">
            <div className="flex items-center justify-between mb-4">
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100 pb-1">Prosjek škole</span>
              <Award size={16} className="text-green-500" />
            </div>
            <div className="text-4xl font-black text-green-700 leading-none">{stats.avgGrade}</div>
            <div className="text-[9px] text-green-600 font-bold uppercase mt-2 tracking-tighter">Kumulativni prosjek sustava</div>
          </div>

          <div className="bg-white p-6">
            <div className="flex items-center justify-between mb-4">
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100 pb-1">Ukupno izostanaka</span>
              <AlertTriangle size={16} className="text-orange-500" />
            </div>
            <div className="text-4xl font-black text-orange-700 leading-none">{stats.totalAbsences}</div>
            <div className="text-[9px] text-orange-600 font-bold uppercase mt-2 tracking-tighter">Ukupan broj evidentiranih sati</div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white p-5 border border-gray-300">
            <div className="text-[10px] font-black text-gray-400 uppercase mb-8 border-b border-gray-200 pb-2 flex items-center gap-2">
              <TrendingUp size={14} className="text-[#005c8d]" />
              Distribucija ocjena (1-5) - sustav e-Dnevnik
            </div>
            <div className="flex items-end justify-around h-64 gap-1 px-4">
              {stats.gradesDistribution.map((count, i) => {
                const max = Math.max(...stats.gradesDistribution, 1);
                const height = (count / max) * 100;
                return (
                  <div key={i} className="flex-1 flex flex-col items-center group">
                    <div className="text-[10px] font-black text-gray-900 mb-1 opacity-0 group-hover:opacity-100 transition-opacity">{count}</div>
                    <div 
                      className={cn(
                        "w-full transition-all duration-300 border-x border-t",
                        i === 0 ? "bg-red-500 border-red-700" : i === 4 ? "bg-green-600 border-green-800" : "bg-[#005c8d] border-[#004a70]"
                      )}
                      style={{ height: `${height}%` }}
                    ></div>
                    <div className="mt-2 text-sm font-black text-white bg-gray-900 w-full text-center py-1 border border-gray-900">{i + 1}</div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-white border border-gray-300 flex flex-col items-center justify-center p-12 text-center">
             <div className="w-24 h-24 border-8 border-blue-50 flex items-center justify-center mb-6">
                <div className="text-4xl font-black text-[#005c8d]">{stats.avgGrade}</div>
             </div>
             <div className="text-[11px] font-black text-[#005c8d] uppercase tracking-widest mb-2">Opći uspjeh škole</div>
             <div className="h-px w-12 bg-gray-200 mb-4"></div>
             <p className="text-[11px] text-gray-500 font-bold uppercase tracking-tight leading-relaxed max-w-xs">
                Izračunato na temelju svih upisanih i zaključenih ocjena u tekućoj školskoj godini.
             </p>
             <button className="mt-8 px-6 py-2 border border-[#005c8d] text-[#005c8d] text-[10px] font-black uppercase tracking-widest hover:bg-[#005c8d] hover:text-white transition-all">Ispiši izvještaj</button>
          </div>
        </div>
        </>
        ) : activeTab === 'ABSENCES' ? (
           <div className="bg-white border border-gray-300 p-6">
               <h3 className="text-[11px] font-black text-gray-400 uppercase tracking-widest mb-6 border-b border-gray-200 pb-2">Status izostanaka</h3>
               <div className="h-80 w-full flex justify-center">
                   <ResponsiveContainer width="100%" height="100%">
                       <RechartsPieChart>
                           <Tooltip formatter={(value: any, name: any) => [`${value} sati`, name]} />
                           <Pie data={reportData} dataKey="count" nameKey="status" cx="50%" cy="50%" outerRadius={100} label>
                               {reportData.map((entry, index) => (
                                   <Cell key={`cell-${index}`} fill={entry.color} />
                               ))}
                           </Pie>
                       </RechartsPieChart>
                   </ResponsiveContainer>
               </div>
           </div>
        ) : activeTab === 'MEASURES' ? (
            <div className="bg-white border border-gray-300 shadow-sm rounded-md p-6 space-y-4">
                <div className="border-b pb-2">
                    <h3 className="text-sm font-black text-slate-900 uppercase">Izvještaj o pedagoškim mjerama</h3>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight mt-0.5">Sve evidentirane pohvale, opomene i odluke vijeća</p>
                </div>
                {reportData.length === 0 ? (
                    <div className="p-8 text-center text-xs font-bold text-gray-400 uppercase">Nema evidentiranih pedagoških mjera.</div>
                ) : (
                    <div className="space-y-4">
                        {reportData.map((row, i) => (
                            <div key={i} className="border border-gray-200 p-4 rounded bg-slate-50/40 relative">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded ${
                                          row.measure_type === 'Pohvala' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                                        }`}>
                                          {row.measure_type}
                                        </span>
                                        <span className="ml-2 text-xs font-black text-slate-900">
                                            Učenik: {row.user_profiles?.name || 'Nepoznato'}
                                        </span>
                                    </div>
                                    <span className="text-[10px] text-slate-400 font-bold uppercase">
                                        {new Date(row.date).toLocaleDateString('hr-HR')}
                                    </span>
                                </div>
                                <p className="text-xs text-slate-700 font-semibold italic mt-2 whitespace-pre-wrap">
                                    "{row.explanation}"
                                </p>
                                <div className="mt-2 pt-2 border-t border-dashed flex gap-4 text-[9px] text-slate-400 font-bold uppercase tracking-wider">
                                    <span>Donositelj: <span className="text-slate-700">{row.issuer}</span></span>
                                    {row.document_number && <span>Dokument: <span className="text-slate-700">{row.document_number}</span></span>}
                                    <span>Status: <span className="text-slate-700">{row.status === 'ACTIVE' ? 'Aktivna' : 'Arhivirana'}</span></span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
         ) : activeTab === 'EXPERT' ? (
            <div className="bg-white border border-gray-300 shadow-sm rounded-md p-6 space-y-4">
                <div className="border-b pb-2">
                    <h3 className="text-sm font-black text-slate-900 uppercase">Izvještaj o radu stručne službe</h3>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight mt-0.5">Pregled stručnih razgovora, procjena i planova podrške</p>
                </div>
                {reportData.length === 0 ? (
                    <div className="p-8 text-center text-xs font-bold text-gray-400 uppercase">Nema evidentiranih aktivnosti stručne službe.</div>
                ) : (
                    <div className="space-y-4">
                        {reportData.map((row, i) => (
                            <div key={i} className="border border-gray-200 p-4 rounded bg-white space-y-3">
                                <div className="flex justify-between items-center bg-slate-50 p-2 rounded border">
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] font-black uppercase text-[#005c8d] bg-[#005c8d]/10 px-2 py-0.5 rounded border border-[#005c8d]/20">
                                            {row.activity_type}
                                        </span>
                                        <span className="text-xs font-black text-slate-800">
                                            Učenik: {row.user_profiles?.name || 'Nepoznato'}
                                        </span>
                                    </div>
                                    <span className="text-[10px] text-slate-400 font-bold uppercase">
                                        {new Date(row.date).toLocaleDateString('hr-HR')}
                                    </span>
                                </div>
                                <div className="text-xs space-y-2">
                                    <p className="text-slate-700 font-medium whitespace-pre-wrap"><span className="text-[10px] font-black uppercase text-slate-400 block">Sadržaj rada:</span> {row.description}</p>
                                    {row.conclusion && <p className="text-slate-800 font-bold whitespace-pre-wrap"><span className="text-[10px] font-black uppercase text-slate-400 block">Zaključak:</span> {row.conclusion}</p>}
                                    {row.recommendation && <p className="text-emerald-900 font-black whitespace-pre-wrap bg-emerald-50/50 p-2 border border-emerald-100 italic">⭐ "{row.recommendation}"</p>}
                                </div>
                                <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider pt-1 border-t">
                                    Evidentirao: {row.staff_name} <span className="text-slate-300">|</span> Profil: {row.staff_role}
                                </p>
                            </div>
                        ))}
                    </div>
                )}
            </div>
         ) : activeTab === 'MEETINGS' ? (
            <div className="bg-white border border-gray-300 shadow-sm rounded-md p-6 space-y-4">
                <div className="border-b pb-2">
                    <h3 className="text-sm font-black text-slate-900 uppercase">Roditeljski sastanci i individualni razgovori</h3>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight mt-0.5">Zapisnici sastanaka, informativki i dolazaka roditelja</p>
                </div>
                {reportData.length === 0 ? (
                    <div className="p-8 text-center text-xs font-bold text-gray-400 uppercase">Nema evidentiranih sastanaka, razgovora ili dolazaka roditelja.</div>
                ) : (
                    <div className="space-y-3">
                        {reportData.map((row, i) => (
                            <div key={i} className="border border-gray-200 p-4 rounded bg-slate-50/50">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded ${
                                          row.rType === 'Sastanak' ? 'bg-indigo-100 text-indigo-800' :
                                          row.rType === 'Dolazak' ? 'bg-orange-100 text-orange-850' :
                                          'bg-blue-100 text-blue-800'
                                        }`}>
                                          {row.rType}
                                        </span>
                                        <h4 className="text-xs font-black text-slate-900 mt-2">{row.displayTitle}</h4>
                                    </div>
                                    <span className="text-[10px] text-slate-400 font-bold uppercase">
                                        {new Date(row.dateStr).toLocaleDateString('hr-HR')}
                                    </span>
                                </div>
                                {row.notes && (
                                    <p className="text-xs text-slate-700 italic font-semibold mt-2 whitespace-pre-wrap">
                                        "{row.notes}"
                                    </p>
                                )}
                                {row.minutes && (
                                    <p className="text-xs text-slate-700 mt-2 whitespace-pre-wrap font-medium">
                                        <span className="text-[10px] font-black uppercase text-slate-400 block mb-0.5">Zapisnik sjednice / detalji:</span>
                                        {row.minutes}
                                    </p>
                                )}
                                <div className="mt-3 pt-2 border-t border-dashed text-[9px] text-slate-400 font-bold uppercase tracking-wider flex justify-between">
                                    <span>Sudionik / Voditelj: <span className="text-slate-700">{row.person || row.parent_name || 'Nije specificirano'}</span></span>
                                    {row.time && <span>Vrijeme: <span className="text-slate-500">{row.time} sati</span></span>}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
         ) : (
           <div className="bg-white border border-gray-300 shadow-sm overflow-hidden">
               <table className="w-full text-left border-collapse">
                   <thead>
                       <tr className="bg-[#f8fafc] border-b border-gray-300">
                           <th className="px-4 py-3 text-[10px] font-black text-gray-500 uppercase tracking-widest">Naziv</th>
                           <th className="px-4 py-3 text-[10px] font-black text-gray-500 uppercase tracking-widest text-right">Prosjek ocjena</th>
                           {activeTab === 'STUDENTS' && <th className="px-4 py-3 text-[10px] font-black text-gray-500 uppercase tracking-widest text-right">Izostanci</th>}
                       </tr>
                   </thead>
                   <tbody className="divide-y divide-gray-200">
                       {reportData.map((row, i) => (
                           <tr key={i} className="hover:bg-gray-50">
                               <td className="px-4 py-3 text-[12px] font-bold text-gray-900 border-r border-gray-100">{row.name}</td>
                               <td className="px-4 py-3 text-[12px] font-bold text-[#005c8d] text-right border-r border-gray-100">{row.avg > 0 ? row.avg : '—'}</td>
                               {activeTab === 'STUDENTS' && <td className="px-4 py-3 text-[12px] font-bold text-orange-600 text-right">{row.absences || '0'}</td>}
                           </tr>
                       ))}
                       {reportData.length === 0 && (
                           <tr><td colSpan={3} className="px-4 py-8 text-center text-gray-400 text-sm">Nema podataka za prikaz</td></tr>
                       )}
                   </tbody>
               </table>
           </div>
        )}
      </div>
    </div>
  );
}
