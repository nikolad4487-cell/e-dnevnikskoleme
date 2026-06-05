import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';

export default function StudentSubjectDetail() {
  const { classId, studentId, subjectId } = useParams();
  const navigate = useNavigate();

  return (
    <div className="p-6 bg-white h-full">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">1. IVAN HORVAT</h1>
        <div className="flex gap-2">
            <button className="px-4 py-2 bg-gray-200 font-bold text-xs uppercase" onClick={() => navigate(-1)}>← PRETHODNI (nije imp)</button>
            <button className="px-4 py-2 bg-gray-200 font-bold text-xs uppercase">SLUČAJNI ODABIR</button>
            <button className="px-4 py-2 bg-gray-200 font-bold text-xs uppercase">SLJEDEĆI → (nije imp)</button>
        </div>
      </div>
      <h2 className="text-sm text-gray-500 font-bold mb-6 uppercase tracking-wider">UČENIČKA KARTICA - {subjectId?.toUpperCase()}</h2>
      
      <div className="flex gap-8">
        <div className="w-64">
           {/* Sidebar */}
           <div className="flex flex-col gap-2">
            <button className="text-left p-2 font-bold hover:bg-gray-100" onClick={() => navigate(`/class/${classId}/imenik`)}>Imenik učenika</button>
            <button className="text-left p-2 font-bold hover:bg-gray-100" onClick={() => navigate(`/class/${classId}/student/${studentId}`)}>Pregled predmeta</button>
            <button className="text-left p-2 font-bold hover:bg-gray-100">Bilješke</button>
            <hr className="my-2" />
            <div className="font-bold text-xs uppercase text-gray-500 mb-2">Radnje</div>
            <button className="text-left p-2 font-bold text-xs text-blue-600 hover:bg-gray-100">Grupni unos ocjena</button>
            <button className="text-left p-2 font-bold text-xs text-blue-600 hover:bg-gray-100">Grupni unos bilješki</button>
            <hr className="my-2" />
            <button onClick={() => navigate(`/class/${classId}/imenik`)} className="text-left p-2 font-bold border hover:bg-gray-100">Zatvori karticu</button>
           </div>
        </div>
        <div className="flex-1">
          {/* Grades Table Placeholder */}
          <table className="w-full border-collapse border mb-8">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="p-3 text-left">ELEMENTI VREDNOVANJA</th>
                <th className="p-3">IX</th>
                <th className="p-3">X</th>
                <th className="p-3">XI</th>
                <th className="p-3">XII</th>
                <th className="p-3">I</th>
                <th className="p-3">II</th>
                <th className="p-3">III</th>
                <th className="p-3">IV</th>
                <th className="p-3">V</th>
                <th className="p-3">VI</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="p-3 border-r">jezik</td>
                {Array(10).fill(0).map((_, i) => <td key={i} className="border-r"></td>)}
              </tr>
            </tbody>
          </table>
          <div className="text-sm font-bold">ARITMETIČKA SREDINA: 0.00</div>
        </div>
      </div>
    </div>
  );
}
