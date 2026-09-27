# PR339: completed FBO history

One runtime module changed. WMS_INVENTORY_PHYSICAL_RESOLUTION_ENABLED enabled only on our WMS. Shipment/print/billing histories retained; destination stock never credited twice. Web (including PR336), APK215 and other flags retained. Source/runtime parity remains false. Rollback: logoff-api:before-completed-fbo. No migration.
