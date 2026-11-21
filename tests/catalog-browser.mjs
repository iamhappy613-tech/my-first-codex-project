import {chromium} from './browser-runtime.mjs';import {readFile} from 'node:fs/promises';import assert from 'node:assert/strict';import {join} from 'node:path';import {tmpdir} from 'node:os';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
try {
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setContent(await readFile('index.html','utf8'));
 for(const width of [320,390]){
  await page.setViewportSize({width,height:844});
  const issues=await page.evaluate(()=>{
   const failures=[];
   for(const entry of words){
    $('word').textContent=entry.word;$('phonetic').textContent=entry.phonetic;$('back-word').textContent=entry.word;$('meaning').textContent=entry.meaning;$('example').textContent=entry.example;$('translation').textContent=entry.translation;
    WordspaceMemory.render($('word-memory'),entry);
    const front=$('word'),back=document.querySelector('.card-back');
    if(front.scrollWidth>front.clientWidth+1||back.scrollHeight>back.clientHeight+1)failures.push(entry.word);
   }
   return failures;
  });
  assert.deepEqual(issues,[],`card contents overflow at ${width}px`);
 }
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>renderAll());await page.screenshot({path:join(tmpdir(),'wordspace-final-mobile.png'),fullPage:true});
 assert.deepEqual(errors,[]);console.log('PASS: all 1000 words and bilingual examples fit both card faces at 320/390px; standalone HTML runs without storage.');
}finally{await browser.close()}
