import pathlib,json,subprocess,fcntl,urllib.request,hashlib,time
r=pathlib.Path('/opt/logoff-wms/wms/work/request-polish');app=pathlib.Path('/opt/logoff-wms/wms');locks=[]
for name in ['/run/logoff-wms-release.lock','/opt/logoff-wms/.release.lock','/run/logoff-wms-api-release.lock']:
 f=open(name,'a');fcntl.flock(f,fcntl.LOCK_EX|fcntl.LOCK_NB);locks.append(f)
def d(*a):return subprocess.check_output(['docker',*a],text=True).strip()
def get(p):
 with urllib.request.urlopen('https://wms.logoff.pro/'+p,timeout=20) as resp:return resp.read()
v=json.loads((r/'verification.json').read_text());assert v['passed'];assert PR['merged'];assert not (r/'published.json').exists()
assert d('inspect','infra-web-1','--format','{{.Image}}')==v['base'];assert d('inspect','infra-api-1','--format','{{.Image}}')==v['api']
assert d('image','inspect','logoff-web:request-polish','--format','{{.Id}}')==v['candidate']
others={n:d('inspect',n,'--format','{{.Id}}') for n in d('ps','--format','{{.Names}}').splitlines() if n not in ['infra-web-1','infra-api-1']};meta=get('downloads/logoff-tsd.json')
env=(app/'.env').read_bytes();compose=(app/'infra/docker-compose.yml').read_bytes();d('tag',v['base'],'logoff-web:before-request-polish');d('tag',v['api'],'logoff-api:before-request-polish')
def switch(image,kind='web'):
 d('tag',image,'infra-'+kind+':latest');subprocess.run(['docker','compose','--env-file',str(app/'.env'),'-f',str(app/'infra/docker-compose.yml'),'up','-d','--no-deps','--no-build','--pull','never',kind],check=True)
try:
 assert d('image','inspect','logoff-api:request-polish','--format','{{.Id}}')==v['apiCandidate']
 switch(v['apiCandidate'],'api')
 for attempt in range(40):
  try:
   if json.loads(get('api/v1/health'))['status']=='ok':break
  except Exception:pass
  time.sleep(1)
 else:raise RuntimeError('API health failed')
 assert d('inspect','infra-api-1','--format','{{.Image}}')==v['apiCandidate']
 api_actual={l.split(maxsplit=1)[1].removeprefix('/app/apps/api/dist/'):l.split()[0] for l in d('exec','infra-api-1','sh','-c','find /app/apps/api/dist -type f -name "*.js" -exec sha256sum {} +').splitlines()};assert api_actual==v['apiHashes']
 switch(v['candidate']);assert d('inspect','infra-web-1','--format','{{.Image}}')==v['candidate']
 actual={l.split(maxsplit=1)[1].removeprefix('/usr/share/nginx/html/'):l.split()[0] for l in d('exec','infra-web-1','sh','-c','find /usr/share/nginx/html -type f -exec sha256sum {} +').splitlines()};assert actual==v['hashes']
 for name in v['changed']:
  assert hashlib.sha256(get('' if name=='index.html' else name)).hexdigest()==actual[name]
 assert json.loads(get('api/v1/health'))['status']=='ok';assert meta==get('downloads/logoff-tsd.json');assert env==(app/'.env').read_bytes() and compose==(app/'infra/docker-compose.yml').read_bytes();assert all(d('inspect',n,'--format','{{.Id}}')==i for n,i in others.items())
except Exception:
 switch(v['base']);switch(v['api'],'api');raise
result=dict(published=True,at=time.time(),pullRequest=PR['number'],apiImage=v['apiCandidate'],previousApi=v['api'],webImage=v['candidate'],previousWeb=v['base'],apkUnchanged=True,otherContainersUnchanged=True,publicFontVerified=True)
(r/'published.json').write_text(json.dumps(result));print(json.dumps(result))
