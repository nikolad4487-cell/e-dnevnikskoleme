import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const getSurname = (fullName?: string) => {
  if (!fullName) return '';
  const parts = fullName.trim().split(' ');
  return parts[parts.length - 1] || '';
};

export function sortStudentsBySurname(students: any[]): any[] {
  if (!students) return [];
  return [...students].sort((a, b) => {
    const profileA = a.student ? (Array.isArray(a.student) ? a.student[0] : a.student) : a;
    const profileB = b.student ? (Array.isArray(b.student) ? b.student[0] : b.student) : b;

    const surnameA = String(profileA?.surname || '').trim();
    const surnameB = String(profileB?.surname || '').trim();
    const nameA = String(profileA?.name || '').trim();
    const nameB = String(profileB?.name || '').trim();

    if (surnameA || surnameB) {
      const surnameCompare = surnameA.localeCompare(surnameB, "hr", { sensitivity: "base" });
      if (surnameCompare !== 0) return surnameCompare;
      return nameA.localeCompare(nameB, "hr", { sensitivity: "base" });
    }

    const splitName = (fullName: string) => {
      const parts = fullName.trim().split(/\s+/);
      const lastName = parts.pop() || "";
      const firstName = parts.join(" ");
      return { firstName, lastName };
    };

    const aParsed = splitName(nameA);
    const bParsed = splitName(nameB);

    return (
      aParsed.lastName.localeCompare(bParsed.lastName, "hr", { sensitivity: "base" }) ||
      aParsed.firstName.localeCompare(bParsed.firstName, "hr", { sensitivity: "base" })
    );
  });
}

export function removeDiacritics(str: string): string {
  return (str || '')
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/č/g, 'c').replace(/ć/g, 'c').replace(/ž/g, 'z').replace(/š/g, 's').replace(/đ/g, 'd')
    .replace(/Č/g, 'C').replace(/Ć/g, 'C').replace(/Ž/g, 'Z').replace(/Š/g, 'S').replace(/Đ/g, 'D');
}

export function matchesSearch(text: string, searchTerm: string): boolean {
  if (!searchTerm) return true;
  if (!text) return false;
  return removeDiacritics(text.toLowerCase()).includes(removeDiacritics(searchTerm.toLowerCase()));
}

export function formatPersonName(person: any): string {
  if (!person) return '';

  if (person.name && String(person.name).trim()) {
    const n = String(person.name).trim();
    if (n.toLowerCase() !== 'undefined' && n.toLowerCase() !== 'null') {
      return n;
    }
  }

  const first = person.firstName || person.first_name || '';
  const last = person.lastName || person.last_name || person.surname || '';

  return [first, last]
    .filter(Boolean)
    .map(String)
    .map(v => v.trim())
    .filter(v => v && v.toLowerCase() !== 'undefined' && v.toLowerCase() !== 'null')
    .join(' ');
}

export function formatName(item: any) {
  return formatPersonName(item);
}

export function formatSubjectDisplayName(subjectName: string, subjectType: string) {
  if (!subjectName) return '';
  const cleaned = subjectName.replace(/\s*\((izborni|elective)\)\s*$/i, '').trim();
  if (!subjectType) return cleaned;
  const t = subjectType.toLowerCase().trim();
  if (t === 'redovni' || t === 'required' || t === 'obvezni' || t === 'obvezan' || t === 'required') {
    return cleaned;
  }
  if (t === 'elective' || t === 'izborni') {
    return `${cleaned} (izborni)`;
  }
  return `${cleaned} (${subjectType})`;
}

export function sanitizeSubjectType(type: string | null | undefined): 'REQUIRED' | 'ELECTIVE' {
  if (!type) return 'REQUIRED';
  const val = type.toLowerCase().trim();
  if (val === 'izborni' || val === 'elective' || val.includes('izborni') || val.includes('elective')) {
    return 'ELECTIVE';
  }
  return 'REQUIRED';
}

export const finalGradeLabels: Record<string, string> = {
  "1": "Nedovoljan (1)",
  "2": "Dovoljan (2)",
  "3": "Dobar (3)",
  "4": "Vrlo dobar (4)",
  "5": "Odličan (5)"
};

export const getRoleLabel = (role: string) => {
  const labels: Record<string, string> = {
    'TEACHER': 'Nastavnik',
    'STUDENT': 'Učenik',
    'ADMIN': 'Administrator',
    'SCHOOL_ADMIN': 'Administrator škole',
    'HOMEROOM': 'Razrednik',
    'MAIN_ADMIN': 'Glavni administrator'
  };
  return labels[role] || role;
};

export const getStatusLabel = (status: string) => {
  const labels: Record<string, string> = {
    'HELD': 'Održan',
    'NOT_HELD': 'Nije održan',
    'JUSTIFIED': 'Opravdano',
    'UNJUSTIFIED': 'Neopravdano',
    'PENDING': 'Čeka odluku',
    'OTHER': 'Ostalo'
  };
  return labels[status] || status;
};

export const getChannelTypeLabel = (type: string) => {
  const labels: Record<string, string> = {
    'SUBJECT_CHANNEL': 'Predmetni kanal',
    'PRIVATE': 'Privatni razgovor',
    'CUSTOM_CHANNEL': 'Posebni kanal',
    'CLASS_CHANNEL': 'Razredni kanal'
  };
  return labels[type] || type;
};

export const getGroupLabel = (group: string) => {
  const labels: Record<string, string> = {
    'GROUP_A': 'Grupa A',
    'GROUP_B': 'Grupa B',
    'FULL_CLASS': 'Cijeli razred'
  };
  return labels[group] || group;
};

export const getAbsenceStatusLabel = (status: string) => {
  return getStatusLabel(status);
};
