package pro.logoff.wms.tsd.data

import java.util.UUID

data class PendingOperation(
    val operationKey: String,
    val operationType: String,
    val barcode: String,
    val createdAt: Long,
)

class OperationOutbox {
    private val items = mutableListOf<PendingOperation>()

    fun enqueueScan(barcode: String): PendingOperation {
        // Русский комментарий: outbox уже есть в MVP, чтобы offline-режим добавлялся без смены модели операции.
        val operation = PendingOperation(
            operationKey = UUID.randomUUID().toString(),
            operationType = "receipt_scan",
            barcode = barcode,
            createdAt = System.currentTimeMillis(),
        )
        items += operation
        return operation
    }

    fun pending(): List<PendingOperation> = items.toList()
}
