import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useSelection } from '../../contexts/SelectionContext';
import { BarChart3, PieChart, TrendingUp, Users, Award, AlertTriangle } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Role } from '../../types';

export default function IzvjestajiPage() {
  const { classId: routeClassId } = useParams<{ classId: string }>();
  const { selectedSchoolId, selectedClassId: contextClassId } = useSelection();
  
  const effectiveClassId = contextClassId || routeClassId;

  const [stats, setStats] = useState({
    totalStudents: 0,
    avgGrade: 0,
    totalAbsences: 0,
    gradesDistribution: [0, 0, 0, 0, 0] // 1-5
  });

  useEffect(() => {
    const fetchData = async () => {
      // Students count
      let studentsQ = supabase.from('student_class_enrollments').select('id', { count: 'exact', head: true }).eq('status', 'ACTIVE');
      if (effectiveClassId) {
        studentsQ = studentsQ.eq('class_id', effectiveClassId);
      } else if (selectedSchoolId) {
        studentsQ = studentsQ.eq('school_id', selectedSchoolId);
      }
      const { count: studentsCount } = await studentsQ;

      // Grades
      let gradeQ = supabase.from('grades').select('value');
      if (effectiveClassId) {
        gradeQ = gradeQ.eq('class_id', effectiveClassId);
      } else if (selectedSchoolId) {
        gradeQ = gradeQ.eq('school_id', selectedSchoolId);
      }
      const { data: gradesData } = await gradeQ;

      // Absences count
      let absenceQ = supabase.from('absences').select('id', { count: 'exact', head: true });
      if (effectiveClassId) {
        absenceQ = absenceQ.eq('class_id', effectiveClassId);
      } else if (selectedSchoolId) {
        absenceQ = absenceQ.eq('school_id', selectedSchoolId);
      }
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
    };
    fetchData();
  }, [selectedSchoolId, effectiveClassId]);

  return (
    <div className="flex flex-col h-full bg-white font-sans">
      <div className="bg-[#f8fafc] border-b border-gray-300 px-4 py-2 flex items-center justify-between">
        <h2 className="text-sm font-black text-[#005c8d] flex items-center gap-2 uppercase tracking-widest leading-none">
          <BarChart3 size={16} />
          Izvještaji i statistika
        </h2>
        <div className="text-[10px] text-gray-400 font-bold uppercase tracking-widest underline decoration-dotted">Školska godina 2023/2024</div>
      </div>

      <div className="p-6 overflow-auto">
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
      </div>
    </div>
  );
}
