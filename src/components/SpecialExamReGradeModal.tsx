import React, { useState } from 'react';
import { X } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '../lib/supabase'; // Assuming this is where it is, need to check

export const SpecialExamReGradeModal = ({ isOpen, onClose, student, subject, exams, finalGrade, onRefresh }: any) => {
    const [selectedGrade, setSelectedGrade] = useState<number>(0);
    const [saving, setSaving] = useState(false);

    const handleSave = async () => {
        if (selectedGrade === 0) {
            toast.error("Molimo odaberite ocjenu.");
            return;
        }
        setSaving(true);
        const payload = {
            student_id: student.id,
            subject_id: subject.id,
            class_id: finalGrade.class_id,
            teacher_id: finalGrade.teacher_id,
            school_year_id: finalGrade.school_year_id,
            period: finalGrade.period, // FIRST_TERM or SECOND_TERM
            term: finalGrade.period, // term should be the same as period
            value: selectedGrade.toString(),
            updated_at: new Date().toISOString()
        };
        
        console.log("UPSERT FINAL GRADE PAYLOAD", payload);
        console.log("UPSERT FINAL GRADE ON CONFLICT", "student_id,subject_id,class_id,school_year_id,period");

        let error: any = null;
        try {
            const { error: upsertKeyError } = await supabase
              .from('final_grades')
              .upsert(payload, {
                onConflict: 'student_id,subject_id,class_id,school_year_id,period'
              });

            if (upsertKeyError && upsertKeyError.code === '42P10') {
              console.warn("DB UNIQUE CONSTRAINT MISSING. Running fallback select-then-write...");
              const { data: existing, error: fe } = await supabase
                .from('final_grades')
                .select('id')
                .eq('student_id', student.id)
                .eq('subject_id', subject.id)
                .eq('class_id', finalGrade.class_id)
                .eq('period', finalGrade.period)
                .maybeSingle();

              if (fe) {
                error = fe;
              } else if (existing) {
                const { error: updError } = await supabase
                  .from('final_grades')
                  .update(payload)
                  .eq('id', existing.id);
                error = updError;
              } else {
                const { error: insError } = await supabase
                  .from('final_grades')
                  .insert([payload]);
                error = insError;
              }
            } else {
              error = upsertKeyError;
            }
        } catch (err: any) {
            error = err;
        }
        
        console.log("FINAL GRADE ERROR", error);
        if (error) {
            toast.error("Greška pri spremanju.");
            setSaving(false);
            return;
        }
        toast.success("Zaključna ocjena ažurirana.");
        onRefresh();
        setSaving(false);
        onClose();
    };

    if (!isOpen) return null;

    const avg = exams.reduce((acc: number, exam: any) => acc + exam.grade, 0) / exams.length;

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-none flex items-center justify-center z-[300] p-4 text-center">
            <div className="bg-white max-w-lg w-full relative overflow-hidden border border-gray-400">
                <div className="p-2 bg-[#005c8d] text-white flex justify-between items-center text-[11px] font-bold uppercase">
                    <h3>ZAKLJUČI OCJENU</h3>
                    <button onClick={onClose}><X size={16}/></button>
                </div>
                <div className="p-6 space-y-4 text-left">
                    <div className="font-bold text-sm text-[#005c8d] border-b pb-2 mb-2">{student.name} - {subject.name}</div>
                    <table className="w-full text-xs text-left">
                        <thead><tr className="text-gray-400 uppercase"><th>Vrsta</th><th>Datum</th><th>Ocjena</th></tr></thead>
                        <tbody>
                            {exams.map((e:any, i:number) => (
                                <tr key={i}><td>{e.type}</td><td>{e.date}</td><td className="font-bold">{e.grade}</td></tr>
                            ))}
                        </tbody>
                    </table>
                    <div className="text-xs font-bold mt-2">Aritmetički prosjek ispita: {avg.toFixed(2)}</div>
                    <div className="space-y-1 mt-4">
                        <label className="text-[10px] font-bold uppercase text-gray-400">Nova zaključna ocjena</label>
                        <select value={selectedGrade} onChange={e => setSelectedGrade(Number(e.target.value))} className="w-full border p-2 text-[11px] font-bold">
                            <option value="0">Odaberi...</option>
                            {[1,2,3,4,5].map(v => <option key={v} value={v}>{v}</option>)}
                        </select>
                    </div>
                    <button onClick={handleSave} disabled={saving} className="w-full py-2 bg-[#005c8d] text-white font-bold uppercase text-[11px]">Spremi zaključnu ocjenu</button>
                    <div className="text-[9px] text-gray-500 italic text-center">* Automatski prosjek ispita služi samo kao pomoć pri odabiru.</div>
                </div>
            </div>
        </div>
    );
};
