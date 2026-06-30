package pro.logoff.wms.tsd.network

import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Header
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

interface WmsApi {
    @POST("api/v1/auth/login")
    suspend fun login(@Body request: AuthLoginRequest): AuthLoginResponse

    @GET("api/v1/tsd/clients")
    suspend fun clients(@Header("Authorization") authorization: String): List<TsdClientSummary>

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
