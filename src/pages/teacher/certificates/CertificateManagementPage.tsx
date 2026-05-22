import React, { useState, useEffect } from 'react';
import { FileText, Printer, Lock, Unlock, Loader2, Award, User } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { toast } from 'react-hot-toast';
import { generateClassCertificatePDF } from '../../../lib/pdfGenerator';
import { StudentDocument } from '../../../types/certificates';
import { CertificateData } from '../../../lib/pdfGenerator';
import { useSelection } from '../../../contexts/SelectionContext';



function SettingsTab({ schoolId }: { schoolId?: string }) {
  const [stamp, setStamp] = useState<File | null>(null);
  const [principalSig, setPrincipalSig] = useState<File | null>(null);
  const [teacherSig, setTeacherSig] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const uploadAsset = async (file: File, type: 'stamp' | 'principal' | 'teacher') => {
    if (!schoolId) {
        toast.error("Škola nije odabrana.");
        return;
    }
    setUploading(true);
    const path = `${schoolId}/${type === 'stamp' ? 'stamps' : 'signatures'}/${file.name}`;
    const { error, data } = await supabase.storage.from('school-assets').upload(path, file, { upsert: true });
    if (error) {
        toast.error("Greška pri uploadu: " + error.message);
    } else {
        // Update settings in database
        const fieldName = type === 'stamp' ? 'stamp_url' : (type === 'principal' ? 'principal_signature_url' : 'teacher_signature_url');
        await supabase.from('school_document_settings').upsert({ school_id: schoolId, [fieldName]: path });
        toast.success("Uspješno uploadano.");
    }
    setUploading(false);
  };

  return (
    <div className="bg-white p-6 rounded shadow-sm border">
        <h2 className="text-xl font-bold mb-4">Postavke potpisa i pečata</h2>
        <div className="space-y-4">
            <div>
                <label className="block text-sm font-bold mb-1">Pečat</label>
                <input type="file" onChange={(e) => e.target.files && setStamp(e.target.files[0])} />
                <button className="text-xs bg-[#005c8d] text-white px-2 py-1 mt-2" onClick={() => stamp && uploadAsset(stamp, 'stamp')} disabled={uploading}>Upload pečat</button>
            </div>
            <div>
                <label className="block text-sm font-bold mb-1">Potpis ravnatelja</label>
                <input type="file" onChange={(e) => e.target.files && setPrincipalSig(e.target.files[0])} />
                <button className="text-xs bg-[#005c8d] text-white px-2 py-1 mt-2" onClick={() => principalSig && uploadAsset(principalSig, 'principal')} disabled={uploading}>Upload potpisa</button>
            </div>
             <div>
                <label className="block text-sm font-bold mb-1">Potpis razrednika</label>
                <input type="file" onChange={(e) => e.target.files && setTeacherSig(e.target.files[0])} />
                <button className="text-xs bg-[#005c8d] text-white px-2 py-1 mt-2" onClick={() => teacherSig && uploadAsset(teacherSig, 'teacher')} disabled={uploading}>Upload potpisa</button>
            </div>
        </div>
    </div>
  );
}

export default function CertificateManagementPage({ currentClass, currentSchoolId }: { currentClass?: any, currentSchoolId?: string }) {
  const { selectedClassId } = useSelection();
  const [activeTab, setActiveTab] = useState('CLASS_CERTIFICATES');
  const [students, setStudents] = useState<any[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<any>(null);
  const [activeStudentTab, setActiveStudentTab] = useState('BASIC');
  const [activeSettingsTab, setActiveSettingsTab] = useState('CERTIFICATES');
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState<any>(null);

  const tabs = [
    { id: 'CLASS_CERTIFICATES', label: 'Razredne svjedodžbe' },
    { id: 'FINAL_CERTIFICATES', label: 'Završne svjedodžbe' },
    { id: 'FINAL_THESIS', label: 'Završni rad' },
    { id: 'EXAMS', label: 'Ispiti' },
    { id: 'SETTINGS', label: 'Postavke potpisa i pečata' },
  ];

  useEffect(() => {
    fetchStudents();
  }, [activeTab, currentClass, selectedClassId]);

  const fetchStudents = async () => {
    const effectiveClassId = currentClass?.id || selectedClassId;
    
    // Debug logging
    console.log("CERT selectedClassId", selectedClassId);
    console.log("CERT currentClass prop", currentClass);
    console.log("CERT effectiveClassId", effectiveClassId);

    if (!effectiveClassId) {
        return;
    }
    setLoading(true);

    const { data: students, error } = await supabase
      .from('user_profiles')
      .select(`
        id,
        auth_user_id,
        email,
        name,
        role,
        class_id,
        school_id,
        school_year_id,
        oib,
        dob,
        pob,
        father_name,
        mother_name,
        birthplace,
        birth_country,
        citizenship,
        student_registry_number,
        gender
      `)
      .eq('role', 'STUDENT')
      .eq('class_id', effectiveClassId)
      .order('name', { ascending: true });

    console.log("CERT STUDENTS", students);
    console.log("CERT STUDENTS ERROR", error);

    if (error) {
      console.error("LOAD STUDENTS ERROR", error);
      toast.error("Greška pri učitavanju učenika: " + error.message);
    } else {
      setStudents(students || []);
    }
    setLoading(false);
  };

  const toBase64 = async (url: string) => {
    try {
        const response = await fetch(url);
        const blob = await response.blob();
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } catch (e) {
        return undefined;
    }
  };

  const handleGenerateProbna = async (student: any) => {
      setLoading(true);
      // Fetch required data
      const [
          { data: grades, error: gradeError },
          { data: settings, error: settingsError }
      ] = await Promise.all([
          supabase.from('final_grades').select('grade, subjects(name)').eq('student_id', student.id),
          supabase.from('school_document_settings').select('*').eq('school_id', currentSchoolId || '').single()
      ]);

      if (gradeError || settingsError || !settings) {
          toast.error("Greška pri dohvaćanju podataka ili postavki za svjedodžbu.");
          setLoading(false);
          return;
      }

      // Convert images to base64
      let stampUrl, principalSigUrl, teacherSigUrl;
      if (settings.stamp_url) stampUrl = await toBase64(supabase.storage.from('school-assets').getPublicUrl(settings.stamp_url).data.publicUrl) as any;
      if (settings.principal_signature_url) principalSigUrl = await toBase64(supabase.storage.from('school-assets').getPublicUrl(settings.principal_signature_url).data.publicUrl) as any;
      if (settings.teacher_signature_url) teacherSigUrl = await toBase64(supabase.storage.from('school-assets').getPublicUrl(settings.teacher_signature_url).data.publicUrl) as any;

      const certificateData: CertificateData = {
          schoolName: settings?.school_name || 'Naziv škole',
          studentName: student.name,
          studentOib: student.oib || '00000000000',
          grades: grades.map((g: any) => ({ subjectName: g.subjects.name, gradeValue: g.grade })),
          overallSuccess: settings?.overall_success_label || 'N/A', 
          overallAverage: 'N/A',
          conduct: 'N/A',
          date: new Date().toISOString(),
          klasa: 'N/A',
          urbroj: 'N/A',
          principalName: settings?.principal_name || 'N/A',
          stampUrl,
          principalSigUrl,
          teacherSigUrl
      };

      const doc = await generateClassCertificatePDF(student, certificateData, true);
      doc.save('probna_svjedodzba.pdf');
      setLoading(false);
  };

  return (
    <div className="p-6 h-screen flex flex-col">
      <h1 className="text-2xl font-bold mb-6">Svjedodžbe i dokumenti</h1>
      
      <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
        {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`py-2 px-4 rounded font-bold uppercase text-[10px] ${activeTab === tab.id ? 'bg-[#005c8d] text-white' : 'bg-gray-100 text-gray-600'}`}>
                {tab.label}
            </button>
        ))}
      </div>

      {activeTab === 'SETTINGS' ? (
        <SettingsTab schoolId={currentSchoolId} />
      ) : (
      <div className="flex flex-1 gap-6 overflow-hidden">
        {/* Sidebar */}
        <div className="w-1/3 bg-white border rounded shadow-sm overflow-y-auto">
          {students.map(s => (
            <div key={s.id} onClick={() => setSelectedStudent(s)} className={`p-4 border-b cursor-pointer hover:bg-gray-50 ${selectedStudent?.id === s.id ? 'bg-blue-50' : ''}`}>
              <p className="font-semibold">{s.name}</p>
            </div>
          ))}
        </div>

        {/* Main Content */}
        <div className="flex-1 bg-white border rounded shadow-sm p-6 overflow-y-auto">
          {selectedStudent ? (
            <div>
                <h2 className="text-xl font-bold mb-4">{selectedStudent.name}</h2>
                <div className="flex gap-2 mb-6">
                    <button onClick={() => handleGenerateProbna(selectedStudent)} className="bg-gray-100 px-4 py-2 text-[10px] uppercase font-bold flex items-center gap-2" disabled={loading}><FileText size={14}/> {loading ? 'Dohvaćam...' : 'Probna svjedodžba'}</button>
                    <button onClick={() => {}} className="bg-red-600 text-white px-4 py-2 text-[10px] uppercase font-bold flex items-center gap-2"><Lock size={14}/> Zaključaj</button>
                </div>
                {/* Student Detail Tabs */}
                <div className="flex gap-2 border-b mb-4">
                  {[
                      { id: 'BASIC', label: 'Osnovni podaci' },
                      { id: 'GRADES', label: 'Ocjene' },
                      { id: 'ABSENCES', label: 'Izostanci' },
                      { id: 'CONDUCT', label: 'Vladanje' },
                      { id: 'OVERALL', label: 'Opći uspjeh' },
                  ].map(tab => (
                      <button key={tab.id} onClick={() => setActiveStudentTab(tab.id)} className={`pb-2 px-1 text-sm font-bold ${activeStudentTab === tab.id ? 'border-b-2 border-[#005c8d] text-[#005c8d]' : 'text-gray-500'}`}>
                          {tab.label}
                      </button>
                  ))}
                </div>
                <div className="p-4 bg-gray-50 rounded">
                    {/* Content will be added here based on activeStudentTab */}
                    <p>Sadržaj za {activeStudentTab}</p>
                </div>
            </div>
          ) : (
            <div className="text-center py-20 text-slate-500">Odaberite učenika za prikaz detalja.</div>
          )}
        </div>
      </div>
      )}
    </div>
  );
}

