package pro.logoff.wms

import com.fasterxml.jackson.databind.ObjectMapper
import org.hamcrest.Matchers.greaterThan
import org.hamcrest.Matchers.hasItem
import org.hamcrest.Matchers.hasSize
import org.apache.poi.xssf.usermodel.XSSFWorkbook
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.http.MediaType
import org.springframework.mock.web.MockMultipartFile
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.get
import pro.logoff.wms.domain.AuthResponse
import java.io.ByteArrayOutputStream

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
    fun `manager can use fulfillment cockpit and create marketplace supply`() {
        val token = login("manager", "manager123")

        mockMvc.get("/api/fulfillment/dashboard") {
            header("Authorization", "Bearer $token")
        }
            .andExpect { status { isOk() } }
            .andExpect { jsonPath("$.kpis.orders", greaterThan(0)) }
            .andExpect { jsonPath("$.queue", hasSize<Any>(greaterThan(0))) }
            .andExpect { jsonPath("$.stockSignals", hasSize<Any>(greaterThan(0))) }

        mockMvc.post("/api/marketplace-supplies") {
            header("Authorization", "Bearer $token")
            contentType = MediaType.APPLICATION_JSON
            content = """
                {
                  "clientId": "client-alfa",
                  "marketplace": "Ozon",
                  "lines": [
                    {
                      "productId": "prod-serum",
                      "quantity": 2
                    }
                  ]
                }
            """.trimIndent()
        }
            .andExpect { status { isOk() } }
            .andExpect { jsonPath("$.number") { exists() } }
            .andExpect { jsonPath("$.marketplace") { value("Ozon") } }

        mockMvc.get("/api/fulfillment/dashboard") {
            header("Authorization", "Bearer $token")
        }
            .andExpect { status { isOk() } }
            .andExpect { jsonPath("$.channelLoad.Ozon") { value(1) } }
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

    @Test
    fun `admin can import Lukin stock from 1c xlsx`() {
        val token = login("admin", "admin123")
        val file = MockMultipartFile(
            "file",
            "остатки 24.06.xlsx",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            lukinStockWorkbook()
        )

        mockMvc.perform(
            multipart("/api/integrations/1c/import/stock-xlsx")
                .file(file)
                .param("clientId", "client-lukin")
                .param("apply", "true")
                .header("Authorization", "Bearer $token")
        )
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.rowsDetected").value(4))
            .andExpect(jsonPath("$.validRows").value(3))
            .andExpect(jsonPath("$.totalQuantity").value(9))
            .andExpect(jsonPath("$.boxesDetected").value(2))
            .andExpect(jsonPath("$.productsDetected").value(2))
            .andExpect(jsonPath("$.stockRows").value(3))
            .andExpect(jsonPath("$.errors", hasSize<Any>(1)))
            .andExpect(jsonPath("$.applied").value(true))

        mockMvc.get("/api/stock") {
            header("Authorization", "Bearer $token")
        }
            .andExpect { status { isOk() } }
            .andExpect { jsonPath("$[?(@.clientId == 'client-lukin')].available") { value(hasItem(4)) } }
            .andExpect { jsonPath("$[?(@.clientId == 'client-lukin')].available") { value(hasItem(2)) } }
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

    private fun lukinStockWorkbook(): ByteArray {
        val workbook = XSSFWorkbook()
        val sheet = workbook.createSheet("TDSheet")
        val header = sheet.createRow(2)
        header.createCell(0).setCellValue("Короб")
        header.createCell(3).setCellValue("Штрих код")
        header.createCell(4).setCellValue("logo_Наименование")
        header.createCell(6).setCellValue("Цвет")
        header.createCell(7).setCellValue("Размер")
        header.createCell(8).setCellValue("Количество Остаток")

        sheet.createRow(3).createCell(0).setCellValue("FFL_LUKIN_001")
        sheet.createRow(4).apply {
            createCell(0).setCellValue("FFL_LUKIN_001")
            createCell(3).setCellValue("2040000000001")
            createCell(4).setCellValue("Костюм_тестовый")
            createCell(6).setCellValue("черный")
            createCell(7).setCellValue("M")
            createCell(8).setCellValue(4.0)
        }
        sheet.createRow(5).apply {
            createCell(0).setCellValue("FFL_LUKIN_001")
            createCell(3).setCellValue("2040000000002")
            createCell(4).setCellValue("Футболка_тестовая")
            createCell(6).setCellValue("белый")
            createCell(7).setCellValue("L")
            createCell(8).setCellValue(3.0)
        }

        sheet.createRow(6).createCell(0).setCellValue("FFL_LUKIN_002")
        sheet.createRow(7).apply {
            createCell(0).setCellValue("FFL_LUKIN_002")
            createCell(3).setCellValue("2040000000001")
            createCell(6).setCellValue("черный")
            createCell(7).setCellValue("M")
            createCell(8).setCellValue(2.0)
        }
        sheet.createRow(8).apply {
            createCell(0).setCellValue("FFL_LUKIN_002")
            createCell(6).setCellValue("#N/A")
            createCell(7).setCellValue("#N/A")
            createCell(8).setCellValue(1.0)
        }

        val output = ByteArrayOutputStream()
        workbook.use { it.write(output) }
        return output.toByteArray()
    }
}
