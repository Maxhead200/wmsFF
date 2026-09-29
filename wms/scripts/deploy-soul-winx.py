"""FIX: our web-only personal wallpaper and compact request styles."""
import importlib.util
from pathlib import Path
spec = importlib.util.spec_from_file_location('web_overlay', Path(__file__).with_name('deploy-spirit.py'))
deploy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(deploy)
deploy.ROOT = Path('/opt/logoff-wms-releases/soul-winx-20260929')
deploy.BASE = 'sha256:b68067371c31d922da3a4748132143250f73b675da9206b32f3c32d4417be4da'
deploy.API = 'sha256:a83204a8bb4819193a11ba7ba8a3b462c960ef772fc9d659c88a122dfd531f62'
deploy.TAG = 'logoff-web:soul-winx-20260929'
deploy.ROLLBACK = 'logoff-web:before-soul-winx-20260929'
if __name__ == '__main__':
    deploy.main()
