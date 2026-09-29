# FIX: preserve the current runtime; change only request markup and scoped CSS.
from pathlib import Path
import json,tarfile,re,subprocess,sys
r=Path(sys.argv[1]);w=Path(__file__).resolve().parents[1];base=w/'baselines/our-wms/2026-09-29-ordinary-pick-reviews'
b=json.loads((r/'before.json').read_text());m=json.loads((base/'manifest.json').read_text());assert all(b['containers'][n]['image']==v['image'] for n,v in m['containers'].items())
web=r/'web';web.mkdir(exist_ok=True)
with tarfile.open(base/'web-runtime.tar.gz') as t:t.extractall(web,filter='data')
index=(web/'index.html').read_text();entry=re.search(r'src="/assets/([^"/]+\.js)"',index)[1];graph={};pending=[entry]
while pending:
 n=pending.pop()
 if n in graph:continue
 s=(web/'assets'/n).read_text(encoding='utf-8');graph[n]=s;pending.extend(x for x in re.findall(r'["\']\./([\w.-]+\.js)["\']',s) if x not in graph)
requests=[n for n,s in graph.items() if 'className:"client-request-table__request-cell"' in s];assert len(requests)==1
name=requests[0];s=graph[name]
def edit(a,b):
 global s
 assert s.count(a)==1,a[:100]
 s=s.replace(a,b)
edit('className:"client-request-table__request-cell","data-label":"Заявка",children:[','className:"client-request-table__request-cell","data-label":"Заявка",children:e.jsxs("div",{className:"client-request-identity",children:[e.jsxs("div",{className:"client-request-identity__main",children:[')
edit('children:c.destinationCity??"-"})]}),(Be=', 'children:c.destinationCity??"-"})]})]}),e.jsxs("div",{className:"client-request-identity__details",children:[(Be=')
edit('children:c.comment}):null]}),e.jsxs("td",{className:"client-request-table__client-cell"','children:c.comment}):null]})]})}),e.jsxs("td",{className:"client-request-table__client-cell"')
edit('className:"client-request-table__composition-cell","data-label":"Состав",children:[','className:"client-request-table__composition-cell","data-label":"Состав",children:[e.jsxs("div",{className:"client-request-composition-client",children:[e.jsx("strong",{children:c.client.code}),e.jsx("span",{children:c.client.name})]}),')
status=s.split('className:"client-request-table__status-cell","data-label":"Статус",children:[',1)[1].split(']}),a?e.jsx("td",{className:"client-request-table__warehouse-cell"',1)[0]
assert 'request.managerComment' not in status and 'c.managerComment' in status and len(status)<900
edit('className:"client-request-table__due-cell","data-label":"Срок",children:ki(c.desiredDate)', 'className:"client-request-table__due-cell","data-label":"Срок",children:[ki(c.desiredDate),e.jsxs("div",{className:"client-request-due-status",children:['+status+']})]')
process=s.split('className:"client-request-table__process-cell","data-label":"Процесс",children:',1)[1].split('}):null]},c.id)',1)[0]
assert len(process)<1000 and 'onChange:w=>E(c.id,w.target.value)' in process
edit('}):Gt(c,y)?null:"-"]})}):null,u?e.jsx("td",', '}):Gt(c,y)?null:"-",u?e.jsxs("div",{className:"client-request-combined-process",children:[e.jsx("span",{className:"client-request-process-caption",children:"Процесс"}),'+process+']}):null]})}):null,u?e.jsx("td",')
graph[name]=s
names={n:f'compact-request-20260929-{i}.js' for i,n in enumerate(graph)};delta=[]
for n,s in graph.items():
 out='assets/'+names[n];(web/out).write_text(re.sub(r'[\w.-]+\.js',lambda m:names.get(m[0],m[0]),s),encoding='utf-8');delta.append(out)
css=(w/'apps/web/src/components/layout/la-panthera-theme.css').read_text(encoding='utf-8');marker='/* FIX: compact request identity columns';assert css.count(marker)==1;cssName='assets/compact-request-20260929.css';(web/cssName).write_text(marker+css.split(marker)[1],encoding='utf-8');delta.append(cssName)
(web/'index.html').write_text(index.replace('/assets/'+entry,'/assets/'+names[entry]).replace('</head>',f'<link rel="stylesheet" href="/{cssName}"></head>'),encoding='utf-8');delta.append('index.html');(r/'delta.json').write_text(json.dumps(delta));(r/'proof.json').write_text(json.dumps({'entry':names[entry],'requests':names[name]}));print('Candidate: request layout, CSS and import graph; API unchanged')
