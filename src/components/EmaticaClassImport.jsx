import React, { useEffect, useRef, useState } from 'react';

export default function EmaticaClassImport({ client, classes, onSaved }) {
  const [classId, setClassId] = useState('');
  const [rows, setRows] = useState([]);
  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    let current = true;
    setRows([]); setSelected([]);
    if (!classId) { setLoading(false); return; }
    setLoading(true);
    client.rpc('list_ematica_students_for_class', { p_class_id: classId }).then(({ data, error: queryError }) => {
      if (!current) return;
      if (queryError) setError(queryError.message);
      else setRows(data || []);
    }).catch(() => { if (current) setError('Dohvat učenika nije uspio. Pokušajte ponovno.'); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [classId, revision, client]);
  const available = rows.filter(row => !row.issue);
  async function save(event) {
    event.preventDefault();
    if (busy || !classId || !selected.length || selected.length > 100) return;
    setBusy(true); setMessage(''); setError('');
    try {
      const { data, error: saveError } = await client.rpc('import_ematica_students_to_class', {
        p_class_id: classId, p_school_enrollment_ids: selected,
      });
      if (saveError) throw saveError;
      if (alive.current) {
        setMessage(`U razred je povučeno ${data.length} učenika. Postojeći računi i povijest školovanja su sačuvani.`);
        setRevision(n => n + 1); onSaved();
      }
    } catch (err) {
      if (alive.current) { setError(err.message || 'Prijenos nije uspio. Osvježite popis i pokušajte ponovno.'); setRevision(n => n + 1); }
    } finally { if (alive.current) setBusy(false); }
  }
  const inputStyle = { border: '1px solid #cbd5e1', borderRadius: 5, padding: 9, maxWidth: '100%', background: 'white', color: '#0f172a' };
  return <section className="panel" style={{ background: 'white', color: '#0f172a', border: '1px solid #cbd5e1', borderRadius: 8, padding: 20, marginBottom: 24 }}>
    <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Povuci učenike iz e-Matice u razred</h2>
    <p style={{ fontSize: 14, marginBottom: 16 }}>Odaberite razred. Prikazuju se aktivni upisi iz e-Matice za istu školu, program i školsku godinu, uključujući potvrđene upise preko e-Upisa.</p>
    <form onSubmit={save}>
      <fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0 }}>
        <label style={{ display: 'block', fontSize: 14 }}>Ciljni razred
          <select aria-label="Ciljni razred za povlačenje" style={{ ...inputStyle, display: 'block', width: '100%', marginTop: 6 }} value={classId} required
            onChange={e => { setClassId(e.target.value); setMessage(''); setError(''); }}>
            <option value="">Odaberite razred</option>
            {classes.map(c => <option key={c.id} value={c.id}>{c.name} — {c.school_year}{c.school_name ? ` — ${c.school_name}` : ''}</option>)}
          </select>
        </label>
        {classId && <button type="button" style={{ ...inputStyle, marginTop: 12 }} disabled={loading} onClick={() => { setError(''); setRevision(n => n + 1); }}>Osvježi učenike</button>}
        {loading && <p role="status" style={{ marginTop: 12 }}>Učitavanje upisa iz e-Matice…</p>}
        {classId && !loading && !error && rows.length === 0 && <p style={{ marginTop: 12 }}>Nema aktivnih upisa za ovaj razred. Provjerite konačni upis u e-Upisima te školu, program i godinu u e-Matici.</p>}
        {!!available.length && <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 16 }}>
          <input type="checkbox" checked={selected.length === Math.min(available.length, 100)}
            onChange={e => setSelected(e.target.checked ? available.slice(0, 100).map(r => r.school_enrollment_id) : [])} />
          Odaberi sve dostupne (najviše 100)
        </label>}
        <div style={{ maxHeight: 320, overflowY: 'auto', marginTop: 10 }}>
          {rows.map(row => <label key={row.school_enrollment_id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 0', borderBottom: '1px solid #e2e8f0' }}>
            <input type="checkbox" aria-label={`Odaberi ${row.full_name}`} disabled={!!row.issue || (!selected.includes(row.school_enrollment_id) && selected.length >= 100)}
              checked={selected.includes(row.school_enrollment_id)} onChange={e => setSelected(ids => e.target.checked ? [...ids, row.school_enrollment_id] : ids.filter(id => id !== row.school_enrollment_id))} />
            <span><strong>{row.full_name}</strong><span style={{ display: 'block', fontSize: 13 }}>{row.program_name}{row.from_admissions ? ' · Potvrđen upis iz e-Upisa' : ''}</span>
              {row.issue && <span style={{ display: 'block', fontSize: 13, color: '#92400e' }}>{row.issue}</span>}</span>
          </label>)}
        </div>
        <button type="submit" disabled={loading || !selected.length} style={{ ...inputStyle, background: '#005c8d', color: 'white', marginTop: 16, opacity: loading || !selected.length ? 0.5 : 1 }}>
          {busy ? 'Povlačenje…' : `Povuci odabrane u razred (${selected.length})`}
        </button>
      </fieldset>
    </form>
    {error && <p role="alert" style={{ color: '#b91c1c', marginTop: 12 }}>{error}</p>}
    {message && <p role="status" style={{ color: '#166534', marginTop: 12 }}>{message}</p>}
  </section>;
}
