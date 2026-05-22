
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
  principal_signature_url?: string;
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
