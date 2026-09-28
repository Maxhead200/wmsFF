"""Apply only the reviewed hook to a materialized, baseline-verified runtime.
No network, publication or database writes. Run check-candidate afterwards.
"""
from pathlib import Path
import argparse
parser = argparse.ArgumentParser()
parser.add_argument('--candidate', type=Path, required=True)
parser.add_argument('--compiled-helper', type=Path, required=True)
args = parser.parse_args()
path = args.candidate / 'modules/inventory/confirmed-kiz-composition.js'
text = path.read_text(encoding='utf-8')
anchor = '    const returnedShipments = [];'
if text.count(anchor) != 1 or 'resolveConfirmedPhysicalKiz' in text:
    raise SystemExit('Runtime hook changed or already applied; review required.')
helper = args.compiled_helper.read_bytes()
text = text.replace(anchor, "    // FIX: reconcile the verified physical scan before historical registration guards.\n    await require('./confirmed-kiz-physical-resolution').resolveConfirmedPhysicalKiz(tx, { marks: related, scans, box, auditId: audit.id, startedAt: audit.startedAt }, user);\n" + anchor)
path.write_text(text, encoding='utf-8')
(path.parent / 'confirmed-kiz-physical-resolution.js').write_bytes(helper)
