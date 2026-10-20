import React,{useCallback,useEffect,useState} from 'react';
import {useParams} from 'react-router-dom';
import toast from 'react-hot-toast';
import {useAuth} from '../../contexts/AuthContext';
import {useSelection} from '../../contexts/SelectionContext';
import {supabase} from '../../lib/supabase';
import {absenceTypes,absenceStatuses,pendingAbsence,familyDate,familyRpc,uploadAbsenceAttachment,openAbsenceAttachment,type FamilyRequest,type RequestDay} from '../../lib/familyPortal';
const input='w-full min-w-0 border rounded p-2 text-sm';
const button='bg-[#005c8d] text-white rounded px-4 py-2 text-sm font-bold disabled:opacity-50';
function DayChoice({day,onChange,review=false}:{day:RequestDay;onChange:(d:RequestDay)=>void;review?:boolean}){
 return <div className="grid sm:grid-cols-2 gap-2"><select aria-label={`Status ${day.date}`} className={input} value={day.status} onChange={e=>onChange({...day,status:e.target.value})}>{Object.entries(absenceStatuses).map(([v,label])=><option key={v} value={v}>{label}</option>)}</select><select aria-label={`Tip ${day.date}`} className={input} value={day.type} onChange={e=>onChange({...day,type:e.target.value})}>{absenceTypes.map(t=><option key={t}>{t}</option>)}</select>{review&&<input className={input+' sm:col-span-2'} aria-label={`Razlog ${day.date}`} value={day.reason||''} maxLength={1000} placeholder="Razlog / napomena uz izostanke ovog dana" onChange={e=>onChange({...day,reason:e.target.value})}/>}</div>;
}
export default function FamilyAbsencePage({review=false}:{review?:boolean}){
 const {user,isParent}=useAuth(),{selectedChildId,selectedClassId}=useSelection(),{classId}=useParams(),cls=classId||selectedClassId;
 const [requests,setRequests]=useState<FamilyRequest[]>([]),[absences,setAbsences]=useState<any[]>([]),[names,setNames]=useState<Record<string,string>>({});
 const [error,setError]=useState(''),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[editing,setEditing]=useState<FamilyRequest|null>(null),[compose,setCompose]=useState(false);
 const [days,setDays]=useState<RequestDay[]>([]),[perDay,setPerDay]=useState(false),[shared,setShared]=useState({status:'JUSTIFIED',type:absenceTypes[0]}),[note,setNote]=useState(''),[teacherNote,setTeacherNote]=useState(''),[file,setFile]=useState<File|null>(null),[status,setStatus]=useState('ALL');
 const load=useCallback(async()=>{
  if(!cls||(!review&&!selectedChildId)){setLoading(false);return;}setLoading(true);setError('');
  try{
   if(review)setNames(await familyRpc('family_request_names',{_class:cls}));else await familyRpc('family_children');
   let q=supabase.from('family_absence_requests').select('*').eq('class_id',cls).neq('status','CANCELLED').order('created_at',{ascending:false});
   if(!review)q=q.eq('student_id',selectedChildId).eq('parent_id',user?.id);
   const r=await q;if(r.error)throw r.error;setRequests(r.data||[]);
   if(!review){const a=await supabase.from('absences').select('id,date,hour,status,lessons(subjects(name))').eq('class_id',cls).eq('student_id',selectedChildId).order('date',{ascending:false});if(a.error)throw a.error;setAbsences(a.data||[]);}
  }catch(e:any){setError(e.message||'Zahtjeve nije moguće učitati.');}finally{setLoading(false);}
 },[cls,selectedChildId,review,user?.id]);
 useEffect(()=>{setCompose(false);setEditing(null);setDays([]);setFile(null);load();},[load]);
 const start=(r?:FamilyRequest)=>{setEditing(r||null);setDays(r?.days.map(d=>({...d}))||[]);setNote(r?.parent_note||'');setTeacherNote(r?.teacher_note||'');setPerDay(!!r);setFile(null);setCompose(true);};
 const groups=Object.entries(absences.filter(a=>pendingAbsence(a.status)).reduce<Record<string,any[]>>((all,a)=>({...all,[a.date]:[...(all[a.date]||[]),a]}),{})).sort(([a],[b])=>b.localeCompare(a));
 const occupied=new Set(requests.filter(r=>r.status==='SUBMITTED'&&r.id!==editing?.id).flatMap(r=>r.days.flatMap(d=>d.absenceIds)));
 const save=async()=>{
  if(!user||!cls||!days.length)return;setBusy(true);let uploaded:string|undefined;
  try{
   if(review&&editing){await familyRpc('family_process_request',{_id:editing.id,_version:editing.version,_days:days.map(({date,status,type,reason})=>({date,status,type,reason:reason||''})),_note:teacherNote});toast.success('Zahtjev je obrađen, izostanci ažurirani i roditelj obaviješten.');}
   else{const id=editing?.id||crypto.randomUUID();if(file)uploaded=await uploadAbsenceAttachment(file,user.id,id);
    await familyRpc('family_save_request',{_id:id,_student:selectedChildId,_class:cls,_days:days,_note:note,_attachment_path:uploaded||editing?.attachment_path||null,_attachment_name:file?.name||editing?.attachment_name||null,_version:editing?.version||0});toast.success('Zahtjev je poslan razredniku i zamjeniku.');}
   setCompose(false);await load();
  }catch(e:any){if(uploaded)await supabase.storage.from('absence-notes').remove([uploaded]);toast.error(e.message);}finally{setBusy(false);}
 };
 const cancel=async(r:FamilyRequest)=>{if(!window.confirm('Obrisati neobrađeni zahtjev?'))return;setBusy(true);try{await familyRpc('family_cancel_request',{_id:r.id,_version:r.version});toast.success('Zahtjev je obrisan.');await load();}catch(e:any){toast.error(e.message);}finally{setBusy(false);}};
 if(!review&&!isParent)return <div className="p-6">Opravdanja predaje roditelj ili skrbnik kroz svoj račun.</div>;
 if(!cls||(!review&&!selectedChildId))return <div className="p-6">Odaberite {review?'razred':'dijete i razred'} za pregled zahtjeva.</div>;
 return <div className="flex-1 overflow-auto bg-white p-4 md:p-6 space-y-5">
  <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-xl font-bold text-[#005c8d]">{review?'Zahtjevi za opravdavanje izostanaka':'Opravdavanje izostanaka'}</h1>{!review&&!error&&<button className={button} onClick={()=>start()}>Novi zahtjev</button>}</div>
  <p className="text-sm text-slate-600">{review?'Pregledajte roditeljski prijedlog, prilog i izostanke te odredite status za svaki dan. Roditelj će vidjeti vašu bilješku.':'Zahtjev šaljete za izostanke koji čekaju odluku. Opravdanost određuje razrednik ili zamjenik. Za više od tri uzastopna radna dana obvezno priložite ispričnicu.'}</p>
  {loading&&<p role="status">Učitavanje zahtjeva…</p>}{error&&<div role="alert" className="p-4 bg-amber-50 border border-amber-200 rounded">{error}<button className="ml-3 underline" onClick={load}>Pokušaj ponovno</button></div>}
  {compose&&<section className="border rounded-lg p-4 space-y-4" aria-label={review?'Obrada zahtjeva':'Novi zahtjev'}>
   <h2 className="font-bold">{review?`${names[editing?.student_id||'']||'Učenik'} — obrada zahtjeva`:editing?'Uredi neobrađeni zahtjev':'Odaberite dane izostanka'}</h2>
   {!review&&<><label className="flex items-center gap-2 normal-case"><input type="checkbox" checked={perDay} onChange={e=>{setPerDay(e.target.checked);if(!e.target.checked)setDays(prev=>prev.map(d=>({...d,...shared})));}}/>Različit status i tip po danu</label>{!perDay&&<DayChoice day={{date:'svi odabrani dani',absenceIds:[],...shared}} onChange={d=>{setShared({status:d.status,type:d.type});setDays(prev=>prev.map(x=>({...x,status:d.status,type:d.type})));}}/>}</>}
   {!review&&groups.length===0&&<p>Nema izostanaka koji čekaju odluku.</p>}
   {(review?days.map(d=>[d.date,[]] as [string,any[]]):groups).map(([date,items])=>{const day=days.find(d=>d.date===date),blocked=!review&&items.some(a=>occupied.has(a.id));return <div key={date} className="border rounded p-3 space-y-2"><label className="flex gap-2 items-center normal-case text-sm"><input type="checkbox" checked={!!day} disabled={review||blocked} onChange={e=>setDays(prev=>e.target.checked?[...prev,{date,absenceIds:items.map(a=>a.id),...shared}]:prev.filter(d=>d.date!==date))}/>{familyDate(date)}{blocked&&<span className="text-slate-500">— zahtjev već poslan</span>}</label>{!review&&<details><summary className="text-sm cursor-pointer">Pregled izostalih sati ({items.length})</summary><ul className="text-sm pl-4">{items.map(a=><li key={a.id}>{a.hour}. sat — {a.lessons?.subjects?.name||'Nastavni sat'}</li>)}</ul></details>}{day&&(review||perDay)&&<DayChoice day={day} review={review} onChange={d=>setDays(prev=>prev.map(x=>x.date===d.date?d:x))}/>}</div>;})}
   {review?<><div className="p-3 bg-slate-50 rounded text-sm"><strong>Napomena roditelja:</strong><p className="whitespace-pre-wrap">{note||'Nije unesena.'}</p>{editing?.attachment_path&&<button className="underline" onClick={()=>openAbsenceAttachment(editing.attachment_path!).catch(e=>toast.error(e.message))}>Preuzmi ispričnicu — {editing.attachment_name}</button>}</div><label>Bilješka razrednika — vidljiva roditelju<textarea className={input} rows={3} value={teacherNote} maxLength={5000} onChange={e=>setTeacherNote(e.target.value)}/></label></>:<><label>Napomena<textarea className={input} rows={3} value={note} maxLength={5000} onChange={e=>setNote(e.target.value)}/></label><label>Priloži ispričnicu (do 10 MB)<input className={input} type="file" accept=".jpg,.jpeg,.png,.gif,.pdf,.doc,.docx" onChange={e=>setFile(e.target.files?.[0]||null)}/></label>{editing?.attachment_name&&<p className="text-sm">Postojeći prilog: {editing.attachment_name}{file?' — bit će zamijenjen':''}</p>}</>}
   <div className="flex gap-3"><button className={button} disabled={busy||!days.length} onClick={save}>{busy?'Spremanje…':review?'Obradi zahtjev':'Pošalji zahtjev'}</button><button disabled={busy} className="px-4 py-2 border rounded" onClick={()=>setCompose(false)}>Odustani</button></div>
  </section>}
  <div className="flex flex-wrap gap-3 items-center"><h2 className="font-bold">{review?'Popis zahtjeva':'Prošli zahtjevi'}</h2><select aria-label="Stanje zahtjeva" className="border rounded p-2 text-sm" value={status} onChange={e=>setStatus(e.target.value)}><option value="ALL">Svi zahtjevi</option><option value="SUBMITTED">Čekaju obradu</option><option value="PROCESSED">Obrađeni</option></select></div>
  {!loading&&!error&&requests.filter(r=>status==='ALL'||r.status===status).length===0&&<p className="text-slate-500">Nema zahtjeva za odabrani prikaz.</p>}
  {requests.filter(r=>status==='ALL'||r.status===status).map(r=><article key={r.id} className="border rounded-lg p-4 space-y-3"><div className="flex flex-wrap justify-between gap-2"><strong>{review?`${names[r.student_id]||'Učenik'} — ${names[r.parent_id]||'Roditelj'}`:r.status==='PROCESSED'?'Obrađeni zahtjev':'Čeka obradu'}</strong><span className="text-xs text-slate-500">Predano {new Date(r.created_at).toLocaleString('hr-HR')}</span></div><p className="text-sm">{r.days.map(d=>familyDate(d.date)).join(', ')}</p><p className="text-sm whitespace-pre-wrap">{r.parent_note}</p>{r.attachment_path&&<button className="text-sm underline" onClick={()=>openAbsenceAttachment(r.attachment_path!).catch(e=>toast.error(e.message))}>Preuzmi ispričnicu — {r.attachment_name}</button>}{r.status==='PROCESSED'?<div className="bg-green-50 p-3 rounded text-sm"><strong>Obrađeno {r.processed_at?new Date(r.processed_at).toLocaleString('hr-HR'):''}</strong><ul>{r.days.map(d=><li key={d.date}>{familyDate(d.date)}: {absenceStatuses[d.status]} — {d.type}{d.reason?` (${d.reason})`:''}</li>)}</ul>{r.teacher_note&&<p className="mt-2 whitespace-pre-wrap">Bilješka razrednika: {r.teacher_note}</p>}</div>:<div className="flex gap-3"><button disabled={busy} className={button} onClick={()=>start(r)}>{review?'Obradi':'Uredi'}</button>{!review&&<button disabled={busy} className="px-3 py-2 border rounded text-red-700" onClick={()=>cancel(r)}>Obriši</button>}</div>}</article>)}
 </div>;
}
