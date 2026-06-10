import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { toast } from 'react-hot-toast';
import { FileText, Loader2 } from 'lucide-react';
import { generateExamCertificatePDF } from '../../lib/pdfGenerator';
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

export const SupplementaryExamsTab = () => {
  const { selectedClassId, selectedSchoolId } = useSelection();
  const [students, setStudents] = useState<any[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [gradeLevel, setGradeLevel] = useState<number>(1);
  const [loading, setLoading] = useState(false);

  const selectedStudent = students.find((student) => student.id === selectedStudentId) || null;

  useEffect(() => {
    if (!selectedClassId) return;

    const fetchStudents = async () => {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('id, name, surname, oib, dob, pob, birthplace, birth_country, citizenship, school_id, class_id, school_year_id')
        .eq('role', 'STUDENT')
        .eq('class_id', selectedClassId)
        .order('name');

      if (error) {
        toast.error('Greška pri učitavanju učenika.');
        return;
      }

      setStudents(sortStudentsBySurname(data || []));
    };

    fetchStudents();
  }, [selectedClassId]);

  const handleGenerate = async () => {
    if (!selectedStudent) {
      toast.error('Odaberi učenika.');
      return;
    }

    setLoading(true);

    try {
      const { data: exams, error } = await supabase
        .from('exams')
        .select('*, subjects(name)')
        .eq('student_id', selectedStudent.id)
        .eq('exam_grade_level', gradeLevel)
        .in('exam_type', ['DIFFERENCE', 'SUPPLEMENTARY', 'REMEDIAL'])
        .order('exam_date', { ascending: true });

      if (error) throw error;
      if (!exams || exams.length === 0) {
        toast.error('Za odabrani razred nema evidentiranih ispita.');
        setLoading(false);
        return;
      }

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

      const globalData = {
        schoolName: settings?.school_name || 'Naziv škole',
        programName: classData?.program?.name || '____________',
        schoolYear: schoolYearData?.name || '',
        place: settings?.certificate_place || 'Zagreb',
        date: settings?.certificate_date || new Date().toISOString().split('T')[0],
        oib: settings?.oib || '____________',
        klasa: classData?.document_klasa || settings?.default_klasa || '____________',
        urbroj: classData?.document_urbroj || settings?.default_urbroj || '____________',
        principalName: settings?.principal_name || '____________',
        principalTitle: settings?.principal_title || 'Ravnatelj',
        homeroomTeacherName: classData?.homeroom?.name || '____________',
        homeroomTeacherTitle: settings?.homeroom_teacher_title || 'Razrednik',
        stampUrl,
        principalSigUrl,
        teacherSigUrl,
      };

      const doc = await generateExamCertificatePDF(selectedStudent, exams, globalData, gradeLevel);
      doc.save(`potvrda_ispiti_${selectedStudent.name.replace(/\s+/g, '_')}.pdf`);
    } catch (err: any) {
      console.error(err);
      toast.error('Greška pri generiranju potvrde: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6">
      <h2 className="mb-4 text-lg font-bold">Generiranje potvrde o ispitima</h2>
      <div className="flex flex-col gap-4 md:flex-row md:items-center">
        <select
          value={selectedStudentId}
          onChange={(e) => setSelectedStudentId(e.target.value)}
          className="border p-2"
        >
          <option value="">Odaberi učenika</option>
          {students.map((student) => (
            <option key={student.id} value={student.id}>
              {student.name}
            </option>
          ))}
        </select>

        <select value={gradeLevel} onChange={(e) => setGradeLevel(parseInt(e.target.value, 10))} className="border p-2">
          <option value={1}>1. razred</option>
          <option value={2}>2. razred</option>
          <option value={3}>3. razred</option>
          <option value={4}>4. razred</option>
        </select>

        <button
          onClick={handleGenerate}
          disabled={!selectedStudent || loading}
          className="flex items-center gap-2 bg-blue-600 px-4 py-2 text-white disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
          Generiraj potvrdu
        </button>
      </div>
    </div>
  );
};
