import React from 'react';
import { useParams } from 'react-router-dom';

export default function StudentSubjectDetail() {
  const { studentId, subjectId } = useParams();
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">Učenik: {studentId}, Predmet: {subjectId}</h1>
      <div>Detalji predmeta (ocjene, bilješke, unos)</div>
    </div>
  );
}
