package com.streamhub.tv

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Context
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.StateListDrawable
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.text.InputType
import android.util.TypedValue
import android.view.Gravity
import android.view.KeyEvent
import android.view.View
import android.view.WindowManager
import android.view.inputmethod.EditorInfo
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import kotlin.concurrent.thread

/**
 * App de TV do StreamHub. O servidor continua sendo o PC: o app acha o StreamHub na rede de casa, guarda o endereço
 * e mostra a mesma interface do navegador, em modo TV (navegação pelo controle remoto).
 */
class MainActivity : Activity() {
    private lateinit var root: FrameLayout
    private lateinit var web: WebView
    private lateinit var panel: LinearLayout
    private lateinit var status: TextView
    private lateinit var spinner: ProgressBar
    private lateinit var foundList: LinearLayout
    private lateinit var manual: EditText
    private val main = Handler(Looper.getMainLooper())
    private val prefs by lazy { getSharedPreferences("streamhub", Context.MODE_PRIVATE) }

    private var server: String? = null
    private var scanning = false
    private var lastBack = 0L
    private var customView: View? = null
    private var customCallback: WebChromeClient.CustomViewCallback? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        root = FrameLayout(this).apply { setBackgroundColor(BG) }
        web = buildWebView()
        panel = buildPanel()
        root.addView(web, FrameLayout.LayoutParams(-1, -1))
        root.addView(panel, FrameLayout.LayoutParams(-1, -1))
        setContentView(root)
        web.visibility = View.INVISIBLE

        val saved = prefs.getString(KEY_SERVER, null)
        if (saved != null) {
            showPanel("Conectando a ${host(saved)}…", busy = true)
            thread {
                val ok = ServerFinder.probe(saved, 3000)
                main.post { if (ok) open(saved) else discover("O servidor salvo (${host(saved)}) não respondeu. Procurando o PC na rede…") }
            }
        } else {
            discover("Procurando o StreamHub na rede…")
        }
    }

    // ------------------------------------------------------------------------------------------- WebView

    @SuppressLint("SetJavaScriptEnabled")
    private fun buildWebView(): WebView = WebView(this).apply {
        setBackgroundColor(BG)
        isFocusable = true
        isFocusableInTouchMode = true
        settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            useWideViewPort = true
            loadWithOverviewMode = true
            setSupportZoom(false)
            builtInZoomControls = false
            displayZoomControls = false
            textZoom = 100
            cacheMode = WebSettings.LOAD_DEFAULT
            mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
            // a página liga o modo TV quando vê esta marca
            userAgentString = "$userAgentString StreamHubTV/${BuildInfo.VERSION}"
        }
        addJavascriptInterface(TvBridge(), "StreamHubTV")
        webViewClient = object : WebViewClient() {
            override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                if (request.isForMainFrame) {
                    // o PC desligou ou mudou de IP: procura de novo
                    discover("Sem resposta de ${host(server ?: "")} (${error.description}). Procurando o PC na rede…")
                }
            }

            override fun onPageFinished(view: WebView, url: String) {
                if (panel.visibility != View.VISIBLE) view.requestFocus()
            }
        }
        webChromeClient = object : WebChromeClient() {
            // sem isso o WebView mostra um ícone cinza de "play" antes do vídeo começar
            override fun getDefaultVideoPoster(): Bitmap = Bitmap.createBitmap(1, 1, Bitmap.Config.ARGB_8888)

            override fun onShowCustomView(view: View, callback: CustomViewCallback) {
                hideCustomView()
                customView = view
                customCallback = callback
                root.addView(view, FrameLayout.LayoutParams(-1, -1))
                web.visibility = View.INVISIBLE
                view.requestFocus()
            }

            override fun onHideCustomView() = hideCustomView()
        }
    }

    private fun hideCustomView() {
        val v = customView ?: return
        root.removeView(v)
        customView = null
        customCallback?.onCustomViewHidden()
        customCallback = null
        web.visibility = View.VISIBLE
        web.requestFocus()
    }

    private fun open(base: String) {
        server = base
        prefs.edit().putString(KEY_SERVER, base).apply()
        panel.visibility = View.GONE
        web.visibility = View.VISIBLE
        val current = web.url
        if (current == null || !current.startsWith(base)) web.loadUrl("$base/")
        web.requestFocus()
    }

    /** Funções que a página chama (window.StreamHubTV). */
    inner class TvBridge {
        @JavascriptInterface
        fun keepScreenOn(on: Boolean) {
            main.post {
                if (on) window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                else window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            }
        }

        @JavascriptInterface
        fun changeServer() {
            main.post { showPanel("Escolha o servidor ou procure de novo.", busy = false, cancelable = true) }
        }

        @JavascriptInterface
        fun serverAddress(): String = server?.let { host(it) } ?: ""
    }

    // ------------------------------------------------------------------------------------------- busca do servidor

    private fun discover(message: String) {
        if (scanning) return
        scanning = true
        showPanel(message, busy = true)
        foundList.removeAllViews()
        val ip = ServerFinder.localIp(this)
        if (ip == null) {
            scanning = false
            showPanel("A TV não está conectada à rede. Conecte ao Wi-Fi ou cabo da mesma rede do PC e tente de novo.", busy = false)
            return
        }
        thread {
            val found = ServerFinder.scan(this) { p -> main.post { if (scanning) status.text = "$message ($p%)" } }
            main.post {
                scanning = false
                when (found.size) {
                    1 -> open(found[0])
                    0 -> showPanel(
                        "Não achei o StreamHub na rede (TV em $ip).\n" +
                            "Confira se o PC está ligado com o StreamHub rodando (docker compose up) e na mesma rede da TV.\n" +
                            "Se preferir, digite o IP do PC abaixo.",
                        busy = false,
                    )
                    else -> {
                        showPanel("Achei mais de um StreamHub na rede. Qual deles?", busy = false)
                        found.forEach { base -> foundList.addView(button("Servidor ${host(base)}") { open(base) }, LinearLayout.LayoutParams(-2, -2).apply { topMargin = dp(8) }) }
                        foundList.getChildAt(0)?.requestFocus()
                    }
                }
            }
        }
    }

    private fun connectManual() {
        val base = ServerFinder.normalize(manual.text.toString())
        if (base == null) {
            status.text = "Digite o IP do PC, por exemplo 192.168.0.10"
            return
        }
        showPanel("Conectando a ${host(base)}…", busy = true)
        thread {
            val ok = ServerFinder.probe(base, 4000)
            main.post {
                if (ok) open(base)
                else showPanel("Nada respondeu em ${host(base)}. Confira o IP do PC e se o StreamHub está rodando.", busy = false)
            }
        }
    }

    // ------------------------------------------------------------------------------------------- tela de conexão

    private var panelCancelable = false

    private fun showPanel(message: String, busy: Boolean, cancelable: Boolean = false) {
        panelCancelable = cancelable && server != null
        panel.visibility = View.VISIBLE
        status.text = message
        spinner.visibility = if (busy) View.VISIBLE else View.GONE
        if (!busy) {
            if (manual.text.isEmpty()) server?.let { manual.setText(host(it)) }
            (foundList.getChildAt(0) ?: panel.findViewWithTag<View>("retry"))?.requestFocus()
        }
    }

    private fun buildPanel(): LinearLayout {
        val col = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setBackgroundColor(BG)
            setPadding(dp(48), dp(32), dp(48), dp(32))
        }
        col.addView(TextView(this).apply {
            text = "StreamHub"
            setTextColor(RED)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 52f)
            typeface = Typeface.create("sans-serif-condensed", Typeface.BOLD)
            gravity = Gravity.CENTER
        })
        spinner = ProgressBar(this).apply { isIndeterminate = true }
        col.addView(spinner, LinearLayout.LayoutParams(dp(48), dp(48)).apply { topMargin = dp(16) })
        status = TextView(this).apply {
            setTextColor(Color.rgb(220, 220, 225))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 18f)
            gravity = Gravity.CENTER
            setLineSpacing(0f, 1.2f)
        }
        col.addView(status, LinearLayout.LayoutParams(dp(720), -2).apply { topMargin = dp(16) })
        foundList = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER_HORIZONTAL }
        col.addView(foundList, LinearLayout.LayoutParams(-2, -2).apply { topMargin = dp(12) })

        val row = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
        manual = EditText(this).apply {
            hint = "IP do PC (ex.: 192.168.0.10)"
            setHintTextColor(Color.rgb(130, 130, 140))
            setTextColor(Color.WHITE)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 18f)
            setSingleLine()
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_URI
            imeOptions = EditorInfo.IME_ACTION_GO
            background = boxBackground()
            setPadding(dp(16), dp(10), dp(16), dp(10))
            setOnEditorActionListener { _, id, _ -> if (id == EditorInfo.IME_ACTION_GO || id == EditorInfo.IME_ACTION_DONE) { connectManual(); true } else false }
        }
        row.addView(manual, LinearLayout.LayoutParams(dp(340), -2))
        row.addView(button("Conectar") { connectManual() }, LinearLayout.LayoutParams(-2, -2).apply { leftMargin = dp(12) })
        col.addView(row, LinearLayout.LayoutParams(-2, -2).apply { topMargin = dp(24) })
        col.addView(button("Procurar de novo") { discover("Procurando o StreamHub na rede…") }.apply { tag = "retry" },
            LinearLayout.LayoutParams(-2, -2).apply { topMargin = dp(16) })
        col.addView(TextView(this).apply {
            text = "No PC, o StreamHub precisa estar rodando (porta ${ServerFinder.PORT}). Menu do controle: trocar servidor."
            setTextColor(Color.rgb(120, 120, 130))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f)
            gravity = Gravity.CENTER
        }, LinearLayout.LayoutParams(-2, -2).apply { topMargin = dp(28) })
        return col
    }

    private fun button(label: String, onClick: () -> Unit) = Button(this).apply {
        text = label
        isAllCaps = false
        setTextColor(Color.WHITE)
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 18f)
        background = StateListDrawable().apply {
            addState(intArrayOf(android.R.attr.state_focused), rounded(RED, Color.WHITE))
            addState(intArrayOf(android.R.attr.state_pressed), rounded(RED, Color.WHITE))
            addState(intArrayOf(), rounded(Color.rgb(50, 50, 55), Color.TRANSPARENT))
        }
        setPadding(dp(24), dp(10), dp(24), dp(10))
        isFocusable = true
        setOnClickListener { onClick() }
    }

    private fun boxBackground() = StateListDrawable().apply {
        addState(intArrayOf(android.R.attr.state_focused), rounded(Color.rgb(40, 40, 44), Color.WHITE))
        addState(intArrayOf(), rounded(Color.rgb(40, 40, 44), Color.rgb(80, 80, 90)))
    }

    private fun rounded(fill: Int, stroke: Int) = GradientDrawable().apply {
        cornerRadius = dp(10).toFloat()
        setColor(fill)
        setStroke(dp(3), stroke)
    }

    // ------------------------------------------------------------------------------------------- teclas e ciclo de vida

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (event.keyCode == KeyEvent.KEYCODE_MENU && event.action == KeyEvent.ACTION_UP && panel.visibility != View.VISIBLE) {
            showPanel("Escolha o servidor ou procure de novo.", busy = false, cancelable = true)
            return true
        }
        return super.dispatchKeyEvent(event)
    }

    @Deprecated("Activity sem AndroidX: o voltar do controle chega aqui")
    override fun onBackPressed() {
        if (customView != null) { hideCustomView(); return }
        if (panel.visibility == View.VISIBLE) {
            if (panelCancelable) { panel.visibility = View.GONE; web.requestFocus() } else confirmExit()
            return
        }
        // a página decide primeiro (fecha menu, controles do player, volta uma tela)
        web.evaluateJavascript("(function(){try{return window.streamhubBack?window.streamhubBack():false}catch(e){return false}})()") { r ->
            if (r != "true") {
                if (web.canGoBack()) web.goBack() else confirmExit()
            }
        }
    }

    private fun confirmExit() {
        val now = System.currentTimeMillis()
        if (now - lastBack < 2000) { finish(); return }
        lastBack = now
        Toast.makeText(this, "Aperte voltar de novo para sair", Toast.LENGTH_SHORT).show()
    }

    override fun onPause() {
        // botão Home: pausa o vídeo (o progresso é salvo pela página ao pausar)
        web.evaluateJavascript("document.querySelectorAll('video').forEach(function(v){v.pause()})", null)
        web.onPause()
        super.onPause()
    }

    override fun onResume() {
        super.onResume()
        web.onResume()
    }

    override fun onDestroy() {
        web.destroy()
        super.onDestroy()
    }

    private fun dp(v: Int) = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v.toFloat(), resources.displayMetrics).toInt()
    private fun host(base: String) = base.removePrefix("http://").removePrefix("https://").removeSuffix(":${ServerFinder.PORT}")

    companion object {
        private const val KEY_SERVER = "server"
        private val BG = Color.rgb(20, 20, 20)
        private val RED = Color.rgb(229, 9, 20)
    }
}

private object BuildInfo { const val VERSION = "1.0" }
