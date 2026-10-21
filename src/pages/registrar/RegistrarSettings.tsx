import React, { useState } from "react";
import { supabase } from "../../lib/supabase";
import { registrarRpc } from "./registrarClient";
import toast from "react-hot-toast";
export default function RegistrarSettings({
  context,
  onSaved,
}: {
  context: any;
  onSaved: () => void;
}) {
  const [name, setName] = useState(context.signer?.signer_name || ""),
    [rules, setRules] = useState(context.signer?.numbering_rules || ""),
    [prefix, setPrefix] = useState(context.signer?.numbering_prefix || ""),
    [signature, setSignature] = useState<File | null>(null),
    [stamp, setStamp] = useState<File | null>(null),
    [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      const upload = async (file: File) => {
        const header = new Uint8Array(await file.slice(0, 8).arrayBuffer());
        if (
          file.size > 2097152 ||
          ![137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => header[i] === v)
        )
          throw new Error("Priložite izvorni PNG do 2 MB.");
        const path = `${context.school.id}/${crypto.randomUUID()}.png`;
        const r = await supabase.storage
          .from("registrar-assets")
          .upload(path, file, { contentType: "image/png", upsert: false });
        if (r.error) throw r.error;
        return path;
      };
      const stampPath = stamp
        ? await upload(stamp)
        : context.signer?.stamp_path || null;
      if (signature)
        await registrarRpc("registrar_set_signature", {
          _path: await upload(signature),
          _name: name,
        });
      await registrarRpc("registrar_configure_settings", {
        _name: name,
        _stamp: stampPath,
        _rules: rules,
        _prefix: prefix || null,
      });
      toast.success(
        "Postavke su spremljene. Administrator škole može odobriti ovjeru u e-Matici.",
      );
      setSignature(null);
      setStamp(null);
      onSaved();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="bg-white border rounded p-4 space-y-4">
      <h2 className="text-lg font-bold">Postavke referade</h2>
      <p>
        Pečat i potpis spremaju se u privatno spremište ove ustanove. Nakon
        promjene administrator škole ponovno odobrava njihovu primjenu u
        e-Matici.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <label>
          Ovlaštena osoba
          <input
            value={name}
            maxLength={150}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label>
          Potpis — prozirni PNG do 2 MB
          <input
            type="file"
            accept="image/png"
            onChange={(e) => setSignature(e.target.files?.[0] || null)}
          />
        </label>
        <label>
          Školski pečat — prozirni PNG do 2 MB
          <input
            type="file"
            accept="image/png"
            onChange={(e) => setStamp(e.target.files?.[0] || null)}
          />
        </label>
        <label>
          Obvezni prefiks urudžbenog broja (ako je propisan)
          <input
            maxLength={100}
            value={prefix}
            onChange={(e) => setPrefix(e.target.value)}
          />
        </label>
        <label>
          Pravila urudžbenog numeriranja ustanove
          <textarea
            rows={3}
            maxLength={2000}
            value={rules}
            onChange={(e) => setRules(e.target.value)}
          />
        </label>
      </div>
      <p className="text-sm">
        Potpis:{" "}
        {context.signer?.signature_path ? "spremljen" : "potrebno priložiti"} ·
        Pečat:{" "}
        {context.signer?.stamp_path ||
        context.school.id === "srednja-kola-glina-zagreb"
          ? "spremljen"
          : "potrebno priložiti"}{" "}
        · Primjena vizualne ovjere:{" "}
        {context.signer?.attestation_authorized ? "odobrena" : "čeka odobrenje"}
      </p>
      <p className="text-sm">
        Kvalificirana elektronička ovjera: usluga nije povezana. Vizualna ovjera
        ne mijenja taj status.
      </p>
      <button
        disabled={busy || !name.trim()}
        onClick={save}
        className="px-4 py-2 rounded bg-[#005c8d] text-white disabled:opacity-40"
      >
        Spremi postavke
      </button>
    </section>
  );
}
