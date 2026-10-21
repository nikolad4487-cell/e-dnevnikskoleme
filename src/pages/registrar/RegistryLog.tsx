import React, { useEffect, useState } from "react";
import { registrarRpc } from "./registrarClient";
import toast from "react-hot-toast";
const empty = {
  id: null as string | null,
  number: "",
  classification: "",
  registered: "",
  received: "",
  title: "",
  note: "",
  status: "ZAPRIMLJENO",
  thesis: "",
};
export default function RegistryLog({
  activity,
  year,
  classId,
  context,
}: {
  activity: string;
  year: string;
  classId: string;
  context: any;
}) {
  const [records, setRecords] = useState<any[]>([]),
    [theses, setTheses] = useState<any[]>([]),
    [form, setForm] = useState(empty),
    [busy, setBusy] = useState(false),
    [search, setSearch] = useState("");
  const thesisMode = activity === "thesis";
  const load = () =>
    registrarRpc("registrar_registry_log", { _year: year || null })
      .then(setRecords)
      .catch((e) => toast.error(e.message));
  useEffect(() => {
    load();
    setForm(empty);
    setTheses([]);
    if (thesisMode && year && classId)
      registrarRpc("registrar_theses", { _year: year, _class: classId })
        .then(setTheses)
        .catch((e) => toast.error(e.message));
  }, [year, classId, activity]);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await registrarRpc("registrar_register_entry", {
        _year: year,
        _class: thesisMode ? classId : null,
        _thesis: thesisMode ? form.thesis : null,
        _type: thesisMode ? "THESIS" : "ADMINISTRATIVE",
        _number: form.number,
        _classification: form.classification,
        _registered: form.registered,
        _received: form.received || null,
        _title: form.title,
        _note: form.note,
        _status: form.status,
        _id: form.id,
      });
      toast.success("Predmet je evidentiran.");
      setForm(empty);
      load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="bg-white border rounded p-4 space-y-4">
      <h2 className="text-lg font-bold">
        {thesisMode
          ? "Zaprimanje završnog rada"
          : activity === "administrative"
            ? "Administrativni zahtjevi"
            : "Urudžbeni zapisnik"}
      </h2>
      {activity !== "registry" &&
        (!year ? (
          <p>Za evidentiranje odaberite školsku godinu.</p>
        ) : (
          <form onSubmit={save} className="space-y-4">
            <p className="text-sm">
              Službeni broj unesite iz urudžbenog postupka ustanove. Sustav
              provjerava jedinstvenost broja u ustanovi i godini.
            </p>
            {context.signer?.numbering_rules && (
              <p className="bg-blue-50 p-3">
                Pravila ustanove: {context.signer.numbering_rules}
              </p>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              {thesisMode && (
                <label>
                  Završni rad učenika
                  <select
                    required
                    disabled={Boolean(form.id)}
                    value={form.thesis}
                    onChange={(e) => {
                      const t = theses.find((t) => t.id === e.target.value);
                      setForm({
                        ...form,
                        thesis: e.target.value,
                        title: t?.thesis_title || "",
                        number: t?.application_registry_number || "",
                        classification:
                          t?.application_classification_number || "",
                      });
                    }}
                  >
                    <option value="">Odaberite postojeći završni rad</option>
                    {theses.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} — {t.thesis_title || "Tema nije unesena"}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label>
                Urudžbeni broj
                <input
                  required
                  readOnly={Boolean(form.id)}
                  maxLength={150}
                  value={form.number}
                  onChange={(e) => setForm({ ...form, number: e.target.value })}
                />
              </label>
              <label>
                KLASA
                <input
                  maxLength={150}
                  readOnly={Boolean(form.id)}
                  value={form.classification}
                  onChange={(e) =>
                    setForm({ ...form, classification: e.target.value })
                  }
                />
              </label>
              <label>
                Datum urudžbiranja
                <input
                  type="date"
                  required
                  readOnly={Boolean(form.id)}
                  value={form.registered}
                  onChange={(e) =>
                    setForm({ ...form, registered: e.target.value })
                  }
                />
              </label>
              <label>
                Datum zaprimanja
                <input
                  type="date"
                  max={form.registered || undefined}
                  readOnly={Boolean(form.id)}
                  value={form.received}
                  onChange={(e) =>
                    setForm({ ...form, received: e.target.value })
                  }
                />
              </label>
              <label>
                Naslov predmeta
                <input
                  required
                  maxLength={500}
                  readOnly={thesisMode || Boolean(form.id)}
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                />
              </label>
              <label>
                Status
                <select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                >
                  {["ZAPRIMLJENO", "U_OBRADI", "DOVRŠENO", "PONIŠTENO"].map(
                    (s) => (
                      <option key={s}>{s}</option>
                    ),
                  )}
                </select>
              </label>
              <label>
                Napomena
                <textarea
                  maxLength={2000}
                  value={form.note}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                />
              </label>
            </div>
            <button
              disabled={busy}
              className="bg-[#005c8d] text-white px-4 py-2 rounded"
            >
              Spremi u zapisnik
            </button>
          </form>
        ))}
      <input
        aria-label="Pretraži zapisnik"
        placeholder="Broj, naslov ili status"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {records
        .filter(
          (r) =>
            (activity !== "administrative" ||
              r.entry_type === "ADMINISTRATIVE") &&
            (!thesisMode || r.entry_type === "THESIS") &&
            JSON.stringify(r)
              .toLocaleLowerCase("hr")
              .includes(search.toLocaleLowerCase("hr")),
        )
        .map((r) => (
          <article key={r.id} className="border-t py-3">
            <strong>
              {r.registry_number} — {r.title}
            </strong>
            <p>
              {r.registered_on} · {r.status}
            </p>
            <p className="text-sm">{r.note}</p>
            {activity !== "registry" && (
              <button
                className="underline text-sm"
                onClick={() =>
                  setForm({
                    id: r.id,
                    number: r.registry_number,
                    classification: r.classification_number || "",
                    registered: r.registered_on,
                    received: r.received_on || "",
                    title: r.title,
                    note: r.note || "",
                    status: r.status,
                    thesis: r.thesis_id || "",
                  })
                }
              >
                Uredi napomenu i status
              </button>
            )}
          </article>
        ))}
      {!records.length && <p>Nema evidentiranih predmeta.</p>}
    </section>
  );
}
