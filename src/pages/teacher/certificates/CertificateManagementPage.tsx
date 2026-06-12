import React, { useState, useEffect } from 'react';
import { FileText, Printer, Lock, Unlock, Loader2, Award, User } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { toast } from 'react-hot-toast';
import { generateClassCertificatePDF } from '../../../lib/pdfGenerator';
import { sortStudentsBySurname } from '../../../lib/utils';
import { StudentDocument } from '../../../types/certificates';
import { CertificateData } from '../../../lib/pdfGenerator';
import { useSelection } from '../../../contexts/SelectionContext';
import { useAuth } from '../../../contexts/AuthContext';
import { SupplementaryExamsTab } from '../../../components/certificates/SupplementaryExamsTab';
import { FinalThesisTab } from '../../../components/certificates/FinalThesisTab';



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
    const { error } = await supabase.storage.from('school-assets').upload(path, file, { upsert: true });
    if (error) {
        toast.error("Greška pri uploadu: " + error.message);
    } else {
        // Get public URL
        const { data: publicUrlData } = supabase.storage.from('school-assets').getPublicUrl(path);
        const publicUrl = publicUrlData?.publicUrl || '';

        const payload: any = {
          school_id: schoolId
        };

        if (type === 'stamp') {
          payload.stamp_url = publicUrl;
          payload.stamp_path = path;
          payload.stamp_image_url = path;
        } else if (type === 'principal') {
          payload.principal_signature_url = publicUrl;
          payload.principal_signature_path = path;
          // backward compatibility
          payload.signature_url = publicUrl;
          payload.signature_path = path;
        } else if (type === 'teacher') {
          payload.teacher_signature_url = publicUrl;
          payload.teacher_signature_path = path;
        }

        // Update settings in database with upsert + onConflict
        const { error: dbError } = await supabase
          .from('school_document_settings')
          .upsert(payload, { onConflict: 'school_id' });

        if (dbError) {
          toast.error("Greška pri spremanju u bazu: " + dbError.message);
        } else {
          toast.success("Uspješno uploadano.");
        }
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
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('CLASS_CERTIFICATES');
  const [students, setStudents] = useState<any[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<any>(null);
  const [activeStudentTab, setActiveStudentTab] = useState('BASIC');
  const [activeSettingsTab, setActiveSettingsTab] = useState('CERTIFICATES');
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState<any>(null);
  const [lockedDocument, setLockedDocument] = useState<any>(null);

  useEffect(() => {
    const fetchLockedDocument = async () => {
      if (!selectedStudent) {
        setLockedDocument(null);
        return;
      }
      const classId = selectedStudent.class_id || currentClass?.id || selectedClassId;
      const { data: existingDoc } = await supabase
        .from('student_documents')
        .select('*')
        .eq('student_id', selectedStudent.id)
        .eq('class_id', classId)
        .eq('document_type', 'CLASS_CERTIFICATE')
        .maybeSingle();
      
      setLockedDocument(existingDoc);
    };

    fetchLockedDocument();
  }, [selectedStudent, selectedClassId, currentClass]);

  const tabs = [
    { id: 'CLASS_CERTIFICATES', label: 'Razredne svjedodžbe' },
    { id: 'FINAL_CERTIFICATES', label: 'Završne svjedodžbe' },
    { id: 'FINAL_THESIS', label: 'Završni rad' },
    { id: 'EXAMS', label: 'Ispiti' },
    { id: 'SUPPLEMENTARY_EXAMS', label: 'Potvrde o ispitima' },
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
      setStudents(sortStudentsBySurname(students || []));
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

      const classId = student.class_id || currentClass?.id || selectedClassId;

      // If locked, load the snapshot instead of querying live data
      if (lockedDocument && lockedDocument.status === 'LOCKED') {
          const { data: snap, error: snapErr } = await supabase
              .from('student_document_snapshots')
              .select('*')
              .eq('document_id', lockedDocument.id)
              .maybeSingle();
              
          if (snapErr || !snap) {
              toast.error("Greška pri dohvaćanju pohranjene svjedodžbe.");
              setLoading(false);
              return;
          }
          
          const certificateData: CertificateData = snap.snapshot_data;
          const doc = await generateClassCertificatePDF(student, certificateData, false);
          doc.save(`svjedodzba_${student.name.replace(/\s+/g, '_')}.pdf`);
          setLoading(false);
          return;
      }

      let settingsError: any = null;
      let settings: any = null;
      let studentError: any = null;
      let summaryError: any = null;
      let finalGradesError: any = null;
      let classError: any = null;

      // 1. Fetch student profile
      const { data: studentData, error: sErr } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', student.id)
        .single();
      
      studentError = sErr;

      if (studentError || !studentData) {
          console.log("CERT SETTINGS ERROR", settingsError);
          console.log("CERT SETTINGS DATA", settings);
          console.log("CERT STUDENT ERROR", studentError);
          console.log("CERT SUMMARY ERROR", summaryError);
          console.log("CERT FINAL GRADES ERROR", finalGradesError);
          console.log("CERT CLASS ERROR", classError);

          toast.error("Nije pronađen učenik.");
          setLoading(false);
          return;
      }

      // 2. Fetch class data (including program and homeroom teacher)
      const { data: classData, error: cErr } = await supabase
        .from('classes')
        .select('*, program:program_id(*), homeroom:user_profiles!classes_homeroom_teacher_id_fkey(name)')
        .eq('id', studentData.class_id || '')
        .maybeSingle();

      classError = cErr;

      if (classError || !classData) {
          console.log("CERT SETTINGS ERROR", settingsError);
          console.log("CERT SETTINGS DATA", settings);
          console.log("CERT STUDENT ERROR", studentError);
          console.log("CERT SUMMARY ERROR", summaryError);
          console.log("CERT FINAL GRADES ERROR", finalGradesError);
          console.log("CERT CLASS ERROR", classError);

          toast.error("Nije pronađen razred.");
          setLoading(false);
          return;
      }

      // 3. Fetch school year
      const { data: schoolYearData, error: schoolYearError } = await supabase
        .from('school_years')
        .select('*')
        .eq('id', studentData.school_year_id || '')
        .maybeSingle();

      // 4. Fetch school settings
      const targetSchoolId = studentData.school_id || currentSchoolId || '';
      const { data: settingsData, error: setErr } = await supabase
        .from('school_document_settings')
        .select('*')
        .eq('school_id', targetSchoolId)
        .maybeSingle();

      settingsError = setErr;
      settings = settingsData;

      if (settingsError) {
          console.log("CERT SETTINGS ERROR", settingsError);
          console.log("CERT SETTINGS DATA", settings);
          console.log("CERT STUDENT ERROR", studentError);
          console.log("CERT SUMMARY ERROR", summaryError);
          console.log("CERT FINAL GRADES ERROR", finalGradesError);
          console.log("CERT CLASS ERROR", classError);

          toast.error("Greška pri dohvaćanju postavki škole: " + settingsError.message);
          setLoading(false);
          return;
      }

      // Auto create settings if not custom
      if (!settings && targetSchoolId) {
          console.log("No settings found, attempting to auto-create with default values...");
          const newSettingsPayload = {
            school_id: targetSchoolId,
            school_name: classData.school_name || 'Naziv škole',
            principal_name: 'N/A',
            principal_title: 'ravnatelj',
            overall_success_label: 'N/A',
            conduct_label: 'N/A',
            certificate_place: classData.city || 'Zagreb',
            certificate_date: new Date().toISOString().split('T')[0]
          };

          const { error: insertError } = await supabase
            .from('school_document_settings')
            .upsert(newSettingsPayload, { onConflict: 'school_id' });

          if (insertError) {
              console.error("Auto-create settings insert error", insertError);
          } else {
              const { data: reFetchedSettings } = await supabase
                .from('school_document_settings')
                .select('*')
                .eq('school_id', targetSchoolId)
                .maybeSingle();
              settings = reFetchedSettings;
          }
      }

      if (!settings) {
          console.log("CERT SETTINGS ERROR", settingsError);
          console.log("CERT SETTINGS DATA", settings);
          console.log("CERT STUDENT ERROR", studentError);
          console.log("CERT SUMMARY ERROR", summaryError);
          console.log("CERT FINAL GRADES ERROR", finalGradesError);
          console.log("CERT CLASS ERROR", classError);

          toast.error("Nisu unesene postavke škole.");
          setLoading(false);
          return;
      }

      // 5. Fetch student year summary
      const schoolYearNameForSummary = schoolYearData?.name || '';
      const { data: summaryData, error: sumErr } = await supabase
          .from('student_year_summaries')
          .select('*')
          .eq('student_id', student.id)
          .eq('class_id', studentData.class_id || '')
          .eq('school_year', schoolYearNameForSummary)
          .maybeSingle();

      summaryError = sumErr;

      if (summaryError) {
          console.log("CERT SETTINGS ERROR", settingsError);
          console.log("CERT SETTINGS DATA", settings);
          console.log("CERT STUDENT ERROR", studentError);
          console.log("CERT SUMMARY ERROR", summaryError);
          console.log("CERT FINAL GRADES ERROR", finalGradesError);
          console.log("CERT CLASS ERROR", classError);

          toast.error("Greška pri dohvaćanju općeg uspjeha: " + summaryError.message);
          setLoading(false);
          return;
      }

      if (!summaryData || summaryData.status !== 'FINALIZED') {
          console.log("CERT SUMMARY STATUS NOT FINALIZED or NULL", summaryData);

          toast.error("Opći uspjeh učenika nije zaključen.");
          setLoading(false);
          return;
      }

      // 6. Fetch final grades (period = 'SECOND_TERM' and select value) for specific class
      const { data: finalGradesData, error: fgErr } = await supabase
          .from('final_grades')
          .select('value, subject_id, subjects(name, subject_type)')
          .eq('student_id', student.id)
          .eq('class_id', studentData.class_id || '')
          .eq('period', 'SECOND_TERM');

      finalGradesError = fgErr;

      if (finalGradesError) {
          console.log("CERT SETTINGS ERROR", settingsError);
          console.log("CERT SETTINGS DATA", settings);
          console.log("CERT STUDENT ERROR", studentError);
          console.log("CERT SUMMARY ERROR", summaryError);
          console.log("CERT FINAL GRADES ERROR", finalGradesError);
          console.log("CERT CLASS ERROR", classError);

          toast.error("Greška pri dohvaćanju zaključnih ocjena: " + finalGradesError.message);
          setLoading(false);
          return;
      }

      if (!finalGradesData || finalGradesData.length === 0) {
          console.log("CERT SETTINGS ERROR", settingsError);
          console.log("CERT SETTINGS DATA", settings);
          console.log("CERT STUDENT ERROR", studentError);
          console.log("CERT SUMMARY ERROR", summaryError);
          console.log("CERT FINAL GRADES ERROR", finalGradesError);
          console.log("CERT CLASS ERROR", classError);

          toast.error("Nema zaključnih ocjena.");
          setLoading(false);
          return;
      }

      // Final success logs
      console.log("CERT SETTINGS ERROR", settingsError);
      console.log("CERT SETTINGS DATA", settings);
      console.log("CERT STUDENT ERROR", studentError);
      console.log("CERT SUMMARY ERROR", summaryError);
      console.log("CERT FINAL GRADES ERROR", finalGradesError);
      console.log("CERT CLASS ERROR", classError);

      const { data: classSubs1 } = await supabase
        .from('class_subjects')
        .select('subject_id, subject_type')
        .eq('class_id', studentData.class_id || '');

      const classSubjectTypeMap1 = new Map<string, string>();
      if (classSubs1) {
        for (const cs of classSubs1) {
          classSubjectTypeMap1.set(cs.subject_id, cs.subject_type || 'REQUIRED');
        }
      }

      // Deduplicate grades/subjects (Jedan predmet smije biti prikazan samo jednom)
      const uniqueGradesMap = new Map<string, any>();
      if (finalGradesData) {
          for (const g of finalGradesData) {
              const subjectName = (g.subjects as any)?.name || 'Nepoznat predmet';
              const cleanName = subjectName.replace(/\s*\(izborni\)\s*$/i, '').trim();
              const subjectType = classSubjectTypeMap1.get(g.subject_id) || (g.subjects as any)?.subject_type || 'REQUIRED';
              // Keep the latest or first
              uniqueGradesMap.set(cleanName, { value: g.value, subjectType });
          }
      }
      const uniqueGradesList = Array.from(uniqueGradesMap.entries()).map(([subj, gData]) => ({
          subjectName: subj,
          gradeValue: gData.value,
          subjectType: gData.subjectType
      }));

      // Convert images to base64
      const getAssetUrl = (urlOrPath: string) => {
        if (!urlOrPath) return '';
        if (urlOrPath.startsWith('http://') || urlOrPath.startsWith('https://')) return urlOrPath;
        return supabase.storage.from('school-assets').getPublicUrl(urlOrPath).data.publicUrl || '';
      };

      let stampUrl, principalSigUrl, teacherSigUrl;
      if (settings.stamp_url) stampUrl = await toBase64(getAssetUrl(settings.stamp_url)) as any;
      if (settings.principal_signature_url) principalSigUrl = await toBase64(getAssetUrl(settings.principal_signature_url)) as any;
      if (settings.teacher_signature_url) teacherSigUrl = await toBase64(getAssetUrl(settings.teacher_signature_url)) as any;

      const mapOverallSuccess = (val: any) => {
        if (val === 1 || val === '1') return 'nedovoljan (1)';
        if (val === 2 || val === '2') return 'dovoljan (2)';
        if (val === 3 || val === '3') return 'dobar (3)';
        if (val === 4 || val === '4') return 'vrlo dobar (4)';
        if (val === 5 || val === '5') return 'odličan (5)';
        return val ? val.toString() : 'N/A';
      };

      const mapConduct = (val: any) => {
        if (val === 'EXEMPLARY') return 'uzorno';
        if (val === 'GOOD') return 'dobro';
        if (val === 'POOR') return 'loše';
        return val ? val.toString() : 'N/A';
      };

      let templateConfigObj = null;
      try {
          if (settings?.certificate_template_config) {
              templateConfigObj = JSON.parse(settings.certificate_template_config);
          } else if (settings?.desired_school_name) {
              templateConfigObj = JSON.parse(settings.desired_school_name);
          }
      } catch (e) {
          console.warn("Could not parse template config", e);
      }

      const certificateData: CertificateData = {
          schoolName: settings?.school_name || 'Naziv škole',
          schoolYear: schoolYearData?.name || 'N/A',
          className: classData?.name || 'N/A',
          programName: classData?.program?.name || 'Opći program',
          studentName: studentData.name,
          studentOib: studentData.oib || '00000000000',
          grades: uniqueGradesList,
          overallSuccess: summaryData?.final_result ? mapOverallSuccess(summaryData.final_result) : (settings?.overall_success_label || 'N/A'), 
          overallAverage: summaryData?.average ? summaryData.average.toString() : 'N/A',
          conduct: summaryData?.behavior ? mapConduct(summaryData.behavior) : (settings?.conduct_label || 'N/A'),
          date: settings?.certificate_date || new Date().toISOString().split('T')[0],
          klasa: classData.document_klasa || settings?.default_klasa || 'N/A',
          urbroj: classData.document_urbroj || settings?.default_urbroj || 'N/A',
          oib: settings?.oib || '____________',
          principalName: settings?.principal_name || 'N/A',
          principalTitle: settings?.principal_title || 'Ravnatelj',
          homeroomTeacherTitle: settings?.homeroom_teacher_title || 'Razrednik',
          homeroomTeacherName: classData?.homeroom?.name || '________________',
          certificatePlace: settings?.certificate_place || classData?.city || 'Zagreb',
          stampUrl,
          principalSigUrl,
          teacherSigUrl,
          templateConfig: templateConfigObj
      };

      const doc = await generateClassCertificatePDF(studentData, certificateData, true);
      doc.save('probna_svjedodzba.pdf');
      setLoading(false);
  };

  const handleLockCertificate = async () => {
    console.log("LOCK CERTIFICATE CLICKED", selectedStudent);

    if (!selectedStudent) {
      toast.error("Odaberite učenika.");
      return;
    }

    const classId = selectedStudent.class_id || currentClass?.id || selectedClassId;
    if (!classId) {
      toast.error("Razred nije odabran.");
      return;
    }

    setLoading(true);

    try {
      const { data: schoolYearData } = await supabase
        .from('school_years')
        .select('*')
        .eq('id', selectedStudent.school_year_id || '')
        .maybeSingle();

      const schoolYearName = schoolYearData?.name || '';

      const { data: summary, error: sumErr } = await supabase
        .from('student_year_summaries')
        .select('*')
        .eq('student_id', selectedStudent.id)
        .eq('class_id', classId)
        .eq('school_year', schoolYearName)
        .maybeSingle();

      console.log("SUMMARY CHECK", summary);

      if (!summary || !summary.final_result || summary.status !== 'FINALIZED') {
        toast.error("Opći uspjeh učenika nije zaključen.");
        setLoading(false);
        return;
      }

      const { data: finalGrades, error: fError } = await supabase
        .from('final_grades')
        .select('*, subjects(name, subject_type)')
        .eq('student_id', selectedStudent.id)
        .eq('class_id', classId)
        .eq('period', 'SECOND_TERM');

      console.log("FINAL GRADES CHECK", finalGrades);

      if (fError) {
        toast.error("Greška pri dohvaćanju zaključnih ocjena: " + fError.message);
        setLoading(false);
        return;
      }

      const { data: subjectEnrollments } = await supabase
        .from('student_subject_enrollments')
        .select('subject_id')
        .eq('student_id', selectedStudent.id)
        .eq('class_id', classId)
        .eq('status', 'ACTIVE');

      const { data: classSubjects } = await supabase
        .from('class_subjects')
        .select('subject_id, subject_type')
        .eq('class_id', classId);

      let requiredSubjectIds: string[] = [];
      if (subjectEnrollments && subjectEnrollments.length > 0) {
        requiredSubjectIds = subjectEnrollments.map(e => e.subject_id);
      } else if (classSubjects && classSubjects.length > 0) {
        requiredSubjectIds = classSubjects.map(c => c.subject_id);
      }

      const missingSubjectIds = requiredSubjectIds.filter(subId => !finalGrades || !finalGrades.some(fg => fg.subject_id === subId));

      if (missingSubjectIds.length > 0) {
        const { data: allSubjects } = await supabase
          .from('subjects')
          .select('id, name');

        const missingSubjectNames = missingSubjectIds
          .map(subId => allSubjects?.find(s => s.id === subId)?.name)
          .filter(Boolean);

        toast.error(`Za učenika nije zaključeno sve (${missingSubjectNames.join(', ')}).`);
        setLoading(false);
        return;
      }

      if (!finalGrades || finalGrades.length === 0) {
        toast.error("Nema zaključnih ocjena.");
        setLoading(false);
        return;
      }

      const targetSchoolId = selectedStudent.school_id || currentSchoolId || '';
      const { data: settings } = await supabase
        .from('school_document_settings')
        .select('*')
        .eq('school_id', targetSchoolId)
        .maybeSingle();

      const { data: classData } = await supabase
        .from('classes')
        .select('*, program:program_id(*), homeroom:user_profiles!classes_homeroom_teacher_id_fkey(name)')
        .eq('id', classId)
        .maybeSingle();

      const getAssetUrl = (urlOrPath: string) => {
        if (!urlOrPath) return '';
        if (urlOrPath.startsWith('http://') || urlOrPath.startsWith('https://')) return urlOrPath;
        return supabase.storage.from('school-assets').getPublicUrl(urlOrPath).data.publicUrl || '';
      };

      let stampUrl, principalSigUrl, teacherSigUrl;
      if (settings?.stamp_url) stampUrl = await toBase64(getAssetUrl(settings.stamp_url)) as any;
      if (settings?.principal_signature_url) principalSigUrl = await toBase64(getAssetUrl(settings.principal_signature_url)) as any;
      if (settings?.teacher_signature_url) teacherSigUrl = await toBase64(getAssetUrl(settings.teacher_signature_url)) as any;

      const mapOverallSuccess = (val: any) => {
        if (val === 1 || val === '1') return 'nedovoljan (1)';
        if (val === 2 || val === '2') return 'dovoljan (2)';
        if (val === 3 || val === '3') return 'dobar (3)';
        if (val === 4 || val === '4') return 'vrlo dobar (4)';
        if (val === 5 || val === '5') return 'odličan (5)';
        return val ? val.toString() : 'N/A';
      };

      const mapConduct = (val: any) => {
        if (val === 'EXEMPLARY') return 'uzorno';
        if (val === 'GOOD') return 'dobro';
        if (val === 'POOR') return 'loše';
        return val ? val.toString() : 'N/A';
      };

      const classSubjectTypeMap2 = new Map<string, string>();
      if (classSubjects) {
        for (const cs of classSubjects) {
          classSubjectTypeMap2.set(cs.subject_id, cs.subject_type || 'REQUIRED');
        }
      }

      const uniqueGradesMap = new Map<string, any>();
      for (const g of finalGrades || []) {
          const subjectName = (g.subjects as any)?.name || 'Nepoznat predmet';
          const cleanName = subjectName.replace(/\s*\(izborni\)\s*$/i, '').trim();
          const subjectType = classSubjectTypeMap2.get(g.subject_id) || (g.subjects as any)?.subject_type || 'REQUIRED';
          uniqueGradesMap.set(cleanName, { value: g.value, subjectType });
      }
      const uniqueGradesList = Array.from(uniqueGradesMap.entries()).map(([subj, gData]) => ({
          subjectName: subj,
          gradeValue: gData.value,
          subjectType: gData.subjectType
      }));

      let templateConfigObj = null;
      try {
          if (settings?.certificate_template_config) {
              templateConfigObj = JSON.parse(settings.certificate_template_config);
          } else if (settings?.desired_school_name) {
              templateConfigObj = JSON.parse(settings.desired_school_name);
          }
      } catch (e) {
          console.warn("Could not parse template config on lock", e);
      }

      const certificateData: CertificateData = {
          schoolName: settings?.school_name || 'Naziv škole',
          schoolYear: schoolYearName || 'N/A',
          className: classData?.name || 'N/A',
          programName: classData?.program?.name || 'Opći program',
          studentName: selectedStudent.name,
          studentOib: selectedStudent.oib || '00000000000',
          grades: uniqueGradesList,
          overallSuccess: summary?.final_result ? mapOverallSuccess(summary.final_result) : (settings?.overall_success_label || 'N/A'), 
          overallAverage: summary?.average ? summary.average.toString() : 'N/A',
          conduct: summary?.behavior ? mapConduct(summary.behavior) : (settings?.conduct_label || 'N/A'),
          date: settings?.certificate_date || new Date().toISOString().split('T')[0],
          klasa: classData?.document_klasa || settings?.default_klasa || 'N/A',
          urbroj: classData?.document_urbroj || settings?.default_urbroj || 'N/A',
          oib: settings?.oib || '____________',
          principalName: settings?.principal_name || 'N/A',
          principalTitle: settings?.principal_title || 'Ravnatelj',
          homeroomTeacherTitle: settings?.homeroom_teacher_title || 'Razrednik',
          homeroomTeacherName: classData?.homeroom?.name || '________________',
          certificatePlace: settings?.certificate_place || classData?.city || 'Zagreb',
          stampUrl,
          principalSigUrl,
          teacherSigUrl,
          templateConfig: templateConfigObj
      };

      const payload: any = {
        student_id: selectedStudent.id,
        school_year_id: selectedStudent.school_year_id || null,
        class_id: classId,
        document_type: 'CLASS_CERTIFICATE',
        status: 'LOCKED',
        locked: true,
        locked_by: user?.id || null,
        locked_at: new Date().toISOString(),
        issue_date: settings?.certificate_date || new Date().toISOString().split('T')[0],
        klasa: classData?.document_klasa || settings?.default_klasa || 'N/A',
        urbroj: classData?.document_urbroj || settings?.default_urbroj || 'N/A'
      };

      console.log("LOCK CERTIFICATE PAYLOAD", payload);

      const { data: docRecord, error: docErr } = await supabase
        .from('student_documents')
        .insert(payload)
        .select('*')
        .single();

      console.log("LOCK CERTIFICATE ERROR", docErr);
      
      console.log("SELECTED STUDENT", selectedStudent);
      if (!selectedStudent?.id) throw new Error("Nedostaje student_id za zaključavanje svjedodžbe.");

      if (docErr) {
        throw docErr;
      }

      const { error: snapErr } = await supabase
        .from('student_document_snapshots')
        .insert({
          document_id: docRecord.id,
          student_id: selectedStudent.id,
          class_id: classId,
          school_id: targetSchoolId,
          school_year: schoolYearName,
          school_year_id: selectedStudent.school_year_id || null,
          document_type: 'CLASS_CERTIFICATE',
          snapshot_data: certificateData as any,
          created_by: user?.id || null
        });

      if (snapErr) {
        await supabase.from('student_documents').delete().eq('id', docRecord.id);
        throw snapErr;
      }

      setLockedDocument(docRecord);
      toast.success("Svjedodžba je uspješno zaključana.");
    } catch (err: any) {
      console.log("LOCK CERTIFICATE ERROR", err);
      console.error(err);
      toast.error("Greška pri zaključavanju svjedodžbe: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUnlock = async () => {
    if (!selectedStudent) return;
    const classId = selectedStudent.class_id || currentClass?.id || selectedClassId;
    setLoading(true);
    try {
      const { data: existingDoc } = await supabase
        .from('student_documents')
        .select('*')
        .eq('student_id', selectedStudent.id)
        .eq('class_id', classId)
        .eq('document_type', 'CLASS_CERTIFICATE')
        .maybeSingle();

      if (existingDoc) {
        await supabase.from('student_document_snapshots').delete().eq('document_id', existingDoc.id);
        
        const { error: delErr } = await supabase
          .from('student_documents')
          .delete()
          .eq('id', existingDoc.id);
          
        if (delErr) throw delErr;
      }
      setLockedDocument(null);
      toast.success("Svjedodžba uspješno otključana.");
    } catch (err: any) {
      console.error(err);
      toast.error("Greška pri otključavanju: " + err.message);
    } finally {
      setLoading(false);
    }
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
      ) : activeTab === 'SUPPLEMENTARY_EXAMS' ? (
        <SupplementaryExamsTab />
      ) : activeTab === 'FINAL_THESIS' ? (
        <FinalThesisTab />
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
                    <button onClick={() => handleGenerateProbna(selectedStudent)} className="bg-gray-100 px-4 py-2 text-[10px] uppercase font-bold flex items-center gap-2" disabled={loading}>
                      <FileText size={14}/> {loading ? 'Dohvaćam...' : (lockedDocument ? 'Konačna svjedodžba' : 'Probna svjedodžba')}
                    </button>
                    {lockedDocument ? (
                        <button onClick={handleUnlock} className="bg-green-600 text-white px-4 py-2 text-[10px] uppercase font-bold flex items-center gap-2" disabled={loading}>
                          <Unlock size={14}/> Otključaj
                        </button>
                    ) : (
                        <button onClick={handleLockCertificate} className="bg-red-600 text-white px-4 py-2 text-[10px] uppercase font-bold flex items-center gap-2" disabled={loading}>
                          <Lock size={14}/> Zaključaj
                        </button>
                    )}
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

