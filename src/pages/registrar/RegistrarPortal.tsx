import PdfPreview from "./PdfPreview";
import React, { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import LegacyRegistrarPortal from "./LegacyRegistrarPortal";
import { registrarRpc, documentRequest } from "./registrarClient";
import RegistrarSettings from "./RegistrarSettings";
import RegistryLog from "./RegistryLog";
import { CERTIFICATE_PURPOSES } from "../../lib/certificatePurposes";
import toast from "react-hot-toast";

export const ACTIVITIES = [
  ["attendance", "Potvrde o školovanju"],
  ["zet", "ZET obrasci"],
  ["hzpp", "HŽPP obrasci"],
  ["transport", "Sufinanciranje prijevoza"],
  ["transcript", "Prijepisi ocjena"],
  ["thesis", "Završni radovi i urudžbiranje"],
  ["administrative", "Administrativni zahtjevi"],
  ["registry", "Urudžbeni zapisnik"],
  ["archive", "Izdani dokumenti"],
  ["settings", "Postavke referade"],
];
const OPTIONS: Record<string, string[][]> = {
  attendance: [["attendance", "Potvrda o redovnom školovanju"]],
  zet: [
    ["zet-regular-2026-2027", "Redoviti učenici i studenti 2026./2027."],
    ["zet-general", "Opća pretplatna karta"],
  ],
  hzpp: [
    ["hzpp-pupil", "Pametna kartica — učenici"],
    ["hzpp-student", "Pametna kartica — studenti"],
  ],
  transport: [
    ["transport-75-2026-2027", "75% sufinanciranje"],
    ["transport-100-social-2026-2027", "100% — zajamčena minimalna naknada"],
    [
      "transport-100-veterans-2026-2027",
      "100% — branitelji / civilni stradalnici",
    ],
  ],
  transcript: [["transcript", "Prijepis stvarnih ocjena"]],
};
const INITIAL = {
  purpose: "",
  custom_purpose: "",
  legal_basis: "",
  attest: false,
  request_type: "CARD",
  mojzet_email: "",
  mojzet_code: "",
  pass_number: "",
  account_email: "",
  id_card_number: "",
  grade_kind: "FINAL",
  years: [] as string[],
  county: "",
  settlement: "",
  distance_over_5: "",
  train_available: "",
  practice: "",
  practice_place: "",
  practice_days: "",
  practice_route: "",
  months: [] as number[],
  combined: "",
  carrier1: "",
  carrier2: "",
};
const button = "px-4 py-2 rounded border disabled:opacity-40";
export default function RegistrarPortal() {
  const { user, loading, signOut } = useAuth();
  const [ctx, setCtx] = useState<any>(null),
    [legacy, setLegacy] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [year, setYear] = useState(""),
    [cls, setCls] = useState(""),
    [activity, setActivity] = useState(""),
    [students, setStudents] = useState<any[]>([]),
    [student, setStudent] = useState(""),
    [template, setTemplate] = useState(""),
    [inputs, setInputs] = useState(INITIAL),
    [prepared, setPrepared] = useState<any>(null),
    [pdfUrl, setPdfUrl] = useState(""),
    [reviewed, setReviewed] = useState(false),
    [archive, setArchive] = useState<any[]>([]),
    [search, setSearch] = useState(""),
    [statusFilter, setStatusFilter] = useState(""),
    [transportReview, setTransportReview] = useState<any[]>([]);
  const load = async () => {
    setError("");
    try {
      setCtx(await registrarRpc("registrar_workspace"));
    } catch (e: any) {
      if (["PGRST202", "42883", "42P01"].includes(e.code)) setLegacy(true);
      else setError(e.message);
    }
  };
  useEffect(() => {
    if (user && !user.requiresAuthenticatorSetup) load();
  }, [user?.id, user?.requiresAuthenticatorSetup]);
  useEffect(() => {
    if (!year || !cls) {
      setStudents([]);
      return;
    }
    let alive = true;
    setStudent("");
    setPrepared(null);
    registrarRpc("registrar_class_students", { _year: year, _class: cls })
      .then((rows) => {
        if (alive) setStudents(rows);
      })
      .catch((e) => {
        if (alive) {
          setStudents([]);
          toast.error(e.message);
        }
      });
    return () => {
      alive = false;
    };
  }, [year, cls]);
  useEffect(() => {
    setTransportReview([]);
    if (!student || !cls || !year) return;
    let alive = true;
    registrarRpc("registrar_transport_review", {
      _year: year,
      _class: cls,
      _student: student,
    })
      .then((r) => {
        if (alive) setTransportReview(r);
      })
      .catch((e) => {
        if (alive) toast.error(e.message);
      });
    return () => {
      alive = false;
    };
  }, [student, cls, year]);
  useEffect(
    () => () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    },
    [pdfUrl],
  );
  useEffect(() => {
    if (activity === "archive")
      registrarRpc("registrar_document_archive")
        .then(setArchive)
        .catch((e) => toast.error(e.message));
  }, [activity]);
  const resetPreview = () => {
    setPrepared(null);
    setPdfUrl("");
    setReviewed(false);
  };
  const set = <K extends keyof typeof inputs>(
    key: K,
    value: (typeof inputs)[K],
  ) => {
    setInputs((old) => ({ ...old, [key]: value }));
    resetPreview();
  };
  const choose = (id: string) => {
    setActivity(id);
    setTemplate(OPTIONS[id]?.[0]?.[0] || "");
    setInputs({ ...INITIAL, years: year ? [year] : [] });
    setStudent("");
    resetPreview();
  };
  const open = async (id: string) => {
    setReviewed(false);
    const blob = await documentRequest({ action: "download", id }, true);
    setPdfUrl(URL.createObjectURL(blob));
  };
  const prepare = async () => {
    setBusy(true);
    try {
      const record = await documentRequest({
        action: "prepare",
        year,
        classId: cls,
        student,
        template,
        inputs: {
          ...inputs,
          purpose:
            inputs.purpose === "Ostalo"
              ? inputs.custom_purpose
              : inputs.purpose,
        },
      });
      setPrepared(record);
      await open(record.id);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };
  const issue = async () => {
    if (!prepared) return;
    setBusy(true);
    try {
      const result = await documentRequest({
        action: "issue",
        id: prepared.id,
        sha256: prepared.sha256,
      });
      setPrepared(result);
      toast.success("Dokument je izdan i spremljen u privatnu evidenciju.");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };
  if (user?.requiresAuthenticatorSetup)
    return <Navigate to="/auth/setup-authenticator" replace />;
  if (loading) return <p className="p-6">Učitavanje prijave…</p>;
  if (legacy)
    return (
      <>
        <div className="bg-amber-50 border-b px-5 py-2 text-sm">
          Proširena referada čeka aktivaciju pripremljene nadogradnje baze.
          Dostupne su postojeće potvrde i postavke potpisa.
        </div>
        <LegacyRegistrarPortal />
      </>
    );
  const classes =
    ctx?.classes.filter((c: any) => c.school_year_id === year) || [];
  const direct = ["administrative", "registry", "archive", "settings"].includes(
    activity,
  );
  const person = students.find((s) => s.id === student);
  const needsPurpose = ["attendance", "transcript"].includes(activity);
  return (
    <div className="registrar-workspace min-h-screen bg-slate-50 text-slate-800">
      <header className="bg-[#005c8d] text-white px-4 py-4 md:px-8 flex flex-wrap justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Školska referada</h1>
          <p className="text-sm">
            {ctx?.school.name || "Provjera škole korisnika"}
          </p>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span>{user?.name}</span>
          <button className={button} onClick={signOut}>
            Odjava
          </button>
        </div>
      </header>
      <main className="max-w-6xl mx-auto p-4 md:p-6 space-y-5">
        {error ? (
          <div role="alert" className="bg-white border p-5 rounded">
            {error}
            <button className="underline block mt-3" onClick={load}>
              Pokušaj ponovno
            </button>
          </div>
        ) : !ctx ? (
          <p>Provjera pristupa ustanovi…</p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 bg-white border rounded p-4">
              <label>
                1. Školska / akademska godina
                <select
                  aria-label="Školska godina"
                  value={year}
                  onChange={(e) => {
                    setYear(e.target.value);
                    setCls("");
                    setStudent("");
                    setActivity("");
                    resetPreview();
                  }}
                >
                  <option value="">Odaberite godinu</option>
                  {ctx.years.map((y: any) => (
                    <option key={y.id} value={y.id}>
                      {y.name}
                      {y.is_active ? " — aktivna" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                2. Razred / skupina
                <select
                  aria-label="Razred"
                  value={cls}
                  disabled={!year}
                  onChange={(e) => {
                    setCls(e.target.value);
                    setStudent("");
                    resetPreview();
                  }}
                >
                  <option value="">Odaberite razred</option>
                  {classes.map((c: any) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <section>
              <h2 className="font-bold text-lg mb-3">3. Odaberite aktivnost</h2>
              <nav
                className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2"
                aria-label="Aktivnosti referade"
              >
                {ACTIVITIES.map(([id, label], i) => (
                  <button
                    key={id}
                    onClick={() => choose(id)}
                    disabled={
                      ![
                        "registry",
                        "archive",
                        "settings",
                        "administrative",
                      ].includes(id) && !cls
                    }
                    className={`${button} text-left ${activity === id ? "bg-[#005c8d] text-white" : "bg-white"}`}
                  >
                    {i + 1}. {label}
                  </button>
                ))}
              </nav>
            </section>
            {activity === "settings" && (
              <RegistrarSettings context={ctx} onSaved={load} />
            )}
            {["registry", "administrative", "thesis"].includes(activity) && (
              <RegistryLog
                activity={activity}
                year={year}
                classId={cls}
                context={ctx}
              />
            )}
            {OPTIONS[activity] && !direct && (
              <section className="bg-white border rounded p-4 space-y-4">
                <h2 className="font-bold text-lg">
                  {ACTIVITIES.find((a) => a[0] === activity)?.[1]}
                </h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label>
                    4. Učenik / student
                    <select
                      value={student}
                      onChange={(e) => {
                        setStudent(e.target.value);
                        resetPreview();
                      }}
                    >
                      <option value="">Odaberite osobu</option>
                      {students.map((s) => (
                        <option key={s.enrollment_id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Vrsta dokumenta
                    <select
                      value={template}
                      onChange={(e) => {
                        setTemplate(e.target.value);
                        set("attest", false);
                      }}
                    >
                      {OPTIONS[activity].map(([id, label]) => (
                        <option key={id} value={id}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                {person && (
                  <div className="text-sm rounded bg-slate-50 p-3">
                    {person.name} · OIB {person.oib || "nije upisan"} ·{" "}
                    {person.dob || "datum rođenja nije upisan"}
                    <p>
                      Status školovanja:{" "}
                      {person.attendance_mode === "REGULAR"
                        ? "redovito — provjereno u e-Matici"
                        : person.attendance_mode ||
                          "potrebno provjeriti u e-Matici"}
                    </p>
                  </div>
                )}
                <div className="grid gap-4 sm:grid-cols-2">
                  {needsPurpose && (
                    <>
                      <label>
                        Svrha
                        <select
                          value={inputs.purpose}
                          onChange={(e) => set("purpose", e.target.value)}
                        >
                          <option value="">Odaberite svrhu</option>
                          {[...CERTIFICATE_PURPOSES, "Ostalo"]
                            .filter((x, i, a) => a.indexOf(x) === i)
                            .map((p) => (
                              <option key={p}>{p}</option>
                            ))}
                        </select>
                      </label>
                      {inputs.purpose === "Ostalo" && (
                        <label>
                          Druga svrha
                          <input
                            maxLength={500}
                            value={inputs.custom_purpose}
                            onChange={(e) =>
                              set("custom_purpose", e.target.value)
                            }
                          />
                        </label>
                      )}
                      <label>
                        Pravna osnova / propis, ako je primjenjivo
                        <input
                          maxLength={500}
                          value={inputs.legal_basis}
                          onChange={(e) => set("legal_basis", e.target.value)}
                        />
                      </label>
                    </>
                  )}
                  {activity === "zet" && (
                    <>
                      <label>
                        Vrsta zahtjeva
                        <select
                          value={inputs.request_type}
                          onChange={(e) => set("request_type", e.target.value)}
                        >
                          <option value="CARD">
                            Izdavanje pretplatne karte
                          </option>
                          <option value="APP">Pristup aplikaciji MojZET</option>
                          {template !== "zet-general" && (
                            <option value="RENEW">Produljenje profila</option>
                          )}
                        </select>
                      </label>
                      {[
                        ["id_card_number", "Broj osobne iskaznice"],
                        ["mojzet_email", "MojZET e-pošta"],
                        ["mojzet_code", "MojZET oznaka klijenta"],
                        ["pass_number", "Broj pretplatne karte"],
                        [
                          "account_email",
                          "E-pošta postojećeg korisničkog računa",
                        ],
                      ].map(([key, label]) => (
                        <label key={key}>
                          {label}
                          <input
                            maxLength={150}
                            value={(inputs as any)[key]}
                            onChange={(e) => set(key as any, e.target.value)}
                          />
                        </label>
                      ))}
                    </>
                  )}
                  {activity === "transcript" && (
                    <>
                      <label>
                        Vrsta ocjena
                        <select
                          value={inputs.grade_kind}
                          onChange={(e) => set("grade_kind", e.target.value)}
                        >
                          <option value="FINAL">Zaključne ocjene</option>
                          <option value="CURRENT">Tekuće ocjene</option>
                        </select>
                      </label>
                      <fieldset>
                        <legend>Školske / akademske godine</legend>
                        {ctx.years.map((y: any) => (
                          <label className="flex items-center gap-2" key={y.id}>
                            <input
                              className="!w-4 !h-4"
                              type="checkbox"
                              checked={inputs.years.includes(y.id)}
                              onChange={(e) =>
                                set(
                                  "years",
                                  e.target.checked
                                    ? [...inputs.years, y.id]
                                    : inputs.years.filter((id) => id !== y.id),
                                )
                              }
                            />
                            {y.name}
                          </label>
                        ))}
                      </fieldset>
                    </>
                  )}
                  {activity === "transport" && (
                    <>
                      {[
                        ["county", "Županija"],
                        ["settlement", "Naselje"],
                        ["practice_place", "Mjesto praktične nastave"],
                        ["practice_days", "Broj dana praktične nastave"],
                        ["practice_route", "Relacija do praktične nastave"],
                        [
                          "carrier1",
                          "Prijevoznik 1 (prazno koristi evidenciju)",
                        ],
                        [
                          "carrier2",
                          "Prijevoznik 2 (prazno koristi evidenciju)",
                        ],
                      ].map(([key, label]) => (
                        <label key={key}>
                          {label}
                          <input
                            type={key === "practice_days" ? "number" : "text"}
                            min={0}
                            max={31}
                            maxLength={200}
                            value={(inputs as any)[key]}
                            onChange={(e) => set(key as any, e.target.value)}
                          />
                        </label>
                      ))}
                      {[
                        [
                          "distance_over_5",
                          "Provjerena udaljenost veća od 5 km",
                        ],
                        ["train_available", "Mogućnost prijevoza vlakom"],
                        ["practice", "Praktična nastava / vježbe"],
                        ["combined", "Kombinirani prijevoz"],
                      ].map(([key, label]) => (
                        <label key={key}>
                          {label}
                          <select
                            value={(inputs as any)[key]}
                            onChange={(e) => set(key as any, e.target.value)}
                          >
                            <option value="">Nije utvrđeno</option>
                            <option value="YES">Da</option>
                            <option value="NO">Ne</option>
                          </select>
                        </label>
                      ))}
                      <fieldset className="sm:col-span-2">
                        <legend>Mjeseci praktične nastave</legend>
                        <div className="flex flex-wrap gap-4">
                          {[9, 10, 11, 12, 1, 2, 3, 4, 5, 6, 7, 8].map((m) => (
                            <label className="flex items-center gap-1" key={m}>
                              <input
                                className="!w-4 !h-4"
                                type="checkbox"
                                checked={inputs.months.includes(m)}
                                onChange={(e) =>
                                  set(
                                    "months",
                                    e.target.checked
                                      ? [...inputs.months, m]
                                      : inputs.months.filter((x) => x !== m),
                                  )
                                }
                              />
                              {m}.
                            </label>
                          ))}
                        </div>
                      </fieldset>
                    </>
                  )}
                </div>
                {activity === "zet" && (
                  <p className="text-sm bg-blue-50 p-3">
                    Za evidentirane osobe s važećom osobnom iskaznicom ZET
                    predviđa iznimke od školske ovjere; pročitajte uputu na
                    drugoj stranici. Nadležni grad/općina i podnositelj
                    samostalno ovjeravaju svoja područja.
                  </p>
                )}
                {activity === "hzpp" && (
                  <p className="text-sm bg-blue-50 p-3">
                    Profil i godina preuzimaju se iz ustanove i upisa. Potpis
                    podnositelja, marketinška privola i dio „Popunjava HŽPP”
                    ostaju prazni.
                  </p>
                )}
                {activity === "transport" && transportReview.length > 0 && (
                  <div className="overflow-x-auto border rounded">
                    <table className="w-full text-sm">
                      <thead>
                        <tr>
                          {[
                            "Relacija",
                            "Prijevoznik",
                            "Km u jednom smjeru",
                            "Cijena 100%",
                            "Vrijedi do",
                            "Dokaz posebnog prava",
                          ].map((h) => (
                            <th className="p-2 text-left" key={h}>
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {transportReview.map((r, i) => (
                          <tr key={i}>
                            <td className="p-2">
                              {r.route_from} → {r.route_to}
                              {r.is_practice ? " (praksa)" : ""}
                            </td>
                            <td className="p-2">{r.carrier}</td>
                            <td className="p-2">
                              {r.distance_km ?? "nije upisano"}
                            </td>
                            <td className="p-2">{r.price ?? "nije upisano"}</td>
                            <td className="p-2">
                              {r.valid_until || "nije upisano"}
                            </td>
                            <td className="p-2">
                              {r.benefit_evidence ||
                                "nadležno tijelo treba provjeriti"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {activity === "transport" && (
                  <p className="text-sm bg-blue-50 p-3">
                    Provjerite relacije, kilometražu i prijevoznike u e-Matici.
                    Škola ovjerava svoj dio; pravo na posebnu subvenciju
                    potvrđuje nadležno tijelo. Roditelj, prijevoznik i nadležno
                    tijelo dovršavaju svoje dijelove.
                  </p>
                )}
                {template !== "zet-general" && (
                  <label className="flex gap-2 items-center">
                    <input
                      className="!w-4 !h-4"
                      type="checkbox"
                      checked={inputs.attest}
                      disabled={!ctx.signer?.attestation_authorized}
                      onChange={(e) => set("attest", e.target.checked)}
                    />
                    Primijeni odobreni vizualni školski pečat i potpis{" "}
                    {ctx.signer?.attestation_authorized
                      ? ""
                      : "— potrebna konfiguracija i odobrenje administratora škole"}
                  </label>
                )}
                <button
                  className={`${button} bg-[#005c8d] text-white`}
                  disabled={
                    busy ||
                    !student ||
                    !template ||
                    (needsPurpose &&
                      (!inputs.purpose ||
                        (inputs.purpose === "Ostalo" &&
                          !inputs.custom_purpose.trim())))
                  }
                  onClick={prepare}
                >
                  {busy ? "Priprema…" : "5. Pripremi i pregledaj PDF"}
                </button>
                {prepared && (
                  <div className="border rounded p-4 space-y-3">
                    <p>
                      Status:{" "}
                      {prepared.status === "IZDANO"
                        ? "Dokument je izdan"
                        : "Spremno — pregled prije izdavanja"}{" "}
                      · Ovjera:{" "}
                      {prepared.attestation_status === "VISUAL"
                        ? "vizualni pečat i potpis"
                        : "bez grafičke ovjere"}
                    </p>
                    {pdfUrl && (
                      <PdfPreview
                        url={pdfUrl}
                        onReady={() => setReviewed(true)}
                      />
                    )}
                    <div className="flex flex-wrap gap-3">
                      {pdfUrl && (
                        <a
                          className={button}
                          href={pdfUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Otvori PDF
                        </a>
                      )}
                      <button
                        className={`${button} bg-green-700 text-white`}
                        disabled={
                          busy ||
                          !pdfUrl ||
                          !reviewed ||
                          prepared.status === "IZDANO"
                        }
                        onClick={issue}
                      >
                        6. Izdaj i evidentiraj dokument
                      </button>
                    </div>
                    <p className="text-xs">
                      Vizualni pečat i potpis nisu kvalificirani elektronički
                      pečat.
                    </p>
                  </div>
                )}
              </section>
            )}
            {activity === "archive" && (
              <section className="bg-white border rounded p-4 space-y-4">
                <h2 className="text-lg font-bold">
                  Izdani dokumenti i priprema
                </h2>
                <div className="flex flex-wrap gap-3">
                  <input
                    aria-label="Pretraži dokumente"
                    placeholder="Osoba, vrsta, svrha"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  <select
                    aria-label="Status dokumenta"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                  >
                    <option value="">Svi statusi</option>
                    {["NACRT", "SPREMNO", "IZDANO", "PONIŠTENO"].map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </div>
                {archive
                  .filter(
                    (r) =>
                      (!year || r.school_year_id === year) &&
                      (!statusFilter || r.status === statusFilter) &&
                      JSON.stringify(r)
                        .toLocaleLowerCase("hr")
                        .includes(search.toLocaleLowerCase("hr")),
                  )
                  .map((r) => (
                    <article
                      key={r.id}
                      className="border-b py-3 flex flex-wrap justify-between gap-3"
                    >
                      <div>
                        <strong>{r.student_name || r.document_type}</strong>
                        <p>
                          {r.document_type} · {r.year_name} · {r.status} ·{" "}
                          {r.issued_on || r.created_at?.slice(0, 10)}
                        </p>
                        <p className="text-sm">
                          {r.purpose}{" "}
                          {r.cancellation_reason &&
                            `— Poništeno: ${r.cancellation_reason}`}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          className={button}
                          disabled={busy || r.status === "NACRT"}
                          onClick={async () => {
                            setBusy(true);
                            try {
                              await open(r.id);
                            } catch (e: any) {
                              toast.error(e.message);
                            } finally {
                              setBusy(false);
                            }
                          }}
                        >
                          Pregled PDF-a
                        </button>
                        {r.status === "IZDANO" && (
                          <button
                            className={button}
                            disabled={busy}
                            onClick={async () => {
                              const reason = window.prompt(
                                "Razlog poništenja dokumenta (najmanje 5 znakova):",
                              );
                              if (!reason) return;
                              setBusy(true);
                              try {
                                await registrarRpc(
                                  "registrar_cancel_document",
                                  { _id: r.id, _reason: reason },
                                );
                                setArchive(
                                  await registrarRpc(
                                    "registrar_document_archive",
                                  ),
                                );
                              } catch (e: any) {
                                toast.error(e.message);
                              } finally {
                                setBusy(false);
                              }
                            }}
                          >
                            Poništi
                          </button>
                        )}
                      </div>
                    </article>
                  ))}
                {!archive.length && <p>Nema evidentiranih dokumenata.</p>}
                {pdfUrl && <PdfPreview title="Arhivirani PDF" url={pdfUrl} />}
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
