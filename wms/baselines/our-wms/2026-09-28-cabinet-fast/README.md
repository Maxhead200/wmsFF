# PR364: cabinet loading

Published PR364: cabinet-only compact stock projection and issued/paid invoice list without unused charge metadata. Product display settings expanded above branch tiles and all-client overview; loading/errors visible. Same database snapshot confirms identical balance quantities and visible invoice totals/payments/items. Stock payload 74.7MB to7MB, invoice50.9MB to1.4MB; server6.5s to4.1s and6.7s to0.33s respectively. API2872/web271 passed;113 API tests skipped. Four runtime API modules only; latest Spirit CSS, other assets, flags, APK216 and other containers preserved. Sold WMS untouched. Source parity false.

Rollback tags: logoff-api:before-cabinet-fast and logoff-web:before-cabinet-fast.
