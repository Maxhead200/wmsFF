"""FIX: deploy only our web read-only wave overview; keep all previous assets."""
import fcntl, hashlib, json, pathlib, subprocess, time, urllib.request
ROOT=pathlib.Path('/opt/logoff-wms-releases/waves-readonly-20260927')
BASE='sha256:597d5e296a51dcbf0d353321461255d3c55e4b8de0225f2732afdbfaf955e71b'
API='sha256:d67de6f69a8ebd5902a913be8662f67ab0e79b6c8d775dc9987bcf8ea13b8c90'
TAG='logoff-web:waves-readonly-20260927'
ROLLBACK='logoff-web:before-waves-readonly-20260927'
COMPOSE=['docker','compose','--project-name','infra','--env-file','/opt/logoff-wms/wms/.env','-f','/opt/logoff-wms/wms/infra/docker-compose.yml']
def run(*a): return subprocess.check_output(a,text=True).strip()
def sha(b): return hashlib.sha256(b).hexdigest()
def image(name): return run('docker','inspect','--format','{{.Image}}',name)
def hashes(cid):
    return {r.split('  ',1)[1]:r.split('  ',1)[0] for r in run('docker','exec',cid,'find','/usr/share/nginx/html','-type','f','-exec','sha256sum','{}',';').splitlines()}
def verify(before,after,added,indexsha):
    for p,d in before.items():
        if p!='/usr/share/nginx/html/index.html' and after.get(p)!=d: raise RuntimeError('Changed old asset '+p)
    if set(after)-set(before)!=set(added): raise RuntimeError('Unexpected asset delta')
    for p,d in added.items():
        if after.get(p)!=d: raise RuntimeError('Incorrect new asset '+p)
    if after.get('/usr/share/nginx/html/index.html')!=indexsha: raise RuntimeError('Index mismatch')
def main():
    with open('/opt/logoff-wms/.release.lock','a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        if image('infra-web-1')!=BASE or image('infra-api-1')!=API: raise RuntimeError('Production changed; rebuild required')
        proof=json.loads((ROOT/'build/proof.json').read_text())
        before=hashes('infra-web-1'); api_id=run('docker','inspect','--format','{{.Id}}','infra-api-1')
        if before['/usr/share/nginx/html/index.html']!=proof['indexBeforeSha']: raise RuntimeError('Live index drift')
        for record in proof['files'].values():
            if before.get('/usr/share/nginx/html/assets/'+record['original'])!=record['originalSha256']: raise RuntimeError('Live chunk drift')
        files={n:v['sha256'] for n,v in proof['files'].items()}
        files['waves-readonly-20260927.css']=proof['cssSha']
        for n,d in files.items():
            if sha((ROOT/'build'/n).read_bytes())!=d: raise RuntimeError('Upload mismatch')
        if sha((ROOT/'build/index.html').read_bytes())!=proof['indexAfterSha']: raise RuntimeError('Uploaded index mismatch')
        added={'/usr/share/nginx/html/assets/'+n:d for n,d in files.items()}
        (ROOT/'before.json').write_text(json.dumps(before))
        (ROOT/'Dockerfile').write_text('FROM '+BASE+'\nCOPY build/index.html /usr/share/nginx/html/index.html\n'+''.join('COPY build/'+n+' /usr/share/nginx/html/assets/'+n+'\n' for n in files))
        subprocess.run(['docker','build','--network','none','-t',TAG,str(ROOT)],check=True)
        cid=run('docker','create','--network','none',TAG)
        try:
            run('docker','start',cid);verify(before,hashes(cid),added,proof['indexAfterSha'])
        finally: run('docker','rm','-f',cid)
        run('docker','tag',BASE,ROLLBACK)
        try:
            run('docker','tag',TAG,'infra-web')
            subprocess.run(COMPOSE+['up','-d','--no-deps','--no-build','--pull','never','--force-recreate','web'],check=True)
            verify(before,hashes('infra-web-1'),added,proof['indexAfterSha'])
            if run('docker','inspect','--format','{{.Id}}','infra-api-1')!=api_id: raise RuntimeError('API restarted')
            targets={'/?waves=20260927':proof['indexAfterSha'],**{'/assets/'+n:d for n,d in files.items()}}
            for url,digest in targets.items():
                for attempt in range(6):
                    try:
                        with urllib.request.urlopen('https://wms.logoff.pro'+url,timeout=15) as response:
                            if sha(response.read())!=digest: raise RuntimeError('Public asset mismatch '+url)
                        break
                    except Exception:
                        if attempt==5: raise
                        time.sleep(1)
        except Exception:
            run('docker','tag',BASE,'infra-web')
            subprocess.run(COMPOSE+['up','-d','--no-deps','--no-build','--pull','never','--force-recreate','web'],check=True)
            raise
        result={'web':image('infra-web-1'),'apiUnchanged':api_id,'oldAssetsPreserved':len(before)-1,'newAssets':len(added),'rollback':ROLLBACK}
        (ROOT/'published.json').write_text(json.dumps(result));print(json.dumps(result))
if __name__=='__main__':main()
