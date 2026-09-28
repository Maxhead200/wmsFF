"""FIX: additive standalone tilt; preserve client-display and current API."""
import importlib.util, pathlib
spec=importlib.util.spec_from_file_location('spirit_deploy',pathlib.Path(__file__).with_name('deploy-spirit.py'))
deploy=importlib.util.module_from_spec(spec)
spec.loader.exec_module(deploy)
deploy.ROOT=pathlib.Path('/opt/logoff-wms-releases/spirit-tilt-20260928')
deploy.BASE='sha256:032a08e40a24f0a975916306d9231d3b2e48c57cf5e896ebd2f9448078046895'
deploy.API='sha256:09a4f4cc84a4ad1bb08279f8c2c236ab679accf7f1a50131c8e990647cd10cfb'
deploy.TAG='logoff-web:spirit-tilt-20260928'
deploy.ROLLBACK='logoff-web:before-spirit-tilt-20260928'
if __name__=='__main__': deploy.main()
