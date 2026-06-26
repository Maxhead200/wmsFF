package pro.logoff.wms.tsd.data

import java.util.UUID

data class PendingOperation(
    val operationKey: String,
    val operationType: String,
    val payload: Map<String, String>,
    val createdAt: Long,
    val status: OperationStatus = OperationStatus.PENDING,
    val attempts: Int = 0,
    val lastMessage: String? = null,
)

data class OperationOutboxCounts(
    val pending: Int,
    val rejected: Int,
)

class OperationOutbox(private val dao: OperationDao) {
    suspend fun enqueueScan(barcode: String): PendingOperation {
        // Русский комментарий: receipt_scan складываем локально, чтобы ТСД работал без связи и синхронизировался позже.
        val operation = PendingOperation(
            operationKey = UUID.randomUUID().toString(),
            operationType = "receipt_scan",
            payload = mapOf("barcode" to barcode),
            createdAt = System.currentTimeMillis(),
        )
        dao.insert(OperationEntity.fromPending(operation))
        return operation
    }

    suspend fun enqueueMove(
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
        dao.insert(OperationEntity.fromPending(operation))
        return operation
    }

    suspend fun pending(limit: Int = 50): List<PendingOperation> =
        dao.findByStatus(OperationStatus.PENDING.name, limit).map { it.toPendingOperation() }

    suspend fun rejected(limit: Int = 25): List<PendingOperation> =
        dao.findByStatus(OperationStatus.REJECTED.name, limit).map { it.toPendingOperation() }

    suspend fun markSynced(operationKey: String, message: String?) {
        val now = System.currentTimeMillis()
        dao.setTerminalStatus(operationKey, OperationStatus.SYNCED.name, message, now, now)
    }

    suspend fun markRejected(operationKey: String, message: String?) {
        dao.setTerminalStatus(operationKey, OperationStatus.REJECTED.name, message, System.currentTimeMillis(), null)
    }

    suspend fun markRetry(operationKey: String, message: String?) {
        dao.setRetryStatus(operationKey, OperationStatus.PENDING.name, message, System.currentTimeMillis())
    }

    suspend fun requeueRejected(): Int =
        dao.requeueRejected(OperationStatus.PENDING.name, OperationStatus.REJECTED.name)

    suspend fun counts(): OperationOutboxCounts =
        OperationOutboxCounts(
            pending = dao.countByStatus(OperationStatus.PENDING.name),
            rejected = dao.countByStatus(OperationStatus.REJECTED.name),
        )
}
