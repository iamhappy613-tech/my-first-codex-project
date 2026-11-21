import {readFile,writeFile} from 'node:fs/promises';
const args=process.argv.slice(2),get=flag=>args[args.indexOf(flag)+1];
if(!args.includes('--url')||!args.includes('--key')){console.error('Usage: node scripts/configure.mjs --url https://PROJECT.supabase.co --key PUBLIC_KEY [--owner UUID] [--gpt https://chatgpt.com/g/ID] [--enable-cloud] [--output cloud-preview.html]');process.exit(1)}
const output=args.includes('--output')?get('--output'):'index.html';if(!/^[a-z][a-z0-9-]*\.html$/.test(output))throw Error('Use a simple public HTML filename');
const u=new URL(get('--url'));if(u.protocol!=='https:'||u.username||u.password||!['','/'].includes(u.pathname)||u.search||u.hash)throw Error('Use the HTTPS project root URL');
const key=get('--key');let publicKey=key?.startsWith('sb_publishable_');
try{publicKey ||= JSON.parse(Buffer.from(key.split('.')[1],'base64url').toString()).role==='anon'}catch{}
if(!publicKey||key.startsWith('sb_secret_'))throw Error('Only publishable/anon keys are allowed here. Never provide service_role/secret keys.');
let html=await readFile('index.html','utf8');const match=html.match(/(<script id="wordspace-config" type="application\/json">)([\s\S]*?)(<\/script>)/);const config=JSON.parse(match[2]);
config.supabaseUrl=u.origin;config.publicKey=key;
if(args.includes('--owner')){config.ownerId=get('--owner');if(!/^[a-f0-9-]{36}$/i.test(config.ownerId))throw Error('Invalid owner UUID')}
if(args.includes('--gpt')){const g=new URL(get('--gpt'));if(g.protocol!=='https:'||g.hostname!=='chatgpt.com'||!g.pathname.startsWith('/g/'))throw Error('Use your private GPT URL');config.coachUrl=g.href}
config.siteUrl='https://iamhappy613-tech.github.io/my-first-codex-project/'+output;
if(args.includes('--enable-cloud'))config.mode='cloud';
html=html.replace(match[0],()=>match[1]+JSON.stringify(config).replaceAll('<','\\u003c')+match[3]);await writeFile(output,html);
const api=JSON.parse(await readFile('gpt/openapi.json','utf8'));api.servers=[{url:u.origin+'/functions/v1/coach'}];await writeFile('gpt/openapi.json',JSON.stringify(api,null,2)+'\n');
console.log(`Public config updated; mode=${config.mode}. No server credentials were written.`);
