"""FIX: pinned additive orange theme; no API or existing asset replacement."""
import importlib.util, pathlib
spec=importlib.util.spec_from_file_location('spirit_deploy',pathlib.Path(__file__).with_name('deploy-spirit.py'))
deploy=importlib.util.module_from_spec(spec)
spec.loader.exec_module(deploy)
deploy.ROOT=pathlib.Path('/opt/logoff-wms-releases/spirit-orange-20260928')
deploy.BASE='sha256:ebd933aef735ee17d2721121a939c715797c14c7e958fbdd7f1abff9f9cc358c'
deploy.API='sha256:2c5e58b7d57ac148e1bb8e6068c305b52679210eba74a68f8d2401da8a6a5ea2'
deploy.TAG='logoff-web:spirit-orange-20260928'
deploy.ROLLBACK='logoff-web:before-spirit-orange-20260928'
if __name__=='__main__': deploy.main()
