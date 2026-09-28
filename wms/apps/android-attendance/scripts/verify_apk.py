"""Verify the actual installable artifact, not just Gradle source settings."""
import argparse
import pathlib
import re
import subprocess

parser = argparse.ArgumentParser()
parser.add_argument('apk', type=pathlib.Path)
parser.add_argument('--build-tools', required=True, type=pathlib.Path)
args = parser.parse_args()
# TEST: older tablets must not be rejected by the packaged manifest.
badging = subprocess.check_output([str(args.build_tools / 'aapt.exe'), 'dump', 'badging', str(args.apk)], text=True, encoding='utf-8')
minimum = re.search(r"^sdkVersion:'(\d+)'", badging, re.M)
assert minimum and int(minimum[1]) <= 26, 'APK requires a newer system than Android 8 / API 26'
assert "pro.logoff.wms.attendance" in badging
assert "'armeabi-v7a'" in badging and "'arm64-v8a'" in badging, 'Both ARM tablet architectures are required'
subprocess.run([str(args.build_tools / 'apksigner.bat'), 'verify', '--verbose', '--min-sdk-version', '26', str(args.apk)], check=True)
print('PASS: packaged SDK, ARM architectures and APK signature')
