import {readFile} from 'node:fs/promises';
export const MEMORY_FILES=['data/memory-notes/core.json','data/memory-notes/expansion-a.json','data/memory-notes/expansion-b.json'];
const kinds=new Set(['affix','compound','family','root']);
const primaryHosts=new Set(['dictionary.cambridge.org','merriam-webster.com','www.merriam-webster.com','oxfordlearnersdictionaries.com','www.oxfordlearnersdictionaries.com','oed.com','www.oed.com']);
const validSource=value=>{try{const url=new URL(value);return url.protocol==='https:'&&primaryHosts.has(url.hostname)&&!url.username&&!url.password}catch{return false}};
export function combineMemoryParts(catalog,parts){
 const allIds=new Set(catalog.map(word=>word.id)),seen=new Set(),whole=[],entries=Object.create(null),references=new Map();
 for(const part of parts){
  if(part.schema_version!==1||!Number.isInteger(part.start)||!Number.isInteger(part.end)||part.start<0||part.end>catalog.length||part.start>=part.end||!part.entries||!Array.isArray(part.whole_words))throw Error('Invalid memory-note partition');
  const expected=new Set(catalog.slice(part.start,part.end).map(word=>word.id)),ids=[...Object.keys(part.entries),...part.whole_words];
  if(ids.length!==expected.size||new Set(ids).size!==ids.length||ids.some(id=>!expected.has(id)))throw Error(`Memory-note range ${part.start}..${part.end} is incomplete or duplicated`);
  for(const id of ids){if(!allIds.has(id)||seen.has(id))throw Error('Unknown or repeated memory-note ID: '+id);seen.add(id);}
  for(const [id,note] of Object.entries(part.entries)){
   if(!note||!kinds.has(note.kind)||typeof note.structure!=='string'||!note.structure.trim()||note.structure.length>160||typeof note.explanation!=='string'||!note.explanation.trim()||note.explanation.length>240||(note.tip!==undefined&&(typeof note.tip!=='string'||note.tip.length>160)))throw Error('Invalid memory note: '+id);
   if(note.kind==='root'&&!validSource(note.source_url))throw Error('Historical root needs a primary dictionary source: '+id);
   if(note.source_url!==undefined&&!validSource(note.source_url))throw Error('Invalid memory-note source: '+id);
   entries[id]=note;
  }
  whole.push(...part.whole_words);
  for(const reference of part.references||[]){if(typeof reference.title!=='string'||!validSource(reference.url))throw Error('Invalid memory-note reference');references.set(reference.url,reference);}
 }
 if(seen.size!==allIds.size)throw Error('Memory notes do not cover the full catalog');
 return {entries,whole_words:whole,detailed_count:Object.keys(entries).length,whole_count:whole.length,references:[...references.values()]};
}
export async function loadMemoryData(catalog){
 const parts=await Promise.all(MEMORY_FILES.map(async path=>JSON.parse(await readFile(path,'utf8'))));return combineMemoryParts(catalog,parts);
}
