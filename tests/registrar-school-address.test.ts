import { test } from "node:test";
import assert from "node:assert/strict";
import { printableSchoolAddress } from "../server/registrar/schoolAddress";
import { buildRegistrarDocument } from "../server/registrar/buildDocument";
import { extractText } from "unpdf";

const schoolMetadata = {
  address: "Ulica škole 84",
  oib: "00000000000",
  phone: "not-for-the-address-field",
  email: "metadata-only@example.test",
  principal: "Ovlaštena osoba",
  status: "ACTIVE",
};
test("School address accepts legacy JSON metadata and plain addresses without exposing contact fields", () => {
  assert.equal(printableSchoolAddress(JSON.stringify(schoolMetadata)), "Ulica škole 84");
  assert.equal(printableSchoolAddress(schoolMetadata), "Ulica škole 84");
  assert.equal(printableSchoolAddress("  Školska ulica 7  "), "Školska ulica 7");
  assert.equal(printableSchoolAddress(null), "");
  for (const invalid of ["{bad json", "[]", '{"phone":"123"}', { address: {} }])
    assert.throws(() => printableSchoolAddress(invalid), /Adresa ustanove/);
});

const snapshot = {
  template: "zet-regular-2026-2027",
  student: { first_name: "Željka", last_name: "Čović", name: "Željka Čović", oib: "00123456789", dob: "2008-01-02", city: "Zagreb", postal_code: "10000" },
  school: { id: "test", name: "Ogledna srednja škola", education_level: "SECONDARY", address: JSON.stringify(schoolMetadata), city: "Zagreb" },
  year: { name: "2026./2027." }, class: { name: "3.A" }, program: { name: "Program" },
  inputs: { attest: false, request_type: "CARD" }, prepared_at: "2026-10-21T12:00:00Z",
};
test("ZET PDF with the legacy school-address format fits its original field and omits unrelated metadata", async () => {
  const result = await buildRegistrarDocument(snapshot);
  const extracted = await extractText(result.bytes, { mergePages: true });
  const text = String(extracted.text);
  assert.match(text, /Ulica škole 84, Zagreb/);
  for (const value of [schoolMetadata.phone, schoolMetadata.email, schoolMetadata.principal, '"address"', '"status"'])
    assert(!text.includes(value), "Address field must not leak school metadata");
  assert.equal(result.pages, 2);
});
test("Unboxed ZET overflow identifies the exact field and never silently truncates a value", async () => {
  const invalid = structuredClone(snapshot);
  invalid.inputs = { ...invalid.inputs, account_email: "a".repeat(200) + "@example.test" } as any;
  await assert.rejects(buildRegistrarDocument(invalid), /E-pošta za izradu pretplatne karte: podatak ne stane/);
});
