import {chromium} from './browser-runtime.mjs';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import '../supabase/functions/_shared/core.js';
const catalog=JSON.parse(await readFile('data/catalog.json','utf8'));
const server=createServer(async(req,res)=>{if(!['/','/index.html'].includes(req.url)){res.writeHead(404);res.end();return}res.setHeader('Content-Type','text/html');res.end(await readFile('index.html','utf8'))});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true});
try{
 const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.clock.install({time:new Date('2026-11-21T12:00:00Z')});await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
 assert.equal(await page.locator('#word-memory').count(),1);
 assert.equal(await page.locator('.card-back').getAttribute('aria-hidden'),'true');
 await page.locator('#flashcard').click();assert.equal(await page.locator('.card-back').getAttribute('aria-hidden'),'false');
 assert.match(await page.locator('#word-memory .memory-heading').textContent(),/构词与记忆/);assert.match(await page.locator('#word-memory .memory-structure').textContent(),/able|abil/);
 assert.match(await page.locator('#flashcard').getAttribute('aria-label'),/构词与记忆/);
 const cardNote=await page.locator('#word-memory').textContent();
 await page.locator('.vocabulary summary').click();await page.locator('#word-search').fill('ability');
 assert.equal(await page.locator('.list-memory').first().textContent(),cardNote);
 // Cloud-supplied entries carry only catalog fields; notes are keyed independently.
 const lookup=await page.evaluate(()=>WordspaceMemory.describe({...words[0]}));assert.equal(lookup.kind,'affix');
 const safe=await page.evaluate(()=>{const node=document.createElement('span');WordspaceMemory.render(node,{id:'unknown',word:'<img src=x onerror=alert(1)>'});return {images:node.querySelectorAll('img').length,text:node.textContent}});
 assert.equal(safe.images,0);assert(safe.text.includes('<img'));
 await page.locator('#known').click();await page.locator('#assessment-start').click();assert.doesNotMatch(await page.locator('#assessment-feedback').textContent(),/构词与记忆/);
 await page.locator('#assessment-options button').evaluateAll((buttons,meaning)=>buttons.find(button=>!button.textContent.endsWith(meaning)).click(),catalog[0].meaning);
 assert.match(await page.locator('#assessment-feedback').textContent(),/构词与记忆/);
 assert.equal(await page.locator('#assessment-wrong .word-memory').textContent(),cardNote);
 for(const width of [320,390,1280]){await page.setViewportSize({width,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))}
 assert.deepEqual(errors,[]);await context.close();console.log('PASS: memory notes on card back/list, front accessibility hiding, literal text rendering and responsive layout.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
