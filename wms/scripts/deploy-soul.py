"""FIX: pinned, additive Soul web release. API and sold WMS are unchanged."""
import importlib.util
from pathlib import Path

spec = importlib.util.spec_from_file_location('web_overlay', Path(__file__).with_name('deploy-spirit.py'))
deploy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(deploy)
deploy.ROOT = Path('/opt/logoff-wms-releases/soul-live-20260929')
deploy.BASE = 'sha256:d6670224e2817dbcd893912ac1ae5ed773a10771b58c3dcec3278a026d2aae48'
deploy.API = 'sha256:a83204a8bb4819193a11ba7ba8a3b462c960ef772fc9d659c88a122dfd531f62'
deploy.TAG = 'logoff-web:soul-live-20260929'
deploy.ROLLBACK = 'logoff-web:before-soul-live-20260929'
if __name__ == '__main__':
    deploy.main()
