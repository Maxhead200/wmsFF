const fs=require('fs'),assert=require('assert'),esbuild=require('D:/WMSFF/_Kof/work/wms-release/wms/node_modules/.pnpm/esbuild@0.25.12/node_modules/esbuild');
const r=__dirname,dir=r+'/web/assets/';const names=fs.readdirSync(dir).filter(n=>/^client-display-20260928-\d+\.js$/.test(n));assert.equal(names.length,29);
let main=fs.readFileSync(dir+'client-display-20260928-0.js','utf8');
const old='Rt(t.accessToken),Dj(t.accessToken),Ij(t.accessToken),aR(t.accessToken)';assert.equal(main.split(old).length-1,1);main=main.replace(old,'Rt(t.accessToken),Dj(t.accessToken,{view:"cabinet"}),Ij(t.accessToken),aR(t.accessToken,{view:"cabinet"})');
const panel='Te&&e.jsx(__pdSettings,{accessToken:t.accessToken,clientId:M.client.id},M.client.id),';assert.equal(main.split(panel).length-1,1);main=main.replace(panel,'');const tiles='e.jsx(j$,{accessToken:t.accessToken,clientId:M.client.id})';assert.equal(main.split(tiles).length-1,1);main=main.replace(tiles,panel+tiles);
const formStart=main.indexOf('const __pdChoices');assert(formStart>0);main=main.slice(0,formStart);
let source=fs.readFileSync('D:/WMSFF/_Kof/work/service-menu-tiles/wms/apps/web/src/components/client-cabinet/ClientProductDisplaySettings.tsx','utf8').replace(/^import .*;\r?\n/gm,'').replace('export function ClientProductDisplaySettings','function __pdSettings');
let form=esbuild.transformSync(source,{loader:'tsx',jsx:'automatic',target:'es2020'}).code.replace(/^import .*from "react\/jsx-runtime";\n/m,'').replace(/\bjsx\(/g,'e.jsx(').replace(/\bjsxs\(/g,'e.jsxs(').replace(/\bFragment\b/g,'e.Fragment').replace(/\buseState\(/g,'x.useState(').replace(/\buseEffect\(/g,'x.useEffect(').replace(/\bchoices\b/g,'__pdChoices');main+=form;
const map=Object.fromEntries(names.map(n=>[n,n.replace('client-display-','cabinet-fast-')]));
for(const n of names){let s=n.endsWith('-0.js')?main:fs.readFileSync(dir+n,'utf8');for(const[a,b]of Object.entries(map))s=s.split(a).join(b);fs.writeFileSync(dir+map[n],s)}
let index=fs.readFileSync(r+'/web/index.html','utf8');for(const[a,b]of Object.entries(map))index=index.split(a).join(b);fs.writeFileSync(r+'/web/index.html',index);
fs.writeFileSync(r+'/web-delta.json',JSON.stringify({changed:['index.html',...Object.values(map).map(n=>'assets/'+n)],mapping:map}));console.log('Preserved current CSS and module graph; compact cabinet requests and visible form');
