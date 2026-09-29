"""FIX: web-only navigation overlay, keeping API and all existing assets intact."""
import importlib.util
from pathlib import Path
spec = importlib.util.spec_from_file_location('web_overlay', Path(__file__).with_name('deploy-spirit.py'))
deploy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(deploy)
deploy.ROOT = Path('/opt/logoff-wms-releases/menu-groups-20260929')
deploy.BASE = 'sha256:f5c753588ac493d670144c5adec5b11fdc98b8af64e1ca65ed301c373f22935a'
deploy.API = 'sha256:a83204a8bb4819193a11ba7ba8a3b462c960ef772fc9d659c88a122dfd531f62'
deploy.TAG = 'logoff-web:menu-groups-20260929'
deploy.ROLLBACK = 'logoff-web:before-menu-groups-20260929'
if __name__ == '__main__':
    deploy.main()
