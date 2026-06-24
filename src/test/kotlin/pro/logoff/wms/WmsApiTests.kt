package pro.logoff.wms

import com.fasterxml.jackson.databind.ObjectMapper
import org.hamcrest.Matchers.greaterThan
import org.hamcrest.Matchers.hasSize
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.get
import pro.logoff.wms.domain.AuthResponse

@SpringBootTest
@AutoConfigureMockMvc
class WmsApiTests(
    @Autowired private val mockMvc: MockMvc,
    @Autowired private val objectMapper: ObjectMapper
) {
    @Test
    fun `admin can login and read dashboard`() {
        val token = login("admin", "admin123")

        mockMvc.get("/api/dashboard") {
            header("Authorization", "Bearer $token")
        }
            .andExpect { status { isOk() } }
            .andExpect { jsonPath("$.kpis.availableStock", greaterThan(0)) }
            .andExpect { jsonPath("$.modules", hasSize<Any>(greaterThan(5))) }
    }

    @Test
    fun `client cannot create warehouse receipt`() {
        val token = login("client", "client123")

        mockMvc.post("/api/receipts") {
            header("Authorization", "Bearer $token")
            contentType = MediaType.APPLICATION_JSON
            content = """
                {
                  "clientId": "client-alfa",
                  "sourceDocument": "Client request",
                  "lines": [
                    {
                      "sku": "ALF-SER-30",
                      "name": "Сыворотка 30 мл",
                      "expected": 1,
                      "accepted": 1,
                      "barcode": "4607000000011"
                    }
                  ]
                }
            """.trimIndent()
        }
            .andExpect { status { isForbidden() } }
            .andExpect { jsonPath("$.code") { value("access.denied") } }
    }

    @Test
    fun `receipt without barcode creates quarantine row`() {
        val token = login("sklad", "sklad123")

        mockMvc.post("/api/receipts") {
            header("Authorization", "Bearer $token")
            contentType = MediaType.APPLICATION_JSON
            content = """
                {
                  "clientId": "client-alfa",
                  "sourceDocument": "УПД тест",
                  "lines": [
                    {
                      "sku": "ALF-NO-SHK",
                      "name": "Товар без ШК",
                      "expected": 4,
                      "accepted": 4
                    }
                  ]
                }
            """.trimIndent()
        }
            .andExpect { status { isOk() } }
            .andExpect { jsonPath("$.status") { value("IN_PROGRESS") } }
            .andExpect { jsonPath("$.lines[0].state") { value("QUARANTINE") } }

        mockMvc.get("/api/quarantine") {
            header("Authorization", "Bearer $token")
        }
            .andExpect { status { isOk() } }
            .andExpect { jsonPath("$[?(@.productName == 'Товар без ШК')]") { exists() } }
    }

    @Test
    fun `warehouse user can read clients for receipt creation`() {
        val token = login("sklad", "sklad123")

        mockMvc.get("/api/clients") {
            header("Authorization", "Bearer $token")
        }
            .andExpect { status { isOk() } }
            .andExpect { jsonPath("$", hasSize<Any>(greaterThan(1))) }
    }

    @Test
    fun `receipt rejects empty lines`() {
        val token = login("sklad", "sklad123")

        mockMvc.post("/api/receipts") {
            header("Authorization", "Bearer $token")
            contentType = MediaType.APPLICATION_JSON
            content = """
                {
                  "clientId": "client-alfa",
                  "sourceDocument": "УПД без строк",
                  "lines": []
                }
            """.trimIndent()
        }
            .andExpect { status { isBadRequest() } }
            .andExpect { jsonPath("$.code") { value("receipt.lines") } }
    }

    @Test
    fun `known sku with unknown barcode goes to quarantine`() {
        val token = login("sklad", "sklad123")

        mockMvc.post("/api/receipts") {
            header("Authorization", "Bearer $token")
            contentType = MediaType.APPLICATION_JSON
            content = """
                {
                  "clientId": "client-alfa",
                  "sourceDocument": "УПД чужой ШК",
                  "lines": [
                    {
                      "sku": "ALF-SER-30",
                      "name": "Сыворотка 30 мл",
                      "expected": 2,
                      "accepted": 2,
                      "barcode": "0000000000000"
                    }
                  ]
                }
            """.trimIndent()
        }
            .andExpect { status { isOk() } }
            .andExpect { jsonPath("$.status") { value("IN_PROGRESS") } }
            .andExpect { jsonPath("$.lines[0].state") { value("QUARANTINE") } }
    }

    @Test
    fun `accountant can create invoice document`() {
        val token = login("buh", "buh123")

        mockMvc.post("/api/billing/documents") {
            header("Authorization", "Bearer $token")
            contentType = MediaType.APPLICATION_JSON
            content = """
                {
                  "clientId": "client-alfa",
                  "type": "INVOICE",
                  "source": "Начисления тест",
                  "amount": 1500.00
                }
            """.trimIndent()
        }
            .andExpect { status { isOk() } }
            .andExpect { jsonPath("$.number") { exists() } }
            .andExpect { jsonPath("$.status") { value("OPEN") } }
            .andExpect { jsonPath("$.amount") { value(1500.00) } }
    }

    private fun login(login: String, password: String): String {
        val result = mockMvc.post("/api/auth/login") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"login":"$login","password":"$password"}"""
        }
            .andExpect { status { isOk() } }
            .andReturn()
        return objectMapper.readValue(result.response.contentAsString, AuthResponse::class.java).token
    }
}
