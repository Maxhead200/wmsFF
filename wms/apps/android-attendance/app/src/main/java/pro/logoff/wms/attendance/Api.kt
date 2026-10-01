package pro.logoff.wms.attendance

import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.asRequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.IOException
import java.util.concurrent.TimeUnit

class ApiFailure(val code: Int) : IOException("HTTP $code")
data class PhotoRequest(val id: String, val eventId: String)
data class Snapshot(val employees: List<Employee>, val serverTime: Long, val receipts: List<Receipt> = emptyList(), val photoRequests: List<PhotoRequest> = emptyList())
data class Receipt(val id: String, val status: String, val reason: String, val employee: Employee?, val photoStored: Boolean = false)
interface AttendanceApi {
    fun register(code: String, name: String): Device
    fun snapshot(device: Device): Snapshot
    fun send(device: Device, event: Event): Receipt
    fun acknowledgeReceipts(device: Device, ids: List<String>) {}
    fun photo(device: Device, request: PhotoRequest, event: Event, file: File?, status: String) { error("Передача фото не поддерживается") }
}

class HttpAttendanceApi(private val url: String = BuildConfig.API_URL) : AttendanceApi {
    override fun acknowledgeReceipts(device: Device, ids: List<String>) {
        if (ids.isNotEmpty()) request("receipts", device.token, JSONObject().put("eventIds", JSONArray(ids)).toString().toRequestBody("application/json".toMediaType()))
    }
    private val client = OkHttpClient.Builder().connectTimeout(15, TimeUnit.SECONDS).readTimeout(35, TimeUnit.SECONDS)
        .writeTimeout(60, TimeUnit.SECONDS).followRedirects(false).followSslRedirects(false).build()
    private fun request(path: String, token: String? = null, body: RequestBody? = null, key: String? = null): JSONObject {
        val request = Request.Builder().url(url + path).header("Accept", "application/json")
        token?.let { request.header("Authorization", "Bearer $it") }
        key?.let { request.header("Idempotency-Key", it) }
        body?.let { request.post(it) }
        client.newCall(request.build()).execute().use { response ->
            if (!response.isSuccessful) throw ApiFailure(response.code)
            return JSONObject(response.body?.string() ?: throw IOException("Пустой ответ"))
        }
    }
    override fun register(code: String, name: String): Device {
        val r = request("register", body = JSONObject().put("code", code).put("name", name)
            .put("protocolVersion", 2).toString().toRequestBody("application/json".toMediaType()))
        require(r.getInt("protocolVersion") == 2) { "Несовместимая версия API" }
        return Device(r.getString("deviceId"), r.getString("warehouseId"), r.getString("warehouseName"), name, r.getString("token"))
            .also { require(it.id.isNotBlank() && it.warehouseId.isNotBlank() && it.token.isNotBlank()) }
    }
    override fun snapshot(device: Device): Snapshot {
        val r = request("state", device.token)
        require(r.getString("deviceId") == device.id && r.getString("warehouseId") == device.warehouseId) { "Неверная привязка устройства" }
        require(r.getInt("protocolVersion") == 2) { "Требуется API с хранением фото на планшете" }
        val rows = r.getJSONArray("employees")
        val resolutions = r.optJSONArray("receipts") ?: JSONArray()
        val requests = r.optJSONArray("photoRequests") ?: JSONArray()
        require(requests.length() <= 100) { "Слишком много запросов фото" }
        return Snapshot((0 until rows.length()).map { employee(rows.getJSONObject(it)) }.also {
            require(it.all { e -> e.warehouseId == device.warehouseId }) { "Сотрудник другого филиала" }
        }, r.getLong("serverTimeMs"), (0 until resolutions.length()).map { receipt(resolutions.getJSONObject(it)) },
            (0 until requests.length()).map { requests.getJSONObject(it).let { row -> PhotoRequest(row.getString("requestId"), row.getString("eventId")) } })
    }
    override fun send(device: Device, event: Event): Receipt {
        require(device.id == event.deviceId && device.warehouseId == event.warehouseId) { "Привязка события не совпадает" }
        val json = JSONObject().put("protocolVersion", 2).put("photoPolicy", "LOCAL_35_DAYS")
            .put("eventId", event.id).put("employeeId", event.employeeId).put("deviceId", event.deviceId)
            .put("warehouseId", event.warehouseId).put("kind", event.kind).put("capturedAtMs", event.capturedAt)
            .put("elapsedAtMs", event.elapsedAt).put("serverOffsetMs", event.offsetMs ?: JSONObject.NULL)
            .put("lastSyncAtMs", event.lastSyncAt ?: JSONObject.NULL).put("photoSha256", event.photoHash ?: JSONObject.NULL)
            .put("payload", JSONObject(event.payload))
        // FIX: photographs never accompany attendance; a lost/expired photo cannot block the timesheet.
        val r = request("events", device.token, json.toString().toRequestBody("application/json".toMediaType()), event.id)
        require(r.getString("eventId") == event.id) { "Неверный идентификатор подтверждения" }
        val status = r.getString("status")
        require(status == "ACCEPTED" || status == "REVIEW") { "Неизвестный статус" }
        val state = r.optJSONObject("employee")?.let(::employee)
        require(state == null || (state.id == event.employeeId && state.warehouseId == event.warehouseId))
        require(event.kind == "HANDLING" || state != null) { "Нет состояния смены" }
        return Receipt(event.id, status, r.optString("reason"), state, r.optBoolean("photoStored"))
    }
    override fun photo(device: Device, request: PhotoRequest, event: Event, file: File?, status: String) {
        require(event.deviceId == device.id && event.warehouseId == device.warehouseId && request.eventId == event.id)
        require(request.id.matches(Regex("[A-Za-z0-9-]{1,100}")))
        require(status in listOf("AVAILABLE", "EXPIRED", "UNAVAILABLE"))
        val form = MultipartBody.Builder().setType(MultipartBody.FORM)
            .addFormDataPart("requestId", request.id).addFormDataPart("eventId", event.id)
            .addFormDataPart("status", status)
        if (status == "AVAILABLE") {
            require(file != null && file.isFile && file.length() in 1..4L * 1024 * 1024 && sha256(file) == event.photoHash)
            form.addFormDataPart("photo", "photo.jpg", file.asRequestBody("image/jpeg".toMediaType()))
        } else require(file == null)
        val r = this.request("photo-requests/${request.id}", device.token, form.build(), request.id)
        require(r.getString("requestId") == request.id && r.getString("eventId") == event.id)
        require(r.getString("status") == if (status == "AVAILABLE") "STORED" else status)
    }
    private fun receipt(r: JSONObject): Receipt {
        require(r.getString("status") in listOf("ACCEPTED", "REVIEW"))
        return Receipt(r.getString("eventId"), r.getString("status"), r.optString("reason"),
            r.optJSONObject("employee")?.let(::employee), r.optBoolean("photoStored"))
    }
    private fun employee(j: JSONObject) = Employee(j.getString("id"), j.getString("name"), j.getString("warehouseId"),
        j.optBoolean("loader"), j.optBoolean("active", true), if (j.isNull("openSinceMs")) null else j.getLong("openSinceMs"),
        j.getLong("revision"), j.optString("distinguishing"), if (j.isNull("breakSinceMs")) null else j.getLong("breakSinceMs"))
}
