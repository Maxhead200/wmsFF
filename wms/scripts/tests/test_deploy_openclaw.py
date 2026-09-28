# TEST: publication refuses unexpected runtime changes and preserves compose services.
import importlib.util,pathlib,unittest
spec=importlib.util.spec_from_file_location('deploy',pathlib.Path(__file__).parents[1]/'deploy-openclaw.py')
deploy=importlib.util.module_from_spec(spec);spec.loader.exec_module(deploy)
class PublicationTests(unittest.TestCase):
    def test_firewall_is_limited_to_our_private_bridge(self):
        args=deploy.firewall_command('6e8e55f3b697b90820b276497f1b64f2d', '172.18.0.0/16','172.18.0.1')
        self.assertEqual(args,['ufw','allow','in','on','br-6e8e55f3b697','from','172.18.0.0/16','to','172.18.0.1','port','18789','proto','tcp','comment','WMS private OpenClaw gateway'])
        for subnet,gateway in [('0.0.0.0/0','172.18.0.1'),('172.18.0.0/16','0.0.0.0'),('172.19.0.0/16','172.19.0.1')]:
            with self.assertRaises(RuntimeError):deploy.firewall_command('6e8e55f3b697',subnet,gateway)
    def test_rejects_business_file_change(self):
        with self.assertRaises(RuntimeError):deploy.verify_delta({'ai':'a','stock':'b'},{'ai':'c','stock':'wrong'},{'ai':'c'})
        deploy.verify_delta({'ai':'a','stock':'b'},{'ai':'c','stock':'b'},{'ai':'c'})
    def test_compose_changes_only_api_env_file(self):
        before='services:\n  api:\n    env_file:\n      - ../.env\n    restart: always\n  web:\n    image: infra-web\n'
        after=deploy.add_env_file(before)
        self.assertEqual(after.replace('      - /etc/wms-openclaw/wms-api.env\n',''),before)
        with self.assertRaises(RuntimeError):deploy.add_env_file(after)
if __name__=='__main__':unittest.main()
