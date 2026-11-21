import './core.js';
const Core=globalThis.WordspaceCore;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
class HttpError extends Error {constructor(status,message){super(message);this.status=status}}
const fail=(status,message)=>{throw new HttpError(status,message)};
function headers(req,env) {
 const origin=req.headers.get('Origin');
 if(origin&&origin!==env.WORDSPACE_SITE_ORIGIN)fail(403,'origin_not_allowed');
 return {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Access-Control-Allow-Origin':env.WORDSPACE_SITE_ORIGIN||'null','Vary':'Origin','Access-Control-Allow-Headers':'authorization, content-type, apikey','Access-Control-Allow-Methods':'GET, POST, OPTIONS'};
}
async function body(req,allowed) {
 if(!req.headers.get('Content-Type')?.startsWith('application/json'))fail(415,'json_required');
 let bytes=0,text='';const reader=req.body?.getReader();if(!reader)fail(400,'body_required');
 const decoder=new TextDecoder();
 while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>12000){await reader.cancel();fail(413,'body_too_large')}text+=decoder.decode(value,{stream:true})}
 let p;try{p=JSON.parse(text+decoder.decode())}catch{fail(400,'invalid_json')}
 if(!p||typeof p!=='object'||Array.isArray(p)||Object.keys(p).some(k=>!allowed.includes(k)))fail(400,'invalid_fields');return p;
}
function backend(env,fetch,key,token) {
 return async(path,payload)=>{
  const res=await fetch(`${env.SUPABASE_URL}${path}`,{method:payload===undefined?'GET':'POST',headers:{apikey:key,Authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(payload===undefined?{}:{body:JSON.stringify(payload)}),signal:AbortSignal.timeout(10000)});
  if(!res.ok){if(res.status===409)fail(409,'revision_conflict');if(res.status===429)fail(429,'rate_limited');if([401,403].includes(res.status))fail(res.status,'access_denied');fail(502,'backend_unavailable')}
  return res.json();
 };
}
function wrap(env,run) {return async req=>{
 let h={'Content-Type':'application/json','Cache-Control':'no-store'};
 try {
  h=headers(req,env);if(req.method==='OPTIONS')return new Response(null,{status:204,headers:h});
  if(!env.SUPABASE_URL||!env.SUPABASE_ANON_KEY)fail(503,'service_not_configured');
  const result=await run(req);return new Response(JSON.stringify(result),{status:200,headers:h});
 }catch(e){return new Response(JSON.stringify({error:e instanceof HttpError?e.message:'service_unavailable'}),{status:e instanceof HttpError?e.status:503,headers:h})}
}}
async function matchesSecret(token,hash) {
 if(!token||token.length>1024||!/^[a-f0-9]{64}$/i.test(hash||''))return false;
 const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)));
 const actual=[...bytes].map(x=>x.toString(16).padStart(2,'0')).join('');let diff=0;
 for(let i=0;i<64;i++)diff|=actual.charCodeAt(i)^hash.toLowerCase().charCodeAt(i);return diff===0;
}
export function createCoachHandler({env,fetch=globalThis.fetch}) {
 return wrap(env,async req=>{
  if(!uuid.test(env.WORDSPACE_OWNER_ID||'')||!env.SUPABASE_SERVICE_ROLE_KEY||!env.WORDSPACE_COACH_TOKEN_SHA256)fail(503,'coach_not_configured');
  const token=req.headers.get('Authorization')?.replace(/^Bearer /,'');
  if(!await matchesSecret(token,env.WORDSPACE_COACH_TOKEN_SHA256))fail(401,'invalid_connection');
  const url=new URL(req.url),path=url.pathname.split('/coach')[1]||'/';
  if([...url.searchParams.keys()].some(k=>k!=='page'))fail(400,'invalid_fields');
  const owner=env.WORDSPACE_OWNER_ID,db=backend(env,fetch,env.SUPABASE_SERVICE_ROLE_KEY,env.SUPABASE_SERVICE_ROLE_KEY);
  const profiles=await db(`/rest/v1/profiles?id=eq.${owner}&select=id,enabled,role`);
  if(profiles.length!==1||!profiles[0].enabled)fail(403,'account_disabled');
  await db('/rest/v1/rpc/coach_rate_limit',{p_owner:owner});
  if(req.method==='GET'&&/^\/recommendations\/[0-9a-f-]+$/i.test(path)) {
   const id=path.split('/').at(-1);if(!uuid.test(id))fail(400,'invalid_id');
   const rows=await db(`/rest/v1/recommendations?user_id=eq.${owner}&id=eq.${id}&select=id,status,progress_revision,word_ids,rationale,created_at`);
   if(!rows.length)fail(404,'not_found');return rows[0];
  }
  const rows=await db(`/rest/v1/study_progress?user_id=eq.${owner}&select=state,revision,updated_at`);
  if(!rows.length)fail(404,'progress_not_synced');const progress=rows[0];
  if(req.method==='GET'&&path==='/evidence') {
   const page=Number(url.searchParams.get('page')||1);if(!Number.isInteger(page)||page<1||page>1000)fail(400,'invalid_page');
   return {progress_revision:progress.revision,events:await db(`/rest/v1/assessment_events?user_id=eq.${owner}&select=word_id,correct,assisted,created_at&order=created_at.desc,id.desc&limit=50&offset=${(page-1)*50}`),page};
  }
  if(req.method==='GET'&&path==='/summary') {
   const events=await db(`/rest/v1/assessment_events?user_id=eq.${owner}&select=word_id,correct,assisted,created_at&order=created_at.desc&limit=100`);
   return {...Core.summarize(progress.state,events),progress_revision:progress.revision,last_synced_at:progress.updated_at};
  }
  if(req.method==='GET'&&path==='/candidates') {
   const catalog=await db('/rest/v1/word_catalog?select=*&reviewed=eq.true&order=id&limit=1000');
   return {progress_revision:progress.revision,mandatory_carry_ids:Core.summarize(progress.state).unfamiliar_ids,candidates:Core.candidates(progress.state,catalog)};
  }
  if(req.method==='POST'&&path==='/recommendations') {
   const p=await body(req,['id','progress_revision','word_ids','rationale']);
   if(!uuid.test(p.id||'')||!Number.isSafeInteger(p.progress_revision)||p.progress_revision<1||!Array.isArray(p.word_ids)||!p.word_ids.length||p.word_ids.length>43||new Set(p.word_ids).size!==p.word_ids.length||p.word_ids.some(x=>typeof x!=='string'||x.length>100)||typeof p.rationale!=='string'||p.rationale.length>1500)fail(400,'invalid_recommendation');
   if(p.progress_revision!==progress.revision)fail(409,'revision_conflict');
   return db('/rest/v1/rpc/coach_create_recommendation',{p_owner:owner,p_id:p.id,p_expected_revision:p.progress_revision,p_word_ids:p.word_ids,p_rationale:p.rationale});
  }
  fail(404,'not_found');
 });
}
export function createAdminHandler({env,fetch=globalThis.fetch}) {
 return wrap(env,async req=>{
  const token=req.headers.get('Authorization')?.replace(/^Bearer /,'');if(!token||token.length>10000)fail(401,'login_required');
  const db=backend(env,fetch,env.SUPABASE_ANON_KEY,token);
  await db('/auth/v1/user');
  const url=new URL(req.url),path=url.pathname.split('/admin')[1]||'/';
  if(req.method==='GET'&&path==='/users') {
   const page=Number(url.searchParams.get('page')||1),search=url.searchParams.get('search')||'';
   if(!Number.isInteger(page)||page<1||page>10000||search.length>100)fail(400,'invalid_query');
   return db('/rest/v1/rpc/list_accounts',{p_search:search,p_page:page});
  }
  if(req.method==='POST'&&path==='/status') {
   const p=await body(req,['user_id','enabled']);if(!uuid.test(p.user_id||'')||typeof p.enabled!=='boolean')fail(400,'invalid_fields');
   return db('/rest/v1/rpc/set_account_status',{p_target:p.user_id,p_enabled:p.enabled});
  }
  fail(404,'not_found');
 });
}
