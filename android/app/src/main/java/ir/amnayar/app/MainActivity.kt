package ir.amnayar.app

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.app.PendingIntent
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.pm.PackageManager
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.os.Build
import android.os.Environment
import android.util.Base64
import android.webkit.JavascriptInterface
import android.webkit.PermissionRequest
import android.provider.MediaStore
import android.provider.Settings
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.view.View
import android.webkit.CookieManager
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient

// AmnaYar Android shell: the live website receives conversion/compression updates automatically.
class MainActivity : Activity() {
    private inner class SpeechBridge {
        @JavascriptInterface
        fun startListening(direction: String) {
            runOnUiThread {
                pendingSpeechDirection = if (direction == "en-fa") "en-fa" else if (direction == "doc-qa") "doc-qa" else "fa-en"
                if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                    requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), speechPermissionRequestCode)
                    return@runOnUiThread
                }
                startSpeechRecognition(pendingSpeechDirection)
            }
        }

        @JavascriptInterface
        fun stopListening() {
            runOnUiThread {
                try { speechRecognizer?.stopListening() } catch (_: Exception) { }
            }
        }
    }

    private fun startSpeechRecognition(direction: String) {
        if (!SpeechRecognizer.isRecognitionAvailable(this)) {
            sendVoiceResult("", direction, "unsupported")
            return
        }
        try {
            speechRecognizer?.cancel()
            speechRecognizer?.destroy()
            speechRecognizer = SpeechRecognizer.createSpeechRecognizer(this).apply {
                setRecognitionListener(object : RecognitionListener {
                    override fun onReadyForSpeech(params: Bundle?) {}
                    override fun onBeginningOfSpeech() {}
                    override fun onRmsChanged(rmsdB: Float) {}
                    override fun onBufferReceived(buffer: ByteArray?) {}
                    override fun onEndOfSpeech() {}
                    override fun onEvent(eventType: Int, params: Bundle?) {}
                    override fun onPartialResults(partialResults: Bundle?) {}
                    override fun onResults(results: Bundle?) {
                        val spoken = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull().orEmpty()
                        if (spoken.isBlank()) sendVoiceResult("", direction, "no_speech")
                        else sendVoiceResult(spoken, direction, "")
                    }
                    override fun onError(error: Int) {
                        val code = if (error == SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS) "permission" else "recognition_failed"
                        sendVoiceResult("", direction, code)
                    }
                })
            }
            val language = if (direction == "en-fa") "en-US" else "fa-IR"
            val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                putExtra(RecognizerIntent.EXTRA_LANGUAGE, language)
                putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, language)
                putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, false)
                putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
            }
            speechRecognizer?.startListening(intent)
        } catch (e: Exception) {
            sendVoiceResult("", direction, "recognition_failed")
        }
    }

    private fun sendVoiceResult(text: String, direction: String, error: String) {
        val safeText = org.json.JSONObject.quote(text)
        val safeDirection = org.json.JSONObject.quote(direction)
        val safeError = org.json.JSONObject.quote(error)
        if (::web.isInitialized) {
            web.post {
                if (direction == "doc-qa") web.evaluateJavascript("window.amnayarDocumentQuestionResult && window.amnayarDocumentQuestionResult($safeText,$safeDirection,$safeError)", null) else web.evaluateJavascript("window.amnayarVoiceResult && window.amnayarVoiceResult($safeText,$safeDirection,$safeError)", null)
            }
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == webAudioPermissionRequestCode) {
            val request = pendingWebAudioRequest
            pendingWebAudioRequest = null
            if (grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED) request?.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE)) else request?.deny()
            return
        }
        if (requestCode != speechPermissionRequestCode) return
        if (grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
            startSpeechRecognition(pendingSpeechDirection)
        } else {
            sendVoiceResult("", pendingSpeechDirection, "permission")
        }
    }

    private inner class DeviceBridge {
        @JavascriptInterface
        fun getDeviceKey(): String {
            val androidId = Settings.Secure.getString(contentResolver, Settings.Secure.ANDROID_ID)
            if (!androidId.isNullOrBlank() && androidId.length >= 16) return androidId
            val prefs = getSharedPreferences("amnayar_device", MODE_PRIVATE)
            val existing = prefs.getString("device_key", null)
            if (!existing.isNullOrBlank()) return existing
            val generated = java.util.UUID.randomUUID().toString().replace("-", "")
            prefs.edit().putString("device_key", generated).apply()
            return generated
        }
    }

    private var chunkedDownloadUri: Uri? = null
    private var chunkedDownloadFile: java.io.File? = null
    private var chunkedDownloadOutput: java.io.OutputStream? = null
    private var chunkedDownloadName: String = "amnayar-download"
    private var chunkedDownloadMime: String = "application/octet-stream"

    private inner class DownloadBridge {
        @JavascriptInterface
        @Synchronized
        fun beginChunkedSave(name: String, mime: String): Boolean {
            try {
                abortChunkedSave()
                chunkedDownloadName = name.substringAfterLast('/').ifBlank { "amnayar-download" }
                chunkedDownloadMime = mime.ifBlank { "application/octet-stream" }
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    val values = android.content.ContentValues().apply {
                        put(android.provider.MediaStore.Downloads.DISPLAY_NAME, chunkedDownloadName)
                        put(android.provider.MediaStore.Downloads.MIME_TYPE, chunkedDownloadMime)
                        put(android.provider.MediaStore.Downloads.IS_PENDING, 1)
                    }
                    val uri = contentResolver.insert(android.provider.MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
                        ?: throw IllegalStateException("download_uri_failed")
                    chunkedDownloadUri = uri
                    chunkedDownloadOutput = contentResolver.openOutputStream(uri)
                        ?: throw IllegalStateException("download_stream_failed")
                } else {
                    val dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
                    if (!dir.exists()) dir.mkdirs()
                    val file = java.io.File(dir, chunkedDownloadName)
                    chunkedDownloadFile = file
                    chunkedDownloadUri = Uri.fromFile(file)
                    chunkedDownloadOutput = java.io.FileOutputStream(file)
                }
                return true
            } catch (_: Exception) {
                abortChunkedSave()
                return false
            }
        }

        @JavascriptInterface
        @Synchronized
        fun appendBase64Chunk(base64: String): Boolean {
            return try {
                val output = chunkedDownloadOutput ?: return false
                output.write(Base64.decode(base64, Base64.DEFAULT))
                true
            } catch (_: Exception) { false }
        }

        @JavascriptInterface
        @Synchronized
        fun finishChunkedSave(): Boolean {
            return try {
                val output = chunkedDownloadOutput ?: return false
                output.flush()
                output.close()
                chunkedDownloadOutput = null
                val uri = chunkedDownloadUri
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && uri != null) {
                    val values = android.content.ContentValues().apply {
                        put(android.provider.MediaStore.Downloads.IS_PENDING, 0)
                    }
                    contentResolver.update(uri, values, null, null)
                } else if (uri != null) {
                    sendBroadcast(Intent(Intent.ACTION_MEDIA_SCANNER_SCAN_FILE, uri))
                }
                val name = chunkedDownloadName
                val mime = chunkedDownloadMime
                runOnUiThread {
                    showDownloadNotification(name, uri, mime)
                    web.evaluateJavascript("window.dispatchEvent(new CustomEvent('amnayarDownloadCompleted',{detail:{name:" + org.json.JSONObject.quote(name) + "}}))", null)
                }
                chunkedDownloadUri = null
                chunkedDownloadFile = null
                true
            } catch (_: Exception) {
                abortChunkedSave()
                false
            }
        }

        @JavascriptInterface
        @Synchronized
        fun abortChunkedSave() {
            try { chunkedDownloadOutput?.close() } catch (_: Exception) { }
            chunkedDownloadOutput = null
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) chunkedDownloadUri?.let { contentResolver.delete(it, null, null) }
                else chunkedDownloadFile?.delete()
            } catch (_: Exception) { }
            chunkedDownloadUri = null
            chunkedDownloadFile = null
        }

        @JavascriptInterface
        fun saveBase64(name: String, mime: String, base64: String) {
            try {
                val safeName = name.substringAfterLast('/').ifBlank { "amnayar-download" }
                val safeMime = mime.ifBlank { "application/octet-stream" }
                val bytes = Base64.decode(base64, Base64.DEFAULT)
                var savedUri: Uri? = null
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    val values = android.content.ContentValues().apply {
                        put(android.provider.MediaStore.Downloads.DISPLAY_NAME, safeName)
                        put(android.provider.MediaStore.Downloads.MIME_TYPE, safeMime)
                        put(android.provider.MediaStore.Downloads.IS_PENDING, 1)
                    }
                    val uri = contentResolver.insert(android.provider.MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
                        ?: throw IllegalStateException("download_uri_failed")
                    contentResolver.openOutputStream(uri).use { it?.write(bytes) }
                    values.clear()
                    values.put(android.provider.MediaStore.Downloads.IS_PENDING, 0)
                    contentResolver.update(uri, values, null, null)
                    savedUri = uri
                } else {
                    val dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
                    if (!dir.exists()) dir.mkdirs()
                    val file = java.io.File(dir, safeName)
                    file.writeBytes(bytes)
                    savedUri = Uri.fromFile(file)
                    sendBroadcast(Intent(Intent.ACTION_MEDIA_SCANNER_SCAN_FILE, savedUri))
                }
                runOnUiThread {
                    showDownloadNotification(safeName, savedUri, safeMime)
                    web.evaluateJavascript("window.dispatchEvent(new CustomEvent('amnayarDownloadCompleted',{detail:{name:" + org.json.JSONObject.quote(safeName) + "}}))", null)
                }
            } catch (_: Exception) {
                runOnUiThread { android.widget.Toast.makeText(this@MainActivity, "دانلود انجام نشد", android.widget.Toast.LENGTH_LONG).show(); web.loadUrl("javascript:window.dispatchEvent(new Event('amnayarDownloadFailed'))") }
            }
        }
    }

    private fun showDownloadNotification(name: String, fileUri: Uri?, mimeType: String) {
        val channelId = "amnayar_downloads"
        val manager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            manager.createNotificationChannel(NotificationChannel(channelId, "دانلودهای امنا یار", NotificationManager.IMPORTANCE_DEFAULT))
        }
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission("android.permission.POST_NOTIFICATIONS") != PackageManager.PERMISSION_GRANTED) return
        val openIntent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && fileUri != null) {
            Intent(Intent.ACTION_VIEW).setDataAndType(fileUri, mimeType).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        } else {
            Intent(android.app.DownloadManager.ACTION_VIEW_DOWNLOADS)
        }
        val flags = PendingIntent.FLAG_UPDATE_CURRENT or (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0)
        val pending = PendingIntent.getActivity(this, (System.currentTimeMillis() % Int.MAX_VALUE).toInt(), openIntent, flags)
        val notification = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            android.app.Notification.Builder(this, channelId)
                .setSmallIcon(android.R.drawable.stat_sys_download_done)
                .setContentTitle("دانلود امنا یار انجام شد")
                .setContentText("برای بازکردن فایل بزنید: " + name)
                .setContentIntent(pending)
                .setAutoCancel(true)
                .build()
        } else {
            android.app.Notification.Builder(this)
                .setSmallIcon(android.R.drawable.stat_sys_download_done)
                .setContentTitle("دانلود امنا یار انجام شد")
                .setContentText(name)
                .setContentIntent(pending)
                .setAutoCancel(true)
                .build()
        }
        manager.notify((System.currentTimeMillis() % 100000).toInt(), notification)
    }

    private lateinit var web: WebView
    private var speechRecognizer: SpeechRecognizer? = null
    private var pendingSpeechDirection: String = "fa-en"
    private val speechPermissionRequestCode = 301
    private val webAudioPermissionRequestCode = 302
    private var pendingWebAudioRequest: PermissionRequest? = null
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
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val uri = request.url
                val host = (uri.host ?: "").lowercase()
                val internal = host == "amnayar.ir" || host == "www.amnayar.ir" || host == "api.amnayar.ir"
                if ((uri.scheme == "http" || uri.scheme == "https") && !internal) {
                    return try {
                        startActivity(Intent(Intent.ACTION_VIEW, uri))
                        true
                    } catch (_: Exception) {
                        false
                    }
                }
                return false
            }
            override fun onPageFinished(view: WebView, url: String) {
                super.onPageFinished(view, url)
                // These removals apply only inside the Android app; normal website visitors still see site ads.
                view.evaluateJavascript("""(function(){
                  window.__AMNAYAR_ANDROID_APP__=true;
                  (function(){
                    function record(title,kind){try{var key='amnayar_action_history',rows=JSON.parse(localStorage.getItem(key)||'[]');rows.unshift({title:String(title||'اقدام در برنامه'),kind:String(kind||'app'),at:new Date().toISOString()});localStorage.setItem(key,JSON.stringify(rows.slice(0,100)))}catch(e){}}
                    document.addEventListener('click',function(e){
                      var el=e.target.closest('button,a,[role="button"]');if(!el||el.closest('.tool-panel'))return;
                      var title=(el.innerText||el.textContent||el.getAttribute('aria-label')||'').replace(/\s+/g,' ').trim();
                      if(!title||/^(خانه|بازگشت|بستن|بعداً|خروج)$/.test(title))return;
                      record((document.querySelector('h1')?.textContent||document.title)+' — '+title,'app');
                    },true);
                    document.addEventListener('change',function(e){
                      var el=e.target;if(!el.matches('input[type="file"]')||el.closest('.tool-panel')||!el.files||!el.files.length)return;
                      record('انتخاب فایل: '+el.files[0].name,'file');
                    },true);
                  })();
                  (function(){
                    var keys=['amnayar_auth_token','amnayar_token','amnayar_access_token','auth_token'];
                    var token='';for(var i=0;i<keys.length;i++){try{token=localStorage.getItem(keys[i])||''}catch(e){}if(token)break}
                    if(!token)return;
                    fetch('/api/me',{headers:{Authorization:'Bearer '+token},cache:'no-store'}).then(function(r){return r.ok?r.json():null}).then(function(u){
                      if(!u)return;var name=String(u.display_name||u.username||u.email||'کاربر');
                      var nav=document.querySelector('.nav-actions,.dashboard-nav .nav-actions,.nav nav,.nav');
                      if(!nav||document.getElementById('amnayarAppUserChip')||document.getElementById('amnaToolsUser'))return;
                      var chip=document.createElement('span');chip.id='amnayarAppUserChip';chip.className='user-chip';chip.textContent='کاربر: '+name;
                      chip.style.cssText='display:inline-block;max-width:190px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:7px 10px;border:1px solid #d8e5f4;border-radius:10px;background:#f4f8ff;color:#12345a;font-size:12px;font-weight:800';
                      nav.appendChild(chip);
                    }).catch(function(){});
                  })();
                  document.querySelectorAll('a[href]').forEach(function(a){try{var u=new URL(a.href,location.href);if(u.origin===location.origin){u.searchParams.set('app','1');u.searchParams.set('appVersion',new URLSearchParams(location.search).get('appVersion')||'1.0.2');a.href=u.toString();}}catch(e){}});
                  document.querySelectorAll('a[target="_blank"]').forEach(function(a){try{if(new URL(a.href,location.href).origin!==location.origin)a.target='_self';}catch(e){}});
                  var style=document.getElementById('amnayar-app-cleanup');
                  if(!style){style=document.createElement('style');style.id='amnayar-app-cleanup';style.textContent='#topics,#support,.support,.ay-ad-showcase,.ad-grid,.ad-slot,.amnayar-free-ad,.monetization-section,.advertisement,.ad-container,[data-ad],iframe[src*="ad"],a[href="/advertising.html"],a[href^="/advertising.html"],a[href="#support"]{display:none!important}.nav .btn{white-space:nowrap!important;font-size:11px!important;padding:7px 8px!important}.brand span{white-space:nowrap!important}.tool-panel .tool-actions .btn{white-space:nowrap!important;overflow-wrap:normal!important;word-break:keep-all!important;font-size:12px!important}';document.head.appendChild(style);}
                  function amnayarAppLabels(){
                    document.querySelectorAll('a,button,[role="button"],h2').forEach(function(el){
                      var t=(el.innerText||el.textContent||'').replace(/\s+/g,' ').trim();
                      if(/ثبت.?نام رایگان/.test(t))el.textContent='ثبت‌نام برای دسترسی کامل';
                      if(t==='ساخت حساب رایگان'){
                        el.textContent='ورود به‌عنوان مهمان';
                        el.onclick=function(e){if(e)e.preventDefault();location.href='/tools.html?app=1';};
                      }
                      if(t==='ساخت حساب')el.textContent='ثبت‌نام برای دسترسی کامل';
                    });
                  }
                  amnayarAppLabels();
                  if(!window.__amnayarAppLabelObserver){
                    window.__amnayarAppLabelObserver=new MutationObserver(amnayarAppLabels);
                    window.__amnayarAppLabelObserver.observe(document.body,{childList:true,subtree:true});
                  }
                  document.querySelectorAll('a,button,[role="button"]').forEach(function(el){
                    var t=(el.innerText||el.textContent||'').replace(/\s+/g,' ').trim();
                    if(/اشتراک.?گذاری|share/i.test(t))el.remove();
                  });
                  document.querySelectorAll('a').forEach(function(el){
                    var t=(el.innerText||el.textContent||'').trim();
                    if(/اینستاگرام امنا یار|@amnayar\.2026|برای گوگل و اینستاگرام/i.test(t))el.remove();
                  });
                })();""", null)
                // Check a public release manifest and show an in-app update prompt only for newer releases.
                view.evaluateJavascript("""(function(){
                  if(window.__amnayarVersionCheckStarted)return;window.__amnayarVersionCheckStarted=true;
                  var currentCode=${BuildConfig.VERSION_CODE};
                  fetch('https://amnayar.ir/app-version.json?ts='+Date.now(),{cache:'no-store'})
                    .then(function(r){if(!r.ok)throw Error('version_manifest');return r.json()})
                    .then(function(v){
                      if(!v||Number(v.versionCode)<=currentCode||document.getElementById('amnayar-update-banner'))return;
                      var box=document.createElement('section');box.id='amnayar-update-banner';
                      box.style.cssText='position:fixed;z-index:2147483647;inset:auto 12px 14px 12px;background:#fff;color:#14243b;border:1px solid #cbdcf0;border-radius:18px;box-shadow:0 12px 42px rgba(0,0,0,.25);padding:16px;font:14px Tahoma,Arial,sans-serif;direction:rtl';
                      var title=document.createElement('b');title.textContent='نسخه جدید امنا یار آماده است'+(v.versionName?' ('+v.versionName+')':'');
                      var detail=document.createElement('p');detail.textContent=v.releaseNotes||'برای دریافت امکانات و اصلاحات جدید، نسخه تازه را از بازار بررسی کنید.';detail.style.cssText='margin:8px 0 12px;line-height:1.8';
                      var actions=document.createElement('div');actions.style.cssText='display:flex;gap:8px;flex-wrap:wrap';
                      var go=document.createElement('a');go.href=v.bazaarUrl||'https://cafebazaar.ir/search?q=%D8%A7%D9%85%D9%86%D8%A7%20%DB%8C%D8%A7%D8%B1';go.textContent='بررسی نسخه در بازار';go.style.cssText='display:inline-block;padding:10px 14px;border-radius:10px;background:#0d4a91;color:#fff;text-decoration:none;font-weight:700';
                      var later=document.createElement('button');later.type='button';later.textContent='بعداً';later.style.cssText='padding:10px 14px;border:1px solid #d6e0ec;border-radius:10px;background:#f7f9fc;color:#14243b;font-weight:700';
                      later.onclick=function(){box.remove()};actions.appendChild(go);actions.appendChild(later);box.appendChild(title);box.appendChild(detail);box.appendChild(actions);document.body.appendChild(box);
                    }).catch(function(){});
                })();""", null)
            }
            override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                if (request.isForMainFrame) view.postDelayed({ view.loadUrl("https://amnayar.ir/?app=1") }, 500)
            }
        }

        web.addJavascriptInterface(DownloadBridge(), "AmnaYarDownloader")
        web.addJavascriptInterface(DeviceBridge(), "AmnaYarDevice")
        web.addJavascriptInterface(SpeechBridge(), "AmnaYarSpeech")

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
            override fun onPermissionRequest(request: PermissionRequest) {
                runOnUiThread {
                    if (request.resources.contains(PermissionRequest.RESOURCE_AUDIO_CAPTURE)) {
                        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                            request.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE))
                        } else {
                            pendingWebAudioRequest = request
                            requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), webAudioPermissionRequestCode)
                        }
                    } else request.deny()
                }
            }

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
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission("android.permission.POST_NOTIFICATIONS") != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(arrayOf("android.permission.POST_NOTIFICATIONS"), 7401)
        }
        if (savedInstanceState == null) web.loadUrl("https://amnayar.ir/?app=1&appVersion=1.0.2") else web.restoreState(savedInstanceState)
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
        speechRecognizer?.cancel()
        speechRecognizer?.destroy()
        speechRecognizer = null
        web.stopLoading()
        web.destroy()
        super.onDestroy()
    }
}
