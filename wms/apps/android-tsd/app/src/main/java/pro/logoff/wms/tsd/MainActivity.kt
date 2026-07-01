package pro.logoff.wms.tsd

import android.app.AlertDialog
import android.graphics.BitmapFactory
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.text.InputType
import android.view.Gravity
import android.view.KeyEvent
import android.view.ViewGroup
import android.widget.ArrayAdapter
import android.widget.Button
import android.widget.EditText
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.Spinner
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import pro.logoff.wms.tsd.auth.TsdSessionStore
import pro.logoff.wms.tsd.data.OperationOutbox
import pro.logoff.wms.tsd.data.PendingOperation
import pro.logoff.wms.tsd.data.TsdDatabase
import pro.logoff.wms.tsd.network.AuthLoginRequest
import pro.logoff.wms.tsd.network.TsdClientSummary
import pro.logoff.wms.tsd.network.TsdSkuSummary
import pro.logoff.wms.tsd.network.WmsApiFactory
import pro.logoff.wms.tsd.sync.TsdSyncRunner
import retrofit2.HttpException
import java.net.URL
import java.util.UUID

private const val BLUE = "#0B79D0"
private const val LIGHT_BLUE = "#E8F3FF"
private const val DARK = "#1D2733"
private const val DANGER = "#C62828"
private const val LOGO_BLUE = "#1976D2"
private const val SERVICE_GRAY = "#E9EEF2"

class MainActivity : ComponentActivity() {
    private lateinit var outbox: OperationOutbox
    private lateinit var sessionStore: TsdSessionStore
    private lateinit var root: LinearLayout
    private lateinit var scrollView: ScrollView
    private lateinit var statusView: TextView

    private var clients: List<TsdClientSummary> = emptyList()
    private var selectedClientId = ""
    private var screen = TsdScreen.MENU
    private var legacyMode = TsdOperationMode.INVENTORY

    private var receiptId = createReceiptId()
    private var receiptStage = ReceiptStage.NOT_STARTED
    private var currentBox = ""
    private var pendingBarcode = ""
    private var pendingSku: TsdSkuSummary? = null
    private val confirmedBarcodes = linkedSetOf<String>()
    private val confirmedSkuByBarcode = linkedMapOf<String, TsdSkuSummary>()
    private val currentBoxLines = mutableListOf<ReceiptLine>()
    private val closedBoxes = mutableListOf<ClosedReceiptBox>()
    private val scannedKiz = linkedSetOf<String>()

    private var statusText = "Офлайн · очередь: 0"

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        outbox = OperationOutbox(TsdDatabase.get(this).operationDao())
        sessionStore = TsdSessionStore(this)
        root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(24, 24, 24, 24)
        }
        scrollView = ScrollView(this).apply { addView(root) }
        setContentView(scrollView)
        render()
        lifecycleScope.launch {
            refreshClientsIfLoggedIn()
            render()
        }
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (event.action == KeyEvent.ACTION_DOWN && event.keyCode == KeyEvent.KEYCODE_ENTER) {
            val focused = currentFocus
            if (focused is EditText && focused.tag == "scan") {
                submitReceiptScan(focused.text.toString())
                focused.setText("")
                return true
            }
        }
        return super.dispatchKeyEvent(event)
    }

    private fun render() {
        root.removeAllViews()
        root.setBackgroundColor(Color.WHITE)
        addHeader()
        addStatus()
        when (screen) {
            TsdScreen.LOGIN -> addLogin()
            TsdScreen.MENU -> addMainMenu()
            TsdScreen.RECEIPT -> addReceiptScreen()
            TsdScreen.LEGACY -> addLegacyOperation()
        }
    }

    private fun addHeader() {
        val row = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        row.addView(TextView(this).apply {
            text = "ТСД"
            textSize = 17f
            setTextColor(Color.WHITE)
            gravity = Gravity.CENTER
            setBackgroundColor(Color.parseColor(LOGO_BLUE))
            layoutParams = LinearLayout.LayoutParams(82, 72)
        })
        row.addView(TextView(this).apply {
            text = sessionStore.load()?.let { "  ${it.deviceName}\n  ${it.deviceCode}" } ?: "  Вход сотрудника\n  не выполнен"
            textSize = 16f
            setTextColor(Color.parseColor(DARK))
        })
        root.addView(row)
    }

    private fun addStatus() {
        statusView = TextView(this).apply {
            text = statusText
            textSize = 17f
            setTextColor(Color.parseColor(DARK))
            setPadding(0, 20, 0, 14)
        }
        root.addView(statusView)
    }

    private fun addLogin() {
        val baseUrlInput = input("API URL", "https://wms.logoff.pro/")
        val loginInput = input("Логин сотрудника")
        val passwordInput = input("Пароль").apply {
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
        }
        root.addView(baseUrlInput)
        root.addView(loginInput)
        root.addView(passwordInput)
        root.addView(primaryButton("Войти на ТСД") {
            val login = loginInput.textValue()
            val password = passwordInput.textValue()
            if (login.isEmpty() || password.isEmpty()) {
                updateStatus("Укажите логин и пароль сотрудника")
                return@primaryButton
            }
            lifecycleScope.launch {
                val result = runCatching {
                    WmsApiFactory.create(baseUrlInput.textValue()).login(AuthLoginRequest(email = login, password = password))
                }
                result.onSuccess {
                    val permissions = it.user.permissionCodes
                    if (!permissions.contains("tsd:use") && !permissions.contains("system:admin")) {
                        updateStatus("У пользователя нет права Работа с ТСД.")
                        return@onSuccess
                    }
                    sessionStore.save(it, defaultDeviceCode())
                    updateStatus("Вход выполнен")
                    refreshClientsIfLoggedIn()
                    screen = TsdScreen.MENU
                    render()
                }.onFailure {
                    updateStatus(readableNetworkError(it))
                }
            }
        })
        root.addView(secondaryButton("Назад") {
            screen = TsdScreen.MENU
            render()
        })
    }

    private fun addMainMenu() {
        root.addView(menuButton("Приемка товара") {
            screen = TsdScreen.RECEIPT
            render()
        })
        root.addView(menuButton("Сборка заявки") {
            updateStatus("Сборка заявок доступна в отдельном меню ТСД.")
        })
        root.addView(menuButton("Инвентаризация") {
            legacyMode = TsdOperationMode.INVENTORY
            screen = TsdScreen.LEGACY
            render()
        })
        root.addView(secondaryButton("Синхронизировать очередь") {
            syncPending()
        })
        root.addView(secondaryButton("Обновить клиентов") {
            lifecycleScope.launch {
                refreshClientsIfLoggedIn()
                render()
            }
        })
        root.addView(secondaryButton("Настройки / вход") {
            screen = TsdScreen.LOGIN
            render()
        })
        root.addView(secondaryButton("Сбросить вход") {
            sessionStore.clear()
            clients = emptyList()
            selectedClientId = ""
            updateStatus("Вход сброшен")
        })
        lifecycleScope.launch { addQueueInfo() }
    }

    private fun addReceiptScreen() {
        root.addView(clientSpinner())
        root.addView(TextView(this).apply {
            text = receiptSummaryText()
            textSize = 16f
            setPadding(0, 12, 0, 12)
        })

        when (receiptStage) {
            ReceiptStage.NOT_STARTED -> {
                root.addView(primaryButton("Начать приемку") { startReceipt() })
            }
            ReceiptStage.WAIT_BOX -> {
                val boxInput = scanInput("Сканируйте ШК нового короба")
                root.addView(boxInput)
                boxInput.requestFocus()
            }
            ReceiptStage.SCAN_BARCODE -> {
                root.addView(TextView(this).apply {
                    text = "Открыт короб: $currentBox"
                    textSize = 18f
                    setTextColor(Color.parseColor(BLUE))
                    setPadding(0, 14, 0, 8)
                })
                val barcodeInput = scanInput("Сканируйте ШК товара")
                root.addView(barcodeInput)
                barcodeInput.requestFocus()
                root.addView(secondaryButton("Закрыть короб") { confirmCloseBox() })
            }
            ReceiptStage.WAIT_KIZ -> {
                root.addView(TextView(this).apply {
                    text = "Товар: ${pendingSku?.name ?: pendingBarcode}\nТеперь сканируйте КИЗ"
                    textSize = 18f
                    setTextColor(Color.parseColor(BLUE))
                    setPadding(0, 14, 0, 8)
                })
                val kizInput = scanInput("Сканируйте КИЗ")
                root.addView(kizInput)
                kizInput.requestFocus()
            }
        }

        addCurrentBoxLines()
        root.addView(secondaryButton("Закончить приемку") { finishReceipt() })
        root.addView(secondaryButton("Назад") {
            screen = TsdScreen.MENU
            render()
        })
    }

    private fun addLegacyOperation() {
        val clientSpinner = clientSpinner()
        val scanInput = scanInput("Сканируйте ШК товара")
        val boxInput = input(if (legacyMode == TsdOperationMode.INVENTORY) "Короб" else "Короб-источник")
        val toBoxInput = input("Короб-приемник")
        val quantityInput = input("Количество", "1").apply { inputType = InputType.TYPE_CLASS_NUMBER }
        root.addView(TextView(this).apply {
            text = legacyMode.title
            textSize = 20f
            setPadding(0, 18, 0, 8)
        })
        root.addView(clientSpinner)
        root.addView(boxInput)
        if (legacyMode == TsdOperationMode.MOVE) {
            root.addView(toBoxInput)
        }
        root.addView(quantityInput)
        root.addView(scanInput)
        root.addView(primaryButton("Записать скан") {
            val clientId = selectedClientId
            val barcode = scanInput.textValue()
            val quantity = quantityInput.textValue().toIntOrNull() ?: 0
            if (clientId.isEmpty() || barcode.isEmpty() || boxInput.textValue().isEmpty() || quantity <= 0) {
                updateStatus("Заполните клиента, короб, ШК и количество.")
                return@primaryButton
            }
            lifecycleScope.launch {
                val operation = if (legacyMode == TsdOperationMode.MOVE) {
                    val toBox = toBoxInput.textValue()
                    if (toBox.isEmpty()) {
                        updateStatus("Укажите короб-приемник.")
                        return@launch
                    }
                    outbox.enqueueMove(clientId, barcode, boxInput.textValue(), toBox, quantity, "AVAILABLE", null)
                } else {
                    outbox.enqueueInventory(clientId, barcode, boxInput.textValue(), quantity, "AVAILABLE")
                }
                scanInput.setText("")
                updateStatus("Скан записан: ${operation.operationType}")
            }
        })
        root.addView(secondaryButton("Синхронизировать") { syncPending() })
        root.addView(secondaryButton("Назад") {
            screen = TsdScreen.MENU
            render()
        })
    }

    private fun submitReceiptScan(rawValue: String) {
        val value = rawValue.trim()
        if (screen != TsdScreen.RECEIPT || value.isEmpty()) return

        when (receiptStage) {
            ReceiptStage.WAIT_BOX -> openReceiptBox(value)
            ReceiptStage.SCAN_BARCODE -> scanReceiptBarcode(value)
            ReceiptStage.WAIT_KIZ -> scanReceiptKiz(value)
            ReceiptStage.NOT_STARTED -> updateStatus("Нажмите Начать приемку.")
        }
    }

    private fun startReceipt() {
        if (selectedClientId.isEmpty()) {
            updateStatus("Выберите клиента для приемки.")
            return
        }
        receiptId = createReceiptId()
        currentBox = ""
        pendingBarcode = ""
        pendingSku = null
        currentBoxLines.clear()
        closedBoxes.clear()
        scannedKiz.clear()
        confirmedBarcodes.clear()
        confirmedSkuByBarcode.clear()
        receiptStage = ReceiptStage.WAIT_BOX
        statusText = "Приемка начата. Сканируйте новый короб."
        render()
    }

    private fun openReceiptBox(boxCode: String) {
        if (closedBoxes.any { it.code.equals(boxCode, ignoreCase = true) }) {
            updateStatus("Короб $boxCode уже закрыт в этой приемке.")
            return
        }
        currentBox = boxCode
        currentBoxLines.clear()
        receiptStage = ReceiptStage.SCAN_BARCODE
        statusText = "Короб $boxCode открыт. Сканируйте товар."
        render()
    }

    private fun scanReceiptBarcode(barcode: String) {
        if (confirmedBarcodes.contains(barcode)) {
            pendingBarcode = barcode
            pendingSku = confirmedSkuByBarcode[barcode]
            receiptStage = ReceiptStage.WAIT_KIZ
            statusText = "Товар уже подтвержден. Сканируйте КИЗ."
            render()
            return
        }

        val session = sessionStore.load()
        if (session == null) {
            updateStatus("Сначала выполните вход ТСД.")
            return
        }

        lifecycleScope.launch {
            val result = runCatching {
                WmsApiFactory.create("https://wms.logoff.pro/").skuByBarcode(
                    authorization = "${session.tokenType} ${session.accessToken}",
                    clientId = selectedClientId,
                    barcode = barcode,
                )
            }
            result.onSuccess { sku ->
                showSkuConfirmation(barcode, sku)
            }.onFailure {
                updateStatus(it.message ?: "Товар не найден. Позовите менеджера.")
            }
        }
    }

    private fun showSkuConfirmation(barcode: String, sku: TsdSkuSummary) {
        val content = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(20, 12, 20, 0)
        }
        val image = ImageView(this).apply {
            setBackgroundColor(Color.parseColor(LIGHT_BLUE))
            adjustViewBounds = true
            maxHeight = 420
        }
        content.addView(image, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 360))
        content.addView(TextView(this).apply {
            text = buildString {
                appendLine(sku.name)
                appendLine("ШК: $barcode")
                appendLine("Артикул: ${sku.article ?: sku.clientSku ?: sku.internalSku}")
                appendLine("Цвет: ${sku.color ?: "-"}")
                appendLine("Размер: ${sku.size ?: "-"}")
                appendLine("Бренд: ${sku.brand ?: "-"}")
                val extra = sku.marketplaceCharacteristics.take(5).joinToString("\n") { "${it.name}: ${it.value}" }
                if (extra.isNotBlank()) appendLine(extra)
            }
            textSize = 17f
            setPadding(0, 12, 0, 0)
        })

        val photo = sku.marketplacePhotos.firstOrNull()
        if (photo != null) {
            lifecycleScope.launch {
                val bitmap = runCatching {
                    withContext(Dispatchers.IO) {
                        URL(photo).openStream().use { BitmapFactory.decodeStream(it) }
                    }
                }.getOrNull()
                if (bitmap != null) {
                    image.setImageBitmap(bitmap)
                }
            }
        }

        AlertDialog.Builder(this)
            .setTitle("Это этот товар?")
            .setView(content)
            .setPositiveButton("Да") { _, _ ->
                confirmedBarcodes += barcode
                confirmedSkuByBarcode[barcode] = sku
                pendingBarcode = barcode
                pendingSku = sku
                receiptStage = ReceiptStage.WAIT_KIZ
                statusText = "Товар подтвержден. Сканируйте КИЗ."
                render()
            }
            .setNegativeButton("Не тот товар") { _, _ ->
                updateStatus("Отложите товар и позовите менеджера.")
            }
            .show()
    }

    private fun scanReceiptKiz(kiz: String) {
        if (scannedKiz.contains(kiz)) {
            updateStatus("Этот КИЗ уже отсканирован в текущей приемке.")
            return
        }
        val sku = pendingSku
        currentBoxLines += ReceiptLine(
            boxCode = currentBox,
            barcode = pendingBarcode,
            kiz = kiz,
            skuId = sku?.id,
            name = sku?.name ?: pendingBarcode,
            article = sku?.article ?: sku?.clientSku ?: sku?.internalSku,
            color = sku?.color,
            size = sku?.size,
        )
        scannedKiz += kiz
        pendingBarcode = ""
        pendingSku = null
        receiptStage = ReceiptStage.SCAN_BARCODE
        statusText = "КИЗ принят. Сканируйте следующий товар."
        render()
    }

    private fun confirmCloseBox() {
        if (currentBox.isEmpty()) {
            updateStatus("Нет открытого короба.")
            return
        }
        if (currentBoxLines.isEmpty()) {
            updateStatus("В коробе нет товара.")
            return
        }
        AlertDialog.Builder(this)
            .setTitle("Закрыть короб $currentBox?")
            .setMessage(boxSummary(currentBoxLines))
            .setPositiveButton("Да, закрыть") { _, _ -> closeCurrentBox() }
            .setNegativeButton("Пересканировать") { _, _ ->
                currentBoxLines.clear()
                statusText = "Короб очищен для повторного сканирования."
                render()
            }
            .setNeutralButton("Отмена", null)
            .show()
    }

    private fun closeCurrentBox() {
        val clientId = selectedClientId
        val linesToSend = currentBoxLines.toList()
        lifecycleScope.launch {
            for (line in linesToSend) {
                outbox.enqueueReceipt(
                    clientId = clientId,
                    barcode = line.barcode,
                    boxCode = line.boxCode,
                    quantity = 1,
                    kiz = line.kiz,
                    status = "AVAILABLE",
                    sourceDocument = receiptId,
                    comment = "ТСД приемка: короб ${line.boxCode}",
                )
            }
            closedBoxes += ClosedReceiptBox(currentBox, linesToSend.size)
            currentBox = ""
            currentBoxLines.clear()
            receiptStage = ReceiptStage.WAIT_BOX
            syncPending(silent = true)
            statusText = "Короб закрыт. Сканируйте следующий короб или завершите приемку."
            render()
        }
    }

    private fun finishReceipt() {
        if (currentBox.isNotEmpty() && currentBoxLines.isNotEmpty()) {
            updateStatus("Сначала закройте текущий короб $currentBox.")
            return
        }
        AlertDialog.Builder(this)
            .setTitle("Приемка завершена")
            .setMessage("Коробов: ${closedBoxes.size}\nТоваров: ${closedBoxes.sumOf { it.quantity }}")
            .setPositiveButton("Готово") { _, _ ->
                receiptStage = ReceiptStage.NOT_STARTED
                currentBox = ""
                currentBoxLines.clear()
                closedBoxes.clear()
                scannedKiz.clear()
                confirmedBarcodes.clear()
                confirmedSkuByBarcode.clear()
                statusText = "Приемка завершена."
                render()
            }
            .show()
    }

    private fun syncPending(silent: Boolean = false) {
        val session = sessionStore.load()
        if (session == null) {
            if (!silent) updateStatus("Сначала войдите по коду и секрету ТСД.")
            return
        }
        lifecycleScope.launch {
            val summary = TsdSyncRunner(
                outbox = outbox,
                api = WmsApiFactory.create("https://wms.logoff.pro/"),
                deviceId = session.deviceCode,
            ).syncPending("${session.tokenType} ${session.accessToken}")
            if (!silent) {
                updateStatus("${summary.message}: принято ${summary.applied}, отклонено ${summary.rejected}, на повтор ${summary.retried}")
            }
        }
    }

    private suspend fun refreshClientsIfLoggedIn() {
        val session = sessionStore.load() ?: return
        val result = runCatching {
            WmsApiFactory.create("https://wms.logoff.pro/").clients("${session.tokenType} ${session.accessToken}")
        }
        result.onSuccess {
            clients = it
            if (selectedClientId.isEmpty() || clients.none { client -> client.id == selectedClientId }) {
                selectedClientId = clients.firstOrNull()?.id ?: ""
            }
            statusText = if (screen == TsdScreen.MENU) statusText else if (clients.isEmpty()) "Нет доступных клиентов." else "Клиенты загружены."
        }.onFailure {
            statusText = if (screen == TsdScreen.MENU) statusText else it.message ?: "Не удалось загрузить клиентов."
        }
    }

    private fun clientSpinner(): Spinner {
        val spinner = Spinner(this)
        val labels = clients.map { it.name.ifBlank { it.legalName ?: it.code ?: it.id } }
        val adapter = ArrayAdapter(this, android.R.layout.simple_spinner_item, if (labels.isEmpty()) listOf("Клиенты не загружены") else labels)
        adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
        spinner.adapter = adapter
        val selectedIndex = clients.indexOfFirst { it.id == selectedClientId }
        if (selectedIndex >= 0) spinner.setSelection(selectedIndex)
        spinner.setOnItemSelectedListener(SimpleItemSelectedListener { position ->
            selectedClientId = clients.getOrNull(position)?.id ?: ""
        })
        return spinner
    }

    private fun addCurrentBoxLines() {
        if (currentBoxLines.isEmpty()) return
        root.addView(TextView(this).apply {
            text = "В текущем коробе:\n${boxSummary(currentBoxLines)}"
            textSize = 15f
            setPadding(0, 12, 0, 12)
        })
    }

    private suspend fun addQueueInfo() {
        val counts = outbox.counts()
        withContext(Dispatchers.Main) {
            if (screen == TsdScreen.MENU) {
                statusText = "${if (sessionStore.load() == null) "Офлайн" else "Онлайн"} · очередь: ${counts.pending}"
                statusView.text = statusText
            }
            root.addView(TextView(this@MainActivity).apply {
                text = "В очереди: ${counts.pending}; отклонено: ${counts.rejected}"
                textSize = 15f
                setPadding(0, 16, 0, 0)
            })
        }
    }

    private fun updateStatus(message: String) {
        statusText = message
        render()
    }

    private fun readableNetworkError(error: Throwable): String {
        if (error is HttpException) {
            val body = error.response()?.errorBody()?.string()
            val serverMessage = body?.let { parseServerMessage(it) }.orEmpty()
            if (serverMessage.isNotBlank()) {
                return serverMessage
            }
            return when (error.code()) {
                400 -> "Сервер не принял данные. Проверьте логин и пароль."
                401 -> "Неверный логин или пароль сотрудника."
                403 -> "Нет доступа к этому действию."
                404 -> "Сервер не нашел нужный адрес API."
                else -> "Ошибка сервера: HTTP ${error.code()}"
            }
        }
        return error.message ?: "Не удалось выполнить запрос"
    }

    private fun parseServerMessage(body: String): String {
        return runCatching {
            val json = JSONObject(body)
            when (val message = json.opt("message")) {
                is JSONArray -> (0 until message.length()).joinToString("; ") { index -> message.optString(index) }
                is String -> message
                else -> json.optString("error")
            }
        }.getOrDefault("")
    }

    private fun defaultDeviceCode(): String {
        val raw = "${Build.MANUFACTURER}-${Build.MODEL}".ifBlank { "TSD" }
        return raw.uppercase()
            .replace(Regex("[^A-Z0-9]+"), "-")
            .trim('-')
            .take(32)
            .ifBlank { "TSD" }
    }

    private fun receiptSummaryText(): String =
        "Приемка: $receiptId\nЗакрыто коробов: ${closedBoxes.size}; товаров: ${closedBoxes.sumOf { it.quantity }}\nТекущий короб: ${currentBox.ifEmpty { "не открыт" }}"

    private fun boxSummary(lines: List<ReceiptLine>): String =
        lines.groupBy { listOf(it.name, it.article ?: "", it.color ?: "", it.size ?: "") }
            .map { (_, rows) ->
                val first = rows.first()
                "${first.name}\n${first.article ?: "-"} · ${first.color ?: "-"} · ${first.size ?: "-"}: ${rows.size} шт."
            }
            .joinToString("\n\n")

    private fun input(hint: String, value: String = ""): EditText =
        EditText(this).apply {
            setSingleLine(true)
            this.hint = hint
            setText(value)
            textSize = 18f
        }

    private fun scanInput(hint: String): EditText =
        input(hint).apply {
            tag = "scan"
            setOnEditorActionListener { view, _, _ ->
                submitReceiptScan(view.text.toString())
                view.setText("")
                true
            }
        }

    private fun primaryButton(label: String, action: () -> Unit): Button =
        Button(this).apply {
            text = label
            textSize = 18f
            setTextColor(Color.WHITE)
            setBackgroundColor(Color.parseColor(BLUE))
            setOnClickListener { action() }
        }

    private fun menuButton(label: String, action: () -> Unit): Button =
        Button(this).apply {
            text = label
            textSize = 19f
            setTextColor(Color.WHITE)
            gravity = Gravity.CENTER
            isAllCaps = false
            setPadding(0, 0, 0, 0)
            setBackgroundColor(Color.parseColor(LOGO_BLUE))
            layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 112).apply {
                setMargins(14, 12, 14, 8)
            }
            setOnClickListener { action() }
        }

    private fun secondaryButton(label: String, action: () -> Unit): Button =
        Button(this).apply {
            text = label
            textSize = 17f
            isAllCaps = false
            setTextColor(Color.parseColor(DARK))
            setBackgroundColor(Color.parseColor(SERVICE_GRAY))
            setOnClickListener { action() }
        }

    private fun EditText.textValue(): String = text.toString().trim()
}

private class SimpleItemSelectedListener(
    private val onSelected: (position: Int) -> Unit,
) : android.widget.AdapterView.OnItemSelectedListener {
    override fun onItemSelected(parent: android.widget.AdapterView<*>?, view: android.view.View?, position: Int, id: Long) {
        onSelected(position)
    }

    override fun onNothingSelected(parent: android.widget.AdapterView<*>?) = Unit
}

private data class ReceiptLine(
    val boxCode: String,
    val barcode: String,
    val kiz: String,
    val skuId: String?,
    val name: String,
    val article: String?,
    val color: String?,
    val size: String?,
)

private data class ClosedReceiptBox(
    val code: String,
    val quantity: Int,
)

private enum class TsdScreen {
    LOGIN,
    MENU,
    RECEIPT,
    LEGACY,
}

private enum class ReceiptStage {
    NOT_STARTED,
    WAIT_BOX,
    SCAN_BARCODE,
    WAIT_KIZ,
}

private enum class TsdOperationMode(
    val title: String,
) {
    MOVE("Перемещение"),
    INVENTORY("Инвентаризация"),
}

private fun createReceiptId(): String =
    "TSD-RECEIPT-${UUID.randomUUID().toString().take(8).uppercase()}"
