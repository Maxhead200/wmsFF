"""FIX: billing web-only release with runtime pins, asset preservation and rollback."""
import importlib.util
from pathlib import Path
spec = importlib.util.spec_from_file_location('web_overlay', Path(__file__).with_name('deploy-spirit.py'))
deploy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(deploy)
deploy.ROOT = Path('/opt/logoff-wms-releases/billing-opening-20260929')
deploy.BASE = 'sha256:d30684a059a1683a70d2014149f1cc95f4a7be1621304de06f1cad1c03c92e65'
deploy.API = 'sha256:a83204a8bb4819193a11ba7ba8a3b462c960ef772fc9d659c88a122dfd531f62'
deploy.TAG = 'logoff-web:billing-opening-20260929'
deploy.ROLLBACK = 'logoff-web:before-billing-opening-20260929'
if __name__ == '__main__':
    deploy.main()
