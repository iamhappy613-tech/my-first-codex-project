import test from 'node:test';
import assert from 'node:assert/strict';
try{await import('../web/word-memory.js')}catch(error){if(error.code!=='ERR_MODULE_NOT_FOUND')throw error}
const M=globalThis.WordspaceMemory||{};
const notes={ability:{kind:'affix',structure:'able → abil- + -ity',explanation:'able表示能够，-ity构成名词；拼写由able变为abil-。',tip:'able是能够，ability是能力。'}};

test('lookup preserves the distinction between transparent affixes and family associations',()=>{
 assert.deepEqual(M.describe?.({id:'ability',word:'ability'},notes),{kind:'affix',label:'词根 / 词缀',structure:notes.ability.structure,explanation:notes.ability.explanation,tip:notes.ability.tip});
 const family={accept:{kind:'family',structure:'accept → acceptance',explanation:'接受的动词与名词一起记。'}};
 assert.equal(M.describe?.({id:'accept',word:'accept'},family)?.label,'词族联记');
});

test('unknown or opaque words get an honest whole-word cue without guessed prefix splitting',()=>{
 const actual=M.describe?.({id:'avoid',word:'avoid'},{});
 assert.equal(actual?.kind,'whole');assert.equal(actual?.label,'整体记忆');assert.equal(actual?.structure,'avoid');assert(!actual?.explanation.includes('a-'));
});

test('malformed notes do not break study or masquerade as verified structure',()=>{
 const entry={id:'avoid',word:'avoid'},bad={avoid:{kind:'unknown',structure:'a + void',explanation:'猜测'}};
 assert.equal(M.describe?.(entry,bad)?.kind,'whole');
 assert.equal(M.describe?.(entry,{avoid:{kind:'affix',structure:'',explanation:''}})?.kind,'whole');
});
