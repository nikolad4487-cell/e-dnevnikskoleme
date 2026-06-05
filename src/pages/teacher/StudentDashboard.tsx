import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { Loader2 } from 'lucide-react';

export default function StudentDashboard() {
  const { classId, studentId } = useParams();
  const navigate = useNavigate();
  const [student, setStudent] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      if (!studentId) return;
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', studentId)
        .single();
      
      if (data) setStudent(data);
      setLoading(false);
    }
    loadData();
  }, [studentId]);

  if (loading) return <div className="p-10"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="p-6 bg-white h-full">
      <h1 className="text-3xl font-bold mb-1">{student?.full_name || student?.name}</h1>
      <h2 className="text-sm text-gray-500 font-bold mb-6 uppercase tracking-wider">UČENIČKA KARTICA - POPIS PREDMETA</h2>
      
      <div className="flex gap-8">
        <div className="w-64">
           {/* Sidebar */}
           <div className="flex flex-col gap-2">
            <button className="text-left p-2 font-bold hover:bg-gray-100">Imenik učenika</button>
            <button className="text-left p-2 font-bold bg-gray-100">Pregled predmeta</button>
            <button className="text-left p-2 font-bold hover:bg-gray-100">Bilješke</button>
            <hr className="my-2" />
            <button onClick={() => navigate(`/class/${classId}/imenik`)} className="text-left p-2 font-bold border hover:bg-gray-100">Zatvori karticu</button>
           </div>
        </div>
        <div className="flex-1">
          {/* Subjects Table - Placeholder for now */}
          <table className="w-full border-collapse border">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="p-3 text-left">NASTAVNI PREDMET</th>
                <th className="p-3 text-right">AKCIJA</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="p-3">Hrvatski jezik<br/><span className="text-xs text-gray-500">NIKOLA ĐURIĆ</span></td>
                <td className="p-3 text-right"><button onClick={() => navigate(`/class/${classId}/student/${studentId}/subject/hrvatski`)} className="text-blue-600 font-bold">PRIKAŽI OCJENE →</button></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
