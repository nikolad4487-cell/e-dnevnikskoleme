interface FinalThesisClassInfo {
  name?: string | null;
  gradeLevel?: number | string | null;
  durationYears?: number | string | null;
}

function normalizeClassName(name?: string | null): string {
  return String(name || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}

const EXPLICIT_FINAL_THESIS_CLASSES = new Set(['3.A', '3.B', '4.C', '4.I']);

/**
 * Završni radovi dostupni su samo završnom razredu programa.
 *
 * Za trenutačnu školsku strukturu 3.A, 3.B, 4.C i 4.I moraju imati modul.
 * 4.K je izričito nezavršni razred i ne smije ga vidjeti čak ni ako su podaci
 * o trajanju programa u bazi nepotpuni ili pogrešni.
 */
export function isFinalThesisClass({
  name,
  gradeLevel,
  durationYears,
}: FinalThesisClassInfo): boolean {
  const normalizedName = normalizeClassName(name);

  if (normalizedName === '4.K') {
    return false;
  }

  if (EXPLICIT_FINAL_THESIS_CLASSES.has(normalizedName)) {
    return true;
  }

  const grade = Number(gradeLevel);
  const duration = Number(durationYears);

  return Number.isFinite(grade) &&
    Number.isFinite(duration) &&
    grade > 0 &&
    duration > 0 &&
    grade === duration;
}
