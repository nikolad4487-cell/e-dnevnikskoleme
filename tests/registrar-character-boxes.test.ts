import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { buildRegistrarDocument } from "../server/registrar/buildDocument";
import {
  boxedBirthDate,
  boxCharacters,
  hzppPersonalBoxes,
  hzppYearBoxes,
  zetGeneralComb,
  zetRegularComb,
} from "../server/registrar/characterBoxes";

test("Every HŽPP/ZET boxed value places one complete Croatian character per printed cell", async () => {
  const out = join(tmpdir(), "skolehr-character-box-tests");
  await mkdir(out, { recursive: true });
  const manifest: any[] = [];
  for (const template of [
    "hzpp-pupil",
    "hzpp-student",
    "zet-general",
    "zet-regular-2026-2027",
  ]) {
    const snapshot = {
      template,
      student: {
        first_name: "Z\u030celjka",
        last_name: "Ćović-Šimić",
        name: "Željka Ćović-Šimić",
        oib: "00123456789",
        dob: "2006-06-10",
        address: "Ulica Đure 7",
        city: "Čakovec",
        postal_code: "40000",
        country: "Bosna i Hercegovina",
        phone: "091 1234567",
      },
      school: {
        id: "test",
        name: "Ogledna škola",
        education_level: template === "hzpp-student" ? "HIGHER" : "SECONDARY",
        address: "Ulica škole 1",
        city: "Čakovec",
      },
      year: { name: "2026./2027." },
      class: { name: "3.A" },
      program: { name: "Program" },
      inputs: {
        attest: false,
        request_type: "CARD",
        id_card_number: "001234567",
        mojzet_email: "zeljka.covic@example.test",
        mojzet_code: "AB12ČĆŽŠĐ",
      },
      prepared_at: "2026-10-21T12:00:00Z",
    };
    const result = await buildRegistrarDocument(snapshot);
    const path = join(out, template + ".pdf");
    await writeFile(path, result.bytes);
    const fields: any[] = [];
    if (template.startsWith("hzpp")) {
      for (const [key, layout] of Object.entries(hzppPersonalBoxes))
        fields.push({
          label: layout.label,
          cells: layout.cells,
          text: key === "dob" ? "10062006" : (snapshot.student as any)[key],
        });
      fields.push({
        ...hzppYearBoxes(template === "hzpp-student"),
        text: "20262027",
      });
    } else {
      const regular = template !== "zet-general";
      const values: Record<string, string> = regular
        ? {
            text_8exdz: snapshot.student.first_name,
            text_9evmo: snapshot.student.last_name,
            text_13hkah: "10062006",
            text_14uida: snapshot.student.oib,
            text_15xvjz: "001234567",
            text_16aunt: snapshot.student.address,
            text_17cuyf: "Čakovec 40000",
            text_21heoa: snapshot.inputs.mojzet_email,
            text_22ealk: snapshot.inputs.mojzet_code,
          }
        : {
            text_6zdyy: snapshot.student.first_name,
            text_7iznr: snapshot.student.last_name,
            text_13agio: "10062006",
            text_14qrej: snapshot.student.oib,
            text_15rawu: "001234567",
            text_8lkti: snapshot.student.address,
            text_9cgks: "Čakovec 40000",
            text_10fdwb: snapshot.student.phone,
            text_11mdkv: snapshot.inputs.mojzet_email,
            text_12xasy: snapshot.inputs.mojzet_code,
          };
      for (const [key, layout] of Object.entries(
        regular ? zetRegularComb : zetGeneralComb,
      ))
        fields.push({
          label: layout.label,
          text: values[key],
          cells: Array.from({ length: layout.count }, (_, i) => ({
            ...layout.area,
            x: layout.area.x + (i * layout.area.width) / layout.count,
            width: layout.area.width / layout.count,
          })),
        });
    }
    manifest.push({ template, path, fields });
    const invalid = structuredClone(snapshot);
    invalid.student.first_name = "A".repeat(
      template.startsWith("hzpp") ? 20 : 15,
    );
    await assert.rejects(buildRegistrarDocument(invalid), /Ime: podatak ima/);
  }
  await writeFile(join(out, "manifest.json"), JSON.stringify(manifest));
  execFileSync(
    "python",
    [
      "-c",
      `import fitz,json,unicodedata
fitz.TOOLS.mupdf_display_errors(False)
for test in json.load(open(${JSON.stringify(join(out, "manifest.json"))})):
 pdf=fitz.open(test['path'])
 for field in test['fields']:
  chars=list(unicodedata.normalize('NFC',field['text']).strip())
  for i,cell in enumerate(field['cells']):
   page=pdf[cell['page']]
   actual=[]
   for block in page.get_text('rawdict')['blocks']:
    for line in block.get('lines',[]):
     for span in line['spans']:
      if not span['font'].startswith('NotoSans'):continue
      for ch in span['chars']:
       x0,y0,x1,y1=ch['bbox'];cx=(x0+x1)/2;cy=(y0+y1)/2
       if cell['x']<=cx<cell['x']+cell['width'] and cell['top']<=cy<cell['top']+cell['height'] and not ch['c'].isspace():
        assert x0>=cell['x']-.2 and x1<=cell['x']+cell['width']+.2,(test['template'],field['label'],i,ch,'crosses vertical border')
        assert y0>=cell['top']-.2 and y1<=cell['top']+cell['height']+.2,(test['template'],field['label'],i,ch,'crosses horizontal border')
        actual.append(ch['c'])
   expected=[] if i>=len(chars) or chars[i]==' ' else [chars[i]]
   assert actual==expected,(test['template'],field['label'],i,expected,actual)
print('Each character is contained in its own printed cell; word spaces, date gaps and unused cells are blank.')`,
    ],
    { stdio: "pipe" },
  );
});
test("Boxed dates retain zeroes and field overflow is never silently truncated", () => {
  assert.equal(boxedBirthDate("2008-01-02"), "02012008");
  assert.equal(boxedBirthDate("2008-01-02T00:00:00Z"), "02012008");
  assert.equal(boxedBirthDate(null), "");
  assert.throws(() => boxedBirthDate("2.1.2008"), /Datum/);
  assert.deepEqual(
    boxCharacters("Z\u030celjka Č", "Ime", 8),
    Array.from("Željka Č"),
  );
  assert.throws(
    () => boxCharacters("123456", "Poštanski broj", 5),
    /6 znakova.*5 kućica/,
  );
});
