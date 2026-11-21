(function(root){
 'use strict';
 const DAY=86400000;
 function studiedIds(plan){
  return [...new Set((plan?.days||[]).flatMap(day=>(day.ids||[]).slice(0,(day.first||[]).length)))];
 }
 function shuffled(values,random){
  const result=[...values];
  for(let i=result.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[result[i],result[j]]=[result[j],result[i]];}
  return result;
 }
 function clozePrompt(word){
  if(typeof word.example!=='string')return null;
  const escaped=word.word.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),pattern=new RegExp('\\b'+escaped+'\\b','gi');
  return pattern.test(word.example)?word.example.replace(pattern,'_____'):null;
 }
 function buildRound(plan,catalog,evidence=[],now=new Date().toISOString(),random=Math.random){
  const pool=catalog.filter(w=>w.reviewed===true&&typeof w.word==='string'&&typeof w.meaning==='string'&&w.meaning.trim());
  const byId=new Map(pool.map(w=>[w.id,w])),known=new Set(plan?.mastered||[]),last=new Map(),counts=new Map(),time=Date.parse(now);
  const records=evidence.filter(e=>!e.assisted&&typeof e.correct==='boolean'&&Number.isFinite(Date.parse(e.created_at))&&Date.parse(e.created_at)<=time);
  for(const event of records){counts.set(event.word_id,(counts.get(event.word_id)||0)+1);if(!last.has(event.word_id)||Date.parse(event.created_at)>=Date.parse(last.get(event.word_id).created_at))last.set(event.word_id,event);}
  const due=new Set(root.WordspaceCore.evidenceStats(records,now).due_ids);
  const rank=id=>due.has(id)?0:!known.has(id)?1:!counts.has(id)?2:3;
  const selected=shuffled(studiedIds(plan).filter(id=>byId.has(id)),random)
   .sort((a,b)=>rank(a)-rank(b)||(rank(a)===3?(counts.get(a)||0)-(counts.get(b)||0):0)).slice(0,10);
  return selected.map((id,index)=>{
   const word=byId.get(id),masked=clozePrompt(word),cloze=index%2===1&&masked!==null;
   const normalized=text=>text?.toLowerCase().replace(/\s+/g,' ').trim();
   const optionsFor=type=>{const label=w=>type==='cloze'?w.word:w.meaning,choices=[{id:word.id,label:label(word)}],labels=new Set([label(word)]);
    for(const other of shuffled(pool,random)){const text=label(other);if(other.id===id||labels.has(text)||(type==='cloze'&&normalized(clozePrompt(other))===normalized(masked)))continue;choices.push({id:other.id,label:text});labels.add(text);if(choices.length===4)break;}return choices;};
   let type=cloze?'cloze':'meaning',choices=optionsFor(type);if(type==='cloze'&&choices.length<2){type='meaning';choices=optionsFor(type);}
   const previous=last.get(id);
   return {word,type,prompt:type==='cloze'?masked:word.word,options:shuffled(choices,random),delayed:!!(previous?.correct&&time-Date.parse(previous.created_at)>=DAY)};
  }).filter(question=>question.options.length>=2);
 }
 function summarizeRound(questions,answers){
  const targets=new Map(questions.map(q=>[q.word.id,q])),first=new Map();
  for(const answer of answers){if(targets.has(answer.word_id)&&typeof answer.correct==='boolean'&&!first.has(answer.word_id))first.set(answer.word_id,answer);}
  const rows=[...first.values()],correct=rows.filter(a=>a.correct).length,delayed=rows.filter(a=>targets.get(a.word_id).delayed),delayedCorrect=delayed.filter(a=>a.correct).length;
  return {total:questions.length,answered:rows.length,correct,rate:rows.length?Math.round(correct/rows.length*100):null,
   wrong_ids:rows.filter(a=>!a.correct).map(a=>a.word_id),delayed_answered:delayed.length,delayed_correct:delayedCorrect,
   delayed_rate:delayed.length?Math.round(delayedCorrect/delayed.length*100):null,complete:questions.length>0&&rows.length===questions.length};
 }
 root.WordspaceAssessment=Object.freeze({studiedIds,buildRound,summarizeRound});
})(globalThis);
