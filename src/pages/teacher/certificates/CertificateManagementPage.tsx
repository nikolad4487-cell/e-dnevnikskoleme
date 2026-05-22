import React, { useState, useEffect } from 'react';
import { FileText, Printer, Lock, Unlock, Loader2, Award, User } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { toast } from 'react-hot-toast';
import { generateClassCertificatePDF } from '../../../lib/pdfGenerator';
import { StudentDocument } from '../../../types/certificates';
import { CertificateData } from '../../../lib/pdfGenerator';
import { useSelection } from '../../../contexts/SelectionContext';


export default function CertificateManagementPage() {
  const { currentClass } = useSelection();
  const [activeTab, setActiveTab] = useState('CLASS_CERTIFICATES');
  const [students, setStudents] = useState<any[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<any>(null);
  const [activeStudentTab, setActiveStudentTab] = useState('BASIC');
  const [loading, setLoading] = useState(false);

  const studentTabs = [
      { id: 'BASIC', label: 'Osnovni podaci' },
      { id: 'GRADES', label: 'Ocjene' },
      { id: 'ABSENCES', label: 'Izostanci' },
      { id: 'CONDUCT', label: 'Vladanje' },
      { id: 'OVERALL', label: 'Opći uspjeh' },
  ];

  useEffect(() => {
    fetchStudents();
  }, [activeTab, currentClass]);

  const fetchStudents = async () => {
    if (!currentClass?.id) {
       toast.error("Nije odabran razred.");
       return;
    }
    setLoading(true);

    // Debug logging
    console.log("CERTIFICATES CURRENT CLASS", currentClass);
    console.log("CERTIFICATES CLASS ID", currentClass?.id);

    const { data: students, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('role', 'STUDENT')
      .eq('class_id', currentClass.id)
      .order('first_name', { ascending: true });

    console.log("CERTIFICATES STUDENTS RESULT", students);
    console.log("CERTIFICATES STUDENTS ERROR", error);

    if (error) {
      console.error("LOAD STUDENTS ERROR", error);
      toast.error("Greška pri učitavanju učenika: " + error.message);
    } else {
      setStudents(students || []);
    }
    setLoading(false);
  };

  const handleLockData = async (student: any) => {
    // 1. Snapshot logic, 2. PDF Gen, 3. Update Status
    toast.success('Podaci zaključani.');
  };

  return (
    <div className="p-6 h-screen flex flex-col">
      <h1 className="text-2xl font-bold mb-6">Svjedodžbe i dokumenti</h1>
      
      <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
        {['CLASS_CERTIFICATES', 'FINAL_CERTIFICATES', 'FINAL_THESIS', 'EXAMS'].map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)} className={`py-2 px-4 rounded font-bold uppercase text-[10px] ${activeTab === tab ? 'bg-[#005c8d] text-white' : 'bg-gray-100 text-gray-600'}`}>
                {tab.replace('_', ' ')}
            </button>
        ))}
      </div>

      <div className="flex flex-1 gap-6 overflow-hidden">
        {/* Sidebar */}
        <div className="w-1/3 bg-white border rounded shadow-sm overflow-y-auto">
          {students.map(s => (
            <div key={s.id} onClick={() => setSelectedStudent(s)} className={`p-4 border-b cursor-pointer hover:bg-gray-50 ${selectedStudent?.id === s.id ? 'bg-blue-50' : ''}`}>
              <p className="font-semibold">{s.first_name} {s.last_name}</p>
            </div>
          ))}
        </div>

        {/* Main Content */}
        <div className="flex-1 bg-white border rounded shadow-sm p-6 overflow-y-auto">
          {selectedStudent ? (
            <div>
                <h2 className="text-xl font-bold mb-4">{selectedStudent.first_name} {selectedStudent.last_name}</h2>
                <div className="flex gap-2 mb-6">
                    <button onClick={() => generateClassCertificatePDF(selectedStudent, { schoolName: 'Probna škola', studentName: `${selectedStudent.first_name} ${selectedStudent.last_name}`, studentOib: '00000000000', grades: [], overallSuccess: 'N/A', overallAverage: 'N/A', conduct: 'N/A', date: '2026-05-22', klasa: 'N/A', urbroj: 'N/A', principalName: 'N/A' }, true).save()} className="bg-gray-100 px-4 py-2 text-[10px] uppercase font-bold flex items-center gap-2"><FileText size={14}/> Probna svjedodžba</button>
                    <button onClick={() => handleLockData(selectedStudent)} className="bg-red-600 text-white px-4 py-2 text-[10px] uppercase font-bold flex items-center gap-2"><Lock size={14}/> Zaključaj</button>
                </div>
                {/* Student Detail Tabs */}
                <div className="flex gap-2 border-b mb-4">
                  {studentTabs.map(tab => (
                      <button key={tab.id} onClick={() => setActiveStudentTab(tab.id)} className={`pb-2 px-1 text-sm font-bold ${activeStudentTab === tab.id ? 'border-b-2 border-[#005c8d] text-[#005c8d]' : 'text-gray-500'}`}>
                          {tab.label}
                      </button>
                  ))}
                </div>
                <div className="p-4 bg-gray-50 rounded">
                    {/* Content will be added here based on activeStudentTab */}
                    <p>Sadržaj za {studentTabs.find(t => t.id === activeStudentTab)?.label}</p>
                </div>
            </div>
          ) : (
            <div className="text-center py-20 text-slate-500">Odaberite učenika za prikaz detalja.</div>
          )}
        </div>
      </div>
    </div>
  );
}

