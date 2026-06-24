package pro.logoff.wms.service

import jakarta.servlet.http.HttpServletRequest
import org.apache.poi.ss.usermodel.DataFormatter
import org.apache.poi.ss.usermodel.Row
import org.apache.poi.ss.usermodel.WorkbookFactory
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import pro.logoff.wms.domain.*
import java.io.InputStream
import java.math.BigDecimal
import java.time.Instant
import java.time.LocalDate
import java.util.UUID
import java.util.concurrent.atomic.AtomicLong

class WmsException(
    val status: HttpStatus,
    val code: String,
    override val message: String
) : RuntimeException(message)

@Service
class WmsService {
    private val sequence = AtomicLong(1000)
    private val modules = listOf(
        "dashboard",
        "receipts",
        "quarantine",
        "stock",
        "client-requests",
        "picking",
        "inventory",
        "clients",
        "services",
        "billing",
        "reports",
        "users",
        "ui-settings",
        "integrations"
    )

    private val roleDefinitions: Map<RoleKey, RoleDefinition> = buildRoleDefinitions()
    private val clients = linkedMapOf<String, Client>()
    private val products = linkedMapOf<String, Product>()
    private val stockItems = linkedMapOf<String, StockItem>()
    private val receipts = linkedMapOf<String, Receipt>()
    private val quarantine = linkedMapOf<String, QuarantineItem>()
    private val tasks = linkedMapOf<String, WarehouseTask>()
    private val supplies = linkedMapOf<String, MarketplaceSupply>()
    private val inventoryCounts = linkedMapOf<String, InventoryCount>()
    private val services = linkedMapOf<String, ServiceDefinition>()
    private val tariffs = mutableListOf<ClientTariff>()
    private val accruals = linkedMapOf<String, Accrual>()
    private val documents = linkedMapOf<String, BillingDocument>()
    private val audit = mutableListOf<AuditEvent>()
    private val uiSettings = linkedMapOf<String, UiSettings>()
    private val users = linkedMapOf<String, WmsUser>()
    private val passwords = linkedMapOf<String, String>()
    private val sessions = linkedMapOf<String, String>()

    init {
        seed()
    }

    fun roles(): List<RoleDefinition> = roleDefinitions.values.toList()

    fun login(request: LoginRequest): AuthResponse {
        val user = users.values.firstOrNull { it.login.equals(request.login.trim(), ignoreCase = true) }
            ?: throw WmsException(HttpStatus.UNAUTHORIZED, "auth.invalid", "Неверный логин или пароль")
        if (passwords[user.login] != request.password || user.status != EntityStatus.ACTIVE) {
            throw WmsException(HttpStatus.UNAUTHORIZED, "auth.invalid", "Неверный логин или пароль")
        }

        val token = UUID.randomUUID().toString()
        sessions[token] = user.id
        appendAudit(user.login, "auth.login", "user:${user.id}", "Пользователь вошел в систему")
        return AuthResponse(token, toSessionUser(user))
    }

    fun register(request: RegisterRequest): RegistrationResponse {
        val id = nextId("client")
        clients[id] = Client(
            id = id,
            name = request.companyName.trim(),
            legalName = request.companyName.trim(),
            inn = request.inn.trim(),
            contactName = request.contactName.trim(),
            phone = request.phone.trim(),
            email = request.email.trim(),
            status = EntityStatus.PENDING,
            debt = BigDecimal.ZERO,
            balanceLimit = BigDecimal("0.00")
        )
        appendAudit(
            "public",
            "client.registration",
            "client:$id",
            "Новая заявка регистрации: ${request.companyName}, ${request.email}. ${request.comment.orEmpty()}"
        )
        return RegistrationResponse(
            clientId = id,
            status = EntityStatus.PENDING,
            message = "Заявка принята. Менеджер LOGOff активирует доступ после проверки."
        )
    }

    fun me(request: HttpServletRequest): SessionUser = currentUser(request)

    fun currentUser(request: HttpServletRequest): SessionUser {
        val token = request.getHeader("Authorization")
            ?.removePrefix("Bearer ")
            ?.trim()
            ?.takeIf { it.isNotBlank() }
            ?: request.getHeader("X-WMS-Token")?.trim()
            ?: throw WmsException(HttpStatus.UNAUTHORIZED, "auth.required", "Нужна авторизация")
        val userId = sessions[token]
            ?: throw WmsException(HttpStatus.UNAUTHORIZED, "auth.session", "Сессия не найдена")
        val user = users[userId]
            ?: throw WmsException(HttpStatus.UNAUTHORIZED, "auth.user", "Пользователь не найден")
        return toSessionUser(user)
    }

    fun dashboard(user: SessionUser): DashboardResponse {
        requireAny(user, Permission.DASHBOARD_READ, Permission.CLIENT_PORTAL)
        val clientScope = user.clientId
        val scopedStock = stockItems.values.filterByClient(clientScope)
        val scopedTasks = tasks.values.filterByClient(clientScope)
        val scopedDocs = documents.values.filterByClient(clientScope)
        val scopedQuarantine = quarantine.values.filterByClient(clientScope)
        val scopedSupplies = supplies.values.filterByClient(clientScope)

        val kpis = KpiSet(
            receipts = receipts.values.filterByClient(clientScope).size,
            quarantine = scopedQuarantine.sumOf { it.quantity },
            availableStock = scopedStock.sumOf { it.available },
            activeTasks = scopedTasks.count { it.status == EntityStatus.OPEN || it.status == EntityStatus.IN_PROGRESS },
            supplies = scopedSupplies.size,
            debt = scopedDocs
                .filter { it.status == EntityStatus.OVERDUE || it.status == EntityStatus.OPEN }
                .fold(BigDecimal.ZERO) { acc, document -> acc + document.amount }
        )

        return DashboardResponse(
            kpis = kpis,
            modules = user.visibleModules.map { moduleSummary(it, user) },
            priorityTasks = scopedTasks.sortedWith(compareBy<WarehouseTask> { it.priority != "Срочно" }.thenBy { it.dueAt }).take(8),
            warehouseZones = listOf(
                WarehouseZone("A", "Приемка", 68, "online"),
                WarehouseZone("B", "Хранение A/B", 82, "high"),
                WarehouseZone("C", "Карантин", 41, "watch"),
                WarehouseZone("D", "Сборка", 74, "online"),
                WarehouseZone("E", "Упаковка", 59, "online"),
                WarehouseZone("F", "Отгрузка", 64, "online")
            ),
            timeline = audit.takeLast(8).reversed().map {
                TimelineEvent(it.at, it.action, it.details)
            },
            billingDocuments = scopedDocs.sortedByDescending { it.date }.take(6)
        )
    }

    fun listUsers(user: SessionUser): List<WmsUser> {
        requireAny(user, Permission.USERS_MANAGE, Permission.AUDIT_READ)
        return users.values.toList()
    }

    fun listClients(user: SessionUser): List<Client> {
        requireAny(user, Permission.CLIENTS_MANAGE, Permission.BILLING_MANAGE, Permission.RECEIPTS_MANAGE, Permission.CLIENT_PORTAL)
        return clients.values.filterByClient(user.clientId)
    }

    fun listProducts(user: SessionUser): List<Product> {
        requireAny(user, Permission.STOCK_READ, Permission.RECEIPTS_MANAGE, Permission.CLIENT_PORTAL)
        return products.values.filterByClient(user.clientId)
    }

    fun listStock(user: SessionUser): List<StockItem> {
        requireAny(user, Permission.STOCK_READ, Permission.CLIENT_PORTAL)
        return stockItems.values.filterByClient(user.clientId)
    }

    fun listReceipts(user: SessionUser): List<Receipt> {
        requireAny(user, Permission.RECEIPTS_MANAGE, Permission.CLIENT_PORTAL)
        return receipts.values.filterByClient(user.clientId)
    }

    @Synchronized
    fun createReceipt(user: SessionUser, request: ReceiptCreateRequest): Receipt {
        requirePermission(user, Permission.RECEIPTS_MANAGE)
        checkClientScope(user, request.clientId)
        val client = clientOrFail(request.clientId)
        val sourceDocument = request.sourceDocument.trim()
        if (sourceDocument.isBlank()) {
            throw WmsException(HttpStatus.BAD_REQUEST, "receipt.source_document", "Укажите документ-основание приемки")
        }
        if (request.lines.isEmpty()) {
            throw WmsException(HttpStatus.BAD_REQUEST, "receipt.lines", "Добавьте хотя бы одну строку приемки")
        }
        val normalizedLines = request.lines.mapIndexed { index, line ->
            normalizeReceiptLine(index, line)
        }

        val createdLines = normalizedLines.map { line ->
            val product = findProduct(client.id, line.sku, line.barcode)
            val state = when {
                line.accepted == 0 -> EntityStatus.DONE
                line.barcode.isNullOrBlank() || product == null -> {
                    createQuarantineFromLine(client, line)
                    EntityStatus.QUARANTINE
                }
                else -> {
                    addStock(client, product, line.accepted, "A-01-01")
                    EntityStatus.DONE
                }
            }
            ReceiptLine(product?.id, line.sku, line.name, line.expected, line.accepted, line.barcode, state)
        }
        val id = nextId("receipt")
        val receipt = Receipt(
            id = id,
            number = "ASN-${sequence.incrementAndGet()}",
            clientId = client.id,
            clientName = client.name,
            status = if (createdLines.any { it.state == EntityStatus.QUARANTINE }) EntityStatus.IN_PROGRESS else EntityStatus.DONE,
            createdAt = Instant.now(),
            sourceDocument = sourceDocument,
            lines = createdLines,
            discrepancyCount = createdLines.count { it.expected != it.accepted || it.state == EntityStatus.QUARANTINE }
        )
        receipts[id] = receipt
        appendAudit(user.login, "receipt.create", "receipt:$id", "Создана приемка ${receipt.number} для ${client.name}")
        return receipt
    }

    fun listQuarantine(user: SessionUser): List<QuarantineItem> {
        requireAny(user, Permission.QUARANTINE_MANAGE, Permission.STOCK_READ)
        return quarantine.values.filterByClient(user.clientId)
    }

    @Synchronized
    fun releaseQuarantine(user: SessionUser, itemId: String, request: QuarantineReleaseRequest): QuarantineItem {
        requirePermission(user, Permission.QUARANTINE_MANAGE)
        val item = quarantine[itemId]
            ?: throw WmsException(HttpStatus.NOT_FOUND, "quarantine.not_found", "Позиция карантина не найдена")
        val client = clientOrFail(item.clientId)
        val product = request.productId?.let { products[it] } ?: Product(
            id = nextId("product"),
            clientId = client.id,
            clientName = client.name,
            sku = request.sku,
            name = request.name,
            barcode = null,
            status = EntityStatus.ACTIVE,
            requiresMarking = true
        ).also { products[it.id] = it }

        val barcode = if (request.printInternalBarcode) {
            "LOGOFF-${client.id.takeLast(3).uppercase()}-${sequence.incrementAndGet()}"
        } else {
            product.barcode
        }
        val updatedProduct = product.copy(barcode = barcode, status = EntityStatus.ACTIVE)
        products[updatedProduct.id] = updatedProduct
        addStock(client, updatedProduct, item.quantity, "C-CLEAR")
        val released = item.copy(status = EntityStatus.APPROVED, candidateBarcode = barcode)
        quarantine[itemId] = released
        appendAudit(user.login, "quarantine.release", "quarantine:$itemId", "Карантин выпущен в остатки с ШК $barcode")
        return released
    }

    fun generateBarcode(user: SessionUser, productId: String): BarcodeIssue {
        requireAny(user, Permission.RECEIPTS_MANAGE, Permission.QUARANTINE_MANAGE)
        val product = products[productId]
            ?: throw WmsException(HttpStatus.NOT_FOUND, "product.not_found", "Товар не найден")
        checkClientScope(user, product.clientId)
        val barcode = "LOGOFF-${product.sku.uppercase()}-${sequence.incrementAndGet()}"
        products[productId] = product.copy(barcode = barcode)
        appendAudit(user.login, "barcode.generate", "product:$productId", "Сформирован внутренний ШК $barcode")
        return BarcodeIssue(productId, barcode, "${product.name} / ${product.sku}")
    }

    fun listTasks(user: SessionUser): List<WarehouseTask> {
        requireAny(user, Permission.TASKS_MANAGE, Permission.CLIENT_PORTAL)
        return tasks.values.filterByClient(user.clientId)
    }

    fun updateTaskStatus(user: SessionUser, id: String, request: TaskStatusRequest): WarehouseTask {
        requirePermission(user, Permission.TASKS_MANAGE)
        val task = tasks[id] ?: throw WmsException(HttpStatus.NOT_FOUND, "task.not_found", "Задание не найдено")
        val updated = task.copy(status = request.status)
        tasks[id] = updated
        appendAudit(user.login, "task.status", "task:$id", "Статус задания изменен на ${request.status}")
        return updated
    }

    fun listSupplies(user: SessionUser): List<MarketplaceSupply> {
        requireAny(user, Permission.MARKETPLACE_SUPPLIES_MANAGE, Permission.CLIENT_PORTAL)
        return supplies.values.filterByClient(user.clientId)
    }

    @Synchronized
    fun createSupply(user: SessionUser, request: MarketplaceSupplyRequest): MarketplaceSupply {
        requireAny(user, Permission.MARKETPLACE_SUPPLIES_MANAGE, Permission.CLIENT_PORTAL)
        checkClientScope(user, request.clientId)
        val client = clientOrFail(request.clientId)
        request.lines.forEach { line ->
            reserveStock(client.id, line.productId, line.quantity)
        }
        val id = nextId("supply")
        val supply = MarketplaceSupply(
            id = id,
            number = "MP-${sequence.incrementAndGet()}",
            clientId = client.id,
            clientName = client.name,
            marketplace = request.marketplace,
            status = EntityStatus.OPEN,
            reservedLines = request.lines.size,
            boxes = request.lines.sumOf { it.quantity }.coerceAtLeast(1) / 6 + 1,
            createdAt = Instant.now()
        )
        supplies[id] = supply
        val taskId = nextId("task")
        tasks[taskId] = WarehouseTask(
            id = taskId,
            kind = "PICK",
            title = "Сборка поставки ${supply.number}",
            clientId = client.id,
            clientName = client.name,
            zone = "D-02",
            assignee = "Смена сборки",
            status = EntityStatus.OPEN,
            priority = "Срочно",
            dueAt = Instant.now().plusSeconds(7200)
        )
        appendAudit(user.login, "supply.create", "supply:$id", "Создана поставка ${supply.marketplace} ${supply.number}")
        return supply
    }

    fun listInventoryCounts(user: SessionUser): List<InventoryCount> {
        requirePermission(user, Permission.INVENTORY_MANAGE)
        return inventoryCounts.values.toList()
    }

    fun createInventoryCount(user: SessionUser, request: InventoryCountRequest): InventoryCount {
        requirePermission(user, Permission.INVENTORY_MANAGE)
        val id = nextId("count")
        val count = InventoryCount(
            id = id,
            number = "COUNT-${sequence.incrementAndGet()}",
            type = request.type,
            zone = request.zone,
            status = EntityStatus.OPEN,
            discrepancies = 0,
            startedAt = Instant.now()
        )
        inventoryCounts[id] = count
        appendAudit(user.login, "inventory.start", "inventory:$id", "Открыта инвентаризация ${count.number} в зоне ${request.zone}")
        return count
    }

    fun listServices(user: SessionUser): List<ServiceDefinition> {
        requireAny(user, Permission.SERVICES_MANAGE, Permission.BILLING_MANAGE)
        return services.values.toList()
    }

    fun listTariffs(user: SessionUser): List<ClientTariff> {
        requireAny(user, Permission.SERVICES_MANAGE, Permission.BILLING_MANAGE)
        return tariffs.filter { user.clientId == null || it.clientId == user.clientId }
    }

    fun listAccruals(user: SessionUser): List<Accrual> {
        requireAny(user, Permission.BILLING_MANAGE, Permission.CLIENT_PORTAL)
        return accruals.values.filterByClient(user.clientId)
    }

    fun listDocuments(user: SessionUser): List<BillingDocument> {
        requireAny(user, Permission.BILLING_MANAGE, Permission.DOCUMENTS_READ, Permission.CLIENT_PORTAL)
        return documents.values.filterByClient(user.clientId)
    }

    fun createBillingDocument(user: SessionUser, request: BillingDocumentRequest): BillingDocument {
        requirePermission(user, Permission.BILLING_MANAGE)
        val client = clientOrFail(request.clientId)
        val prefix = when (request.type) {
            DocumentType.INVOICE -> "INV"
            DocumentType.ACT -> "ACT"
            DocumentType.CASH_RECEIPT -> "PKO"
            DocumentType.STOCK_REPORT -> "STOCK"
            DocumentType.INVENTORY_REPORT -> "COUNT"
        }
        val id = nextId("doc")
        val document = BillingDocument(
            id = id,
            type = request.type,
            number = "$prefix-${sequence.incrementAndGet()}",
            clientId = client.id,
            clientName = client.name,
            amount = request.amount,
            status = if (request.type == DocumentType.CASH_RECEIPT) EntityStatus.PAID else EntityStatus.OPEN,
            date = LocalDate.now(),
            dueDate = if (request.type == DocumentType.INVOICE) LocalDate.now().plusDays(7) else null,
            source = request.source
        )
        documents[id] = document
        appendAudit(user.login, "billing.document", "document:$id", "Создан документ ${document.number} на ${document.amount}")
        return document
    }

    fun reportsOverview(user: SessionUser): Map<String, Any> {
        requirePermission(user, Permission.REPORTS_READ)
        return mapOf(
            "stockAccuracy" to "99.1%",
            "receiptsToday" to receipts.size,
            "openQuarantine" to quarantine.values.count { it.status == EntityStatus.QUARANTINE },
            "activeClients" to clients.values.count { it.status == EntityStatus.ACTIVE },
            "billingOpen" to documents.values.count { it.status == EntityStatus.OPEN || it.status == EntityStatus.OVERDUE },
            "topServices" to services.values.take(4)
        )
    }

    fun importPreview(user: SessionUser, request: ImportPreviewRequest): ImportPreviewResponse {
        requirePermission(user, Permission.INTEGRATIONS_MANAGE)
        val lines = request.content.lines().filter { it.isNotBlank() }
        val delimiter = if (lines.firstOrNull()?.contains(";") == true) ";" else ","
        val headers = lines.firstOrNull()?.split(delimiter)?.map { it.trim() }.orEmpty()
        val sample = lines.drop(1).take(5).map { line ->
            val values = line.split(delimiter)
            headers.mapIndexed { index, header -> header to values.getOrElse(index) { "" }.trim() }.toMap()
        }
        val errors = mutableListOf<String>()
        if (headers.isEmpty()) {
            errors += "Файл пустой или не содержит заголовки"
        }
        if (request.entity !in setOf("clients", "products", "stock", "supplies", "services", "payments")) {
            errors += "Неизвестный тип данных: ${request.entity}"
        }
        val importId = nextId("import")
        appendAudit(user.login, "integration.import.preview", "import:$importId", "Предпросмотр импорта ${request.entity}/${request.format}")
        return ImportPreviewResponse(
            importId = importId,
            entity = request.entity,
            format = request.format,
            rowsDetected = lines.drop(1).size,
            validRows = (lines.drop(1).size - errors.size).coerceAtLeast(0),
            errors = errors,
            sample = sample
        )
    }

    @Synchronized
    fun importStockXlsx(
        user: SessionUser,
        clientId: String,
        fileName: String,
        content: InputStream,
        apply: Boolean
    ): StockImportResponse {
        requirePermission(user, Permission.INTEGRATIONS_MANAGE)
        checkClientScope(user, clientId)
        val client = clientOrFail(clientId)
        val parsed = parse1cStockWorkbook(content)
        if (parsed.rows.isEmpty()) {
            throw WmsException(HttpStatus.BAD_REQUEST, "import.stock.empty", "В файле не найдено валидных строк остатков")
        }

        val groupedStockRows = parsed.rows.groupBy { it.barcode to it.box }.size
        if (apply) {
            replaceClientStockFromImport(client, parsed.rows)
        }

        val importId = nextId("import")
        val action = if (apply) "загружены" else "проверены"
        appendAudit(
            user.login,
            if (apply) "integration.import.apply" else "integration.import.preview",
            "import:$importId",
            "Остатки 1С $action для ${client.name}: ${parsed.rows.size} строк, ${parsed.totalQuantity} шт"
        )
        return StockImportResponse(
            importId = importId,
            clientId = client.id,
            clientName = client.name,
            fileName = fileName.ifBlank { "1c-stock.xlsx" },
            rowsDetected = parsed.rowsDetected,
            validRows = parsed.rows.size,
            totalQuantity = parsed.totalQuantity,
            boxesDetected = parsed.rows.map { it.box }.distinct().size,
            productsDetected = parsed.rows.map { it.barcode }.distinct().size,
            stockRows = groupedStockRows,
            errors = parsed.errors.take(30) + if (parsed.errors.size > 30) listOf("Еще ошибок: ${parsed.errors.size - 30}") else emptyList(),
            sample = parsed.rows.take(6).map { it.toSampleMap() },
            applied = apply
        )
    }

    fun exportData(user: SessionUser, entity: String): ExportResponse {
        requirePermission(user, Permission.INTEGRATIONS_MANAGE)
        val rows = when (entity) {
            "stock" -> stockItems.values.filterByClient(user.clientId)
                .map { listOf(it.clientName, it.sku, it.productName, it.location, it.available, it.reserved, it.quarantine).joinToString(";") }
            "billing" -> documents.values.filterByClient(user.clientId)
                .map { listOf(it.number, it.clientName, it.type, it.amount, it.status, it.date).joinToString(";") }
            "clients" -> clients.values.filterByClient(user.clientId)
                .map { listOf(it.name, it.legalName, it.inn, it.status, it.debt).joinToString(";") }
            else -> throw WmsException(HttpStatus.BAD_REQUEST, "export.entity", "Экспорт $entity пока не поддержан")
        }
        val header = when (entity) {
            "stock" -> "client;sku;product;location;available;reserved;quarantine"
            "billing" -> "number;client;type;amount;status;date"
            "clients" -> "name;legalName;inn;status;debt"
            else -> ""
        }
        appendAudit(user.login, "integration.export", "export:$entity", "Сформирован экспорт $entity")
        return ExportResponse(
            fileName = "logoff-$entity-${LocalDate.now()}.csv",
            contentType = "text/csv; charset=utf-8",
            content = (listOf(header) + rows).joinToString("\n"),
            rows = rows.size
        )
    }

    fun getUiSettings(user: SessionUser): UiSettings {
        requireAny(user, Permission.UI_SETTINGS_MANAGE, Permission.CLIENT_PORTAL)
        return uiSettings[user.id] ?: UiSettings(user.id, user.visibleModules.firstOrNull() ?: "dashboard", user.visibleModules)
    }

    fun updateUiSettings(user: SessionUser, request: UiSettingsRequest): UiSettings {
        requireAny(user, Permission.UI_SETTINGS_MANAGE, Permission.CLIENT_PORTAL)
        val allowed = user.visibleModules.toSet()
        val visible = request.visibleModules.filter { it in allowed }.ifEmpty { user.visibleModules }
        val settings = UiSettings(
            userId = user.id,
            startModule = request.startModule.takeIf { it in visible } ?: visible.first(),
            visibleModules = visible,
            hiddenModules = allowed.minus(visible.toSet()).toList(),
            denseMode = request.denseMode
        )
        uiSettings[user.id] = settings
        appendAudit(user.login, "ui.settings", "user:${user.id}", "Обновлены настройки интерфейса")
        return settings
    }

    fun auditEvents(user: SessionUser): List<AuditEvent> {
        requirePermission(user, Permission.AUDIT_READ)
        return audit.reversed()
    }

    private fun buildRoleDefinitions(): Map<RoleKey, RoleDefinition> {
        val allPermissions = Permission.entries.toSet()
        val warehouseModules = listOf("dashboard", "receipts", "quarantine", "stock", "picking", "inventory")
        val financeModules = listOf("dashboard", "clients", "services", "billing", "reports", "integrations")
        return mapOf(
            RoleKey.ADMIN to RoleDefinition(RoleKey.ADMIN, RoleKey.ADMIN.title, allPermissions, modules),
            RoleKey.DIRECTOR to RoleDefinition(
                RoleKey.DIRECTOR,
                RoleKey.DIRECTOR.title,
                setOf(
                    Permission.DASHBOARD_READ,
                    Permission.CLIENTS_MANAGE,
                    Permission.STOCK_READ,
                    Permission.DOCUMENTS_READ,
                    Permission.REPORTS_READ,
                    Permission.BILLING_MANAGE,
                    Permission.AUDIT_READ,
                    Permission.UI_SETTINGS_MANAGE
                ),
                modules.minus("receipts").minus("quarantine").minus("picking")
            ),
            RoleKey.OWNER to RoleDefinition(RoleKey.OWNER, RoleKey.OWNER.title, allPermissions.minus(Permission.ROLES_MANAGE), modules),
            RoleKey.WAREHOUSE to RoleDefinition(
                RoleKey.WAREHOUSE,
                RoleKey.WAREHOUSE.title,
                setOf(
                    Permission.DASHBOARD_READ,
                    Permission.RECEIPTS_MANAGE,
                    Permission.QUARANTINE_MANAGE,
                    Permission.STOCK_READ,
                    Permission.TASKS_MANAGE,
                    Permission.MARKETPLACE_SUPPLIES_MANAGE,
                    Permission.INVENTORY_MANAGE,
                    Permission.UI_SETTINGS_MANAGE
                ),
                warehouseModules
            ),
            RoleKey.SHIFT_LEAD to RoleDefinition(
                RoleKey.SHIFT_LEAD,
                RoleKey.SHIFT_LEAD.title,
                setOf(
                    Permission.DASHBOARD_READ,
                    Permission.RECEIPTS_MANAGE,
                    Permission.QUARANTINE_MANAGE,
                    Permission.STOCK_READ,
                    Permission.STOCK_ADJUST,
                    Permission.TASKS_MANAGE,
                    Permission.MARKETPLACE_SUPPLIES_MANAGE,
                    Permission.INVENTORY_MANAGE,
                    Permission.REPORTS_READ,
                    Permission.UI_SETTINGS_MANAGE
                ),
                warehouseModules + "reports"
            ),
            RoleKey.ACCOUNTANT to RoleDefinition(
                RoleKey.ACCOUNTANT,
                RoleKey.ACCOUNTANT.title,
                setOf(
                    Permission.DASHBOARD_READ,
                    Permission.CLIENTS_MANAGE,
                    Permission.SERVICES_MANAGE,
                    Permission.BILLING_MANAGE,
                    Permission.DOCUMENTS_READ,
                    Permission.REPORTS_READ,
                    Permission.INTEGRATIONS_MANAGE,
                    Permission.UI_SETTINGS_MANAGE
                ),
                financeModules
            ),
            RoleKey.MANAGER to RoleDefinition(
                RoleKey.MANAGER,
                RoleKey.MANAGER.title,
                setOf(
                    Permission.DASHBOARD_READ,
                    Permission.CLIENTS_MANAGE,
                    Permission.RECEIPTS_MANAGE,
                    Permission.QUARANTINE_MANAGE,
                    Permission.STOCK_READ,
                    Permission.MARKETPLACE_SUPPLIES_MANAGE,
                    Permission.DOCUMENTS_READ,
                    Permission.REPORTS_READ,
                    Permission.INTEGRATIONS_MANAGE,
                    Permission.UI_SETTINGS_MANAGE
                ),
                listOf("dashboard", "clients", "receipts", "quarantine", "stock", "client-requests", "picking", "reports", "integrations")
            ),
            RoleKey.TAX_ACCOUNTANT to RoleDefinition(
                RoleKey.TAX_ACCOUNTANT,
                RoleKey.TAX_ACCOUNTANT.title,
                setOf(
                    Permission.DASHBOARD_READ,
                    Permission.SERVICES_MANAGE,
                    Permission.BILLING_MANAGE,
                    Permission.DOCUMENTS_READ,
                    Permission.REPORTS_READ,
                    Permission.UI_SETTINGS_MANAGE
                ),
                listOf("dashboard", "services", "billing", "reports")
            ),
            RoleKey.CLIENT to RoleDefinition(
                RoleKey.CLIENT,
                RoleKey.CLIENT.title,
                setOf(
                    Permission.DASHBOARD_READ,
                    Permission.CLIENT_PORTAL,
                    Permission.STOCK_READ,
                    Permission.MARKETPLACE_SUPPLIES_MANAGE,
                    Permission.DOCUMENTS_READ,
                    Permission.UI_SETTINGS_MANAGE
                ),
                listOf("dashboard", "stock", "client-requests", "billing", "reports")
            ),
            RoleKey.AUDITOR to RoleDefinition(
                RoleKey.AUDITOR,
                RoleKey.AUDITOR.title,
                setOf(
                    Permission.DASHBOARD_READ,
                    Permission.STOCK_READ,
                    Permission.DOCUMENTS_READ,
                    Permission.REPORTS_READ,
                    Permission.AUDIT_READ,
                    Permission.UI_SETTINGS_MANAGE
                ),
                listOf("dashboard", "stock", "billing", "reports", "users")
            )
        )
    }

    private fun seed() {
        val alfa = Client(
            id = "client-alfa",
            name = "Альфа Косметик",
            legalName = "ООО Альфа Косметик",
            inn = "7701001111",
            contactName = "Анна Белова",
            phone = "+7 999 100-10-10",
            email = "ops@alfa.example",
            status = EntityStatus.ACTIVE,
            debt = BigDecimal("42850.00"),
            balanceLimit = BigDecimal("250000.00")
        )
        val beta = Client(
            id = "client-beta",
            name = "Beta Home",
            legalName = "ИП Петров Петр Петрович",
            inn = "771200222233",
            contactName = "Петр Петров",
            phone = "+7 999 200-20-20",
            email = "logistics@beta.example",
            status = EntityStatus.ACTIVE,
            debt = BigDecimal("12900.00"),
            balanceLimit = BigDecimal("120000.00")
        )
        val lukin = Client(
            id = "client-lukin",
            name = "ИП Лукин И.И.",
            legalName = "ИП Лукин И.И.",
            inn = "",
            contactName = "Илья Лукин",
            phone = "",
            email = "lukin@example.com",
            status = EntityStatus.ACTIVE,
            debt = BigDecimal.ZERO,
            balanceLimit = BigDecimal("120000.00")
        )
        clients[alfa.id] = alfa
        clients[beta.id] = beta
        clients[lukin.id] = lukin

        addUser("user-admin", "admin", "admin123", "Администратор LOGOff", RoleKey.ADMIN, null)
        addUser("user-sklad", "sklad", "sklad123", "Складская смена", RoleKey.WAREHOUSE, null)
        addUser("user-manager", "manager", "manager123", "Менеджер клиентов", RoleKey.MANAGER, null)
        addUser("user-buh", "buh", "buh123", "Бухгалтер", RoleKey.ACCOUNTANT, null)
        addUser("user-tax", "tax", "tax123", "Бухгалтер-таксировщик", RoleKey.TAX_ACCOUNTANT, null)
        addUser("user-client", "client", "client123", "Кабинет Альфа", RoleKey.CLIENT, alfa.id)
        addUser("user-lukin", "lukin", "lukin123", "Кабинет Лукин", RoleKey.CLIENT, lukin.id)

        val serum = Product("prod-serum", alfa.id, alfa.name, "ALF-SER-30", "Сыворотка 30 мл", "4607000000011", EntityStatus.ACTIVE)
        val cream = Product("prod-cream", alfa.id, alfa.name, "ALF-CRM-50", "Крем 50 мл", "4607000000028", EntityStatus.ACTIVE)
        val lamp = Product("prod-lamp", beta.id, beta.name, "BTH-LMP-01", "Настольная лампа", "4608000000100", EntityStatus.ACTIVE)
        listOf(serum, cream, lamp).forEach { products[it.id] = it }

        stockItems["stock-1"] = StockItem("stock-1", alfa.id, alfa.name, serum.id, serum.name, serum.sku, serum.barcode, "B-03-12", 480, 62, 0)
        stockItems["stock-2"] = StockItem("stock-2", alfa.id, alfa.name, cream.id, cream.name, cream.sku, cream.barcode, "B-04-08", 240, 30, 0)
        stockItems["stock-3"] = StockItem("stock-3", beta.id, beta.name, lamp.id, lamp.name, lamp.sku, lamp.barcode, "E-01-04", 96, 10, 0)

        quarantine["q-1"] = QuarantineItem(
            id = "q-1",
            clientId = alfa.id,
            clientName = alfa.name,
            productName = "Патчи гидрогелевые",
            sku = "ALF-PTH-01",
            quantity = 36,
            reason = "Нет ШК на коробах",
            zone = "C-Q-02",
            status = EntityStatus.QUARANTINE,
            receivedAt = Instant.now().minusSeconds(3600),
            candidateBarcode = null
        )

        receipts["receipt-1"] = Receipt(
            id = "receipt-1",
            number = "ASN-4821",
            clientId = alfa.id,
            clientName = alfa.name,
            status = EntityStatus.IN_PROGRESS,
            createdAt = Instant.now().minusSeconds(7200),
            sourceDocument = "УПД 77 от ${LocalDate.now()}",
            lines = listOf(
                ReceiptLine(serum.id, serum.sku, serum.name, 120, 120, serum.barcode, EntityStatus.DONE),
                ReceiptLine(null, "ALF-PTH-01", "Патчи гидрогелевые", 36, 36, null, EntityStatus.QUARANTINE)
            ),
            discrepancyCount = 1
        )

        tasks["task-1"] = WarehouseTask("task-1", "QC", "Разобрать карантин без ШК", alfa.id, alfa.name, "C-Q-02", "Ковалев", EntityStatus.OPEN, "Срочно", Instant.now().plusSeconds(1800))
        tasks["task-2"] = WarehouseTask("task-2", "PICK", "Собрать поставку WB-118", alfa.id, alfa.name, "D-02", "Орлов", EntityStatus.IN_PROGRESS, "Срочно", Instant.now().plusSeconds(3600))
        tasks["task-3"] = WarehouseTask("task-3", "COUNT", "Циклический пересчет E-01", beta.id, beta.name, "E-01", "Иванова", EntityStatus.OPEN, "Норма", Instant.now().plusSeconds(10800))

        supplies["supply-1"] = MarketplaceSupply("supply-1", "WB-118", alfa.id, alfa.name, "Wildberries", EntityStatus.IN_PROGRESS, 2, 18, Instant.now().minusSeconds(5400))
        inventoryCounts["count-1"] = InventoryCount("count-1", "COUNT-118", "Циклическая", "E-01", EntityStatus.OPEN, 0, Instant.now().minusSeconds(1200))

        val receiving = ServiceDefinition("svc-receiving", "Приемка единицы", "шт", BigDecimal("4.50"))
        val storage = ServiceDefinition("svc-storage", "Хранение паллето-места", "день", BigDecimal("38.00"))
        val pick = ServiceDefinition("svc-pick", "Сборка строки заказа", "строка", BigDecimal("9.00"))
        listOf(receiving, storage, pick).forEach { services[it.id] = it }
        tariffs += ClientTariff(alfa.id, alfa.name, receiving.id, receiving.name, BigDecimal("4.10"))
        tariffs += ClientTariff(alfa.id, alfa.name, pick.id, pick.name, BigDecimal("8.70"))
        tariffs += ClientTariff(beta.id, beta.name, storage.id, storage.name, BigDecimal("35.00"))

        accruals["acr-1"] = Accrual("acr-1", alfa.id, alfa.name, receiving.name, BigDecimal("120"), BigDecimal("4.10"), BigDecimal("492.00"), LocalDate.now(), EntityStatus.APPROVED)
        accruals["acr-2"] = Accrual("acr-2", alfa.id, alfa.name, pick.name, BigDecimal("64"), BigDecimal("8.70"), BigDecimal("556.80"), LocalDate.now(), EntityStatus.APPROVED)

        documents["doc-1"] = BillingDocument("doc-1", DocumentType.INVOICE, "INV-2406-001", alfa.id, alfa.name, BigDecimal("42850.00"), EntityStatus.OPEN, LocalDate.now().minusDays(1), LocalDate.now().plusDays(6), "Начисления за июнь")
        documents["doc-2"] = BillingDocument("doc-2", DocumentType.ACT, "ACT-2406-001", alfa.id, alfa.name, BigDecimal("42850.00"), EntityStatus.DRAFT, LocalDate.now().minusDays(1), null, "Начисления за июнь")
        documents["doc-3"] = BillingDocument("doc-3", DocumentType.CASH_RECEIPT, "PKO-2406-003", beta.id, beta.name, BigDecimal("12000.00"), EntityStatus.PAID, LocalDate.now().minusDays(2), null, "Оплата счета")

        users.values.forEach { user ->
            val role = roleDefinitions.getValue(user.role)
            uiSettings[user.id] = UiSettings(user.id, role.visibleModules.first(), role.visibleModules)
        }

        appendAudit("system", "seed.ready", "system", "Демо-данные WMS LOGOff загружены")
    }

    private fun addUser(id: String, login: String, password: String, displayName: String, role: RoleKey, clientId: String?) {
        users[id] = WmsUser(id, login, displayName, role, clientId, EntityStatus.ACTIVE)
        passwords[login] = password
    }

    private fun addStock(client: Client, product: Product, quantity: Int, location: String) {
        val existing = stockItems.values.firstOrNull { it.productId == product.id && it.location == location }
        if (existing == null) {
            val id = nextId("stock")
            stockItems[id] = StockItem(id, client.id, client.name, product.id, product.name, product.sku, product.barcode, location, quantity, 0, 0)
        } else {
            stockItems[existing.id] = existing.copy(available = existing.available + quantity)
        }
    }

    private fun reserveStock(clientId: String, productId: String, quantity: Int) {
        var remaining = quantity
        val rows = stockItems.values.filter { it.clientId == clientId && it.productId == productId && it.available > 0 }
        rows.forEach { row ->
            if (remaining <= 0) return@forEach
            val take = minOf(row.available, remaining)
            stockItems[row.id] = row.copy(available = row.available - take, reserved = row.reserved + take)
            remaining -= take
        }
        if (remaining > 0) {
            throw WmsException(HttpStatus.CONFLICT, "stock.reserve", "Недостаточно доступного остатка для резервирования")
        }
    }

    private fun createQuarantineFromLine(client: Client, line: ReceiptLineRequest) {
        val id = nextId("q")
        quarantine[id] = QuarantineItem(
            id = id,
            clientId = client.id,
            clientName = client.name,
            productName = line.name,
            sku = line.sku,
            quantity = line.accepted,
            reason = if (line.barcode.isNullOrBlank()) "Нет ШК" else "ШК не найден в карточках",
            zone = "C-Q-01",
            status = EntityStatus.QUARANTINE,
            receivedAt = Instant.now(),
            candidateBarcode = line.barcode
        )
    }

    private fun findProduct(clientId: String, sku: String, barcode: String?): Product? {
        val scannedBarcode = barcode?.takeIf { it.isNotBlank() }
        return products.values.firstOrNull {
            it.clientId == clientId && when {
                scannedBarcode != null -> it.barcode == scannedBarcode
                else -> it.sku.equals(sku, ignoreCase = true)
            }
        }
    }

    private fun normalizeReceiptLine(index: Int, line: ReceiptLineRequest): ReceiptLineRequest {
        val row = index + 1
        val sku = line.sku.trim()
        val name = line.name.trim()
        val barcode = line.barcode?.trim()?.takeIf { it.isNotBlank() }
        if (sku.isBlank()) {
            throw WmsException(HttpStatus.BAD_REQUEST, "receipt.line.sku", "Строка $row: укажите SKU")
        }
        if (name.isBlank()) {
            throw WmsException(HttpStatus.BAD_REQUEST, "receipt.line.name", "Строка $row: укажите название товара")
        }
        if (line.expected < 0 || line.accepted < 0) {
            throw WmsException(HttpStatus.BAD_REQUEST, "receipt.line.quantity", "Строка $row: количество не может быть отрицательным")
        }
        if (line.expected == 0 && line.accepted == 0) {
            throw WmsException(HttpStatus.BAD_REQUEST, "receipt.line.quantity", "Строка $row: укажите план или факт")
        }
        return line.copy(sku = sku, name = name, barcode = barcode)
    }

    private fun moduleSummary(id: String, user: SessionUser): ModuleSummary {
        val clientScope = user.clientId
        return when (id) {
            "dashboard" -> ModuleSummary(id, "Обзор", "layout-dashboard", "${stockItems.values.filterByClient(clientScope).sumOf { it.available }} шт", "online")
            "receipts" -> ModuleSummary(id, "Приемка", "package-plus", "${receipts.values.filterByClient(clientScope).count()} ASN", "work")
            "quarantine" -> ModuleSummary(id, "Карантин", "shield-alert", "${quarantine.values.filterByClient(clientScope).sumOf { it.quantity }} шт", "attention")
            "stock" -> ModuleSummary(id, "Остатки", "boxes", "${stockItems.values.filterByClient(clientScope).size} строк", "online")
            "client-requests" -> ModuleSummary(id, "Заявки клиентов", "file-plus-2", "${supplies.values.filterByClient(clientScope).size} поставок", "work")
            "picking" -> ModuleSummary(id, "Сборка", "list-checks", "${tasks.values.filterByClient(clientScope).count { it.kind == "PICK" }} задач", "work")
            "inventory" -> ModuleSummary(id, "Инвентаризация", "clipboard-check", "${inventoryCounts.size} активна", "online")
            "clients" -> ModuleSummary(id, "Клиенты", "building-2", "${clients.size} клиентов", "online")
            "services" -> ModuleSummary(id, "Услуги", "receipt-text", "${services.size} услуг", "online")
            "billing" -> ModuleSummary(id, "Финансы", "wallet-cards", "${documents.values.filterByClient(clientScope).count()} документов", "money")
            "reports" -> ModuleSummary(id, "Отчеты", "chart-no-axes-column-increasing", "12 витрин", "online")
            "users" -> ModuleSummary(id, "Пользователи", "users", "${users.size} ролей", "admin")
            "ui-settings" -> ModuleSummary(id, "Интерфейс", "sliders-horizontal", "${user.visibleModules.size} окон", "admin")
            "integrations" -> ModuleSummary(id, "1С и файлы", "upload-cloud", "CSV/XLSX/XML", "sync")
            else -> ModuleSummary(id, id, "panel-top", "готово", "online")
        }
    }

    private fun toSessionUser(user: WmsUser): SessionUser {
        val role = roleDefinitions.getValue(user.role)
        val settings = uiSettings[user.id]
        return SessionUser(
            id = user.id,
            login = user.login,
            displayName = user.displayName,
            role = user.role,
            roleTitle = role.title,
            clientId = user.clientId,
            permissions = role.permissions,
            visibleModules = settings?.visibleModules ?: role.visibleModules
        )
    }

    private fun requirePermission(user: SessionUser, permission: Permission) {
        if (permission !in user.permissions) {
            throw WmsException(HttpStatus.FORBIDDEN, "access.denied", "Недостаточно прав: $permission")
        }
    }

    private fun requireAny(user: SessionUser, vararg permissions: Permission) {
        if (permissions.none { it in user.permissions }) {
            throw WmsException(HttpStatus.FORBIDDEN, "access.denied", "Недостаточно прав")
        }
    }

    private fun checkClientScope(user: SessionUser, clientId: String) {
        if (user.clientId != null && user.clientId != clientId) {
            throw WmsException(HttpStatus.FORBIDDEN, "access.client", "Нет доступа к данным другого клиента")
        }
    }

    private fun clientOrFail(id: String): Client =
        clients[id] ?: throw WmsException(HttpStatus.NOT_FOUND, "client.not_found", "Клиент не найден")

    private fun appendAudit(actor: String, action: String, entity: String, details: String) {
        audit += AuditEvent(nextId("audit"), Instant.now(), actor, action, entity, details)
    }

    private fun parse1cStockWorkbook(content: InputStream): ParsedStockImport {
        content.use { stream ->
            WorkbookFactory.create(stream).use { workbook ->
                val formatter = DataFormatter()
                val sheet = workbook.getSheet("TDSheet") ?: workbook.getSheetAt(0)
                val headerRow = (sheet.firstRowNum..minOf(sheet.lastRowNum, sheet.firstRowNum + 30))
                    .asSequence()
                    .mapNotNull { sheet.getRow(it) }
                    .firstOrNull { findStockHeaderRow(it, formatter) != null }
                    ?: throw WmsException(HttpStatus.BAD_REQUEST, "import.stock.headers", "Не найдены заголовки остатков 1С")
                val headers = findStockHeaderRow(headerRow, formatter)
                    ?: throw WmsException(HttpStatus.BAD_REQUEST, "import.stock.headers", "Не найдены заголовки остатков 1С")

                val candidates = mutableListOf<StockImportCandidate>()
                var currentBox = ""
                for (rowIndex in (headerRow.rowNum + 1)..sheet.lastRowNum) {
                    val row = sheet.getRow(rowIndex)
                    val boxFromCell = cellText(row, headers.box, formatter)
                    if (boxFromCell.isNotBlank()) {
                        currentBox = boxFromCell
                    }
                    val barcode = cellText(row, headers.barcode, formatter)
                    val name = cellText(row, headers.name, formatter)
                    val quantity = cellText(row, headers.quantity, formatter)
                    val color = headers.color?.let { cellText(row, it, formatter) }.orEmpty()
                    val size = headers.size?.let { cellText(row, it, formatter) }.orEmpty()

                    if (barcode.isBlank() && name.isBlank() && quantity.isBlank()) {
                        continue
                    }

                    candidates += StockImportCandidate(
                        rowNumber = rowIndex + 1,
                        box = boxFromCell.ifBlank { currentBox },
                        barcode = barcode,
                        name = name,
                        color = cleanImportAttribute(color),
                        size = cleanImportAttribute(size),
                        quantity = quantity
                    )
                }

                val nameByBarcode = candidates
                    .filter { it.barcode.isNotBlank() && it.name.isNotBlank() }
                    .groupBy { it.barcode }
                    .mapValues { (_, rows) -> rows.first().name }
                val rows = mutableListOf<StockImportRow>()
                val errors = mutableListOf<String>()
                candidates.forEach { candidate ->
                    val name = candidate.name.ifBlank { nameByBarcode[candidate.barcode].orEmpty() }
                    val quantity = parseImportQuantity(candidate.quantity)
                    when {
                        candidate.box.isBlank() -> errors += "Строка ${candidate.rowNumber}: не указан короб"
                        candidate.barcode.isBlank() -> errors += "Строка ${candidate.rowNumber}: не указан штрихкод"
                        name.isBlank() -> errors += "Строка ${candidate.rowNumber}: не указано наименование"
                        quantity == null -> errors += "Строка ${candidate.rowNumber}: некорректное количество '${candidate.quantity}'"
                        else -> rows += StockImportRow(
                            rowNumber = candidate.rowNumber,
                            box = candidate.box,
                            barcode = candidate.barcode,
                            name = name,
                            color = candidate.color,
                            size = candidate.size,
                            quantity = quantity
                        )
                    }
                }

                return ParsedStockImport(candidates.size, rows, errors)
            }
        }
    }

    private fun findStockHeaderRow(row: Row?, formatter: DataFormatter): StockImportHeaders? {
        if (row == null) return null
        val maxColumn = row.lastCellNum.toInt().coerceAtLeast(0)
        val headers = (0 until maxColumn).associateWith { column ->
            normalizeHeader(cellText(row, column, formatter))
        }
        val box = headers.firstColumn { it == "короб" || it == "box" }
        val barcode = headers.firstColumn { it.contains("штрих") || it.contains("barcode") }
        val name = headers.firstColumn { it.contains("наименование") || it == "name" || it == "product" }
        val quantity = headers.firstColumn { it.contains("количество") && (it.contains("остаток") || it.contains("остат")) }
        if (box == null || barcode == null || name == null || quantity == null) {
            return null
        }
        val color = headers.firstColumn { it == "цвет" || it == "color" }
        val size = headers.firstColumn { it == "размер" || it == "size" }
        return StockImportHeaders(box, barcode, name, color, size, quantity)
    }

    private fun cellText(row: Row?, column: Int, formatter: DataFormatter): String =
        row?.getCell(column)
            ?.let { formatter.formatCellValue(it) }
            ?.replace('\u00A0', ' ')
            ?.trim()
            .orEmpty()

    private fun normalizeHeader(value: String): String =
        value.lowercase()
            .replace('ё', 'е')
            .replace(Regex("[^a-zа-я0-9]+"), " ")
            .trim()

    private fun cleanImportAttribute(value: String): String =
        value.takeUnless { it.equals("#N/A", ignoreCase = true) || it.equals("N/A", ignoreCase = true) }.orEmpty()

    private fun parseImportQuantity(value: String): Int? {
        val normalized = value
            .replace('\u00A0', ' ')
            .replace(" ", "")
            .replace(",", ".")
            .trim()
        if (normalized.isBlank()) return null
        val decimal = normalized.toBigDecimalOrNull() ?: return null
        if (decimal <= BigDecimal.ZERO) return null
        val normalizedDecimal = decimal.stripTrailingZeros()
        if (normalizedDecimal.scale() > 0) return null
        return runCatching { decimal.intValueExact() }.getOrNull()
    }

    private fun replaceClientStockFromImport(client: Client, rows: List<StockImportRow>) {
        stockItems.entries.removeIf { it.value.clientId == client.id }

        val productsByBarcode = products.values
            .filter { it.clientId == client.id && !it.barcode.isNullOrBlank() }
            .associateBy { it.barcode.orEmpty() }
        val importedProducts = rows.groupBy { it.barcode }.mapValues { (_, barcodeRows) ->
            val first = barcodeRows.first()
            val product = productsByBarcode[first.barcode]
                ?: products.values.firstOrNull { it.clientId == client.id && it.sku.equals(first.barcode, ignoreCase = true) }
                ?: Product(
                    id = nextId("product"),
                    clientId = client.id,
                    clientName = client.name,
                    sku = first.barcode,
                    name = first.productDisplayName(),
                    barcode = first.barcode,
                    status = EntityStatus.ACTIVE
                )
            product.copy(
                clientName = client.name,
                sku = first.barcode,
                name = first.productDisplayName(),
                barcode = first.barcode,
                status = EntityStatus.ACTIVE
            ).also { products[it.id] = it }
        }

        rows.groupBy { it.barcode to it.box }.values.forEach { stockRows ->
            val first = stockRows.first()
            val product = importedProducts.getValue(first.barcode)
            val id = nextId("stock")
            stockItems[id] = StockItem(
                id = id,
                clientId = client.id,
                clientName = client.name,
                productId = product.id,
                productName = product.name,
                sku = product.sku,
                barcode = product.barcode,
                location = first.box,
                available = stockRows.sumOf { it.quantity },
                reserved = 0,
                quarantine = 0
            )
        }
    }

    private fun StockImportRow.productDisplayName(): String {
        val attributes = listOf(color, size).filter { it.isNotBlank() }.distinct()
        return if (attributes.isEmpty()) name else "$name (${attributes.joinToString(", ")})"
    }

    private fun StockImportRow.toSampleMap(): Map<String, String> = mapOf(
        "Строка" to rowNumber.toString(),
        "Короб" to box,
        "Штрих код" to barcode,
        "Наименование" to productDisplayName(),
        "Количество" to quantity.toString()
    )

    private fun Map<Int, String>.firstColumn(predicate: (String) -> Boolean): Int? =
        entries.firstOrNull { predicate(it.value) }?.key

    private data class StockImportHeaders(
        val box: Int,
        val barcode: Int,
        val name: Int,
        val color: Int?,
        val size: Int?,
        val quantity: Int
    )

    private data class StockImportCandidate(
        val rowNumber: Int,
        val box: String,
        val barcode: String,
        val name: String,
        val color: String,
        val size: String,
        val quantity: String
    )

    private data class StockImportRow(
        val rowNumber: Int,
        val box: String,
        val barcode: String,
        val name: String,
        val color: String,
        val size: String,
        val quantity: Int
    )

    private data class ParsedStockImport(
        val rowsDetected: Int,
        val rows: List<StockImportRow>,
        val errors: List<String>
    ) {
        val totalQuantity: Int = rows.sumOf { it.quantity }
    }

    private fun nextId(prefix: String): String = "$prefix-${sequence.incrementAndGet()}"

    private fun <T> Collection<T>.filterByClient(clientId: String?): List<T> {
        if (clientId == null) return toList()
        return filter {
            when (it) {
                is Client -> it.id == clientId
                is Product -> it.clientId == clientId
                is StockItem -> it.clientId == clientId
                is Receipt -> it.clientId == clientId
                is QuarantineItem -> it.clientId == clientId
                is WarehouseTask -> it.clientId == clientId
                is MarketplaceSupply -> it.clientId == clientId
                is BillingDocument -> it.clientId == clientId
                is Accrual -> it.clientId == clientId
                else -> true
            }
        }
    }
}
