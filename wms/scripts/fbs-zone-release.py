# FIX: CSS-only overlay from the verified runtime; JavaScript and API stay byte-identical.
from pathlib import Path
import json,tarfile,hashlib,sys
r=Path(sys.argv[1]);w=Path(__file__).resolve().parents[1];base=w/'baselines/our-wms/2026-09-29-reconciliation-navigation'
b=json.loads((r/'before.json').read_text());m=json.loads((base/'manifest.json').read_text())
assert all(b['containers'][n]['image']==v['image'] for n,v in m['containers'].items())
assert b['api']==m['artifacts']['api-runtime.tar.gz']['files']
for n,h in m['artifacts']['web-runtime.tar.gz']['files'].items():assert b['web'][n]==h
web=r/'web';web.mkdir(exist_ok=True)
with tarfile.open(base/'web-runtime.tar.gz') as t:t.extractall(web,filter='data')
s=(w/'apps/web/src/components/layout/la-panthera-theme.css').read_text(encoding='utf-8');marker='/* FIX: FBS zone selection and elapsed timers';assert s.count(marker)==1
name='assets/fbs-zone-colors-20260929.css';(web/name).write_text(marker+s.split(marker)[1],encoding='utf-8')
p=web/'index.html';p.write_text(p.read_text().replace('</head>',f'<link rel="stylesheet" href="/{name}"></head>'),encoding='utf-8')
changed=['index.html',name];(r/'delta.json').write_text(json.dumps(changed));print('CSS-only candidate: 2 files')
