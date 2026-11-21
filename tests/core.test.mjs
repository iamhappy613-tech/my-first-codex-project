import test from 'node:test';
import assert from 'node:assert/strict';
await import('../supabase/functions/_shared/core.js');
const C=globalThis.WordspaceCore;
const catalog=['a','b','c','d','e'].map(id=>({id,word:id,meaning:id,example:`Use ${id}.`,reviewed:true,level:'cet4-common'}));
const old={version:2,dictionaryId:'a|b|c',mastered:['a'],pending:['c'],activeDay:0,days:[{ids:['a','b'],date:'2026-11-21',first:[true,false],review:[],closed:false}]};
test('catalog expansion preserves legacy deck and answers without assigning new words',()=>{
 const p=C.migratePlan(old,catalog);assert.equal(p.version,3);assert.deepEqual(p.deck_ids,['a','b','c']);assert.deepEqual(p.mastered,['a']);assert.deepEqual(p.days[0].first,[true,false]);assert.equal(C.validatePlan(p,catalog),true);
});
test('rejects missing/repeated tasks and malformed records',()=>{
 for(const bad of [{...old,pending:[]},{...old,pending:['b','c']},{...old,days:[{...old.days[0],first:['true']}]}])assert.equal(C.migratePlan(bad,catalog),null);
});
test('proposal adds only selected catalog words, carries unfinished work and leaves history unchanged',()=>{
 const p=C.migratePlan(old,catalog);const adopted=C.adoptProposal(p,{word_ids:['d','c'],rationale:'Next'},catalog);
 assert.deepEqual(adopted.days,p.days);assert.deepEqual(adopted.deck_ids,['a','b','c','d']);assert.deepEqual(p.deck_ids,['a','b','c']);
 const next=C.advancePlan(adopted,catalog,'2026-11-22');assert.deepEqual(next.days[1].ids,['b','d','c']);assert.deepEqual(next.mastered,['a']);assert(C.validatePlan(next,catalog));
});
test('unreviewed, repeated, mastered and oversized recommendation IDs are refused',()=>{
 const p=C.migratePlan(old,catalog);
 for(const word_ids of [['d','d'],['missing'],['a'],Array(44).fill('d')])assert.throws(()=>C.adoptProposal(p,{word_ids},catalog));
 assert.throws(()=>C.adoptProposal(p,{word_ids:['d']},catalog.map(w=>w.id==='d'?{...w,reviewed:false}:w)));
});
test('daily carry never exceeds 43 and never drops pending words',()=>{
 const big=Array.from({length:100},(_,i)=>({id:`w${i}`,word:`w${i}`,reviewed:true}));const p=C.createPlan(big,'2026-11-21');
 const n=C.advancePlan(p,big,'2026-11-22');assert.equal(n.days[1].ids.length,43);assert.equal(n.pending.length,57);assert(C.validatePlan(n,big));
});
test('summary separates self report from objective evidence and limits data',()=>{
 const p=C.migratePlan(old,catalog);const out=C.summarize(p,[{word_id:'a',correct:true,assisted:false,created_at:'2026-11-20T00:00:00Z'}]);
 assert.equal(out.recognized_count,1);assert.equal(out.tested_correct_count,1);assert.equal(out.unattempted_today,0);assert.deepEqual(out.unfamiliar_ids,['b']);assert.equal(out.study_day,1);
});
test('assessment grades on catalog rather than trusting client scores',()=>{
 assert.deepEqual(C.scoreAssessment(catalog,'a','b'),{word_id:'a',correct:false});assert.deepEqual(C.scoreAssessment(catalog,'a','a'),{word_id:'a',correct:true});assert.throws(()=>C.scoreAssessment(catalog,'x','x'));
});
test('mandatory carry and suggested words share the daily 43-word budget',()=>{
 const big=Array.from({length:100},(_,i)=>({id:`w${i}`,word:`w${i}`,reviewed:true}));const p=C.createPlan(big,'2026-11-21');
 assert.throws(()=>C.adoptProposal(p,{word_ids:['w90']},big),/daily_budget/);
});
