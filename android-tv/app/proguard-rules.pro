# métodos chamados pelo JavaScript da página (window.StreamHubTV)
-keepclassmembers class com.streamhub.tv.MainActivity$TvBridge {
    @android.webkit.JavascriptInterface <methods>;
}
-keepattributes JavascriptInterface
