package app.caloriediary;

import android.app.Activity;
import android.Manifest;
import android.app.NotificationManager;
import android.content.ClipData;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.MediaStore;
import android.provider.Settings;
import android.view.View;
import android.view.Window;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class MainActivity extends Activity {
    static final String HOST = "diary.app.local";
    static final String DEFAULT_BASE = "https://api.odirouter.ai/v1";
    static final String ACTION_ADD = "app.caloriediary.ADD";
    static final int REQ_FILES = 1, REQ_EXPORT = 2, REQ_NOTIFY = 3, REQ_MIC = 4;
    /* model and API address always come from the build (secrets.properties or env); the key too, unless the build has none */
    static final boolean BUILT_IN = !BuildConfig.API_KEY.isEmpty();

    WebView web;
    SharedPreferences prefs;
    ValueCallback<Uri[]> fileCallback;
    Uri cameraUri;
    String pendingExport;
    String launchAction;
    PermissionRequest micRequest;
    final Map<String, HttpURLConnection> running = new HashMap<String, HttpURLConnection>();

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        prefs = getSharedPreferences("config", MODE_PRIVATE);
        paintBars();

        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true);
        s.setMediaPlaybackRequiresUserGesture(true);
        s.setSupportMultipleWindows(false);
        web.addJavascriptInterface(new Bridge(), "Native");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
                Uri u = req.getUrl();
                if (!HOST.equals(u.getHost())) return null;
                String path = u.getPath();
                if (path == null || path.equals("/")) path = "/index.html";
                try {
                    InputStream in = getAssets().open(path.substring(1));
                    String mime = path.endsWith(".js") ? "text/javascript" : path.endsWith(".css") ? "text/css"
                        : path.endsWith(".woff2") ? "font/woff2" : path.endsWith(".png") ? "image/png" : "text/html";
                    return new WebResourceResponse(mime, mime.startsWith("text") ? "utf-8" : null, in);
                } catch (Exception e) {
                    return new WebResourceResponse("text/plain", "utf-8", 404, "Not found", null, null);
                }
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                Uri u = req.getUrl();
                if (HOST.equals(u.getHost())) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception e) { }
                return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> cb, FileChooserParams params) {
                return openChooser(cb, params);
            }

            /* microphone for voice messages: the page asks through getUserMedia, Android asks the user once */
            @Override
            public void onPermissionRequest(final PermissionRequest req) {
                runOnUiThread(new Runnable() {
                    public void run() { grantMic(req); }
                });
            }
        });
        setContentView(web);
        launchAction = getIntent() != null ? getIntent().getAction() : null;
        Reminders.schedule(this);
        if (!prefs.getBoolean("askedNotify", false) && Reminders.anyOn(this)) askNotify();
        if (state != null) web.restoreState(state);
        else web.loadUrl("https://" + HOST + "/index.html");
    }

    @Override
    protected void onNewIntent(Intent i) {
        super.onNewIntent(i);
        if (ACTION_ADD.equals(i.getAction())) js("window.__focusAdd && __focusAdd()");
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) js("window.__native && __native.notifyChanged && __native.notifyChanged()");
    }

    boolean notifyAllowed() {
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return false;
        return ((NotificationManager) getSystemService(NOTIFICATION_SERVICE)).areNotificationsEnabled();
    }

    void askNotify() {
        prefs.edit().putBoolean("askedNotify", true).apply();
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED)
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQ_NOTIFY);
    }

    void grantMic(PermissionRequest req) {
        boolean audio = false;
        for (String r : req.getResources()) if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(r)) audio = true;
        if (!audio) { req.deny(); return; }
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
            req.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
            return;
        }
        if (micRequest != null) micRequest.deny();
        micRequest = req;
        requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, REQ_MIC);
    }

    @Override
    public void onRequestPermissionsResult(int req, String[] perms, int[] res) {
        if (req == REQ_NOTIFY) js("window.__native && __native.notifyChanged()");
        if (req == REQ_MIC && micRequest != null) {
            if (res.length > 0 && res[0] == PackageManager.PERMISSION_GRANTED) micRequest.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
            else micRequest.deny();
            micRequest = null;
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    boolean isNight() {
        return (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
    }

    void paintBars() {
        Window w = getWindow();
        boolean night = isNight();
        int bg = BuildConfig.PET ? Color.parseColor(night ? "#1E1F22" : "#E9E9EB") : Color.parseColor(night ? "#111318" : "#F3F4F7");
        w.setStatusBarColor(bg);
        w.setNavigationBarColor(bg);
        View d = w.getDecorView();
        int flags = 0;
        if (!night) {
            flags |= View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
            if (Build.VERSION.SDK_INT >= 26) flags |= View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
        }
        d.setSystemUiVisibility(flags);
        d.setBackgroundColor(bg);
    }

    /* photo picker: gallery plus a camera option */
    boolean openChooser(ValueCallback<Uri[]> cb, WebChromeClient.FileChooserParams params) {
        if (fileCallback != null) fileCallback.onReceiveValue(null);
        fileCallback = cb;
        cameraUri = null;
        boolean multiple = params.getMode() == WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE;
        String[] types = params.getAcceptTypes();
        boolean images = false;
        for (String t : types) if (t != null && t.startsWith("image")) images = true;

        Intent pick = new Intent(Intent.ACTION_GET_CONTENT);
        pick.addCategory(Intent.CATEGORY_OPENABLE);
        pick.setType(images ? "image/*" : "*/*");
        if (multiple) pick.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);

        Intent chooser = Intent.createChooser(pick, images ? "Фото еды" : "Файл");
        if (images) {
            try {
                Intent cam = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
                cameraUri = CamProvider.newPhotoUri(this);
                cam.putExtra(MediaStore.EXTRA_OUTPUT, cameraUri);
                cam.setClipData(ClipData.newRawUri("", cameraUri));
                cam.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
                chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS, new Intent[]{cam});
            } catch (Exception e) {
                cameraUri = null;
            }
        }
        try {
            startActivityForResult(chooser, REQ_FILES);
        } catch (Exception e) {
            fileCallback = null;
            return false;
        }
        return true;
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        if (req == REQ_FILES) {
            if (fileCallback == null) return;
            Uri[] out = null;
            if (res == RESULT_OK) {
                List<Uri> list = new ArrayList<Uri>();
                if (data != null && data.getClipData() != null && data.getAction() == null) {
                    ClipData cd = data.getClipData();
                    for (int i = 0; i < cd.getItemCount(); i++) list.add(cd.getItemAt(i).getUri());
                } else if (data != null && data.getData() != null) {
                    list.add(data.getData());
                }
                if (list.isEmpty() && cameraUri != null && CamProvider.hasPhoto(this, cameraUri)) list.add(cameraUri);
                if (!list.isEmpty()) out = list.toArray(new Uri[0]);
            }
            fileCallback.onReceiveValue(out);
            fileCallback = null;
        } else if (req == REQ_EXPORT) {
            String payload = pendingExport;
            pendingExport = null;
            boolean ok = false;
            if (res == RESULT_OK && data != null && data.getData() != null && payload != null) {
                try {
                    OutputStream os = getContentResolver().openOutputStream(data.getData(), "wt");
                    os.write(payload.getBytes("UTF-8"));
                    os.close();
                    ok = true;
                } catch (Exception e) { }
            }
            js("window.__native && __native.exported(" + ok + ")");
        }
    }

    void js(final String code) {
        runOnUiThread(new Runnable() {
            public void run() { web.evaluateJavascript(code, null); }
        });
    }

    static String q(String s) { return JSONObject.quote(s == null ? "" : s); }

    String key() { return BUILT_IN ? BuildConfig.API_KEY : prefs.getString("key", ""); }
    String model() { return BuildConfig.MODEL; }
    String base() {
        String b = BuildConfig.API_BASE.trim();
        while (b.endsWith("/")) b = b.substring(0, b.length() - 1);
        return b.isEmpty() ? DEFAULT_BASE : b;
    }

    static String readAll(InputStream in) throws Exception {
        if (in == null) return "";
        ByteArrayOutputStream bo = new ByteArrayOutputStream();
        byte[] buf = new byte[8192];
        int n;
        while ((n = in.read(buf)) > 0) bo.write(buf, 0, n);
        return bo.toString("UTF-8");
    }

    static String codeFor(int status, String body) {
        String b = body == null ? "" : body.toLowerCase();
        if (status == 401 || status == 403) return "auth";
        if (status == 402 || b.contains("insufficient") || b.contains("balance") || b.contains("credit")) return "no_credit";
        if (status == 429) return "rate_limited";
        if (status == 404 || (status == 400 && b.contains("model"))) return "bad_model";
        return "http";
    }

    static String errMessage(String body) {
        try {
            JSONObject o = new JSONObject(body);
            Object e = o.opt("error");
            if (e instanceof JSONObject) return ((JSONObject) e).optString("message", body);
            if (e instanceof String) return (String) e;
            return o.optString("message", body);
        } catch (Exception ex) {
            return body;
        }
    }

    void request(final String id, final String method, final String path, final String body, final boolean stream) {
        new Thread(new Runnable() {
            public void run() {
                HttpURLConnection c = null;
                try {
                    if (key().isEmpty()) { js("__native.fail(" + q(id) + ",'no_key','')"); return; }
                    c = (HttpURLConnection) new URL(base() + path).openConnection();
                    synchronized (running) { running.put(id, c); }
                    c.setRequestMethod(method);
                    c.setConnectTimeout(20000);
                    c.setReadTimeout(180000);
                    c.setRequestProperty("Authorization", "Bearer " + key());
                    c.setRequestProperty("Accept", stream ? "text/event-stream" : "application/json");
                    if (body != null) {
                        c.setDoOutput(true);
                        c.setRequestProperty("Content-Type", "application/json; charset=utf-8");
                        OutputStream os = c.getOutputStream();
                        os.write(body.getBytes("UTF-8"));
                        os.close();
                    }
                    int status = c.getResponseCode();
                    if (status >= 400) {
                        String err = readAll(c.getErrorStream());
                        js("__native.fail(" + q(id) + "," + q(codeFor(status, err)) + "," + q(status + ": " + errMessage(err)) + ")");
                        return;
                    }
                    if (!stream) {
                        js("__native.done(" + q(id) + "," + q(readAll(c.getInputStream())) + ")");
                        return;
                    }
                    BufferedReader r = new BufferedReader(new InputStreamReader(c.getInputStream(), "UTF-8"));
                    StringBuilder full = new StringBuilder();
                    String line;
                    long lastFlush = 0;
                    StringBuilder pending = new StringBuilder();
                    while ((line = r.readLine()) != null) {
                        if (!line.startsWith("data:")) continue;
                        String data = line.substring(5).trim();
                        if (data.equals("[DONE]")) break;
                        try {
                            JSONObject o = new JSONObject(data);
                            if (o.has("error")) {
                                js("__native.fail(" + q(id) + ",'http'," + q(errMessage(data)) + ")");
                                return;
                            }
                            JSONArray ch = o.optJSONArray("choices");
                            if (ch == null || ch.length() == 0) continue;
                            JSONObject delta = ch.getJSONObject(0).optJSONObject("delta");
                            if (delta == null) continue;
                            Object content = delta.opt("content");
                            if (content instanceof String && !((String) content).isEmpty()) {
                                full.append((String) content);
                                pending.append((String) content);
                            }
                        } catch (Exception ignore) { }
                        long now = System.currentTimeMillis();
                        if (pending.length() > 0 && now - lastFlush > 60) {
                            js("__native.chunk(" + q(id) + "," + q(pending.toString()) + ")");
                            pending.setLength(0);
                            lastFlush = now;
                        }
                    }
                    if (pending.length() > 0) js("__native.chunk(" + q(id) + "," + q(pending.toString()) + ")");
                    js("__native.done(" + q(id) + "," + q(full.toString()) + ")");
                } catch (Exception e) {
                    boolean cancelled;
                    synchronized (running) { cancelled = !running.containsKey(id); }
                    js("__native.fail(" + q(id) + "," + (cancelled ? "'cancelled'" : "'network'") + "," + q(String.valueOf(e.getMessage())) + ")");
                } finally {
                    synchronized (running) { running.remove(id); }
                    if (c != null) c.disconnect();
                }
            }
        }).start();
    }

    class Bridge {
        @JavascriptInterface
        public String config() {
            try {
                JSONObject o = new JSONObject();
                o.put("base", base());
                o.put("model", model());
                o.put("audioModel", BuildConfig.AUDIO_MODEL);
                o.put("hasKey", !key().isEmpty());
                o.put("builtIn", BUILT_IN);
                o.put("reminders", Reminders.load(MainActivity.this));
                o.put("notifyAllowed", notifyAllowed());
                o.put("night", isNight());
                return o.toString();
            } catch (Exception e) {
                return "{}";
            }
        }

        @JavascriptInterface
        public void saveConfig(String json) {
            try {
                JSONObject o = new JSONObject(json);
                SharedPreferences.Editor ed = prefs.edit();
                if (o.has("base")) ed.putString("base", o.getString("base").trim());
                if (o.has("model")) ed.putString("model", o.getString("model").trim());
                if (o.has("key")) ed.putString("key", o.getString("key").trim());
                ed.apply();
            } catch (Exception e) { }
        }

        @JavascriptInterface
        public void saveReminders(String json) {
            Reminders.save(MainActivity.this, json);
            if (Reminders.anyOn(MainActivity.this) && !notifyAllowed()) runOnUiThread(new Runnable() { public void run() { askNotify(); } });
        }

        @JavascriptInterface
        public void openNotifySettings() {
            Intent i = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName());
            try { startActivity(i); } catch (Exception e) { }
        }

        /* today's totals from the page, for reminders (and the widget) */
        @JavascriptInterface
        public void pushToday(String json) {
            if (json.equals(prefs.getString("today", ""))) return;
            prefs.edit().putString("today", json).commit();
            Widgets.updateAll(MainActivity.this);
        }

        /* "add" when the app was opened from a reminder; asked once by the page after it loads */
        @JavascriptInterface
        public boolean takeAddRequest() {
            boolean add = ACTION_ADD.equals(launchAction);
            launchAction = null;
            return add;
        }

        @JavascriptInterface
        public void chat(String id, String body, boolean stream) {
            request(id, "POST", "/chat/completions", body, stream);
        }

        @JavascriptInterface
        public void models(String id) {
            request(id, "GET", "/models", null, false);
        }

        @JavascriptInterface
        public void cancel(String id) {
            HttpURLConnection c;
            synchronized (running) { c = running.remove(id); }
            if (c != null) {
                final HttpURLConnection cc = c;
                new Thread(new Runnable() { public void run() { cc.disconnect(); } }).start();
            }
        }

        @JavascriptInterface
        public void exportFile(final String name, String content) {
            pendingExport = content;
            runOnUiThread(new Runnable() {
                public void run() {
                    Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                    i.addCategory(Intent.CATEGORY_OPENABLE);
                    i.setType("application/json");
                    i.putExtra(Intent.EXTRA_TITLE, name);
                    try { startActivityForResult(i, REQ_EXPORT); } catch (Exception e) { js("__native.exported(false)"); }
                }
            });
        }
    }
}
