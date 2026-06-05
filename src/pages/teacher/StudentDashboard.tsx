import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';

export default function StudentDashboard() {
  const { studentId } = useParams();
  const navigate = useNavigate();
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">Učenik {studentId}</h1>
      <div className="flex gap-4 mt-4">
        <button onClick={() => {}} className="p-2 bg-blue-500 text-white">Pregled predmeta</button>
        <button onClick={() => {}} className="p-2 bg-gray-200">Bilješke</button>
      </div>
      <div>
         Pregled predmeta (za sada placeholder)
      </div>
    </div>
  );
}
