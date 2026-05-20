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
  if (!subjectType || subjectType.toLowerCase() === 'redovni') {
    return subjectName;
  }
  const suffix = subjectType.toLowerCase();
  
  return `${subjectName} (${suffix})`;
}
