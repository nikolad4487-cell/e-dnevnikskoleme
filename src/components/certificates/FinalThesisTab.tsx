import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { toast } from 'react-hot-toast';
import { FileText, Loader2 } from 'lucide-react';
import { generateFinalWorkCertificatePDF } from '../../lib/pdfGenerator';
import { useSelection } from '../../contexts/SelectionContext';
import { sortStudentsBySurname } from '../../lib/utils';

const toBase64 = async (url: string) => {
  if (!url) return undefined;
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.warn('Could not convert asset to base64', error);
    return undefined;
  }
};

const getAssetUrl = (urlOrPath: string) => {
  if (!urlOrPath) return '';
  if (urlOrPath.startsWith('http://') || urlOrPath.startsWith('https://')) return urlOrPath;
  return supabase.storage.from('school-assets').getPublicUrl(urlOrPath).data.publicUrl || '';
};

const toGradeLabel = (value: number | null | undefined) => {
  switch (value) {
    case 1: return 'nedovoljan (1)';
    case 2: return 'dovoljan (2)';
    case 3: return 'dobar (3)';
    case 4: return 'vrlo dobar (4)';
    case 5: return 'odličan (5)';
    default: return '____________';
  }
};

export const FinalThesisTab = () => {
  const { selectedClassId, selectedSchoolId } = useSelection();
  const [students, setStudents] = useState<any[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [loading, setLoading] = useState(false);
  const [finalThesisData, setFinalThesisData] = useState<any>(null);

  const selectedStudent = students.find((student) => student.id === selectedStudentId) || null;

  useEffect(() => {
    if (!selectedClassId) return;

    const fetchStudents = async () => {
      const { data } = await supabase
        .from('user_profiles')
        .select('id, name, surname, oib, dob, pob, birthplace, birth_country, citizenship, school_id, class_id, school_year_id, father_name, mother_name, gender, student_registry_number')
        .eq('role', 'STUDENT')
        .eq('class_id', selectedClassId);

      setStudents(sortStudentsBySurname(data || []));
    };

    fetchStudents();
  }, [selectedClassId]);

  useEffect(() => {
    if (!selectedStudent) {
      setFinalThesisData(null);
      return;
    }

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
    if (!selectedStudent) {
      toast.error('Odaberi učenika.');
      return;
    }
    if (!finalThesisData) {
      toast.error('Nisu uneseni podaci završnog rada.');
      return;
    }

    setLoading(true);

    try {
      const [{ data: classData }, { data: schoolYearData }, { data: settings }] = await Promise.all([
        supabase
          .from('classes')
          .select('*, program:program_id(*), homeroom:user_profiles!classes_homeroom_teacher_id_fkey(name)')
          .eq('id', selectedStudent.class_id || selectedClassId || '')
          .maybeSingle(),
        supabase
          .from('school_years')
          .select('*')
          .eq('id', selectedStudent.school_year_id || '')
          .maybeSingle(),
        supabase
          .from('school_document_settings')
          .select('*')
          .eq('school_id', selectedStudent.school_id || selectedSchoolId || '')
          .maybeSingle(),
      ]);

      let stampUrl, principalSigUrl, teacherSigUrl;
      if (settings?.stamp_url) stampUrl = await toBase64(getAssetUrl(settings.stamp_url)) as any;
      if (settings?.principal_signature_url) principalSigUrl = await toBase64(getAssetUrl(settings.principal_signature_url)) as any;
      if (settings?.teacher_signature_url) teacherSigUrl = await toBase64(getAssetUrl(settings.teacher_signature_url)) as any;

      const doc = await generateFinalWorkCertificatePDF(selectedStudent, {
        schoolName: settings?.school_name || 'Naziv škole',
        schoolYear: schoolYearData?.name || '',
        className: classData?.name || '3.D',
        programName: classData?.program?.name || finalThesisData.program_name || '____________',
        studentName: selectedStudent.name,
        studentOib: selectedStudent.oib || '____________',
        grades: [],
        overallSuccess: toGradeLabel(finalThesisData.final_grade),
        overallAverage: '',
        conduct: '',
        date: finalThesisData.defense_date || settings?.certificate_date || new Date().toISOString().split('T')[0],
        klasa: classData?.document_klasa || settings?.default_klasa || '____________',
        urbroj: classData?.document_urbroj || settings?.default_urbroj || '____________',
        oib: settings?.oib || '____________',
        principalName: settings?.principal_name || '____________',
        principalTitle: settings?.principal_title || 'Ravnatelj',
        homeroomTeacherTitle: settings?.homeroom_teacher_title || 'Razrednik',
        homeroomTeacherName: classData?.homeroom?.name || '____________',
        certificatePlace: settings?.certificate_place || 'Zagreb',
        stampUrl,
        principalSigUrl,
        teacherSigUrl,
        thesisTitle: finalThesisData.thesis_title,
        creationGrade: toGradeLabel(finalThesisData.creation_grade),
        defenseGrade: toGradeLabel(finalThesisData.defense_grade),
      });

      doc.save(`svjedodzba_zavrsni_rad_${selectedStudent.name.replace(/\s+/g, '_')}.pdf`);
    } catch (err: any) {
      console.error(err);
      toast.error('Greška pri generiranju svjedodžbe: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6">
      <h2 className="mb-4 text-lg font-bold">Svjedodžba o završnome radu</h2>
      <div className="flex flex-col gap-4 md:flex-row md:items-center">
        <select
          className="border p-2"
          value={selectedStudentId}
          onChange={(e) => setSelectedStudentId(e.target.value)}
        >
          <option value="">Odaberi učenika</option>
          {students.map((student) => (
            <option key={student.id} value={student.id}>
              {student.name}
            </option>
          ))}
        </select>

        <button
          onClick={handleGenerate}
          className="flex items-center gap-2 bg-blue-600 px-4 py-2 text-white disabled:cursor-not-allowed disabled:bg-slate-300"
          disabled={!selectedStudent || loading}
        >
          {loading ? <Loader2 className="animate-spin" size={16} /> : <FileText size={16} />}
          Generiraj svjedodžbu
        </button>
      </div>

      {selectedStudent && !finalThesisData && (
        <p className="mt-4 text-sm text-red-500">Nisu uneseni podaci završnog rada.</p>
      )}
    </div>
  );
};
