"""FIX: only CSS over current inventory-week deployment; API unchanged."""
import importlib.util, pathlib
spec=importlib.util.spec_from_file_location('spirit_deploy',pathlib.Path(__file__).with_name('deploy-spirit.py'))
deploy=importlib.util.module_from_spec(spec)
spec.loader.exec_module(deploy)
deploy.ROOT=pathlib.Path('/opt/logoff-wms-releases/spirit-depth-20260928')
deploy.BASE='sha256:0c52bd5273ae6e32eaeefe356bcb71e6440e3e266e3b50a4f21815ef01b6eba2'
deploy.API='sha256:882d31805242c776406f5f9fb8ed7e6887a33b07be9343c9abe14457dcc89c6c'
deploy.TAG='logoff-web:spirit-depth-20260928'
deploy.ROLLBACK='logoff-web:before-spirit-depth-20260928'
if __name__=='__main__': deploy.main()
