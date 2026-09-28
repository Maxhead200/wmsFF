"""FIX: pinned CSS-only release preserving the newer la_panthera/FBO deployment."""
import importlib.util, pathlib
spec=importlib.util.spec_from_file_location('spirit_deploy',pathlib.Path(__file__).with_name('deploy-spirit.py'))
deploy=importlib.util.module_from_spec(spec)
spec.loader.exec_module(deploy)
deploy.ROOT=pathlib.Path('/opt/logoff-wms-releases/spirit-readable-times-20260928')
deploy.BASE='sha256:5cee65f8c9b91255ee1beb174ef3c232942dfa51559d22c8e457181da47ca570'
deploy.API='sha256:a83204a8bb4819193a11ba7ba8a3b462c960ef772fc9d659c88a122dfd531f62'
deploy.TAG='logoff-web:spirit-readable-times-20260928'
deploy.ROLLBACK='logoff-web:before-spirit-readable-times-20260928'
if __name__=='__main__':deploy.main()
