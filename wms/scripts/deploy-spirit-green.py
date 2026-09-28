"""FIX: pinned additive green theme; no API or existing asset replacement."""
import importlib.util, pathlib
spec=importlib.util.spec_from_file_location('spirit_deploy',pathlib.Path(__file__).with_name('deploy-spirit.py'))
deploy=importlib.util.module_from_spec(spec)
spec.loader.exec_module(deploy)
deploy.ROOT=pathlib.Path('/opt/logoff-wms-releases/spirit-green-20260928')
deploy.BASE='sha256:912149dad82a9c0683326f4a66a797b077b65a6fd9e34b9ab3f33f0743ec43cf'
deploy.API='sha256:51484e2ea51ba0ea5594fd0dcd741cfdd2363681fbe7f33333191ae8c93c09b8'
deploy.TAG='logoff-web:spirit-green-20260928'
deploy.ROLLBACK='logoff-web:before-spirit-green-20260928'
if __name__=='__main__': deploy.main()
