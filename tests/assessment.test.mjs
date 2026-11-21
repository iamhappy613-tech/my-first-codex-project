import test from 'node:test';
import assert from 'node:assert/strict';
await import('../supabase/functions/_shared/core.js');
try { await import('../web/assessment.js'); } catch (error) { if (error.code!=='ERR_MODULE_NOT_FOUND') throw error; }
const A=globalThis.WordspaceAssessment||{};
const now='2026-11-22T12:00:00Z',random=()=>0.37;
const catalog=Array.from({length:20},(_,i)=>({id:`w${i}`,word:`w${i}`,meaning:`释义${i}`,example:`We use w${i} for item ${i} every day.`,translation:`例句翻译${i}`,reviewed:true}));
const plan={mastered:Array.from({length:12},(_,i)=>`w${i}`).filter(id=>id!=='w2'),days:[{ids:catalog.slice(0,13).map(w=>w.id),first:Array(12).fill(true),review:[],closed:false}],pending:['w13','w14']};
const round=(p=plan,rows=catalog,events=[])=>A.buildRound?.(p,rows,events,now,random)||[];

test('studied IDs include actually answered words across days, never unattempted tasks',()=>{
 const p={days:[{ids:['a','b','c'],first:[true,false]},{ids:['b','d','e'],first:[false,true]}]};
 assert.deepEqual(A.studiedIds?.(p),['a','b','d']);
});

test('round caps at ten unique reviewed studied targets without mutating progress',()=>{
 const before=structuredClone(plan),questions=round();
 assert.equal(questions.length,10);assert.equal(new Set(questions.map(q=>q.word.id)).size,10);
 assert(questions.every(q=>plan.days[0].ids.slice(0,12).includes(q.word.id)));
 assert(!questions.some(q=>q.word.id==='w12'));assert.deepEqual(plan,before);
 const filtered=round(plan,catalog.map(w=>w.id==='w0'?{...w,reviewed:false}:w));
 assert(!filtered.some(q=>q.word.id==='w0'));
});

test('due words precede weak words and untested known words',()=>{
 const events=[{word_id:'w1',correct:true,assisted:false,created_at:'2026-11-21T10:00:00Z'},{word_id:'w3',correct:false,assisted:false,created_at:'2026-11-22T11:00:00Z'}];
 const q=round(plan,catalog,events);
 assert.deepEqual(new Set(q.slice(0,2).map(x=>x.word.id)),new Set(['w1','w3']));
 assert.equal(q[2]?.word.id,'w2');
});

test('cloze masks every target occurrence and never shows its translation before answering',()=>{
 const rows=catalog.map((w,index)=>({...w,example:`Item ${index}: ${w.word} can appear twice: ${w.word}.`}));
 const q=round({...plan,days:[{ids:['w0','w1'],first:[true,true]}]},rows);
 assert.equal(q.length,2);assert.equal(q[0].type,'meaning');assert.equal(q[1].type,'cloze');
 assert(!q[1].prompt.includes(q[1].word.word));assert(q[1].prompt.includes('_____'));
 assert(!q[1].prompt.includes(q[1].word.translation));
});

test('unmaskable examples fall back to meaning questions with unique choice labels',()=>{
 const rows=catalog.map(w=>({...w,example:'An unrelated sentence.',meaning:w.id==='w4'?'释义3':w.meaning}));
 const q=round(plan,rows);assert.equal(q.length,10);
 for(const item of q){assert.equal(item.type,'meaning');assert.equal(new Set(item.options.map(o=>o.label)).size,item.options.length);assert.equal(item.options.filter(o=>o.id===item.word.id).length,1);assert.equal(item.options.length,4)}
});

test('small learned pools produce a shorter round and empty learned pools produce none',()=>{
 assert.equal(round({...plan,days:[{ids:['w0','w1','w2'],first:[true,false]}]}).length,2);
 assert.equal(round({...plan,days:[{ids:['w0'],first:[true]}]}).length,1);
 assert.equal(round({...plan,days:[{ids:['w0'],first:[]}]}).length,0);
});

test('delayed eligibility requires the latest unassisted success to be at least24 hours old',()=>{
 const p={...plan,days:[{ids:['w0','w1','w2'],first:[true,true,true]}]};
 const events=[{word_id:'w0',correct:true,assisted:false,created_at:'2026-11-21T10:00:00Z'},{word_id:'w0',correct:false,assisted:false,created_at:'2026-11-22T11:00:00Z'},
 {word_id:'w1',correct:true,assisted:false,created_at:'2026-11-21T12:00:00Z'},{word_id:'w2',correct:true,assisted:true,created_at:'2026-11-20T10:00:00Z'}];
 const q=round(p,catalog,events),byId=new Map(q.map(x=>[x.word.id,x]));assert.equal(q.length,3);
 assert.equal(byId.get('w0').delayed,false);assert.equal(byId.get('w1').delayed,true);assert.equal(byId.get('w2').delayed,false);
});

test('round report counts first answers only and does not count unanswered targets as wrong',()=>{
 const q=[{word:catalog[0],delayed:true},{word:catalog[1],delayed:true},{word:catalog[2],delayed:false}];
 const answers=[{word_id:'w0',correct:true},{word_id:'w1',correct:false},{word_id:'w1',correct:true},{word_id:'other',correct:false}];
 const report=A.summarizeRound?.(q,answers);
 assert.deepEqual(report,{total:3,answered:2,correct:1,rate:50,wrong_ids:['w1'],delayed_answered:2,delayed_correct:1,delayed_rate:50,complete:false});
});

test('empty answers and missing delayed samples report no percentage rather than a false zero score',()=>{
 const q=[{word:catalog[0],delayed:false}];
 assert.deepEqual(A.summarizeRound?.(q,[]),{total:1,answered:0,correct:0,rate:null,wrong_ids:[],delayed_answered:0,delayed_correct:0,delayed_rate:null,complete:false});
});

test('cloze choices exclude a second word supported by the same masked catalog sentence',()=>{
 for(const [left,right,sentence] of [['private','secret','Please keep this information WORD.'],['length','height','Measure the WORD of the table.']]){
  const pair=[left,right].map(id=>({id,word:id,meaning:id,example:sentence.replace('WORD',id),reviewed:true}));
  const rows=[...pair,...catalog.slice(0,2)],p={mastered:[left,right],days:[{ids:[left,right],first:[true,true]}]};
  const q=round(p,rows).find(item=>item.type==='cloze');assert(q);
  const alternative=q.word.id===left?right:left;assert(!q.options.some(option=>option.id===alternative));
 }
});

test('a cloze with no unambiguous distractor falls back without dropping the studied word',()=>{
 const rows=['private','secret'].map(id=>({id,word:id,meaning:id,example:`Keep it ${id}.`,reviewed:true}));
 const q=round({mastered:rows.map(w=>w.id),days:[{ids:rows.map(w=>w.id),first:[true,true]}]},rows);
 assert.equal(q.length,2);assert(q.every(item=>item.type==='meaning'));assert(q.every(item=>item.options.length===2));
});
