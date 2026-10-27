import {AsyncLocalStorage} from 'node:async_hooks';
import {createClient} from '@supabase/supabase-js';
import type {Request,Response,NextFunction} from 'express';

type Snapshot = {base:Record<string,any[]>;pending:Record<string,any[]>};
const context=new AsyncLocalStorage<Snapshot>();
export const collections=['lektire','pedagoska_dokumentacija','student_pedagogical_profiles','student_pedagogical_year_notes','daily_notes','overall_success_audit_logs','practicum_placements','practicum_logs','practicum_evaluations','student_registrations','student_transfers','competitions','payments','final_exam_defense_schedule','final_exam_defense_commission_members','matura_registrations','matura_settings','matura_exam_schedule','matura_results','matura_objections','matura_study_applications','matura_study_programs','ematica_sync_runs','ematica_student_records','school_events','school_documents','system_audit_logs'];
const unavailable=()=>new Error('Trajna pohrana nije dostupna. Potrebna je aktivacija POUZDANOST-SUSTAVA; promjena nije spremljena.');
export function readLegacyCollection(filename:string):any[]{const c=filename.replace(/\.json$/,''),state=context.getStore();if(!state||!collections.includes(c)||!Array.isArray(state.base[c]))throw unavailable();return structuredClone(state.pending[c]??state.base[c]);}
export function writeLegacyCollection(filename:string,data:any[]){const c=filename.replace(/\.json$/,''),state=context.getStore();if(!state||!collections.includes(c)||!Array.isArray(state.base[c])||!Array.isArray(data))throw unavailable();state.pending[c]=structuredClone(data);}
// Keep old handler contracts while committing all staged changes in one DB transaction.
// No local file is a fallback for operational data, including on serverless hosts.
export function durableLegacyMiddleware(clientFor:(req:Request)=>any){return async(req:Request,res:Response,next:NextFunction)=>{
 const managed=/^\/api\/(overall-success-audit-logs|matura-[a-z-]+|final-exam-defense-schedules|school-events|school-documents|audit-logs|student-pedagogical-profile|student-pedagogical-year-notes|pedagoska-dokumentacija|daily-notes|admin\/ematica-sync|practicum-[a-z-]+|student-registrations|student-transfers|competitions|payments)(\/|$)/;
 if(!managed.test(req.path)||req.path==='/api/student-registrations'&&req.method!=='GET')return next();
 try{
  const client=clientFor(req);
  const group=req.path.split('/')[2],suffix=req.path.split('/')[3];
  const names:Record<string,string>={'overall-success-audit-logs':'overall_success_audit_logs','final-exam-defense-schedules':'final_exam_defense_schedule','student-pedagogical-profile':'student_pedagogical_profiles','student-pedagogical-year-notes':'student_pedagogical_year_notes','audit-logs':'system_audit_logs'};
  const selected=group==='admin'?collections:[names[group]||group.replaceAll('-','_'),...(group.startsWith('matura-')?['matura_settings']:[]),...(group==='final-exam-defense-schedules'?['final_exam_defense_commission_members']:[])];
  const text=(value:any)=>typeof value==='string'&&value?value:null;
  const args={_collections:selected,_student:text(req.body?.student_id||req.body?.studentId||req.query?.studentId||req.query?.student_id),_class:text(req.body?.class_id||req.body?.classId||req.query?.classId),_school:text(req.body?.school_id||req.body?.schoolId||req.query?.schoolId||(group==='admin'?((req as any).workflowActor?.profile?.active_school_id||(req as any).workflowActor?.profile?.school_id):null)),_record_id:group==='admin'?null:text(suffix),_placement:text(req.body?.placement_id||req.query?.placementId)};
  const {data,error}=await client.rpc('school_aux_snapshot',args);if(error)throw error;
  const state:Snapshot={base:data,pending:{}};const send=res.json.bind(res);let sending=false;
  res.json=((body:any)=>{
   if(sending)return res;sending=true;
   if(res.statusCode>=400||!Object.keys(state.pending).length){send(body);return res;}
   const changes=Object.entries(state.pending).map(([collection,after])=>({collection,before:state.base[collection],after}));
   void (async()=>{try{const saved=await client.rpc('school_aux_commit',{_changes:changes});if(saved.error)throw saved.error;send(body);}catch(e:any){res.status(e?.code==='40001'?409:503);send({error:e?.code==='40001'?'Zapis je u međuvremenu promijenjen. Osvježite prikaz i ponovite radnju.':e?.message||unavailable().message});}})();return res;
  }) as any;
  context.run(state,next);
 }catch{res.status(503).json({error:unavailable().message});}
};}
export function userStorageClient(url:string,key:string,req:Request){return createClient(url,key,{global:{headers:{Authorization:`Bearer ${(req as any).workflowActor?.token||''}`}},auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});}
