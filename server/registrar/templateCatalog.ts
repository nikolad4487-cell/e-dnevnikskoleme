// All coordinates are PDF points measured from the TOP LEFT of the original page.
// Endorsement is opt-in and restricted to these per-template rectangles.
export type Rect = {
  page: number;
  x: number;
  top: number;
  width: number;
  height: number;
};
export type Template = {
  file?: string;
  pages: number;
  year?: string;
  stamp?: Rect;
  signature?: Rect;
  forbidden: Rect[];
};
const rect = (
  page: number,
  x: number,
  top: number,
  width: number,
  height: number,
): Rect => ({ page, x, top, width, height });
export const templateCatalog: Record<string, Template> = {
  attendance: {
    pages: 1,
    stamp: rect(0, 270, 670, 82, 82),
    signature: rect(0, 370, 710, 140, 35),
    forbidden: [],
  },
  transcript: {
    pages: 1,
    stamp: rect(0, 270, 700, 72, 72),
    signature: rect(0, 370, 733, 140, 30),
    forbidden: [],
  },
  "zet-regular-2026-2027": {
    file: "zet-regular-2026-2027.pdf",
    pages: 2,
    year: "2026/2027",
    stamp: rect(0, 90, 721, 45, 22),
    signature: rect(0, 150, 721, 75, 22),
    forbidden: [
      rect(0, 250, 690, 150, 90),
      rect(0, 405, 690, 140, 90),
      rect(0, 295, 50, 255, 80),
      rect(1, 0, 0, 595.32, 841.93),
    ],
  },
  "zet-general": {
    file: "zet-general.pdf",
    pages: 2,
    forbidden: [
      rect(0, 290, 100, 280, 65),
      rect(0, 350, 680, 190, 95),
      rect(1, 0, 0, 595.28, 841.89),
    ],
  },
  "hzpp-pupil": {
    file: "hzpp-pupil.pdf",
    pages: 2,
    stamp: rect(1, 280, 465, 82, 65),
    signature: rect(1, 370, 487, 150, 32),
    forbidden: [
      rect(0, 20, 448, 525, 64),
      rect(0, 20, 585, 530, 200),
      rect(1, 20, 635, 540, 160),
    ],
  },
  "hzpp-student": {
    file: "hzpp-student.pdf",
    pages: 2,
    stamp: rect(1, 280, 465, 82, 65),
    signature: rect(1, 370, 487, 150, 32),
    forbidden: [
      rect(0, 20, 448, 525, 64),
      rect(0, 20, 585, 530, 200),
      rect(1, 20, 635, 540, 160),
    ],
  },
  "transport-75-2026-2027": {
    file: "transport-75-2026-2027.pdf",
    pages: 2,
    year: "2026/2027",
    stamp: rect(0, 355, 463, 52, 29),
    signature: rect(0, 425, 472, 100, 20),
    forbidden: [rect(0, 50, 510, 500, 225), rect(1, 0, 0, 595.28, 841.89)],
  },
  "transport-100-social-2026-2027": {
    file: "transport-100-social-2026-2027.pdf",
    pages: 2,
    year: "2026/2027",
    stamp: rect(0, 340, 449, 45, 20),
    signature: rect(0, 405, 449, 100, 20),
    forbidden: [rect(0, 50, 486, 495, 170), rect(1, 0, 0, 595.28, 841.89)],
  },
  "transport-100-veterans-2026-2027": {
    file: "transport-100-veterans-2026-2027.pdf",
    pages: 2,
    year: "2026/2027",
    stamp: rect(0, 355, 470, 45, 21),
    signature: rect(0, 425, 470, 100, 21),
    forbidden: [rect(0, 50, 514, 500, 215), rect(1, 0, 0, 595.28, 841.89)],
  },
};
export function overlaps(a: Rect, b: Rect) {
  return (
    a.page === b.page &&
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.top < b.top + b.height &&
    a.top + a.height > b.top
  );
}
export function assertAllowed(template: Template, area: Rect) {
  if (
    area.page < 0 ||
    area.page >= template.pages ||
    area.width <= 0 ||
    area.height <= 0 ||
    template.forbidden.some((r) => overlaps(r, area))
  )
    throw new Error("Područje pripada drugom potpisniku ili nije dopušteno.");
}
