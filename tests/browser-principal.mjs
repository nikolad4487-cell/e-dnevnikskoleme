import {build} from 'esbuild';
import {chromium} from 'playwright-core';
import {createServer} from 'node:http';
import {mkdtemp,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import assert from 'node:assert/strict';
const root=process.cwd(),dir=await mkdtemp(tmpdir()+'/skolehr-principal-');
const entry=`import React,{useState}from'react';import{createRoot}from'react-dom/client';import{MemoryRouter}from'react-router-dom';import Page from'${root}/src/pages/admin/RavnateljDashboardPage.tsx';import{ProtectedRoute}from'${root}/src/components/ProtectedRoute.tsx';import{Role}from'${root}/src/types.ts';function App(){const[admin,setAdmin]=useState(false);return <MemoryRouter><button onClick={()=>setAdmin(!admin)}>Promijeni područje</button><ProtectedRoute allowedRoles={admin?[Role.ADMIN]:[Role.PRINCIPAL]}><Page/></ProtectedRoute></MemoryRouter>}window.fetch=async()=>new Response('[]',{status:403});createRoot(document.getElementById('root')).render(<App/>);`;
const auth=`export const useAuth=()=>({user:{id:'principal'},userSchoolRoles:[{role:'PRINCIPAL',schoolId:'a',status:'ACTIVE'}],isMainAdmin:false,isSchoolAdmin:false,isStaff:true,loading:false,error:null,signOut:async()=>{}});`;
const selection=`const setSelectedSchoolId=()=>{};export const useSelection=()=>({selectedSchoolId:'a',setSelectedSchoolId});`;
const db=`export const supabase={rpc:async()=>({data:[],error:null}),from(table){const q={select(){return q},eq(){return q},in(){return q},then(a,b){const filled=window.__filled;const data=table==='classes'?[{id:'ca',name:'3.A',program_id:'p'}]:table==='programs'?[{id:'p',name:'Program'}]:filled&&table==='grades'?[{value:5,class_id:'ca'},{value:3,class_id:'ca'},{value:1,class_id:'ca'}]:filled&&table==='student_year_summaries'?[{class_id:'ca',behavior:''},{class_id:'ca',behavior:'GOOD'}]:[];return Promise.resolve({data,count:0,error:null}).then(a,b)}};return q}};`;
const charts=`import React from'react';const chart=({data,children})=><div data-chart-records={data?JSON.stringify(data):undefined}>{children}</div>;const node=()=>null;export const ResponsiveContainer=chart,BarChart=chart,PieChart=chart,LineChart=chart,AreaChart=chart;export const Bar=node,XAxis=node,YAxis=node,CartesianGrid=node,Tooltip=node,Legend=node,Pie=node,Cell=node,Line=node,Area=node;`;
await build({stdin:{contents:entry,resolveDir:root,loader:'tsx'},outfile:dir+'/app.js',bundle:true,format:'esm',jsx:'automatic',plugins:[{name:'principal-fixtures',setup(b){
 b.onResolve({filter:/contexts\/AuthContext$/},()=>({path:'auth',namespace:'fixture'}));
 b.onResolve({filter:/contexts\/SelectionContext$/},()=>({path:'selection',namespace:'fixture'}));
 b.onResolve({filter:/lib\/supabase$/},()=>({path:'db',namespace:'fixture'}));
 b.onResolve({filter:/^recharts$/},()=>({path:'charts',namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:{auth,selection,db,charts}[args.path],loader:'tsx',resolveDir:root}));
}}]});
const server=createServer(async(req,res)=>{res.setHeader('Content-Type',req.url==='/app.js'?'application/javascript':'text/html');res.end(req.url==='/app.js'?await readFile(dir+'/app.js'):'<html><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>');});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.address().port);
 await page.getByText('Nema ocjena',{exact:true}).waitFor();
 const charts=()=>page.locator('[data-chart-records]').evaluateAll(nodes=>nodes.map(n=>JSON.parse(n.getAttribute('data-chart-records'))));
 let data=await charts();assert(data.some(rows=>rows.some(row=>row.prosjek===null)));assert(data.some(rows=>rows.some(row=>row.Uzorno===0&&row.Dobro===0&&row.Loše===0)));
 await page.evaluate(()=>{window.__filled=true;});await page.getByRole('button',{name:/Osvježi podatke/}).click();
 await page.waitForFunction(()=>[...document.querySelectorAll('[data-chart-records]')].some(n=>JSON.parse(n.getAttribute('data-chart-records')).some(r=>r.prosjek===3)));
 data=await charts();assert(data.some(rows=>rows.some(row=>row.Uzorno===0&&row.Dobro===1&&row.Loše===0)));
 await page.getByRole('button',{name:'Promijeni područje'}).click();await page.getByText('Pristup ograničen',{exact:true}).waitFor();assert.equal(await page.getByRole('heading',{name:'Upravljačka ploča ravnatelja'}).count(),0);
 assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,checks:['actual principal dashboard route allowed','empty grades have no simulated averages','empty conduct is zero','recorded grade averages and conduct only','principal admin route denied']}));
}finally{await browser.close();await new Promise(r=>server.close(r));}
