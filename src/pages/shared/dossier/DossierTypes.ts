export interface DossierStudent {
  id: string;
  name: string;
  email?: string;
  oib?: string;
  dob?: string;
  pob?: string;
  address?: string;
  program_adjustment?: string;
  class_id?: string;
  status?: string;
  classes?: {
    id: string;
    name: string;
    school_year?: string;
  };
}

export interface Placement {
  id: string;
  student_id: string;
  class_id?: string;
  school_id?: string;
  school_year?: string;
  company_name: string;
  company_oib?: string;
  company_address?: string;
  mentor_name?: string;
  mentor_contact?: string;
  start_date?: string;
  end_date?: string;
  created_at?: string;
}

export interface PracticumLog {
  id: string;
  placement_id?: string;
  student_id: string;
  date: string;
  hours_worked: number;
  activity_description: string;
  mentor_signature: 'Potpisano' | 'Nije potpisano';
  signed_at?: string;
}

export interface PracticumEvaluation {
  id: string;
  placement_id: string;
  student_id: string;
  engagement_grade: number;
  expertise_grade: number;
  communication_grade: number;
  final_grade: number;
  notes?: string;
  evaluator_name?: string;
}

export interface StudentRegistration {
  id: string;
  student_id: string;
  action_type: 'UPIS' | 'ISPIS' | 'PREMJESTAJ' | 'PRIJELAZ_IZ' | 'PRIJELAZ_U';
  date: string;
  reason?: string;
  former_class_name?: string;
  new_class_name?: string;
  other_school_name?: string;
  details?: string;
  registered_by?: string;
}

export interface StudentTransfer {
  id: string;
  date: string;
  student_id: string;
  action_type: string;
  former_class_name: string;
  new_class_name: string;
  school_name: string;
  reason: string;
}

export interface Competition {
  id: string;
  student_id: string;
  school_id?: string;
  subject_name: string;
  mentor_name?: string;
  level: 'Školsko' | 'Županijsko' | 'Državno' | 'Međunarodno';
  result?: string;
  placement?: string;
  date?: string;
}

export interface Payment {
  id: string;
  student_id: string;
  class_id?: string;
  school_id?: string;
  purpose: string;
  amount: number;
  date: string;
  status: 'PLAĆENO' | 'DJELOMIČNO PLAĆENO' | 'NIJE PLAĆENO';
  receipt_number?: string;
}
