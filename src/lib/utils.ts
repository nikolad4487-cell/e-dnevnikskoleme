import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const ZAGREB_TIME_ZONE = "Europe/Zagreb";

export function getLocalDateISO(date: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat("sv-SE", {
    timeZone: ZAGREB_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  return formatter.format(date);
}

export function formatCroatianDate(value?: string | Date | null): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("hr-HR", {
    timeZone: ZAGREB_TIME_ZONE,
    day: "numeric",
    month: "numeric",
    year: "numeric"
  });
}

export function formatCroatianDateTime(value?: string | Date | null): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("hr-HR", {
    timeZone: ZAGREB_TIME_ZONE,
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function getGradeDateBounds(today: Date = new Date()): { min: string; max: string } {
  const currentDate = new Date(getLocalDateISO(today));
  const minDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
  const maxDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
  return {
    min: getLocalDateISO(minDate),
    max: getLocalDateISO(maxDate)
  };
}

export function isGradeDateAllowed(dateValue?: string | null, today: Date = new Date()): boolean {
  if (!dateValue) return false;
  const { min, max } = getGradeDateBounds(today);
  return dateValue >= min && dateValue <= max;
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

  const first = String(person.name || person.firstName || person.first_name || '').trim();
  const last = String(person.surname || person.lastName || person.last_name || '').trim();

  // If the first name already includes the last name string, just return the first string.
  // This avoids "Ivan Horvat Horvat" if name is full name and surname is provided.
  if (last && first.toLowerCase().includes(last.toLowerCase())) {
     const n = first;
     if (n.toLowerCase() !== 'undefined' && n.toLowerCase() !== 'null') return n;
     return '';
  }

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

export function cleanModuleOrTrack(value: any): string {
  return String(value || "")
    .replace(/^Modul\s+/i, "")
    .replace(/^Smjer\s+/i, "")
    .trim();
}

export function getProgramDisplayName(program: any, options: { short?: boolean } = {}): string {
  if (!program) return "";

  const name = String(program.name || "").trim();
  const moduleOrTrack = String(program.module_or_track || program.moduleOrTrack || "").trim();

  if (!moduleOrTrack) return name;

  const displayModule = options.short ? cleanModuleOrTrack(moduleOrTrack) : moduleOrTrack;
  return `${name} — ${displayModule}`;
}

export function formatSubjectDisplayName(subjectName: string, subjectType: string) {
  if (!subjectName) return '';
  
  // Clean first: remove existing unwanted suffixes
  const cleaned = subjectName
    .replace(/\s*\(required\)\s*$/i, '')
    .replace(/\s*\(izborni\)\s*$/i, '')
    .replace(/\s*\(Izborni\)\s*$/i, '')
    .replace(/\s*\(elective\)\s*$/i, '')
    .replace(/\s*\(praksa\)\s*$/i, '')
    .replace(/\s*\(Praksa\)\s*$/i, '')
    .replace(/\s*\(practice\)\s*$/i, '')
    .replace(/\s*\(dopunska nastava\)\s*$/i, '')
    .replace(/\s*\(dodatna nastava\)\s*$/i, '')
    .trim();
    
  const resolvedType = getForcedSubjectType(cleaned, subjectType);
  const t = normalizeSubjectType(resolvedType);
  
  if (t === 'IZBORNI') return `${cleaned} (Izborni)`;
  
  if (t === 'PRAKSA') return `${cleaned} (Praksa)`;

  if (t === 'DOPUNSKA_NASTAVA') return `${cleaned} (Dopunska nastava)`;

  if (t === 'DODATNA_NASTAVA') return `${cleaned} (Dodatna nastava)`;
  
  return cleaned;
}

export function formatSubjectName(subject: any) {
  if (!subject) return '';
  
  const name = subject.name || subject.subject_name || '';
  const type = subject.subject_type || subject.type || subject.subjectType || 'REDOVNI';
  
  return formatSubjectDisplayName(name, type);
}

export type NormalizedSubjectType = 'REDOVNI' | 'IZBORNI' | 'PRAKSA' | 'DOPUNSKA_NASTAVA' | 'DODATNA_NASTAVA';

export function normalizeSubjectType(type: string | null | undefined): NormalizedSubjectType {
  const value = String(type || "").toUpperCase().trim();

  if (value === "IZBORNI" || value === "ELECTIVE") return "IZBORNI";
  if (value === "PRAKSA" || value === "PRACTICE") return "PRAKSA";
  if (value === "DOPUNSKA_NASTAVA" || value === "DOPUNSKA NASTAVA" || value === "REMEDIAL") return "DOPUNSKA_NASTAVA";
  if (value === "DODATNA_NASTAVA" || value === "DODATNA NASTAVA" || value === "SUPPLEMENTARY") return "DODATNA_NASTAVA";
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

  return formatSubjectDisplayName(name, type);
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
    'DEPUTY': 'Zamjenik razrednika',
    'MAIN_ADMIN': 'Glavni administrator',
    'SUPER_ADMIN': 'Super administrator'
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

export function normalizeText(value: string | null | undefined): string {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/č/g, "c")
    .replace(/ć/g, "c")
    .replace(/š/g, "s")
    .replace(/ž/g, "z")
    .replace(/đ/g, "d");
}

export function getForcedSubjectType(subjectName: string, selectedType: string): NormalizedSubjectType {
  const name = normalizeText(subjectName);
  
  if (name.includes("prakticna nastava") || name.includes("praksa")) {
    return "PRAKSA";
  }
  
  if (name.includes("izborni") || name.includes("etika") || name.includes("vjeronauk")) {
    return "IZBORNI";
  }
  
  // Normalize the selectedType to standard types, defaulting to REDOVNI
  const val = String(selectedType || "").toUpperCase().trim();
  if (val === "IZBORNI" || val === "ELECTIVE") return "IZBORNI";
  if (val === "PRAKSA" || val === "PRACTICE") return "PRAKSA";
  if (val === "DOPUNSKA_NASTAVA" || val === "DOPUNSKA NASTAVA" || val === "REMEDIAL") return "DOPUNSKA_NASTAVA";
  if (val === "DODATNA_NASTAVA" || val === "DODATNA NASTAVA" || val === "SUPPLEMENTARY") return "DODATNA_NASTAVA";
  return "REDOVNI";
}

