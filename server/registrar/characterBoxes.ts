import { type PDFDocument, type PDFFont, rgb } from "pdf-lib";
import { assertAllowed, type Rect, type Template } from "./templateCatalog.js";

export type CharacterBoxes = { label: string; cells: Rect[] };
const row = (
  page: number,
  x: number,
  top: number,
  count: number,
  width: number,
  height: number,
): Rect[] =>
  Array.from({ length: count }, (_, i) => ({
    page,
    x: x + i * width,
    top,
    width,
    height,
  }));
const hzRow = (label: string, top: number, count = 19): CharacterBoxes => ({
  label,
  cells: row(0, 217.04, top, count, 17.144, 18.44),
});
// PDF points measured from the actual original HŽPP vector grid. Date groups
// have an empty cell-width gap between DD, MM and YYYY; no punctuation is drawn.
export const hzppPersonalBoxes = {
  first_name: hzRow("Ime", 131.43),
  last_name: hzRow("Prezime", 161.19),
  oib: hzRow("OIB", 190.95, 11),
  address: hzRow("Adresa", 220.71),
  city: hzRow("Grad / mjesto", 250.47),
  postal_code: hzRow("Poštanski broj", 280.23, 5),
  country: hzRow("Država", 309.99),
  dob: {
    label: "Datum rođenja",
    cells: [
      ...row(0, 217.04, 340.16, 2, 17.144, 17.66),
      ...row(0, 268.47, 340.16, 2, 17.144, 17.66),
      ...row(0, 319.9, 340.16, 4, 17.144, 17.66),
    ],
  },
} satisfies Record<string, CharacterBoxes>;
export const hzppYearBoxes = (higher: boolean): CharacterBoxes => ({
  label: "Školska / akademska godina",
  cells: [
    ...row(1, higher ? 244.91 : 221.67, 390.12, 4, 17.144, 18.44),
    ...row(1, higher ? 330.63 : 307.39, 390.12, 4, 17.144, 18.44),
  ],
});

export type CombField = {
  label: string;
  area: Rect;
  count: number;
  date?: boolean;
};
const comb = (
  label: string,
  x: number,
  top: number,
  count: number,
  width: number,
  height: number,
  date = false,
): CombField => ({
  label,
  area: { page: 0, x, top, width: count * width, height },
  count,
  date,
});
// Existing interactive fields are kept and filled using native PDF combing.
// Their widget bounds are aligned to the printed grid rather than approximated.
export const zetRegularComb: Record<string, CombField> = {
  text_8exdz: comb("Ime", 67.68, 383.76, 14, 15.72, 14.76),
  text_9evmo: comb("Prezime", 303.48, 383.76, 15, 15.72, 14.76),
  text_13hkah: comb("Datum rođenja", 67.68, 421.2, 8, 15.72, 14.76, true),
  text_14uida: comb("OIB", 209.16, 421.2, 11, 15.72, 14.76),
  text_15xvjz: comb("Broj osobne iskaznice", 397.8, 421.2, 9, 15.72, 14.76),
  text_16aunt: comb("Ulica i kućni broj", 146.28, 460.08, 25, 15.72, 14.76),
  text_17cuyf: comb(
    "Mjesto i poštanski broj",
    177.72,
    479.04,
    23,
    15.72,
    14.76,
  ),
  text_21heoa: comb("MojZET e-pošta", 114.84, 584.76, 27, 15.72, 14.76),
  text_22ealk: comb(
    "MojZET oznaka korisnika",
    224.88,
    603.72,
    20,
    15.72,
    14.76,
  ),
};
export const zetGeneralComb: Record<string, CombField> = {
  text_6zdyy: comb("Ime", 49.08, 397.68, 14, 16.08, 15),
  text_7iznr: comb("Prezime", 290.28, 397.68, 17, 16.08, 15),
  text_13agio: comb("Datum rođenja", 49.08, 436.8, 8, 16.08, 15, true),
  text_14qrej: comb("OIB", 209.88, 436.8, 11, 16.08, 15),
  text_15rawu: comb("Broj osobne iskaznice", 418.92, 436.8, 9, 16.08, 15),
  text_8lkti: comb("Ulica i kućni broj", 129.48, 477.36, 27, 16.08, 15),
  text_9cgks: comb("Mjesto i poštanski broj", 161.64, 497.64, 25, 16.08, 15),
  text_10fdwb: comb("Kontakt telefon", 177.72, 517.92, 15, 16.08, 15),
  text_11mdkv: comb("MojZET e-pošta", 97.32, 577.08, 29, 16.08, 15),
  text_12xasy: comb("MojZET oznaka korisnika", 225.96, 597.36, 21, 16.08, 15),
};
export function boxCharacters(
  value: unknown,
  label: string,
  capacity: number,
): string[] {
  const characters = Array.from(
    String(value ?? "")
      .normalize("NFC")
      .replace(/[\u0000-\u001f]/g, " ")
      .trim(),
  );
  if (characters.length > capacity)
    throw new Error(
      `${label}: podatak ima ${characters.length} znakova, a izvorni obrazac ${capacity} kućica. Podatak nije moguće ispisati bez skraćivanja.`,
    );
  return characters;
}
export function boxedBirthDate(value: unknown): string {
  if (!value) return "";
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})(?:$|T)/);
  if (!match)
    throw new Error(
      "Datum rođenja mora biti valjan datum iz matične evidencije.",
    );
  return match[3] + match[2] + match[1];
}
export function drawCharacterBoxes(
  pdf: PDFDocument,
  font: PDFFont,
  template: Template,
  layout: CharacterBoxes,
  value: unknown,
  size = 11,
) {
  const characters = boxCharacters(value, layout.label, layout.cells.length);
  for (const [index, character] of characters.entries()) {
    const cell = layout.cells[index];
    assertAllowed(template, cell);
    if (character === " ") continue; // Word spaces consume a cell, keeping later letters aligned.
    let fontSize = size;
    while (
      fontSize > 5.5 &&
      (font.widthOfTextAtSize(character, fontSize) > cell.width - 3 ||
        font.heightAtSize(fontSize) > cell.height - 2)
    )
      fontSize -= 0.25;
    if (
      font.widthOfTextAtSize(character, fontSize) > cell.width - 3 ||
      font.heightAtSize(fontSize) > cell.height - 2
    )
      throw new Error(
        `${layout.label}: znak ne stane u kućicu izvornog obrasca.`,
      );
    const page = pdf.getPage(cell.page),
      ascent = font.heightAtSize(fontSize, { descender: false }),
      height = font.heightAtSize(fontSize);
    page.drawText(character, {
      font,
      size: fontSize,
      x:
        cell.x + (cell.width - font.widthOfTextAtSize(character, fontSize)) / 2,
      y: page.getHeight() - cell.top - cell.height / 2 - ascent + height / 2,
      color: rgb(0, 0, 0),
    });
  }
}
