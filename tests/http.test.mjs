import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {createCoachHandler,createAdminHandler} from '../supabase/functions/_shared/http.js';
const owner='00000000-0000-4000-8000-000000000001';
const env={SUPABASE_URL:'https://db.test',SUPABASE_ANON_KEY:'public',SUPABASE_SERVICE_ROLE_KEY:'server-only',WORDSPACE_OWNER_ID:owner,WORDSPACE_COACH_TOKEN_SHA256:createHash('sha256').update('private-connection').digest('hex'),WORDSPACE_SITE_ORIGIN:'https://site.test'};
const catalog=['a','b','c'].map(id=>({id,word:id,reviewed:true,meaning:id}));
const state={version:3,deck_ids:['a','b','c'],dictionaryId:'a|b|c',mastered:[],pending:['c'],activeDay:0,days:[{date:'2026-11-21',ids:['a','b'],first:[],review:[],closed:false}]};
function backend({disabled=false,conflict=false}={}) {return async(url,init={})=>{
 const u=new URL(url),headers=new Headers(init.headers),ok=x=>new Response(JSON.stringify(x),{status:200,headers:{'Content-Type':'application/json'}});
 if(u.pathname==='/auth/v1/user')return headers.get('authorization')==='Bearer valid-user'?ok({id:owner}):new Response('{}',{status:401});
 if(u.pathname==='/rest/v1/profiles')return ok([{id:owner,enabled:!disabled,role:'admin'}]);
 if(u.pathname==='/rest/v1/study_progress')return ok([{state,revision:3,updated_at:'2026-11-21T00:00:00Z'}]);
 if(u.pathname==='/rest/v1/word_catalog')return ok(catalog);
 if(u.pathname==='/rest/v1/assessment_events')return ok([]);
 if(u.pathname==='/rest/v1/rpc/coach_rate_limit')return ok(true);
 if(u.pathname==='/rest/v1/rpc/coach_create_recommendation')return conflict?new Response('{"message":"revision_conflict"}',{status:409}):ok({id:JSON.parse(init.body).p_id,status:'pending'});
 if(u.pathname==='/rest/v1/rpc/list_accounts')return ok({users:[{id:owner,email:'owner@test',enabled:true}],total:1});
 if(u.pathname==='/rest/v1/rpc/set_account_status')return ok({enabled:false});
 throw Error(`unexpected backend route ${u.pathname}`);
}}
const req=(path,body,key='private-connection')=>new Request('https://edge.test/functions/v1/coach'+path,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
test('coach refuses missing/wrong secrets and never leaks service keys',async()=>{
 const h=createCoachHandler({env,fetch:backend()});for(const token of ['','bad']){const r=await h(req('/summary',null,token));assert.equal(r.status,401);assert(!JSON.stringify(await r.json()).includes('server-only'))}
});
test('fixed-owner summary contains fresh revision but no account email or private state',async()=>{
 const r=await createCoachHandler({env,fetch:backend()})(req('/summary'));assert.equal(r.status,200);const x=await r.json();assert.equal(x.progress_revision,3);assert.equal(x.unattempted_today,2);assert(!('user_id'in x));assert(!('state'in x));
});
test('disabled account and cross-user parameters cannot reach coach data',async()=>{
 assert.equal((await createCoachHandler({env,fetch:backend({disabled:true})})(req('/summary'))).status,403);
 assert.equal((await createCoachHandler({env,fetch:backend()})(req('/summary?user_id=other'))).status,400);
});
test('proposal schema rejects ownership injection and stale writes stay conflicts',async()=>{
 const p={id:'10000000-0000-4000-8000-000000000001',progress_revision:3,word_ids:['a','c'],rationale:'Next'};
 const h=createCoachHandler({env,fetch:backend()});assert.equal((await h(req('/recommendations',{...p,user_id:'other'}))).status,400);
 assert.equal((await h(req('/recommendations',p))).status,200);
 assert.equal((await createCoachHandler({env,fetch:backend({conflict:true})})(req('/recommendations',p))).status,409);
});
test('oversized body and untrusted origins are rejected',async()=>{
 const h=createCoachHandler({env,fetch:backend()});assert.equal((await h(req('/recommendations',{payload:'x'.repeat(20000)}))).status,413);
 const r=req('/summary');r.headers.set('Origin','https://other.test');assert.equal((await h(r)).status,403);
});
test('admin verifies actual user token before calling role-checked RPC',async()=>{
 const h=createAdminHandler({env,fetch:backend()});assert.equal((await h(new Request('https://edge.test/functions/v1/admin/users',{headers:{Authorization:'Bearer bad'}}))).status,401);
 const r=await h(new Request('https://edge.test/functions/v1/admin/users',{headers:{Authorization:'Bearer valid-user',Origin:'https://site.test'}}));assert.equal(r.status,200);assert.equal((await r.json()).total,1);
});
