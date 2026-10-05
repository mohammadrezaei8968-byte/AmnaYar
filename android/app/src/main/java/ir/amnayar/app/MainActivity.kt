package ir.amnayar.app
import android.annotation.SuppressLint
import android.app.Activity
import android.os.Bundle
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
class MainActivity : Activity() {
 private lateinit var web: WebView
 @SuppressLint("SetJavaScriptEnabled") override fun onCreate(savedInstanceState: Bundle?) { super.onCreate(savedInstanceState); web=WebView(this); web.settings.javaScriptEnabled=true; web.settings.domStorageEnabled=true; web.settings.databaseEnabled=true; web.settings.loadsImagesAutomatically=true; web.webViewClient=WebViewClient(); web.webChromeClient=WebChromeClient(); setContentView(web); if(savedInstanceState==null) web.loadUrl("https://amnayar.ir/") else web.restoreState(savedInstanceState) }
 override fun onSaveInstanceState(outState: Bundle){ web.saveState(outState); super.onSaveInstanceState(outState) }
 override fun onBackPressed(){ if(web.canGoBack()) web.goBack() else super.onBackPressed() }
}
