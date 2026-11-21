import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
let combineMemoryParts;try{({combineMemoryParts}=await import('../scripts/memory-data.mjs'))}catch(error){if(error.code!=='ERR_MODULE_NOT_FOUND')throw error}
const catalog=[{id:'ability'},{id:'avoid'},{id:'friendship'}];
const parts=[{schema_version:1,start:0,end:2,entries:{ability:{kind:'affix',structure:'able → abil- + -ity',explanation:'able的名词形式，注意拼写变化。'}},whole_words:['avoid'],references:[]},
 {schema_version:1,start:2,end:3,entries:{friendship:{kind:'affix',structure:'friend + -ship',explanation:'friend表示朋友，-ship构成关系名词。'}},whole_words:[],references:[]}];

test('combiner accounts for every catalog word exactly once',()=>{
 const result=combineMemoryParts?.(catalog,parts);assert.equal(result?.detailed_count,2);assert.equal(result?.whole_count,1);assert.equal(Object.keys(result?.entries||{}).length,2);
});

test('combiner refuses gaps, duplicates, outside IDs and unsupported root claims',()=>{
 assert.equal(typeof combineMemoryParts,'function');
 const gap=structuredClone(parts);gap[0].whole_words=[];assert.throws(()=>combineMemoryParts(catalog,gap));
 const duplicate=structuredClone(parts);duplicate[0].whole_words.push('ability');assert.throws(()=>combineMemoryParts(catalog,duplicate));
 const unknown=structuredClone(parts);unknown[0].whole_words.push('missing');assert.throws(()=>combineMemoryParts(catalog,unknown));
 const root=structuredClone(parts);root[0].entries.ability.kind='root';assert.throws(()=>combineMemoryParts(catalog,root));
});

test('all1000 current words have an audited detailed or whole-word classification',async()=>{
 assert.equal(typeof combineMemoryParts,'function');
 const rows=JSON.parse(await readFile('data/catalog.json','utf8'));
 const files=await Promise.all(['core','expansion-a','expansion-b'].map(async name=>JSON.parse(await readFile(`data/memory-notes/${name}.json`,'utf8'))));
 const data=combineMemoryParts(rows,files);assert.equal(data.detailed_count+data.whole_count,1000);assert(data.detailed_count>0);assert(data.whole_count>0);
});
