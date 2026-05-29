import React from 'react';

export default function StudentsPage() {
  console.log("Rendering StudentsPage");
  return (
    <div className="p-8 font-sans">
      <h1 className="text-xl font-black text-slate-950 uppercase tracking-tighter mb-4">Učenici u školi</h1>
      <p className="text-sm text-slate-600">Upravljanje svim učenicima u školi.</p>
    </div>
  );
}
