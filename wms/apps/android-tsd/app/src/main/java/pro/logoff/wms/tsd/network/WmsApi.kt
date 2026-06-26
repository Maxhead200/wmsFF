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
    val status: String,
    val serverTime: String,
)

interface WmsApi {
    @POST("api/v1/tsd/operations")
    suspend fun sendOperation(@Body request: TsdOperationRequest): TsdOperationResponse
}
