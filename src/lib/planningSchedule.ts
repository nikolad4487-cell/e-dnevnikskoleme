import { addDays, format, isValid, parseISO, startOfWeek } from 'date-fns';
import type { WorkWeek } from '../types';

export interface PlanningScheduleCell {
  id: string;
  classId: string;
  dayOfWeek: string;
  shift: string;
  periodNumber: number;
}
export interface PlanningScheduleSubject {
  id: string;
  scheduleCellId: string;
  subjectId: string;
  classroom?: string;
}
export const planningDays = ['PON', 'UTO', 'SRI', 'ČET', 'PET', 'SUB', 'NED'];
export function planningMonday(date: string) {
  const parsed = parseISO(date);
  return format(startOfWeek(isValid(parsed) ? parsed : new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');
}
export function planningShift(value?: string): 'MORNING' | 'AFTERNOON' | 'ALL_DAY' | null {
  const normalized = String(value || '').trim().toUpperCase();
  if (['POPODNE', 'POPODNEVNA', 'AFTERNOON', 'PM'].includes(normalized)) return 'AFTERNOON';
  if (['UJUTRO', 'JUTRO', 'JUTARNJA', 'MORNING', 'AM'].includes(normalized)) return 'MORNING';
  if (['CJELODNEVNA', 'ALL_DAY'].includes(normalized)) return 'ALL_DAY';
  return null;
}
const normalizeDay = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();

export function buildPlanningSchedule(anchor: string, classId: string, weeks: WorkWeek[], cells: PlanningScheduleCell[], assignments: PlanningScheduleSubject[]) {
  const monday = parseISO(planningMonday(anchor));
  return planningDays.map((label, index) => {
    const date = format(addDays(monday, index), 'yyyy-MM-dd');
    const week = weeks.filter(w => w.classId === classId && w.startDate <= date && w.endDate >= date)
      .sort((a, b) => b.startDate.localeCompare(a.startDate))[0];
    const teaching = !week || (week.isTeachingWeek !== false && week.isInstructional !== false &&
      !['NON_INSTRUCTIONAL', 'SCHOOL_HOLIDAY'].includes(week.weekType || '') &&
      (!Array.isArray(week.teachingDays) || week.teachingDays.includes(date)));
    const shift = planningShift(week?.shift);
    const entries = teaching ? cells.filter(cell => cell.classId === classId && normalizeDay(cell.dayOfWeek) === normalizeDay(label) &&
      (!shift || shift === 'ALL_DAY' || planningShift(cell.shift) === shift))
      .map(cell => ({ ...cell, subjects: assignments.filter(a => a.scheduleCellId === cell.id) }))
      .filter(cell => cell.subjects.length > 0)
      .sort((a, b) => (planningShift(a.shift) === 'AFTERNOON' ? 1 : 0) - (planningShift(b.shift) === 'AFTERNOON' ? 1 : 0) || a.periodNumber - b.periodNumber) : [];
    return { date, label, week, teaching, shift, entries };
  });
}
