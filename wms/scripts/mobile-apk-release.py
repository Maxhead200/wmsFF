"""FIX: pinned download-only LOGOFF release; no API, database or TSD changes."""
import hashlib, json, pathlib, subprocess, urllib.request

ROOT = pathlib.Path('/opt/logoff-wms-releases/mobile-soul-062-20261004')
BASE = 'sha256:8d7bad7bd1c77ee018ba3c0fa67e4b62e9563a9fa0752e71cd9a7cc852b18ca4'
API = 'sha256:7ff2c21d01327774b1ff328cc9c842ec25b02eef031dbda79753050676dbbd3e'
APK = '2b667f5409b9062cdc1948ab1ad8a20222f7375a84292e1b2b9915a94de899f6'
OLD = '64da5179dea15e760efdf7431a40eccb93e3d6052c5e265c812bfb2a320ccdeb'
TAG = 'logoff-web:mobile-soul-062-20261004'
ROLLBACK = 'logoff-web:before-mobile-soul-062-20261004'
HTML = '/usr/share/nginx/html/'
COMPOSE = ['docker','compose','--project-name','infra','--env-file','/opt/logoff-wms/wms/.env','-f','/opt/logoff-wms/wms/infra/docker-compose.yml']

def run(*args): return subprocess.check_output(args, text=True).strip()
def sha(data): return hashlib.sha256(data).hexdigest()
def hashes(container):
    return dict((line.split('  ',1)[1],line.split('  ',1)[0]) for line in run('docker','exec',container,'find',HTML,'-type','f','-exec','sha256sum','{}',';').splitlines())
def verify(before, after, expected):
    if set(before) != set(after): raise RuntimeError('Unexpected file addition/removal')
    for name, digest in before.items():
        if after[name] != expected.get(name,digest): raise RuntimeError('Unexpected file content: '+name)
def main():
    import fcntl
    with open('/opt/logoff-wms/.release.lock','a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        if run('docker','inspect','--format','{{.Image}}','infra-web-1') != BASE: raise RuntimeError('Web drift')
        if run('docker','inspect','--format','{{.Image}}','infra-api-1') != API: raise RuntimeError('API drift')
        before = hashes('infra-web-1')
        apk_path = HTML+'downloads/logoff-wms-mobile.apk'
        json_path = HTML+'downloads/logoff-wms-mobile.json'
        if before[apk_path] != OLD: raise RuntimeError('Published APK drift')
        if sha((ROOT/'logoff-wms-mobile.apk').read_bytes()) != APK: raise RuntimeError('Candidate mismatch')
        metadata = json.loads(run('docker','exec','infra-web-1','cat',json_path))
        if metadata['versionCode'] != 24: raise RuntimeError('Published version drift')
        metadata.update(versionCode=25,versionName='0.6.2-soul',mandatory=False,
            releaseNotes='Soul: нативные корректировки счетов, закрытие периодов и редактирование реквизитов клиентов с проверкой прав и подтверждением. Промежуточная версия: перенос всех функций продолжается.')
        (ROOT/'logoff-wms-mobile.json').write_text(json.dumps(metadata,ensure_ascii=False,indent=2)+'\n')
        expected = {apk_path: APK,json_path: sha((ROOT/'logoff-wms-mobile.json').read_bytes())}
        before_ids = {name: run('docker','inspect','--format','{{.Id}}',name) for name in run('docker','ps','--format','{{.Names}}').splitlines() if name != 'infra-web-1'}
        run('docker','cp','infra-web-1:'+HTML+'downloads',str(ROOT/'downloads-before'))
        (ROOT/'before.json').write_text(json.dumps(before))
        (ROOT/'Dockerfile').write_text('FROM '+BASE+'\nCOPY logoff-wms-mobile.apk logoff-wms-mobile.json '+HTML+'downloads/\n')
        subprocess.run(['docker','build','--network','none','-t',TAG,str(ROOT)],check=True)
        candidate=run('docker','create','--network','none',TAG)
        try:
            run('docker','start',candidate)
            verify(before,hashes(candidate),expected)
        finally: run('docker','rm','-f',candidate)
        run('docker','tag',BASE,ROLLBACK)
        try:
            run('docker','tag',TAG,'infra-web')
            subprocess.run(COMPOSE+['up','-d','--no-deps','--no-build','--pull','never','--force-recreate','web'],check=True)
            verify(before,hashes('infra-web-1'),expected)
            for name, cid in before_ids.items():
                if run('docker','inspect','--format','{{.Id}}',name)!=cid: raise RuntimeError('Other container changed: '+name)
            for name,digest in expected.items():
                with urllib.request.urlopen('https://wms.logoff.pro/'+name.removeprefix(HTML)+'?release=062',timeout=30) as response:
                    if sha(response.read())!=digest: raise RuntimeError('Public digest mismatch')
        except Exception:
            run('docker','tag',BASE,'infra-web')
            subprocess.run(COMPOSE+['up','-d','--no-deps','--no-build','--pull','never','--force-recreate','web'],check=True)
            raise
        result={'version':'0.6.2-soul','web':run('docker','inspect','--format','{{.Image}}','infra-web-1'),'api':API,'apkSha256':APK,'rollback':ROLLBACK,'unchangedFiles':len(before)-2,'otherContainersUnchanged':len(before_ids),'physicalDeviceVerified':False}
        (ROOT/'published.json').write_text(json.dumps(result,indent=2))
        print(json.dumps(result))
if __name__=='__main__': main()
