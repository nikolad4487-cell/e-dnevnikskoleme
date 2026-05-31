
export type SchoolDocumentSettings = {
  id: string;
  school_id: string;
  school_name?: string;
  school_name_print?: string;
  oib?: string;
  city?: string;
  county?: string;
  principal_name?: string;
  principal_title?: string;
  school_number?: string;
  default_klasa?: string;
  default_urbroj?: string;
  stamp_image_url?: string;
  stamp_url?: string;
  stamp_path?: string;
  signature_url?: string;
  signature_path?: string;
  principal_signature_url?: string;
  principal_signature_path?: string;
  teacher_signature_url?: string;
  teacher_signature_path?: string;
  overall_success_label?: string;
  conduct_label?: string;
  certificate_place?: string;
  certificate_date?: string;
  desired_school_name?: string;
  homeroom_teacher_title?: string;
  updated_at: string;
};

export type StudentDocument = {
  id: string;
  student_id: string;
  school_year_id?: string;
  class_id?: string;
  document_type: 'CLASS_CERTIFICATE' | 'FINAL_CERTIFICATE' | 'FINAL_THESIS_CERTIFICATE' | 'SUPPLEMENTARY_EXAM_CERTIFICATE' | 'DIFFERENTIAL_EXAM_CERTIFICATE' | 'MAKEUP_EXAM_CERTIFICATE';
  document_number?: string;
  klasa?: string;
  urbroj?: string;
  issue_date?: string;
  status: 'DRAFT' | 'PROBATIONARY' | 'LOCKED';
  locked?: boolean;
  locked_at?: string;
  locked_by?: string;
  pdf_url?: string;
  created_at: string;
};

export type FinalThesis = {
  id: string;
  student_id: string;
  school_year_id?: string;
  thesis_title?: string;
  mentor_name?: string;
  creation_grade?: number;
  defense_grade?: number;
  creation_date?: string;
  defense_date?: string;
  exam_period?: string;
  created_at: string;
};

export type SpecialExam = {
  id: string;
  student_id: string;
  exam_type: 'DIFFERENTIAL' | 'SUPPLEMENTARY' | 'MAKEUP';
  subject_name?: string;
  grade?: number;
  exam_date?: string;
  exam_period?: string;
  school_year_id?: string;
  created_at: string;
};
