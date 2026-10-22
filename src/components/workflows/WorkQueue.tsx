import React,{useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import {supabase} from '../../lib/supabase';
type Task={key:string;title:string;count:number;link:string};
export default function WorkQueue({schoolId}:{schoolId?:string|null}){
 const [rows,setRows]=useState<Task[]>([]),[message,setMessage]=useState(''),[loading,setLoading]=useState(false),[version,setVersion]=useState(0);
 useEffect(()=>{let active=true;setRows([]);setMessage('');if(!schoolId)return;setLoading(true);
 supabase.rpc('portal_work_queue',{_school:schoolId}).then(r=>{if(!active)return;setLoading(false);if(r.error)setMessage(['PGRST202','42883'].includes(r.error.code)?'Pregled zadataka dostupan je nakon aktivacije nadogradnje radnih tijekova.':'Zadatke nije moguće učitati. Pokušajte ponovno.');else setRows(r.data||[]);});return()=>{active=false;};},[schoolId,version]);
 if(!schoolId)return null;
 return <section aria-label="Zadaci za obradu" className="my-4 p-4 bg-white border rounded-lg min-w-0"><div className="flex flex-wrap justify-between gap-2"><h2 className="font-bold text-[#005c8d]">Zadaci za obradu</h2><button className="text-sm underline" onClick={()=>setVersion(v=>v+1)}>Osvježi zadatke</button></div>{loading?<p role="status">Učitavanje zadataka…</p>:message?<p role="status">{message}</p>:!rows.length?<p className="text-sm text-slate-600">Nemate zadataka koji čekaju obradu.</p>:<ul className="mt-2 space-y-2">{rows.map(r=><li key={r.key} className="text-sm break-words">{r.link.startsWith('https://')?<a className="underline" href={r.link}>{r.title} ({r.count})</a>:<Link className="underline" to={r.link}>{r.title} ({r.count})</Link>}</li>)}</ul>}</section>;
}
