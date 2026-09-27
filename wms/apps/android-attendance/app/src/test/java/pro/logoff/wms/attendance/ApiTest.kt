package pro.logoff.wms.attendance

import android.app.Application
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.*
import org.junit.Assert.*
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import java.io.File

// TEST: protocol v2 sends attendance separately; only an explicit request uploads a photograph.
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [30], application = Application::class)
class ApiTest {
    // TEST: attendance delivery must not upload the photograph or wait for its receipt.
    @Test fun `attendance is acknowledged without automatic photo upload`() {
        server.enqueue(MockResponse().setBody(body(false)))
        assertEquals("ACCEPTED", api.send(device, event()).status)
        val request = server.takeRequest()
        val raw = request.body.readUtf8()
        assertFalse(raw.contains("test-photo"))
        assertFalse(raw.contains("filename="))
        assertTrue(photo.isFile)
    }
    private lateinit var server: MockWebServer
    private lateinit var api: HttpAttendanceApi
    private lateinit var photo: File
    private val device = Device("device", "branch", "ФФ Москва", "01", "test-only-token")
    @Before fun setup() {
        server = MockWebServer(); server.start()
        api = HttpAttendanceApi(server.url("/").toString())
        photo = File(RuntimeEnvironment.getApplication().cacheDir, "api-photo.jpg").apply { writeText("test-photo") }
    }
    @After fun cleanup() { server.shutdown(); photo.delete() }
    private fun event() = Event("uuid-stable", "employee", "device", "branch", "CLOCK_IN", 1000, 100, null, null, photo.path, sha256(photo))
    private fun body(photoStored: Boolean, id: String = "uuid-stable") = """{"eventId":"$id","status":"ACCEPTED","photoStored":$photoStored,"employee":{"id":"employee","name":"Имя","warehouseId":"branch","revision":2,"openSinceMs":1000}}"""
    @Test fun `metadata contains same uuid timestamp photo hash and scoped token`() {
        repeat(2) { server.enqueue(MockResponse().setBody(body(true))); api.send(device, event()) }
        repeat(2) {
            val request = server.takeRequest()
            assertEquals("uuid-stable", request.getHeader("Idempotency-Key"))
            assertEquals("Bearer test-only-token", request.getHeader("Authorization"))
            val raw = request.body.readUtf8()
            assertTrue(raw.contains("\"capturedAtMs\":1000"))
            assertTrue(raw.contains(sha256(photo)))
            assertFalse(raw.contains("test-photo"))
            assertTrue(raw.contains("LOCAL_35_DAYS"))
            assertTrue(request.getHeader("Content-Type")!!.startsWith("application/json"))
        }
    }
    @Test fun `server must confirm exact event but not photo`() {
        server.enqueue(MockResponse().setBody(body(false)))
        assertEquals("ACCEPTED", api.send(device, event()).status)
        server.enqueue(MockResponse().setBody(body(true, "different-id")))
        assertTrue(runCatching { api.send(device, event()) }.isFailure)
    }
    @Test fun `foreign branch and redirects are not accepted`() {
        server.enqueue(MockResponse().setBody("""{"deviceId":"device","warehouseId":"other","serverTimeMs":1000,"employees":[]}"""))
        assertTrue(runCatching { api.snapshot(device) }.isFailure)
        server.enqueue(MockResponse().setResponseCode(302).setHeader("Location", server.url("/other")))
        assertTrue(runCatching { api.snapshot(device) }.exceptionOrNull() is ApiFailure)
        assertEquals(2, server.requestCount)
    }
    @Test fun `corrupted photograph does not prevent sending attendance`() {
        val event = event(); photo.appendText("changed")
        server.enqueue(MockResponse().setBody(body(false)))
        assertEquals("ACCEPTED", api.send(device, event).status)
        assertFalse(server.takeRequest().body.readUtf8().contains("test-photo"))
        assertTrue(runCatching { api.photo(device, PhotoRequest("request-1", event.id), event, photo, "AVAILABLE") }.isFailure)
        assertEquals(1, server.requestCount)
    }
    @Test fun `requested photo uses separate endpoint and validates receipt`() {
        server.enqueue(MockResponse().setBody("""{"requestId":"request-1","eventId":"uuid-stable","status":"STORED"}"""))
        api.photo(device, PhotoRequest("request-1", "uuid-stable"), event(), photo, "AVAILABLE")
        val request = server.takeRequest()
        assertEquals("/photo-requests/request-1", request.path)
        assertEquals("request-1", request.getHeader("Idempotency-Key"))
        assertTrue(request.body.readUtf8().contains("test-photo"))
        server.enqueue(MockResponse().setBody("""{"requestId":"wrong","eventId":"uuid-stable","status":"STORED"}"""))
        assertTrue(runCatching { api.photo(device, PhotoRequest("request-1", "uuid-stable"), event(), photo, "AVAILABLE") }.isFailure)
    }
    @Test fun `old server protocol is not silently accepted`() {
        server.enqueue(MockResponse().setBody("""{"protocolVersion":1,"deviceId":"device","warehouseId":"branch","serverTimeMs":1000,"employees":[]}"""))
        assertTrue(runCatching { api.snapshot(device) }.isFailure)
    }
}
