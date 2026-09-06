export const TEMPLATE_BY_SUBJECT: Record<string, string[]> = {
  "biologija s higijenom i ekologijom": ["usvojenost nastavnih sadržaja", "primjena nastavnih sadržaja", "samostalni rad"],
  "engleski jezik i": ["čitanje i slušanje s razumijevanjem", "govorenje", "pisanje", "jezično posredovanje"],
  "etika": ["moralno i etičko djelovanje", "moralno i etičko promišljanje"],
  "francuski jezik ii": ["čitanje i slušanje s razumijevanjem", "govorenje", "pisanje", "jezično posredovanje"],
  "gospodarska matematika": ["usvojenost znanja i vještina", "rješavanje problema"],
  "gospodarsko pravo": ["usvojenost nastavnih sadržaja", "primjena nastavnih sadržaja", "samostalni rad"],
  "hrvatski jezik": ["jezik", "književnost", "pisano izražavanje", "usmeno izražavanje", "lektira"],
  "knjigovodstvo": ["usvojenost nastavnih sadržaja", "primjena nastavnih sadržaja", "samostalni rad"],
  "kuharstvo": ["usmeno", "vježbe", "higijena", "samostalni rad"],
  "kuharstvo (sa slastičarstvom)": ["usmeno", "vježbe", "higijena", "samostalni rad"],
  "marketing u turizmu": ["usvojenost nastavnih sadržaja", "primjena nastavnih sadržaja", "samostalni rad"],
  "njemački jezik i": ["čitanje i slušanje s razumijevanjem", "govorenje", "pisanje", "jezično posredovanje"],
  "njemački jezik ii": ["čitanje i slušanje s razumijevanjem", "govorenje", "pisanje", "jezično posredovanje"],
  "organizacija poslovanja ugostiteljskih poduzeća": ["usvojenost nastavnih sadržaja", "primjena nastavnih sadržaja", "samostalni rad"],
  "osnove turizma": ["usvojenost nastavnih sadržaja", "primjena nastavnih sadržaja", "samostalni rad"],
  "politika i gospodarstvo": ["usvojenost nastavnih sadržaja", "primjena nastavnih sadržaja", "samostalni rad"],
  "poslovna psihologija s komunikacijom": ["usvojenost nastavnih sadržaja", "primjena nastavnih sadržaja", "samostalni rad"],
  "poslovno dopisivanje": ["usvojenost nastavnih sadržaja", "primjena nastavnih sadržaja", "samostalni rad"],
  "povijest": ["činjenično znanje", "uzročno-posljedično zaključivanje", "snalaženje u vremenu i prostoru"],
  "povijest hrvatske kulturne baštine": ["usvojenost nastavnih sadržaja - usmeno", "usvojenost nastavnih sadržaja - pisano", "aktivnost i kreativnost"],
  "poznavanje robe i prehrana": ["usvojenost nastavnih sadržaja", "primjena nastavnih sadržaja", "samostalni rad"],
  "praktična nastava": ["stručni rad", "radna higijena", "radna disciplina", "dnevnik rada", "dokumentacija praktične nastave"],
  "promet i putničke agencije": ["usvojenost nastavnih sadržaja", "primjena nastavnih sadržaja", "samostalni rad"],
  "računalstvo": ["usvojenost nastavnih sadržaja", "primjena nastavnih sadržaja", "samostalni rad"],
  "računovodstvo i kontrola": ["usvojenost nastavnih sadržaja", "primjena nastavnih sadržaja", "samostalni rad"],
  "recepcijsko poslovanje": ["usvojenost nastavnih sadržaja", "primjena nastavnih sadržaja", "samostalni rad"],
  "slastičarstvo": ["usmeno", "vježbe", "higijena", "samostalni rad"],
  "statistika": ["usvojenost nastavnih sadržaja", "primjena nastavnih sadržaja", "samostalni rad"],
  "talijanski jezik ii": ["čitanje i slušanje s razumijevanjem", "govorenje", "pisanje", "jezično posredovanje"],
  "tjelesna i zdravstvena kultura": ["motorička znanja", "motorička postignuća i sposobnosti", "zdravstveni i odgojni učinci tjelesne aktivnosti"],
  "turistički zemljopis": ["geografska znanja", "geografske vještine", "kartografska pismenost"],
  "ugostiteljsko posluživanje": ["usmeno", "vježbe", "higijena", "samostalni rad"],
  "vjeronauk": ["znanje", "stvaralačko izražavanje", "kultura međusobnog komuniciranja"]
};

export function normalizeGradingTemplateSubjectName(subjectName: string): string {
  return String(subjectName || "")
    .toLowerCase()
    .replace(/\s*\((izborni|praksa)\)\s*$/i, "")
    .trim();
}

export function getDefaultGradingElementsForSubject(subjectName: string): string[] {
  const normalized = normalizeGradingTemplateSubjectName(subjectName);
  if (normalized === "sat razrednika") return [];
  return TEMPLATE_BY_SUBJECT[normalized] || [];
}

export function getDefaultGradingElementOrder(subjectName: string, elementName: string): number | null {
  const elements = getDefaultGradingElementsForSubject(subjectName);
  const index = elements.findIndex(name => name.toLowerCase().trim() === String(elementName || "").toLowerCase().trim());
  return index === -1 ? null : index;
}

export function sortGradingElementsForSubject<T extends { name?: string | null; displayOrder?: number | null; display_order?: number | null }>(
  subjectName: string,
  elements: T[]
): T[] {
  return [...elements].sort((a, b) => {
    const aTemplateOrder = getDefaultGradingElementOrder(subjectName, a.name || "");
    const bTemplateOrder = getDefaultGradingElementOrder(subjectName, b.name || "");
    if (aTemplateOrder !== null && bTemplateOrder !== null) return aTemplateOrder - bTemplateOrder;
    if (aTemplateOrder !== null) return -1;
    if (bTemplateOrder !== null) return 1;
    const aOrder = Number(a.displayOrder ?? a.display_order ?? 9999);
    const bOrder = Number(b.displayOrder ?? b.display_order ?? 9999);
    if (aOrder !== bOrder) return aOrder - bOrder;
    return String(a.name || "").localeCompare(String(b.name || ""), "hr", { sensitivity: "base" });
  });
}

export async function ensureDefaultGradingElementsForAssignment(
  supabaseClient: any,
  assignment: {
    schoolId?: string | null;
    classId?: string | null;
    subjectId?: string | null;
    teacherId?: string | null;
    subjectName?: string | null;
  }
) {
  const elements = getDefaultGradingElementsForSubject(assignment.subjectName || "");
  if (!assignment.classId || !assignment.subjectId || !assignment.teacherId || elements.length === 0) return;

  const { data: existing, error: existingError } = await supabaseClient
    .from("grading_elements")
    .select("name")
    .eq("class_id", assignment.classId)
    .eq("subject_id", assignment.subjectId);

  if (existingError) {
    console.warn("Default grading elements could not be checked:", existingError);
    return;
  }

  const existingNames = new Set((existing || []).map((row: { name?: string | null }) => String(row.name || "").toLowerCase().trim()));
  const rows = elements
    .map((name, displayOrder) => ({ name, displayOrder }))
    .filter(({ name }) => !existingNames.has(name.toLowerCase().trim()))
    .map(({ name, displayOrder }) => ({
    school_id: assignment.schoolId || null,
    class_id: assignment.classId,
    subject_id: assignment.subjectId,
    teacher_id: assignment.teacherId,
    name,
    display_order: displayOrder
  }));

  if (rows.length === 0) return;

  const { error } = await supabaseClient
    .from("grading_elements")
    .insert(rows);

  if (error && error.code !== "23505") {
    console.warn("Default grading elements could not be applied:", error);
  }
}

export async function ensureDefaultGradingElementsForAssignments(supabaseClient: any, assignments: Parameters<typeof ensureDefaultGradingElementsForAssignment>[1][]) {
  for (const assignment of assignments) {
    await ensureDefaultGradingElementsForAssignment(supabaseClient, assignment);
  }
}
