# TEST: exact scope of compose enablement and undeclared runtime changes.
import ast, pathlib, re, unittest
source=pathlib.Path(__file__).parents[1]/'deploy-billing-settlements.py'
tree=ast.parse(source.read_text())
ns={'re':re}
exec(compile(ast.Module(body=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in ['enable','verify']],type_ignores=[]),str(source),'exec'),ns)
class BillingDeployTest(unittest.TestCase):
    def test_enable_only_our_api(self):
        before='services:\n  api:\n    restart: unless-stopped\n    env_file:\n      - ../.env\n  web:\n    restart: unless-stopped\n'
        after=ns['enable'](before)
        self.assertEqual(after.replace('    environment:\n      WMS_BILLING_SETTLEMENTS_ENABLED: "true"\n',''),before)
        self.assertEqual(after.count('WMS_BILLING_SETTLEMENTS_ENABLED'),1)
        with self.assertRaises(RuntimeError):ns['enable'](after)
    def test_reject_unrelated_environment(self):
        with self.assertRaises(RuntimeError):ns['enable']('  api:\n    restart: unless-stopped\n    environment:\n      OTHER: true\n')
    def test_delta_guard(self):
        ns['verify']({'old':'a','changed':'b'},{'old':'a','changed':'c','new':'d'},{'changed':'c','new':'d'})
        with self.assertRaises(RuntimeError):ns['verify']({'old':'a'},{'old':'b'},{})
        with self.assertRaises(RuntimeError):ns['verify']({'old':'a'},{},{})
if __name__=='__main__':unittest.main()
