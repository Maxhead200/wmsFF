// FIX: loopback-only preview; explicit asset allowlist, no proxy and no write endpoints.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {menu,transition,pageType}=require('./model.cjs');
function createServer(){return http.createServer((req,res)=>{
 if(req.method!=='GET'){res.writeHead(405);return res.end();}
 const url=new URL(req.url,'http://localhost').pathname;
 res.setHeader('Cache-Control','no-store');
 res.setHeader('Content-Security-Policy',"default-src 'self'; connect-src 'none'; img-src 'self' data:; style-src 'self'; script-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'");
 if(url==='/model.js'){res.setHeader('Content-Type','text/javascript; charset=utf-8');return res.end(`export const menu=${JSON.stringify(menu)};export const transition=${transition.toString()};export const pageType=${pageType.toString()};`);}
 const files={'/':'index.html','/soul.css':'soul.css','/app.js':'app.js'};
 if(!files[url]){res.writeHead(404);return res.end();}
 res.setHeader('Content-Type',url.endsWith('.css')?'text/css':url.endsWith('.js')?'text/javascript':'text/html; charset=utf-8');res.end(fs.readFileSync(path.join(__dirname,files[url])));
});}
module.exports={createServer};
if(require.main===module)createServer().listen(Number(process.env.SOUL_PORT||8767),'127.0.0.1',()=>console.log('Soul preview: http://127.0.0.1:'+ (process.env.SOUL_PORT||8767)));
