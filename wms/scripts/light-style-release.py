# FIX: additive Light selector and palette over the verified runtime; no full rebuild.
from pathlib import Path
import json,re,tarfile,subprocess,sys
r=Path(sys.argv[1]);w=Path(__file__).resolve().parents[1];base=w/'baselines/our-wms/2026-09-29-compact-request-columns'
b=json.loads((r/'before.json').read_text());m=json.loads((base/'manifest.json').read_text());assert all(b['containers'][n]['image']==v['image'] for n,v in m['containers'].items())
web=r/'web';web.mkdir(exist_ok=True)
with tarfile.open(base/'web-runtime.tar.gz') as t:t.extractall(web,filter='data')
node='C:/Users/La_pa/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
code='require('+json.dumps(str(w/'node_modules/.pnpm/esbuild@0.25.12/node_modules/esbuild'))+').buildSync('+json.dumps(dict(entryPoints=[str(w/'apps/web/src/components/layout/ThemeStyleSwitcher.tsx')],bundle=True,format='esm',external=['react'],outfile=str(r/'switcher.js')))+')'
subprocess.run([node,'-e',code],check=True)
component=(r/'switcher.js').read_text(encoding='utf-8').replace('import * as React from "react";','const React=x;').replace('import { jsx, jsxs } from "react/jsx-runtime";','const {jsx,jsxs}=e;')
component=re.sub(r'export\s*\{\s*ThemeStyleSwitcher\s*\};','return ThemeStyleSwitcher;',component);assert 'import ' not in component and 'export {' not in component
component='const __ThemeStyleSwitcher=(()=>{'+component+'})();'
index=(web/'index.html').read_text();entry=re.search(r'src="/assets/([^"/]+\.js)"',index)[1];graph={};pending=[entry]
while pending:
 n=pending.pop()
 if n in graph:continue
 s=(web/'assets'/n).read_text(encoding='utf-8');graph[n]=s;pending.extend(x for x in re.findall(r'["\']\./([\w.-]+\.js)["\']',s) if x not in graph)
s=graph[entry];needle='e.jsxs("div",{className:"workspace-user",children:';assert s.count(needle)==1
s=s.replace(needle,'m==="la_panthera"?e.jsx(__ThemeStyleSwitcher,{userId:t.user.id},t.user.id):null,'+needle)
needle='iT.createRoot(document.getElementById("root"))';assert s.count(needle)==1;s=s.replace(needle,component+needle);graph[entry]=s
names={n:f'light-style-20260929-{i}.js' for i,n in enumerate(graph)};delta=[]
for n,s in graph.items():
 out='assets/'+names[n];(web/out).write_text(re.sub(r'[\w.-]+\.js',lambda m:names.get(m[0],m[0]),s),encoding='utf-8');delta.append(out)
cssName='assets/light-style-20260929.css';(web/cssName).write_bytes((w/'apps/web/src/components/layout/la-panthera-light.css').read_bytes());delta.append(cssName)
(web/'index.html').write_text(index.replace('/assets/'+entry,'/assets/'+names[entry]).replace('</head>',f'<link rel="stylesheet" href="/{cssName}"></head>'),encoding='utf-8');delta.append('index.html')
(r/'delta.json').write_text(json.dumps(delta));(r/'proof.json').write_text(json.dumps({'entry':names[entry],'requests':names[next(n for n,s in graph.items() if 'className:"client-request-table__request-cell"' in s)]}));print('Light candidate: selector in main, palette and 29-module graph; API untouched')
