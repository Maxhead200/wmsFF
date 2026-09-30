// FIX: changed runtime methods; build.py applies exact production delta.
module.exports = class SourceReference {
    async listFbsOrdersForDisplay(clientId, user, refresh = false, allBranches = false, displayWarehouseId) {
        const id = clientId?.trim();
        if (!id)
            throw new common_1.BadRequestException('Выберите клиента для просмотра заказов FBS.');
        this.clientScopes.requireClientAccess(user, id, 'read');
        const operational = this.fbsOrdersCache.get(id);
        const display = this.fbsDisplayCache.get(id)?.value;
        const value = display && operational
            ? (Date.parse(display.fetchedAt) >= Date.parse(operational.value.fetchedAt)
                ? this.mergeIncrementalFbsOrders(operational.value, display)
                : this.mergeIncrementalFbsOrders(display, operational.value))
            : display ?? operational?.value;
        if (refresh || !value || Date.now() - Date.parse(value.fetchedAt) >= FBS_ORDERS_CACHE_TTL_MS) {
            this.fbsDisplayCache.refresh(id, () => (0, wildberries_request_scheduler_1.runWithWildberriesRequestPriority)('background', () => this.loadFbsOrders(id, undefined, { historyMode: 'active-only', readOnly: true, billingMode: 'skip' })), refresh);
        }
        // A cold start shows only saved active WMS requests, not a complete WB snapshot.
        const local = value ? await this.mergeSyncedFbsTsdRequestOrders(id, value)
            : await this.loadFbsTsdRequestOrders(id, undefined, undefined, true);
        const scoped = await this.scopeFbsOrdersForUser(local, user, allBranches, displayWarehouseId);
        const state = this.fbsDisplayCache.get(id);
        // FIX: warnings follow the same branch scope as the visible cabinets.
        const visibleConnections = new Set(scoped.connections.map(connection => connection.id));
        const connectionErrors = (scoped.connectionErrors ?? []).filter(error => visibleConnections.has(error.connectionId));
        return { ...scoped, connectionErrors, fetchedAt: value?.fetchedAt ?? '', sync: {
                refreshing: state?.pending ?? false, partial: !value || connectionErrors.length > 0,
                lastSuccessAt: value?.fetchedAt ?? null, error: state?.error ?? (connectionErrors.length ? connectionErrors.map(error => error.message).join(' ') : null),
            } };
    }
    async listFbsOrders() {}

    async applyLocalWbShipments(clientId, orders, readOnly = false, activeOnly = false) {
        // FIX: recover a committed print acknowledgement if shipment/billing was interrupted afterwards.
        // FIX: historical clients can exceed PostgreSQL's 32767 bind-parameter limit.
        const recorded = new Set((await this.prisma.wbOrderShipment.findMany({ where: { clientId }, select: { assemblyId: true } })).map(fact => fact.assemblyId));
        const currentTasks = await this.prisma.fbsTsdAssembly.findMany({ where: { clientId, marketplace: client_1.MarketplaceType.WILDBERRIES },
            select: { id: true, requestId: true, connectionId: true, orderId: true, completedAt: true } });
        // FIX: screen reads keep recorded shipment facts below, without retrying old write-offs.
        if (!readOnly) {
            const pendingIds = currentTasks.filter(task => !recorded.has(task.id)).map(task => task.id);
            const printed = [];
            for (const ids of chunks(pendingIds, 10000))
                printed.push(...await this.prisma.fbsPrintJob.findMany({
                    where: { status: 'PRINTED', deviceCode: { startsWith: 'SOS-WB:' }, assemblyId: { in: ids } },
                    select: { assemblyId: true, printedAt: true }, distinct: ['assemblyId'], orderBy: { printedAt: 'asc' },
                }));
            for (const print of printed) {
                if (recorded.has(print.assemblyId))
                    continue;
                const task = await this.prisma.fbsTsdAssembly.findUniqueOrThrow({ where: { id: print.assemblyId } });
                try {
                    const order = orders.find(order => order.connectionId === task.connectionId && order.id === task.orderId) ?? await this.localShipmentOrder(task);
                    const statusChanges = [];
                    await this.prisma.$transaction(async (tx) => {
                        await (0, wb_order_stock_lifecycle_1.finalizeWbOrderShipment)(tx, task.id, 'PRINT_CONFIRMED', cleanJson(order), print.printedAt ?? undefined);
                        if (print.printedAt)
                            await (0, fbs_request_auto_status_1.reconcileFbsRequestStatus)(tx, task.requestId, { stage: 'SOS_PRINT', occurredAt: print.printedAt, actorId: task.workerUserId }, statusChanges);
                    }, { timeout: 30_000 });
                    await this.notifyFbsAutoStatusChanges(statusChanges);
                    recorded.add(task.id);
                }
                catch (error) {
                    this.logger.warn(`Printed WB order ${task.orderId} needs stock reconciliation: ${error instanceof Error ? error.message : String(error)}`);
                }
            }
            const doneRequests = [];
            for (const ids of chunks(uniqueStrings(currentTasks.map(task => task.requestId)), 10000)) {
                doneRequests.push(...await this.prisma.clientRequest.findMany({ where: { clientId, status: 'DONE', id: { in: ids } }, select: { id: true } }));
            }
            // FIX: a migrated shipment fact does not prove that its packing ledger was closed.
            if ((0, done_request_packing_1.doneRequestPackingEnabled)()) {
                const residuals = await this.prisma.stockMovement.groupBy({ by: ['sourceDocument'],
                    where: { clientId, status: 'PACKING', sourceDocument: { not: null } },
                    _sum: { quantity: true }, having: { quantity: { _sum: { gt: 0 } } },
                });
                const residualIds = new Set(residuals.map(row => row.sourceDocument));
                for (const request of doneRequests) {
                    if (!residualIds.has(request.id))
                        continue;
                    try {
                        await this.prisma.$transaction(tx => (0, done_request_packing_1.reconcileDoneRequestPacking)(tx, request.id), { timeout: 30_000 });
                    }
                    catch (error) {
                        this.logger.warn(`Done request ${request.id} needs packing reconciliation: ${error instanceof Error ? error.message : String(error)}`);
                    }
                }
            }
            const doneIds = new Set(doneRequests.map(request => request.id));
            const incomingShipped = new Set(orders.filter(order => order.marketplace === client_1.MarketplaceType.WILDBERRIES && order.category === 'shipped')
                .map(order => selectionKey(order.connectionId, order.id)));
            const reconcileIds = currentTasks.filter(task => !recorded.has(task.id) &&
                (incomingShipped.has(selectionKey(task.connectionId, task.orderId)) || (doneIds.has(task.requestId) && task.completedAt))).map(task => task.id);
            const tasks = [];
            for (const ids of chunks(reconcileIds, 10000))
                tasks.push(...await this.prisma.fbsTsdAssembly.findMany({ where: { clientId, id: { in: ids } } }));
            for (const task of tasks) {
                if (recorded.has(task.id))
                    continue;
                const manuallyShipped = doneRequests.some(request => request.id === task.requestId);
                const incoming = orders.find(order => order.connectionId === task.connectionId && order.id === task.orderId && order.category === 'shipped');
                const order = incoming ?? (manuallyShipped ? await this.localShipmentOrder(task) : null);
                if (!order)
                    continue;
                try {
                    await this.prisma.$transaction(tx => (0, wb_order_stock_lifecycle_1.finalizeWbOrderShipment)(tx, task.id, manuallyShipped ? 'WMS_REQUEST_SHIPPED' : 'WB_SHIPMENT_CONFIRMED', cleanJson(order)), { timeout: 30_000 });
                }
                catch (error) {
                    // FIX: missing physical evidence cannot manufacture a stock write-off; next sync retries.
                    this.logger.warn(`WB shipment ${task.orderId} needs reconciliation: ${error instanceof Error ? error.message : String(error)}`);
                }
            }
        }
        const byOrder = new Map(orders.map(order => [selectionKey(order.connectionId, order.id), order]));
        // FIX: an explicit repeat is current physical work; an older shipment must not hide it.
        const currentByOrder = new Map(currentTasks.map(task => [selectionKey(task.connectionId, task.orderId), task.id]));
        const shippedAssemblies = new Set((await this.prisma.wbOrderShipment.findMany({ where: { clientId }, select: { assemblyId: true } })).map(fact => fact.assemblyId));
        // FIX: bound JSON decoding memory independently of accumulated shipment history.
        for (let skip = 0;; skip += 1000) {
            const facts = await this.prisma.wbOrderShipment.findMany({ where: { clientId, ...(activeOnly ? { OR: orders.map(order => ({ connectionId: order.connectionId, orderId: order.id })) } : {}) }, skip, take: 1000,
                orderBy: [{ shippedAt: 'asc' }, { id: 'asc' }],
                select: { assemblyId: true, connectionId: true, orderId: true, orderSnapshot: true, shippedAt: true } });
            for (const fact of facts) {
                const currentId = currentByOrder.get(selectionKey(fact.connectionId, fact.orderId));
                if (currentId && currentId !== fact.assemblyId && !shippedAssemblies.has(currentId))
                    continue;
                const frozen = fact.orderSnapshot;
                // FIX: migrated shipment snapshots can omit identity; durable shipment columns are authoritative.
                byOrder.set(selectionKey(fact.connectionId, fact.orderId), { ...byOrder.get(selectionKey(fact.connectionId, fact.orderId)), ...frozen, id: fact.orderId, connectionId: fact.connectionId, marketplace: client_1.MarketplaceType.WILDBERRIES, category: 'shipped', supplierStatus: 'complete',
                    statusLabel: 'Отгружен из ВМС', deliveryDate: fact.shippedAt.toISOString() });
            }
            if (facts.length < 1000)
                break;
        }
        return [...byOrder.values()];
    }
    async webOrderAssemblyHistory() {}

    async fetchWildberriesFbsOrders(connection, historyMode = 'full') {
        const headers = {
            Authorization: connection.apiKey,
            'Content-Type': 'application/json',
        };
        const cachedHistory = this.wildberriesFbsHistoryCache.get(connection.id);
        // FIX: active display must never await history or expand its status batch to historical orders.
        const historyPromise = historyMode === 'active-only' ? Promise.resolve([]) : cachedHistory && cachedHistory.expiresAt > Date.now()
            ? Promise.resolve(cachedHistory.orders)
            : historyMode === 'cache-only'
                ? Promise.resolve(cachedHistory?.orders ?? [])
                : fetchWildberriesFbsHistory(headers).then((orders) => {
                    const compactOrders = orders.map(compactWildberriesFbsOrder);
                    this.wildberriesFbsHistoryCache.set(connection.id, {
                        expiresAt: Date.now() + this.wildberriesFbsHistoryCacheTtlMs,
                        orders: compactOrders,
                    });
                    return compactOrders;
                });
        const [newResponse, loadedHistoricalOrders, reshipmentResponse, sellerWarehouses] = await Promise.all([
            marketplaceJson('https://marketplace-api.wildberries.ru/api/v3/orders/new', {
                method: 'GET',
                headers,
            }),
            historyPromise,
            marketplaceJson('https://marketplace-api.wildberries.ru/api/v3/supplies/orders/reshipment', {
                method: 'GET',
                headers,
            }),
            this.fetchWildberriesStockWarehouses(connection.apiKey).catch((caught) => {
                const message = caught instanceof Error ? caught.message : String(caught);
                this.logger.warn(`WB seller warehouses are unavailable for ${connection.id}: ${message}`);
                return [];
            }),
        ]);
        const newOrders = asArray(newResponse.orders).map(compactWildberriesFbsOrder);
        const historyById = new Map(loadedHistoricalOrders.map((order) => [textValue(order.id), order]));
        for (const order of newOrders) {
            const id = textValue(order.id);
            if (id)
                historyById.set(id, { ...(historyById.get(id) ?? {}), ...order });
        }
        const historicalOrders = [...historyById.values()];
        if (newOrders.length > 0 && historyMode !== 'active-only') {
            const currentHistory = this.wildberriesFbsHistoryCache.get(connection.id);
            this.wildberriesFbsHistoryCache.set(connection.id, {
                expiresAt: currentHistory?.expiresAt ?? Date.now() + this.wildberriesFbsHistoryCacheTtlMs,
                orders: historicalOrders,
            });
        }
        const sellerWarehouseById = new Map(sellerWarehouses.map((warehouse) => [warehouse.id, warehouse]));
        const reshipmentByOrderId = new Map(asArray(reshipmentResponse.orders).map((item) => [
            textValue(item.orderID) || textValue(item.orderId),
            textValue(item.supplyID) || textValue(item.supplyId),
        ]));
        const ordersById = new Map();
        for (const order of historicalOrders) {
            const id = textValue(order.id);
            if (id) {
                ordersById.set(id, order);
            }
        }
        for (const order of newOrders) {
            const id = textValue(order.id);
            if (id) {
                ordersById.set(id, {
                    ...(ordersById.get(id) ?? {}),
                    ...compactWildberriesFbsOrder(order),
                });
            }
        }
        // FIX: a WB directory outage must not erase known labels. Use only this
        // cabinet's saved routes; live names always win. Sold VM stays opt-out.
        const savedWarehouseNames = new Map();
        if (process.env.WMS_WB_WAREHOUSE_NAME_FALLBACK_ENABLED === 'true') {
            const missingWarehouseIds = uniqueStrings([...ordersById.values()]
                .map((order) => textValue(order.warehouseId))
                .filter((id) => id && !sellerWarehouseById.get(id)?.name?.trim()));
            if (missingWarehouseIds.length > 0) {
                const routes = await this.prisma.fbsWarehouseRoutingRule.findMany({
                    where: { connectionId: connection.id, marketplaceWarehouseId: { in: missingWarehouseIds } },
                    select: { marketplaceWarehouseId: true, marketplaceWarehouseName: true },
                });
                for (const route of routes) {
                    const name = route.marketplaceWarehouseName?.trim();
                    if (name)
                        savedWarehouseNames.set(route.marketplaceWarehouseId, name);
                }
            }
        }
        const ids = [...ordersById.keys()]
            .map((id) => Number(id))
            .filter((id) => Number.isSafeInteger(id) && id > 0);
        const now = Date.now();
        const cachedStatuses = this.wildberriesFbsStatusCache.get(connection.id);
        const hasFreshStatusCache = Boolean(cachedStatuses && cachedStatuses.expiresAt > now);
        const statuses = new Map(hasFreshStatusCache ? cachedStatuses.statuses : []);
        const statusIdsToRefresh = hasFreshStatusCache
            ? ids.filter((id) => {
                const current = statuses.get(String(id));
                return (!current ||
                    fbsOrderCategory(current.supplierStatus, current.wbStatus) === 'active');
            })
            : ids;
        for (const orderIds of chunks(statusIdsToRefresh, 1000)) {
            const response = await marketplaceJson('https://marketplace-api.wildberries.ru/api/v3/orders/status', {
                method: 'POST',
                headers,
                body: JSON.stringify({ orders: orderIds }),
            });
            for (const status of asArray(response.orders)) {
                const id = textValue(status.id);
                if (id) {
                    statuses.set(id, {
                        supplierStatus: textValue(status.supplierStatus),
                        wbStatus: textValue(status.wbStatus),
                    });
                }
            }
        }
        this.wildberriesFbsStatusCache.set(connection.id, {
            expiresAt: hasFreshStatusCache
                ? cachedStatuses.expiresAt
                : now + this.wildberriesFbsStatusCacheTtlMs,
            statuses,
        });
        return [...ordersById.entries()].map(([id, order]) => {
            const status = statuses.get(id);
            const sellerWarehouse = sellerWarehouseById.get(textValue(order.warehouseId));
            return {
                ...order,
                warehouseName: sellerWarehouse?.name?.trim() || savedWarehouseNames.get(textValue(order.warehouseId)) || null,
                connectionId: connection.id,
                accountName: connection.accountName,
                marketplace: client_1.MarketplaceType.WILDBERRIES,
                itemCount: 1,
                requiresReshipment: reshipmentByOrderId.has(id),
                reshipmentSupplyId: reshipmentByOrderId.get(id) || null,
                supplierStatus: status?.supplierStatus || 'new',
                wbStatus: status?.wbStatus || 'waiting',
            };
        });
    }
    async fetchOzonFbsOrders() {}

};