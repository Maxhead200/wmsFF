import pathlib,subprocess,json,hashlib,base64
r=pathlib.Path('/opt/logoff-wms/wms/work/request-batch-theme');r.mkdir(exist_ok=True)
def d(*a):return subprocess.check_output(['docker',*a],text=True).strip()
before=BEFORE
for kind in ['api','web']:assert d('inspect','infra-'+kind+'-1','--format','{{.Image}}')==before['containers']['infra-'+kind+'-1']['image'],'Runtime changed'
base=before['containers']['infra-web-1']['image']
for name,data in FILES.items():
 p=r/'web'/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(base64.b64decode(data))

(r/'Dockerfile').write_text('FROM '+base+'\nCOPY web/ /usr/share/nginx/html/\n')
subprocess.run(['docker','build','-t','logoff-web:request-batch-theme',str(r)],check=True,stdout=subprocess.DEVNULL)
candidate=d('image','inspect','logoff-web:request-batch-theme','--format','{{.Id}}')
def hashes(container):
 return {line.split(maxsplit=1)[1].removeprefix('/usr/share/nginx/html/'):line.split()[0] for line in d(*container,'sh','-c','find /usr/share/nginx/html -type f -exec sha256sum {} +').splitlines()}
assert hashes(['run','--rm','--entrypoint','',base])==hashes(['exec','infra-web-1'])
old=hashes(['exec','infra-web-1']);new=hashes(['run','--rm','--entrypoint','',candidate]);changed=sorted(k for k,v in new.items() if old.get(k)!=v)
assert set(old)<=set(new);assert changed==sorted(FILES)
# FIX: the archive predicate is the only API runtime change.
api_base=before['containers']['infra-api-1']['image'];api_rel='modules/client-requests/client-requests.service.js'
api_bytes=base64.b64decode(API_FILE)
(r/'api').mkdir(exist_ok=True);(r/'api/client-requests.service.js').write_bytes(api_bytes)
(r/'Dockerfile.api').write_text('FROM '+api_base+'\nCOPY api/client-requests.service.js /app/apps/api/dist/modules/client-requests/client-requests.service.js\n')
subprocess.run(['docker','build','-f',str(r/'Dockerfile.api'),'-t','logoff-api:request-batch-theme',str(r)],check=True,stdout=subprocess.DEVNULL)
api_candidate=d('image','inspect','logoff-api:request-batch-theme','--format','{{.Id}}')
def api_hashes(args):
 return {line.split(maxsplit=1)[1].removeprefix('/app/apps/api/dist/'):line.split()[0] for line in d(*args,'sh','-c','find /app/apps/api/dist -type f -name "*.js" -exec sha256sum {} +').splitlines()}
old_api=api_hashes(['exec','infra-api-1']);new_api=api_hashes(['run','--rm','--entrypoint','',api_candidate])
assert old_api==before['api'];assert set(old_api)==set(new_api);assert [k for k in new_api if old_api[k]!=new_api[k]]==[api_rel]
# TEST: execute the real packaged list method with an in-memory query recorder. No database writes.
test="""const assert=require('node:assert/strict');const {ClientRequestsService}=require('/app/apps/api/dist/modules/client-requests/client-requests.service');let where;const service=new ClientRequestsService({clientRequest:{findMany:async query=>{where=query.where;return[]}}},{resolveClientFilter:()=>({in:['allowed']})},{});const user={roleCodes:['ADMIN'],activeWarehouseId:null,permissionCodes:[]};(async()=>{await service.list({},user);assert.deepEqual(where.status,{notIn:['DONE','CANCELLED','REJECTED']});assert.deepEqual(where.clientId,{in:['allowed']});await service.list({archive:true},user);assert.deepEqual(where.status,{in:['DONE','CANCELLED','REJECTED']});await service.list({status:'REJECTED'},user);assert.equal(where.status,'REJECTED');console.log('PASS archive runtime');})().catch(e=>{console.error(e);process.exit(1)});"""
subprocess.run(['docker','run','--rm','--entrypoint','node',api_candidate,'-e',test],check=True,stdout=subprocess.DEVNULL)
result=dict(passed=True,base=base,candidate=candidate,api=before['containers']['infra-api-1']['image'],changed=changed,hashes=new,apiCandidate=api_candidate,apiHashes=new_api,apiChanged=[api_rel])
(r/'verification.json').write_text(json.dumps(result));print(json.dumps(result))
