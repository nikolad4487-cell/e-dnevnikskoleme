import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const getSurname = (fullName?: string) => {
  if (!fullName) return '';
  const parts = fullName.trim().split(/\s+/);
  return parts[parts.length - 1] || '';
};

function unwrapPerson(value: any): any {
  if (!value) return {};

  for (const key of ['student', 'teacher', 'user', 'profile', 'user_profile', 'user_profiles']) {
    const nested = value[key];
    if (nested) return Array.isArray(nested) ? (nested[0] || value) : nested;
  }

  return value;
}

export function getPersonNameParts(value: any): { firstName: string; lastName: string } {
  const person = unwrapPerson(value);
  const explicitFirst = String(
    person.firstName || person.first_name || person.given_name || ''
  ).trim();
  const explicitLast = String(
    person.lastName || person.last_name || person.surname || person.family_name || ''
  ).trim();
  const storedName = String(
    person.fullName || person.full_name || person.display_name || person.name || ''
  ).trim();

  if (explicitFirst || explicitLast) {
    return {
      firstName: explicitFirst || storedName,
      lastName: explicitLast,
    };
  }

  const parts = storedName.split(/\s+/).filter(Boolean);
  if (parts.length <= 1) {
    return { firstName: storedName, lastName: '' };
  }

  return {
    firstName: parts.slice(0, -1).join(' '),
    lastName: parts[parts.length - 1],
  };
}

export function comparePeopleBySurname(a: any, b: any): number {
  const personA = getPersonNameParts(a);
  const personB = getPersonNameParts(b);
  const options: Intl.CollatorOptions = { sensitivity: 'base' };

  return (
    personA.lastName.localeCompare(personB.lastName, 'hr', options)
    || personA.firstName.localeCompare(personB.firstName, 'hr', options)
  );
}

export function sortPeopleBySurname<T>(people: T[] | null | undefined): T[] {
  return [...(people || [])].sort(comparePeopleBySurname);
}

export function sortStudentsBySurname<T>(students: T[] | null | undefined): T[] {
  return sortPeopleBySurname(students);
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

  const unwrapped = unwrapPerson(person);
  const { firstName, lastName } = getPersonNameParts(unwrapped);
  const storedName = String(unwrapped.fullName || unwrapped.full_name || unwrapped.display_name || unwrapped.name || '').trim();
  const storedAlreadyContainsLastName = lastName
    && storedName.toLocaleLowerCase('hr-HR').endsWith(lastName.toLocaleLowerCase('hr-HR'));

  return [storedAlreadyContainsLastName ? storedName : firstName, storedAlreadyContainsLastName ? '' : lastName]
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
  const t = subjectType.toUpperCase().trim();
  if (t === 'REDOVNI') {
    return cleaned;
  }
  if (t === 'IZBORNI') {
    return `${cleaned} (izborni)`;
  }
  return `${cleaned} (${subjectType})`;
}

export function normalizeSubjectType(type: string | null | undefined): 'REDOVNI' | 'IZBORNI' | 'PRAKSA' {
  const value = String(type || "").toUpperCase().trim();

  if (value === "IZBORNI" || value === "ELECTIVE") return "IZBORNI";
  if (value === "PRAKSA" || value === "PRACTICE") return "PRAKSA";
  if (value === "REDOVNI" || value === "REQUIRED") return "REDOVNI";

  return "REDOVNI";
}

export function getClassSubjectDisplayName(classSubject: any) {
  const name =
    classSubject.subject?.name ||
    classSubject.subjects?.name ||
    classSubject.name ||
    classSubject.subject_name ||
    "";

  const type = normalizeSubjectType(
    classSubject.subject_type ||
    classSubject.type ||
    classSubject.subjectType
  );

  if (type === "IZBORNI") return `${name} (izborni)`;
  if (type === "PRAKSA") return `${name} (praksa)`;

  return name;
}

export function sanitizeSubjectType(type: string | null | undefined): 'REDOVNI' | 'IZBORNI' {
  if (!type) return 'REDOVNI';
  const val = type.toUpperCase().trim();
  if (val === 'IZBORNI' || val === 'ELECTIVE' || val.includes('IZBORNI') || val.includes('ELECTIVE')) {
    return 'IZBORNI';
  }
  return 'REDOVNI';
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
