# PR358: client product display

Published PR358: per-client selection of name, article, barcode, size and color in assembly/packing WMS and Android TSD. Default behavior retained until explicitly configured. WMS_CLIENT_PRODUCT_DISPLAY_ENABLED=true only on our WMS. SystemSetting storage, no migration or preference writes during release. Raw scanner fields, cached plans, print labels and Excel unchanged. API2868/web266/Android220 passed; API113 skipped. Runtime and browser graph checks passed; APK216 signature matches215 and DEX checks passed. Public assets/APK, exact API/web hashes, settings read and unauthenticated HTTP401 verified. Sold WMS and other containers untouched. Source parity remains false; source reference historical. Physical TSD interaction pending.

Rollback tags: logoff-api:before-client-display-216 and logoff-web:before-client-display-216.
