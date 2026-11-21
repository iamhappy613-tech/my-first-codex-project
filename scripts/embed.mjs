import {readFile,writeFile} from 'node:fs/promises';
let html=await readFile('index.html','utf8');
const original=html;
const replace=(begin,end,content)=>{const a=html.indexOf(begin),b=html.indexOf(end,a);if(a<0||b<0)throw Error(`missing marker ${begin}`);html=html.slice(0,a+begin.length)+'\n'+content+'\n'+html.slice(b)};
replace('/* BEGIN ACCOUNT_CSS */','/* END ACCOUNT_CSS */',await readFile('web/account.css','utf8'));
replace('<!-- BEGIN ACCOUNT_UI -->','<!-- END ACCOUNT_UI -->',await readFile('web/account-ui.html','utf8'));
replace('<!-- BEGIN LEARNING_UI -->','<!-- END LEARNING_UI -->',await readFile('web/learning-ui.html','utf8'));
const data=await readFile('data/catalog.json','utf8');let study=await readFile('web/study.js','utf8');
study=study.replace('/* WORDSPACE_CATALOG */ null',data.trim().replaceAll('<','\\u003c'));
const notices=(await readFile('licenses/ECDICT-LICENSE.txt','utf8'))+'\n\n'+(await readFile('licenses/CMUDICT-LICENSE.txt','utf8'));
if(!html.includes('<!-- BEGIN LICENSE_NOTICES -->'))html=html.replace('</head>','<!-- BEGIN LICENSE_NOTICES -->\n<!-- END LICENSE_NOTICES -->\n</head>');
replace('<!-- BEGIN LICENSE_NOTICES -->','<!-- END LICENSE_NOTICES -->','<script type="text/plain" id="third-party-notices">\n'+notices.replaceAll('</script','<\\/script')+'\n</script>');
const scripts=[await readFile('supabase/functions/_shared/core.js','utf8'),await readFile('web/assessment.js','utf8'),await readFile('web/account.js','utf8'),study];
replace('<!-- BEGIN WORDSPACE_SCRIPTS -->','<!-- END WORDSPACE_SCRIPTS -->',scripts.map(source=>'<script>\n'+source.replaceAll('</script','<\\/script')+'\n</script>').join('\n'));
const cols='id,word,phonetic,meaning,example,translation,level,reviewed,source,frequency_rank';
const seed='-- Reviewed authored lessons; see data/provenance.json and licenses/.\ninsert into public.word_catalog('+cols+')\nselect '+cols+' from jsonb_to_recordset($catalog$'+data+'$catalog$::jsonb) as t(id text,word text,phonetic text,meaning text,example text,translation text,level text,reviewed boolean,source text,frequency_rank integer)\non conflict(id) do nothing;\n';
let cloudOriginal=null,cloudNext=null;
try{cloudOriginal=await readFile('cloud-preview.html','utf8')}catch(error){if(error.code!=='ENOENT')throw error}
if(cloudOriginal!==null){
 const configPattern=/(<script id="wordspace-config" type="application\/json">)([\s\S]*?)(<\/script>)/,cloudConfig=cloudOriginal.match(configPattern);
 if(!cloudConfig||!html.match(configPattern))throw Error('Public page configuration is missing; cloud preview was not overwritten');
 JSON.parse(cloudConfig[2]);cloudNext=html.replace(configPattern,()=>cloudConfig[0]);
}
if(process.argv.includes('--check')){if(html!==original)throw Error('index.html is stale; run npm run embed');if(cloudNext!==cloudOriginal)throw Error('cloud-preview.html is stale; run npm run embed');if(seed!==await readFile('supabase/seed.sql','utf8'))throw Error('SQL seed is stale');console.log('PASS: public HTML pages and SQL seed match source')}else {await writeFile('index.html',html);if(cloudNext!==null)await writeFile('cloud-preview.html',cloudNext);await writeFile('supabase/seed.sql',seed);}
