import React, { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { useSelection } from "../../contexts/SelectionContext";
import { supabase } from "../../lib/supabase";
import { registrarRpc } from "../../pages/registrar/registrarClient";
import { validateAbsenceAttachment } from "../../lib/familyRules";
const box = "w-full min-w-0 border rounded p-2",
  button = "border rounded px-3 py-2 disabled:opacity-50",
  primary = button + " bg-[#005c8d] text-white";
const date = (s: string) =>
  new Date(s).toLocaleString("hr-HR", { timeZone: "Europe/Zagreb" });
const states: Record<string, string> = {
  SUBMITTED: "Zaprimljen",
  PROCESSING: "U obradi",
  NEEDS_INFORMATION: "Potrebna dopuna",
  ISSUED: "Spremno za preuzimanje",
  REJECTED: "Odbijen",
};
const kinds: Record<string, string> = {
  attendance: "Potvrda o školovanju",
  transcript: "Prijepis ocjena",
  zet: "ZET obrazac",
  hzpp: "HŽPP obrazac",
  transport: "Sufinanciranje prijevoza",
  other: "Drugi dokument",
};
const examNames: Record<string, string> = {
  DOPUNSKI_RAD: "Dopunski rad",
  POPRAVNI: "Popravni ispit",
  PREDMETNI: "Predmetni ispit",
  RAZREDNI: "Razredni ispit",
  RAZLIKOVNI: "Razlikovni ispit",
  DOPUNSKI: "Dopunski ispit",
};
const outcomeNames: Record<string, string> = {
  NO_SHOW: "Nije pristupio/la",
  WITHDRAWN: "Prijava povučena",
};
const examKinds = [
  "DOPUNSKI_RAD",
  "POPRAVNI",
  "PREDMETNI",
  "RAZREDNI",
  "RAZLIKOVNI",
  "DOPUNSKI",
];
type Field = {
  key: string;
  label: string;
  type?: string;
  options?: { id: string; name: string }[];
  required?: boolean;
  initialValue?: string;
};
function Form({
  fields,
  label,
  onSave,
  disabled = false,
}: {
  fields: Field[];
  label: string;
  onSave: (v: any) => Promise<any>;
  disabled?: boolean;
}) {
  const [v, setV] = useState<Record<string, any>>({}),
    [busy, setBusy] = useState(false);
  return (
    <form
      className="grid gap-3 sm:grid-cols-2 border p-3 rounded min-w-0"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await onSave(Object.fromEntries(fields.map(f => [f.key, v[f.key] ?? f.initialValue ?? ""])));
          setV({});
        } catch {
        } finally {
          setBusy(false);
        }
      }}
    >
      <fieldset disabled={disabled || busy} className="contents">
        {fields.map((f) => (
          <label className="min-w-0 flex flex-col gap-1" key={f.key}>
            {f.label}
            {f.options ? (
              <select
                aria-label={f.label}
                className={box}
                required={f.required !== false}
                multiple={f.type === "multiple"}
                value={v[f.key] ?? f.initialValue ?? (f.type === "multiple" ? [] : "")}
                onChange={(e) =>
                  setV({
                    ...v,
                    [f.key]:
                      f.type === "multiple"
                        ? Array.from(e.target.selectedOptions).map(
                            (o) => o.value,
                          )
                        : e.target.value,
                  })
                }
              >
                {f.type !== "multiple" && <option value="">Odaberite</option>}
                {f.options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            ) : f.type === "textarea" ? (
              <textarea
                aria-label={f.label}
                className={box}
                required={f.required !== false}
                maxLength={5000}
                value={v[f.key] ?? f.initialValue ?? ""}
                onChange={(e) => setV({ ...v, [f.key]: e.target.value })}
              />
            ) : (
              <input
                aria-label={f.label}
                className={box}
                type={f.type || "text"}
                required={f.required !== false}
                maxLength={2000}
                value={v[f.key] ?? f.initialValue ?? ""}
                onChange={(e) => setV({ ...v, [f.key]: e.target.value })}
              />
            )}
          </label>
        ))}
        <div className="sm:col-span-2">
          <button className={primary}>{busy ? "Spremanje…" : label}</button>
        </div>
      </fieldset>
    </form>
  );
}
export default function SchoolServicesPage({
  office = false,
}: {
  office?: boolean;
}) {
  const { user, isParent } = useAuth(),
    { classId } = useParams(),
    selection = useSelection();
  const [searchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const requestId = searchParams.get("request");
  const itemId = searchParams.get("item"), linkedThread = searchParams.get("thread");
  const cls = classId || selection.selectedClassId,
    student = isParent ? selection.selectedChildId : user?.id;
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false),
    [tab, setTab] = useState(office ? "requests" : "messages");
  useEffect(() => {
    if (requestedTab && ["messages","consents","meetings","requests","exams","schedule"].includes(requestedTab)) setTab(office ? "requests" : requestedTab);
  }, [requestedTab, requestId]);
  useEffect(() => {
    if (!data || tab !== "requests" || !requestId) return;
    document.getElementById("request-" + requestId)?.scrollIntoView({ block: "center" });
  }, [data, tab, requestId]);
  const threadRequest = useRef(0);
  const threadRevision = useRef(0),
    messageCursor = useRef<any>(null);
  const revision = useRef(0),
    [peer, setPeer] = useState(""),
    [thread, setThread] = useState(""),
    [messages, setMessages] = useState<any[]>([]),
    [text, setText] = useState(""),
    [file, setFile] = useState<File | null>(null),
    [threshold, setThreshold] = useState(15),
    [pdf, setPdf] = useState("");
  const rpc = useCallback(
    async (name: string, args: any = {}) => {
      if (office) return registrarRpc(name, args);
      const r = await supabase.rpc(name, args);
      if (r.error)
        throw new Error(
          ["PGRST202", "42P01", "42883"].includes(r.error.code)
            ? "Nove školske usluge još nisu aktivirane u bazi. Potrebna je SQL aktivacija KOMUNIKACIJA-I-USLUGE."
            : r.error.message,
        );
      return r.data;
    },
    [office],
  );
  useEffect(() => {
    if (data && itemId) document.getElementById("service-item-" + itemId)?.scrollIntoView({block:"center"});
  }, [data, tab, itemId]);
  useEffect(() => {
    let active=true;
    if (!data || !linkedThread || tab!=="messages") return;
    rpc("services_notification_thread", {_group:linkedThread,_class:cls,_student:classId?null:student})
      .then(id=>{if(active)setThread(id);}).catch(e=>{if(active)setError(e.message);});
    return ()=>{active=false;};
  }, [data, linkedThread, tab, cls, student, classId]);
  const load = useCallback(async () => {
    const run = ++revision.current;
    setData(null);
    setError("");
    if (!office && !cls) return;
    setLoading(true);
    try {
      const r = await rpc("school_services_context", {
        _class: office ? null : cls,
        _student: classId ? null : student,
        _office: office,
      });
      if (run === revision.current) setData(r);
    } catch (e: any) {
      if (run === revision.current) setError(e.message);
    } finally {
      if (run === revision.current) setLoading(false);
    }
  }, [rpc, cls, student, classId, office]);
  useEffect(() => {
    threadRequest.current++;
    setPeer("");
    setThread("");
    setMessages([]);
    setNotice("");
    setFile(null);
    setText("");
    setPdf("");
    load();
    return () => {
      revision.current++;
    };
  }, [load]);
  useEffect(
    () => () => {
      if (pdf) URL.revokeObjectURL(pdf);
    },
    [pdf],
  );
  const act = async (name: string, args: any) => {
    const run = revision.current;
    setBusy(true);
    setNotice("");
    setError("");
    try {
      const r = await rpc(name, args);
      if (run !== revision.current) return r;
      await load();
      setNotice("Spremljeno.");
      return r;
    } catch (e: any) {
      if (run === revision.current) setError(e.message);
      throw e;
    } finally {
      setBusy(false);
    }
  };
  const refreshMessages = useCallback(
    async (before?: any) => {
      if (!thread) return;
      messageCursor.current = before || null;
      const scope = revision.current,
        threadRun = threadRevision.current;
      try {
        const rows = await rpc("services_messages", {
          _group: thread,
          _before: before?.timestamp || null,
          _before_id: before?.id || null,
        });
        if (scope !== revision.current || threadRun !== threadRevision.current)
          return;
        setMessages(rows);
        if (document.visibilityState === "visible" && rows.length)
          await rpc("services_read", {
            _group: thread,
            _ids: rows.map((r: any) => r.id),
          });
      } catch (e: any) {
        if (scope === revision.current) setError(e.message);
      }
    },
    [thread, rpc],
  );
  useEffect(() => {
    threadRevision.current++;
    messageCursor.current = null;
    setMessages([]);
    refreshMessages();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible")
        refreshMessages(messageCursor.current);
    }, 15000);
    return () => clearInterval(timer);
  }, [refreshMessages]);
  const openThread = async () => {
    const pair = data.people.find(
      (p: any) => p.student_id + ":" + p.parent_id === peer,
    );
    if (!pair) return;
    const ticket = ++threadRequest.current,
      scope = revision.current;
    setBusy(true);
    setError("");
    try {
      const result = await rpc("services_thread", {
        _class: cls,
        _student: pair.student_id,
        _parent: pair.parent_id,
      });
      if (scope === revision.current && ticket === threadRequest.current)
        setThread(result);
    } catch (e: any) {
      if (scope === revision.current && ticket === threadRequest.current)
        setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    let path: string | undefined;
    const run = revision.current;
    try {
      if (file) {
        const kind = await validateAbsenceAttachment(file);
        if (!["pdf", "png", "jpg", "jpeg"].includes(kind.ext))
          throw new Error("Za poruke koristite PDF, PNG ili JPG do 10 MB.");
        path = `${user!.id}/${crypto.randomUUID()}.${kind.ext}`;
        const uploaded = await supabase.storage
          .from("family-files")
          .upload(path, file, { contentType: kind.mime, upsert: false });
        if (uploaded.error) throw new Error("Prilog nije spremljen.");
      }
      await rpc("services_send", {
        _group: thread,
        _text: text,
        _file: file
          ? { path, name: file.name, type: file.type, size: file.size }
          : null,
      });
      if (run === revision.current) {
        setText("");
        setFile(null);
        await refreshMessages();
        setNotice("Poruka je poslana.");
      }
    } catch (e: any) {
      if (path) await supabase.storage.from("family-files").remove([path]);
      if (run === revision.current) setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const download = async (
    bucket: string,
    path: string,
    name: string,
    hash?: string,
  ) => {
    try {
      const r = await supabase.storage.from(bucket).download(path);
      if (r.error)
        throw new Error("Nemate pristup dokumentu ili je dokument nedostupan.");
      if (hash) {
        const actual = Array.from(
          new Uint8Array(
            await crypto.subtle.digest("SHA-256", await r.data.arrayBuffer()),
          ),
        )
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
        if (actual !== hash)
          throw new Error("Provjera cjelovitosti dokumenta nije uspjela.");
      }
      const url = URL.createObjectURL(r.data),
        a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (e: any) {
      setError(e.message);
    }
  };
  const documentDownload = async (id: string) => {
    try {
      const d = await rpc("services_document", { _request: id });
      await download("registrar-documents", d.path, "dokument.pdf", d.sha256);
    } catch (e: any) {
      setError(e.message);
    }
  };
  const report = async (session: any) => {
    try {
      const { jsPDF } = await import("jspdf"),
        { default: autoTable } = await import("jspdf-autotable"),
        { registerUnicodeFont } = await import("../../lib/pdfGenerator");
      const doc = new jsPDF();
      await registerUnicodeFont(doc);
      doc.setFontSize(14);
      doc.text("Zapisnik — pregled evidencije ispita", 14, 20);
      doc.setFontSize(10);
      const headingLines = doc.splitTextToSize(
        `${session.subject} · ${examNames[session.exam_type] || session.exam_type}\n${date(session.starts_at)} · ${session.location}\nPovjerenstvo: ${session.commission.map((id: string) => staff.find((s: any) => s.id === id)?.name || id).join(", ")}`,
        180,
      );
      doc.text(headingLines, 14, 29);
      autoTable(doc, {
        startY: 29 + headingLines.length * 5 + 8,
        styles: { font: "NotoSans" },
        head: [["Učenik", "Ocjena"]],
        body: session.registrations.map((r: any) => [
          r.student,
          r.grade ?? (outcomeNames[r.resolution_status] || "Nije unesena"),
        ]),
      });
      setPdf(URL.createObjectURL(doc.output("blob")));
    } catch (e: any) {
      setError(e.message);
    }
  };
  const staff = [
      ...new Map<string, any>(
        (data?.staff_directory || []).map((r: any) => [r.user.id, r.user]),
      ).values(),
    ],
    pupils = [
      ...new Map<string, any>(
        (data?.people || []).map((p: any) => [
          p.student_id,
          { id: p.student_id, name: p.student },
        ]),
      ).values(),
    ];
  const tabs = office
    ? [["requests", "Zahtjevi korisnika"]]
    : [
        ["messages", "Poruke"],
        ["consents", "Suglasnosti"],
        ["meetings", "Informacije"],
        ...(data?.support_view ? [["support", "Podrška učenicima"]] : []),
        ["schedule", "Promjene rasporeda"],
        ["requests", "Zahtjevi referadi"],
        ["exams", "Dopunski rad i ispiti"],
      ];
  return (
    <section
      className="school-services flex-1 overflow-auto min-w-0 bg-white p-4 md:p-6 space-y-4"
      aria-label="Školske usluge"
    >
      <h1 className="text-xl font-bold text-[#005c8d]">
        {office ? "Zahtjevi učenika i roditelja" : "Školske usluge"}
      </h1>
      <nav className="flex flex-wrap gap-2" aria-label="Školske usluge">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            className={tab === id ? primary : button}
            aria-current={tab === id ? "page" : undefined}
            onClick={() => {
              setTab(id);
              setNotice("");
            }}
          >
            {label}
          </button>
        ))}
      </nav>
      <button className={button} onClick={load} disabled={busy || loading}>
        Osvježi podatke
      </button>
      {loading && <p role="status">Učitavanje…</p>}
      {error && (
        <p
          role="alert"
          className="border border-red-200 bg-red-50 p-3 break-words"
        >
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {!cls && !office && <p>Najprije odaberite razred i dijete.</p>}
      {data && (
        <>
          {tab === "messages" && (
            <div className="space-y-3">
              <p>
                Razgovor roditelja i razrednika/zamjenika. Privitci su privatni;
                potvrda čitanja prikazuje stvarno otvaranje poruke.
              </p>
              {data.manager || data.parent ? (
                <>
                  <label className="block">
                    Roditelj i učenik
                    <select
                      className={box}
                      value={peer}
                      disabled={busy}
                      onChange={(e) => {
                        threadRequest.current++;
                        setPeer(e.target.value);
                        setThread("");
                      }}
                    >
                      <option value="">Odaberite razgovor</option>
                      {data.people
                        .filter((p: any) => p.parent_id)
                        .map((p: any) => (
                          <option
                            key={p.student_id + ":" + p.parent_id}
                            value={p.student_id + ":" + p.parent_id}
                          >
                            {p.student} — {p.parent}
                          </option>
                        ))}
                    </select>
                  </label>
                  <button
                    className={primary}
                    disabled={!peer || busy}
                    onClick={openThread}
                  >
                    Otvori razgovor
                  </button>
                  {thread && (
                    <>
                      <div className="space-y-3" aria-label="Poruke razgovora">
                        {messages.map((m) => (
                          <article
                            className="border rounded p-3 break-words"
                            key={m.id}
                          >
                            <strong>{m.sender}</strong> · {date(m.timestamp)}
                            <p className="whitespace-pre-wrap">
                              {m.text || m.content}
                            </p>
                            {m.attachments?.map((a: any) => (
                              <button
                                className="underline block"
                                key={a.id}
                                onClick={() =>
                                  download(
                                    "family-files",
                                    a.file_url.slice("family-files/".length),
                                    a.file_name,
                                  )
                                }
                              >
                                Preuzmi {a.file_name}
                              </button>
                            ))}
                            <p className="text-xs">
                              {m.receipts?.length
                                ? m.receipts
                                    .map(
                                      (r: any) =>
                                        `Pročitao/la ${r.name}: ${date(r.read_at)}`,
                                    )
                                    .join("; ")
                                : "Nema potvrde čitanja."}
                            </p>
                          </article>
                        ))}
                      </div>
                      {messages.length === 100 && (
                        <button
                          className={button}
                          onClick={() => refreshMessages(messages[0])}
                        >
                          Starije poruke
                        </button>
                      )}
                      <button
                        className={button}
                        onClick={() => refreshMessages()}
                      >
                        Najnovije poruke
                      </button>
                      <form className="space-y-2" onSubmit={send}>
                        <label className="block">
                          Poruka
                          <textarea
                            className={box}
                            required
                            maxLength={5000}
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                            disabled={busy}
                          />
                        </label>
                        <label className="block">
                          Prilog (PDF, PNG ili JPG, do 10 MB)
                          <input
                            key={file?.name || "empty"}
                            className={box}
                            type="file"
                            accept=".pdf,.png,.jpg,.jpeg"
                            disabled={busy}
                            onChange={(e) =>
                              setFile(e.target.files?.[0] || null)
                            }
                          />
                        </label>
                        <button
                          className={primary}
                          disabled={busy || !text.trim()}
                        >
                          Pošalji poruku
                        </button>
                      </form>
                    </>
                  )}
                </>
              ) : (
                <p>
                  Za roditeljske poruke prijavite se roditeljskim ili
                  razredničkim računom. Učeničke poruke ostaju u Informativki.
                </p>
              )}
            </div>
          )}
          {tab === "consents" && (
            <div className="space-y-3">
              <p>
                Svaki povezani roditelj odgovara samostalno. Odgovor je moguće
                promijeniti do roka; povijest ostaje zabilježena. Ova evidencija
                nije kvalificirani elektronički potpis.
              </p>
              {data.manager && (
                <Form
                  disabled={busy}
                  label="Objavi suglasnost"
                  fields={[
                    { key: "title", label: "Naziv suglasnosti" },
                    {
                      key: "description",
                      label: "Opis i uvjeti",
                      type: "textarea",
                    },
                    {
                      key: "deadline",
                      label: "Rok odgovora",
                      type: "datetime-local",
                    },
                  ]}
                  onSave={(v) =>
                    act("services_consent", {
                      _class: cls,
                      _title: v.title,
                      _description: v.description,
                      _deadline: new Date(v.deadline).toISOString(),
                    })
                  }
                />
              )}{" "}
              {data.consents.map((c: any) => (
                <article key={c.id} id={"service-item-" + c.id} className="border p-3 rounded space-y-2">
                  <h2 className="font-bold">{c.title}</h2>
                  <p className="whitespace-pre-wrap">{c.description}</p>
                  <p>
                    Rok: {date(c.deadline)} {c.cancelled_at ? "— Povučena" : ""}
                  </p>
                  {data.manager && (
                    <>
                      <p>Odgovora: {c.responses.length}</p>
                      <p>
                        Nisu odgovorili:{" "}
                        {data.people
                          .filter(
                            (p: any) =>
                              p.parent_id &&
                              !c.responses.some(
                                (r: any) =>
                                  r.student_id === p.student_id &&
                                  r.parent_id === p.parent_id,
                              ),
                          )
                          .map((p: any) => p.student + " — " + p.parent)
                          .join("; ") ||
                          "Svi povezani roditelji odgovorili su."}
                      </p>
                      {c.responses.map((r: any) => (
                        <p key={r.student_id + r.parent_id}>
                          {r.student} — {r.parent}:{" "}
                          {r.accepted ? "Prihvaćeno" : "Odbijeno"} ·{" "}
                          {date(r.responded_at)} {r.note}
                        </p>
                      ))}
                      {!c.cancelled_at && (
                        <button
                          className={button}
                          disabled={busy}
                          onClick={() => {
                            if (window.confirm("Povući ovu suglasnost?"))
                              act("services_cancel_consent", {
                                _id: c.id,
                              }).catch(() => {});
                          }}
                        >
                          Povuci suglasnost
                        </button>
                      )}
                    </>
                  )}
                  {data.parent && (
                    <>
                      <p>
                        Vaš odgovor:{" "}
                        {c.responses.length
                          ? c.responses[0].accepted
                            ? "Prihvaćeno"
                            : "Odbijeno"
                          : "Nije odgovoreno"}
                      </p>
                      {!c.cancelled_at && new Date(c.deadline) > new Date() && (
                        <Form
                          disabled={busy}
                          label="Spremi odgovor"
                          fields={[
                            {
                              key: "accepted",
                              label: "Odluka",
                              options: [
                                { id: "yes", name: "Dajem suglasnost" },
                                { id: "no", name: "Ne dajem suglasnost" },
                              ],
                            },
                            {
                              key: "note",
                              label: "Napomena uz odgovor",
                              required: false,
                            },
                          ]}
                          onSave={(v) =>
                            act("services_consent_reply", {
                              _id: c.id,
                              _student: student,
                              _accepted: v.accepted === "yes",
                              _note: v.note || "",
                            })
                          }
                        />
                      )}
                    </>
                  )}
                </article>
              ))}
            </div>
          )}
          {tab === "meetings" && (
            <div className="space-y-3">
              {data.manager && (
                <Form
                  disabled={busy}
                  label="Objavi termin informacija"
                  fields={[
                    {
                      key: "start",
                      label: "Početak informacija",
                      type: "datetime-local",
                    },
                    {
                      key: "end",
                      label: "Završetak informacija",
                      type: "datetime-local",
                    },
                    { key: "location", label: "Mjesto ili način razgovora" },
                  ]}
                  onSave={(v) =>
                    act("services_meeting", {
                      _class: cls,
                      _start: new Date(v.start).toISOString(),
                      _end: new Date(v.end).toISOString(),
                      _location: v.location,
                    })
                  }
                />
              )}{" "}
              {data.meetings.map((s: any) => (
                <article key={s.id} id={"service-item-" + s.id} className="border p-3 rounded space-y-2">
                  <strong>
                    {date(s.starts_at)} — {date(s.ends_at)}
                  </strong>
                  <p>
                    {s.host} · {s.location}
                  </p>
                  <p>
                    {s.booked ? "Rezervirano" : "Slobodno"} {s.booking?.student}
                  </p>
                  {new Date(s.starts_at) > new Date() && (
                    <>
                      {data.parent && !s.booked && (
                        <button
                          disabled={busy}
                          className={primary}
                          onClick={() =>
                            act("services_book_meeting", {
                              _id: s.id,
                              _student: student,
                            }).catch(() => {})
                          }
                        >
                          Rezerviraj informacije
                        </button>
                      )}
                      {s.booking &&
                        (data.manager || s.booking.parent_id === user?.id) && (
                          <button
                            disabled={busy}
                            className={button}
                            onClick={() =>
                              act("services_book_meeting", {
                                _id: s.id,
                                _student: student,
                                _cancel: true,
                              }).catch(() => {})
                            }
                          >
                            Otkaži rezervaciju
                          </button>
                        )}
                      {data.manager && (
                        <button
                          disabled={busy}
                          className={button}
                          onClick={() => {
                            if (
                              window.confirm(
                                "Otkazati cijeli termin informacija?",
                              )
                            )
                              act("services_cancel_meeting", {
                                _id: s.id,
                              }).catch(() => {});
                          }}
                        >
                          Otkaži termin
                        </button>
                      )}
                    </>
                  )}
                </article>
              ))}
            </div>
          )}
          {tab === "support" && data.support_view && (
            <div className="space-y-3">
              <p>
                Signali za stručni pregled temelje se na evidentiranim podacima.
                Ne predstavljaju dijagnozu niti automatsku pedagošku mjeru.
                Izostanci su broj sati u posljednjih 30 dana; pad prosjeka
                uspoređuje dva razdoblja od 30 dana.
              </p>
              <label className="block">
                Prag izostanaka za prikaz
                <input
                  className={box}
                  type="number"
                  min="1"
                  max="1000"
                  value={threshold}
                  onChange={(e) =>
                    setThreshold(Math.max(1, Number(e.target.value) || 1))
                  }
                />
              </label>
              {data.signals
                .filter(
                  (s: any) =>
                    s.absences >= threshold ||
                    s.negative >= 2 ||
                    (s.recent_average != null &&
                      s.previous_average != null &&
                      s.previous_average - s.recent_average >= 1),
                )
                .map((s: any) => (
                  <article className="border p-3 rounded" key={s.id}>
                    <strong>{s.name}</strong>
                    <p>
                      Izostali sati: {s.absences}; negativne zaključne ocjene:{" "}
                      {s.negative}; prosjek zadnjih 30 dana:{" "}
                      {s.recent_average == null
                        ? "Nema ocjena"
                        : Number(s.recent_average).toFixed(2)}
                      ; prethodnih 30 dana:{" "}
                      {s.previous_average == null
                        ? "Nema ocjena"
                        : Number(s.previous_average).toFixed(2)}
                    </p>
                  </article>
                ))}
              {data.support && (
                <>
                  <h2 className="font-bold">Poduzeta aktivnost podrške</h2>
                  <Form
                    disabled={busy}
                    label="Evidentiraj podršku"
                    fields={[
                      {
                        key: "student",
                        label: "Učenik za podršku",
                        options: data.signals.map((s: any) => ({
                          id: s.id,
                          name: s.name,
                        })),
                      },
                      {
                        key: "description",
                        label: "Opis poduzete aktivnosti",
                        type: "textarea",
                      },
                      {
                        key: "conclusion",
                        label: "Zaključak",
                        type: "textarea",
                        required: false,
                      },
                      {
                        key: "recommendation",
                        label: "Preporuka / sljedeći korak",
                        type: "textarea",
                        required: false,
                      },
                    ]}
                    onSave={(v) =>
                      act("services_support_action", {
                        _class: cls,
                        _student: v.student,
                        _description: v.description,
                        _conclusion: v.conclusion || "",
                        _recommendation: v.recommendation || "",
                      })
                    }
                  />
                  <p>
                    Bilješke su dostupne razredniku i stručnoj službi, bez
                    prikaza roditeljima i učenicima.
                  </p>
                  {data.activities.map((a: any) => (
                    <article key={a.id} className="border p-3 rounded">
                      <strong>
                        {a.date} · {a.staff_name}
                      </strong>
                      <p>{a.description}</p>
                      <p>{a.conclusion}</p>
                      <p>{a.recommendation}</p>
                    </article>
                  ))}
                </>
              )}
            </div>
          )}
          {tab === "schedule" && (
            <div className="space-y-3">
              {data.admin && (
                <Form
                  disabled={busy}
                  label="Objavi zamjenu i obavijesti razred"
                  fields={[
                    {
                      key: "subject",
                      label: "Predmet zamjene",
                      options: data.subjects,
                    },
                    {
                      key: "original",
                      label: "Odsutni nastavnik",
                      options: staff,
                    },
                    {
                      key: "substitute",
                      label: "Zamjenski nastavnik",
                      options: staff,
                    },
                    { key: "date", label: "Datum zamjene", type: "date" },
                    { key: "hour", label: "Redni broj sata", type: "number" },
                    { key: "room", label: "Učionica", required: false },
                    {
                      key: "note",
                      label: "Napomena o promjeni",
                      required: false,
                    },
                  ]}
                  onSave={(v) =>
                    act("services_substitution", {
                      _class: cls,
                      _subject: v.subject,
                      _original: v.original,
                      _substitute: v.substitute,
                      _date: v.date,
                      _hour: Number(v.hour),
                      _room: v.room || "",
                      _note: v.note || "",
                    })
                  }
                />
              )}{" "}
              {data.substitutions.map((s: any) => (
                <article key={s.id} id={"service-item-" + s.id} className="border p-3 rounded">
                  <strong>
                    {s.date} · {s.hour}. sat · {s.subject}
                  </strong>
                  <p>
                    Zamjena: {s.teacher} · Učionica:{" "}
                    {s.room || "Nije promijenjena"}
                  </p>
                  <p>{s.notes}</p>
                </article>
              ))}
            </div>
          )}
          {tab === "requests" && (
            <div className="space-y-3">
              {!office && !data.staff && (
                <Form
                  disabled={busy}
                  label="Predaj zahtjev referadi"
                  fields={[
                    {
                      key: "kind",
                      label: "Vrsta dokumenta",
                      options: Object.entries(kinds).map(([id, name]) => ({
                        id,
                        name,
                      })),
                    },
                    {
                      key: "purpose",
                      label: "Svrha i napomena zahtjeva",
                      type: "textarea",
                    },
                  ]}
                  onSave={(v) =>
                    act("services_request", {
                      _class: cls,
                      _student: student,
                      _kind: v.kind,
                      _purpose: v.purpose,
                    })
                  }
                />
              )}{" "}
              {data.requests.map((r: any) => (
                <article key={r.id} id={"request-" + r.id} className="border p-3 rounded space-y-2">
                  <strong>
                    {kinds[r.kind] || r.kind} — {states[r.status]}
                  </strong>
                  <p>
                    {r.student} {r.class} · {date(r.created_at)}
                  </p>
                  <p className="whitespace-pre-wrap">{r.purpose}</p>
                  <p className="whitespace-pre-wrap">{r.note}</p>
                  {r.updated_at && <p className="text-sm text-slate-500">Posljednja promjena: {date(r.updated_at)}</p>}
                  {!office && r.status === "NEEDS_INFORMATION" && r.requested_by === user?.id && (
                    <Form
                      disabled={busy}
                      label="Pošalji dopunu zahtjeva"
                      fields={[{ key: "purpose", label: "Dopunjena svrha i napomena zahtjeva", type: "textarea", initialValue: r.purpose }]}
                      onSave={(v) => act("services_supplement_request", {
                        _id: r.id, _purpose: v.purpose, _updated_at: r.updated_at,
                      })}
                    />
                  )}
                  {office && ["SUBMITTED", "PROCESSING", "NEEDS_INFORMATION"].includes(r.status) && (
                    <>
                      <p>
                        Dokument najprije izdajte kroz postojeći postupak uz
                        pregled PDF-a. Ovdje povežite već izdani dokument istog
                        učenika.
                      </p>
                      <Form
                        disabled={busy}
                        label="Spremi obradu zahtjeva"
                        fields={[
                          {
                            key: "status",
                            label: "Status obrade",
                            options: [
                              { id: "PROCESSING", name: "U obradi" },
                              { id: "NEEDS_INFORMATION", name: "Potrebna dopuna — navedi što nedostaje" },
                              { id: "ISSUED", name: "Izdan — poveži PDF" },
                              {
                                id: "REJECTED",
                                name: "Odbijen — navedi razlog",
                              },
                            ],
                          },
                          {
                            key: "document",
                            label: "Izdani dokument",
                            required: false,
                            options: (r.documents || []).map((d: any) => ({
                              id: d.id,
                              name: d.type + " " + (d.number || d.id),
                            })),
                          },
                          {
                            key: "note",
                            label: "Odgovor podnositelju",
                            required: false,
                          },
                        ]}
                        onSave={(v) =>
                          act("services_review_request", {
                            _id: r.id,
                            _updated_at: r.updated_at,
                            _status: v.status,
                            _note: v.note || "",
                            _document: v.document || null,
                          })
                        }
                      />
                    </>
                  )}
                  {!office && r.status === "ISSUED" && (
                    <button
                      className={primary}
                      onClick={() => documentDownload(r.id)}
                    >
                      Preuzmi izdani PDF
                    </button>
                  )}
                </article>
              ))}
            </div>
          )}
          {tab === "exams" && (
            <div className="space-y-3">
              {data.manager && (
                <Form
                  disabled={busy}
                  label="Objavi ispitni rok"
                  fields={[
                    {
                      key: "subject",
                      label: "Predmet ispita",
                      options: data.subjects,
                    },
                    {
                      key: "type",
                      label: "Vrsta ispita",
                      options: examKinds.map((id) => ({
                        id,
                        name: examNames[id] || id,
                      })),
                    },
                    {
                      key: "start",
                      label: "Termin ispita",
                      type: "datetime-local",
                    },
                    { key: "location", label: "Mjesto ispita" },
                    {
                      key: "commission",
                      label: "Članovi povjerenstva (odaberite jednog ili više)",
                      type: "multiple",
                      options: staff,
                    },
                  ]}
                  onSave={(v) =>
                    act("services_exam", {
                      _class: cls,
                      _subject: v.subject,
                      _type: v.type,
                      _start: new Date(v.start).toISOString(),
                      _location: v.location,
                      _commission: v.commission,
                    })
                  }
                />
              )}{" "}
              {data.exams.map((s: any) => (
                <article key={s.id} id={"service-item-" + s.id} className="border p-3 rounded space-y-2">
                  <strong>
                    {s.subject} · {examNames[s.exam_type] || s.exam_type}
                  </strong>
                  <p>
                    {date(s.starts_at)} · {s.location}
                  </p>
                  <p>
                    Povjerenstvo:{" "}
                    {s.commission
                      .map(
                        (id: string) =>
                          staff.find((p: any) => p.id === id)?.name || id,
                      )
                      .join(", ")}
                  </p>
                  {data.manager &&
                    !s.cancelled_at &&
                    new Date(s.starts_at) > new Date() && (
                      <button
                        className={button}
                        disabled={busy}
                        onClick={() => {
                          if (window.confirm("Otkazati ovaj ispitni rok?"))
                            act("services_cancel_exam", {
                              _session: s.id,
                            }).catch(() => {});
                        }}
                      >
                        Otkaži ispitni rok
                      </button>
                    )}
                  {s.cancelled_at ? (
                    <p>Rok je otkazan.</p>
                  ) : (
                    new Date(s.starts_at) > new Date() &&
                    (data.manager ? (
                      <Form
                        disabled={busy}
                        label="Prijavi učenika na rok"
                        fields={[
                          {
                            key: "student",
                            label: "Učenik za ispit",
                            options: pupils,
                          },
                        ]}
                        onSave={(v) =>
                          act("services_register_exam", {
                            _session: s.id,
                            _student: v.student,
                          })
                        }
                      />
                    ) : (
                      !data.staff &&
                      !s.registrations.length && (
                        <button
                          disabled={busy}
                          className={primary}
                          onClick={() =>
                            act("services_register_exam", {
                              _session: s.id,
                              _student: student,
                            }).catch(() => {})
                          }
                        >
                          Prijavi na ispitni rok
                        </button>
                      )
                    ))
                  )}
                  {s.registrations.map((r: any) => (
                    <div key={r.student_id} className="border-t pt-2">
                      <p>
                        {r.student}:{" "}
                        {r.grade ??
                          (outcomeNames[r.resolution_status] ||
                            "Ocjena nije unesena")}
                      </p>
                      {r.resolved_at && (
                        <p>
                          {r.resolution_reason} · {date(r.resolved_at)}
                        </p>
                      )}
                      {data.admin &&
                        !r.special_exam_id &&
                        !r.resolved_at &&
                        !s.cancelled_at && (
                          <Form
                            disabled={busy}
                            label="Evidentiraj status prijave"
                            fields={[
                              {
                                key: "status",
                                label: "Status ispitne prijave",
                                options: [
                                  { id: "NO_SHOW", name: "Nije pristupio/la" },
                                  { id: "WITHDRAWN", name: "Prijava povučena" },
                                ],
                              },
                              {
                                key: "reason",
                                label: "Obrazloženje statusa prijave",
                                type: "textarea",
                              },
                            ]}
                            onSave={(v) =>
                              act("services_resolve_exam_registration", {
                                _session: s.id,
                                _student: r.student_id,
                                _status: v.status,
                                _reason: v.reason,
                              })
                            }
                          />
                        )}
                      {!s.cancelled_at &&
                        !r.resolved_at &&
                        new Date(s.starts_at) > new Date() && (
                          <button
                            className={button}
                            disabled={busy}
                            onClick={() =>
                              act("services_register_exam", {
                                _session: s.id,
                                _student: r.student_id,
                                _remove: true,
                              }).catch(() => {})
                            }
                          >
                            Odjavi ispit
                          </button>
                        )}
                      {data.admin &&
                        !r.special_exam_id &&
                        !r.resolved_at &&
                        new Date(s.starts_at) <= new Date() && (
                          <Form
                            disabled={busy}
                            label="Evidentiraj rezultat ispita"
                            fields={[
                              {
                                key: "grade",
                                label: "Stvarna ocjena ispita",
                                options: [1, 2, 3, 4, 5].map((n) => ({
                                  id: String(n),
                                  name: String(n),
                                })),
                              },
                              {
                                key: "note",
                                label: "Bilješka o rezultatu",
                                required: false,
                              },
                            ]}
                            onSave={(v) =>
                              act("services_exam_result", {
                                _session: s.id,
                                _student: r.student_id,
                                _grade: Number(v.grade),
                                _note: v.note || "",
                              })
                            }
                          />
                        )}
                    </div>
                  ))}
                  {data.staff && (
                    <button className={button} onClick={() => report(s)}>
                      Pregled zapisnika PDF
                    </button>
                  )}
                </article>
              ))}
              {pdf && (
                <div>
                  <a
                    className="underline"
                    href={pdf}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Otvori zapisnik PDF
                  </a>
                  <iframe
                    className="w-full h-96 border"
                    title="Pregled zapisnika ispita"
                    src={pdf}
                  />
                </div>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
