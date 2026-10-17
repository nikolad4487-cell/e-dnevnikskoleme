import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPlanningSchedule, planningMonday } from '../src/lib/planningSchedule';
import type { WorkWeek } from '../src/types';

const morning = { id: 'morning', classId: 'A', startDate: '2026-10-19', endDate: '2026-10-25', shift: 'Ujutro', isTeachingWeek: true, teachingDays: ['2026-10-19', '2026-10-21'] } as WorkWeek;
const afternoon = { ...morning, id: 'afternoon', startDate: '2026-10-26', endDate: '2026-11-01', shift: 'Popodne', teachingDays: ['2026-10-26'] } as WorkWeek;
const cells = [
  { id: 'am', classId: 'A', dayOfWeek: 'PON', shift: 'MORNING', periodNumber: 2 },
  { id: 'pm', classId: 'A', dayOfWeek: 'PON', shift: 'AFTERNOON', periodNumber: 0 },
  { id: 'wed', classId: 'A', dayOfWeek: 'SRI', shift: 'MORNING', periodNumber: 3 },
  { id: 'other', classId: 'B', dayOfWeek: 'PON', shift: 'MORNING', periodNumber: 1 },
];
const assignments = cells.map(c => ({id: `subject-${c.id}`, scheduleCellId: c.id, subjectId: c.id === 'wed' ? 'croatian' : 'math'}));

test('week dates stay on local Monday across Sunday and year boundaries', () => {
  assert.equal(planningMonday('2026-10-25'), '2026-10-19');
  assert.equal(planningMonday('2027-01-01'), '2026-12-28');
});
test('the displayed week selects its own shift and excludes another class', () => {
  const am = buildPlanningSchedule('2026-10-19', 'A', [morning, afternoon], cells, assignments);
  const pm = buildPlanningSchedule('2026-10-26', 'A', [morning, afternoon], cells, assignments);
  assert.deepEqual(am[0].entries.map(e => e.id), ['am']);
  assert.deepEqual(pm[0].entries.map(e => e.id), ['pm']);
  assert.equal(pm[0].entries[0].periodNumber, 0);
});
test('missing work week keeps both shifts available instead of inventing one', () => {
  const days = buildPlanningSchedule('2026-11-02', 'A', [morning, afternoon], cells, assignments);
  assert.equal(days[0].week, undefined);
  assert.deepEqual(days[0].entries.map(e => e.id), ['am', 'pm']);
});
test('non-teaching days and holidays do not suggest regular lessons', () => {
  const days = buildPlanningSchedule('2026-10-19', 'A', [{...morning, teachingDays: ['2026-10-21']}], cells, assignments);
  assert.equal(days[0].teaching, false);
  assert.deepEqual(days[0].entries, []);
  const holiday = buildPlanningSchedule('2026-10-19', 'A', [{...morning, weekType: 'SCHOOL_HOLIDAY'}], cells, assignments);
  assert.equal(holiday.every(day => !day.teaching && !day.entries.length), true);
});
test('all-day weeks retain both shifts and assigned subjects', () => {
  const days = buildPlanningSchedule('2026-10-19', 'A', [{...morning, shift: 'Cjelodnevna'}], cells, assignments);
  assert.deepEqual(days[0].entries.map(e => e.id), ['am', 'pm']);
  assert.equal(days[2].entries[0].subjects[0].subjectId, 'croatian');
});
