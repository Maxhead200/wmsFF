package pro.logoff.wms.tsd.network

import com.squareup.moshi.Moshi
import com.squareup.moshi.Json
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.Path
import retrofit2.http.POST
import retrofit2.http.Query
import retrofit2.Retrofit
import retrofit2.converter.moshi.MoshiConverterFactory

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
    val reviewReason: String? = null,
    val resolutionMessage: String? = null,
    val serverTime: String,
)

data class TsdSyncRequest(
    val operations: List<TsdOperationRequest>,
    val deviceClock: String? = null,
)

data class AuthLoginRequest(
    val email: String,
    val password: String,
)

data class AuthUserInfo(
    val id: String,
    val name: String,
    val email: String,
    val permissionCodes: List<String> = emptyList(),
)

data class AuthLoginResponse(
    val accessToken: String,
    val tokenType: String,
    val user: AuthUserInfo,
)

data class TsdClientSummary(
    val id: String,
    val code: String?,
    val name: String,
    val legalName: String?,
)

data class TsdSkuBarcode(
    val value: String,
    val isPrimary: Boolean,
)

data class TsdSkuCharacteristic(
    val name: String,
    val value: String,
)

data class TsdSkuSummary(
    val id: String,
    val internalSku: String,
    val clientSku: String?,
    val article: String?,
    val name: String,
    val color: String?,
    val size: String?,
    val brand: String?,
    val category: String?,
    val needsChestnyZnak: Boolean,
    val barcodes: List<TsdSkuBarcode> = emptyList(),
    val marketplacePhotos: List<String> = emptyList(),
    val marketplaceCharacteristics: List<TsdSkuCharacteristic> = emptyList(),
)

data class TsdRequestClientSummary(
    val id: String,
    val name: String,
    val storesWithoutBoxes: Boolean = false,
)

data class TsdRequestCounts(
    val items: Int = 0,
)

data class TsdRequestWorker(
    val userId: String,
    val userName: String,
    val deviceCode: String? = null,
    val stage: String,
    val lastSeenAt: String,
)

data class TsdRequestSummary(
    val id: String,
    val title: String,
    val status: String,
    val destinationCity: String? = null,
    val createdAt: String,
    val updatedAt: String,
    val client: TsdRequestClientSummary,
    @Json(name = "_count") val counts: TsdRequestCounts = TsdRequestCounts(),
    val activeWorkers: List<TsdRequestWorker> = emptyList(),
)

data class TsdStageBox(
    val code: String,
    val found: Boolean = false,
)

data class TsdStageBoxGroup(
    val boxCode: String,
    val totalRemaining: Int = 0,
)

data class TsdBoxSearchState(
    val requestId: String,
    val total: Int = 0,
    val found: Int = 0,
    val remaining: Int = 0,
    val isComplete: Boolean = false,
    val boxes: List<TsdStageBox> = emptyList(),
    val missingBoxes: List<String> = emptyList(),
)

data class TsdWorkStageState(
    val requestId: String,
    val total: Int = 0,
    val completed: Int = 0,
    val remaining: Int = 0,
    val isComplete: Boolean = false,
    val boxes: List<TsdStageBoxGroup> = emptyList(),
)

interface WmsApi {
    @POST("api/v1/auth/login")
    suspend fun login(@Body request: AuthLoginRequest): AuthLoginResponse

    @GET("api/v1/tsd/clients")
    suspend fun clients(@Header("Authorization") authorization: String): List<TsdClientSummary>

    @GET("api/v1/tsd/requests/active")
    suspend fun activeRequests(@Header("Authorization") authorization: String): List<TsdRequestSummary>

    @GET("api/v1/tsd/requests/{id}/box-search")
    suspend fun requestBoxSearch(
        @Header("Authorization") authorization: String,
        @Path("id") requestId: String,
        @Query("deviceCode") deviceCode: String,
        @Query("stage") stage: String? = null,
        @Query("managerCode") managerCode: String? = null,
    ): TsdBoxSearchState

    @GET("api/v1/tsd/requests/{id}/relabel")
    suspend fun requestRelabel(
        @Header("Authorization") authorization: String,
        @Path("id") requestId: String,
        @Query("deviceCode") deviceCode: String,
        @Query("managerCode") managerCode: String? = null,
    ): TsdWorkStageState

    @GET("api/v1/tsd/requests/{id}/moves")
    suspend fun requestMoves(
        @Header("Authorization") authorization: String,
        @Path("id") requestId: String,
        @Query("deviceCode") deviceCode: String,
        @Query("managerCode") managerCode: String? = null,
    ): TsdWorkStageState

    @GET("api/v1/tsd/sku-by-barcode")
    suspend fun skuByBarcode(
        @Header("Authorization") authorization: String,
        @Query("clientId") clientId: String,
        @Query("barcode") barcode: String,
    ): TsdSkuSummary

    @POST("api/v1/tsd/operations")
    suspend fun sendOperation(
        @Header("Authorization") authorization: String,
        @Body request: TsdOperationRequest,
    ): TsdOperationResponse

    @POST("api/v1/tsd/sync")
    suspend fun syncOperations(
        @Header("Authorization") authorization: String,
        @Body request: TsdSyncRequest,
    ): List<TsdOperationResponse>
}

object WmsApiFactory {
    fun create(baseUrl: String): WmsApi =
        Retrofit.Builder()
            .baseUrl(normalizeBaseUrl(baseUrl))
            .addConverterFactory(MoshiConverterFactory.create(moshi))
            .build()
            .create(WmsApi::class.java)

    private fun normalizeBaseUrl(baseUrl: String): String =
        when {
            baseUrl.isBlank() -> DEFAULT_BASE_URL
            baseUrl.endsWith("/") -> baseUrl
            else -> "$baseUrl/"
        }

    private const val DEFAULT_BASE_URL = "https://wms.logoff.pro/"
    private val moshi = Moshi.Builder()
        .add(KotlinJsonAdapterFactory())
        .build()
}
