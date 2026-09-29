"""FIX: isolated Soul quick-access web overlay with rollback."""
import importlib.util
from pathlib import Path
spec = importlib.util.spec_from_file_location('web_overlay', Path(__file__).with_name('deploy-spirit.py'))
deploy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(deploy)
deploy.ROOT = Path('/opt/logoff-wms-releases/soul-quick-20260929')
deploy.BASE = 'sha256:914f67b740f22d4088977955f65966e407624ad2e21dd76bb0ea765ae3f39a40'
deploy.API = 'sha256:a83204a8bb4819193a11ba7ba8a3b462c960ef772fc9d659c88a122dfd531f62'
deploy.TAG = 'logoff-web:soul-quick-20260929'
deploy.ROLLBACK = 'logoff-web:before-soul-quick-20260929'
if __name__ == '__main__':
    deploy.main()
