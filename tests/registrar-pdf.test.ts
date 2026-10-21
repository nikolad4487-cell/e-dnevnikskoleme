import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import { extractText } from "unpdf";
import { buildRegistrarDocument } from "../server/registrar/buildDocument";
import {
  templateCatalog,
  assertAllowed,
} from "../server/registrar/templateCatalog";
test("Original PDF pages, Croatian text, correct profiles and untouched third-party areas", async () => {
  const sources = JSON.parse(
    await readFile("public/document-templates/manifest.json", "utf8"),
  );
  for (const source of sources)
    assert.equal(
      createHash("sha256")
        .update(await readFile(join("public/document-templates", source.file)))
        .digest("hex"),
      source.sha256,
      "Original source PDF must remain byte-identical",
    );
  const out = join(tmpdir(), "skolehr-pdf-tests");
  await mkdir(out, { recursive: true });
  const image = await readFile("public/stamps/srednja-skola-glina.png");
  const manifest = [];
  for (const [key, t] of Object.entries(templateCatalog)) {
    const higher = key === "hzpp-student";
    const snap = {
      template: key,
      student: {
        id: "test",
        name: "Željka Čović",
        first_name: "Željka",
        last_name: "Čović",
        oib: "12345678901",
        dob: "2008-01-01",
        address: "Školska 5",
        city: "Čakovec",
        postal_code: "40000",
        country: "Hrvatska",
        gender: "Ž",
        phone: "0911234567",
        birthplace: "Zagreb",
      },
      school: {
        id: "test",
        name: higher ? "Visoko učilište Čakovec" : "Škola Čakovec",
        education_level: higher ? "HIGHER" : "SECONDARY",
        address: "Ulica škole 1",
        city: "Čakovec",
      },
      year: { name: "2026./2027." },
      class: { name: "4.A", grade_level: 4 },
      program: { name: "Opća gimnazija" },
      prepared_at: "2026-10-20T12:00:00Z",
      settings: {},
      inputs: {
        attest: key !== "zet-general",
        request_type: "CARD",
        purpose: "stipendiranja",
        grade_kind: "FINAL",
        county: "Međimurska",
        settlement: "Čakovec",
        distance_over_5: "YES",
        train_available: "NO",
        practice: "YES",
        practice_place: "Škola",
        practice_days: "10",
        practice_route: "Čakovec – Varaždin",
        combined: "NO",
        months: [9, 10],
        carrier1: "Prijevoz d.o.o.",
      },
      grades: [
        {
          subject: "Hrvatski jezik",
          value: "5",
          date: "2027-06-15",
          year: "2026/2027",
          class: "4.A",
          kind: "Zaključna ocjena",
        },
      ],
    };
    const result = await buildRegistrarDocument(snap, {
      stamp: image,
      signature: image,
    });
    const doc = await PDFDocument.load(result.bytes);
    assert.equal(doc.getPageCount(), t.pages);
    assert.equal(result.sha256.length, 64);
    assert.equal(result.attestation, key === "zet-general" ? "NONE" : "VISUAL");
    const text = await extractText(result.bytes.slice(), { mergePages: true });
    assert(
      String(text.text).replace(/\s/g, "").includes("Čović"),
      key + " Croatian glyphs",
    );
    if (key === "hzpp-student") {
      assert(String(text.text).includes("REDOVNI STUDENT"));
      assert(!String(text.text).includes("4.A"));
    }
    if (key === "attendance") {
      assert(String(text.text).includes("rođena"));
      assert(String(text.text).includes("učenica"));
    }
    const target = join(out, key + ".pdf");
    await writeFile(target, result.bytes);
    if (t.file)
      manifest.push({
        key,
        original: join(process.cwd(), "public/document-templates", t.file),
        output: target,
        forbidden: t.forbidden,
      });
    for (const forbidden of t.forbidden)
      assert.throws(() => assertAllowed(t, forbidden));
  }
  await writeFile(join(out, "manifest.json"), JSON.stringify(manifest));
  // Transparent PNGs activate page transparency compositing in MuPDF: allow at most
  // 2/255 per channel rounding; marks, text and geometrical changes still fail.
  execFileSync(
    "python",
    [
      "-c",
      `import fitz,json
for t in json.load(open(${JSON.stringify(join(out, "manifest.json"))})):
 a,b=fitz.open(t['original']),fitz.open(t['output'])
 for r in t['forbidden']:
  clip=fitz.Rect(r['x'],r['top'],r['x']+r['width'],r['top']+r['height'])
  before=a[r['page']].get_pixmap(matrix=fitz.Matrix(2,2),clip=clip,alpha=False)
  after=b[r['page']].get_pixmap(matrix=fitz.Matrix(2,2),clip=clip,alpha=False)
  assert max(abs(x-y) for x,y in zip(before.samples,after.samples)) <= 2,(t['key'],r,'third-party area changed')
print('All third-party regions and instruction pages retain geometry and content (maximum compositing rounding 2/255).')`,
    ],
    { stdio: "pipe" },
  );
});

test("Long transcripts preserve all grades and reserve the date and school endorsement block", async () => {
  const snapshot = {
    template: "transcript",
    student: { name: "Željka Čović", oib: "12345678901" },
    school: { name: "Ogledna škola", city: "Zagreb" },
    class: { name: "4.A" },
    year: { name: "2026./2027." },
    program: { name: "Program" },
    prepared_at: "2026-10-21T12:00:00Z",
    inputs: { purpose: "Stipendija", attest: false },
    grades: Array.from({ length: 100 }, (_, i) => ({
      subject: "Predmet " + (i + 1),
      value: "4",
      year: "2026./2027.",
      class: "4.A",
      kind: "Zaključna ocjena",
      date: "2027-06-15",
    })),
  };
  const result = await buildRegistrarDocument(snapshot);
  assert(result.pages > 1);
  const path = join(tmpdir(), "skolehr-transcript-many.pdf");
  await writeFile(path, result.bytes);
  const text = await extractText(result.bytes.slice(), { mergePages: true });
  for (let i = 1; i <= 100; i++)
    assert(String(text.text).includes("Predmet " + i));
  execFileSync("python", [
    "-c",
    `import fitz
pdf=fitz.open(${JSON.stringify(path)})
for p in pdf:
 for block in p.get_text('dict')['blocks']:
  for line in block.get('lines',[]):
   for span in line['spans']:
    if 'Predmet ' in span['text']: assert span['bbox'][3]<650,span
print('All grade rows end above the reserved date/signature area.')`,
  ]);
});
