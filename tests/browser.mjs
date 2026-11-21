import {chromium} from 'playwright';import assert from 'node:assert/strict';import {createServer} from 'node:http';import {readFile} from 'node:fs/promises';import {resolve,extname} from 'node:path';
import '../supabase/functions/_shared/core.js';
const root=resolve('.'),catalog=JSON.parse(await readFile('data/catalog.json','utf8'));
const server=createServer(async(req,res)=>{try{const p=resolve(root,'.'+new URL(req.url,'http://test').pathname);if(!p.startsWith(root+'/'))throw Error();const file=p.endsWith('/')?p+'index.html':p;res.setHeader('Content-Type',extname(file)==='.json'?'application/json':extname(file)==='.js'?'text/javascript':'text/html');res.end(await readFile(file))}catch{res.statusCode=404;res.end('not found')}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
const ids={a:'00000000-0000-4000-8000-000000000001',b:'00000000-0000-4000-8000-000000000002'};
const config={mode:'cloud',supabaseUrl:'https://db.test',publicKey:'public',coachUrl:'https://chatgpt.com/g/private-example',siteUrl:base+'/index.html',ownerId:ids.a};
const records=new Map(),events=[],proposals=[],flags={offline:false,disabled:false,slowSave:0,saveStarted:false,refreshWrong:false,profile401A:false,profileStarted:false};let checks=0;
async function cloudPage(){const ctx=await browser.newContext({viewport:{width:390,height:844}});const page=await ctx.newPage();await page.clock.install({time:new Date('2026-11-21T04:00:00Z')});
 await page.route('**/index.html',async route=>{let html=await readFile('index.html','utf8');html=html.replace(/(<script id="wordspace-config" type="application\/json">)[\s\S]*?(<\/script>)/,`$1${JSON.stringify(config)}$2`);await route.fulfill({body:html,contentType:'text/html'})});
 await page.route('https://db.test/**',async route=>{
  const req=route.request(),u=new URL(req.url()),token=req.headers().authorization?.replace('Bearer token-',''),who=token&&ids[token],p=req.postDataJSON?.()||{};
  const send=(obj,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(obj)});
  if(u.pathname==='/auth/v1/token') {const user=flags.refreshWrong?'a':p.refresh_token==='refresh-b'||p.email?.startsWith('b')?'b':'a';return send({access_token:`token-${user}`,refresh_token:`refresh-${user}`,expires_in:3600,user:{id:ids[user],email:`${user}@test.com`,email_confirmed_at:'2026-11-20'}})}
  if(u.pathname==='/auth/v1/user')return who?send({id:who,email:`${token}@test.com`,email_confirmed_at:'2026-11-20'}):send({},401);
  if(u.pathname==='/auth/v1/logout')return send({});
  if(!who)return send({},401);
  if(u.pathname==='/rest/v1/profiles'&&token==='a'&&flags.profile401A){flags.profileStarted=true;await new Promise(r=>setTimeout(r,900));return send({},401)}
  if(u.pathname==='/rest/v1/profiles')return send([{id:who,email:`${token}@test.com`,role:token==='a'?'admin':'user',enabled:!flags.disabled}]);
  if(flags.offline)return route.abort();
  if(u.pathname==='/rest/v1/word_catalog')return send(catalog);
  if(u.pathname==='/rest/v1/study_progress')return send(records.has(who)?[records.get(who)]:[]);
  if(u.pathname==='/rest/v1/recommendations')return send(proposals.filter(p=>p.user_id===who&&p.status==='pending'));
  if(u.pathname==='/rest/v1/assessment_events')return send(events.filter(e=>e.user_id===who));
  if(u.pathname==='/rest/v1/rpc/save_progress') {flags.saveStarted=true;if(flags.slowSave)await new Promise(r=>setTimeout(r,flags.slowSave));const prev=records.get(who);if((prev?.revision||0)!==p.p_expected_revision)return send({message:'revision_conflict'},409);const row={state:p.p_state,revision:(prev?.revision||0)+1,updated_at:'2026-11-21T04:00:00Z'};records.set(who,structuredClone(row));return send(row)}
  if(u.pathname==='/rest/v1/rpc/adopt_recommendation'){const proposal=proposals.find(x=>x.id===p.p_id&&x.user_id===who);const prev=records.get(who);if(!proposal||proposal.progress_revision!==prev.revision||p.p_expected_revision!==prev.revision)return send({},409);const row={state:WordspaceCore.adoptProposal(prev.state,proposal,catalog),revision:prev.revision+1,updated_at:'2026-11-21T04:00:00Z'};records.set(who,row);proposal.status='accepted';return send(row)}
  if(u.pathname==='/rest/v1/rpc/dismiss_recommendation'){const x=proposals.find(x=>x.id===p.p_id&&x.user_id===who);if(x)x.status='ignored';return send(true)}
  if(u.pathname==='/rest/v1/rpc/submit_assessment'){const row={id:p.p_event_id,word_id:p.p_word_id,choice_id:p.p_choice_id,correct:p.p_word_id===p.p_choice_id,assisted:p.p_assisted,user_id:who,created_at:'2026-11-21T04:00:00Z'};events.push(row);return send(row)}
  if(u.pathname.endsWith('/admin/users'))return send({users:[{id:ids.b,email:'b@test.com',enabled:true,role:'user'}],total:1,page:1});
  if(u.pathname.endsWith('/admin/status'))return send({enabled:p.enabled});
  return send({error:'unexpected_route'},500);
 });return {page,ctx};}
const login=async(page,user)=>{await page.locator('#auth-email').fill(`${user}@test.com`);await page.locator('#auth-password').fill('test-only-password');await page.locator('#auth-signin').click()};
try {
 const local=await browser.newPage();await local.goto(base+'/index.html');assert.equal(await local.locator('#account-bar').count(),1);
 assert(await local.locator('#study').isVisible());assert.match(await local.locator('#account-status').textContent(),/本地/);await local.locator('#known').click();assert.equal(await local.locator('#current').textContent(),'02');checks++;
 const migrationContext=await browser.newContext();const migratedPage=await migrationContext.newPage();
 const oldLocal=WordspaceCore.createPlan(catalog.slice(0,300),'2026-11-21');oldLocal.version=2;delete oldLocal.deck_ids;delete oldLocal.schema_version;oldLocal.mastered=['ability'];oldLocal.days[0].first=[true];
 await migratedPage.addInitScript(p=>localStorage.setItem('wordspace-adaptive-v2',JSON.stringify(p)),oldLocal);await migratedPage.goto(base+'/index.html');
 assert.equal(await migratedPage.locator('#current').textContent(),'02');assert.equal(await migratedPage.evaluate(()=>JSON.parse(localStorage.getItem('wordspace-adaptive-v2')).version),2);
 await migratedPage.locator('#known').click();await migratedPage.reload();assert.equal(await migratedPage.locator('#current').textContent(),'03');await migrationContext.close();checks++;
 const standalone=await browser.newPage();const standaloneRequests=[];standalone.on('request',r=>standaloneRequests.push(r.url()));await standalone.setContent(await readFile('index.html','utf8'));
 assert(await standalone.locator('#study').isVisible());await standalone.locator('#known').click();assert.equal(await standalone.locator('#current').textContent(),'02');assert.deepEqual(standaloneRequests,[]);checks++;
 const {page,ctx}=await cloudPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base+'/index.html');
 assert(await page.locator('#account-gate').isVisible());await page.locator('#auth-email').press('a');assert.deepEqual(errors,[]);assert(await page.locator('#study-main').isHidden());assert.equal(await page.locator('#word').textContent(),'');checks++;
 const legacy=globalThis.WordspaceCore.createPlan(catalog.slice(0,300),'2026-11-21');legacy.days[0].first=[true];legacy.mastered=['ability'];
 await page.evaluate(p=>localStorage.setItem('wordspace-adaptive-v2',JSON.stringify(p)),legacy);
 await login(page,'a');await page.locator('#import-legacy').waitFor({state:'visible'});assert(!records.has(ids.a));await page.locator('#import-legacy').click();await page.locator('#study-main').waitFor({state:'visible'});await page.waitForFunction(()=>document.querySelector('#account-status').textContent.includes('已同步'));
 assert.equal(await page.locator('#current').textContent(),'02');assert.equal(records.get(ids.a).state.mastered.length,1);checks++;
 await page.locator('#known').click();await page.waitForFunction(()=>document.querySelector('#account-status').textContent.includes('已同步'));assert.equal(records.get(ids.a).state.mastered.length,2);
 await page.reload();await page.locator('#study-main').waitFor({state:'visible'});assert.equal(await page.locator('#current').textContent(),'03');checks++;
 await page.locator('#manage-users').click();await page.locator('#admin-users').getByText('b@test.com').waitFor();await page.locator('#admin-close').click();checks++;
 await page.locator('#logout').click();assert(await page.locator('#study-main').isHidden());assert.equal(await page.locator('#admin-users').textContent(),'');await login(page,'b');
 await page.locator('#study-main').waitFor({state:'visible'});assert.equal(await page.locator('#current').textContent(),'01');assert(await page.locator('#manage-users').isHidden());assert(await page.locator('#open-coach').isHidden());checks++;
 await page.locator('#known').click();await page.waitForFunction(()=>document.querySelector('#account-status').textContent.includes('已同步'));assert.equal(records.get(ids.b).state.mastered.length,1);assert.equal(records.get(ids.a).state.mastered.length,2);checks++;
 flags.offline=true;await page.locator('#known').click();await page.waitForFunction(()=>/待同步|失败/.test(document.querySelector('#account-status').textContent));assert.equal(await page.locator('#current').textContent(),'03');flags.offline=false;await page.locator('#sync-now').click();await page.waitForFunction(()=>document.querySelector('#account-status').textContent.includes('已同步'));assert.equal(records.get(ids.b).state.mastered.length,2);checks++;
 const remote=records.get(ids.b);remote.revision++;remote.state.days[0].first.push(true);remote.state.mastered.push('absorb');await page.locator('#known').click();await page.locator('#conflict-cloud').waitFor({state:'visible'});assert.equal(records.get(ids.b).revision,remote.revision);await page.locator('#conflict-cloud').click();await page.locator('#study-main').waitFor({state:'visible'});assert.equal(await page.locator('#current').textContent(),'04');checks++;
 await page.locator('#assessment-start').click();await page.locator('#assessment-options button').first().click();await page.waitForFunction(()=>document.querySelector('#assessment-feedback').textContent.length>0);assert(events.some(e=>e.user_id===ids.b));checks++;
 // Recommendation adoption changes next-day queue once, not current answers/history.
 const before=structuredClone(records.get(ids.b));
 proposals.push({id:'30000000-0000-4000-8000-000000000001',user_id:ids.b,status:'pending',progress_revision:before.revision,word_ids:['accept'],rationale:'Review next',expires_at:'2026-12-01T00:00:00Z'});
 await page.locator('#proposal-refresh').click();await page.locator('#proposal-list').getByText('采用到下一学习日').click();
 await page.waitForFunction(()=>document.querySelector('#account-status').textContent.includes('推荐将在'));
 assert.deepEqual(records.get(ids.b).state.days,before.state.days);assert.deepEqual(records.get(ids.b).state.next_day_ids,['accept']);checks++;
 // Backups survive later saves and remain downloadable for the same account only.
 assert(await page.locator('#download-backup').isVisible());const downloadEvent=page.waitForEvent('download');await page.locator('#download-backup').click();const download=await downloadEvent;
 const backup=JSON.parse(await readFile(await download.path(),'utf8'));assert(backup.mastered.includes('ability'));checks++;
 await page.locator('#logout').click();flags.disabled=true;await login(page,'a');await page.waitForFunction(()=>document.querySelector('#auth-message').textContent.includes('停用'));assert(await page.locator('#study-main').isHidden());checks++;
 // Async save completes after switching accounts: old payload must never replace B's cache/view.
 flags.disabled=false;await login(page,'a');await page.locator('#study-main').waitFor({state:'visible'});
 flags.profile401A=true;flags.profileStarted=false;await page.evaluate(()=>void account.resume());
 while(!flags.profileStarted)await new Promise(r=>setTimeout(r,20));
 await page.locator('#logout').click();await login(page,'b');await page.locator('#study-main').waitFor({state:'visible'});
 await new Promise(r=>setTimeout(r,1100));assert(await page.locator('#study-main').isVisible());flags.profile401A=false;checks++;
 await page.locator('#logout').click();await login(page,'a');await page.locator('#study-main').waitFor({state:'visible'});
 flags.slowSave=900;flags.saveStarted=false;await page.locator('#unknown').click();
 while(!flags.saveStarted)await new Promise(r=>setTimeout(r,30));
 await page.locator('#logout').click();await login(page,'b');await page.locator('#study-main').waitFor({state:'visible'});
 await new Promise(r=>setTimeout(r,1100));flags.slowSave=0;
 assert.equal(await page.locator('#current').textContent(),'04');assert(records.get(ids.b).state.mastered.includes('absorb'));checks++;
 // A refresh token returning a different subject must fail closed, even during boot.
 await page.evaluate(()=>{const s=JSON.parse(localStorage.getItem('wordspace:session'));s.expiresAt=0;localStorage.setItem('wordspace:session',JSON.stringify(s))});
 flags.refreshWrong=true;await page.reload();await page.waitForFunction(()=>document.querySelector('#auth-message').textContent.includes('会话'));
 assert(await page.locator('#study-main').isHidden());flags.refreshWrong=false;checks++;
 await login(page,'b');await page.locator('#study-main').waitFor({state:'visible'});
 // Storage failure is disclosed rather than claiming the pending work was backed up.
 await page.evaluate(()=>{Storage.prototype.setItem=function(){throw new DOMException('quota','QuotaExceededError')}});
 flags.offline=true;await page.locator('#known').click();
 assert.match(await page.locator('#account-status').textContent(),/存储不可用/);flags.offline=false;checks++;
 for(const width of [320,390,768,1280]){await local.setViewportSize({width,height:844});assert(await local.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))}checks++;
 assert.deepEqual(errors,[]);await ctx.close();console.log(`PASS: ${checks} browser scenarios (local fallback, real UI auth gates, explicit import, reload, account isolation, sync/offline/conflict, admin, assessments, blocked account, responsive).`);
}finally{await browser.close();await new Promise(r=>server.close(r))}
