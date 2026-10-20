import React,{useCallback,useEffect,useState} from 'react';
import toast from 'react-hot-toast';
import {supabase} from '../../lib/supabase';
import {useAuth} from '../../contexts/AuthContext';
import {useSelection} from '../../contexts/SelectionContext';
import {familyRpc,familyDate} from '../../lib/familyPortal';
import {buildAttendancePdf,type AttendanceRecord} from '../../lib/attendancePdf';
import {CERTIFICATE_PURPOSES} from '../../lib/certificatePurposes';
export default function PotvrdePage({schoolOffice=false}:{schoolOffice?:boolean}){
 const {user,isParent}=useAuth(),{selectedChildId,selectedSchoolId,selectedClassId}=useSelection();
 const [students,setStudents]=useState<any[]>([]),[selected,setSelected]=useState(''),[purpose,setPurpose]=useState(''),[history,setHistory]=useState<AttendanceRecord[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false),[showHistory,setShowHistory]=useState(false);
 const enrollment=students.find(s=>s.id===selected),studentId=schoolOffice?enrollment?.student_id:isParent?selectedChildId:user?.id,classId=schoolOffice?enrollment?.class_id:selectedClassId;
 useEffect(()=>{setSelected('');setHistory([]);if(!schoolOffice||!selectedSchoolId)return;let live=true;
 (async()=>{try{if(!await familyRpc('portal_admin',{_school:selectedSchoolId}))throw new Error('Potvrde referade može izdavati administrator škole.');const {data,error}=await supabase.from('student_class_enrollments').select('id,student_id,class_id,student:user_profiles!student_id(name),classes!inner(name,school_id,school_year)').eq('classes.school_id',selectedSchoolId).eq('status','ACTIVE').order('created_at',{ascending:false});if(error)throw error;if(live)setStudents(data||[]);}catch(e:any){if(live)setError(e.message);}})();return()=>{live=false;};
 },[schoolOffice,selectedSchoolId]);
 const load=useCallback(async()=>{setHistory([]);setError('');if(!studentId||!classId)return;const {data,error}=await supabase.from('portal_attendance_certificates').select('*').eq('student_id',studentId).eq('class_id',classId).eq('mode',schoolOffice?'SCHOOL':'SELF').order('issued_at',{ascending:false});if(error)setError(['42P01','PGRST205'].includes(error.code)?'Izdavanje potvrda čeka aktivaciju nadogradnje baze.':error.message);else setHistory(data as AttendanceRecord[]||[]);},[studentId,classId,schoolOffice]);
 useEffect(()=>{load();},[load]);
 const download=async(record:AttendanceRecord)=>{setBusy(true);try{const pdf=await buildAttendancePdf(record);pdf.save(`${String(record.snapshot.student.name||'Ucenik').replace(/\s+/g,'-')}-${record.issued_at.slice(0,10)}-potvrda.pdf`);}catch(e:any){toast.error(e.message||'Potvrdu nije moguće preuzeti.');}finally{setBusy(false);}};
 const generate=async()=>{if(!studentId||!classId||!purpose)return;setBusy(true);try{const record=await familyRpc<AttendanceRecord>('portal_issue_attendance',{_student:studentId,_class:classId,_purpose:purpose,_mode:schoolOffice?'SCHOOL':'SELF'});await download(record);await load();toast.success('Potvrda je izdana i spremljena u evidenciju.');}catch(e:any){toast.error(e.message);}finally{setBusy(false);}};
 return <div className="flex-1 bg-white overflow-auto p-4 md:p-6 space-y-5"><div className="flex flex-wrap justify-between gap-3"><h1 className="text-xl font-bold text-[#005c8d]">{schoolOffice?'Referada — potvrde o redovnom školovanju':'Potvrde o redovnom školovanju'}</h1><button className="border rounded px-4 py-2" onClick={()=>setShowHistory(!showHistory)}>{showHistory?'Izdaj potvrdu':'Moje potvrde'}</button></div>
 {schoolOffice&&<><p className="text-sm text-slate-600">Potvrda referade s pečatom škole i mjestom za vlastoručni potpis odgovorne osobe.</p><label>Učenik i razred<select value={selected} onChange={e=>setSelected(e.target.value)}><option value="">Odaberite učenika</option>{students.map(s=><option key={s.id} value={s.id}>{s.student?.name} — {s.classes?.name} ({s.classes?.school_year})</option>)}</select></label></>}
 {!schoolOffice&&<p className="text-sm text-slate-600">Samostalno izdana potvrda sadrži broj zapisa i kontrolni broj za provjeru.</p>}
 {error&&<p role="alert" className="border bg-amber-50 p-3 rounded">{error}</p>}
 {!showHistory?<><label>Trebam potvrdu u svrhu:<select value={purpose} onChange={e=>setPurpose(e.target.value)}><option value="">Odaberite svrhu</option>{CERTIFICATE_PURPOSES.map(p=><option key={p}>{p}</option>)}</select></label><button className="bg-[#005c8d] text-white rounded px-5 py-3 font-bold disabled:opacity-50" disabled={busy||!studentId||!classId||!purpose||!!error} onClick={generate}>{busy?'Priprema potvrde…':'Generiraj potvrdu'}</button></>:<div className="space-y-3">{history.length===0&&!error&&<p>Nema izdanih potvrda.</p>}{history.map(r=><article key={r.id} className="border rounded p-3 flex flex-wrap justify-between gap-3"><div><strong>{r.snapshot.student.name}</strong><p className="text-sm">{familyDate(r.issued_at)} — {r.purpose}</p></div><button className="underline text-[#005c8d]" disabled={busy} onClick={()=>download(r)}>Preuzmi PDF</button></article>)}</div>}
 </div>;
}
