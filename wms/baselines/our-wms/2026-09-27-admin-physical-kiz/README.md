# PR337: administrator physical KIZ reconciliation

Two runtime modules changed. WMS_INVENTORY_PHYSICAL_RESOLUTION_ENABLED enabled only on our WMS. Shipment/print/billing histories retained; destination stock never credited twice. Web (including PR336), APK215 and other flags retained. Source/runtime parity remains false. Rollback: logoff-api:before-admin-physical-337. No migration.
