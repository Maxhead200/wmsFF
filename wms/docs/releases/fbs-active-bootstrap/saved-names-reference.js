// FIX: extracted verified runtime method for regression testing.
class Reference {
    async loadFbsTsdRequestOrders(clientId, requestId, filterSkuIds, displayOnly = false) {
        const requestedSkuIds = uniqueStrings(filterSkuIds ?? []);
        const [client, connections, deliveryPlan, links] = await Promise.all([
            Promise.resolve().then(() => this.prisma.client.findUnique({
                where: { id: clientId },
                select: { id: true, code: true, name: true },
            })),
            Promise.resolve().then(() => this.prisma.clientMarketplaceConnection.findMany({
                where: {
                    clientId,
                    // FIX: A selected WMS request may contain either WB or Ozon orders.
                    marketplace: { in: [client_1.MarketplaceType.WILDBERRIES, client_1.MarketplaceType.OZON, ...(displayOnly ? [client_1.MarketplaceType.YANDEX_MARKET] : [])] },
                    isActive: true,
                },
                select: { id: true, marketplace: true, accountName: true },
                orderBy: [{ accountName: 'asc' }, { createdAt: 'asc' }],
            })),
            Promise.resolve().then(() => this.loadFbsDeliveryPlan(clientId)),
            Promise.resolve().then(() => this.prisma.fbsOrderRequestLink.findMany({
                where: {
                    clientId,
                    // FIX: scope the saved order links, never the marketplace cabinet.
                    // This keeps the direct TSD box check local to the selected request.
                    ...(requestId ? { requestId } : {}),
                    // FIX: Restore Ozon orders from the selected WMS request as well.
                    marketplace: { in: [client_1.MarketplaceType.WILDBERRIES, client_1.MarketplaceType.OZON] },
                    syncStatus: FBS_REQUEST_LINK_ACTIVE,
                    // FIX: a direct box scan needs only orders for SKUs physically found
                    // in that box, not every item in a 500+ unit request.
                    lastSkuId: requestedSkuIds.length > 0
                        ? { in: requestedSkuIds }
                        : { not: null },
                    lastCategory: { not: 'cancelled' },
                    request: {
                        status: {
                            notIn: [
                                client_1.ClientRequestStatus.DONE,
                                client_1.ClientRequestStatus.CANCELLED,
                                client_1.ClientRequestStatus.REJECTED,
                            ],
                        },
                    },
                    OR: [
                        {
                            marketplace: client_1.MarketplaceType.WILDBERRIES,
                            lastCategory: 'active',
                            lastSupplierStatus: 'confirm',
                        },
                        {
                            marketplace: client_1.MarketplaceType.OZON,
                            lastCategory: 'active',
                            lastSupplierStatus: 'awaiting_packaging',
                        },
                        {
                            request: {
                                fbsEmergencyAssemblyAt: { not: null },
                            },
                        },
                    ],
                },
                include: {
                    request: {
                        select: {
                            id: true,
                            number: true,
                            title: true,
                            status: true,
                            fbsEmergencyAssemblyAt: true,
                            fbsEmergencyAssemblyByUserId: true,
                            fbsEmergencyAssemblyByName: true,
                            warehouseId: true, // FIX: saved display rows retain their branch scope.
                        },
                    },
                },
                orderBy: { createdAt: 'asc' },
            })),
        ]);
        if (!client) {
            throw new common_1.NotFoundException('Клиент не найден.');
        }
        const connectionById = new Map(connections.map((connection) => [connection.id, connection]));
        const relevantLinks = links.filter((link) => connectionById.has(link.connectionId) && !(0, fbs_terminal_queue_1.isFbsTerminalQueueOrder)(link));
        const skuIds = uniqueStrings(relevantLinks.map((link) => link.lastSkuId ?? ''));
        const skus = skuIds.length > 0
            ? await this.prisma.sku.findMany({
                where: { clientId, id: { in: skuIds } },
                select: {
                    id: true,
                    name: true,
                    internalSku: true,
                    clientSku: true,
                    article: true,
                    size: true,
                    needsChestnyZnak: true,
                    isUnmarked: true,
                    barcodes: { select: { value: true } },
                    balances: {
                        where: {
                            quantity: { gt: 0 },
                            boxId: { not: null },
                        },
                        select: {
                            quantity: true,
                            status: true,
                            box: { select: { code: true } },
                        },
                    },
                },
            })
            : [];
        const skuById = new Map(skus.map((sku) => [sku.id, sku]));
        const orders = relevantLinks.flatMap((link) => {
            const sku = link.lastSkuId ? skuById.get(link.lastSkuId) : undefined;
            const connection = connectionById.get(link.connectionId);
            if (!sku || !connection) {
                return [];
            }
            const emergencyAssembly = Boolean(link.request.fbsEmergencyAssemblyAt);
            const supplierStatus = emergencyAssembly ? 'confirm' : link.lastSupplierStatus || 'confirm';
            const wbStatus = link.lastWbStatus || 'waiting';
            return [{
                    id: link.orderId,
                    orderUid: null,
                    connectionId: link.connectionId,
                    accountName: connection.accountName,
                    marketplace: link.marketplace,
                    category: 'active',
                    supplierStatus,
                    wbStatus,
                    statusLabel: fbsStatusLabel(supplierStatus, wbStatus),
                    article: sku.article,
                    nmId: null,
                    chrtId: null,
                    barcodes: uniqueStrings(sku.barcodes.map((barcode) => barcode.value)),
                    itemCount: Math.max(1, link.lastItemCount ?? 1),
                    product: {
                        id: sku.id,
                        name: sku.name,
                        internalSku: sku.internalSku,
                        clientSku: sku.clientSku,
                        article: sku.article,
                        size: sku.size,
                        needsChestnyZnak: sku.needsChestnyZnak,
                        isUnmarked: sku.isUnmarked,
                    },
                    storageBoxes: sku.balances
                        .filter((balance) => balance.box)
                        .map((balance) => ({
                        code: balance.box.code,
                        quantity: balance.quantity,
                        status: balance.status,
                    }))
                        .sort((left, right) => left.code.localeCompare(right.code)),
                    relabeling: null,
                    createdAt: link.createdAt.toISOString(),
                    sellerDate: null,
                    deliveryDate: null,
                    supplyId: link.lastSupplyId,
                    // FIX: saved routing identity survives the fast display fallback.
                    warehouseId: link.sellerWarehouseId ?? null,
                    warehouseName: link.sellerWarehouseName ?? null,
                    officeId: null,
                    cargoType: null,
                    crossBorderType: null,
                    pickupPointShipmentAllowed: false,
                    requiresReshipment: false,
                    shipmentPlan: null,
                    requiredMeta: [],
                    optionalMeta: [],
                    comment: emergencyAssembly
                        ? 'Экстренная локальная сборка: статус Wildberries не изменяется.'
                        : 'Очередь восстановлена из синхронизированной заявки WMS.',
                    request: link.request,
                    billing: null,
                }];
        });
        const fetchedAt = new Date().toISOString();
        return {
            client,
            connected: connections.length > 0,
            connections,
            fetchedAt,
            deliveryPlan,
            counts: {
                active: orders.length,
                shipped: 0,
                cancelled: 0,
                archive: 0,
                all: orders.length,
            },
            orders,
        };
    }
    async mergeSyncedFbsTsdRequestOrders() {}
}
