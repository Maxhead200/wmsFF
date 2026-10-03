import importlib.util
import pathlib
import unittest

# TEST: a download-only release must reject any unrelated file drift.
class ReleaseTest(unittest.TestCase):
    def test_delta_is_exact(self):
        path = pathlib.Path(__file__).parents[1] / 'mobile-apk-release.py'
        spec = importlib.util.spec_from_file_location('release', path)
        release = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(release)
        before = {'index.html': 'a', 'app.apk': 'b', 'app.json': 'c'}
        expected = {'app.apk': 'd', 'app.json': 'e'}
        release.verify(before, {**before, **expected}, expected)
        for after in ({**before, **expected, 'index.html': 'bad'}, {**before, **expected, 'extra': 'x'}, before):
            with self.assertRaises(RuntimeError):
                release.verify(before, after, expected)

if __name__ == '__main__': unittest.main()
