# FIX: exact delta against verified deployed runtime; never overwrite with stale source.
from pathlib import Path
import sys
s=Path(sys.argv[1]).read_text(encoding='utf8')
changes=[
("const value = display && (!operational || Date.parse(display.fetchedAt) >= Date.parse(operational.value.fetchedAt))\n            ? display : operational?.value;",
 "const value = display && operational\n            ? (Date.parse(display.fetchedAt) >= Date.parse(operational.value.fetchedAt)\n                ? this.mergeIncrementalFbsOrders(operational.value, display)\n                : this.mergeIncrementalFbsOrders(display, operational.value))\n            : display ?? operational?.value;"),
("this.loadFbsOrders(id, undefined, { readOnly: true, billingMode: 'skip' })",
 "this.loadFbsOrders(id, undefined, { historyMode: 'active-only', readOnly: true, billingMode: 'skip' })"),
("const historyPromise = cachedHistory && cachedHistory.expiresAt > Date.now()",
 "// FIX: active display must never await history or expand its status batch to historical orders.\n        const historyPromise = historyMode === 'active-only' ? Promise.resolve([]) : cachedHistory && cachedHistory.expiresAt > Date.now()"),
("if (newOrders.length > 0) {\n            const currentHistory",
 "if (newOrders.length > 0 && historyMode !== 'active-only') {\n            const currentHistory")]
changes.append(("byOrder.set(selectionKey(fact.connectionId, fact.orderId), { ...frozen, category: 'shipped', supplierStatus: 'complete',",
 "// FIX: migrated shipment snapshots can omit identity; durable shipment columns are authoritative.\n                byOrder.set(selectionKey(fact.connectionId, fact.orderId), { ...byOrder.get(selectionKey(fact.connectionId, fact.orderId)), ...frozen, id: fact.orderId, connectionId: fact.connectionId, marketplace: client_1.MarketplaceType.WILDBERRIES, category: 'shipped', supplierStatus: 'complete',"))
changes.extend([
("async applyLocalWbShipments(clientId, orders, readOnly = false) {","async applyLocalWbShipments(clientId, orders, readOnly = false, activeOnly = false) {"),
("where: { clientId }, skip, take: 1000,","where: { clientId, ...(activeOnly ? { OR: orders.map(order => ({ connectionId: order.connectionId, orderId: order.id })) } : {}) }, skip, take: 1000,"),
("this.applyLocalWbShipments(clientId, ordersWithStockSources, options.readOnly);","this.applyLocalWbShipments(clientId, ordersWithStockSources, options.readOnly, options.historyMode === 'active-only');")
])
for old,new in changes:
 if s.count(old)!=1:raise RuntimeError('Runtime anchor mismatch: '+old[:90])
 s=s.replace(old,new)
Path(sys.argv[2]).write_text(s,encoding='utf8')
