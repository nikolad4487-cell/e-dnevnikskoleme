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

export function formatName(item: { name?: string | null, surname?: string | null }) {
  if (item.name && item.name.length > 0) return item.name;
  return [item.name, item.surname].filter(s => s && s.trim().length > 0).join(' ');
}
