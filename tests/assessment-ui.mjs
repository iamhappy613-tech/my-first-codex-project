import {chromium} from './browser-runtime.mjs';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import '../supabase/functions/_shared/core.js';
const catalog=JSON.parse(await readFile('data/catalog.json','utf8'));
const plan=WordspaceCore.createPlan(catalog.slice(0,300),'2026-11-21');
plan.days[0].first=[true,false,true];plan.mastered=[catalog[0].id,catalog[2].id];
const server=createServer(async(req,res)=>{if(req.url!=='/index.html'){res.writeHead(404);res.end();return}res.setHeader('Content-Type','text/html');res.end(await readFile('index.html','utf8'))});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}/index.html`;
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true});
const errors=[];let checks=0;
async function localPage(state){
 const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();
 page.on('pageerror',e=>errors.push(e.message));await page.clock.install({time:new Date('2026-11-21T12:00:00Z')});
 if(state)await page.addInitScript(p=>localStorage.setItem('wordspace:local:v3',JSON.stringify(p)),state);
 await page.goto(base);return {context,page};
}
const ids={a:'00000000-0000-4000-8000-000000000001',b:'00000000-0000-4000-8000-000000000002'};
const events=[],flags={slowEvidence:0,slowSubmit:0,submitStarted:false,offline:false};
async function cloudPage(learningPlan=plan){
 const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();
 page.on('pageerror',e=>errors.push(e.message));await page.clock.install({time:new Date('2026-11-21T12:00:00Z')});
 const config={mode:'cloud',supabaseUrl:'https://db.test',publicKey:'public',siteUrl:base,ownerId:ids.a};
 await page.route('**/index.html',async route=>{let html=await readFile('index.html','utf8');html=html.replace(/(<script id="wordspace-config" type="application\/json">)[\s\S]*?(<\/script>)/,`$1${JSON.stringify(config)}$2`);await route.fulfill({body:html,contentType:'text/html'})});
 await page.route('https://db.test/**',async route=>{
  const req=route.request(),url=new URL(req.url()),key=req.headers().authorization?.replace('Bearer token-',''),who=ids[key],payload=req.postDataJSON?.()||{};
  const send=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
  if(url.pathname==='/auth/v1/token'){const k=payload.email.startsWith('b')?'b':'a';return send({access_token:`token-${k}`,refresh_token:`refresh-${k}`,expires_in:3600,user:{id:ids[k],email:`${k}@test.com`,email_confirmed_at:'2026-11-20'}})}
  if(url.pathname==='/auth/v1/logout')return send({});
  if(!who)return send({},401);
  if(url.pathname==='/auth/v1/user')return send({id:who,email:`${key}@test.com`,email_confirmed_at:'2026-11-20'});
  if(url.pathname==='/rest/v1/profiles')return send([{id:who,email:`${key}@test.com`,role:key==='a'?'admin':'user',enabled:true}]);
  if(url.pathname==='/rest/v1/word_catalog')return send(catalog);
  if(url.pathname==='/rest/v1/study_progress')return send([{state:learningPlan,revision:1,updated_at:'2026-11-21T12:00:00Z'}]);
  if(url.pathname==='/rest/v1/recommendations')return send([]);
  if(url.pathname==='/rest/v1/assessment_events'){if(flags.slowEvidence)await new Promise(r=>setTimeout(r,flags.slowEvidence));return send(events.filter(e=>e.user_id===who))}
  if(url.pathname==='/rest/v1/rpc/submit_assessment'){
   flags.submitStarted=true;if(flags.slowSubmit)await new Promise(r=>setTimeout(r,flags.slowSubmit));if(flags.offline)return send({},503);
   const event={id:payload.p_event_id,word_id:payload.p_word_id,choice_id:payload.p_choice_id,correct:payload.p_word_id===payload.p_choice_id,assisted:payload.p_assisted,user_id:who,created_at:'2026-11-21T12:00:00Z'};
   if(!events.some(e=>e.id===event.id))events.push(event);return send(event);
  }
  return send({error:'unexpected_route'},500);
 });await page.goto(base);return {context,page};
}
async function login(page,key){await page.locator('#auth-email').fill(`${key}@test.com`);await page.locator('#auth-password').fill('test-only-password');await page.locator('#auth-signin').click();await page.locator('#study-main').waitFor({state:'visible'})}
try{
 const empty=await localPage();assert.equal(await empty.page.locator('#assessment-title').textContent(),'学习效果检测');
 await empty.page.locator('#assessment-start').click();assert.match(await empty.page.locator('#assessment-feedback').textContent(),/先.*学|还没有/);assert.equal(await empty.page.locator('#assessment-options button').count(),0);
 await empty.page.locator('#known').click();assert.match(await empty.page.locator('#assessment-stats').textContent(),/已学 1 词/);checks++;await empty.context.close();

 const local=await localPage(plan),p=local.page;await p.locator('#assessment-start').click();
 assert.match(await p.locator('#assessment-progress').textContent(),/1\s*\/\s*3/);assert.equal(await p.locator('#assessment-options button').count(),4);
 const before=await p.evaluate(()=>JSON.stringify(plan));await p.locator('#assessment-options button').first().focus();await p.keyboard.press('ArrowRight');assert.equal(await p.evaluate(()=>JSON.stringify(plan)),before);
 await p.locator('#assessment-options button').first().evaluate(button=>{button.click();button.dispatchEvent(new MouseEvent('click',{bubbles:true}))});
 assert.equal(await p.evaluate(()=>JSON.parse(localStorage.getItem('wordspace:local:evidence')).length),1);
 assert.match(await p.locator('#assessment-feedback').textContent(),/答对|再记/);await p.locator('#assessment-next').click();
 assert.match(await p.locator('#assessment-type').textContent(),/例句/);assert.match(await p.locator('#assessment-word').textContent(),/_____/);
 await p.locator('#assessment-options button').first().click();await p.locator('#assessment-end').click();
 assert(await p.locator('#assessment-report').isVisible());assert.match(await p.locator('#assessment-report').textContent(),/2\s*\/\s*3|3.*2/);
 assert.match(await p.locator('#assessment-report').textContent(),/中途|未答/);assert.match(await p.locator('#assessment-retention').textContent(),/等待复测|尚无/);assert.equal(await p.evaluate(()=>JSON.stringify(plan)),before);checks++;
 await p.locator('#assessment-start').click();for(let i=0;i<3;i++){await p.locator('#assessment-options button').first().click();if(i<2)await p.locator('#assessment-next').click()}
 assert(await p.locator('#assessment-report').isVisible());assert.match(await p.locator('#assessment-report').textContent(),/本轮完成/);assert.equal(await p.evaluate(()=>JSON.parse(localStorage.getItem('wordspace:local:evidence')).length),5);checks++;
 for(const width of [320,390,1280]){await p.setViewportSize({width,height:900});assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))}checks++;await local.context.close();

 const cloud=await cloudPage(),c=cloud.page;flags.slowEvidence=300;await login(c,'a');assert(await c.locator('#assessment-start').isDisabled());await c.locator('#assessment-start').waitFor({state:'visible'});await c.waitForFunction(()=>!document.querySelector('#assessment-start').disabled);flags.slowEvidence=0;
 await c.locator('#assessment-start').click();flags.slowSubmit=600;flags.submitStarted=false;await c.locator('#assessment-options button').first().click();
 while(!flags.submitStarted)await new Promise(r=>setTimeout(r,20));await c.locator('#logout').click();await login(c,'b');await c.waitForTimeout(800);flags.slowSubmit=0;
 assert.equal(await c.locator('#assessment-word').textContent(),'');assert(await c.locator('#assessment-report').isHidden());assert(!events.some(e=>e.user_id===ids.b));checks++;
 flags.offline=true;await c.locator('#assessment-start').click();await c.locator('#assessment-options button').first().click();await c.locator('#assessment-end').click();
 await c.waitForFunction(()=>document.querySelector('#assessment-sync').textContent.includes('待同步'));assert(!events.some(e=>e.user_id===ids.b));assert.match(await c.locator('#assessment-report').textContent(),/未答/);checks++;
 flags.offline=false;await c.locator('#sync-now').click();await c.waitForFunction(()=>document.querySelector('#assessment-sync').textContent.includes('已同步'));
 assert.equal(events.filter(e=>e.user_id===ids.b).length,1);checks++;await cloud.context.close();

 // A recent local answer must block another24h-retention claim even before POST/GET catches up.
 const one=WordspaceCore.createPlan(catalog.slice(0,300),'2026-11-21');one.days[0].first=[true];one.mastered=[catalog[0].id];
 const oldEvidence=()=>({id:'old-due',user_id:ids.a,word_id:catalog[0].id,correct:true,assisted:false,created_at:'2026-11-20T10:00:00Z'});
 events.length=0;events.push(oldEvidence());const slow=await cloudPage(one),s=slow.page;await login(s,'a');await s.waitForFunction(()=>!document.querySelector('#assessment-start').disabled);
 await s.locator('#assessment-start').click();assert.match(await s.locator('#assessment-type').textContent(),/24小时复测/);flags.slowSubmit=500;
 await s.locator('#assessment-options button').first().click();assert.match(await s.locator('#assessment-progress').textContent(),/已作答 1 词/);assert.match(await s.locator('#assessment-report').textContent(),/样本较少|少量词/);
 await s.locator('#assessment-start').click();assert.doesNotMatch(await s.locator('#assessment-type').textContent(),/24小时复测/);await s.waitForTimeout(700);flags.slowSubmit=0;checks++;await slow.context.close();

 events.length=0;events.push(oldEvidence());flags.offline=true;const pending=await cloudPage(one),o=pending.page;await login(o,'a');await o.waitForFunction(()=>!document.querySelector('#assessment-start').disabled);
 await o.locator('#assessment-start').click();await o.locator('#assessment-options button').first().click();await o.waitForFunction(()=>document.querySelector('#assessment-sync').textContent.includes('待同步'));await o.waitForFunction(()=>!document.querySelector('#assessment-start').disabled);
 await o.locator('#assessment-start').click();assert.doesNotMatch(await o.locator('#assessment-type').textContent(),/24小时复测/);
 await o.reload();await o.locator('#study-main').waitFor({state:'visible'});await o.waitForFunction(()=>!document.querySelector('#assessment-start').disabled);await o.locator('#assessment-start').click();assert.doesNotMatch(await o.locator('#assessment-type').textContent(),/24小时复测/);flags.offline=false;checks++;await pending.context.close();

 // A later successful browser write must include an earlier unsaved answer.
 const intermittent=await localPage(plan),i=intermittent.page;
 await i.evaluate(()=>{const set=Storage.prototype.setItem;let failed=false;Storage.prototype.setItem=function(key,value){if(key==='wordspace:local:evidence'&&!failed){failed=true;throw new DOMException('quota','QuotaExceededError')}return set.call(this,key,value)}});
 await i.locator('#assessment-start').click();await i.locator('#assessment-options button').first().click();assert.match(await i.locator('#assessment-sync').textContent(),/存储不可用/);
 await i.locator('#assessment-next').click();await i.locator('#assessment-options button').first().click();assert.equal(await i.evaluate(()=>JSON.parse(localStorage.getItem('wordspace:local:evidence')).length),2);checks++;await intermittent.context.close();
 assert.deepEqual(errors,[]);
 console.log(`PASS: ${checks} assessment UI scenarios (empty/studied-only rounds, cloze, first choices, partial/full report, keyboard, responsive, account isolation, offline retry).`);
}finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
