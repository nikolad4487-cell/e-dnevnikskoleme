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
  stampMark?: Rect; // Explicit M.P. label on our own generated documents only.
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
    stamp: rect(0, 270, 700, 100, 100),
    signature: rect(0, 365, 727, 170, 43),
    stampMark: rect(0, 310, 744, 24, 12),
    forbidden: [],
  },
  transcript: {
    pages: 1,
    stamp: rect(0, 270, 700, 100, 100),
    signature: rect(0, 365, 727, 170, 43),
    stampMark: rect(0, 310, 744, 24, 12),
    forbidden: [],
  },
  "zet-regular-2026-2027": {
    file: "zet-regular-2026-2027.pdf",
    pages: 2,
    year: "2026/2027",
    stamp: rect(0, 100, 708, 70, 70),
    signature: rect(0, 90, 719, 140, 24),
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
    stamp: rect(1, 365, 412, 90, 90),
    signature: rect(1, 350, 414, 180, 37),
    forbidden: [
      rect(0, 20, 448, 525, 64),
      rect(0, 20, 585, 530, 200),
      rect(1, 20, 635, 540, 160),
    ],
  },
  "hzpp-student": {
    file: "hzpp-student.pdf",
    pages: 2,
    stamp: rect(1, 365, 412, 90, 90),
    signature: rect(1, 350, 414, 180, 37),
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
    stamp: rect(0, 435, 461.7, 48, 48),
    signature: rect(0, 385, 465.8, 150, 27),
    forbidden: [rect(0, 50, 510, 500, 225), rect(1, 0, 0, 595.28, 841.89)],
  },
  "transport-100-social-2026-2027": {
    file: "transport-100-social-2026-2027.pdf",
    pages: 2,
    year: "2026/2027",
    stamp: rect(0, 423, 451.1, 34, 34),
    signature: rect(0, 370, 451.1, 140, 18),
    forbidden: [rect(0, 50, 486, 495, 170), rect(1, 0, 0, 595.28, 841.89)],
  },
  "transport-100-veterans-2026-2027": {
    file: "transport-100-veterans-2026-2027.pdf",
    pages: 2,
    year: "2026/2027",
    stamp: rect(0, 433, 472.9, 41, 41),
    signature: rect(0, 385, 473.1, 150, 18),
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
