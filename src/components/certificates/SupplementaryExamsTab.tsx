
import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { toast } from 'react-hot-toast';
import { FileText } from 'lucide-react';
import { generateExamCertificatePDF } from '../../lib/pdfGenerator';

export const SupplementaryExamsTab = () => {
    const [selectedStudent, setSelectedStudent] = useState<any>(null);
    const [gradeLevel, setGradeLevel] = useState<number>(1);
    const [loading, setLoading] = useState(false);

    const handleGenerate = async () => {
        if (!selectedStudent) {
            toast.error("Odaberite učenika.");
            return;
        }

        setLoading(true);

        const { data: exams, error } = await supabase
            .from('exams')
            .select('*, subjects(name)')
            .eq('student_id', selectedStudent.id)
            .eq('exam_grade_level', gradeLevel)
            .in('exam_type', ['DIFFERENCE', 'SUPPLEMENTARY', 'REMEDIAL']);

        if (error) {
            toast.error("Greška pri dohvaćanju ispita.");
            setLoading(false);
            return;
        }

        // Need school data as well... for now use basic
        const globalData = {
            schoolName: "Naziv škole",
            place: "Zagreb",
            date: new Date().toLocaleDateString('hr-HR')
        };
        
        const doc = await generateExamCertificatePDF(selectedStudent, exams || [], globalData, gradeLevel);
        doc.save(`potvrda_ispiti_${selectedStudent.name}.pdf`);
        setLoading(false);
    };

    return (
        <div className="p-6">
            <h2 className="text-lg font-bold mb-4">Generiranje potvrde o ispitima</h2>
            <div className="flex gap-4 mb-4">
                <input type="text" placeholder="Ime učenika..." className="border p-2" onChange={(e) => {
                    // search logic
                }} />
                <select value={gradeLevel} onChange={(e) => setGradeLevel(parseInt(e.target.value))} className="border p-2">
                    <option value={1}>1. razred</option>
                    <option value={2}>2. razred</option>
                    <option value={3}>3. razred</option>
                    <option value={4}>4. razred</option>
                </select>
                <button onClick={handleGenerate} className="bg-blue-600 text-white px-4 py-2 flex items-center gap-2">
                    <FileText size={16} /> Generiraj potvrdu
                </button>
            </div>
        </div>
    );
};
