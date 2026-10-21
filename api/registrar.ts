import { createHash } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { buildRegistrarDocument } from "../server/registrar/buildDocument.js";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function registrarHandler(
  makeClients = () => {
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const anon = process.env.VITE_SUPABASE_ANON_KEY,
      service = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !anon || !service)
      throw new Error("Usluga dokumenata nije konfigurirana.");
    return { url, anon, service };
  },
) {
  return async (req: any, res: any) => {
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (req.method !== "POST")
      return res.status(405).json({ error: "Koristite POST." });
    const token = String(req.headers.authorization || "");
    if (!/^Bearer \S+$/.test(token))
      return res.status(401).json({ error: "Potrebna je valjana prijava." });
    try {
      const { url, anon, service } = makeClients();
      const options = {
        auth: { persistSession: false, autoRefreshToken: false },
      };
      const user = createClient(url, anon, {
          ...options,
          global: { headers: { Authorization: token } },
        }),
        admin = createClient(url, service, options);
      const rpc = async (name: string, args?: any) => {
        const r = await user.rpc(name, args);
        if (r.error) throw new Error(r.error.message);
        return r.data;
      };
      await rpc("registrar_touch_session");
      const ctx = await rpc("registrar_workspace"); // Existing PIN/TOTP proof and school assignment are mandatory.
      const school = ctx.school.id;
      const action = req.body?.action;
      const attestationAssets = async (snapshot: any, historical = false) => {
        if (
          !snapshot.inputs?.attest &&
          !(historical && snapshot.legacy_visual_stamp)
        )
          return {};
        const settings = snapshot.settings || {};
        const asset = async (path: string) => {
          if (
            typeof path !== "string" ||
            path.split("/")[0] !== school ||
            path.includes("..")
          )
            throw new Error("Grafička ovjera ne pripada ustanovi.");
          const r = await admin.storage.from("registrar-assets").download(path);
          if (r.error || !r.data)
            throw new Error("Potpis ili pečat škole nije dostupan.");
          return new Uint8Array(await r.data.arrayBuffer());
        };
        const signature = settings.signature_path
          ? await asset(settings.signature_path)
          : undefined;
        const stamp = settings.stamp_path
          ? await asset(settings.stamp_path)
          : school === "srednja-kola-glina-zagreb"
            ? await readFile(
                join(process.cwd(), "public/stamps/srednja-skola-glina.png"),
              )
            : undefined;
        return { stamp, signature };
      };
      if (action === "prepare") {
        const { year, classId, student, template, inputs } = req.body;
        if (
          !uuid.test(year) ||
          typeof classId !== "string" ||
          !uuid.test(student) ||
          typeof template !== "string" ||
          !inputs ||
          typeof inputs !== "object" ||
          typeof inputs.attest !== "boolean"
        )
          return res
            .status(400)
            .json({ error: "Provjerite godinu, razred, učenika i obrazac." });
        const record = await rpc("registrar_prepare_document", {
          _year: year,
          _class: classId,
          _student: student,
          _template: template,
          _inputs: inputs,
        });
        const output = await buildRegistrarDocument(
          record.snapshot,
          await attestationAssets(record.snapshot),
        );
        const path = `${school}/${record.id}/document.pdf`;
        const upload = await admin.storage
          .from("registrar-documents")
          .upload(path, output.bytes, {
            contentType: "application/pdf",
            upsert: false,
          });
        if (upload.error)
          throw new Error("PDF nije spremljen u privatnu arhivu.");
        const update = await admin
          .from("school_document_records")
          .update({
            pdf_path: path,
            pdf_sha256: output.sha256,
            status: "SPREMNO",
            attestation_status: output.attestation,
          })
          .eq("id", record.id)
          .eq("school_id", school)
          .eq("status", "NACRT")
          .select("id")
          .single();
        if (update.error) {
          await admin.storage.from("registrar-documents").remove([path]);
          throw new Error("Status PDF-a nije spremljen.");
        }
        return res.json({
          id: record.id,
          sha256: output.sha256,
          status: "SPREMNO",
          attestation_status: output.attestation,
          pages: output.pages,
        });
      }
      if (!uuid.test(req.body?.id || ""))
        return res
          .status(400)
          .json({ error: "Neispravan identifikator dokumenta." });
      if (action === "issue")
        return res.json(
          await rpc("registrar_issue_document", {
            _id: req.body.id,
            _sha: req.body.sha256,
          }),
        );
      if (action === "download") {
        const record = await rpc("registrar_document", { _id: req.body.id });
        if (
          !record.pdf_path &&
          record.legacy_certificate_id &&
          record.snapshot?.legacy_certificate_id ===
            record.legacy_certificate_id
        ) {
          const output = await buildRegistrarDocument(
            record.snapshot,
            await attestationAssets(record.snapshot, true),
          );
          const path = `${school}/${record.id}/legacy.pdf`;
          const upload = await admin.storage
            .from("registrar-documents")
            .upload(path, output.bytes, {
              contentType: "application/pdf",
              upsert: false,
            });
          if (upload.error)
            throw new Error(
              "Raniju potvrdu nije moguće spremiti. Pokušajte ponovno nakon osvježavanja.",
            );
          const update = await admin
            .from("school_document_records")
            .update({
              pdf_path: path,
              pdf_sha256: output.sha256,
              attestation_status: output.attestation,
            })
            .eq("id", record.id)
            .eq("school_id", school)
            .is("pdf_path", null)
            .select("id")
            .single();
          if (update.error) {
            await admin.storage.from("registrar-documents").remove([path]);
            throw new Error("Arhiviranje ranije potvrde nije dovršeno.");
          }
          record.pdf_path = path;
          record.pdf_sha256 = output.sha256;
        }

        if (!record.pdf_path || record.pdf_path.split("/")[0] !== school)
          throw new Error("PDF nije dostupan.");
        const file = await admin.storage
          .from("registrar-documents")
          .download(record.pdf_path);
        if (file.error || !file.data)
          throw new Error("Privatni PDF nije dostupan.");
        const bytes = Buffer.from(await file.data.arrayBuffer());
        if (
          createHash("sha256").update(bytes).digest("hex") !== record.pdf_sha256
        )
          throw new Error("Integritet arhiviranog PDF-a nije potvrđen.");
        if (record.status === "SPREMNO") {
          const update = await admin
            .from("school_document_records")
            .update({ previewed_at: new Date().toISOString() })
            .eq("id", record.id)
            .eq("school_id", school)
            .eq("status", "SPREMNO");
          if (update.error) throw new Error("Pregled nije evidentiran.");
        }
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
          "Content-Disposition",
          `inline; filename="SkoleHR-${record.id}.pdf"`,
        );
        return res.status(200).send(bytes);
      }
      return res.status(400).json({ error: "Nepoznata radnja." });
    } catch (error: any) {
      return res.status(400).json({
        error: error?.message || "Dokument trenutačno nije moguće pripremiti.",
      });
    }
  };
}
export default registrarHandler();
