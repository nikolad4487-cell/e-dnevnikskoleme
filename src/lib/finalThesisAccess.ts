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

/**
 * Završni radovi dostupni su samo završnom razredu programa.
 * 4.K je izričito nezavršni razred i ne smije vidjeti modul čak ni ako
 * podaci o trajanju programa u bazi pogrešno izgledaju kao četverogodišnji.
 */
export function isFinalThesisClass({
  name,
  gradeLevel,
  durationYears,
}: FinalThesisClassInfo): boolean {
  if (normalizeClassName(name) === '4.K') {
    return false;
  }

  const grade = Number(gradeLevel);
  const duration = Number(durationYears);

  return Number.isFinite(grade) &&
    Number.isFinite(duration) &&
    grade > 0 &&
    duration > 0 &&
    grade === duration;
}
