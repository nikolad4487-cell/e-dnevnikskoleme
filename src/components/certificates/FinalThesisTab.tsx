import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { toast } from 'react-hot-toast';
import { FileText, Loader2 } from 'lucide-react';
import { generateFinalWorkCertificatePDF } from '../../lib/pdfGenerator';
import { useSelection } from '../../contexts/SelectionContext';

export const FinalThesisTab = () => {
    const { selectedClassId } = useSelection();
    const [students, setStudents] = useState<any[]>([]);
    const [selectedStudent, setSelectedStudent] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [finalThesisData, setFinalThesisData] = useState<any>(null);

    useEffect(() => {
        if (!selectedClassId) return;
        const fetchStudents = async () => {
            const { data } = await supabase
                .from('user_profiles')
                .select('*')
                .eq('role', 'STUDENT')
                .eq('class_id', selectedClassId);
            setStudents(data || []);
        };
        fetchStudents();
    }, [selectedClassId]);

    useEffect(() => {
        if (!selectedStudent) return;
        const fetchThesis = async () => {
            const { data } = await supabase
                .from('final_thesis')
                .select('*')
                .eq('student_id', selectedStudent.id)
                .maybeSingle();
            setFinalThesisData(data);
        };
        fetchThesis();
    }, [selectedStudent]);

    const handleGenerate = async () => {
        if (!selectedStudent) return;
        if (!finalThesisData) {
            toast.error("Nisu uneseni podaci završnog rada.");
            return;
        }

        setLoading(true);

        const globalData = {
           schoolName: "Ugostiteljsko-turističko učilište, Zagreb",
           oib: "83456348759",
           klasa: "602-03/24-03/1",
           urbroj: "251-300-01-24-3-3a-04",
           certificatePlace: "Zagreb",
           date: "14.6.2024.",
           schoolYear: "2023/2024",
        };
        
        const getDesc = (val: number) => {
            switch(val) {
                case 1: return 'nedovoljan';
                case 2: return 'dovoljan';
                case 3: return 'dobar';
                case 4: return 'vrlo dobar';
                case 5: return 'odličan';
                default: return 'nedovoljan';
            }
        };

        const doc = await generateFinalWorkCertificatePDF(selectedStudent, {
            ...globalData,
            studentName: selectedStudent.name,
            studentOib: selectedStudent.oib,
            thesisTitle: finalThesisData.thesis_title,
            creationGrade: finalThesisData.creation_grade ? `${getDesc(finalThesisData.creation_grade)} (${finalThesisData.creation_grade})` : '-',
            defenseGrade: finalThesisData.defense_grade ? `${getDesc(finalThesisData.defense_grade)} (${finalThesisData.defense_grade})` : '-',
            overallSuccess: finalThesisData.final_grade ? `${getDesc(finalThesisData.final_grade)} (${finalThesisData.final_grade})` : '-',
            programName: finalThesisData.program_name || 'Kuhar' // Fallback
        });
        
        doc.save(`svjedodzba_zavrsni_rad_${selectedStudent.name}.pdf`);
        setLoading(false);
    };

    return (
        <div className="p-6">
            <h2 className="text-lg font-bold mb-4">Svjedodžba o završnome radu</h2>
            <div className="flex gap-4 mb-4">
                 <select className="border p-2" onChange={(e) => setSelectedStudent(students.find(s => s.id === e.target.value))}>
                    <option value="">Odaberi učenika</option>
                    {students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <button onClick={handleGenerate} className="bg-blue-600 text-white px-4 py-2 flex items-center gap-2" disabled={!selectedStudent || loading}>
                    {loading ? <Loader2 className="animate-spin" /> : <FileText size={16} />} Generiraj potvrdu
                </button>
            </div>
            {selectedStudent && !finalThesisData && <p className="text-red-500">Nisu uneseni podaci završnog rada.</p>}
        </div>
    );
};
