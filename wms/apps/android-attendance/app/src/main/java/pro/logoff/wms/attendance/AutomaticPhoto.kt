package pro.logoff.wms.attendance

import android.Manifest
import android.content.pm.PackageManager
import android.os.SystemClock
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.compose.foundation.layout.Column
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.repeatOnLifecycle
import kotlinx.coroutines.*
import kotlinx.coroutines.sync.Mutex
import java.io.File
import java.util.UUID
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

// FIX: one tap owns the capture/save sequence. Retrying a failed save reuses the same photo.
class AutomaticPhotoOperation {
    private val mutex = Mutex()
    private var captured: File? = null
    private var completed = false
    suspend fun run(capture: suspend () -> File, save: suspend (File) -> Unit) {
        if (!mutex.tryLock()) return
        try {
            if (completed) return
            val file = captured ?: capture().also { captured = it }
            save(file)
            completed = true
        } finally { mutex.unlock() }
    }
}

@Composable
fun AutomaticPhotoMark(employee: Employee, clockIn: Boolean, onCancel: () -> Unit, label: String = if (clockIn) "Начало смены" else "Окончание смены",
    onSave: suspend (File, Long, Long, String) -> Unit) {
    val context = LocalContext.current
    val displayView = LocalView.current
    val lifecycle = LocalLifecycleOwner.current
    var granted by remember { mutableStateOf(ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) }
    var permissionRequested by rememberSaveable { mutableStateOf(false) }
    var error by remember { mutableStateOf("") }
    var retry by remember { mutableIntStateOf(0) }
    var working by remember { mutableStateOf(false) }
    val id = rememberSaveable { UUID.randomUUID().toString() }
    var takenAt by rememberSaveable { mutableLongStateOf(0) }
    var elapsed by rememberSaveable { mutableLongStateOf(0) }
    val operation = remember(id) { AutomaticPhotoOperation() }
    val latestSave by rememberUpdatedState(onSave)
    val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {
        granted = it
        if (!it) error = "Камера не разрешена. Разрешите камеру или попросите администратора внести отметку вручную."
    }
    LaunchedEffect(Unit) {
        if (!granted && !permissionRequested) { permissionRequested = true; permission.launch(Manifest.permission.CAMERA) }
    }
    LaunchedEffect(granted, retry) {
        if (!granted) return@LaunchedEffect
        lifecycle.repeatOnLifecycle(Lifecycle.State.RESUMED) {
            working = true; error = ""
            try {
                operation.run(capture = {
                    val dir = File(context.filesDir, "captures").apply { check(mkdirs() || isDirectory) }
                    val file = File(dir, "$id.jpg")
                    // A complete photo can survive rotation/process recreation; never use partial output.
                    if (!file.isFile || file.length() == 0L || takenAt == 0L) {
                        withTimeout(20_000) {
                            val future = ProcessCameraProvider.getInstance(context)
                            val provider = suspendCancellableCoroutine<ProcessCameraProvider> { continuation ->
                                future.addListener({
                                    if (continuation.isActive) try { continuation.resume(future.get()) }
                                    catch (e: Exception) { continuation.resumeWithException(e) }
                                }, ContextCompat.getMainExecutor(context))
                            }
                            val camera = ImageCapture.Builder().setJpegQuality(75)
                                .setTargetResolution(android.util.Size(960, 720)).build()
                            try {
                                provider.bindToLifecycle(lifecycle, CameraSelector.DEFAULT_FRONT_CAMERA, camera)
                                // FIX: View.display works before API 30, unlike Context.display.
                                camera.targetRotation = displayView.display?.rotation ?: 0
                                takenAt = System.currentTimeMillis(); elapsed = SystemClock.elapsedRealtime()
                                val temporary = File(dir, "$id-${UUID.randomUUID()}.part")
                                suspendCancellableCoroutine<Unit> { continuation ->
                                    camera.takePicture(ImageCapture.OutputFileOptions.Builder(temporary).build(),
                                        ContextCompat.getMainExecutor(context), object : ImageCapture.OnImageSavedCallback {
                                            override fun onImageSaved(output: ImageCapture.OutputFileResults) {
                                                if (!continuation.isActive) { temporary.delete(); return }
                                                if (temporary.renameTo(file)) continuation.resume(Unit)
                                                else { temporary.delete(); continuation.resumeWithException(java.io.IOException("Не удалось сохранить фото")) }
                                            }
                                            override fun onError(exception: ImageCaptureException) {
                                                temporary.delete()
                                                if (continuation.isActive) continuation.resumeWithException(exception)
                                            }
                                        })
                                }
                            } finally { provider.unbind(camera) }
                        }
                    }
                    file
                }, save = { file ->
                    // A short local commit completes even if the Activity pauses after the shot.
                    withContext(NonCancellable) { latestSave(file, takenAt, elapsed, id) }
                })
            } catch (e: TimeoutCancellationException) {
                error = "Камера не ответила. Повторите отметку или обратитесь к администратору."
            } catch (e: CancellationException) { throw e }
            catch (e: Exception) { error = "Отметка не сохранена. Проверьте фронтальную камеру и свободное место, затем повторите."
            } finally { working = false }
        }
    }
    Column {
        Text("${employee.name} · $label")
        if (working) { LinearProgressIndicator(); Text("Сохраняем отметку…") }
        if (error.isNotBlank()) Text(error, color = MaterialTheme.colorScheme.error)
        if (!granted) TextButton(onClick = { permission.launch(Manifest.permission.CAMERA) }) { Text("Разрешить камеру") }
        if (granted && error.isNotBlank() && !working) TextButton(onClick = { retry++ }) { Text("Повторить отметку") }
        if (!working) TextButton(onClick = {
            File(context.filesDir, "captures/$id.jpg").delete()
            onCancel()
        }) { Text("Отмена") }
    }
}
