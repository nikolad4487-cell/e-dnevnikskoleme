import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useSelection } from '../../contexts/SelectionContext';
import { Absence, AbsenceStatus, Role } from '../../types';
import { cn } from '../../lib/utils';
import { UserX, Clock, CheckCircle2, XCircle, Info } from 'lucide-react';

export default function IzostanciPage() {
  const { user } = useAuth();
  const { selectedClassId, selectedChildId } = useSelection();
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !selectedClassId) return;
    const fetchAbsences = async () => {
      setLoading(true);
      try {
        const isParent = user.globalRole === Role.PARENT;
        const targetStudentId = isParent ? selectedChildId : user.id;

        if (!targetStudentId) {
          setLoading(false);
          return;
        }

        const { data, error } = await supabase
          .from('absences')
          .select('*')
          .eq('student_id', targetStudentId)
          .eq('class_id', selectedClassId)
          .order('date', { ascending: false });
        
        if (error) throw error;
        setAbsences(data || []);
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };
    fetchAbsences();
  }, [user, selectedClassId, selectedChildId]);

  const stats = {
    total: absences.length,
    justified: absences.filter(a => a.status === AbsenceStatus.OPRAVDANO).length,
    unjustified: absences.filter(a => a.status === AbsenceStatus.NEOPRAVDANO).length,
    pending: absences.filter(a => a.status === AbsenceStatus.PENDING).length,
  };

  return (
    <div className="flex flex-col h-full bg-gray-50/30">
      <div className="bg-gray-50 border-b border-gray-200 p-4">
        <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
          <UserX size={20} className="text-[#005c8d]" />
          Pregled izostanaka
        </h2>
      </div>

      <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 border border-gray-200 rounded shadow-sm text-center">
          <div className="text-[10px] font-bold text-gray-400 uppercase mb-1">UKUPNO</div>
          <div className="text-2xl font-black text-[#005c8d]">{stats.total}</div>
        </div>
        <div className="bg-white p-4 border border-gray-200 rounded shadow-sm text-center">
          <div className="text-[10px] font-bold text-gray-400 uppercase mb-1">OPRAVDANO</div>
          <div className="text-2xl font-black text-green-600">{stats.justified}</div>
        </div>
        <div className="bg-white p-4 border border-gray-200 rounded shadow-sm text-center">
          <div className="text-[10px] font-bold text-gray-400 uppercase mb-1">NEOPRAVDANO</div>
          <div className="text-2xl font-black text-red-600">{stats.unjustified}</div>
        </div>
        <div className="bg-white p-4 border border-gray-200 rounded shadow-sm text-center">
          <div className="text-[10px] font-bold text-gray-400 uppercase mb-1">ČEKA</div>
          <div className="text-2xl font-black text-orange-500">{stats.pending}</div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {loading ? (
          <div className="text-center py-8">Učitavanje podataka...</div>
        ) : (
          <div className="bg-white border border-gray-200 rounded overflow-hidden shadow-sm">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="p-3 font-bold text-gray-700 w-40">DATUM</th>
                  <th className="p-3 font-bold text-gray-700">NAPOMENA I STATUS</th>
                  <th className="p-3 font-bold text-gray-700 text-right w-32">DETALJI</th>
                </tr>
              </thead>
              <tbody>
                {absences.map((abs) => (
                  <tr key={abs.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="p-3 font-medium">
                      {new Date(abs.date).toLocaleDateString('hr-HR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        {abs.status === AbsenceStatus.PENDING && <Clock size={16} className="text-orange-500" />}
                        {abs.status === AbsenceStatus.OPRAVDANO && <CheckCircle2 size={16} className="text-green-600" />}
                        {abs.status === AbsenceStatus.NEOPRAVDANO && <XCircle size={16} className="text-red-500" />}
                        
                        <span className={cn(
                          "font-bold uppercase text-[10px] px-2 py-0.5 rounded-full",
                          abs.status === AbsenceStatus.PENDING ? "bg-orange-50 text-orange-600 border border-orange-200" :
                          abs.status === AbsenceStatus.OPRAVDANO ? "bg-green-50 text-green-700 border border-green-200" :
                          "bg-red-50 text-red-700 border border-red-200"
                        )}>
                          {abs.status}
                        </span>
                        
                        <span className="text-gray-500 ml-2 italic text-xs">"{abs.note || 'Nema napomene'}"</span>
                      </div>
                    </td>
                    <td className="p-3 text-right">
                      <button className="text-[#005c8d] p-1 hover:bg-blue-50 rounded"><Info size={18} /></button>
                    </td>
                  </tr>
                ))}
                
                {absences.length === 0 && (
                  <tr>
                    <td colSpan={3} className="p-12 text-center text-gray-400 italic">Nema evidentiranih izostanaka. Čestitamo!</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="p-4 bg-white border-t border-gray-200 text-[10px] text-gray-400 font-bold uppercase flex justify-between">
        <div>Zadnja sinkronizacija: {new Date().toLocaleDateString('hr-HR')}</div>
        <div>e-Dnevnik v2.0</div>
      </div>
    </div>
  );
}
