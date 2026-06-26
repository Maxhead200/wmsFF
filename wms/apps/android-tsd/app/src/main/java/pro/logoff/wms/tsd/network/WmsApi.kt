package pro.logoff.wms.tsd.network

import retrofit2.http.Body
import retrofit2.http.POST

data class TsdOperationRequest(
    val deviceId: String,
    val operationKey: String,
    val operationType: String,
    val payload: Map<String, String>,
)

data class TsdOperationResponse(
    val operationKey: String,
    val operationType: String,
    val status: String,
    val message: String? = null,
    val serverTime: String,
)

data class TsdSyncRequest(
    val operations: List<TsdOperationRequest>,
    val deviceClock: String? = null,
)

interface WmsApi {
    @POST("api/v1/tsd/operations")
    suspend fun sendOperation(@Body request: TsdOperationRequest): TsdOperationResponse

    @POST("api/v1/tsd/sync")
    suspend fun syncOperations(@Body request: TsdSyncRequest): List<TsdOperationResponse>
}
