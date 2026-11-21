import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
const args=process.argv.slice(2),index=args.indexOf('--port');
const port=index<0?8000:Number(args[index+1]);
if(!Number.isInteger(port)||port<0||port>65535)throw Error('Use --port 0..65535');
const server=createServer(async(req,res)=>{
 const path=new URL(req.url,'http://127.0.0.1').pathname;
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
 if(!['GET','HEAD'].includes(req.method)||!['/','/index.html'].includes(path)){res.writeHead(404);res.end('Not found');return}
 try{const html=await readFile('index.html');res.setHeader('Content-Type','text/html; charset=utf-8');res.end(req.method==='HEAD'?undefined:html)}
 catch{res.writeHead(503);res.end('index.html unavailable')}
});
server.listen(port,'127.0.0.1',()=>console.log(`Preview: http://127.0.0.1:${server.address().port}`));
