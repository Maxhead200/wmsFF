"""FIX: appearance-only overlay with pinned images and rollback."""
import importlib.util
from pathlib import Path
spec = importlib.util.spec_from_file_location('web_overlay', Path(__file__).with_name('deploy-spirit.py'))
deploy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(deploy)
deploy.ROOT = Path('/opt/logoff-wms-releases/soul-appearance-20260929')
deploy.BASE = 'sha256:a08f13c476be1d76b1233ee26ea56d2db25189f555c63a3b6a969c084813a8ad'
deploy.API = 'sha256:a83204a8bb4819193a11ba7ba8a3b462c960ef772fc9d659c88a122dfd531f62'
deploy.TAG = 'logoff-web:soul-appearance-20260929'
deploy.ROLLBACK = 'logoff-web:before-soul-appearance-20260929'
if __name__ == '__main__':
    deploy.main()
