"""FIX: isolated web overlay, pinned images, retained assets and automatic rollback."""
import importlib.util
from pathlib import Path
spec = importlib.util.spec_from_file_location('web_overlay', Path(__file__).with_name('deploy-spirit.py'))
deploy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(deploy)
deploy.ROOT = Path('/opt/logoff-wms-releases/themes-retired-20260929')
deploy.BASE = 'sha256:d273778b7c16dbe74c56a488bb4525f23f3535490308e6a657adda78fd7dbd01'
deploy.API = 'sha256:a83204a8bb4819193a11ba7ba8a3b462c960ef772fc9d659c88a122dfd531f62'
deploy.TAG = 'logoff-web:themes-retired-20260929'
deploy.ROLLBACK = 'logoff-web:before-themes-retired-20260929'
if __name__ == '__main__':
    deploy.main()
