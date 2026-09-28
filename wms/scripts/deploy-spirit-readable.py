"""FIX: pinned CSS-only release preserving the newer la_panthera/FBO deployment."""
import importlib.util, pathlib
spec=importlib.util.spec_from_file_location('spirit_deploy',pathlib.Path(__file__).with_name('deploy-spirit.py'))
deploy=importlib.util.module_from_spec(spec)
spec.loader.exec_module(deploy)
deploy.ROOT=pathlib.Path('/opt/logoff-wms-releases/spirit-cambria-20260928')
deploy.BASE='sha256:97781c96c22ef56db57f31f301477b164cde4b525da76e8d5025e5cb19da16dc'
deploy.API='sha256:a83204a8bb4819193a11ba7ba8a3b462c960ef772fc9d659c88a122dfd531f62'
deploy.TAG='logoff-web:spirit-cambria-20260928'
deploy.ROLLBACK='logoff-web:before-spirit-cambria-20260928'
if __name__=='__main__':deploy.main()
