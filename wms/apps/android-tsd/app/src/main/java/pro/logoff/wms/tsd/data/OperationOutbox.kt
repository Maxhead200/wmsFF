package pro.logoff.wms.tsd.data

import java.util.UUID

data class PendingOperation(
    val operationKey: String,
    val operationType: String,
    val payload: Map<String, String>,
    val createdAt: Long,
)

class OperationOutbox {
    private val items = mutableListOf<PendingOperation>()

    fun enqueueScan(barcode: String): PendingOperation {
        // Русский комментарий: outbox уже есть в MVP, чтобы offline-режим добавлялся без смены модели операции.
        val operation = PendingOperation(
            operationKey = UUID.randomUUID().toString(),
            operationType = "receipt_scan",
            payload = mapOf("barcode" to barcode),
            createdAt = System.currentTimeMillis(),
        )
        items += operation
        return operation
    }

    fun enqueueMove(
        clientId: String,
        barcode: String,
        fromBoxCode: String,
        toBoxCode: String,
        quantity: Int,
    ): PendingOperation {
        val operation = PendingOperation(
            operationKey = UUID.randomUUID().toString(),
            operationType = "move_scan",
            // Русский комментарий: payload совпадает с backend DTO, чтобы offline outbox не требовал трансформаций при sync.
            payload = mapOf(
                "clientId" to clientId,
                "barcode" to barcode,
                "fromBoxCode" to fromBoxCode,
                "toBoxCode" to toBoxCode,
                "quantity" to quantity.toString(),
            ),
            createdAt = System.currentTimeMillis(),
        )
        items += operation
        return operation
    }

    fun pending(): List<PendingOperation> = items.toList()
}
