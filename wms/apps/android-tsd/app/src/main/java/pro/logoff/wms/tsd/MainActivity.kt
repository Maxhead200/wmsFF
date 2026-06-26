package pro.logoff.wms.tsd

import android.os.Bundle
import android.text.InputType
import android.view.KeyEvent
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch
import pro.logoff.wms.tsd.auth.TsdSessionStore
import pro.logoff.wms.tsd.data.OperationOutbox
import pro.logoff.wms.tsd.data.PendingOperation
import pro.logoff.wms.tsd.data.TsdDatabase
import pro.logoff.wms.tsd.network.TsdLoginRequest
import pro.logoff.wms.tsd.network.WmsApiFactory
import pro.logoff.wms.tsd.sync.TsdSyncRunner

class MainActivity : ComponentActivity() {
    private lateinit var outbox: OperationOutbox
    private lateinit var sessionStore: TsdSessionStore
    private lateinit var statusView: TextView
    private lateinit var sessionView: TextView
    private lateinit var countsView: TextView
    private lateinit var rejectedView: TextView
    private lateinit var scanInput: EditText
    private lateinit var baseUrlInput: EditText
    private lateinit var deviceCodeInput: EditText
    private lateinit var deviceSecretInput: EditText
    private lateinit var loginButton: Button
    private lateinit var logoutButton: Button
    private lateinit var syncButton: Button
    private lateinit var retryRejectedButton: Button

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        outbox = OperationOutbox(TsdDatabase.get(this).operationDao())
        sessionStore = TsdSessionStore(this)

        // Русский комментарий: MVP использует scanner keyboard wedge, поэтому сканер пишет прямо в EditText.
        statusView = TextView(this).apply {
            text = "Готово к сканированию"
            textSize = 18f
        }
        sessionView = TextView(this).apply { textSize = 16f }
        countsView = TextView(this).apply { textSize = 16f }
        rejectedView = TextView(this).apply { textSize = 14f }

        baseUrlInput = EditText(this).apply {
            hint = "API URL"
            setText("https://wms.logoff.pro/")
            setSingleLine(true)
        }

        deviceCodeInput = EditText(this).apply {
            hint = "Код ТСД"
            setSingleLine(true)
        }

        deviceSecretInput = EditText(this).apply {
            hint = "Секрет ТСД"
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
            setSingleLine(true)
        }

        scanInput = EditText(this).apply {
            hint = "Сканируйте короб, SKU или ЧЗ"
            setSingleLine(true)
            setOnEditorActionListener { _, _, _ ->
                submitScan()
                true
            }
        }

        loginButton = Button(this).apply {
            text = "Войти на ТСД"
            setOnClickListener { loginDevice() }
        }

        logoutButton = Button(this).apply {
            text = "Сбросить вход"
            setOnClickListener { clearSession() }
        }

        syncButton = Button(this).apply {
            text = "Синхронизировать"
            setOnClickListener { syncPending() }
        }

        retryRejectedButton = Button(this).apply {
            text = "Вернуть отклонённые в очередь"
            setOnClickListener { requeueRejected() }
        }

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(32, 32, 32, 32)
            addView(statusView)
            addView(sessionView)
            addView(countsView)
            addView(baseUrlInput)
            addView(deviceCodeInput)
            addView(deviceSecretInput)
            addView(loginButton)
            addView(logoutButton)
            addView(scanInput)
            addView(syncButton)
            addView(retryRejectedButton)
            addView(TextView(this@MainActivity).apply {
                text = "Отклонённые операции"
                textSize = 16f
            })
            addView(rejectedView)
        }

        setContentView(ScrollView(this).apply { addView(root) })
        lifecycleScope.launch { refreshQueue() }
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (event.action == KeyEvent.ACTION_DOWN && event.keyCode == KeyEvent.KEYCODE_ENTER) {
            submitScan()
            return true
        }
        return super.dispatchKeyEvent(event)
    }

    private fun submitScan() {
        val barcode = scanInput.text.toString().trim()
        if (barcode.isEmpty()) return

        lifecycleScope.launch {
            outbox.enqueueScan(barcode)
            scanInput.setText("")
            refreshQueue("Скан принят в offline-очередь: $barcode")
        }
    }

    private fun loginDevice() {
        val code = deviceCodeInput.text.toString().trim()
        val secret = deviceSecretInput.text.toString().trim()
        if (code.isEmpty() || secret.isEmpty()) {
            statusView.text = "Укажите код и секрет ТСД"
            return
        }

        loginButton.isEnabled = false
        lifecycleScope.launch {
            val result = runCatching {
                val api = WmsApiFactory.create(baseUrlInput.text.toString().trim())
                api.login(TsdLoginRequest(code = code, secret = secret))
            }

            loginButton.isEnabled = true
            result.onSuccess { response ->
                sessionStore.save(response)
                deviceSecretInput.setText("")
                refreshQueue("ТСД вошёл: ${response.device.name}")
            }.onFailure { error ->
                refreshQueue(error.message ?: "Не удалось войти на ТСД")
            }
        }
    }

    private fun clearSession() {
        sessionStore.clear()
        statusView.text = "Вход ТСД сброшен"
        lifecycleScope.launch { refreshQueue() }
    }

    private fun syncPending() {
        val session = sessionStore.load()
        if (session == null) {
            statusView.text = "Сначала войдите по коду и секрету ТСД"
            return
        }

        syncButton.isEnabled = false
        lifecycleScope.launch {
            val api = runCatching {
                WmsApiFactory.create(baseUrlInput.text.toString().trim())
            }.getOrElse { error ->
                syncButton.isEnabled = true
                refreshQueue(error.message ?: "Некорректный API URL")
                return@launch
            }

            val summary = TsdSyncRunner(outbox, api, session.deviceCode)
                .syncPending("${session.tokenType} ${session.accessToken}")
            syncButton.isEnabled = true
            refreshQueue(
                "${summary.message}: отправлено ${summary.sent}, принято ${summary.applied}, " +
                    "отклонено ${summary.rejected}, на повтор ${summary.retried}",
            )
        }
    }

    private fun requeueRejected() {
        lifecycleScope.launch {
            val restored = outbox.requeueRejected()
            refreshQueue("Возвращено в очередь: $restored")
        }
    }

    private suspend fun refreshQueue(message: String? = null) {
        val counts = outbox.counts()
        val rejected = outbox.rejected()

        if (message != null) {
            statusView.text = message
        }
        sessionView.text = sessionStore.load()?.let { session ->
            "ТСД: ${session.deviceName} (${session.deviceCode})"
        } ?: "ТСД не авторизован"
        countsView.text = "В очереди: ${counts.pending}; отклонено: ${counts.rejected}"
        rejectedView.text =
            if (rejected.isEmpty()) {
                "Отклонённых операций нет"
            } else {
                rejected.joinToString(separator = "\n\n") { it.toRejectedLine() }
            }
    }

    private fun PendingOperation.toRejectedLine(): String {
        val barcode = payload["barcode"] ?: payload["fromBoxCode"] ?: operationKey
        return "$operationType / $barcode\n$messageForOperator"
    }

    private val PendingOperation.messageForOperator: String
        get() = lastMessage ?: "Причина не указана"
}
