import React,{useEffect,useRef,useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {supabase} from '../../lib/supabase';
import {useAuth} from '../../contexts/AuthContext';
import {useSelection} from '../../contexts/SelectionContext';
import WorkQueue from '../../components/workflows/WorkQueue';
const button='border rounded px-3 py-2 disabled:opacity-50';
export default function NotificationCenterPage(){
 const {user,isParent,isStaff}=useAuth(),selection=useSelection(),navigate=useNavigate();
 const [rows,setRows]=useState<any[]>([]),[filter,setFilter]=useState('ALL'),[loading,setLoading]=useState(false),[busy,setBusy]=useState<string|null>(null),[error,setError]=useState(''),[more,setMore]=useState(false);
 const generation=useRef(0),cursor=useRef<any>(null);
 const load=async(append=false)=>{const run=++generation.current;if(!user)return;setLoading(true);setError('');if(!append){setRows([]);cursor.current=null;}
  try{let q=supabase.from('portal_notifications').select('*,classes(school_id,school_year_id)').eq('user_id',user.id).lte('visible_at',new Date().toISOString()).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(101);
   if(filter!=='ALL')q=q.eq('is_read',filter==='READ');const last=append?cursor.current:null;
   if(last)q=q.or(`created_at.lt.${last.created_at},and(created_at.eq.${last.created_at},id.lt.${last.id})`);
   const r=await q;if(run!==generation.current)return;if(r.error)throw r.error;
   const items=(r.data||[]).slice(0,100);setRows(old=>append?[...old,...items]:items);setMore((r.data?.length||0)>100);cursor.current=items.at(-1);
  }catch(e:any){if(run===generation.current){setRows([]);setMore(false);setError(e.message||'Obavijesti nije moguće učitati.');}}finally{if(run===generation.current)setLoading(false);}
 };
 useEffect(()=>{load();return()=>{generation.current++;};},[user?.id,filter]);
 const mark=async(row:any,read:boolean)=>{const run=generation.current;setBusy(row.id);setError('');try{const r=await supabase.from('portal_notifications').update({is_read:read}).eq('id',row.id).eq('user_id',user!.id).select('id');if(r.error)throw r.error;if(!r.data?.length)throw Error('Obavijest više nije dostupna.');if(run===generation.current)setRows(old=>old.flatMap(n=>n.id!==row.id?[n]:filter==='ALL'?[{...n,is_read:read}]:[]));return true;}catch(e:any){if(run===generation.current)setError(e.message);return false;}finally{setBusy(null);}};
 const open=async(row:any)=>{const run=generation.current;let target:URL;try{target=new URL(row.link,window.location.origin);}catch{setError('Poveznica obavijesti nije valjana.');return;}if(target.origin!==window.location.origin||!row.link.startsWith('/')||row.link.startsWith('//')){setError('Poveznica obavijesti nije interna poveznica sustava.');return;}
  if(!row.is_read&&!await mark(row,true))return;if(run!==generation.current)return;
  if(isParent&&row.student_id)selection.setSelectedChildId(row.student_id);if(row.class_id)selection.setSelectedClassId(row.class_id);if(row.classes?.school_id)selection.setSelectedSchoolId(row.classes.school_id);if(row.classes?.school_year_id)selection.setSelectedYearId(row.classes.school_year_id);navigate(target.pathname+target.search+target.hash);
 };
 return <main className="p-4 md:p-6 space-y-4 min-w-0 max-w-5xl mx-auto"><h1 className="text-xl font-bold text-[#005c8d]">Obavijesti i zadaci</h1>{isStaff&&<WorkQueue schoolId={selection.selectedSchoolId}/>}
 <div className="flex flex-wrap gap-3 items-center"><label>Prikaži <select className={button} value={filter} onChange={e=>setFilter(e.target.value)}><option value="ALL">Sve obavijesti</option><option value="UNREAD">Nepročitane</option><option value="READ">Pročitane</option></select></label><button className={button} disabled={loading} onClick={()=>load()}>Osvježi obavijesti</button></div>
 {error&&<p role="alert" className="border border-red-200 rounded p-3">{error}</p>}{loading&&<p role="status">Učitavanje obavijesti…</p>}{!loading&&!error&&!rows.length&&<p>Nema obavijesti za odabrani prikaz.</p>}
 {rows.map(n=><article key={n.id} className={'border rounded p-4 space-y-2 break-words '+(!n.is_read?'bg-sky-50':'bg-white')}><h2 className="font-bold">{n.title}</h2><p className="whitespace-pre-wrap">{n.body}</p><p className="text-sm text-slate-500">{new Date(n.created_at).toLocaleString('hr-HR',{timeZone:'Europe/Zagreb'})} · {n.is_read?'Pročitano':'Nepročitano'}</p><div className="flex flex-wrap gap-2"><button className={button} disabled={!!busy} onClick={()=>open(n)}>Otvori zadatak</button><button className={button} disabled={!!busy} onClick={()=>mark(n,!n.is_read)}>{n.is_read?'Označi nepročitanim':'Označi pročitanim'}</button></div></article>)}
 {more&&<button className={button} disabled={loading} onClick={()=>load(true)}>Učitaj starije obavijesti</button>}
 </main>;
}
