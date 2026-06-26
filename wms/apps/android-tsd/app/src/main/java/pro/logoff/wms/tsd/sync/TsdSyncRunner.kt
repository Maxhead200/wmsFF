package pro.logoff.wms.tsd.sync

import pro.logoff.wms.tsd.data.OperationOutbox
import pro.logoff.wms.tsd.data.PendingOperation
import pro.logoff.wms.tsd.network.TsdOperationRequest
import pro.logoff.wms.tsd.network.TsdSyncRequest
import pro.logoff.wms.tsd.network.WmsApi
import java.time.Instant
import kotlin.coroutines.cancellation.CancellationException

data class TsdSyncSummary(
    val sent: Int,
    val applied: Int,
    val rejected: Int,
    val retried: Int,
    val message: String,
)

class TsdSyncRunner(
    private val outbox: OperationOutbox,
    private val api: WmsApi,
    private val deviceId: String,
) {
    suspend fun syncPending(authorization: String): TsdSyncSummary {
        val operations = outbox.pending()
        if (operations.isEmpty()) {
            return TsdSyncSummary(
                sent = 0,
                applied = 0,
                rejected = 0,
                retried = 0,
                message = "Нет операций для синхронизации",
            )
        }

        return runCatching {
            val responses = api.syncOperations(
                authorization = authorization,
                request = TsdSyncRequest(
                    operations = operations.map { it.toRequest(deviceId) },
                    deviceClock = Instant.now().toString(),
                ),
            )
            val byKey = responses.associateBy { it.operationKey }
            var applied = 0
            var rejected = 0
            var retried = 0

            operations.forEach { operation ->
                val response = byKey[operation.operationKey]
                when (response?.status) {
                    "APPLIED", "ACCEPTED" -> {
                        outbox.markSynced(operation.operationKey, response.message)
                        applied += 1
                    }

                    "REJECTED" -> {
                        outbox.markRejected(operation.operationKey, response.message ?: "Операция отклонена сервером")
                        rejected += 1
                    }

                    else -> {
                        // Русский комментарий: неизвестный или отсутствующий ответ оставляем в pending, чтобы повторить sync.
                        outbox.markRetry(operation.operationKey, response?.message ?: "Нет ответа по операции")
                        retried += 1
                    }
                }
            }

            TsdSyncSummary(
                sent = operations.size,
                applied = applied,
                rejected = rejected,
                retried = retried,
                message = "Синхронизация завершена",
            )
        }.getOrElse { error ->
            if (error is CancellationException) {
                throw error
            }
            operations.forEach { operation ->
                outbox.markRetry(operation.operationKey, error.message ?: "Ошибка сети")
            }
            TsdSyncSummary(
                sent = operations.size,
                applied = 0,
                rejected = 0,
                retried = operations.size,
                message = error.message ?: "Ошибка синхронизации",
            )
        }
    }

    private fun PendingOperation.toRequest(deviceId: String): TsdOperationRequest =
        TsdOperationRequest(
            deviceId = deviceId,
            operationKey = operationKey,
            operationType = operationType,
            payload = payload,
        )
}
