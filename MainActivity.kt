package com.legndofgate

import android.app.Activity
import android.os.Bundle
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import android.webkit.WebSettings

class MainActivity : Activity() {
    private lateinit var gameView: WebView

    @Suppress("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        gameView = WebView(this)
        gameView.webViewClient = WebViewClient()
        gameView.webChromeClient = WebChromeClient()
        gameView.settings.javaScriptEnabled = true
        gameView.settings.domStorageEnabled = true
        gameView.settings.cacheMode = WebSettings.LOAD_DEFAULT
        gameView.settings.allowFileAccess = true
        gameView.settings.allowContentAccess = true
        gameView.loadUrl("file:///android_asset/index.html")
        setContentView(gameView)
    }

    override fun onBackPressed() {
        if (gameView.canGoBack()) gameView.goBack() else super.onBackPressed()
    }
}
