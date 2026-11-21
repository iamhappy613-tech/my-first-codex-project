(function (root) {
  'use strict';
  const clone = value => JSON.parse(JSON.stringify(value));
  const unique = ids => Array.isArray(ids) && ids.every(id => typeof id === 'string') && new Set(ids).size === ids.length;
  function validatePlan(p, catalog) {
    if (!p || ![2,3].includes(p.version) || !unique(p.mastered) || !unique(p.pending) || !Array.isArray(p.days) || !p.days.length || p.days.length>2000) return false;
    const available = new Set(catalog.map(w => w.id || w.word));
    const deck = p.version === 3 ? p.deck_ids : typeof p.dictionaryId === 'string' ? p.dictionaryId.split('|') : null;
    if (!unique(deck) || !deck.length || deck.some(id => !available.has(id))) return false;
    const ids = new Set(deck), known = new Set(p.mastered);
    if (!Number.isInteger(p.activeDay) || p.activeDay<0 || p.activeDay>=p.days.length) return false;
    if (!p.days.every((d,i) => d && unique(d.ids) && d.ids.length>0 && d.ids.length<=43 && d.ids.every(id=>ids.has(id)) &&
      /^\d{4}-\d{2}-\d{2}$/.test(d.date) && d.closed===(i<p.days.length-1) && Array.isArray(d.first) && Array.isArray(d.review) &&
      d.first.length<=d.ids.length && d.review.length<=d.first.filter(x=>x===false).length &&
      (!d.review.length || d.first.length===d.ids.length) && [...d.first,...d.review].every(x=>typeof x==='boolean'))) return false;
    const partition=[...p.mastered,...p.days.at(-1).ids.filter(id=>!known.has(id)),...p.pending];
    if (partition.some(id=>!ids.has(id)) || partition.length!==deck.length || new Set(partition).size!==deck.length) return false;
    if (p.next_day_ids && (!unique(p.next_day_ids)||p.next_day_ids.length>43||p.next_day_ids.some(id=>!ids.has(id)||known.has(id)))) return false;
    return true;
  }
  function migratePlan(p,catalog) {
    if (!validatePlan(p,catalog)) return null;
    const result=clone(p);
    result.deck_ids=p.version===3?[...p.deck_ids]:p.dictionaryId.split('|');
    result.version=3;result.schema_version=3;
    return result;
  }
  function createPlan(catalog,date,mastered=[],priority=[]) {
    const deck=catalog.filter(w=>w.reviewed!==false).map(w=>w.id||w.word);
    const known=[...new Set(mastered)].filter(id=>deck.includes(id));
    const waiting=[...new Set([...priority,...deck])].filter(id=>deck.includes(id)&&!known.includes(id));
    const ids=waiting.splice(0,43);const full=!ids.length;
    return {version:3,schema_version:3,deck_ids:deck,dictionaryId:deck.join('|'),mastered:known,pending:waiting,activeDay:0,
      days:[{date,ids:full?deck.slice(-43):ids,first:full?deck.slice(-43).map(()=>true):[],review:[],closed:false}]};
  }
  function adoptProposal(state,proposal,catalog) {
    const p=migratePlan(state,catalog);if (!p) throw Error('invalid_progress');
    const chosen=proposal.word_ids,checked=new Set(catalog.filter(w=>w.reviewed===true).map(w=>w.id||w.word));
    if (!unique(chosen)||!chosen.length||chosen.length>43||chosen.some(id=>!checked.has(id)||p.mastered.includes(id))) throw Error('invalid_recommendation');
    const carry=p.days.at(-1).ids.filter(id=>!p.mastered.includes(id));
    if(new Set([...carry,...chosen]).size>43)throw Error('daily_budget');
    const newIds=chosen.filter(id=>!p.deck_ids.includes(id));p.deck_ids.push(...newIds);p.pending.push(...newIds);p.dictionaryId=p.deck_ids.join('|');
    p.next_day_ids=[...chosen];return p;
  }
  function advancePlan(state,catalog,date) {
    const p=migratePlan(state,catalog);if (!p) throw Error('invalid_progress');
    const last=p.days.at(-1),known=new Set(p.mastered);
    const carry=last.ids.filter(id=>!known.has(id));
    const queue=[...new Set([...carry,...(p.next_day_ids||[]),...p.pending])].filter(id=>!known.has(id));
    if (!queue.length) return p;
    last.closed=true;p.days.push({date,ids:queue.splice(0,43),first:[],review:[],closed:false});p.pending=queue;p.activeDay=p.days.length-1;delete p.next_day_ids;
    return p;
  }
  function evidenceStats(events,now=new Date().toISOString()) {
    const groups=new Map();
    for(const e of [...events].filter(e=>!e.assisted&&typeof e.correct==='boolean'&&Number.isFinite(Date.parse(e.created_at))).sort((a,b)=>Date.parse(a.created_at)-Date.parse(b.created_at))){
      if(!groups.has(e.word_id))groups.set(e.word_id,[]);groups.get(e.word_id).push(e);
    }
    let tested_correct_count=0,delayed_pass_count=0;const due_ids=[];
    for(const [id,rows] of groups){
      const last=rows.at(-1);let delayed=false;
      if(last.correct){tested_correct_count++;const previous=rows.slice(0,-1).reverse();
        for(const e of previous){if(!e.correct)break;if(Date.parse(last.created_at)-Date.parse(e.created_at)>=86400000){delayed=true;break}}
        if(delayed)delayed_pass_count++;
      }
      const due=Date.parse(last.created_at)+(last.correct?(delayed?3:1)*86400000:0);
      if(due<=Date.parse(now))due_ids.push(id);
    }
    return {tested_correct_count,delayed_pass_count,due_ids};
  }
  function summarize(p,evidence=[]) {
    const d=p.days.at(-1),missed=d.ids.filter((_,i)=>d.first[i]===false),recognized=new Set(d.ids.filter((_,i)=>d.first[i]===true));
    missed.forEach((id,i)=>{if(d.review[i]===true)recognized.add(id)});
    const stats=evidenceStats(evidence);
    return {study_day:p.days.length,study_date:d.date,deck_size:(p.deck_ids||p.dictionaryId.split('|')).length,recognized_count:p.mastered.length,
      tested_correct_count:stats.tested_correct_count,delayed_pass_count:stats.delayed_pass_count,assessment_due_ids:stats.due_ids.slice(0,43),today_total:d.ids.length,answered_today:d.first.length,unattempted_today:d.ids.length-d.first.length,
      unfamiliar_ids:d.ids.filter(id=>!recognized.has(id)).slice(0,43),pending_count:p.pending.length,evidence_count:evidence.length,
      assessment_note:evidence.length?'Tests describe this sample, not an exact total vocabulary size.':'Only self-reported recognition is available; do not infer precise vocabulary size.'};
  }
  function candidates(p,catalog,evidence=[]) {
    const known=new Set(p.mastered),unfamiliar=p.days.at(-1).ids.filter(id=>!known.has(id));
    const checked=new Map(catalog.filter(w=>w.reviewed===true).map(w=>[w.id||w.word,w]));
    const ids=[...new Set([...unfamiliar,...(p.next_day_ids||[]),...p.pending,...checked.keys()])].filter(id=>!known.has(id)&&checked.has(id));
    return ids.slice(0,86).map(id=>({...checked.get(id),kind:unfamiliar.includes(id)?'review':'new'}));
  }
  function scoreAssessment(catalog,wordId,choiceId) {
    if(!catalog.some(w=>(w.id||w.word)===wordId)||!catalog.some(w=>(w.id||w.word)===choiceId))throw Error('invalid_assessment');
    return {word_id:wordId,correct:wordId===choiceId};
  }
  root.WordspaceCore=Object.freeze({validatePlan,migratePlan,createPlan,adoptProposal,advancePlan,evidenceStats,summarize,candidates,scoreAssessment});
})(globalThis);
