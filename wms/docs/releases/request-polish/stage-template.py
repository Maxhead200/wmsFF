import pathlib,subprocess,json,hashlib,base64
r=pathlib.Path('/opt/logoff-wms/wms/work/request-polish');r.mkdir(exist_ok=True)
def d(*a):return subprocess.check_output(['docker',*a],text=True).strip()
before=BEFORE
for kind in ['api','web']:assert d('inspect','infra-'+kind+'-1','--format','{{.Image}}')==before['containers']['infra-'+kind+'-1']['image'],'Runtime changed'
base=before['containers']['infra-web-1']['image']
for name,data in FILES.items():
 p=r/'web'/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(base64.b64decode(data))

(r/'Dockerfile').write_text('FROM '+base+'\nCOPY web/ /usr/share/nginx/html/\n')
subprocess.run(['docker','build','-t','logoff-web:request-polish',str(r)],check=True,stdout=subprocess.DEVNULL)
candidate=d('image','inspect','logoff-web:request-polish','--format','{{.Id}}')
def hashes(container):
 return {line.split(maxsplit=1)[1].removeprefix('/usr/share/nginx/html/'):line.split()[0] for line in d(*container,'sh','-c','find /usr/share/nginx/html -type f -exec sha256sum {} +').splitlines()}
assert hashes(['run','--rm','--entrypoint','',base])==hashes(['exec','infra-web-1'])
old=hashes(['exec','infra-web-1']);new=hashes(['run','--rm','--entrypoint','',candidate]);changed=sorted(k for k,v in new.items() if old.get(k)!=v)
assert set(old)<=set(new);assert changed==sorted(FILES)
api_base=before['containers']['infra-api-1']['image'];api_files=API_PAYLOAD
for name,data in api_files.items():
 p=r/'api'/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(base64.b64decode(data))
(r/'Dockerfile.api').write_text('FROM '+api_base+'\nCOPY api/ /app/apps/api/dist/\n')
subprocess.run(['docker','build','-f',str(r/'Dockerfile.api'),'-t','logoff-api:request-polish',str(r)],check=True,stdout=subprocess.DEVNULL)
api_candidate=d('image','inspect','logoff-api:request-polish','--format','{{.Id}}')
def api_hashes(args):
 return {line.split(maxsplit=1)[1].removeprefix('/app/apps/api/dist/'):line.split()[0] for line in d(*args,'sh','-c','find /app/apps/api/dist -type f -name "*.js" -exec sha256sum {} +').splitlines()}
old_api=api_hashes(['exec','infra-api-1']);new_api=api_hashes(['run','--rm','--entrypoint','',api_candidate])
assert old_api==before['api'];assert set(old_api)==set(new_api);assert sorted(k for k in new_api if old_api[k]!=new_api[k])==sorted(api_files)
subprocess.run(['docker','run','--rm','-i','-e','WMS_FBS_RESHIPMENT_ENABLED=true','--entrypoint','node',api_candidate,'-'],input=base64.b64decode(RUNTIME_TEST),check=True,stdout=subprocess.DEVNULL)
result=dict(passed=True,base=base,candidate=candidate,api=before['containers']['infra-api-1']['image'],changed=changed,hashes=new,apiCandidate=api_candidate,apiHashes=new_api,apiChanged=sorted(api_files))
(r/'verification.json').write_text(json.dumps(result));print(json.dumps(result))
