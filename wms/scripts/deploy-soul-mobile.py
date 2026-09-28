"""FIX: CSS-only Soul mobile release; pinned runtime and rollback."""
import importlib.util
from pathlib import Path
spec = importlib.util.spec_from_file_location('web_overlay', Path(__file__).with_name('deploy-spirit.py'))
deploy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(deploy)
deploy.ROOT = Path('/opt/logoff-wms-releases/soul-mobile-20260929')
deploy.BASE = 'sha256:9280e2aa9ad47faf27c4e4b1087995189fbef66debed2bf32dabfa54f4b8013c'
deploy.API = 'sha256:a83204a8bb4819193a11ba7ba8a3b462c960ef772fc9d659c88a122dfd531f62'
deploy.TAG = 'logoff-web:soul-mobile-20260929'
deploy.ROLLBACK = 'logoff-web:before-soul-mobile-20260929'
if __name__ == '__main__':
    deploy.main()
