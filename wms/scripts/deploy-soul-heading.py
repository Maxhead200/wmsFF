"""FIX: web-only heading overlay with pinned rollback."""
import importlib.util
from pathlib import Path
spec = importlib.util.spec_from_file_location('web_overlay', Path(__file__).with_name('deploy-spirit.py'))
deploy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(deploy)
deploy.ROOT = Path('/opt/logoff-wms-releases/soul-heading-20260929')
deploy.BASE = 'sha256:1bfff3e962389012de93aa938fcf301e041bfdd061f44c12d46ee432070021e5'
deploy.API = 'sha256:a83204a8bb4819193a11ba7ba8a3b462c960ef772fc9d659c88a122dfd531f62'
deploy.TAG = 'logoff-web:soul-heading-20260929'
deploy.ROLLBACK = 'logoff-web:before-soul-heading-20260929'
if __name__ == '__main__':
    deploy.main()
