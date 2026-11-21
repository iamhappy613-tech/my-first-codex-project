import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
const name=`wordspace-test-${randomUUID().slice(0,8)}`;
try {
 execFileSync('docker',['run','--rm','-d','--network','none','--name',name,'-e','POSTGRES_HOST_AUTH_METHOD=trust','postgres:16-alpine'],{stdio:'pipe'});
 let ready=false;
 for(let i=0;i<100;i++){try{execFileSync('docker',['exec',name,'pg_isready','-U','postgres'],{stdio:'pipe'});ready=true;break}catch{await new Promise(r=>setTimeout(r,100))}}
 if(!ready)throw Error('PostgreSQL startup timeout');
 const result=execFileSync(process.execPath,['--test','tests/database.integration.mjs'],{env:{...process.env,WORDSPACE_TEST_CONTAINER:name},stdio:'pipe'});
 process.stdout.write(result);
} catch(e){if(e.stdout)process.stdout.write(e.stdout);if(e.stderr)process.stderr.write(e.stderr);console.error(e.message);process.exitCode=1}
finally{try{execFileSync('docker',['rm','-f',name],{stdio:'pipe'})}catch{}}
