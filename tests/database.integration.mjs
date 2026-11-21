import test,{before} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
const container=process.env.WORDSPACE_TEST_CONTAINER;
const sql=s=>execFileSync('docker',['exec','-i',container,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres'],{input:s,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const A='00000000-0000-4000-8000-000000000001', B='00000000-0000-4000-8000-000000000002', ADMIN='00000000-0000-4000-8000-000000000003';
const as=(id,query)=>sql(`begin;set local role authenticated;select set_config('request.jwt.claim.sub','${id}',true);${query};commit;`).split('\n').slice(1).join('\n');
const p={version:3,schema_version:3,deck_ids:['ability','abroad','absorb'],dictionaryId:'ability|abroad|absorb',mastered:['ability'],pending:['absorb'],activeDay:0,days:[{date:'2026-11-21',ids:['ability','abroad'],first:[true,false],review:[],closed:false}]};
const json=x=>`'${JSON.stringify(x).replaceAll("'","''")}'::jsonb`;
before(()=>{
 sql(`create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,last_sign_in_at timestamptz);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon,service_role;grant execute on function auth.uid() to public;`);
 sql(readFileSync('supabase/migrations/202611210001_accounts.sql','utf8'));
 sql(readFileSync('supabase/seed.sql','utf8'));
 sql(`insert into auth.users values('${A}','a@example.test',now()),('${B}','b@example.test',now()),('${ADMIN}','owner@example.test',now());update public.profiles set role='admin' where id='${ADMIN}';`);
});
test('a user cannot read another profile or grant itself admin',()=>{
 assert.equal(as(A,'select count(*) from public.profiles'),'1');
 assert.throws(()=>as(A,`update public.profiles set role='admin' where id='${A}'`));
 assert.throws(()=>as(A,`select public.set_account_status('${B}',false)`),/admin_required/);
});
test('CAS initializes once; stale writes fail and cross-user reads are empty',()=>{
 const result=JSON.parse(as(A,`select public.save_progress(0,${json(p)})`));assert.equal(result.revision,1);
 assert.throws(()=>as(A,`select public.save_progress(0,${json(p)})`),/revision_conflict/);
 assert.equal(as(B,`select count(*) from public.study_progress where user_id='${A}'`),'0');
 assert.throws(()=>as(A,`update public.study_progress set revision=999`));
});
test('malformed plans cannot silently drop pending words',()=>{
 assert.throws(()=>as(A,`select public.save_progress(1,${json({...p,pending:[]})})`),/invalid_progress/);
});
test('disabled old JWT cannot read or save; restoration preserves progress',()=>{
 as(ADMIN,`select public.set_account_status('${A}',false)`);
 assert.equal(as(A,'select count(*) from public.study_progress'),'0');
 assert.throws(()=>as(A,`select public.save_progress(1,${json(p)})`),/account_disabled/);
 as(ADMIN,`select public.set_account_status('${A}',true)`);
 assert.equal(as(A,'select revision from public.study_progress'),'1');
 assert.throws(()=>as(ADMIN,`select public.set_account_status('${ADMIN}',false)`),/cannot_disable_admin/);
});
test('objective events are scored by server and retries are idempotent',()=>{
 const id='10000000-0000-4000-8000-000000000001';
 const q=`select public.submit_assessment('${id}','ability','abroad',false)`;
 assert.equal(JSON.parse(as(A,q)).correct,false);assert.equal(JSON.parse(as(A,q)).correct,false);
 assert.equal(as(A,'select count(*) from public.assessment_events'),'1');
 assert.throws(()=>as(A,`select public.submit_assessment('${id}','ability','ability',false)`),/event_conflict/);
});
test('only trusted bridge can create owner-scoped proposals; adoption is atomic and idempotent',()=>{
 const id='20000000-0000-4000-8000-000000000001';
 assert.throws(()=>as(A,`select public.coach_create_recommendation('${A}','${id}',1,array['academic'],'Next')`));
 sql(`set role service_role;select public.coach_create_recommendation('${A}','${id}',1,array['academic'],'Next');reset role;`);
 const row=JSON.parse(as(A,`select public.adopt_recommendation('${id}',1)`));assert.equal(row.revision,2);assert.deepEqual(row.state.days,p.days);assert(row.state.deck_ids.includes('academic'));assert.deepEqual(row.state.next_day_ids,['academic']);
 const again=JSON.parse(as(A,`select public.adopt_recommendation('${id}',1)`));assert.equal(again.revision,2);assert.equal(again.already_applied,true);
 assert.equal(as(B,'select count(*) from public.recommendations'),'0');
});
test('stale proposals and unknown IDs are refused',()=>{
 const id='20000000-0000-4000-8000-000000000002';
 assert.throws(()=>sql(`set role service_role;select public.coach_create_recommendation('${A}','${id}',1,array['accept'],'Next')`),/revision_conflict/);
 assert.throws(()=>sql(`set role service_role;select public.coach_create_recommendation('${A}','${id}',2,array['not-in-bank'],'Next')`),/invalid_recommendation/);
});
test('admin pagination exposes minimal profile data and correct total',()=>{
 const out=JSON.parse(as(ADMIN,`select public.list_accounts('',1)`));assert.equal(out.total,3);assert.equal(out.users.length,3);assert(out.users.every(u=>!('password' in u)&&'last_sign_in_at' in u));
 assert.throws(()=>as(A,`select public.list_accounts('',1)`),/admin_required/);
});
test('missing required JSON keys cannot pass three-valued SQL validation',()=>{
 const missingVersion={...p};delete missingVersion.version;
 const missingFirst={...p,days:[{...p.days[0]}]};delete missingFirst.days[0].first;
 for(const bad of [missingVersion,missingFirst,{...p,activeDay:null},{...p,days:[{...p.days[0],closed:null}]}])assert.equal(sql(`select private.valid_state(${json(bad)})`),'f');
});
test('two simultaneous first saves cannot both claim revision one',async()=>{
 const {spawn}=await import('node:child_process');
 const run=()=>new Promise(resolve=>{const child=spawn('docker',['exec','-i',container,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres']);let out='',err='';child.stdout.on('data',x=>out+=x);child.stderr.on('data',x=>err+=x);child.on('close',code=>resolve({code,out,err}));child.stdin.end(`begin;set local role authenticated;select set_config('request.jwt.claim.sub','${B}',true);select public.save_progress(0,${json(p)});commit;`)});
 const result=await Promise.all([run(),run()]);assert.equal(result.filter(x=>x.code===0).length,1);assert(result.find(x=>x.code!==0).err.includes('revision_conflict'));assert.equal(as(B,'select revision from public.study_progress'),'1');
});
test('two simultaneous adopts have one effect and return the same latest revision',async()=>{
 const {spawn}=await import('node:child_process'),id='40000000-0000-4000-8000-000000000001';
 sql(`set role service_role;select public.coach_create_recommendation('${A}','${id}',2,array['accept'],'Next');reset role;`);
 const run=()=>new Promise((resolve,reject)=>{const child=spawn('docker',['exec','-i',container,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres']);let out='',err='';child.stdout.on('data',x=>out+=x);child.stderr.on('data',x=>err+=x);child.on('close',code=>code?reject(Error(err)):resolve(JSON.parse(out.trim().split('\n').at(-1))));child.stdin.end(`begin;set local role authenticated;select set_config('request.jwt.claim.sub','${A}',true);select public.adopt_recommendation('${id}',2);commit;`)});
 const rows=await Promise.all([run(),run()]);assert(rows.every(x=>x.revision===3));assert.equal(as(A,`select count(*) from jsonb_array_elements_text((select state->'deck_ids' from public.study_progress)) x where x='accept'`),'1');
});

test('explicit NULL cannot bypass progress compare-and-swap',()=>{
 const before=as(B,'select state::text || revision::text from public.study_progress');
 assert.throws(()=>as(B,`select public.save_progress(NULL,${json(p)})`),/revision_conflict/);assert.equal(as(B,'select state::text || revision::text from public.study_progress'),before);
});
test('explicit NULL cannot bypass recommendation expected revision',()=>{
 const id='50000000-0000-4000-8000-000000000001',rev=Number(as(A,'select revision from public.study_progress'));
 sql(`set role service_role;select public.coach_create_recommendation('${A}','${id}',${rev},array['achieve'],'Next');reset role;`);
 assert.throws(()=>as(A,`select public.adopt_recommendation('${id}',NULL)`),/revision_conflict/);assert.equal(Number(as(A,'select revision from public.study_progress')),rev);assert.equal(as(A,`select status from public.recommendations where id='${id}'`),'pending');
});
