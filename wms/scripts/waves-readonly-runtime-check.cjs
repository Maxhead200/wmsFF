// TEST: evaluate actual built wrapper with published bindings and server-render it.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),{createRequire}=require('node:module'),path=require('node:path');
const req=createRequire(path.resolve(__dirname,'../apps/web/package.json'));
const React=req('react'),{renderToStaticMarkup}=req('react-dom/server');
const source=fs.readFileSync(process.argv[2],'utf8');
const injection=source.slice(source.lastIndexOf('\nlet __waveComponent;'));
assert(injection.startsWith('\nlet __waveComponent;'));
let reads=0;const ctx=vm.createContext({x:React,e:{jsx:React.createElement},Ij:()=>{reads++;return Promise.resolve([])},VI:()=>{reads++;return Promise.resolve([])},Intl,Date,Map});
vm.runInContext(injection,ctx);
const html=renderToStaticMarkup(React.createElement(ctx.__LogoffWaveReadOnly,{session:{accessToken:'test',user:{id:'test'}}}));
assert(html.includes('Волны сборки'));assert(html.includes('Создание и запуск волн пока отключены'));assert(html.includes('Загружаю данные'));assert.equal(reads,0);
assert(source.includes('notificationTarget:s'));assert(source.includes('window.location.hostname!=="wms.logoff.pro"?e.jsx(X8,{session:n}):null'));
console.log('Built wrapper SSR and retained notification/hostname wiring: passed');
