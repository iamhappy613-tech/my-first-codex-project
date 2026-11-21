import test from 'node:test';import assert from 'node:assert/strict';import {readFile,mkdtemp,mkdir,writeFile,rm,stat,access} from 'node:fs/promises';import {execFileSync,spawn} from 'node:child_process';import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';
import '../supabase/functions/_shared/core.js';
const root=resolve('.');
test('reviewed 1000-word catalog keeps 300 starter tasks and source-backed expansion',async()=>{
 const rows=JSON.parse(await readFile('data/catalog.json','utf8')),extra=JSON.parse(await readFile('data/extra-source.json','utf8'));
 assert.equal(rows.length,1000);assert.equal(new Set(rows.map(w=>w.id)).size,1000);assert.equal(extra.length,700);assert(extra.every(w=>w.tag.split(' ').includes('cet4')));
 for(const w of rows){assert.equal(w.id,w.word);for(const k of ['phonetic','meaning','example','translation','source'])assert(typeof w[k]==='string'&&w[k].trim());assert(w.phonetic.startsWith('/')&&w.phonetic.endsWith('/'));assert(/[\u4e00-\u9fff]/.test(w.translation));assert(/^[A-Za-z]/.test(w.example))}
 const p=WordspaceCore.createPlan(rows.slice(0,300),'2026-11-21');assert.equal(p.deck_ids.length,300);assert(WordspaceCore.validatePlan(p,rows));
});
test('public configuration refuses service secrets and emits only opted-in cloud mode',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'wordspace-config-'));
 try{await mkdir(join(dir,'gpt'));await writeFile(join(dir,'index.html'),'<script id="wordspace-config" type="application/json">{"mode":"local"}</script>');await writeFile(join(dir,'gpt/openapi.json'),'{"servers":[]}');
  assert.throws(()=>execFileSync(process.execPath,[join(root,'scripts/configure.mjs'),'--url','https://project.supabase.co','--key','sb_secret_test'],{cwd:dir,stdio:'pipe'}));
  execFileSync(process.execPath,[join(root,'scripts/configure.mjs'),'--url','https://project.supabase.co','--key','sb_publishable_test'],{cwd:dir,stdio:'pipe'});
  const html=await readFile(join(dir,'index.html'),'utf8');assert(html.includes('"mode":"local"'));const spec=JSON.parse(await readFile(join(dir,'gpt/openapi.json'),'utf8'));assert.equal(spec.servers[0].url,'https://project.supabase.co/functions/v1/coach');
 }finally{await rm(dir,{recursive:true,force:true})}
});
test('connection generator cannot leave a new mismatched credential pair when target exists',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'wordspace-secrets-'));
 try{await writeFile(join(dir,'.env.functions.local'),'existing-config');assert.throws(()=>execFileSync(process.execPath,[join(root,'scripts/connection-secret.mjs'),'--owner','00000000-0000-4000-8000-000000000001','--site','https://site.test'],{cwd:dir,stdio:'pipe'}));
  assert.equal(await readFile(join(dir,'.env.functions.local'),'utf8'),'existing-config');await assert.rejects(access(join(dir,'.env.coach.local')));
 }finally{await rm(dir,{recursive:true,force:true})}
});

test('preview binds loopback and refuses hidden credentials and arbitrary repo paths',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'wordspace-preview-'));let child;
 try{await writeFile(join(dir,'index.html'),'<p>public page</p>');await writeFile(join(dir,'.env.coach.local'),'private-test-marker');
  child=spawn(process.execPath,[join(root,'scripts/preview.mjs'),'--port','0'],{cwd:dir,stdio:['ignore','pipe','pipe']});
  const url=await new Promise((resolve,reject)=>{let out='';child.stdout.on('data',x=>{out+=x;const m=out.match(/http:\/\/127\.0\.0\.1:\d+/);if(m)resolve(m[0])});child.on('exit',code=>reject(Error(`preview exited ${code}`)));child.on('error',reject)});
  assert.equal(await (await fetch(url)).text(),'<p>public page</p>');
  for(const path of ['/.env.coach.local','/supabase/seed.sql','/../.env.coach.local','/%2eenv.coach.local'])assert.equal((await fetch(url+path)).status,404);
 }finally{if(child?.pid&&child.exitCode===null&&child.signalCode===null){const closed=new Promise(resolve=>child.once('close',resolve));child.kill();await closed}await rm(dir,{recursive:true,force:true})}
});

test('cloud staging output preserves live local page and uses its own same-origin email callback',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'wordspace-staging-'));
 try{await mkdir(join(dir,'gpt'));const original='<script id="wordspace-config" type="application/json">{"mode":"local"}</script>';await writeFile(join(dir,'index.html'),original);await writeFile(join(dir,'gpt/openapi.json'),'{"servers":[]}');
  execFileSync(process.execPath,[join(root,'scripts/configure.mjs'),'--url','https://project.supabase.co','--key','sb_publishable_test','--enable-cloud','--output','cloud-preview.html'],{cwd:dir,stdio:'pipe'});
  assert.equal(await readFile(join(dir,'index.html'),'utf8'),original);const staged=await readFile(join(dir,'cloud-preview.html'),'utf8');assert(staged.includes('"mode":"cloud"'));assert(staged.includes('https://iamhappy613-tech.github.io/my-first-codex-project/cloud-preview.html'));
 }finally{await rm(dir,{recursive:true,force:true})}
});
