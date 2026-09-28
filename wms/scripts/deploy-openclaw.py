"""FIX: publish a narrowly verified OpenClaw overlay only to our WMS."""
import hashlib, json, pathlib, re, shutil, subprocess, sys, time, urllib.request
ROOT=pathlib.Path('/opt/logoff-wms-releases/openclaw-wms-20260928')
COMPOSE_FILE=pathlib.Path('/opt/logoff-wms/wms/infra/docker-compose.yml')
COMPOSE=['docker','compose','--project-name','infra','--env-file','/opt/logoff-wms/wms/.env','-f',str(COMPOSE_FILE)]
def run(*args):return subprocess.check_output(args,text=True).strip()
def sha(b):return hashlib.sha256(b).hexdigest()
def image(n):return run('docker','inspect','--format','{{.Image}}',n)
def hashes(n,folder):
    return {line.split('  ',1)[1][len(folder)+1:]:line.split('  ',1)[0] for line in run('docker','exec',n,'find',folder,'-type','f','-exec','sha256sum','{}',';').splitlines()}
def verify_delta(before,after,allowed):
    if set(before)-set(after):raise RuntimeError('Published files removed')
    changed={n for n,d in after.items() if before.get(n)!=d}
    if changed!=set(allowed):raise RuntimeError('Unexpected runtime delta '+str(changed.symmetric_difference(allowed)))
    for n,d in allowed.items():
        if after.get(n)!=d:raise RuntimeError('Candidate checksum mismatch '+n)
def add_env_file(text):
    # Keep the original compose byte-for-byte apart from one private env-file entry.
    matches=list(re.finditer(r'^  api:\s*\n(.*?)(?=^  \S|\Z)',text,re.M|re.S))
    if len(matches)!=1:raise RuntimeError('Ambiguous API compose block')
    m=matches[0];block=m.group(0);needle='    env_file:\n      - ../.env\n'
    if block.count(needle)!=1:raise RuntimeError('API env_file layout drift')
    patch=block.replace(needle,needle+'      - /etc/wms-openclaw/wms-api.env\n')
    result=text[:m.start()]+patch+text[m.end():]
    if result.replace('      - /etc/wms-openclaw/wms-api.env\n','')!=text:raise RuntimeError('Unrelated compose change')
    return result
def wait_health():
    for attempt in range(60):
        try:
            with urllib.request.urlopen('https://wms.logoff.pro/api/v1/health',timeout=10) as r:
                if r.status==200:return
        except Exception:pass
        time.sleep(1)
    raise RuntimeError('API health did not recover')
def main():
    import fcntl
    manifest=json.loads((ROOT/'baseline-v2/manifest.json').read_text());bases={n:v['image'] for n,v in manifest['containers'].items()}
    api_proof=json.loads((ROOT/'api/proof.json').read_text());web_proof=json.loads((ROOT/'web/proof.json').read_text())
    with open('/opt/logoff-wms/.release.lock','a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        for n,d in bases.items():
            if image(n)!=d:raise RuntimeError('Production changed: '+n)
        before_api=hashes('infra-api-1','/app/apps/api/dist');before_web=hashes('infra-web-1','/usr/share/nginx/html')
        if before_api!=manifest['artifacts']['api-runtime.tar.gz']['files']:raise RuntimeError('Baseline runtime drift')
        if before_web['index.html']!=web_proof['indexBeforeSha']:raise RuntimeError('Web index drift')
        for v in web_proof['files'].values():
            if before_web['assets/'+v['original']]!=v['originalSha256']:raise RuntimeError('Web graph drift')
        api_payload=ROOT/'api-payload';web_payload=ROOT/'web-payload'
        api_payload.mkdir(exist_ok=True);(web_payload/'assets').mkdir(parents=True,exist_ok=True)
        for n,d in api_proof.items():
            p=ROOT/'api'/n
            if sha(p.read_bytes())!=d:raise RuntimeError('API upload mismatch')
            dst=api_payload/n;dst.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(p,dst)
        web_allowed={'index.html':web_proof['indexAfterSha']}
        shutil.copyfile(ROOT/'web/index.html',web_payload/'index.html')
        for n,v in web_proof['files'].items():
            p=ROOT/'web'/n
            if sha(p.read_bytes())!=v['sha256']:raise RuntimeError('Web upload mismatch')
            shutil.copyfile(p,web_payload/'assets'/n);web_allowed['assets/'+n]=v['sha256']
        for name,base,payload,folder,allowed,before in [('api',bases['infra-api-1'],'api-payload','/app/apps/api/dist',api_proof,before_api),('web',bases['infra-web-1'],'web-payload','/usr/share/nginx/html',web_allowed,before_web)]:
            dockerfile=ROOT/('Dockerfile.'+name);dockerfile.write_text('FROM '+base+'\nCOPY '+payload+'/ '+folder+'/\n')
            subprocess.run(['docker','build','--network','none','-f',str(dockerfile),'-t','logoff-'+name+':openclaw-20260928',str(ROOT)],check=True)
            cid=run('docker','create','--network','none','--entrypoint','sh','logoff-'+name+':openclaw-20260928','-c','sleep 300')
            try:run('docker','start',cid);verify_delta(before,hashes(cid,folder),allowed)
            finally:run('docker','rm','-f',cid)
            run('docker','tag',base,'logoff-'+name+':before-openclaw-20260928')
        # No database, credentials, or network are available in this candidate check.
        smoke=(ROOT/'openclaw-candidate-smoke.cjs').read_text()
        print(run('docker','run','--rm','--network','none','--workdir','/app/apps/api','--entrypoint','node','logoff-api:openclaw-20260928','-e',smoke))
        if '--prepare-only' in sys.argv:
            print(json.dumps({'prepared':True,'published':False,'baseImages':bases}));return
        old_compose=COMPOSE_FILE.read_text();new_compose=add_env_file(old_compose)
        (ROOT/'compose-before.yml').write_text(old_compose);(ROOT/'compose-before.yml').chmod(0o600)
        token=None
        for line in pathlib.Path('/etc/wms-openclaw/gateway.env').read_text().splitlines():
            if line.startswith('OPENCLAW_GATEWAY_TOKEN='):token=line.split('=',1)[1].strip().strip('"\'')
        if not token or '\n' in token:raise RuntimeError('Gateway credential unavailable')
        private_env=pathlib.Path('/etc/wms-openclaw/wms-api.env');private_env.write_text('WMS_OPENCLAW_ENABLED=true\nWMS_OPENCLAW_ACCESS=administrators\nWMS_OPENCLAW_URL=http://172.18.0.1:18789\nWMS_OPENCLAW_TOKEN='+token+'\n');private_env.chmod(0o600)
        run('systemctl','enable','wms-openclaw');run('systemctl','is-active','wms-openclaw')
        try:
            COMPOSE_FILE.write_text(new_compose)
            for name in ['api','web']:run('docker','tag','logoff-'+name+':openclaw-20260928','infra-'+name)
            subprocess.run(COMPOSE+['up','-d','--no-deps','--no-build','--pull','never','--force-recreate','api','web'],check=True)
            wait_health();verify_delta(before_api,hashes('infra-api-1','/app/apps/api/dist'),api_proof);verify_delta(before_web,hashes('infra-web-1','/usr/share/nginx/html'),web_allowed)
            for url,digest in {'/':web_proof['indexAfterSha'],**{'/assets/'+n:v['sha256'] for n,v in web_proof['files'].items()}}.items():
                with urllib.request.urlopen('https://wms.logoff.pro'+url,timeout=20) as r:
                    if sha(r.read())!=digest:raise RuntimeError('Public asset mismatch '+url)
        except Exception:
            COMPOSE_FILE.write_text(old_compose)
            for name in ['api','web']:run('docker','tag',bases['infra-'+name+'-1'],'infra-'+name)
            subprocess.run(COMPOSE+['up','-d','--no-deps','--no-build','--pull','never','--force-recreate','api','web'],check=True)
            raise
        result={'api':image('infra-api-1'),'web':image('infra-web-1'),'apiChangedFiles':list(api_proof),'webOldAssetsPreserved':len(before_web)-1,'openclawEnabled':True,'rollback':['logoff-api:before-openclaw-20260928','logoff-web:before-openclaw-20260928']}
        (ROOT/'published.json').write_text(json.dumps(result));print(json.dumps(result))
if __name__=='__main__':main()
