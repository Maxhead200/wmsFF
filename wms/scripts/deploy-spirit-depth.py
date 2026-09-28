"""FIX: only CSS over current inventory-week deployment; API unchanged."""
import importlib.util, pathlib
spec=importlib.util.spec_from_file_location('spirit_deploy',pathlib.Path(__file__).with_name('deploy-spirit.py'))
deploy=importlib.util.module_from_spec(spec)
spec.loader.exec_module(deploy)
deploy.ROOT=pathlib.Path('/opt/logoff-wms-releases/spirit-depth-20260928')
deploy.BASE='sha256:d204e622e626f793f63d733fa9efea41e701f3f77d2e10a506f8c8a138c83d59'
deploy.API='sha256:09a4f4cc84a4ad1bb08279f8c2c236ab679accf7f1a50131c8e990647cd10cfb'
deploy.TAG='logoff-web:spirit-depth-20260928'
deploy.ROLLBACK='logoff-web:before-spirit-depth-20260928'
if __name__=='__main__': deploy.main()
