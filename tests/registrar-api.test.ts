import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { registrarHandler } from "../api/registrar";

const id = "00000000-0000-4000-8000-000000000001";
const school = "school-a";
function response() {
  return {
    code: 200,
    headers: {} as Record<string, string>,
    body: null as any,
    setHeader(k: string, v: string) {
      this.headers[k] = v;
    },
    status(v: number) {
      this.code = v;
      return this;
    },
    json(v: any) {
      this.body = v;
      return this;
    },
    send(v: any) {
      this.body = v;
      return this;
    },
  };
}
const request = (body: any, auth = "Bearer verified-session") => ({
  method: "POST",
  headers: { authorization: auth },
  body,
});
test("Document API checks PIN/TOTP proof before service access, school scope and private file integrity", async () => {
  const original = globalThis.fetch;
  const calls: { path: string; query: string; auth: string; method: string; body: any }[] = [];
  let denyProof = false;
  const file = Buffer.from("%PDF synthetic archive");
  const sha = createHash("sha256").update(file).digest("hex");
  let record: any = {
    id,
    status: "SPREMNO",
    pdf_path: `${school}/${id}/document.pdf`,
    pdf_sha256: sha,
  };
  const handler = registrarHandler(() => ({
    url: "https://example.invalid",
    anon: "anon-test",
    service: "server-only-service-test",
  }));
  globalThis.fetch = async (input: any, options: any = {}) => {
    const path = new URL(typeof input === "string" ? input : input.url)
      .pathname;
    const auth = new Headers(options.headers).get("Authorization") || "";
    let body;
    try {
      body = JSON.parse(options.body);
    } catch {
      body = options.body;
    }
    calls.push({ path, query:new URL(typeof input === "string" ? input : input.url).search, auth, method: options.method, body });
    const json = (value: any, status = 200) =>
      new Response(JSON.stringify(value), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    if (path.endsWith("/rpc/registrar_touch_session"))
      return denyProof
        ? json({ code: "P0001", message: "Prijava nije potvrđena." }, 403)
        : json(true);
    if (path.endsWith("/rpc/registrar_workspace"))
      return json({ school: { id: school } });
    if (path.endsWith("/rpc/registrar_document")) return json(record);
    if (path.endsWith("/rpc/registrar_document_snapshot"))return json({...record.snapshot,prepared_at:"2026-10-23"});
    if (path.endsWith("/rpc/registrar_issue_document"))
      return json({ id, status: "IZDANO" });
    if (path.includes("/storage/v1/object/registrar-documents/") && options.method==='POST')return json({Key:school+'/file.pdf'});
    if (path.includes("/storage/v1/object/registrar-documents/"))
      return new Response(file, {
        headers: { "Content-Type": "application/pdf" },
      });
    if (path === "/rest/v1/school_document_records") {
      const params=new URL(typeof input === 'string'?input:input.url).searchParams;
      if(params.has('status'))return json(Number(params.get('offset')||0)===0?Array.from({length:500},(_,i)=>({id:String(i),status:'SPREMNO',snapshot:{student:{name:'Ogledni učenik'},year:{name:'2026/2027'},inputs:{purpose:'Prijevoz'}}})):[{id:'last',status:'NACRT'}]);
      return json(options.method==='PATCH'?{id}:null);
    }
    throw new Error("Unexpected request " + path);
  };
  try {
    let res = response();
    await handler(request({ action: "download", id }, ""), res);
    assert.equal(res.code, 401);
    assert.equal(calls.length, 0);
    denyProof = true;
    res = response();
    await handler(request({ action: "download", id }), res);
    assert.equal(res.code, 400);
    assert.equal(calls.length, 1);
    assert(!calls.some((c) => c.auth.includes("server-only")));
    denyProof = false;
    calls.length = 0;
    record.pdf_path = `school-b/${id}/document.pdf`;
    res = response();
    await handler(request({ action: "download", id }), res);
    assert.equal(res.code, 400);
    assert(!calls.some((c) => c.path.includes("/storage/")));
    record.pdf_path = `${school}/${id}/document.pdf`;
    record.pdf_sha256 = "wrong";
    calls.length = 0;
    res = response();
    await handler(request({ action: "download", id }), res);
    assert.equal(res.code, 400);
    assert.match(res.body.error, /Integritet/);
    assert(!calls.some((c) => c.path === "/rest/v1/school_document_records"));
    record.pdf_sha256 = sha;
    calls.length = 0;
    res = response();
    await handler(request({ action: "download", id }), res);
    assert.equal(res.code, 200);
    assert.deepEqual(res.body, file);
    assert.equal(res.headers["Cache-Control"], "private, no-store");
    assert.equal(res.headers["Content-Type"], "application/pdf");
    assert(
      calls
        .find((c) => c.path.includes("/storage/"))
        ?.auth.includes("server-only-service-test"),
    );
    assert(
      calls
        .filter((c) => c.path.includes("/rpc/"))
        .every((c) => c.auth === "Bearer verified-session"),
    );
    assert(!calls.some((c) => c.path.includes("/public/")));
    calls.length=0;res=response();await handler(request({action:'pending',schoolId:'school-b'}),res);
    assert.equal(res.code,200);assert.equal(res.body.length,501);assert.equal(res.body[0].student_name,'Ogledni učenik');assert.equal(res.body[0].snapshot,undefined);
    const pages=calls.filter(c=>c.path==='/rest/v1/school_document_records');assert.equal(pages.length,2);
    for(const page of pages){const q=new URLSearchParams(page.query);assert.equal(q.get('school_id'),'eq.'+school);assert(q.get('status')?.includes('NACRT'));assert(page.auth.includes('server-only-service-test'));}
    assert.equal(new URLSearchParams(pages[1].query).get('offset'),'500');
    calls.length = 0;
    res = response();
    await handler(request({ action: "issue", id, sha256: sha }), res);
    assert.equal(res.body.status, "IZDANO");
    assert.equal(calls.at(-1)?.body._sha, sha);
    assert(!calls.some((c) => c.auth.includes("server-only")));
    calls.length=0;
    record={id,school_id:school,school_year_id:id,class_id:'class-a',student_id:id,document_type:'attendance',status:'NACRT',snapshot:{inputs:{attest:false}}};
    const retryHandler=registrarHandler(()=>({url:'https://example.invalid',anon:'anon-test',service:'server-only-service-test'}),async()=>({bytes:new Uint8Array(file),sha256:sha,attestation:'NONE',pages:1}));
    res=response();await retryHandler(request({action:'retry',id}),res);assert.equal(res.code,200);assert.equal(res.body.id,id);assert.equal(res.body.status,'SPREMNO');
    assert(!calls.some(c=>c.path.endsWith('/rpc/registrar_prepare_document')),'retry must reuse the existing draft');
    const patch=calls.find(c=>c.path==='/rest/v1/school_document_records'&&c.method==='PATCH');assert.equal(patch?.body.snapshot.prepared_at,'2026-10-23');assert(patch?.body.pdf_path.startsWith(school+'/'+id+'/'));
    calls.length=0;record.school_id='school-b';res=response();await retryHandler(request({action:'retry',id}),res);assert.equal(res.code,400);assert(!calls.some(c=>c.path.includes('/storage/')));
  } finally {
    globalThis.fetch = original;
  }
});
