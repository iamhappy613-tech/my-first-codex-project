import {randomBytes,createHash} from 'node:crypto';import {writeFile,access,unlink} from 'node:fs/promises';
const args=process.argv.slice(2),get=f=>args[args.indexOf(f)+1];
if(!args.includes('--owner')||!args.includes('--site'))throw Error('Usage: node scripts/connection-secret.mjs --owner YOUR_UUID --site https://iamhappy613-tech.github.io');
const owner=get('--owner'),site=new URL(get('--site'));if(!/^[0-9a-f-]{36}$/i.test(owner)||site.protocol!=='https:'||site.origin!==get('--site'))throw Error('Use owner UUID and HTTPS origin (no path)');
for(const path of ['.env.coach.local','.env.functions.local']){try{await access(path);throw Error('Credential file already exists; refusing to overwrite.')}catch(error){if(error.code!=='ENOENT')throw error}}
const secret=randomBytes(32).toString('hex'),hash=createHash('sha256').update(secret).digest('hex');
await writeFile('.env.coach.local',`# Copy only the value into your private GPT Actions Bearer authentication.\nWORDSPACE_COACH_CONNECTION=${secret}\n`,{mode:0o600,flag:'wx'});
try { await writeFile('.env.functions.local',`WORDSPACE_OWNER_ID=${owner}\nWORDSPACE_COACH_TOKEN_SHA256=${hash}\nWORDSPACE_SITE_ORIGIN=${site.origin}\n`,{mode:0o600,flag:'wx'}); } catch(error) { await unlink('.env.coach.local'); throw error; }
console.log('Created ignored private files .env.coach.local and .env.functions.local. Secrets were not printed. Keep the GPT Only me.');
