package pro.logoff.wms.domain

import java.math.BigDecimal
import java.time.Instant
import java.time.LocalDate

enum class RoleKey(val title: String) {
    ADMIN("Администратор"),
    DIRECTOR("Директор"),
    OWNER("ИП / владелец"),
    WAREHOUSE("Сотрудник склада"),
    SHIFT_LEAD("Старший смены"),
    ACCOUNTANT("Бухгалтер"),
    MANAGER("Менеджер"),
    TAX_ACCOUNTANT("Бухгалтер-таксировщик"),
    CLIENT("Клиент"),
    AUDITOR("Аудитор")
}

enum class Permission {
    DASHBOARD_READ,
    CLIENTS_MANAGE,
    USERS_MANAGE,
    ROLES_MANAGE,
    RECEIPTS_MANAGE,
    QUARANTINE_MANAGE,
    STOCK_READ,
    STOCK_ADJUST,
    TASKS_MANAGE,
    MARKETPLACE_SUPPLIES_MANAGE,
    INVENTORY_MANAGE,
    SERVICES_MANAGE,
    BILLING_MANAGE,
    DOCUMENTS_READ,
    REPORTS_READ,
    INTEGRATIONS_MANAGE,
    UI_SETTINGS_MANAGE,
    AUDIT_READ,
    CLIENT_PORTAL
}

enum class EntityStatus {
    ACTIVE,
    PENDING,
    BLOCKED,
    DRAFT,
    OPEN,
    IN_PROGRESS,
    DONE,
    CANCELLED,
    QUARANTINE,
    APPROVED,
    PAID,
    OVERDUE
}

data class RoleDefinition(
    val key: RoleKey,
    val title: String,
    val permissions: Set<Permission>,
    val visibleModules: List<String>
)

data class WmsUser(
    val id: String,
    val login: String,
    val displayName: String,
    val role: RoleKey,
    val clientId: String? = null,
    val status: EntityStatus = EntityStatus.ACTIVE
)

data class SessionUser(
    val id: String,
    val login: String,
    val displayName: String,
    val role: RoleKey,
    val roleTitle: String,
    val clientId: String?,
    val permissions: Set<Permission>,
    val visibleModules: List<String>
)

data class Client(
    val id: String,
    val name: String,
    val legalName: String,
    val inn: String,
    val contactName: String,
    val phone: String,
    val email: String,
    val status: EntityStatus,
    val debt: BigDecimal,
    val balanceLimit: BigDecimal
)

data class Product(
    val id: String,
    val clientId: String,
    val clientName: String,
    val sku: String,
    val name: String,
    val barcode: String?,
    val status: EntityStatus,
    val requiresMarking: Boolean = false
)

data class BarcodeIssue(
    val productId: String,
    val barcode: String,
    val label: String,
    val issuedAt: Instant = Instant.now()
)

data class StockItem(
    val id: String,
    val clientId: String,
    val clientName: String,
    val productId: String,
    val productName: String,
    val sku: String,
    val barcode: String?,
    val location: String,
    val available: Int,
    val reserved: Int,
    val quarantine: Int,
    val unit: String = "шт"
)

data class ReceiptLine(
    val productId: String?,
    val sku: String,
    val name: String,
    val expected: Int,
    val accepted: Int,
    val barcode: String?,
    val state: EntityStatus
)

data class Receipt(
    val id: String,
    val number: String,
    val clientId: String,
    val clientName: String,
    val status: EntityStatus,
    val createdAt: Instant,
    val sourceDocument: String,
    val lines: List<ReceiptLine>,
    val discrepancyCount: Int
)

data class ReceiptCreateRequest(
    val clientId: String,
    val sourceDocument: String,
    val lines: List<ReceiptLineRequest>
)

data class ReceiptLineRequest(
    val sku: String,
    val name: String,
    val expected: Int,
    val accepted: Int,
    val barcode: String? = null
)

data class QuarantineItem(
    val id: String,
    val clientId: String,
    val clientName: String,
    val productName: String,
    val sku: String?,
    val quantity: Int,
    val reason: String,
    val zone: String,
    val status: EntityStatus,
    val receivedAt: Instant,
    val candidateBarcode: String?
)

data class QuarantineReleaseRequest(
    val productId: String?,
    val sku: String,
    val name: String,
    val printInternalBarcode: Boolean = true
)

data class WarehouseTask(
    val id: String,
    val kind: String,
    val title: String,
    val clientId: String,
    val clientName: String,
    val zone: String,
    val assignee: String,
    val status: EntityStatus,
    val priority: String,
    val dueAt: Instant
)

data class TaskStatusRequest(
    val status: EntityStatus
)

data class MarketplaceSupply(
    val id: String,
    val number: String,
    val clientId: String,
    val clientName: String,
    val marketplace: String,
    val status: EntityStatus,
    val reservedLines: Int,
    val boxes: Int,
    val createdAt: Instant
)

data class MarketplaceSupplyRequest(
    val clientId: String,
    val marketplace: String,
    val lines: List<SupplyLineRequest>
)

data class SupplyLineRequest(
    val productId: String,
    val quantity: Int
)

data class InventoryCount(
    val id: String,
    val number: String,
    val type: String,
    val zone: String,
    val status: EntityStatus,
    val discrepancies: Int,
    val startedAt: Instant
)

data class InventoryCountRequest(
    val type: String,
    val zone: String
)

data class ServiceDefinition(
    val id: String,
    val name: String,
    val unit: String,
    val defaultRate: BigDecimal,
    val active: Boolean = true
)

data class ClientTariff(
    val clientId: String,
    val clientName: String,
    val serviceId: String,
    val serviceName: String,
    val rate: BigDecimal
)

data class Accrual(
    val id: String,
    val clientId: String,
    val clientName: String,
    val serviceName: String,
    val quantity: BigDecimal,
    val rate: BigDecimal,
    val amount: BigDecimal,
    val date: LocalDate,
    val status: EntityStatus
)

enum class DocumentType {
    INVOICE,
    ACT,
    CASH_RECEIPT,
    STOCK_REPORT,
    INVENTORY_REPORT
}

data class BillingDocument(
    val id: String,
    val type: DocumentType,
    val number: String,
    val clientId: String,
    val clientName: String,
    val amount: BigDecimal,
    val status: EntityStatus,
    val date: LocalDate,
    val dueDate: LocalDate?,
    val source: String
)

data class BillingDocumentRequest(
    val clientId: String,
    val type: DocumentType,
    val source: String,
    val amount: BigDecimal
)

data class AuditEvent(
    val id: String,
    val at: Instant,
    val actor: String,
    val action: String,
    val entity: String,
    val details: String
)

data class UiSettings(
    val userId: String,
    val startModule: String,
    val visibleModules: List<String>,
    val hiddenModules: List<String> = emptyList(),
    val denseMode: Boolean = true
)

data class UiSettingsRequest(
    val startModule: String,
    val visibleModules: List<String>,
    val denseMode: Boolean = true
)

data class LoginRequest(
    val login: String,
    val password: String
)

data class RegisterRequest(
    val companyName: String,
    val inn: String,
    val contactName: String,
    val phone: String,
    val email: String,
    val comment: String? = null
)

data class AuthResponse(
    val token: String,
    val user: SessionUser
)

data class RegistrationResponse(
    val clientId: String,
    val status: EntityStatus,
    val message: String
)

data class ApiError(
    val code: String,
    val message: String
)

data class KpiSet(
    val receipts: Int,
    val quarantine: Int,
    val availableStock: Int,
    val activeTasks: Int,
    val supplies: Int,
    val debt: BigDecimal
)

data class ModuleSummary(
    val id: String,
    val title: String,
    val icon: String,
    val metric: String,
    val state: String
)

data class WarehouseZone(
    val id: String,
    val title: String,
    val load: Int,
    val status: String
)

data class TimelineEvent(
    val at: Instant,
    val title: String,
    val details: String
)

data class DashboardResponse(
    val kpis: KpiSet,
    val modules: List<ModuleSummary>,
    val priorityTasks: List<WarehouseTask>,
    val warehouseZones: List<WarehouseZone>,
    val timeline: List<TimelineEvent>,
    val billingDocuments: List<BillingDocument>
)

data class ImportPreviewRequest(
    val format: String,
    val entity: String,
    val content: String
)

data class ImportPreviewResponse(
    val importId: String,
    val entity: String,
    val format: String,
    val rowsDetected: Int,
    val validRows: Int,
    val errors: List<String>,
    val sample: List<Map<String, String>>
)

data class ExportResponse(
    val fileName: String,
    val contentType: String,
    val content: String,
    val rows: Int
)
