const fs=require('fs'), assert=require('assert');
const ts=require('D:/WMSFF/_Kof/work/wms-release/wms/node_modules/.pnpm/typescript@5.9.3/node_modules/typescript');
const esbuild=require('D:/WMSFF/_Kof/work/wms-release/wms/node_modules/.pnpm/esbuild@0.25.12/node_modules/esbuild');
const r=process.env.WMS_DISPLAY_RELEASE_DIR||__dirname, assets=r+'/web/assets/', repo='D:/WMSFF/_Kof/work/service-menu-tiles/wms/apps/web/src/';
const label='function __pdLabel(v,f){return typeof v.productDisplayText==="string"?v.productDisplayText:f}function __pdHas(v){return typeof v.productDisplayText==="string"}';
const audit=[];
function replace(s,old,next,count=1){assert.equal(s.split(old).length-1,count,old);audit.push({old,next,count});return s.split(old).join(next)}
function fn(s,name,edit){const ast=ts.createSourceFile('x.js',s,99,true,1);const f=ast.statements.find(x=>ts.isFunctionDeclaration(x)&&x.name.text===name);assert(f,name);return s.slice(0,f.getStart(ast))+edit(f.getText(ast))+s.slice(f.end)}
let s=fs.readFileSync(assets+'inventory-week-20260928-0.js','utf8');
let form=fs.readFileSync(repo+'components/client-cabinet/ClientProductDisplaySettings.tsx','utf8').replace(/^import .*;\r?\n/gm,'').replace('export function ClientProductDisplaySettings','function __pdSettings');
form=esbuild.transformSync(form,{loader:'tsx',jsxFactory:'e.jsx',jsx:'transform',target:'es2020'}).code;
// JSX automatic runtime is supplied by the already deployed graph, not another React copy.
form=esbuild.transformSync(fs.readFileSync(repo+'components/client-cabinet/ClientProductDisplaySettings.tsx','utf8').replace(/^import .*;\r?\n/gm,'').replace('export function ClientProductDisplaySettings','function __pdSettings'),{loader:'tsx',jsx:'automatic',target:'es2020'}).code.replace(/^import .*from "react\/jsx-runtime";\n/m,'');
form=form.replace(/\bjsx\(/g,'e.jsx(').replace(/\bjsxs\(/g,'e.jsxs(').replace(/\buseState\(/g,'x.useState(').replace(/\buseEffect\(/g,'x.useEffect(').replace(/\bchoices\b/g,'__pdChoices');
form='function fetchProductDisplay(t,id){return z(`/clients/${encodeURIComponent(id)}/product-display`,{accessToken:t})}function saveProductDisplay(t,id,fields){return z(`/clients/${encodeURIComponent(id)}/product-display`,{accessToken:t,method:"PUT",body:{fields}})}'+form;
s=replace(s,'onSave:()=>void Se()}):null,qe?e.jsx(s$','onSave:()=>void Se()}):null,Te&&e.jsx(__pdSettings,{accessToken:t.accessToken,clientId:M.client.id},M.client.id),qe?e.jsx(s$');
s+='\n'+form;
fs.writeFileSync(r+'/main-patched.js',s);
const patched=new Map([[0,s]]);
s=fs.readFileSync(assets+'inventory-week-20260928-6.js','utf8');
s=fn(s,'Ii',v=>{v=replace(v,'e.jsx("strong",{children:p.name}),e.jsx("br",{}),p.article," · ",p.size','e.jsx("strong",{children:__pdLabel(p,p.name)}),!__pdHas(p)&&e.jsxs(e.Fragment,{children:[e.jsx("br",{}),p.article," · ",p.size]})');return replace(v,'children:p.barcode}','children:__pdHas(p)?"—":p.barcode}')});
s=fn(s,'Bi',v=>{v=replace(v,'" ед. · ",c.name," · ",c.barcode','" ед. · ",__pdLabel(c,`${c.name} · ${c.barcode}`)');return replace(v,'`${U.name}: ${U.quantity}`','`${__pdLabel(U,U.name)}: ${U.quantity}`')});
s=fn(s,'Ui',v=>{
 for(const obj of ['L','i']) {
  v=replace(v,`children:${obj}.productName}`,`children:__pdLabel(${obj},${obj}.productName)}`,obj==='i'?3:1);
  const old=`e.jsx("span",{children:${obj}.article?\`арт. \${${obj}.article}\`:"артикул не указан"})`;
  v=replace(v,old,`!__pdHas(${obj})&&`+old);
  for(const p of ['productBarcode','size'])v=replace(v,`children:${obj}.${p}??"—"`,`children:__pdHas(${obj})?"—":${obj}.${p}??"—"`);
 }
 for(const inner of ['[i.article,i.size].filter(Boolean).join(" · ")','[i.article?`арт. ${i.article}`:"",i.size?`размер ${i.size}`:"",i.productBarcode?`ШК ${i.productBarcode}`:""].filter(Boolean).join(" · ")','[i.article?`арт. ${i.article}`:"",i.color,i.size?`размер ${i.size}`:"",i.barcode?`ШК ${i.barcode}`:""].filter(Boolean).join(" · ")']){
  const old='e.jsx("span",{children:'+inner+'})';v=replace(v,old,'!__pdHas(i)&&'+old);
 }
 v=replace(v,'children:i.article||"Артикул не указан"','children:__pdLabel(i,i.article||"Артикул не указан")',2);
 v=replace(v,'children:i.productBarcode??"ещё не пропикан"','children:__pdHas(i)?"—":i.productBarcode??"ещё не пропикан"');
 return replace(v,'children:i.size??"не указан"','children:__pdHas(i)?"—":i.size??"не указан"');
});patched.set(6,s+'\n'+label);
s=fs.readFileSync(assets+'inventory-week-20260928-1.js','utf8');s=replace(s,'children:[h.productName,h.article?` · ${h.article}`:""]','children:[__pdLabel(h,[h.productName,h.article].filter(Boolean).join(" · "))]');patched.set(1,s+'\n'+label);
s=fs.readFileSync(assets+'inventory-week-20260928-4.js','utf8');s=replace(s,'e.jsx("strong",{children:u.planItem.offerId}),e.jsx("small",{children:u.planItem.productName})','e.jsx("strong",{children:__pdLabel(u.planItem,u.planItem.offerId)}),!__pdHas(u.planItem)&&e.jsx("small",{children:u.planItem.productName})');patched.set(4,s+'\n'+label);
const names=fs.readdirSync(assets).filter(n=>/^inventory-week-20260928-\d+\.js$/.test(n));assert.equal(names.length,29);
const mapping=Object.fromEntries(names.map(n=>[n,n.replace('inventory-week-','client-display-')]));
for(const n of names){let data=patched.get(Number(n.match(/-(\d+)\.js$/)[1]))??fs.readFileSync(assets+n,'utf8');for(const [a,b] of Object.entries(mapping))data=data.split(a).join(b);const ast=ts.createSourceFile(n,data,99,true,1);assert.equal(ast.parseDiagnostics.length,0,n);fs.writeFileSync(assets+mapping[n],data)}
let index=fs.readFileSync(r+'/web/index.html','utf8');for(const [a,b] of Object.entries(mapping))index=index.split(a).join(b);fs.writeFileSync(r+'/web/index.html',index);
fs.writeFileSync(r+'/web-delta.json',JSON.stringify({changed:['index.html',...Object.values(mapping).map(n=>'assets/'+n)],mapping,audit},null,2));
console.log('PASS: exact display-only patches; single shared React graph; parsed 29 modules');
