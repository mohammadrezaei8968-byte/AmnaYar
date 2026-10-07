package ir.amnayar.app

import android.annotation.SuppressLint
import android.app.Activity
import android.app.NotificationChannel
import android.app.NotificationManager
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import android.content.pm.PackageManager
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.os.Build
import android.os.Environment
import android.util.Base64
import android.webkit.JavascriptInterface
import android.provider.MediaStore
import android.view.View
import android.webkit.CookieManager
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient

class MainActivity : Activity() {
    private inner class DownloadBridge {
        @JavascriptInterface
        fun saveBase64(name: String, mime: String, base64: String) {
            try {
                val safeName = name.substringAfterLast('/').ifBlank { "amnayar-download" }
                val bytes = Base64.decode(base64, Base64.DEFAULT)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    val values = android.content.ContentValues().apply {
                        put(android.provider.MediaStore.Downloads.DISPLAY_NAME, safeName)
                        put(android.provider.MediaStore.Downloads.MIME_TYPE, mime.ifBlank { "application/octet-stream" })
                        put(android.provider.MediaStore.Downloads.IS_PENDING, 1)
                    }
                    val uri = contentResolver.insert(android.provider.MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
                        ?: throw IllegalStateException("download_uri_failed")
                    contentResolver.openOutputStream(uri).use { it?.write(bytes) }
                    values.clear()
                    values.put(android.provider.MediaStore.Downloads.IS_PENDING, 0)
                    contentResolver.update(uri, values, null, null)
                } else {
                    val dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
                    if (!dir.exists()) dir.mkdirs()
                    java.io.File(dir, safeName).writeBytes(bytes)
                    sendBroadcast(Intent(Intent.ACTION_MEDIA_SCANNER_SCAN_FILE, Uri.fromFile(java.io.File(dir, safeName))))
                }
                runOnUiThread {
                    showDownloadNotification(safeName)
                    web.evaluateJavascript("window.dispatchEvent(new CustomEvent('amnayarDownloadCompleted',{detail:{name:" + org.json.JSONObject.quote(safeName) + "}}))", null)
                }
            } catch (_: Exception) {
                runOnUiThread { web.loadUrl("javascript:window.dispatchEvent(new Event('amnayarDownloadFailed'))") }
            }
        }
    }

    private fun showDownloadNotification(name: String) {
        val channelId = "amnayar_downloads"
        val manager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            manager.createNotificationChannel(NotificationChannel(channelId, "دانلودهای امنا یار", NotificationManager.IMPORTANCE_DEFAULT))
        }
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(this, "android.permission.POST_NOTIFICATIONS") != PackageManager.PERMISSION_GRANTED) return
        val notification = NotificationCompat.Builder(this, channelId)
            .setSmallIcon(android.R.drawable.stat_sys_download_done)
            .setContentTitle("دانلود امنا یار انجام شد")
            .setContentText(name)
            .setAutoCancel(true)
            .build()
        manager.notify((System.currentTimeMillis() % 100000).toInt(), notification)
    }

    private lateinit var web: WebView
    private var filePathCallback: ValueCallback<Array<Uri>>? = null
    private val fileChooserRequestCode = 4101

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        web = WebView(this)
        web.setLayerType(View.LAYER_TYPE_HARDWARE, null)
        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            loadsImagesAutomatically = true
            cacheMode = WebSettings.LOAD_DEFAULT
            allowFileAccess = false
            allowContentAccess = true
            javaScriptCanOpenWindowsAutomatically = true
            setSupportMultipleWindows(false)
            mediaPlaybackRequiresUserGesture = false
        }
        CookieManager.getInstance().setAcceptCookie(true)
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true)

        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest) = false
            override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                if (request.isForMainFrame) view.postDelayed({ view.loadUrl("https://amnayar.ir/") }, 500)
            }
        }

        web.addJavascriptInterface(DownloadBridge(), "AmnaYarDownloader")

        web.setDownloadListener { url, userAgent, contentDisposition, mimeType, _ ->
            try {
                val request = android.app.DownloadManager.Request(Uri.parse(url))
                request.setMimeType(mimeType ?: "application/octet-stream")
                request.addRequestHeader("User-Agent", userAgent ?: "")
                request.setDescription("دانلود فایل امنا یار")
                request.setTitle(android.webkit.URLUtil.guessFileName(url, contentDisposition, mimeType))
                request.setNotificationVisibility(android.app.DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                (getSystemService(DOWNLOAD_SERVICE) as android.app.DownloadManager).enqueue(request)
            } catch (_: Exception) { }
        }

        web.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(
                webView: WebView,
                filePath: ValueCallback<Array<Uri>>,
                fileChooserParams: FileChooserParams
            ): Boolean {
                filePathCallback?.onReceiveValue(null)
                filePathCallback = filePath

                val acceptTypes = fileChooserParams.acceptTypes
                    .filter { it.isNotBlank() }
                    .toTypedArray()

                val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                    addCategory(Intent.CATEGORY_OPENABLE)
                    type = if (acceptTypes.size == 1) acceptTypes[0] else "*/*"
                    if (acceptTypes.size > 1) putExtra(Intent.EXTRA_MIME_TYPES, acceptTypes)
                    putExtra(Intent.EXTRA_ALLOW_MULTIPLE, fileChooserParams.mode == FileChooserParams.MODE_OPEN_MULTIPLE)
                }

                try {
                    startActivityForResult(intent, fileChooserRequestCode)
                } catch (_: Exception) {
                    val fallback = Intent(Intent.ACTION_GET_CONTENT).apply {
                        addCategory(Intent.CATEGORY_OPENABLE)
                        type = if (acceptTypes.size == 1) acceptTypes[0] else "*/*"
                        if (acceptTypes.size > 1) putExtra(Intent.EXTRA_MIME_TYPES, acceptTypes)
                        putExtra(Intent.EXTRA_ALLOW_MULTIPLE, fileChooserParams.mode == FileChooserParams.MODE_OPEN_MULTIPLE)
                    }
                    startActivityForResult(fallback, fileChooserRequestCode)
                }
                return true
            }
        }

        setContentView(web)
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(this, "android.permission.POST_NOTIFICATIONS") != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(arrayOf("android.permission.POST_NOTIFICATIONS"), 7401)
        }
        if (savedInstanceState == null) web.loadUrl("https://amnayar.ir/") else web.restoreState(savedInstanceState)
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != fileChooserRequestCode) return

        val callback = filePathCallback
        filePathCallback = null

        if (resultCode != RESULT_OK || data == null) {
            callback?.onReceiveValue(null)
            return
        }

        val uris = ArrayList<Uri>()
        data.data?.let { uris.add(it) }
        data.clipData?.let { clip ->
            for (i in 0 until clip.itemCount) {
                val uri = clip.getItemAt(i).uri
                if (!uris.contains(uri)) uris.add(uri)
            }
        }
        callback?.onReceiveValue(uris.toTypedArray())
    }

    override fun onSaveInstanceState(outState: Bundle) {
        web.saveState(outState)
        super.onSaveInstanceState(outState)
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (web.canGoBack()) web.goBack() else super.onBackPressed()
    }

    override fun onDestroy() {
        filePathCallback?.onReceiveValue(null)
        filePathCallback = null
        web.stopLoading()
        web.destroy()
        super.onDestroy()
    }
}
