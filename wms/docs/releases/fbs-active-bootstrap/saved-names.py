# FIX: keep authoritative saved WB warehouse identity in fallback display rows.
from pathlib import Path
import sys
s=Path(sys.argv[1]).read_text(encoding='utf8')
old='                    warehouseId: null,\n                    warehouseName: null,\n                    officeId: null,'
new='                    // FIX: saved routing identity survives the fast display fallback.\n                    warehouseId: link.sellerWarehouseId ?? null,\n                    warehouseName: link.sellerWarehouseName ?? null,\n                    officeId: null,'
assert s.count(old)==1
Path(sys.argv[2]).write_text(s.replace(old,new),encoding='utf8')
