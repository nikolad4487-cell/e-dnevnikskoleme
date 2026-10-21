import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { PDFDocument, PDFCheckBox, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import monthCoordinates from "./monthCoordinates.js";
import { printableSchoolAddress } from "./schoolAddress.js";
import {
  boxCharacters,
  boxedBirthDate,
  drawCharacterBoxes,
  hzppPersonalBoxes,
  hzppYearBoxes,
  zetGeneralComb,
  zetRegularComb,
} from "./characterBoxes.js";
import {
  assertAllowed,
  templateCatalog,
  type Rect,
} from "./templateCatalog.js";
import {
  enrollmentCertificateBody,
  croatianStudentGender,
} from "../../src/lib/certificateText.js";

const date = (s: string) =>
  s ? new Date(s.slice(0, 10) + "T12:00:00Z").toLocaleDateString("hr-HR") : "";
const root = () => join(process.cwd(), "public");
const clean = (s: unknown) =>
  String(s ?? "")
    .replace(/[\u0000-\u001f]/g, " ")
    .trim();
export type AttestationAssets = { stamp?: Uint8Array; signature?: Uint8Array };
export async function buildRegistrarDocument(
  snapshot: any,
  assets: AttestationAssets = {},
) {
  const kind = snapshot.template,
    template = templateCatalog[kind];
  if (!template) throw new Error("Nepoznat predložak.");
  const pdf = template.file
    ? await PDFDocument.load(
        await readFile(join(root(), "document-templates", template.file)),
      )
    : await PDFDocument.create();
  if (!template.file) pdf.addPage([595.28, 841.89]);
  if (pdf.getPageCount() !== template.pages)
    throw new Error("Izvorni predložak nema očekivani broj stranica.");
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(
    await readFile(join(root(), "fonts", "NotoSans-Regular.ttf")),
    { subset: true },
  );
  const student = snapshot.student,
    school = { ...snapshot.school, address: printableSchoolAddress(snapshot.school.address) },
    inputs = snapshot.inputs || {},
    cls = snapshot.class,
    year = snapshot.year.name;
  const draw = (text: unknown, area: Rect, size = 9) => {
    const value = clean(text);
    if (!value) return;
    assertAllowed(template, {
      ...area,
      page: Math.min(area.page, template.pages - 1),
    });
    const page = pdf.getPage(area.page);
    let fs = size;
    while (fs > 5.5 && font.widthOfTextAtSize(value, fs) > area.width)
      fs -= 0.25;
    if (font.widthOfTextAtSize(value, fs) > area.width)
      throw new Error(
        "Tekst je predug za rubriku izvornog obrasca. Skratite dodatni unos.",
      );
    page.drawText(value, {
      font,
      size: fs,
      x: area.x,
      y: page.getHeight() - area.top - fs,
      color: rgb(0, 0, 0),
    });
  };
  const at = (
    page: number,
    x: number,
    top: number,
    width: number,
    height = 14,
  ): Rect => ({ page, x, top, width, height });
  const check = (page: number, x: number, top: number) =>
    draw("X", at(page, x, top, 12, 12), 9);
  if (kind.startsWith("zet-")) {
    const form = pdf.getForm();
    const general = kind === "zet-general";
    // Some original checkbox appearance streams have stale references. Rebuild their
    // native widget appearances before checking/flattening; keep each original rectangle.
    for (const f of form.getFields())
      if (f instanceof PDFCheckBox) f.updateAppearances();
    const values = general
      ? {
          text_6zdyy: student.first_name,
          text_7iznr: student.last_name,
          text_13agio: date(student.dob),
          text_14qrej: student.oib,
          text_15rawu: inputs.id_card_number,
          text_8lkti: student.address,
          text_9cgks: [student.city, student.postal_code]
            .filter(Boolean)
            .join(" "),
          text_10fdwb: student.phone,
          text_11mdkv: inputs.mojzet_email,
          text_12xasy: inputs.mojzet_code,
          text_16cysw: [school.city, date(snapshot.prepared_at)].join(", "),
        }
      : {
          text_8exdz: student.first_name,
          text_9evmo: student.last_name,
          text_13hkah: date(student.dob),
          text_14uida: student.oib,
          text_15xvjz: inputs.id_card_number,
          text_16aunt: student.address,
          text_17cuyf: [student.city, student.postal_code]
            .filter(Boolean)
            .join(" "),
          text_18ttpn: student.phone,
          text_19indx: school.name,
          text_20roib: [school.address, school.city].filter(Boolean).join(", "),
          text_26ytao: school.education_level === "HIGHER" ? "" : cls.name,
          text_21heoa: inputs.mojzet_email,
          text_22ealk: inputs.mojzet_code,
          text_23cufb: [school.city, date(snapshot.prepared_at)].join(", "),
          text_11bwvm: inputs.pass_number,
          text_12fnqh: inputs.account_email,
        };
    const fieldLabels: Record<string, string> = {
      text_11bwvm: "Broj pretplatne karte",
      text_12fnqh: "E-pošta za izradu pretplatne karte",
      text_18ttpn: "Kontakt telefon",
      text_19indx: "Naziv škole ili fakulteta",
      text_20roib: "Adresa škole ili fakulteta",
      text_26ytao: "Razred",
      text_23cufb: "Mjesto i datum",
      text_16cysw: "Mjesto i datum",
    };
    for (const [key, value] of Object.entries(values)) {
      const field = form.getTextField(key);
      let text = clean(value);
      const layout = (general ? zetGeneralComb : zetRegularComb)[key];
      let size = 9;
      if (layout) {
        assertAllowed(template, layout.area);
        text = boxCharacters(
          layout.date ? boxedBirthDate(student.dob) : text,
          layout.label,
          layout.count,
        ).join("");
        const page = pdf.getPage(layout.area.page);
        for (const widget of field.acroField.getWidgets())
          widget.setRectangle({
            x: layout.area.x,
            y: page.getHeight() - layout.area.top - layout.area.height,
            width: layout.area.width,
            height: layout.area.height,
          });
        field.setMaxLength(layout.count);
        field.enableCombing();
      } else {
        const width = field.acroField.getWidgets()[0].getRectangle().width - 4;
        while (size > 5.5 && font.widthOfTextAtSize(text, size) > width)
          size -= 0.25;
        if (font.widthOfTextAtSize(text, size) > width)
          throw new Error(
            `${fieldLabels[key] || "ZET rubrika"}: podatak ne stane u predviđeno polje izvornog obrasca. Provjerite unos; podatak nije skraćen.`,
          );
      }
      field.setText(text);
      field.setFontSize(size);
      // Original widgets can override the field's font size (for example 14 pt).
      // Clear that override so the comb appearance fits the printed cell height.
      for (const widget of field.acroField.getWidgets())
        widget.setDefaultAppearance("");
      field.updateAppearances(font);
    }
    const requests = general
      ? { CARD: "checkbox_1veao", APP: "checkbox_4tpxb" }
      : {
          CARD: "checkbox_1ptv",
          APP: "checkbox_24kppv",
          RENEW: "checkbox_25aicd",
        };
    const request = requests[inputs.request_type as keyof typeof requests];
    if (!request) throw new Error("Odaberite vrstu ZET zahtjeva.");
    form.getCheckBox(request).check();
    if (!general)
      form
        .getCheckBox(
          school.education_level === "HIGHER"
            ? "checkbox_6gbgg"
            : school.education_level === "ELEMENTARY"
              ? "checkbox_4ktcq"
              : "checkbox_5vv",
        )
        .check();
    // Never infer entitlement to free cable-car travel or sign as the applicant/municipality.
    form.updateFieldAppearances(font);
    form.flatten();
  } else if (kind.startsWith("hzpp-")) {
    for (const [key, layout] of Object.entries(hzppPersonalBoxes))
      drawCharacterBoxes(
        pdf,
        font,
        template,
        layout,
        key === "dob" ? boxedBirthDate(student.dob) : student[key],
      );
    const higher = kind === "hzpp-student";
    check(
      1,
      315,
      higher ? 159 : school.education_level === "ELEMENTARY" ? 121 : 158,
    );
    draw(student.name, at(1, 40, 359, 495, 17), 10);
    const years = String(year).match(/\d{4}/g);
    if (years?.length !== 2)
      throw new Error("Nedostaje ispravna školska / akademska godina.");
    drawCharacterBoxes(
      pdf,
      font,
      template,
      hzppYearBoxes(higher),
      years.join(""),
      10,
    );
    draw(school.name, at(1, 40, 459, 490), 9);
  } else if (kind.startsWith("transport-")) {
    const seventy = kind === "transport-75-2026-2027",
      veterans = kind === "transport-100-veterans-2026-2027";
    const tops = seventy
      ? [119, 137, 155, 171, 193, 211, 229, 247, 330, 368, 387, 429, 448]
      : veterans
        ? [134, 152, 170, 185, 207, 225, 243, 261, 343, 380, 399, 441, 460]
        : [117, 135, 153, 168, 189, 207, 225, 243, 324, 360, 379, 420, 438];
    const carrier = snapshot.transport || [];
    const vals = [
      student.first_name,
      student.last_name,
      student.oib,
      `${school.name} — ${cls.name}`,
      inputs.county,
      student.city,
      inputs.settlement,
      student.address,
      inputs.practice_place,
      inputs.practice_days,
      inputs.practice_route,
      inputs.carrier1 || carrier[0]?.carrier,
      inputs.carrier2 || carrier[1]?.carrier,
    ];
    vals.forEach((v, i) =>
      draw(
        v,
        at(
          0,
          seventy || veterans ? 306 : 297,
          tops[i],
          seventy || veterans ? 228 : 216,
          i === 3 ? 22 : 14,
        ),
        i === 3 ? 7.5 : 8,
      ),
    );
    const bools = [
      inputs.distance_over_5,
      inputs.train_available,
      inputs.practice,
      inputs.combined,
    ];
    const boolTops = seventy
      ? [270, 299, 314, 409]
      : veterans
        ? [284, 312, 327, 421]
        : [266, 294, 308, 400];
    bools.forEach((v, i) => {
      if (v === "YES" || v === "NO")
        check(
          0,
          v === "YES"
            ? seventy || veterans
              ? 347
              : 332
            : seventy || veterans
              ? 487
              : 469,
          boolTops[i],
        );
    });
    const monthOrder = [9, 10, 11, 12, 1, 2, 3, 4, 5, 6, 7, 8];
    for (const month of inputs.months || []) {
      const i = monthOrder.indexOf(Number(month));
      if (i >= 0) {
        const [x, top] = monthCoordinates[kind][i];
        pdf.getPage(0).drawEllipse({
          x,
          y: pdf.getPage(0).getHeight() - top,
          xScale: 7,
          yScale: 7,
          borderColor: rgb(0, 0, 0),
          borderWidth: 0.65,
        });
      }
    }
    draw(
      date(snapshot.prepared_at),
      at(0, 120, seventy ? 482 : veterans ? 481 : 459, 130),
      8,
    );
  } else {
    const page = pdf.getPage(0);
    draw(
      snapshot.settings?.print_school_name || school.name,
      at(0, 55, 55, 485),
      11,
    );
    draw(
      [school.address, school.city].filter(Boolean).join(", "),
      at(0, 55, 75, 485),
      9,
    );
    draw(
      kind === "attendance"
        ? "POTVRDA O REDOVNOM ŠKOLOVANJU"
        : "PRIJEPIS OCJENA",
      at(0, 90, 130, 430),
      15,
    );
    const paragraph = (text: string, start: number, size = 10) => {
      const lines: string[] = [];
      let line = "";
      for (const word of clean(text).split(" ")) {
        if (font.widthOfTextAtSize((line + " " + word).trim(), size) > 475) {
          lines.push(line);
          line = word;
        } else line = (line + " " + word).trim();
      }
      if (line) lines.push(line);
      lines.forEach((l, i) => draw(l, at(0, 60, start + i * 17, 475), size));
      return start + lines.length * 17 + 16;
    };
    if (kind === "attendance") {
      const female =
        croatianStudentGender(student.gender).student === "učenica";
      const body =
        school.education_level === "HIGHER"
          ? `Potvrđuje se da je ${student.name}, OIB ${student.oib}, ${croatianStudentGender(student.gender).born} ${date(student.dob)} u ${student.birthplace || "____________"}, ${female ? "redovita studentica" : "redoviti student"} ustanove ${school.name} u akademskoj godini ${year}, studijskog programa ${snapshot.program.name || "____________"}.`
          : enrollmentCertificateBody(
              {
                ...student,
                birth_country: student.birth_country || "____________",
              },
              {
                grade: String(cls.grade_level || ""),
                schoolType:
                  school.education_level === "ELEMENTARY"
                    ? "osnovne škole"
                    : "srednje škole",
                year,
                program: snapshot.program.name || "",
                birthDate: date(student.dob),
              },
            );
      let y = paragraph(body, 190);
      y = paragraph(`Potvrda se izdaje u svrhu ${inputs.purpose}.`, y);
      if (inputs.legal_basis) paragraph(inputs.legal_basis, y, 9);
    } else {
      let y = paragraph(
        `${student.name}, OIB ${student.oib}. Svrha: ${inputs.purpose}.`,
        175,
      );
      for (const g of snapshot.grades || []) {
        if (y > 620) {
          pdf.addPage([595.28, 841.89]);
          y = 60;
        }
        const target = pdf.getPages().at(-1)!;
        const value = clean(
          `${g.year} · ${g.class} · ${g.subject || "Predmet bez naziva"}: ${g.value} (${g.kind}, ${date(g.date)})`,
        );
        let size = 9;
        while (font.widthOfTextAtSize(value, size) > 475 && size > 5.5)
          size -= 0.25;
        if (font.widthOfTextAtSize(value, size) > 475)
          throw new Error("Naziv predmeta je predug.");
        target.drawText(value, {
          font,
          size,
          x: 60,
          y: target.getHeight() - y - size,
        });
        y += 20;
      }
      // The final page reserves a separate school endorsement block; grade rows never overlap it.
    }
    const last = pdf.getPages().at(-1)!;
    last.drawText(`${school.city || ""}, ${date(snapshot.prepared_at)}`, {
      font,
      size: 9,
      x: 60,
      y: 170,
    });
    last.drawLine({
      start: { x: 365, y: 72 },
      end: { x: 535, y: 72 },
      thickness: 0.6,
    });
    last.drawText("Potpis ovlaštene osobe škole", {
      font,
      size: 8,
      x: 365,
      y: 58,
    });
  }
  const historical = Boolean(snapshot.legacy_certificate_id);
  const stampRequested =
    inputs.attest === true ||
    (historical && snapshot.legacy_visual_stamp === true);
  if (stampRequested) {
    if (
      !template.stamp ||
      !template.signature ||
      !assets.stamp ||
      (!assets.signature && !historical)
    )
      throw new Error("Nedostaje odobreni pečat ili potpis škole.");
    for (const [bytes, area] of [
      [assets.stamp, template.stamp],
      [assets.signature, template.signature],
    ] as [Uint8Array | undefined, Rect][]) {
      if (!bytes) continue;
      assertAllowed(template, area);
      const img = await pdf.embedPng(bytes);
      const scale = Math.min(area.width / img.width, area.height / img.height);
      const page =
        kind === "transcript" ? pdf.getPages().at(-1)! : pdf.getPage(area.page);
      page.drawImage(img, {
        x: area.x + (area.width - img.width * scale) / 2,
        y:
          page.getHeight() -
          area.top -
          area.height +
          (area.height - img.height * scale) / 2,
        width: img.width * scale,
        height: img.height * scale,
      });
    }
  }
  pdf.setTitle(
    kind === "transcript"
      ? "Prijepis ocjena"
      : kind === "attendance"
        ? "Potvrda o školovanju"
        : template.file!,
  );
  pdf.setCreator("ŠkoleHR — Školska referada");
  const bytes = await pdf.save({ useObjectStreams: false });
  return {
    bytes,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    attestation: stampRequested ? "VISUAL" : "NONE",
    pages: pdf.getPageCount(),
  };
}
