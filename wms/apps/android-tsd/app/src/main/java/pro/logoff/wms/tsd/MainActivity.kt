package pro.logoff.wms.tsd

import android.os.Bundle
import android.provider.Settings
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
import pro.logoff.wms.tsd.data.OperationOutbox
import pro.logoff.wms.tsd.data.PendingOperation
import pro.logoff.wms.tsd.data.TsdDatabase
import pro.logoff.wms.tsd.network.WmsApiFactory
import pro.logoff.wms.tsd.sync.TsdSyncRunner

class MainActivity : ComponentActivity() {
    private lateinit var outbox: OperationOutbox
    private lateinit var statusView: TextView
    private lateinit var countsView: TextView
    private lateinit var rejectedView: TextView
    private lateinit var scanInput: EditText
    private lateinit var baseUrlInput: EditText
    private lateinit var tokenInput: EditText
    private lateinit var syncButton: Button
    private lateinit var retryRejectedButton: Button

    private val deviceId: String by lazy {
        Settings.Secure.getString(contentResolver, Settings.Secure.ANDROID_ID) ?: "android-tsd"
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        outbox = OperationOutbox(TsdDatabase.get(this).operationDao())

        // Русский комментарий: MVP использует scanner keyboard wedge, поэтому сканер пишет прямо в EditText.
        statusView = TextView(this).apply {
            text = "Готово к сканированию"
            textSize = 18f
        }
        countsView = TextView(this).apply { textSize = 16f }
        rejectedView = TextView(this).apply { textSize = 14f }

        baseUrlInput = EditText(this).apply {
            hint = "API URL"
            setText("https://wms.logoff.pro/")
            setSingleLine(true)
        }

        tokenInput = EditText(this).apply {
            hint = "Bearer token"
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
            addView(countsView)
            addView(baseUrlInput)
            addView(tokenInput)
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

    private fun syncPending() {
        val token = tokenInput.text.toString().trim()
        if (token.isEmpty()) {
            statusView.text = "Укажите bearer token для синхронизации"
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

            val summary = TsdSyncRunner(outbox, api, deviceId).syncPending("Bearer $token")
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
