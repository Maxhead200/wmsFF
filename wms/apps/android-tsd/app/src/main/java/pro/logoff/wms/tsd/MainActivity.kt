package pro.logoff.wms.tsd

import android.app.Activity
import android.os.Bundle
import android.view.KeyEvent
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import pro.logoff.wms.tsd.data.OperationOutbox

class MainActivity : Activity() {
    private val outbox = OperationOutbox()
    private lateinit var statusView: TextView
    private lateinit var scanInput: EditText

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Русский комментарий: MVP использует scanner keyboard wedge, поэтому сканер пишет прямо в EditText.
        statusView = TextView(this).apply {
            text = "Готово к сканированию"
            textSize = 18f
        }

        scanInput = EditText(this).apply {
            hint = "Сканируйте короб, SKU или ЧЗ"
            setSingleLine(true)
            setOnEditorActionListener { _, _, _ ->
                submitScan()
                true
            }
        }

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(32, 32, 32, 32)
            addView(statusView)
            addView(scanInput)
        }

        setContentView(root)
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

        outbox.enqueueScan(barcode)
        statusView.text = "Скан принят: $barcode"
        scanInput.setText("")
    }
}
