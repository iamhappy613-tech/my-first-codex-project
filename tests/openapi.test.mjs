import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';import {createCoachHandler} from '../supabase/functions/_shared/http.js';
test('every production Action invokes the real protected handler with its declared method/path',async()=>{
 const spec=JSON.parse(await readFile('gpt/openapi.json','utf8')),catalog=JSON.parse(await readFile('data/catalog.json','utf8'));
 const state=WordspaceCore.createPlan(catalog.slice(0,300),'2026-11-21'),owner='00000000-0000-4000-8000-000000000001';
 const draft={id:'10000000-0000-4000-8000-000000000001',status:'pending',progress_revision:1,word_ids:state.days[0].ids,rationale:'Next',created_at:'2026-11-21T00:00:00Z'};
 const env={SUPABASE_URL:'https://db.test',SUPABASE_ANON_KEY:'public',SUPABASE_SERVICE_ROLE_KEY:'server',WORDSPACE_OWNER_ID:owner,WORDSPACE_COACH_TOKEN_SHA256:createHash('sha256').update('connection').digest('hex')};
 const fetch=async(url,init={})=>{const path=new URL(url).pathname;let value;
  if(path.endsWith('/profiles'))value=[{id:owner,enabled:true}];else if(path.endsWith('/coach_rate_limit'))value=true;
  else if(path.endsWith('/study_progress'))value=[{state,revision:1,updated_at:'2026-11-21T00:00:00Z'}];else if(path.endsWith('/assessment_events'))value=[];
  else if(path.endsWith('/word_catalog'))value=catalog;else if(path.endsWith('/coach_create_recommendation'))value=draft;else if(path.endsWith('/recommendations'))value=[draft];else throw Error('unexpected dependency path');
  return new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});
 };
 const handler=createCoachHandler({env,fetch});
 for(const [path,item] of Object.entries(spec.paths))for(const [method,op] of Object.entries(item)){
  const concrete=path.replace('{id}',draft.id),body=method==='post'?{id:draft.id,progress_revision:1,word_ids:state.days[0].ids,rationale:'Next'}:null;
  const response=await handler(new Request('https://edge.test/functions/v1/coach'+concrete,{method:method.toUpperCase(),headers:{Authorization:'Bearer connection','Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}));
  assert.equal(response.status,200,op.operationId);const result=await response.json();const shape=op.responses['200'].content['application/json'].schema;
  for(const [key,field] of Object.entries(shape.properties||{})){if(key in result&&field.type==='array')assert(Array.isArray(result[key]));}
  assert(spec.security.length>0);if(method==='post')assert.equal(op['x-openai-isConsequential'],true);
 }
});
test('smoke package is synthetic and carries no real account identity',async()=>{
 const data=JSON.parse(await readFile('gpt/smoke.json','utf8'));assert.equal(data.synthetic,true);assert(!('user_id' in data));assert(!('email'in data));
});
