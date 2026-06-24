package pro.logoff.wms.api

import jakarta.servlet.http.HttpServletRequest
import jakarta.validation.Valid
import org.springframework.http.ResponseEntity
import org.springframework.validation.FieldError
import org.springframework.web.bind.MethodArgumentNotValidException
import org.springframework.web.bind.annotation.CrossOrigin
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.bind.annotation.RestControllerAdvice
import org.springframework.web.multipart.MultipartFile
import pro.logoff.wms.domain.*
import pro.logoff.wms.service.WmsException
import pro.logoff.wms.service.WmsService

@CrossOrigin
@RestController
@RequestMapping("/api")
class WmsApiController(
    private val service: WmsService
) {
    @PostMapping("/auth/login")
    fun login(@RequestBody request: LoginRequest): AuthResponse = service.login(request)

    @PostMapping("/auth/register")
    fun register(@RequestBody request: RegisterRequest): RegistrationResponse = service.register(request)

    @GetMapping("/auth/me")
    fun me(http: HttpServletRequest): SessionUser = service.me(http)

    @GetMapping("/dashboard")
    fun dashboard(http: HttpServletRequest): DashboardResponse = service.dashboard(user(http))

    @GetMapping("/users")
    fun users(http: HttpServletRequest): List<WmsUser> = service.listUsers(user(http))

    @GetMapping("/roles")
    fun roles(http: HttpServletRequest): List<RoleDefinition> {
        service.me(http)
        return service.roles()
    }

    @GetMapping("/clients")
    fun clients(http: HttpServletRequest): List<Client> = service.listClients(user(http))

    @GetMapping("/products")
    fun products(http: HttpServletRequest): List<Product> = service.listProducts(user(http))

    @PostMapping("/barcodes/{productId}")
    fun generateBarcode(
        http: HttpServletRequest,
        @PathVariable productId: String
    ): BarcodeIssue = service.generateBarcode(user(http), productId)

    @GetMapping("/stock")
    fun stock(http: HttpServletRequest): List<StockItem> = service.listStock(user(http))

    @GetMapping("/receipts")
    fun receipts(http: HttpServletRequest): List<Receipt> = service.listReceipts(user(http))

    @PostMapping("/receipts")
    fun createReceipt(
        http: HttpServletRequest,
        @RequestBody request: ReceiptCreateRequest
    ): Receipt = service.createReceipt(user(http), request)

    @GetMapping("/quarantine")
    fun quarantine(http: HttpServletRequest): List<QuarantineItem> = service.listQuarantine(user(http))

    @PostMapping("/quarantine/{id}/release")
    fun releaseQuarantine(
        http: HttpServletRequest,
        @PathVariable id: String,
        @RequestBody request: QuarantineReleaseRequest
    ): QuarantineItem = service.releaseQuarantine(user(http), id, request)

    @GetMapping("/tasks")
    fun tasks(http: HttpServletRequest): List<WarehouseTask> = service.listTasks(user(http))

    @PutMapping("/tasks/{id}/status")
    fun updateTaskStatus(
        http: HttpServletRequest,
        @PathVariable id: String,
        @RequestBody request: TaskStatusRequest
    ): WarehouseTask = service.updateTaskStatus(user(http), id, request)

    @GetMapping("/marketplace-supplies")
    fun supplies(http: HttpServletRequest): List<MarketplaceSupply> = service.listSupplies(user(http))

    @PostMapping("/marketplace-supplies")
    fun createSupply(
        http: HttpServletRequest,
        @RequestBody request: MarketplaceSupplyRequest
    ): MarketplaceSupply = service.createSupply(user(http), request)

    @GetMapping("/inventory-counts")
    fun inventoryCounts(http: HttpServletRequest): List<InventoryCount> = service.listInventoryCounts(user(http))

    @PostMapping("/inventory-counts")
    fun createInventoryCount(
        http: HttpServletRequest,
        @RequestBody request: InventoryCountRequest
    ): InventoryCount = service.createInventoryCount(user(http), request)

    @GetMapping("/services")
    fun services(http: HttpServletRequest): List<ServiceDefinition> = service.listServices(user(http))

    @GetMapping("/services/tariffs")
    fun tariffs(http: HttpServletRequest): List<ClientTariff> = service.listTariffs(user(http))

    @GetMapping("/billing/accruals")
    fun accruals(http: HttpServletRequest): List<Accrual> = service.listAccruals(user(http))

    @GetMapping("/billing/documents")
    fun billingDocuments(http: HttpServletRequest): List<BillingDocument> = service.listDocuments(user(http))

    @PostMapping("/billing/documents")
    fun createBillingDocument(
        http: HttpServletRequest,
        @RequestBody request: BillingDocumentRequest
    ): BillingDocument = service.createBillingDocument(user(http), request)

    @GetMapping("/documents")
    fun documents(http: HttpServletRequest): List<BillingDocument> = service.listDocuments(user(http))

    @GetMapping("/reports/overview")
    fun reportsOverview(http: HttpServletRequest): Map<String, Any> = service.reportsOverview(user(http))

    @PostMapping("/integrations/1c/import/preview")
    fun importPreview(
        http: HttpServletRequest,
        @RequestBody request: ImportPreviewRequest
    ): ImportPreviewResponse = service.importPreview(user(http), request)

    @PostMapping("/integrations/1c/import/stock-xlsx")
    fun importStockXlsx(
        http: HttpServletRequest,
        @RequestParam clientId: String,
        @RequestParam(defaultValue = "false") apply: Boolean,
        @RequestParam file: MultipartFile
    ): StockImportResponse = service.importStockXlsx(user(http), clientId, file.originalFilename.orEmpty(), file.inputStream, apply)

    @GetMapping("/integrations/1c/export")
    fun exportData(
        http: HttpServletRequest,
        @RequestParam entity: String
    ): ExportResponse = service.exportData(user(http), entity)

    @GetMapping("/ui-settings")
    fun uiSettings(http: HttpServletRequest): UiSettings = service.getUiSettings(user(http))

    @PutMapping("/ui-settings")
    fun updateUiSettings(
        http: HttpServletRequest,
        @RequestBody request: UiSettingsRequest
    ): UiSettings = service.updateUiSettings(user(http), request)

    @GetMapping("/audit")
    fun audit(http: HttpServletRequest): List<AuditEvent> = service.auditEvents(user(http))

    private fun user(http: HttpServletRequest): SessionUser = service.currentUser(http)
}

@RestControllerAdvice
class ApiExceptionHandler {
    @ExceptionHandler(WmsException::class)
    fun wmsException(error: WmsException): ResponseEntity<ApiError> =
        ResponseEntity.status(error.status).body(ApiError(error.code, error.message))

    @ExceptionHandler(MethodArgumentNotValidException::class)
    fun validation(error: MethodArgumentNotValidException): ResponseEntity<ApiError> {
        val details = error.bindingResult.allErrors.joinToString("; ") {
            val field = (it as? FieldError)?.field ?: it.objectName
            "$field: ${it.defaultMessage}"
        }
        return ResponseEntity.badRequest().body(ApiError("validation.failed", details))
    }
}
