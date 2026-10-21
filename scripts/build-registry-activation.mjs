import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
export const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export function activationSql() {
  const files = readdirSync(resolve(root, "migrations"))
    .filter((n) => /^202610200000(0[3-9]|1[0-4])_.*\.sql$/.test(n))
    .sort();
  if (files.length !== 12)
    throw new Error("Očekivano je 12 migracija (003–014).");
  const bodies = files.map((name) => {
    const body = readFileSync(resolve(root, "migrations", name), "utf8")
      .replace(/^BEGIN;[ \t]*\r?$/gm, "")
      .replace(/^COMMIT;\s*$/gim, "")
      .replace(/^NOTIFY pgrst\s*,\s*'reload schema';\s*$/gim, "");
    return `-- IZVOR: ${name}\n${body.trim()}\n`;
  });
  return `-- SkoleHR: zajednička nadogradnja e-Matice i Školske referade\n-- Generirano: node scripts/build-registry-activation.mjs\n-- Preduvjet: postojeća e-Matica i aktivirana roditeljska/referadska shema.\n-- Pokrenuti JEDNOM u SQL Editoru postojećeg Supabase projekta.\n-- Sve se primjenjuje u jednoj transakciji; greška poništava cijelu nadogradnju.\nBEGIN;\n${bodies.join("\n")}\nCOMMIT;\nNOTIFY pgrst,'reload schema';\n`;
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  writeFileSync(
    resolve(root, "docs/AKTIVACIJA-EMATICA-REFERADA.sql"),
    activationSql(),
  );
  console.log(
    "Pripremljen docs/AKTIVACIJA-EMATICA-REFERADA.sql (12 migracija, jedna transakcija).",
  );
}
