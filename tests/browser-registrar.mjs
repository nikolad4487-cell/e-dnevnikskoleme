import { createRequire } from "node:module";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { createServer } from "node:http";
import assert from "node:assert/strict";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(new URL("../package.json", import.meta.url));
const { build } = require("esbuild");
const { chromium } = await import("playwright-core");
const dir = join(tmpdir(), "skolehr-browser-registrar");
await mkdir(dir, { recursive: true });
const year = "00000000-0000-4000-8000-000000000001",
  year2 = "00000000-0000-4000-8000-000000000002",
  student = "00000000-0000-4000-8000-000000000003",
  doc = "00000000-0000-4000-8000-000000000004",
  thesis = "00000000-0000-4000-8000-000000000005";
const context = {
  school: { id: "school-a", name: "Ogledna škola A" },
  signer: {
    signer_name: "Test Referent",
    signature_path: "school-a/test.png",
    attestation_authorized: true,
    numbering_rules: "Broj iz urudžbenog postupka",
  },
  years: [
    { id: year, name: "2026./2027.", is_active: true },
    { id: year2, name: "2027./2028." },
  ],
  classes: [
    { id: "class-a", name: "4.A", school_year_id: year, graduating: true },
    { id: "class-new", name: "1.B", school_year_id: year2 },
  ],
};
const person = {
  id: student,
  enrollment_id: student,
  student_id: student,
  name: "Testna Učenica",
  oib: "12345678901",
  dob: "2008-01-01",
  attendance_mode: "REGULAR",
  status_verified_at: "2026-10-20",
};
const entry = `import React from 'react';import{createRoot}from'react-dom/client';import{BrowserRouter}from'react-router-dom';import{Toaster}from'react-hot-toast';import RegistrarPortal from '${root}/src/pages/registrar/RegistrarPortal.tsx';window.__calls=[];window.__context=${JSON.stringify(context)};window.__person=${JSON.stringify(person)};createRoot(document.getElementById('root')).render(<BrowserRouter><RegistrarPortal/><Toaster/></BrowserRouter>);`;
const mocks = {
  auth: `export const useAuth=()=>({user:{id:'test-office',name:'Test Referent'},loading:false,signOut:async()=>{}});`,
  supabase: `export const supabase={auth:{getSession:async()=>({data:{session:{access_token:'test-only-token'}}})},rpc:async(name,args)=>{window.__calls.push({name,args});let data=null;if(name==='portal_work_queue')data=[{key:'documents',title:'Dokumenti čekaju izdavanje',count:12,link:'https://referada.skolehr.xyz/'}];else if(name==='registrar_document')data={id:args._id,pdf_sha256:'test-sha',status:'SPREMNO',attestation_status:'VISUAL'};else if(name==='registrar_workspace')data=window.__context;else if(name==='registrar_class_students')data=[window.__person];else if(name==='registrar_document_archive')data=[{id:'${doc}',document_type:'zet-regular-2026-2027',student_name:'Testna Učenica',status:'IZDANO',school_year_id:'${year}',year_name:'2026./2027.',issued_on:'2026-10-20',created_at:'2026-10-20',purpose:'Prijevoz'}];else if(name==='registrar_theses')data=[{id:'${thesis}',student_id:'${student}',name:'Testna Učenica',thesis_title:'Ogledni završni rad'}];else if(name==='registrar_registry_log'||name==='registrar_transport_review')data=[];else if(name==='registrar_register_entry')data='${doc}';return {data,error:null}},storage:{from:()=>({upload:async()=>({error:null})})}};`,
};
const bundle = await build({
  stdin: { contents: entry, resolveDir: root, loader: "tsx" },
  bundle: true,
  format: "esm",
  platform: "browser",
  write: false,
  plugins: [
    {
      name: "test-mocks",
      setup(b) {
        b.onResolve({ filter: /contexts\/AuthContext$/ }, () => ({
          path: "auth",
          namespace: "test",
        }));
        b.onResolve({ filter: /supabase$/ }, () => ({
          path: "supabase",
          namespace: "test",
        }));
        b.onLoad({ filter: /.*/, namespace: "test" }, ({ path }) => ({
          contents: mocks[path],
          loader: "js",
        }));
      },
    },
  ],
});
const cssFiles = await readdir(root + "/dist/assets");
const css = await readFile(
  root +
    "/dist/assets/" +
    cssFiles.find((n) => n.startsWith("index-") && n.endsWith(".css")),
);
const pdf = await readFile("/tmp/skolehr-pdf-tests/zet-regular-2026-2027.pdf");
const requests = [];
const server = createServer(async (req, res) => {
  if (req.url === "/app.js") {
    res.setHeader("Content-Type", "text/javascript");
    return res.end(bundle.outputFiles[0].contents);
  }
  if (req.url === "/style.css") {
    res.setHeader("Content-Type", "text/css");
    return res.end(css);
  }
  if (req.url === "/api/registrar/documents") {
    let body = "";
    for await (const part of req) body += part;
    const value = JSON.parse(body);
    requests.push(value);
    if(value.action==='pending') {res.setHeader('Content-Type','application/json');return res.end(JSON.stringify([{id:'00000000-0000-4000-8000-000000000006',document_type:'attendance',student_name:'Učenik za nastavak',status:'SPREMNO',school_year_id:year,created_at:'2026-10-22'}]));}
    if (value.action === "download") {
      res.setHeader("Content-Type", "application/pdf");
      return res.end(pdf);
    }
    res.setHeader("Content-Type", "application/json");
    return res.end(
      JSON.stringify(
        value.action === "prepare"
          ? {
              id: doc,
              sha256: "test-sha",
              status: "SPREMNO",
              attestation_status: "VISUAL",
              pages: 2,
            }
          : { id: doc, status: "IZDANO", attestation_status: "VISUAL" },
      ),
    );
  }
  res.setHeader("Content-Type", "text/html");
  res.end(
    '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>',
  );
});
await new Promise((r) => server.listen(4325, "127.0.0.1", r));
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
let navigations=0;page.on('framenavigated',frame=>{if(frame===page.mainFrame())navigations++;});
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.route("**/*", (route) =>
  new URL(route.request().url()).hostname === "127.0.0.1" ||
  route.request().url().startsWith("blob:")
    ? route.continue()
    : route.abort(),
);
try {
  await page.goto("http://127.0.0.1:4325");
  await page.getByText("Ogledna škola A").waitFor();
  await page.getByLabel("Školska godina", { exact: true }).selectOption(year);
  await page.getByLabel("Razred", { exact: true }).selectOption("class-a");
  await page
    .getByRole("button", { name: "2. ZET obrasci", exact: true })
    .click();
  await page.getByLabel("4. Učenik / student").selectOption(student);
  await page
    .getByLabel("Primijeni odobreni vizualni školski pečat i potpis", {
      exact: false,
    })
    .check();
  await page
    .getByRole("button", { name: "5. Pripremi i pregledaj PDF", exact: true })
    .click();
  await page.getByTitle("Pregled dokumenta prije izdavanja").waitFor();
  assert.equal(requests[0].template, "zet-regular-2026-2027");
  assert.equal(requests[0].inputs.attest, true);
  await page.getByLabel("Stranica 2 od 2", { exact: true }).waitFor();
  assert.equal(await page.locator("canvas").count(), 2);
  await page
    .getByRole("button", {
      name: "6. Izdaj i evidentiraj dokument",
      exact: true,
    })
    .click();
  await page
    .getByText("Dokument je izdan i spremljen u privatnu evidenciju.")
    .waitFor();
  await page.screenshot({
    path: dir + "/referada-preview-laptop.png",
    fullPage: true,
  });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  assert.equal(overflow, false, "Laptop must not scroll horizontally");
  await page
    .getByRole("button", {
      name: "6. Završni radovi i urudžbiranje",
      exact: true,
    })
    .click();
  await page.getByLabel("Završni rad učenika").selectOption(thesis);
  await page
    .getByLabel("Urudžbeni broj", { exact: true })
    .fill("602-01/26-01/1");
  await page.getByLabel("Datum urudžbiranja").fill("2026-10-20");
  await page
    .getByRole("button", { name: "Spremi u zapisnik", exact: true })
    .click();
  await page.getByText("Predmet je evidentiran.").waitFor();
  const call = await page.evaluate(() =>
    window.__calls.find((x) => x.name === "registrar_register_entry"),
  );
  assert.equal(call.args._thesis, thesis);
  assert.equal(call.args._number, "602-01/26-01/1");
  await page
    .getByRole("button", { name: "9. Izdani dokumenti", exact: true })
    .click();
  await page.getByText("Testna Učenica", { exact: true }).waitFor();
  await page.getByLabel("Školska godina", { exact: true }).selectOption(year2);
  assert.equal(
    await page.getByLabel("Razred", { exact: true }).inputValue(),
    "",
  );
  await page.getByLabel("Razred", { exact: true }).selectOption("class-new");
  for (const viewport of [
    { width: 1366, height: 768 },
    { width: 1920, height: 1080 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      ),
      false,
      JSON.stringify(viewport),
    );
    await page.screenshot({
      path: dir + `/referada-${viewport.width}.png`,
      fullPage: true,
    });
  }
  assert.deepEqual(errors, []);
  const report = {
    passed: true,
    checks: [
      "year/class/activity/student flow",
      "original template prepare and PDF preview",
      "issue after preview",
      "school-only attestation request",
      "real thesis id and manual official number preserved",
      "archive visible",
      "pending task opens filtered queue without reload, resumes preview and issue, direct link survives reload",
      "year change clears previous class",
      "no horizontal overflow at 1280,1366,1920,390",
      "no React runtime errors",
    ],
    mocked_data: true,
  };
  await writeFile(
    dir + "/registrar-report.json",
    JSON.stringify(report, null, 2),
  );
  const documentTimeOrigin=await page.evaluate(()=>performance.timeOrigin);
  await page.getByRole('link',{name:'Dokumenti čekaju izdavanje (12)',exact:true}).click();
  await page.getByRole('heading',{name:'Dokumenti čekaju izdavanje',exact:true}).waitFor();
  await page.getByText('Učenik za nastavak',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>performance.timeOrigin),documentTimeOrigin,'task must switch view without page reload');
  await page.getByRole('button',{name:'Nastavi izdavanje',exact:true}).click();
  const resumeIssue=page.getByRole('button',{name:'Izdaj pregledani dokument',exact:true});await resumeIssue.waitFor();
  await page.waitForFunction(()=>Array.from(document.querySelectorAll('button')).some(b=>b.textContent==='Izdaj pregledani dokument'&&!b.disabled));
  await resumeIssue.click();await page.getByText('Dokument je izdan i evidentiran.',{exact:true}).waitFor();
  assert(requests.some(r=>r.action==='pending'));assert(requests.some(r=>r.action==='issue'&&r.id==='00000000-0000-4000-8000-000000000006'));
  await page.goto('http://127.0.0.1:'+server.address().port+'/?task=documents');await page.getByRole('heading',{name:'Dokumenti čekaju izdavanje',exact:true}).waitFor();await page.getByText('Učenik za nastavak',{exact:true}).waitFor();
  console.log(JSON.stringify(report));
} catch (e) {
  console.log(
    "BROWSER_ERRORS",
    JSON.stringify(errors),
    await page.locator("body").innerText(),
  );
  await page.screenshot({ path: dir + "/failure.png", fullPage: true });
  throw e;
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
