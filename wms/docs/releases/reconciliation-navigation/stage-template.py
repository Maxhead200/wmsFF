import pathlib,subprocess,json,hashlib,base64
r=pathlib.Path('/opt/logoff-wms/wms/work/reconciliation-nav');r.mkdir(exist_ok=True)
def d(*a):return subprocess.check_output(['docker',*a],text=True).strip()
before=BEFORE
for kind in ['api','web']:assert d('inspect','infra-'+kind+'-1','--format','{{.Image}}')==before['containers']['infra-'+kind+'-1']['image'],'Runtime changed'
base=before['containers']['infra-web-1']['image']
for name,data in FILES.items():
 p=r/'web'/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(base64.b64decode(data))
(r/'Dockerfile').write_text('FROM '+base+'\nCOPY web/ /usr/share/nginx/html/\n')
subprocess.run(['docker','build','-t','logoff-web:reconciliation-nav',str(r)],check=True,stdout=subprocess.DEVNULL)
candidate=d('image','inspect','logoff-web:reconciliation-nav','--format','{{.Id}}')
def hashes(container):
 return {line.split(maxsplit=1)[1].removeprefix('/usr/share/nginx/html/'):line.split()[0] for line in d(*container,'sh','-c','find /usr/share/nginx/html -type f -exec sha256sum {} +').splitlines()}
old=hashes(['exec','infra-web-1']);new=hashes(['run','--rm','--entrypoint','',candidate]);changed=sorted(k for k,v in new.items() if old.get(k)!=v)
assert set(old)<=set(new);assert changed==sorted(FILES)
result=dict(passed=True,base=base,candidate=candidate,api=before['containers']['infra-api-1']['image'],changed=changed,hashes=new)
(r/'verification.json').write_text(json.dumps(result));print(json.dumps(result))
