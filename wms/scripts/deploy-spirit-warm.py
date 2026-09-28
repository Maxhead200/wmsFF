"""FIX: pin warm Spirit overlay to published payroll352, retaining its API."""
import importlib.util, pathlib
spec=importlib.util.spec_from_file_location('spirit_deploy',pathlib.Path(__file__).with_name('deploy-spirit.py'))
deploy=importlib.util.module_from_spec(spec)
spec.loader.exec_module(deploy)
deploy.ROOT=pathlib.Path('/opt/logoff-wms-releases/spirit-warm-20260928')
deploy.BASE='sha256:c958929305d4139a6f884cd2f6742a598c2cb307701d36a613aef01505e7a04e'
deploy.API='sha256:edaec90e3b3b9e777c0dc9d4f3083a4ad9fe60036a454c6e0022f016b629797b'
deploy.TAG='logoff-web:spirit-warm-20260928'
deploy.ROLLBACK='logoff-web:before-spirit-warm-20260928'
if __name__=='__main__': deploy.main()
