"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cancelledWithoutSale = exports.cancelledKizReviewEnabled = void 0;
exports.releaseCancelledBindings = releaseCancelledBindings;
const common_1 = require("@nestjs/common");
const kiz_sorting_return_proof_1 = require("./kiz-sorting-return-proof");
const kiz_sorting_return_proof_2 = require("./kiz-sorting-return-proof");
// FIX: opt-in for our WMS. Unknown circulation permits human review, never automatic reuse.
const cancelledKizReviewEnabled = () => process.env.WMS_KIZ_CANCELLED_ADMIN_REUSE_ENABLED === 'true';
exports.cancelledKizReviewEnabled = cancelledKizReviewEnabled;
const cancelledWithoutSale = (status) => ['canceled', 'canceled_by_client', 'declined_by_client'].includes(status ?? '');
exports.cancelledWithoutSale = cancelledWithoutSale;
// FIX: preserve shipment records and the complete historical task before releasing its unique live slot.
// The caller must first check admin rights, current unit/box/balance and confirmation of physical presence.
async function releaseCancelledBindings(tx, clientId, kiz, evidence, userId, reviewId, excludedTaskId = '', physicalConfirmation = false) {
    const conflict = () => new common_1.ConflictException('КИЗ занят другой сборкой или отмена прежнего заказа не подтверждена. Обновите проверку.');
    // FIX: only the authenticated, confirmed manager action may review unknown WB history.
    const physicalReview = physicalConfirmation && process.env.WMS_KIZ_PHYSICAL_REVIEW_ENABLED === 'true';
    const age = Date.now() - Date.parse(evidence.checkedAt);
    if (!(0, exports.cancelledKizReviewEnabled)() || evidence.decision !== 'REVIEW' ||
        ['RETIRED', 'WRITTEN_OFF'].includes(evidence.circulation ?? '') || !Number.isFinite(age) || age < 0 || age > 60000 ||
        !evidence.orders.length || (!physicalReview && !evidence.orders.every(o => o.verified)))
        throw conflict();
    const identity = (0, kiz_sorting_return_proof_2.manualKizIdentity)(kiz);
    if (!identity)
        throw conflict();
    await tx.$queryRaw `SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${identity},0))`;
    const links = (await tx.fbsTsdAssembly.findMany({ where: { clientId, id: { not: excludedTaskId },
            OR: (0, kiz_sorting_return_proof_2.manualKizPrefixes)(identity).map(p => ({ kiz: { startsWith: p } })) } })).filter(t => (0, kiz_sorting_return_proof_2.manualKizIdentity)(t.kiz ?? '') === identity);
    const requests = await tx.clientRequest.findMany({ where: { clientId, id: { in: links.map(t => t.requestId) }, status: { in: ['DONE', 'CANCELLED', 'REJECTED'] } } });
    if (links.some(t => (t.status !== 'COMPLETED' && !(physicalReview && t.status === 'RELEASED')) || !t.completedAt || !requests.some(r => r.id === t.requestId) ||
        !evidence.orders.some(o => o.orderId === t.orderId)))
        throw conflict();
    const cancelled = evidence.orders.every(o => o.verified && o.supplierStatus === 'cancel' && (0, exports.cancelledWithoutSale)(o.wbStatus));
    const eligibleSortingStatus = evidence.orders.every(o => (o.verified && o.supplierStatus === 'cancel' && (0, exports.cancelledWithoutSale)(o.wbStatus)) ||
        (o.verified && o.supplierStatus === 'complete' && o.wbStatus === 'sorted'));
    const uncertainHistory = physicalReview && evidence.orders.every(o => !o.verified ||
        (o.supplierStatus === 'cancel' && (0, exports.cancelledWithoutSale)(o.wbStatus)) ||
        (o.supplierStatus === 'complete' && o.wbStatus === 'sorted'));
    // FIX: require physical return evidence for released historical bindings.
    const released = links.some(t => t.status === 'RELEASED');
    const proof = (!cancelled || released) && ((eligibleSortingStatus && process.env.WMS_KIZ_SORTING_ADMIN_REUSE_ENABLED === 'true') || uncertainHistory)
        ? await (0, kiz_sorting_return_proof_1.findSortingReturnProof)(tx, clientId, identity, links) : null;
    if ((!cancelled || released) && !proof)
        throw conflict();
    for (const old of links) {
        const history = await tx.shippedKizHistory.findMany({ where: { clientId, orderId: old.orderId, requestId: old.requestId,
                OR: (0, kiz_sorting_return_proof_2.manualKizPrefixes)(identity).map(p => ({ kiz: { startsWith: p } })) } });
        if (!history.some(h => (0, kiz_sorting_return_proof_2.manualKizIdentity)(h.kiz) === identity))
            throw conflict();
        await tx.auditLog.create({ data: { userId, action: proof && physicalReview ? 'KIZ_PHYSICAL_BINDING_ARCHIVED' : proof ? 'KIZ_SORTING_BINDING_ARCHIVED' : 'KIZ_CANCELLED_BINDING_ARCHIVED', entity: 'FbsTsdAssembly', entityId: old.id,
                payload: JSON.parse(JSON.stringify({ reviewId, kizIdentity: identity, evidence, physicalConfirmation: physicalReview, sortingProof: proof, before: old })) } });
        const changed = await tx.fbsTsdAssembly.updateMany({ where: { id: old.id, clientId, status: old.status, kiz: old.kiz, updatedAt: old.updatedAt }, data: { kiz: null } });
        if (changed.count !== 1)
            throw conflict();
    }
}
