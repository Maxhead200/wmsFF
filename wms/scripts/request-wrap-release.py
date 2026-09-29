# FIX: web-only delta on the latest verified runtime; API and source divergence are preserved.
from pathlib import Path
import json,re,subprocess,sys
r=Path(sys.argv[1]);w=Path(__file__).resolve().parents[1]
base=w/'baselines/our-wms/2026-09-29-request-action-menus'
b=json.loads((r/'before.json').read_text());m=json.loads((base/'manifest.json').read_text())
assert all(b['containers'][n]['image']==v['image'] for n,v in m['containers'].items())
web=r/'web';index=(web/'index.html').read_text();entry=re.search(r'src="/assets/([^"/]+\.js)"',index)[1]
graph={};pending=[entry]
while pending:
 n=pending.pop()
 if n in graph:continue
 s=(web/'assets'/n).read_text(encoding='utf-8');graph[n]=s;pending.extend(x for x in re.findall(r'["\']\./([\w.-]+\.js)["\']',s) if x not in graph)
name='request-actions-20260929-6.js';assert name in graph
node='C:/Users/La_pa/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
subprocess.run([node,str(w/'apps/web/test/build-request-action-runtime.cjs'),str(r),name],check=True)
graph[name]=(r/'patched-requests.js').read_text(encoding='utf-8')
names={n:f'request-wrap-20260929-{i}.js' for i,n in enumerate(graph)};delta=[]
for n,s in graph.items():
 out='assets/'+names[n];(web/out).write_text(re.sub(r'[\w.-]+\.js',lambda m:names.get(m[0],m[0]),s),encoding='utf-8');delta.append(out)
css='assets/request-wrap-20260929.css'
styles=(w/'apps/web/src/components/client-requests/client-requests.css').read_text(encoding='utf-8');start=styles.index('.client-request-title {');end=styles.index('\n}',start)+2
rule=styles[start:end].replace('.client-request-title {','.client-request-identity .client-request-title {')
(web/css).write_text(rule+'\n'+(w/'apps/web/src/components/client-requests/request-action-menus.css').read_text(encoding='utf-8'),encoding='utf-8');delta.append(css)
(web/'index.html').write_text(index.replace('/assets/'+entry,'/assets/'+names[entry]).replace('</head>',f'<link rel="stylesheet" href="/{css}"></head>'),encoding='utf-8');delta.append('index.html')
(r/'delta.json').write_text(json.dumps(delta));(r/'proof.json').write_text(json.dumps({'entry':names[entry],'requests':names[name]}))
for new,old in ((v,k) for k,v in names.items()):
 normalized=re.sub(r'[\w.-]+\.js',lambda m:{v:k for k,v in names.items()}.get(m[0],m[0]),(web/'assets'/new).read_text(encoding='utf-8'))
 assert normalized==graph[old]
(r/'graph-verification.json').write_text(json.dumps({'passed':True,'moduleCount':len(graph),'changedModules':[name],'apiUnchanged':True}))
print('Runtime candidate ready: one table wrapper and scoped CSS; other modules unchanged.')
