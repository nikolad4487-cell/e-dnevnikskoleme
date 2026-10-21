import { test } from "node:test";
import assert from "node:assert/strict";
import { Jimp } from "jimp";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { trimEndorsementImage } from "../server/registrar/endorsementImage";
import { buildRegistrarDocument } from "../server/registrar/buildDocument";
import { templateCatalog, overlaps } from "../server/registrar/templateCatalog";

async function paddedSignature() {
  const image = new Jimp({ width: 400, height: 160, color: 0x00000000 });
  // Synthetic handwriting marker, deliberately padded like uploaded signatures.
  for (let y = 60; y < 84; y++) for (let x = 120; x < 240; x++) image.setPixelColor(0x0022ffff, x, y);
  image.setPixelColor(0x0022ff80, 120, 60);
  return new Uint8Array(await image.getBuffer("image/png"));
}
test("Transparent margins are removed without changing ink, aspect ratio or opacity", async () => {
  const output = await trimEndorsementImage(await paddedSignature());
  const image = await Jimp.read(Buffer.from(output));
  assert.equal(image.bitmap.width, 120); assert.equal(image.bitmap.height, 24);
  assert.equal(image.getPixelColor(0, 0), 0x0022ff80);
  const empty = new Jimp({ width: 10, height: 10, color: 0x00000000 });
  await assert.rejects(trimEndorsementImage(await empty.getBuffer("image/png")), /potpuno prozirna/);
});

test("School marks use the M.P. anchor or overlap the signature and handwriting ends on the original school line", async () => {
  const out = "/tmp/skolehr-endorsement-tests";
  await mkdir(out, { recursive: true });
  const signature = await paddedSignature();
  const stamp = await readFile("public/stamps/srednja-skola-glina.png");
  const manifest = [];
  for (const [kind, layout] of Object.entries(templateCatalog)) {
    if (!layout.stamp || !layout.signature) continue;
    const s = layout.stamp, p = layout.signature;
    if (layout.stampMark) {
      const m = layout.stampMark;
      assert(s.x <= m.x && s.x + s.width >= m.x + m.width);
      assert(s.top <= m.top && s.top + s.height >= m.top + m.height);
    } else assert(overlaps(s, p), kind + " stamp must overlap school signature");
    for (const forbidden of layout.forbidden) {
      assert(!overlaps(s, forbidden)); assert(!overlaps(p, forbidden));
    }
    const snapshot = {
      template: kind,
      student: { name: "Ogledna Učenica", first_name: "Ogledna", last_name: "Učenica", oib: "00123456789", dob: "2008-01-02", country: "Hrvatska", gender: "Ž" },
      school: { id: "test", name: "Ogledna škola", address: "Školska 1", city: "Zagreb", education_level: kind === "hzpp-student" ? "HIGHER" : "SECONDARY" },
      class: { name: "3.A" }, program: { name: "Program" }, year: { name: "2026./2027." },
      inputs: { attest: true, request_type: "CARD", purpose: "Stipendija" }, prepared_at: "2026-10-21T12:00:00Z", grades: [],
    };
    const result = await buildRegistrarDocument(snapshot, { stamp, signature });
    const path = out + "/" + kind + ".pdf";
    await writeFile(path, result.bytes);
    manifest.push({ path, signature: p, stamp: s, mark: layout.stampMark });
  }
  await writeFile(out + "/manifest.json", JSON.stringify(manifest));
  execFileSync("python", ["-c", `import fitz,json
for t in json.load(open('${out}/manifest.json')):
 d=fitz.open(t['path']);p=d[t['signature']['page']]
 images=p.get_image_info()
 assert len(images)>=2,(t['path'],images)
 signature,stamp=images[-2:]
 a=t['signature'];b=signature['bbox']
 assert abs(b[3]-(a['top']+a['height']))<.02,(t['path'],'signature misses school line',b,a)
 assert b[0]>=a['x']-.02 and b[2]<=a['x']+a['width']+.02
 assert abs(signature['width']/signature['height']-5)<.01,'transparent padding retained'
 a=t['stamp'];b=stamp['bbox']
 assert b[0]>=a['x']-.02 and b[2]<=a['x']+a['width']+.02
 assert b[1]>=a['top']-.02 and b[3]<=a['top']+a['height']+.02
 if t.get('mark'):assert 'M.P.' in p.get_text()
print('Visible images fit the school rectangles; signature meets the line, stamp covers M.P. or overlaps signature.')`], { stdio: "pipe" });
});
