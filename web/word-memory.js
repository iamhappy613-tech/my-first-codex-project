(function(root){
 'use strict';
 const embeddedNotes=/* WORDSPACE_MEMORY_NOTES */ {};
 const labels={affix:'词根 / 词缀',compound:'合成词',family:'词族联记',root:'词根来源'};
 function describe(entry,notes=embeddedNotes){
  const id=entry?.id||entry?.word||'',note=Object.hasOwn(notes,id)?notes[id]:null;
  if(note&&Object.hasOwn(labels,note.kind)&&typeof note.structure==='string'&&note.structure.trim()&&typeof note.explanation==='string'&&note.explanation.trim()&&(note.kind!=='root'||typeof note.source_url==='string')){
   return {kind:note.kind,label:labels[note.kind],structure:note.structure,explanation:note.explanation,tip:typeof note.tip==='string'?note.tip:''};
  }
  return {kind:'whole',label:'整体记忆',structure:entry?.word||id,explanation:'这个词先按整体记忆，借助下方例句巩固拼写与词义。',tip:''};
 }
 function render(container,entry){
  const note=describe(entry),doc=container.ownerDocument;
  container.classList.add('word-memory');container.dataset.kind=note.kind;container.replaceChildren();
  for(const [name,text] of [['heading','构词与记忆 · '+note.label],['structure',note.structure],['explanation',note.explanation],['tip',note.tip]]){
   if(!text)continue;const line=doc.createElement('span');line.className='memory-'+name;line.textContent=text;container.append(line);
  }
  return note;
 }
 root.WordspaceMemory=Object.freeze({describe,render});
})(globalThis);
