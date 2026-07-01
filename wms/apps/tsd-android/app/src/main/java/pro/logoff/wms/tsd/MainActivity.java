package pro.logoff.wms.tsd;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.net.ConnectivityManager;
import android.net.NetworkInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.text.Editable;
import android.text.InputType;
import android.text.TextWatcher;
import android.view.Gravity;
import android.view.inputmethod.EditorInfo;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.EditText;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Spinner;
import android.widget.TextView;
import android.widget.Toast;

import androidx.core.content.FileProvider;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.BufferedReader;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MainActivity extends Activity {
    private static final String DEFAULT_API_URL = "https://wms.logoff.pro/api/v1";
    private static final String UPDATE_MANIFEST_URL = "https://wms.logoff.pro/downloads/logoff-tsd.json";
    private static final int RED = Color.rgb(180, 0, 18);
    private static final int GREEN = Color.rgb(12, 128, 72);
    private static final int BLUE = Color.rgb(0, 88, 180);
    private static final int BG = Color.rgb(247, 244, 241);
    private static final int FLASH_NONE = -1;

    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ArrayList<Client> clients = new ArrayList<>();
    private final ArrayList<PickRequest> pickRequests = new ArrayList<>();
    private final HashSet<String> receiptKiz = new HashSet<>();
    private final HashSet<String> roleCodes = new HashSet<>();
    private final HashSet<String> permissionCodes = new HashSet<>();
    private final ArrayList<JSONObject> relabelBatchQueue = new ArrayList<>();
    private final ArrayList<ReceiptLine> currentBoxLines = new ArrayList<>();
    private final ArrayList<ReceiptBoxSummary> receiptBoxes = new ArrayList<>();
    private final ArrayList<String> boxRecheckBarcodes = new ArrayList<>();

    private SharedPreferences prefs;
    private OfflineQueue queue;
    private ApiClient api;

    private String token = "";
    private String userId = "";
    private String userName = "";
    private String deviceCode = "TSD-01";
    private String apiUrl = DEFAULT_API_URL;
    private String selectedClientId = "";
    private String selectedClientName = "";
    private String relabelBatchRequestId = "";
    private String relabelBatchBoxCode = "";
    private boolean relabelBatchSourceConfirmed = false;
    private boolean relabelBatchTargetConfirmed = false;
    private String receiptId = newReceiptId();
    private String boxCode = "";
    private String pendingBarcode = "";
    private String lastConfirmedBarcode = "";
    private ReceiptSku pendingReceiptSku = null;
    private ReceiptSku lastReceiptSku = null;
    private String interfaceMode = "recommended";
    private String language = "ru";
    private boolean boxSearchScanBusy = false;
    private String lastBoxSearchScanCode = "";
    private long lastBoxSearchScanAtMs = 0L;
    private Runnable backAction = null;
    private long lastRootBackAtMs = 0L;
    private boolean updateCheckRunning = false;

    @Override
    protected void onCreate(Bundle bundle) {
        super.onCreate(bundle);
        prefs = getSharedPreferences("logoff_tsd", MODE_PRIVATE);
        queue = new OfflineQueue(prefs);
        loadSession();
        showSplash();
        main.postDelayed(() -> {
            if (token.isEmpty()) {
                showLogin();
                checkForUpdate(false);
            } else {
                showMenu();
                loadClients();
                syncQueue();
                checkForUpdate(false);
            }
        }, 700);
    }

    @Override
    public void onBackPressed() {
        if (backAction != null) {
            Runnable action = backAction;
            backAction = null;
            action.run();
            return;
        }

        long now = System.currentTimeMillis();
        if (now - lastRootBackAtMs < 1800) {
            finish();
            return;
        }
        lastRootBackAtMs = now;
        toast(tr("common.backAgainExit"));
    }

    private void showSplash() {
        setBackAction(null);
        LinearLayout root = page();
        root.setGravity(Gravity.CENTER);
        TextView logo = new TextView(this);
        logo.setText("ТСД");
        logo.setTextColor(Color.WHITE);
        logo.setTextSize(34);
        logo.setGravity(Gravity.CENTER);
        logo.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        logo.setBackgroundColor(BLUE);
        root.addView(logo, new LinearLayout.LayoutParams(dp(150), dp(150)));
        setContentView(root);
    }

    private void showLogin() {
        setBackAction(null);
        LinearLayout root = page();
        root.setPadding(dp(18), dp(24), dp(18), dp(18));
        addLogo(root, false);
        addTitle(root, tr("login.title"));

        EditText login = input(tr("login.login"), false);
        login.setText(prefs.getString("login", ""));
        EditText password = input(tr("login.password"), true);
        EditText device = input(tr("login.device"), false);
        device.setText(deviceCode);
        EditText server = input(tr("login.server"), false);
        server.setText(apiUrl);

        Button button = primary(tr("login.connect"));
        button.setOnClickListener(v -> {
            apiUrl = text(server);
            api = new ApiClient(apiUrl);
            login(login.getText().toString(), password.getText().toString(), device.getText().toString());
        });
        Button update = secondary(tr("menu.update"));
        update.setOnClickListener(v -> checkForUpdate(true));

        root.addView(login);
        root.addView(password);
        root.addView(device);
        root.addView(server);
        root.addView(button);
        root.addView(update);
        setContentView(wrap(root));
    }

    private void login(String login, String password, String device) {
        if (login.trim().isEmpty() || password.trim().isEmpty()) {
            toast(tr("login.enterCredentials"));
            return;
        }
        runAsync(() -> {
            JSONObject response = api.login(login.trim(), password);
            JSONObject user = response.getJSONObject("user");
            if (!canUseTsd(user)) {
                throw new IllegalStateException(tr("login.noTsdAccess"));
            }
            loadAccess(user);
            token = response.getString("accessToken");
            userId = user.getString("id");
            userName = user.optString("name", login.trim());
            deviceCode = normalizeDevice(device);
            prefs.edit()
                .putString("apiUrl", apiUrl)
                .putString("login", login.trim())
                .putString("token", token)
                .putString("userId", userId)
                .putString("userName", userName)
                .putString("deviceCode", deviceCode)
                .putString("roleCodes", joinCodes(roleCodes))
                .putString("permissionCodes", joinCodes(permissionCodes))
                .apply();
            main.post(() -> {
                toast(tr("login.connected") + ": " + userName);
                showMenu();
                loadClients();
                syncQueue();
                checkForUpdate(false);
            });
        });
    }

    private void showMenu() {
        setBackAction(null);
        LinearLayout root = page();
        root.setPadding(dp(14), dp(16), dp(14), dp(14));
        addHeader(root);
        addStatus(root);

        Button receipt = primary(tr("menu.receipt"));
        receipt.setTextSize(scaledText(22));
        receipt.setMinHeight(dp(86));
        receipt.setOnClickListener(v -> showReceiptStart());
        root.addView(receipt);

        Button pick = primary(tr("menu.pick"));
        pick.setTextSize(scaledText(22));
        pick.setMinHeight(dp(86));
        pick.setOnClickListener(v -> showPickRequests());
        root.addView(pick);

        Button inventory = primary(tr("menu.inventory"));
        inventory.setTextSize(scaledText(22));
        inventory.setMinHeight(dp(86));
        inventory.setOnClickListener(v -> showInventoryMenu());
        root.addView(inventory);

        Button sync = secondary(tr("menu.sync") + " (" + queue.size() + ")");
        sync.setOnClickListener(v -> syncQueue());
        root.addView(sync);

        Button settings = secondary(tr("menu.settings"));
        settings.setOnClickListener(v -> showSettings());
        root.addView(settings);

        Button update = secondary(tr("menu.update"));
        update.setOnClickListener(v -> checkForUpdate(true));
        root.addView(update);

        Button exit = secondary(tr("menu.exit"));
        exit.setOnClickListener(v -> {
            if (queue.size() > 0) {
                toast(tr("menu.syncFirst") + ": " + queue.size());
                return;
            }
            prefs.edit().remove("token").remove("userId").remove("userName").apply();
            token = "";
            showLogin();
        });
        root.addView(exit);
        setContentView(wrap(root));
    }

    private void showSettings() {
        setBackAction(() -> showMenu());
        LinearLayout root = page();
        root.setPadding(dp(14), dp(16), dp(14), dp(14));
        addHeader(root);
        addTitle(root, tr("settings.title"));
        root.addView(note(tr("settings.note")));

        TextView scaleLabel = note(tr("settings.scale"));
        scaleLabel.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        root.addView(scaleLabel);

        Spinner scale = new Spinner(this);
        ArrayAdapter<Choice> scaleAdapter = new ArrayAdapter<>(
            this,
            android.R.layout.simple_spinner_dropdown_item,
            new Choice[] {
                new Choice("recommended", tr("settings.scale.recommended")),
                new Choice("compact", tr("settings.scale.compact")),
                new Choice("large", tr("settings.scale.large")),
            }
        );
        scale.setAdapter(scaleAdapter);
        scale.setSelection(choiceIndex(scaleAdapter, interfaceMode));
        root.addView(scale, matchWrap());

        TextView languageLabel = note(tr("settings.language"));
        languageLabel.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        root.addView(languageLabel);

        Spinner lang = new Spinner(this);
        ArrayAdapter<Choice> langAdapter = new ArrayAdapter<>(
            this,
            android.R.layout.simple_spinner_dropdown_item,
            new Choice[] {
                new Choice("ru", "Русский"),
                new Choice("uz", "O'zbekcha"),
                new Choice("en", "English"),
            }
        );
        lang.setAdapter(langAdapter);
        lang.setSelection(choiceIndex(langAdapter, language));
        root.addView(lang, matchWrap());

        Button save = primary(tr("settings.save"));
        save.setOnClickListener(v -> {
            Choice scaleChoice = (Choice) scale.getSelectedItem();
            Choice langChoice = (Choice) lang.getSelectedItem();
            interfaceMode = scaleChoice.value;
            language = langChoice.value;
            prefs.edit()
                .putString("interfaceMode", interfaceMode)
                .putString("language", language)
                .apply();
            toast(tr("settings.saved"));
            showMenu();
        });
        root.addView(save);

        addBackButton(root, tr("common.back"), () -> showMenu());
        setContentView(wrap(root));
    }

    private void showReceiptStart() {
        setBackAction(() -> showMenu());
        LinearLayout root = page();
        root.setPadding(dp(14), dp(16), dp(14), dp(14));
        addHeader(root);
        addTitle(root, tr("menu.receipt"));

        Spinner spinner = new Spinner(this);
        ArrayAdapter<Client> adapter = new ArrayAdapter<>(this, android.R.layout.simple_spinner_dropdown_item, clients);
        spinner.setAdapter(adapter);
        root.addView(spinner, matchWrap());

        Button refresh = secondary(tr("receipt.refreshClients"));
        refresh.setOnClickListener(v -> loadClients());
        root.addView(refresh);

        Button start = primary(tr("receipt.start"));
        start.setOnClickListener(v -> {
            if (clients.isEmpty()) {
                toast(tr("receipt.noClients"));
                return;
            }
            Client selected = (Client) spinner.getSelectedItem();
            selectedClientId = selected.id;
            selectedClientName = selected.name;
            resetReceiptSession();
            showBoxScan();
        });
        root.addView(start);

        addBackButton(root, tr("common.back"), () -> showMenu());
        setContentView(wrap(root));
    }

    private void showPickRequests() {
        setBackAction(() -> showMenu());
        LinearLayout root = page();
        root.setPadding(dp(14), dp(16), dp(14), dp(14));
        addHeader(root);
        addTitle(root, tr("menu.pick"));
        root.addView(note(tr("pick.hint")));

        Button refresh = secondary(tr("pick.refresh"));
        refresh.setOnClickListener(v -> loadPickRequests(true));
        root.addView(refresh);

        if (pickRequests.isEmpty()) {
            root.addView(note(tr("pick.empty")));
        }

        for (PickRequest request : pickRequests) {
            Button item = secondary(request.label(tr("common.cityMissing"), tr("pick.inWork")));
            item.setGravity(Gravity.LEFT | Gravity.CENTER_VERTICAL);
            if (request.hasActiveWorkers()) {
                item.setTextColor(Color.rgb(76, 48, 0));
                item.setBackgroundColor(Color.rgb(255, 231, 153));
            }
            item.setOnClickListener(v -> showPickRequestActions(request));
            root.addView(item);
        }

        addBackButton(root, tr("common.back"), () -> showMenu());
        setContentView(wrap(root));
        if (pickRequests.isEmpty()) {
            loadPickRequests(false);
        }
    }

    private void showPickRequestActions(PickRequest request) {
        if (request.storesWithoutBoxes) {
            showBoxlessPickRequestActions(request, null);
            runAsync(() -> {
                JSONObject state = api.boxlessPackingState(token, request.id, deviceCode);
                main.post(() -> showBoxlessPickRequestActions(request, state));
            });
            return;
        }
        showPickRequestActions(request, null, null);
        runAsync(() -> {
            JSONObject boxState = api.boxSearch(token, request.id, deviceCode);
            JSONObject relabelState = null;
            JSONObject movesState = null;
            if (boxState.optBoolean("isComplete") || hasStageControl()) {
                try {
                    relabelState = api.relabelState(token, request.id, deviceCode);
                    if (relabelState.optBoolean("isComplete") || hasStageControl()) {
                        movesState = api.movesState(token, request.id, deviceCode);
                    }
                } catch (Exception ignored) {
                }
            }
            JSONObject finalRelabelState = relabelState;
            JSONObject finalMovesState = movesState;
            main.post(() -> showPickRequestActions(request, boxState, finalRelabelState, finalMovesState));
        });
    }

    private void showPickRequestActions(PickRequest request, JSONObject boxState, JSONObject relabelState) {
        showPickRequestActions(request, boxState, relabelState, null);
    }

    private void showPickRequestActions(PickRequest request, JSONObject boxState, JSONObject relabelState, JSONObject movesState) {
        setBackAction(() -> showPickRequests());
        LinearLayout root = page();
        root.setPadding(dp(14), dp(16), dp(14), dp(14));
        addHeader(root);
        addTitle(root, tr("pick.request") + " " + request.shortNumber());
        root.addView(note(tr("common.client") + ": " + request.clientName));
        root.addView(note(tr("common.city") + ": " + firstNonEmpty(request.city, "-")));
        root.addView(note(tr("common.status") + ": " + request.status + " · " + tr("common.rows") + ": " + request.itemsCount));
        if (request.hasActiveWorkers()) {
            TextView working = note(tr("pick.inWork") + ": " + request.activeWorkersText);
            working.setTextColor(Color.rgb(120, 72, 0));
            root.addView(working);
        }

        Button boxes = stageButton("1. " + tr("boxSearch.title"), boxState != null && boxState.optBoolean("isComplete"));
        boxes.setOnClickListener(v -> loadBoxSearch(request));
        root.addView(boxes);

        Button relabel = stageButton("2. " + tr("pick.relabel"), relabelState != null && relabelState.optBoolean("isComplete"));
        relabel.setOnClickListener(v -> {
            if (!hasStageControl() && boxState != null && !boxState.optBoolean("isComplete")) {
                showStageCodeScreen(request, "relabel", tr("stage.relabelLocked"), false);
                return;
            }
            loadRelabelState(request);
        });
        root.addView(relabel);

        Button moves = stageButton("3. " + tr("pick.moves"), movesState != null && movesState.optBoolean("isComplete"));
        moves.setOnClickListener(v -> {
            if (!hasStageControl() && (boxState == null || !boxState.optBoolean("isComplete") || relabelState == null || !relabelState.optBoolean("isComplete"))) {
                showStageCodeScreen(request, "moves", tr("stage.movesLocked"), false);
                return;
            }
            loadMovesStage(request);
        });
        root.addView(moves);

        addBackButton(root, tr("pick.backToRequests"), () -> showPickRequests());
        setContentView(wrap(root));
    }

    private void showBoxlessPickRequestActions(PickRequest request, JSONObject packingState) {
        setBackAction(() -> showPickRequests());
        LinearLayout root = page();
        root.setPadding(dp(14), dp(16), dp(14), dp(14));
        addHeader(root);
        addTitle(root, tr("pick.request") + " " + request.shortNumber());
        root.addView(note(tr("common.client") + ": " + request.clientName));
        root.addView(note(tr("common.city") + ": " + firstNonEmpty(request.city, "-")));
        root.addView(note(tr("common.status") + ": " + request.status + " · " + tr("common.rows") + ": " + request.itemsCount));
        root.addView(note(tr("boxless.mode")));
        if (request.hasActiveWorkers()) {
            TextView working = note(tr("pick.inWork") + ": " + request.activeWorkersText);
            working.setTextColor(Color.rgb(120, 72, 0));
            root.addView(working);
        }

        boolean complete = packingState != null && packingState.optBoolean("isComplete");
        String progress = packingState == null
            ? ""
            : "\n" + packingState.optInt("packed") + " / " + packingState.optInt("total");
        Button packing = stageButton(tr("boxless.title") + progress, complete);
        packing.setOnClickListener(v -> loadBoxlessPacking(request));
        root.addView(packing);

        addBackButton(root, tr("pick.backToRequests"), () -> showPickRequests());
        setContentView(wrap(root));
    }

    private void loadBoxlessPacking(PickRequest request) {
        runAsync(() -> {
            JSONObject state = api.boxlessPackingState(token, request.id, deviceCode);
            main.post(() -> showBoxlessPacking(request, state, FLASH_NONE, ""));
        });
    }

    private void showBoxlessPacking(PickRequest request, JSONObject state, int flashColor, String warning) {
        setBackAction(() -> showPickRequestActions(request));
        LinearLayout root = page();
        if (flashColor != FLASH_NONE) {
            root.setBackgroundColor(flashColor);
        }
        root.setPadding(dp(14), dp(16), dp(14), dp(14));
        addHeader(root);
        addTitle(root, tr("boxless.title"));
        root.addView(note(tr("pick.request") + ": " + request.shortNumber()));
        root.addView(note(tr("common.client") + ": " + request.clientName + " · " + tr("common.city").toLowerCase(Locale.ROOT) + ": " + firstNonEmpty(request.city, "-")));
        if (warning != null && !warning.trim().isEmpty()) {
            TextView error = note(warning);
            error.setTextColor(flashColor == RED ? Color.WHITE : Color.rgb(62, 54, 54));
            error.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
            error.setTextSize(scaledText(20));
            root.addView(error);
        }

        int packed = state.optInt("packed");
        int total = state.optInt("total");
        int remaining = state.optInt("remaining");
        String currentBox = state.optString("currentBox");
        root.addView(note(tr("boxless.progress") + ": " + packed + " / " + total + ". " + tr("boxSearch.progressRemaining") + ": " + remaining));

        if (currentBox == null || currentBox.trim().isEmpty()) {
            EditText boxScan = input(tr("boxless.scanBox"), false);
            boxScan.setSingleLine(true);
            boxScan.setImeOptions(EditorInfo.IME_ACTION_DONE);
            boxScan.setOnEditorActionListener((v, actionId, event) -> {
                String scanned = text(boxScan);
                boxScan.setText("");
                openBoxlessBox(request, scanned);
                return true;
            });
            root.addView(boxScan);

            if (remaining == 0 && total > 0) {
                Button finish = primary(tr("boxless.finish"));
                finish.setOnClickListener(v -> finishBoxlessPacking(request));
                root.addView(finish);
            }
            addBoxlessPackages(root, state.optJSONArray("packages"));
            addBoxlessRows(root, state.optJSONArray("rows"), true);
            Button refresh = secondary(tr("common.refresh"));
            refresh.setOnClickListener(v -> loadBoxlessPacking(request));
            root.addView(refresh);
            addBackButton(root, tr("pick.backToRequests"), () -> showPickRequestActions(request));
            setContentView(wrap(root));
            if (flashColor != FLASH_NONE) {
                main.postDelayed(() -> root.setBackgroundColor(BG), 550);
            }
            boxScan.requestFocus();
            return;
        }

        TextView current = note(tr("boxless.currentBox") + ": " + currentBox + "\n" + tr("boxless.currentQuantity") + ": " + state.optInt("currentBoxQuantity"));
        current.setTextSize(scaledText(20));
        current.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        current.setBackgroundColor(Color.WHITE);
        current.setPadding(dp(12), dp(12), dp(12), dp(12));
        root.addView(current);

        EditText itemScan = input(tr("boxless.scanItem"), false);
        itemScan.setSingleLine(true);
        itemScan.setImeOptions(EditorInfo.IME_ACTION_DONE);
        itemScan.setOnEditorActionListener((v, actionId, event) -> {
            String scanned = text(itemScan);
            itemScan.setText("");
            scanBoxlessItem(request, scanned);
            return true;
        });
        root.addView(itemScan);

        Button close = primary(tr("boxless.closeBox"));
        close.setOnClickListener(v -> closeBoxlessBox(request));
        root.addView(close);
        addBoxlessRows(root, state.optJSONArray("rows"), true);
        addBackButton(root, tr("pick.backToRequests"), () -> showPickRequestActions(request));
        setContentView(wrap(root));
        if (flashColor != FLASH_NONE) {
            main.postDelayed(() -> root.setBackgroundColor(BG), 550);
        }
        itemScan.requestFocus();
    }

    private void openBoxlessBox(PickRequest request, String boxCode) {
        if (boxCode.trim().isEmpty()) {
            toast(tr("boxless.scanBoxToast"));
            return;
        }
        runAsync(() -> {
            try {
                JSONObject state = api.openBoxlessPackingBox(token, request.id, boxCode, deviceCode);
                main.post(() -> showBoxlessPacking(request, state, GREEN, tr("boxless.boxOpened")));
            } catch (Exception error) {
                JSONObject state = api.boxlessPackingState(token, request.id, deviceCode);
                main.post(() -> showBoxlessPacking(request, state, RED, error.getMessage()));
            }
        });
    }

    private void scanBoxlessItem(PickRequest request, String barcode) {
        if (barcode.trim().isEmpty()) {
            toast(tr("boxless.scanItemToast"));
            return;
        }
        runAsync(() -> {
            try {
                JSONObject state = api.scanBoxlessPackingItem(token, request.id, barcode, deviceCode);
                main.post(() -> showBoxlessPacking(request, state, GREEN, tr("boxless.itemAdded")));
            } catch (Exception error) {
                JSONObject state = api.boxlessPackingState(token, request.id, deviceCode);
                main.post(() -> showBoxlessPacking(request, state, RED, error.getMessage()));
            }
        });
    }

    private void closeBoxlessBox(PickRequest request) {
        runAsync(() -> {
            try {
                JSONObject state = api.closeBoxlessPackingBox(token, request.id, deviceCode);
                main.post(() -> showBoxlessPacking(request, state, GREEN, tr("boxless.boxClosed")));
            } catch (Exception error) {
                JSONObject state = api.boxlessPackingState(token, request.id, deviceCode);
                main.post(() -> showBoxlessPacking(request, state, RED, error.getMessage()));
            }
        });
    }

    private void finishBoxlessPacking(PickRequest request) {
        runAsync(() -> {
            try {
                JSONObject state = api.finishBoxlessPacking(token, request.id, deviceCode);
                main.post(() -> showBoxlessPacking(request, state, GREEN, tr("boxless.complete")));
            } catch (Exception error) {
                JSONObject state = api.boxlessPackingState(token, request.id, deviceCode);
                main.post(() -> showBoxlessPacking(request, state, RED, error.getMessage()));
            }
        });
    }

    private void addBoxlessPackages(LinearLayout root, JSONArray packages) {
        if (packages == null || packages.length() == 0) {
            return;
        }
        root.addView(note(tr("boxless.closedBoxes")));
        for (int i = 0; i < packages.length(); i++) {
            JSONObject item = packages.optJSONObject(i);
            if (item == null) {
                continue;
            }
            TextView row = note("✓ " + item.optString("packageCode") + " · " + item.optInt("quantity") + " " + tr("common.units"));
            row.setTextSize(scaledText(18));
            row.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
            row.setTextColor(Color.WHITE);
            row.setBackgroundColor(GREEN);
            row.setPadding(dp(12), dp(10), dp(12), dp(10));
            root.addView(row, matchWrap());
        }
    }

    private void addBoxlessRows(LinearLayout root, JSONArray rows, boolean onlyRemaining) {
        if (rows == null || rows.length() == 0) {
            return;
        }
        root.addView(note(tr("boxless.goods")));
        for (int i = 0; i < rows.length(); i++) {
            JSONObject row = rows.optJSONObject(i);
            if (row == null) {
                continue;
            }
            int remaining = row.optInt("remaining");
            if (onlyRemaining && remaining <= 0) {
                continue;
            }
            TextView view = note(
                firstNonEmpty(row.optString("name"), row.optString("barcode"))
                    + "\n" + row.optString("barcode")
                    + "\n" + tr("boxless.packed") + ": " + row.optInt("packed") + " / " + row.optInt("requested")
            );
            view.setTextSize(scaledText(17));
            view.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
            view.setBackgroundColor(remaining <= 0 ? Color.rgb(221, 245, 232) : Color.WHITE);
            view.setPadding(dp(12), dp(10), dp(12), dp(10));
            root.addView(view, matchWrap());
        }
    }

    private void loadBoxSearch(PickRequest request) {
        runAsync(() -> {
            JSONObject state = api.boxSearch(token, request.id, deviceCode);
            main.post(() -> showBoxSearch(request, state));
        });
    }

    private void loadRequestStage(PickRequest request, String stage) {
        loadRequestStage(request, stage, "");
    }

    private void loadRequestStage(PickRequest request, String stage, String managerCode) {
        io.execute(() -> {
            try {
                JSONObject state = api.requestStage(token, request.id, deviceCode, stage, managerCode);
                main.post(() -> showRequestStage(request, state, stage));
            } catch (Exception error) {
                if (isStageLockedError(error)) {
                    main.post(() -> showStageCodeScreen(request, stage, stageLockMessage(error, stage), !managerCode.trim().isEmpty()));
                } else {
                    main.post(() -> toast(error.getMessage() == null ? tr("common.operationError") : error.getMessage()));
                }
            }
        });
    }

    private void loadRelabelState(PickRequest request) {
        loadRelabelState(request, "");
    }

    private void loadRelabelState(PickRequest request, String managerCode) {
        io.execute(() -> {
            try {
                JSONObject state = api.relabelState(token, request.id, deviceCode, managerCode);
                main.post(() -> showRelabelBoxes(request, state));
            } catch (Exception error) {
                if (isStageLockedError(error)) {
                    main.post(() -> showStageCodeScreen(request, "relabel", stageLockMessage(error, "relabel"), !managerCode.trim().isEmpty()));
                } else {
                    main.post(() -> toast(error.getMessage() == null ? tr("common.operationError") : error.getMessage()));
                }
            }
        });
    }

    private void loadMovesStage(PickRequest request) {
        loadMovesStage(request, "");
    }

    private void loadMovesStage(PickRequest request, String managerCode) {
        io.execute(() -> {
            try {
                JSONObject state = api.movesState(token, request.id, deviceCode, managerCode);
                main.post(() -> showMoveBoxes(request, state));
            } catch (Exception error) {
                if (isStageLockedError(error)) {
                    main.post(() -> showStageCodeScreen(request, "moves", stageLockMessage(error, "moves"), !managerCode.trim().isEmpty()));
                } else {
                    main.post(() -> toast(error.getMessage() == null ? tr("common.operationError") : error.getMessage()));
                }
            }
        });
    }

    private void showStageCodeScreen(PickRequest request, String stage, String message, boolean codeRejected) {
        setBackAction(() -> showPickRequestActions(request));
        LinearLayout root = page();
        root.setPadding(dp(14), dp(16), dp(14), dp(14));
        addHeader(root);
        addTitle(root, tr("stage.managerCodeTitle"));
        root.addView(note(stageTitle(stage)));

        LinearLayout panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setPadding(dp(14), dp(14), dp(14), dp(14));
        panel.setBackgroundColor(Color.rgb(235, 243, 255));
        panel.addView(note(message));
        if (codeRejected) {
            TextView error = note(tr("stage.managerCodeRejected"));
            error.setTextColor(RED);
            error.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
            panel.addView(error);
        }

        EditText code = input(tr("stage.managerCodeInput"), false);
        code.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_VARIATION_PASSWORD);
        code.setSingleLine(true);
        code.setImeOptions(EditorInfo.IME_ACTION_DONE);
        code.setOnEditorActionListener((v, actionId, event) -> {
            submitStageCode(request, stage, text(code));
            return true;
        });
        Button unlock = primary(tr("stage.managerCodeUnlock"));
        unlock.setOnClickListener(v -> submitStageCode(request, stage, text(code)));
        Button cancel = secondary(tr("stage.managerCodeCancel"));
        cancel.setOnClickListener(v -> showPickRequestActions(request));

        panel.addView(code);
        panel.addView(unlock);
        panel.addView(cancel);
        root.addView(panel, matchWrap());
        setContentView(wrap(root));
        code.requestFocus();
    }

    private void submitStageCode(PickRequest request, String stage, String code) {
        String normalized = code.trim();
        if (!normalized.matches("\\d{4}")) {
            showStageCodeScreen(request, stage, tr("stage.managerCodeHint"), true);
            return;
        }
        if ("moves".equals(stage)) {
            loadMovesStage(request, normalized);
            return;
        }
        loadRelabelState(request, normalized);
    }

    private void showRelabelBoxes(PickRequest request, JSONObject state) {
        setBackAction(() -> showPickRequestActions(request));
        LinearLayout root = page();
        root.setPadding(dp(14), dp(16), dp(14), dp(14));
        addHeader(root);
        addTitle(root, tr("stage.relabelTitle"));
        root.addView(note(tr("pick.request") + ": " + request.shortNumber()));
        root.addView(note(tr("common.client") + ": " + request.clientName));
        root.addView(note(tr("relabel.progress") + ": " + state.optInt("completed") + " / " + state.optInt("total")));

        JSONArray boxes = state.optJSONArray("boxes");
        if (state.optBoolean("isComplete")) {
            TextView done = note(tr("relabel.complete"));
            done.setTextColor(GREEN);
            root.addView(done);
            Button moves = primary("3. " + tr("pick.moves"));
            moves.setOnClickListener(v -> loadMovesStage(request));
            root.addView(moves);
        } else if (boxes == null || boxes.length() == 0) {
            root.addView(note(tr("relabel.empty")));
        } else {
            root.addView(note(tr("relabel.selectBox")));
            for (int i = 0; i < boxes.length(); i++) {
                JSONObject box = boxes.optJSONObject(i);
                if (box == null) {
                    continue;
                }
                String boxCode = box.optString("boxCode");
                Button button = secondary(boxCode + "\n" + tr("boxSearch.progressRemaining") + ": " + box.optInt("totalRemaining"));
                button.setGravity(Gravity.LEFT | Gravity.CENTER_VERTICAL);
                button.setOnClickListener(v -> showRelabelBox(request, state, boxCode));
                root.addView(button);
            }
        }

        Button refresh = secondary(tr("common.refresh"));
        refresh.setOnClickListener(v -> loadRelabelState(request));
        root.addView(refresh);
        addBackButton(root, tr("pick.backToRequests"), () -> showPickRequestActions(request));
        setContentView(wrap(root));
    }

    private void showRelabelBox(PickRequest request, JSONObject state, String boxCode) {
        showRelabelBox(request, state, boxCode, FLASH_NONE, "");
    }

    private void showRelabelBox(PickRequest request, JSONObject state, String boxCode, int flashColor, String warning) {
        resetRelabelBatchIfNeeded(request.id, boxCode);
        JSONObject box = findRelabelBox(state, boxCode);
        if (box == null) {
            showRelabelBoxes(request, state);
            return;
        }
        setBackAction(() -> showRelabelBoxes(request, state));
        LinearLayout root = page();
        if (flashColor != FLASH_NONE) {
            root.setBackgroundColor(flashColor);
        }
        root.setPadding(dp(14), dp(16), dp(14), dp(14));
        addHeader(root);
        addTitle(root, tr("common.box") + " " + boxCode);
        if (warning != null && !warning.trim().isEmpty()) {
            TextView error = note(warning);
            error.setTextColor(Color.WHITE);
            error.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
            error.setTextSize(scaledText(22));
            error.setPadding(dp(12), dp(10), dp(12), dp(10));
            root.addView(error);
        }
        root.addView(note(tr("stage.relabelHint")));
        root.addView(note(tr("relabel.queued") + ": " + relabelBatchQueue.size()));

        EditText scan = input(tr("relabel.scanSourceBatch"), false);
        scan.setSingleLine(true);
        scan.setImeOptions(EditorInfo.IME_ACTION_DONE);
        scan.setOnEditorActionListener((v, actionId, event) -> {
            String scanned = text(scan);
            scan.setText("");
            scanRelabelSource(request, boxCode, scanned);
            return true;
        });
        root.addView(scan);

        JSONArray rows = box.optJSONArray("rows");
        if (rows == null || rows.length() == 0) {
            root.addView(note(tr("relabel.boxDone")));
        } else {
            root.addView(note(tr("relabel.products")));
            for (int i = 0; i < rows.length(); i++) {
                JSONObject row = rows.optJSONObject(i);
                if (row == null) {
                    continue;
                }
                root.addView(relabelRowView(row, queuedRelabelCount(row.optString("id"))));
            }
        }

        if (!relabelBatchQueue.isEmpty()) {
            Button targets = primary(tr("relabel.scanTargets"));
            targets.setOnClickListener(v -> showRelabelTargetBatchScan(request, boxCode, state, FLASH_NONE, ""));
            root.addView(targets);
            Button clear = secondary(tr("relabel.clearQueue"));
            clear.setOnClickListener(v -> {
                clearRelabelBatch();
                showRelabelBox(request, state, boxCode);
            });
            root.addView(clear);
        }
        Button refresh = secondary(tr("common.refresh"));
        refresh.setOnClickListener(v -> loadRelabelState(request));
        root.addView(refresh);
        addBackButton(root, tr("stage.relabelTitle"), () -> showRelabelBoxes(request, state));
        setContentView(wrap(root));
        if (flashColor != FLASH_NONE) {
            main.postDelayed(() -> root.setBackgroundColor(BG), 700);
        }
        scan.requestFocus();
    }

    private TextView relabelRowView(JSONObject row) {
        return relabelRowView(row, 0);
    }

    private TextView relabelRowView(JSONObject row, int queued) {
        TextView view = note(
            tr("receipt.article") + ": " + firstNonEmpty(row.optString("article"), "-")
                + "\n" + tr("receipt.sizeColor") + ": " + firstNonEmpty(row.optString("size"), "-")
                + "\n" + tr("relabel.from") + ": " + row.optString("sourceBarcode")
                + "\n" + tr("relabel.to") + ": " + row.optString("targetBarcode")
                + "\n" + tr("boxSearch.progressRemaining") + ": " + row.optInt("remaining")
                + (queued > 0 ? "\n" + tr("relabel.queued") + ": " + queued : "")
        );
        view.setTextSize(scaledText(18));
        view.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        view.setPadding(dp(12), dp(12), dp(12), dp(12));
        view.setBackgroundColor(Color.WHITE);
        LinearLayout.LayoutParams params = matchWrap();
        params.setMargins(0, dp(4), 0, dp(4));
        view.setLayoutParams(params);
        return view;
    }

    private JSONObject findRelabelBox(JSONObject state, String boxCode) {
        JSONArray boxes = state.optJSONArray("boxes");
        if (boxes == null) {
            return null;
        }
        for (int i = 0; i < boxes.length(); i++) {
            JSONObject box = boxes.optJSONObject(i);
            if (box != null && boxCode.equals(box.optString("boxCode"))) {
                return box;
            }
        }
        return null;
    }

    private void resetRelabelBatchIfNeeded(String requestId, String boxCode) {
        if (requestId.equals(relabelBatchRequestId) && boxCode.equals(relabelBatchBoxCode)) {
            return;
        }
        relabelBatchRequestId = requestId;
        relabelBatchBoxCode = boxCode;
        clearRelabelBatch();
    }

    private void clearRelabelBatch() {
        relabelBatchQueue.clear();
        relabelBatchSourceConfirmed = false;
        relabelBatchTargetConfirmed = false;
    }

    private int queuedRelabelCount(String taskId) {
        int count = 0;
        for (JSONObject task : relabelBatchQueue) {
            if (taskId.equals(task.optString("id"))) {
                count += 1;
            }
        }
        return count;
    }

    private int remainingForRelabelTask(JSONObject state, String boxCode, String taskId) {
        JSONObject box = findRelabelBox(state, boxCode);
        JSONArray rows = box == null ? null : box.optJSONArray("rows");
        if (rows == null) {
            return 0;
        }
        for (int i = 0; i < rows.length(); i++) {
            JSONObject row = rows.optJSONObject(i);
            if (row != null && taskId.equals(row.optString("id"))) {
                return row.optInt("remaining", 0);
            }
        }
        return 0;
    }

    private void scanRelabelSource(PickRequest request, String boxCode, String barcode) {
        if (barcode.trim().isEmpty()) {
            toast(tr("receipt.scanBarcodeToast"));
            return;
        }
        io.execute(() -> {
            try {
                JSONObject state = api.scanRelabelSource(token, request.id, boxCode, barcode, deviceCode);
                JSONObject lastScan = state.optJSONObject("lastScan");
                JSONObject task = lastScan == null ? null : lastScan.optJSONObject("task");
                main.post(() -> {
                    if (task == null) {
                        toast(tr("relabel.wrongSource"));
                        showRelabelBox(request, state, boxCode, RED, tr("relabel.wrongSource"));
                        return;
                    }
                    if (queuedRelabelCount(task.optString("id")) >= remainingForRelabelTask(state, boxCode, task.optString("id"))) {
                        showRelabelBox(request, state, boxCode, RED, tr("relabel.batchFull"));
                        return;
                    }
                    if (!relabelBatchSourceConfirmed) {
                        confirmRelabelSource(request, boxCode, state, task);
                    } else {
                        enqueueRelabelSource(request, boxCode, state, task);
                    }
                });
            } catch (Exception error) {
                try {
                    JSONObject state = api.relabelState(token, request.id, deviceCode);
                    main.post(() -> {
                        toast(tr("relabel.wrongSource"));
                        showRelabelBox(request, state, boxCode, RED, tr("relabel.wrongSource"));
                    });
                } catch (Exception fallback) {
                    main.post(() -> toast(tr("relabel.wrongSource")));
                }
            }
        });
    }

    private void confirmRelabelSource(PickRequest request, String boxCode, JSONObject state, JSONObject task) {
        String message = tr("common.box") + ": " + boxCode
            + "\n" + tr("receipt.article") + ": " + firstNonEmpty(task.optString("article"), "-")
            + "\n" + tr("receipt.sizeColor") + ": " + firstNonEmpty(task.optString("size"), "-")
            + "\n" + tr("relabel.from") + ": " + task.optString("sourceBarcode")
            + "\n" + tr("relabel.to") + ": " + task.optString("targetBarcode");
        new AlertDialog.Builder(this)
            .setTitle(tr("relabel.confirmSource"))
            .setMessage(message)
            .setPositiveButton(tr("receipt.confirmYes"), (dialog, which) -> {
                relabelBatchSourceConfirmed = true;
                enqueueRelabelSource(request, boxCode, state, task);
            })
            .setNegativeButton(tr("receipt.confirmNo"), (dialog, which) -> showRelabelBox(request, state, boxCode))
            .show();
    }

    private void enqueueRelabelSource(PickRequest request, String boxCode, JSONObject state, JSONObject task) {
        if (relabelBatchQueue.isEmpty()) {
            relabelBatchTargetConfirmed = false;
        }
        relabelBatchQueue.add(task);
        showRelabelBox(request, state, boxCode, GREEN, tr("relabel.batchSourceAdded"));
    }

    private void showRelabelTargetScan(PickRequest request, String boxCode, JSONObject task) {
        setBackAction(() -> loadRelabelState(request));
        LinearLayout root = page();
        root.setPadding(dp(14), dp(16), dp(14), dp(14));
        addHeader(root);
        addTitle(root, tr("relabel.scanTargetTitle"));
        root.addView(note(tr("common.box") + ": " + boxCode));
        root.addView(note(tr("relabel.from") + ": " + task.optString("sourceBarcode")));
        root.addView(note(tr("relabel.to") + ": " + task.optString("targetBarcode")));

        EditText scan = input(tr("relabel.scanTarget"), false);
        scan.setSingleLine(true);
        scan.setImeOptions(EditorInfo.IME_ACTION_DONE);
        scan.setOnEditorActionListener((v, actionId, event) -> {
            scanRelabelTarget(request, boxCode, task, text(scan));
            return true;
        });
        root.addView(scan);
        addBackButton(root, tr("common.back"), () -> loadRelabelState(request));
        setContentView(wrap(root));
        scan.requestFocus();
    }

    private void scanRelabelTarget(PickRequest request, String boxCode, JSONObject task, String targetBarcode) {
        if (targetBarcode.trim().isEmpty()) {
            toast(tr("relabel.scanTargetToast"));
            return;
        }
        runAsync(() -> {
            JSONObject state = api.scanRelabelTarget(token, request.id, task.optString("id"), targetBarcode, deviceCode);
            main.post(() -> {
                toast(tr("relabel.itemDone"));
                if (state.optBoolean("isComplete")) {
                    showRelabelBoxes(request, state);
                    return;
                }
                if (findRelabelBox(state, boxCode) == null) {
                    showRelabelBoxes(request, state);
                } else {
                    showRelabelBox(request, state, boxCode);
                }
            });
        });
    }

    private void showRelabelTargetBatchScan(PickRequest request, String boxCode, JSONObject state, int flashColor, String warning) {
        if (relabelBatchQueue.isEmpty()) {
            showRelabelBox(request, state, boxCode);
            return;
        }
        JSONObject task = relabelBatchQueue.get(0);
        setBackAction(() -> showRelabelBox(request, state, boxCode));
        LinearLayout root = page();
        if (flashColor != FLASH_NONE) {
            root.setBackgroundColor(flashColor);
        }
        root.setPadding(dp(14), dp(16), dp(14), dp(14));
        addHeader(root);
        addTitle(root, tr("relabel.scanTargetTitle"));
        if (warning != null && !warning.trim().isEmpty()) {
            TextView error = note(warning);
            error.setTextColor(Color.WHITE);
            error.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
            error.setTextSize(scaledText(22));
            error.setPadding(dp(12), dp(10), dp(12), dp(10));
            root.addView(error);
        }
        root.addView(note(tr("common.box") + ": " + boxCode));
        root.addView(note(tr("relabel.queued") + ": " + relabelBatchQueue.size()));
        root.addView(note(tr("relabel.from") + ": " + task.optString("sourceBarcode")));
        root.addView(note(tr("relabel.to") + ": " + task.optString("targetBarcode")));

        EditText scan = input(tr("relabel.scanTargetBatch"), false);
        scan.setSingleLine(true);
        scan.setImeOptions(EditorInfo.IME_ACTION_DONE);
        scan.setOnEditorActionListener((v, actionId, event) -> {
            String scanned = text(scan);
            scan.setText("");
            scanRelabelBatchTarget(request, boxCode, state, scanned);
            return true;
        });
        root.addView(scan);
        Button backToOld = secondary(tr("relabel.backToSources"));
        backToOld.setOnClickListener(v -> showRelabelBox(request, state, boxCode));
        root.addView(backToOld);
        addBackButton(root, tr("common.back"), () -> showRelabelBox(request, state, boxCode));
        setContentView(wrap(root));
        if (flashColor != FLASH_NONE) {
            main.postDelayed(() -> root.setBackgroundColor(BG), 700);
        }
        scan.requestFocus();
    }

    private void scanRelabelBatchTarget(PickRequest request, String boxCode, JSONObject state, String targetBarcode) {
        if (targetBarcode.trim().isEmpty()) {
            toast(tr("relabel.scanTargetToast"));
            return;
        }
        if (relabelBatchQueue.isEmpty()) {
            showRelabelBox(request, state, boxCode);
            return;
        }
        JSONObject task = relabelBatchQueue.get(0);
        if (!sameScan(task.optString("targetBarcode"), targetBarcode)) {
            showRelabelTargetBatchScan(request, boxCode, state, RED, tr("relabel.wrongTarget"));
            return;
        }
        if (!relabelBatchTargetConfirmed) {
            confirmRelabelTarget(request, boxCode, state, task, targetBarcode);
            return;
        }
        commitRelabelBatchTarget(request, boxCode, state, task, targetBarcode);
    }

    private void confirmRelabelTarget(PickRequest request, String boxCode, JSONObject state, JSONObject task, String targetBarcode) {
        String message = tr("common.box") + ": " + boxCode
            + "\n" + tr("receipt.article") + ": " + firstNonEmpty(task.optString("article"), "-")
            + "\n" + tr("receipt.sizeColor") + ": " + firstNonEmpty(task.optString("size"), "-")
            + "\n" + tr("relabel.from") + ": " + task.optString("sourceBarcode")
            + "\n" + tr("relabel.to") + ": " + targetBarcode;
        new AlertDialog.Builder(this)
            .setTitle(tr("relabel.confirmTarget"))
            .setMessage(message)
            .setPositiveButton(tr("receipt.confirmYes"), (dialog, which) -> {
                relabelBatchTargetConfirmed = true;
                commitRelabelBatchTarget(request, boxCode, state, task, targetBarcode);
            })
            .setNegativeButton(tr("receipt.confirmNo"), (dialog, which) -> showRelabelTargetBatchScan(request, boxCode, state, FLASH_NONE, ""))
            .show();
    }

    private void commitRelabelBatchTarget(PickRequest request, String boxCode, JSONObject previousState, JSONObject task, String targetBarcode) {
        runAsync(() -> {
            JSONObject state = api.scanRelabelTarget(token, request.id, task.optString("id"), targetBarcode, deviceCode);
            main.post(() -> {
                if (!relabelBatchQueue.isEmpty()) {
                    relabelBatchQueue.remove(0);
                }
                toast(tr("relabel.itemDone"));
                if (state.optBoolean("isComplete")) {
                    clearRelabelBatch();
                    showRelabelBoxes(request, state);
                    return;
                }
                if (relabelBatchQueue.isEmpty()) {
                    relabelBatchSourceConfirmed = false;
                    relabelBatchTargetConfirmed = false;
                    if (findRelabelBox(state, boxCode) == null) {
                        showRelabelBoxes(request, state);
                    } else {
                        showRelabelBox(request, state, boxCode);
                    }
                    return;
                }
                showRelabelTargetBatchScan(request, boxCode, state, GREEN, tr("relabel.itemDone"));
            });
        });
    }

    private void showMoveBoxes(PickRequest request, JSONObject state) {
        setBackAction(() -> showPickRequestActions(request));
        LinearLayout root = page();
        root.setPadding(dp(14), dp(16), dp(14), dp(14));
        addHeader(root);
        addTitle(root, tr("moves.title"));
        root.addView(note(tr("pick.request") + ": " + request.shortNumber()));
        root.addView(note(tr("common.client") + ": " + request.clientName));
        root.addView(note(tr("moves.progress") + ": " + state.optInt("completed") + " / " + state.optInt("total")));
        String targetBox = state.optString("currentTargetBox", "");
        root.addView(note(tr("moves.currentTarget") + ": " + (targetBox.isEmpty() ? "-" : targetBox)));

        if (state.optBoolean("isComplete")) {
            TextView done = note(tr("moves.complete"));
            done.setTextColor(GREEN);
            root.addView(done);
        } else {
            JSONArray boxes = state.optJSONArray("boxes");
            if (boxes == null || boxes.length() == 0) {
                root.addView(note(tr("moves.empty")));
            } else {
                root.addView(note(tr("moves.selectBox")));
                for (int i = 0; i < boxes.length(); i++) {
                    JSONObject box = boxes.optJSONObject(i);
                    if (box == null) {
                        continue;
                    }
                    String sourceBox = box.optString("boxCode");
                    Button button = secondary(sourceBox + "\n" + tr("boxSearch.progressRemaining") + ": " + box.optInt("totalRemaining"));
                    button.setGravity(Gravity.LEFT | Gravity.CENTER_VERTICAL);
                    button.setOnClickListener(v -> showMoveBox(request, state, sourceBox, FLASH_NONE, ""));
                    root.addView(button);
                }
            }
        }

        Button finish = primary(tr("moves.finish"));
        finish.setOnClickListener(v -> finishMoves(request));
        root.addView(finish);
        Button refresh = secondary(tr("common.refresh"));
        refresh.setOnClickListener(v -> loadMovesStage(request));
        root.addView(refresh);
        addBackButton(root, tr("pick.backToRequests"), () -> showPickRequestActions(request));
        setContentView(wrap(root));
    }

    private void showMoveBox(PickRequest request, JSONObject state, String sourceBox, int flashColor, String warning) {
        JSONObject box = findMoveBox(state, sourceBox);
        if (box == null) {
            showMoveBoxes(request, state);
            return;
        }
        setBackAction(() -> showMoveBoxes(request, state));
        LinearLayout root = page();
        if (flashColor != FLASH_NONE) {
            root.setBackgroundColor(flashColor);
        }
        root.setPadding(dp(14), dp(16), dp(14), dp(14));
        addHeader(root);
        addTitle(root, tr("common.box") + " " + sourceBox);
        if (warning != null && !warning.trim().isEmpty()) {
            TextView error = note(warning);
            error.setTextColor(Color.WHITE);
            root.addView(error);
        }
        String targetBox = state.optString("currentTargetBox", "");
        root.addView(note(tr("moves.currentTarget") + ": " + (targetBox.isEmpty() ? "-" : targetBox)));

        EditText target = input(tr("moves.scanTargetBox"), false);
        target.setSingleLine(true);
        target.setImeOptions(EditorInfo.IME_ACTION_DONE);
        target.setOnEditorActionListener((v, actionId, event) -> {
            scanMoveTargetBox(request, sourceBox, text(target));
            target.setText("");
            return true;
        });
        Button setTarget = secondary(tr("moves.setTargetBox"));
        setTarget.setOnClickListener(v -> {
            scanMoveTargetBox(request, sourceBox, text(target));
            target.setText("");
        });
        root.addView(target);
        root.addView(setTarget);

        EditText scan = input(tr("moves.scanItem"), false);
        scan.setSingleLine(true);
        scan.setImeOptions(EditorInfo.IME_ACTION_DONE);
        scan.setOnEditorActionListener((v, actionId, event) -> {
            scanMoveItem(request, sourceBox, state.optString("currentTargetBox", ""), text(scan));
            scan.setText("");
            return true;
        });
        root.addView(scan);

        JSONArray rows = box.optJSONArray("rows");
        if (rows != null) {
            root.addView(note(tr("moves.products")));
            for (int i = 0; i < rows.length(); i++) {
                JSONObject row = rows.optJSONObject(i);
                if (row == null) {
                    continue;
                }
                root.addView(note(row.optString("article")
                    + "\n" + tr("relabel.from") + ": " + row.optString("barcode")
                    + "\n" + tr("boxSearch.progressRemaining") + ": " + row.optInt("remaining")
                    + "\n" + tr("common.size") + ": " + firstNonEmpty(row.optString("size"), "-")));
            }
        }

        Button next = secondary(tr("moves.nextBox"));
        next.setOnClickListener(v -> showMoveBoxes(request, state));
        root.addView(next);
        Button finish = primary(tr("moves.finish"));
        finish.setOnClickListener(v -> finishMoves(request));
        root.addView(finish);
        addBackButton(root, tr("moves.title"), () -> showMoveBoxes(request, state));
        setContentView(wrap(root));
        scan.requestFocus();
    }

    private JSONObject findMoveBox(JSONObject state, String sourceBox) {
        JSONArray boxes = state.optJSONArray("boxes");
        if (boxes == null) {
            return null;
        }
        for (int i = 0; i < boxes.length(); i++) {
            JSONObject box = boxes.optJSONObject(i);
            if (box != null && sourceBox.equals(box.optString("boxCode"))) {
                return box;
            }
        }
        return null;
    }

    private void scanMoveTargetBox(PickRequest request, String sourceBox, String targetBoxCode) {
        if (targetBoxCode.trim().isEmpty()) {
            toast(tr("moves.scanTargetToast"));
            return;
        }
        runAsync(() -> {
            JSONObject state = api.openMoveTargetBox(token, request.id, targetBoxCode, deviceCode);
            main.post(() -> showMoveBox(request, state, sourceBox, GREEN, tr("moves.targetOpened")));
        });
    }

    private void scanMoveItem(PickRequest request, String sourceBox, String targetBoxCode, String barcode) {
        if (barcode.trim().isEmpty()) {
            toast(tr("moves.scanItemToast"));
            return;
        }
        runAsync(() -> {
            try {
                JSONObject state = api.scanMoveItem(token, request.id, sourceBox, barcode, targetBoxCode, deviceCode);
                main.post(() -> {
                    if (findMoveBox(state, sourceBox) == null) {
                        showMoveBoxes(request, state);
                    } else {
                        showMoveBox(request, state, sourceBox, GREEN, tr("moves.itemMoved"));
                    }
                });
            } catch (Exception error) {
                JSONObject state = api.movesState(token, request.id, deviceCode);
                main.post(() -> showMoveBox(request, state, sourceBox, RED, error.getMessage()));
            }
        });
    }

    private void finishMoves(PickRequest request) {
        runAsync(() -> {
            JSONObject state = api.finishMoves(token, request.id, deviceCode);
            main.post(() -> showMoveBoxes(request, state));
        });
    }

    private void showRequestStage(PickRequest request, JSONObject state, String stage) {
        setBackAction(() -> showPickRequestActions(request));
        LinearLayout root = page();
        root.setPadding(dp(14), dp(16), dp(14), dp(14));
        addHeader(root);
        addTitle(root, stageTitle(stage));
        root.addView(note(tr("pick.request") + ": " + request.shortNumber()));
        root.addView(note(tr("common.client") + ": " + request.clientName + " · " + tr("common.city").toLowerCase(Locale.ROOT) + ": " + firstNonEmpty(request.city, "-")));

        int found = state.optInt("found");
        int total = state.optInt("total");
        int remaining = state.optInt("remaining");
        root.addView(note(tr("boxSearch.progressFound") + " " + found + " " + tr("boxSearch.progressOf") + " " + total + ". " + tr("boxSearch.progressRemaining") + ": " + remaining));

        if (hasStageControl() && remaining > 0) {
            TextView bypass = note(tr("stage.supervisorBypass"));
            bypass.setTextColor(Color.rgb(120, 72, 0));
            bypass.setBackgroundColor(Color.rgb(255, 231, 153));
            bypass.setPadding(dp(12), dp(10), dp(12), dp(10));
            root.addView(bypass);
        }

        root.addView(note(stageHint(stage)));
        JSONArray boxes = state.optJSONArray("boxes");
        int added = addFoundStageBoxes(root, boxes);
        if (added == 0) {
            root.addView(note(tr("stage.noFoundBoxes")));
        }

        Button refresh = secondary(tr("common.refresh"));
        refresh.setOnClickListener(v -> loadRequestStage(request, stage));
        root.addView(refresh);

        addBackButton(root, tr("pick.backToRequests"), () -> showPickRequestActions(request));
        setContentView(wrap(root));
    }

    private int addFoundStageBoxes(LinearLayout root, JSONArray boxes) {
        if (boxes == null || boxes.length() == 0) {
            return 0;
        }
        root.addView(note(tr("stage.foundBoxes")));
        int added = 0;
        for (int i = 0; i < boxes.length(); i++) {
            JSONObject box = boxes.optJSONObject(i);
            if (box == null || !box.optBoolean("found")) {
                continue;
            }
            TextView row = note("✓ " + box.optString("code"));
            row.setTextSize(scaledText(20));
            row.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
            row.setTextColor(Color.WHITE);
            row.setBackgroundColor(GREEN);
            row.setPadding(dp(12), dp(12), dp(12), dp(12));
            LinearLayout.LayoutParams params = matchWrap();
            params.setMargins(0, dp(4), 0, dp(4));
            row.setLayoutParams(params);
            root.addView(row);
            added++;
        }
        return added;
    }

    private String stageTitle(String stage) {
        if ("moves".equals(stage)) {
            return tr("stage.movesTitle");
        }
        return tr("stage.relabelTitle");
    }

    private String stageHint(String stage) {
        if ("moves".equals(stage)) {
            return tr("stage.movesHint");
        }
        return tr("stage.relabelHint");
    }

    private void scanBoxForRequest(PickRequest request, String boxCode) {
        String normalized = boxCode.trim();
        if (normalized.isEmpty()) {
            toast(tr("boxSearch.scanBoxToast"));
            return;
        }
        long now = System.currentTimeMillis();
        if (normalized.equalsIgnoreCase(lastBoxSearchScanCode) && now - lastBoxSearchScanAtMs < 1500) {
            return;
        }
        if (boxSearchScanBusy) {
            return;
        }
        boxSearchScanBusy = true;
        lastBoxSearchScanCode = normalized;
        lastBoxSearchScanAtMs = now;

        runAsync(() -> {
            try {
                JSONObject state = api.scanBoxSearch(token, request.id, normalized, deviceCode);
                JSONObject lastScan = state.optJSONObject("lastScan");
                main.post(() -> {
                    boolean foundNow = lastScan != null && lastScan.optBoolean("matched");
                    int flashColor = RED;
                    if (lastScan != null && lastScan.optBoolean("alreadyFound")) {
                        flashColor = BLUE;
                        toast(tr("boxSearch.alreadyFound"));
                    } else if (foundNow) {
                        flashColor = GREEN;
                        toast(tr("boxSearch.found"));
                    } else {
                        toast(tr("boxSearch.notNeeded"));
                    }
                    showBoxSearch(request, state, flashColor);
                });
            } finally {
                main.post(() -> boxSearchScanBusy = false);
            }
        });
    }

    private void showBoxSearch(PickRequest request, JSONObject state) {
        showBoxSearch(request, state, FLASH_NONE);
    }

    private void showBoxSearch(PickRequest request, JSONObject state, int flashColor) {
        setBackAction(() -> leaveBoxSearch(request, state));
        LinearLayout root = page();
        if (flashColor != FLASH_NONE) {
            root.setBackgroundColor(flashColor);
        }
        root.setPadding(dp(14), dp(16), dp(14), dp(14));
        addHeader(root);
        addTitle(root, tr("boxSearch.title"));
        root.addView(note(tr("pick.request") + ": " + request.shortNumber()));
        root.addView(note(tr("common.client") + ": " + request.clientName + " · " + tr("common.city").toLowerCase(Locale.ROOT) + ": " + firstNonEmpty(request.city, "-")));

        int found = state.optInt("found");
        int total = state.optInt("total");
        int remaining = state.optInt("remaining");
        boolean complete = state.optBoolean("isComplete");
        root.addView(note(tr("boxSearch.progressFound") + " " + found + " " + tr("boxSearch.progressOf") + " " + total + ". " + tr("boxSearch.progressRemaining") + ": " + remaining));
        if (complete) {
            TextView done = note(tr("boxSearch.complete"));
            done.setTextColor(GREEN);
            root.addView(done);
        }

        EditText scan = input(tr("boxSearch.scanInput"), false);
        scan.setSingleLine(true);
        scan.setImeOptions(EditorInfo.IME_ACTION_DONE);
        scan.setOnEditorActionListener((v, actionId, event) -> {
            scanBoxForRequest(request, text(scan));
            return true;
        });
        attachAutoScan(scan, request);
        root.addView(scan);

        JSONArray boxes = state.optJSONArray("boxes");
        if (boxes == null || boxes.length() == 0) {
            root.addView(note(tr("boxSearch.empty")));
        } else {
            root.addView(note(tr("boxSearch.listTitle")));
            addBoxSearchRows(root, boxes, true);
            addBoxSearchRows(root, boxes, false);
        }

        Button refresh = secondary(tr("common.refresh"));
        refresh.setOnClickListener(v -> loadBoxSearch(request));
        root.addView(refresh);

        addBackButton(root, tr("boxSearch.collapse"), () -> leaveBoxSearch(request, state));
        setContentView(wrap(root));
        if (flashColor != FLASH_NONE) {
            main.postDelayed(() -> root.setBackgroundColor(BG), 450);
        }
        scan.requestFocus();
    }

    private void addBoxSearchRows(LinearLayout root, JSONArray boxes, boolean foundRows) {
        for (int i = 0; i < boxes.length(); i++) {
            JSONObject box = boxes.optJSONObject(i);
            if (box == null || box.optBoolean("found") != foundRows) {
                continue;
            }
            TextView row = note(box.optString("code"));
            row.setTextSize(scaledText(20));
            row.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
            row.setPadding(dp(12), dp(12), dp(12), dp(12));
            LinearLayout.LayoutParams params = matchWrap();
            params.setMargins(0, dp(4), 0, dp(4));
            row.setLayoutParams(params);
            if (foundRows) {
                row.setText("✓ " + box.optString("code"));
                row.setTextColor(Color.WHITE);
                row.setBackgroundColor(GREEN);
            } else {
                row.setTextColor(Color.rgb(45, 38, 38));
                row.setBackgroundColor(Color.WHITE);
            }
            root.addView(row);
        }
    }

    private void attachAutoScan(EditText scan, PickRequest request) {
        final Runnable[] pending = new Runnable[1];
        scan.addTextChangedListener(new TextWatcher() {
            @Override
            public void beforeTextChanged(CharSequence s, int start, int count, int after) {
            }

            @Override
            public void onTextChanged(CharSequence s, int start, int before, int count) {
            }

            @Override
            public void afterTextChanged(Editable editable) {
                if (pending[0] != null) {
                    main.removeCallbacks(pending[0]);
                }
                String value = editable.toString().trim();
                if (value.isEmpty()) {
                    return;
                }
                pending[0] = () -> scanBoxForRequest(request, value);
                main.postDelayed(pending[0], 300);
            }
        });
    }

    private void leaveBoxSearch(PickRequest request, JSONObject state) {
        int remaining = state.optInt("remaining");
        if (remaining <= 0) {
            showPickRequestActions(request);
            return;
        }

        new AlertDialog.Builder(this)
            .setTitle(tr("boxSearch.notAllFoundTitle"))
            .setMessage(tr("boxSearch.remainingToFind") + ": " + remaining + "\n\n" + missingBoxesText(state))
            .setPositiveButton(tr("boxSearch.collapseShort"), (dialog, which) -> showPickRequestActions(request))
            .setNegativeButton(tr("boxSearch.stay"), null)
            .show();
    }

    private String missingBoxesText(JSONObject state) {
        JSONArray missing = state.optJSONArray("missingBoxes");
        if (missing == null || missing.length() == 0) {
            return tr("boxSearch.noMissing");
        }
        StringBuilder builder = new StringBuilder();
        for (int i = 0; i < missing.length(); i++) {
            if (i > 0) {
                builder.append('\n');
            }
            builder.append("• ").append(missing.optString(i));
            if (i >= 29 && missing.length() > 30) {
                builder.append('\n').append(tr("boxSearch.andMore")).append(" ").append(missing.length() - 30);
                break;
            }
        }
        return builder.toString();
    }

    private void showInventoryMenu() {
        setBackAction(() -> showMenu());
        LinearLayout root = page();
        root.setPadding(dp(14), dp(16), dp(14), dp(14));
        addHeader(root);
        addTitle(root, tr("menu.inventory"));
        root.addView(note(tr("inventory.placeholder")));
        addBackButton(root, tr("common.back"), () -> showMenu());
        setContentView(wrap(root));
    }

    private void showBoxScan() {
        setBackAction(() -> showReceiptStart());
        boxCode = "";
        pendingBarcode = "";
        pendingReceiptSku = null;
        lastConfirmedBarcode = "";
        lastReceiptSku = null;
        boxRecheckBarcodes.clear();
        LinearLayout root = receiptPage(tr("receipt.newBox"));
        EditText box = input(tr("receipt.scanBox"), false);
        box.setSingleLine(true);
        box.setImeOptions(EditorInfo.IME_ACTION_DONE);
        box.setOnEditorActionListener((v, actionId, event) -> {
            openBox(text(box));
            return true;
        });
        Button open = primary(tr("receipt.openBox"));
        open.setOnClickListener(v -> openBox(text(box)));
        root.addView(box);
        root.addView(open);
        if (receiptBoxes.size() > 0 || queue.size() > 0 || !receiptKiz.isEmpty()) {
            Button finish = secondary(tr("receipt.finish"));
            finish.setOnClickListener(v -> finishReceipt());
            root.addView(finish);
        }
        addBackButton(root, tr("common.back"), () -> showReceiptStart());
        setContentView(wrap(root));
        box.requestFocus();
    }

    private void openBox(String value) {
        String normalized = value.trim();
        if (normalized.isEmpty()) {
            toast(tr("boxSearch.scanBoxToast"));
            return;
        }
        boxCode = normalized;
        currentBoxLines.clear();
        boxRecheckBarcodes.clear();
        toast(tr("common.box") + " " + boxCode + " " + tr("receipt.opened"));
        showBarcodeScan();
    }

    private void showBarcodeScan() {
        setBackAction(() -> showReceiptStart());
        LinearLayout root = receiptPage(tr("receipt.scanProduct"));
        TextView box = note(tr("common.box") + ": " + boxCode);
        root.addView(box);
        root.addView(note(tr("receipt.currentBoxCount") + ": " + currentBoxLines.size()));
        EditText barcode = input(tr("receipt.productBarcode"), false);
        barcode.setSingleLine(true);
        barcode.setImeOptions(EditorInfo.IME_ACTION_DONE);
        barcode.setOnEditorActionListener((v, actionId, event) -> {
            scanBarcode(text(barcode));
            return true;
        });
        Button accept = primary(tr("receipt.acceptBarcode"));
        accept.setOnClickListener(v -> scanBarcode(text(barcode)));
        root.addView(barcode);
        root.addView(accept);
        Button close = secondary(tr("receipt.closeBox"));
        close.setOnClickListener(v -> confirmCloseBox());
        root.addView(close);
        addBackButton(root, tr("common.back"), () -> showReceiptStart());
        setContentView(wrap(root));
        barcode.requestFocus();
    }

    private void scanBarcode(String value) {
        String barcode = value.trim();
        if (barcode.isEmpty()) {
            toast(tr("receipt.scanBarcodeToast"));
            return;
        }
        if (sameScan(lastConfirmedBarcode, barcode) && lastReceiptSku != null) {
            pendingBarcode = barcode;
            pendingReceiptSku = lastReceiptSku;
            showKizScan();
            return;
        }
        runAsync(() -> {
            JSONObject sku = api.skuByBarcode(token, selectedClientId, barcode);
            ReceiptSku summary = ReceiptSku.fromJson(barcode, sku);
            main.post(() -> showSkuConfirm(summary));
        });
    }

    private void showSkuConfirm(ReceiptSku sku) {
        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(dp(8), dp(4), dp(8), 0);

        if (!sku.photoUrl.isEmpty()) {
            ImageView image = new ImageView(this);
            image.setAdjustViewBounds(true);
            image.setScaleType(ImageView.ScaleType.CENTER_INSIDE);
            content.addView(image, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(220)));
            loadReceiptImage(sku.photoUrl, image);
        }

        TextView details = note(receiptSkuText(sku));
        details.setTextSize(scaledText(17));
        content.addView(details);

        new AlertDialog.Builder(this)
            .setTitle(tr("receipt.confirmProduct"))
            .setView(content)
            .setPositiveButton(tr("receipt.confirmYes"), (dialog, which) -> {
                lastConfirmedBarcode = sku.barcode;
                lastReceiptSku = sku;
                pendingBarcode = sku.barcode;
                pendingReceiptSku = sku;
                showKizScan();
            })
            .setNegativeButton(tr("receipt.confirmNoManager"), (dialog, which) -> showManagerRequired(tr("receipt.wrongProduct") + ": " + sku.barcode))
            .show();
    }

    private void showKizScan() {
        setBackAction(() -> {
            pendingBarcode = "";
            pendingReceiptSku = null;
            showBarcodeScan();
        });
        LinearLayout root = receiptPage(tr("receipt.scanKiz"));
        root.addView(note(tr("common.box") + ": " + boxCode));
        root.addView(note(tr("receipt.productBarcode") + ": " + pendingBarcode));
        if (pendingReceiptSku != null) {
            root.addView(note(pendingReceiptSku.shortLabel()));
        }
        EditText kiz = input(tr("receipt.kiz"), false);
        kiz.setSingleLine(true);
        kiz.setImeOptions(EditorInfo.IME_ACTION_DONE);
        kiz.setOnEditorActionListener((v, actionId, event) -> {
            saveKiz(text(kiz));
            return true;
        });
        Button save = primary(tr("receipt.saveProduct"));
        save.setOnClickListener(v -> saveKiz(text(kiz)));
        root.addView(kiz);
        root.addView(save);
        Button cancel = secondary(tr("receipt.cancelBarcode"));
        cancel.setOnClickListener(v -> {
            pendingBarcode = "";
            pendingReceiptSku = null;
            showBarcodeScan();
        });
        root.addView(cancel);
        addBackButton(root, tr("common.back"), () -> {
            pendingBarcode = "";
            pendingReceiptSku = null;
            showBarcodeScan();
        });
        setContentView(wrap(root));
        kiz.requestFocus();
    }

    private void saveKiz(String value) {
        String kiz = value.trim();
        if (kiz.isEmpty()) {
            toast(tr("receipt.scanKizToast"));
            return;
        }
        if (receiptKiz.contains(kiz)) {
            toast(tr("receipt.kizDuplicate"));
            return;
        }
        try {
            JSONObject operation = receiptOperation(kiz);
            queue.add(operation, userId);
            receiptKiz.add(kiz);
            currentBoxLines.add(new ReceiptLine(boxCode, pendingBarcode, kiz, pendingReceiptSku));
            toast(tr("receipt.productAdded") + " " + tr("common.queue").toLowerCase(Locale.ROOT) + ": " + queue.size());
            pendingBarcode = "";
            pendingReceiptSku = null;
            syncQueue();
            showBarcodeScan();
        } catch (JSONException error) {
            toast(tr("common.operationCreateFailed") + ": " + error.getMessage());
        }
    }

    private JSONObject receiptOperation(String kiz) throws JSONException {
        String key = "android-receipt:" + deviceCode + ":" + receiptId + ":" + boxCode + ":" + kiz + ":" + System.currentTimeMillis();
        JSONObject payload = new JSONObject()
            .put("clientId", selectedClientId)
            .put("boxCode", boxCode)
            .put("barcode", pendingBarcode)
            .put("kiz", kiz)
            .put("quantity", 1)
            .put("status", "AVAILABLE")
            .put("sourceDocument", receiptId)
            .put("workerUserId", userId)
            .put("comment", "Приемка Android ТСД " + deviceCode);
        return new JSONObject()
            .put("deviceId", deviceCode)
            .put("operationKey", key)
            .put("operationType", "receipt_scan")
            .put("payload", payload);
    }

    private void confirmCloseBox() {
        if (currentBoxLines.isEmpty()) {
            toast(tr("receipt.emptyBox"));
            return;
        }
        new AlertDialog.Builder(this)
            .setTitle(tr("receipt.closeBoxConfirm"))
            .setMessage(currentBoxSummaryText())
            .setPositiveButton(tr("receipt.closeBoxYes"), (dialog, which) -> closeCurrentBox())
            .setNegativeButton(tr("receipt.recheckBox"), (dialog, which) -> {
                boxRecheckBarcodes.clear();
                showBoxRecheck();
            })
            .show();
    }

    private void showBoxRecheck() {
        setBackAction(() -> showBarcodeScan());
        LinearLayout root = receiptPage(tr("receipt.recheckTitle"));
        root.addView(note(tr("common.box") + ": " + boxCode));
        root.addView(note(tr("receipt.recheckProgress") + ": " + boxRecheckBarcodes.size() + " / " + currentBoxLines.size()));

        EditText barcode = input(tr("receipt.productBarcode"), false);
        barcode.setSingleLine(true);
        barcode.setImeOptions(EditorInfo.IME_ACTION_DONE);
        barcode.setOnEditorActionListener((v, actionId, event) -> {
            addBoxRecheckBarcode(text(barcode));
            return true;
        });
        Button add = primary(tr("receipt.recheckAdd"));
        add.setOnClickListener(v -> addBoxRecheckBarcode(text(barcode)));
        Button verify = secondary(tr("receipt.recheckVerify"));
        verify.setOnClickListener(v -> verifyBoxRecheck());
        Button clear = secondary(tr("receipt.recheckClear"));
        clear.setOnClickListener(v -> {
            boxRecheckBarcodes.clear();
            showBoxRecheck();
        });

        root.addView(barcode);
        root.addView(add);
        root.addView(verify);
        root.addView(clear);
        addBackButton(root, tr("common.back"), () -> showBarcodeScan());
        setContentView(wrap(root));
        barcode.requestFocus();
    }

    private void addBoxRecheckBarcode(String value) {
        String barcode = value.trim();
        if (barcode.isEmpty()) {
            toast(tr("receipt.scanBarcodeToast"));
            return;
        }
        boxRecheckBarcodes.add(barcode);
        showBoxRecheck();
    }

    private void verifyBoxRecheck() {
        if (boxRecheckBarcodes.size() != currentBoxLines.size()) {
            showManagerRequired(tr("receipt.recheckCountMismatch"));
            return;
        }
        if (!expectedBoxBarcodeCounts().equals(scannedBarcodeCounts(boxRecheckBarcodes))) {
            showManagerRequired(tr("receipt.recheckMismatch"));
            return;
        }
        toast(tr("receipt.recheckOk"));
        closeCurrentBox();
    }

    private void closeCurrentBox() {
        ReceiptBoxSummary summary = new ReceiptBoxSummary(boxCode, currentBoxLines.size(), currentBoxSummaryText());
        receiptBoxes.add(summary);
        currentBoxLines.clear();
        boxRecheckBarcodes.clear();
        pendingBarcode = "";
        pendingReceiptSku = null;
        lastConfirmedBarcode = "";
        lastReceiptSku = null;
        syncQueue();
        showBoxClosed(summary);
    }

    private void showBoxClosed(ReceiptBoxSummary summary) {
        setBackAction(() -> showBoxScan());
        LinearLayout root = receiptPage(tr("receipt.boxClosed"));
        root.addView(note(tr("receipt.closedBox") + ": " + summary.boxCode));
        root.addView(note(tr("receipt.boxItems") + ": " + summary.itemsCount));
        root.addView(note(tr("receipt.receiptTotals") + ": " + receiptBoxes.size() + " / " + receiptTotalItems()));
        Button next = primary(tr("receipt.newBox"));
        next.setOnClickListener(v -> showBoxScan());
        Button finish = secondary(tr("receipt.finish"));
        finish.setOnClickListener(v -> finishReceipt());
        root.addView(next);
        root.addView(finish);
        addBackButton(root, tr("common.back"), () -> showBoxScan());
        setContentView(wrap(root));
    }

    private void finishReceipt() {
        if (!currentBoxLines.isEmpty()) {
            toast(tr("receipt.closeCurrentBoxFirst"));
            confirmCloseBox();
            return;
        }
        int boxes = receiptBoxes.size();
        int items = receiptTotalItems();
        String finishedReceiptId = receiptId;
        resetReceiptSession();
        syncQueue();
        showReceiptFinished(finishedReceiptId, boxes, items);
    }

    private void showReceiptFinished(String finishedReceiptId, int boxes, int items) {
        setBackAction(() -> showMenu());
        LinearLayout root = receiptPage(tr("receipt.finishedTitle"));
        root.addView(note(tr("receipt.finished")));
        root.addView(note(tr("receipt.document") + ": " + finishedReceiptId));
        root.addView(note(tr("receipt.finishedBoxes") + ": " + boxes));
        root.addView(note(tr("receipt.finishedItems") + ": " + items));
        Button menu = primary(tr("common.back"));
        menu.setOnClickListener(v -> showMenu());
        root.addView(menu);
        setContentView(wrap(root));
    }

    private void resetReceiptSession() {
        receiptKiz.clear();
        currentBoxLines.clear();
        receiptBoxes.clear();
        boxRecheckBarcodes.clear();
        receiptId = newReceiptId();
        boxCode = "";
        pendingBarcode = "";
        lastConfirmedBarcode = "";
        pendingReceiptSku = null;
        lastReceiptSku = null;
    }

    private int receiptTotalItems() {
        int total = 0;
        for (ReceiptBoxSummary box : receiptBoxes) {
            total += box.itemsCount;
        }
        return total;
    }

    private String currentBoxSummaryText() {
        StringBuilder builder = new StringBuilder();
        builder.append(tr("common.box")).append(": ").append(boxCode).append('\n');
        builder.append(tr("receipt.boxItems")).append(": ").append(currentBoxLines.size()).append("\n\n");

        LinkedHashMap<String, ProductCounter> counters = new LinkedHashMap<>();
        for (ReceiptLine line : currentBoxLines) {
            ProductCounter counter = counters.get(line.barcode);
            if (counter == null) {
                counter = new ProductCounter(line);
                counters.put(line.barcode, counter);
            }
            counter.quantity += 1;
        }

        for (ProductCounter counter : counters.values()) {
            builder
                .append(counter.label)
                .append('\n')
                .append(tr("receipt.barcodeShort"))
                .append(": ")
                .append(counter.barcode)
                .append(" · ")
                .append(counter.quantity)
                .append(' ')
                .append(tr("common.units"))
                .append("\n\n");
        }
        return builder.toString().trim();
    }

    private Map<String, Integer> expectedBoxBarcodeCounts() {
        HashMap<String, Integer> counts = new HashMap<>();
        for (ReceiptLine line : currentBoxLines) {
            String key = scanKey(line.barcode);
            counts.put(key, counts.containsKey(key) ? counts.get(key) + 1 : 1);
        }
        return counts;
    }

    private Map<String, Integer> scannedBarcodeCounts(ArrayList<String> barcodes) {
        HashMap<String, Integer> counts = new HashMap<>();
        for (String barcode : barcodes) {
            String key = scanKey(barcode);
            counts.put(key, counts.containsKey(key) ? counts.get(key) + 1 : 1);
        }
        return counts;
    }

    private String receiptSkuText(ReceiptSku sku) {
        StringBuilder text = new StringBuilder();
        text.append(tr("receipt.barcodeShort")).append(": ").append(sku.barcode)
            .append('\n').append(tr("receipt.name")).append(": ").append(firstNonEmpty(sku.name, "-"))
            .append('\n').append(tr("receipt.article")).append(": ").append(firstNonEmpty(sku.article, sku.clientSku, sku.internalSku, "-"))
            .append('\n').append(tr("receipt.sizeColor")).append(": ").append(compact(sku.size, sku.color))
            .append('\n').append(tr("receipt.brand")).append(": ").append(firstNonEmpty(sku.brand, "-"));
        for (String characteristic : sku.characteristics) {
            text.append('\n').append(characteristic);
        }
        return text.toString();
    }

    private void showManagerRequired(String message) {
        new AlertDialog.Builder(this)
            .setTitle(tr("receipt.managerTitle"))
            .setMessage(message)
            .setPositiveButton(tr("common.back"), (dialog, which) -> showBarcodeScan())
            .show();
    }

    private void loadReceiptImage(String imageUrl, ImageView target) {
        io.execute(() -> {
            try {
                HttpURLConnection connection = (HttpURLConnection) new URL(imageUrl).openConnection();
                connection.setConnectTimeout(6000);
                connection.setReadTimeout(8000);
                connection.setRequestProperty("User-Agent", "LOGOff-TSD-Android/0.1.25");
                Bitmap bitmap;
                try (InputStream stream = connection.getInputStream()) {
                    bitmap = BitmapFactory.decodeStream(stream);
                }
                if (bitmap != null) {
                    main.post(() -> target.setImageBitmap(bitmap));
                }
            } catch (Exception ignored) {
            }
        });
    }

    private void loadClients() {
        if (token.isEmpty()) {
            return;
        }
        runAsync(() -> {
            JSONArray loaded = api.clients(token);
            ArrayList<Client> next = new ArrayList<>();
            for (int i = 0; i < loaded.length(); i++) {
                JSONObject item = loaded.getJSONObject(i);
                next.add(new Client(item.optString("id"), item.optString("name")));
            }
            main.post(() -> {
                clients.clear();
                clients.addAll(next);
            });
        });
    }

    private void loadPickRequests(boolean showResultToast) {
        if (token.isEmpty()) {
            return;
        }
        runAsync(() -> {
            JSONArray loaded = api.activeRequests(token);
            ArrayList<PickRequest> next = new ArrayList<>();
            for (int i = 0; i < loaded.length(); i++) {
                JSONObject item = loaded.getJSONObject(i);
                JSONObject client = item.optJSONObject("client");
                JSONObject count = item.optJSONObject("_count");
                JSONArray activeWorkers = item.optJSONArray("activeWorkers");
                next.add(new PickRequest(
                    item.optString("id"),
                    item.optString("title"),
                    item.optString("status"),
                    item.optString("destinationCity"),
                    client == null ? "" : client.optString("name"),
                    client != null && client.optBoolean("storesWithoutBoxes"),
                    count == null ? 0 : count.optInt("items"),
                    activeWorkers == null ? 0 : activeWorkers.length(),
                    activeWorkersLabel(activeWorkers)
                ));
            }
            main.post(() -> {
                pickRequests.clear();
                pickRequests.addAll(next);
                if (showResultToast) {
                    toast(tr("pick.loaded") + ": " + pickRequests.size());
                }
                showPickRequests();
            });
        });
    }

    private void syncQueue() {
        if (token.isEmpty() || queue.size() == 0 || !isOnline()) {
            return;
        }
        String owner = queue.ownerUserId();
        if (!owner.isEmpty() && !owner.equals(userId)) {
            toast(tr("sync.otherOwner"));
            return;
        }
        runAsync(() -> {
            JSONArray results = api.sync(token, queue.all());
            queue.removeKeys(results);
            main.post(() -> toast(tr("sync.done") + ". " + tr("common.queue") + ": " + queue.size()));
        });
    }

    private void checkForUpdate(boolean manual) {
        if (updateCheckRunning) {
            if (manual) {
                toast(tr("update.alreadyChecking"));
            }
            return;
        }
        if (!isOnline()) {
            if (manual) {
                toast(tr("update.noInternet"));
            }
            return;
        }

        updateCheckRunning = true;
        io.execute(() -> {
            try {
                JSONObject update = readJson(UPDATE_MANIFEST_URL);
                int latestCode = update.optInt("versionCode", 0);
                int currentCode = currentVersionCode();
                main.post(() -> {
                    if (latestCode > currentCode) {
                        showUpdateDialog(update);
                    } else if (manual) {
                        toast(tr("update.latest") + ": " + currentVersionName());
                    }
                });
            } catch (Exception error) {
                if (manual) {
                    main.post(() -> toast(error.getMessage() == null ? tr("update.checkFailed") : error.getMessage()));
                }
            } finally {
                main.post(() -> updateCheckRunning = false);
            }
        });
    }

    private void showUpdateDialog(JSONObject update) {
        String versionName = update.optString("versionName", "");
        String notes = update.optString("releaseNotes", "");
        String message = tr("update.available")
            + (versionName.isEmpty() ? "." : ": " + versionName + ".")
            + "\n\n" + (notes.isEmpty() ? tr("update.defaultNotes") : notes);
        new AlertDialog.Builder(this)
            .setTitle(tr("update.title"))
            .setMessage(message)
            .setPositiveButton(tr("common.refresh"), (dialog, which) -> downloadAndInstallUpdate(update.optString("apkUrl", "")))
            .setNegativeButton(tr("update.later"), null)
            .show();
    }

    private void downloadAndInstallUpdate(String apkUrl) {
        if (apkUrl == null || apkUrl.trim().isEmpty()) {
            toast(tr("update.noApk"));
            return;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !getPackageManager().canRequestPackageInstalls()) {
            toast(tr("update.allowInstall"));
            Intent intent = new Intent(
                Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:" + getPackageName())
            );
            startActivity(intent);
            return;
        }

        toast(tr("update.downloading"));
        runAsync(() -> {
            File apk = downloadApk(apkUrl);
            main.post(() -> installApk(apk));
        });
    }

    private File downloadApk(String apkUrl) throws Exception {
        File dir = new File(getExternalFilesDir(null), "updates");
        if (!dir.exists() && !dir.mkdirs()) {
            throw new IllegalStateException(tr("update.createDirFailed"));
        }
        File target = new File(dir, "logoff-tsd-update.apk");
        HttpURLConnection connection = (HttpURLConnection) new URL(apkUrl).openConnection();
        connection.setConnectTimeout(12000);
        connection.setReadTimeout(60000);
        connection.setRequestProperty("User-Agent", "LOGOff-TSD-Android/" + currentVersionName());
        int code = connection.getResponseCode();
        if (code >= 400) {
            throw new IllegalStateException(tr("update.downloadFailed") + ": HTTP " + code);
        }
        try (InputStream input = new BufferedInputStream(connection.getInputStream());
             FileOutputStream output = new FileOutputStream(target, false)) {
            byte[] buffer = new byte[8192];
            int read;
            while ((read = input.read(buffer)) != -1) {
                output.write(buffer, 0, read);
            }
        } finally {
            connection.disconnect();
        }
        return target;
    }

    private void installApk(File apk) {
        Uri uri = Build.VERSION.SDK_INT >= Build.VERSION_CODES.N
            ? FileProvider.getUriForFile(this, getPackageName() + ".fileprovider", apk)
            : Uri.fromFile(apk);
        Intent intent = new Intent(Intent.ACTION_VIEW);
        intent.setDataAndType(uri, "application/vnd.android.package-archive");
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        startActivity(intent);
    }

    private JSONObject readJson(String url) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
        connection.setConnectTimeout(12000);
        connection.setReadTimeout(20000);
        connection.setRequestProperty("Accept", "application/json");
        connection.setRequestProperty("User-Agent", "LOGOff-TSD-Android/" + currentVersionName());
        int code = connection.getResponseCode();
        String response = readAll(code >= 400 ? connection.getErrorStream() : connection.getInputStream());
        connection.disconnect();
        if (code >= 400) {
            throw new IllegalStateException(tr("update.checkFailed") + ": HTTP " + code);
        }
        return new JSONObject(response);
    }

    private String currentVersionName() {
        try {
            PackageInfo info = getPackageManager().getPackageInfo(getPackageName(), 0);
            return info.versionName == null ? "0" : info.versionName;
        } catch (Exception ignored) {
            return "0";
        }
    }

    private int currentVersionCode() {
        try {
            PackageInfo info = getPackageManager().getPackageInfo(getPackageName(), 0);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                return (int) info.getLongVersionCode();
            }
            return info.versionCode;
        } catch (Exception ignored) {
            return 0;
        }
    }

    private static String readAll(InputStream stream) throws Exception {
        if (stream == null) {
            return "";
        }
        StringBuilder builder = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                builder.append(line);
            }
        }
        return builder.toString();
    }

    private void runAsync(Job job) {
        io.execute(() -> {
            try {
                job.run();
            } catch (Exception error) {
                main.post(() -> toast(error.getMessage() == null ? tr("common.operationError") : error.getMessage()));
            }
        });
    }

    private LinearLayout receiptPage(String title) {
        LinearLayout root = page();
        root.setPadding(dp(14), dp(16), dp(14), dp(14));
        addHeader(root);
        addTitle(root, title);
        root.addView(note(tr("common.client") + ": " + selectedClientName));
        root.addView(note(isOnline() ? tr("common.online") : tr("common.offlineSaved")));
        return root;
    }

    private void addHeader(LinearLayout root) {
        LinearLayout row = new LinearLayout(this);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setOrientation(LinearLayout.HORIZONTAL);
        addLogo(row, true);
        TextView text = new TextView(this);
        text.setText(userName + "\n" + deviceCode);
        text.setTextSize(15);
        text.setTextColor(Color.rgb(40, 34, 34));
        row.addView(text, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1));
        root.addView(row, matchWrap());
    }

    private void addLogo(LinearLayout root, boolean compact) {
        TextView logo = new TextView(this);
        logo.setText("ТСД");
        logo.setTextColor(Color.WHITE);
        logo.setGravity(Gravity.CENTER);
        logo.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        logo.setTextSize(compact ? 18 : 34);
        logo.setBackgroundColor(BLUE);
        int size = compact ? dp(48) : dp(132);
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(size, compact ? dp(48) : dp(132));
        params.setMargins(0, 0, compact ? dp(10) : 0, dp(12));
        root.addView(logo, params);
    }

    private void addTitle(LinearLayout root, String title) {
        TextView view = new TextView(this);
        view.setText(title);
        view.setTextSize(scaledText(24));
        view.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        view.setTextColor(Color.rgb(35, 30, 30));
        view.setPadding(0, dp(10), 0, dp(12));
        root.addView(view, matchWrap());
    }

    private void addStatus(LinearLayout root) {
        root.addView(note((isOnline() ? tr("common.online") : tr("common.offline")) + " · " + tr("common.queue").toLowerCase(Locale.ROOT) + ": " + queue.size()));
    }

    private void addBackButton(LinearLayout root, String text, Runnable action) {
        Button back = secondary(text);
        back.setOnClickListener(v -> {
            setBackAction(null);
            action.run();
        });
        root.addView(back);
    }

    private void setBackAction(Runnable action) {
        backAction = action;
        if (action == null) {
            lastRootBackAtMs = 0L;
        }
    }

    private EditText input(String hint, boolean password) {
        EditText input = new EditText(this);
        input.setHint(hint);
        input.setTextSize(scaledText(20));
        input.setSingleLine(true);
        input.setInputType(password ? InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD : InputType.TYPE_CLASS_TEXT);
        input.setPadding(dp(12), dp(10), dp(12), dp(10));
        LinearLayout.LayoutParams params = matchWrap();
        params.setMargins(0, dp(6), 0, dp(10));
        input.setLayoutParams(params);
        return input;
    }

    private TextView note(String value) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextSize(scaledText(16));
        view.setTextColor(Color.rgb(62, 54, 54));
        view.setPadding(0, dp(4), 0, dp(8));
        return view;
    }

    private Button primary(String text) {
        Button button = new Button(this);
        button.setText(text);
        button.setTextColor(Color.WHITE);
        button.setTextSize(scaledText(18));
        button.setAllCaps(false);
        button.setBackgroundColor(BLUE);
        button.setMinHeight(dp(scaledSize(58)));
        button.setLayoutParams(buttonParams());
        return button;
    }

    private Button stageButton(String text, boolean complete) {
        Button button = primary(text);
        button.setBackgroundColor(complete ? GREEN : BLUE);
        return button;
    }

    private Button secondary(String text) {
        Button button = new Button(this);
        button.setText(text);
        button.setTextSize(scaledText(17));
        button.setAllCaps(false);
        button.setMinHeight(dp(scaledSize(54)));
        button.setLayoutParams(buttonParams());
        return button;
    }

    private LinearLayout page() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(BG);
        return root;
    }

    private ScrollView wrap(LinearLayout root) {
        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.addView(root, new ScrollView.LayoutParams(ScrollView.LayoutParams.MATCH_PARENT, ScrollView.LayoutParams.WRAP_CONTENT));
        return scroll;
    }

    private LinearLayout.LayoutParams matchWrap() {
        return new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
    }

    private LinearLayout.LayoutParams buttonParams() {
        LinearLayout.LayoutParams params = matchWrap();
        params.setMargins(0, dp(8), 0, dp(8));
        return params;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private int scaledSize(int value) {
        return Math.round(value * interfaceScale());
    }

    private float scaledText(float value) {
        return value * interfaceScale();
    }

    private float interfaceScale() {
        if ("compact".equals(interfaceMode)) {
            return 0.88f;
        }
        if ("large".equals(interfaceMode)) {
            return 1.14f;
        }
        return 1.0f;
    }

    private int choiceIndex(ArrayAdapter<Choice> adapter, String value) {
        for (int i = 0; i < adapter.getCount(); i++) {
            Choice choice = adapter.getItem(i);
            if (choice != null && choice.value.equals(value)) {
                return i;
            }
        }
        return 0;
    }

    private String tr(String key) {
        if ("uz".equals(language)) {
            switch (key) {
                case "common.back": return "Orqaga";
                case "login.title": return "Xodim kirishi";
                case "login.login": return "Login";
                case "login.password": return "Parol";
                case "login.device": return "TSD / joy kodi";
                case "login.server": return "WMS serveri";
                case "login.connect": return "WMS ga ulanish";
                case "menu.receipt": return "Tovar qabul qilish";
                case "menu.pick": return "Buyurtma yig'ish";
                case "menu.inventory": return "Inventarizatsiya";
                case "menu.sync": return "Navbatni sinxronlash";
                case "menu.settings": return "Sozlamalar";
                case "menu.update": return "Yangilanishni tekshirish";
                case "menu.exit": return "Chiqish";
                case "settings.title": return "Sozlamalar";
                case "settings.note": return "Interfeys o'lchami va ilova tilini tanlang.";
                case "settings.scale": return "Interfeys o'lchami";
                case "settings.scale.recommended": return "Tavsiya etilgan";
                case "settings.scale.compact": return "Ixcham";
                case "settings.scale.large": return "Katta";
                case "settings.language": return "Til";
                case "settings.save": return "Sozlamalarni saqlash";
                case "settings.saved": return "Sozlamalar saqlandi";
                case "common.backAgainExit": return "Chiqish uchun Orqaga tugmasini yana bir marta bosing.";
                case "common.refresh": return "Yangilash";
                case "common.client": return "Mijoz";
                case "common.city": return "Shahar";
                case "common.cityMissing": return "shahar ko'rsatilmagan";
                case "common.status": return "Holat";
                case "common.rows": return "qatorlar";
                case "common.box": return "Quti";
                case "common.size": return "O'lcham";
                case "common.queue": return "Navbat";
                case "common.online": return "Onlayn";
                case "common.offline": return "Oflayn";
                case "common.offlineSaved": return "Oflayn, ma'lumotlar TSDda saqlanadi";
                case "common.employee": return "xodim";
                case "common.units": return "dona";
                case "common.operationError": return "Operatsiya xatosi";
                case "common.operationCreateFailed": return "Operatsiyani yaratib bo'lmadi";
                case "login.enterCredentials": return "Login va parolni kiriting.";
                case "login.noTsdAccess": return "TSDga kirish yo'q. Administratordan profilda TSD bilan ishlash huquqini yoqishni so'rang.";
                case "login.connected": return "Xodim ulandi";
                case "menu.syncFirst": return "Avval navbatni sinxronlang";
                case "receipt.refreshClients": return "Mijozlarni yangilash";
                case "receipt.start": return "Qabulni boshlash";
                case "receipt.newBox": return "Yangi quti";
                case "receipt.noClients": return "Mavjud mijozlar yo'q.";
                case "receipt.scanBox": return "Quti raqamini skanerlash";
                case "receipt.openBox": return "Qutini ochish";
                case "receipt.finish": return "Qabulni tugatish";
                case "receipt.opened": return "ochildi.";
                case "receipt.scanProduct": return "Tovarni skanerlash";
                case "receipt.productBarcode": return "Tovar shtrixkodi";
                case "receipt.acceptBarcode": return "Tovar SHKini qabul qilish";
                case "receipt.closeBox": return "Qutini yopish";
                case "receipt.scanBarcodeToast": return "Tovar shtrixkodini skanerlang.";
                case "receipt.barcodeShort": return "SHK";
                case "receipt.name": return "Nomi";
                case "receipt.article": return "Artikul";
                case "receipt.sizeColor": return "O'lcham / rang";
                case "receipt.brand": return "Brend";
                case "receipt.confirmProduct": return "Tovarni tekshiring";
                case "receipt.confirmYes": return "Ha, shu tovar";
                case "receipt.confirmNo": return "Yo'q, bekor qilish";
                case "receipt.confirmNoManager": return "Yo'q, menejerni chaqirish";
                case "receipt.scanKiz": return "KIZ skanerlash";
                case "receipt.kiz": return "Tovar KIZ";
                case "receipt.saveProduct": return "Tovarni yozish";
                case "receipt.cancelBarcode": return "SHKni bekor qilish";
                case "receipt.scanKizToast": return "KIZni skanerlang.";
                case "receipt.kizDuplicate": return "Bu KIZ joriy qabulda allaqachon bor.";
                case "receipt.productAdded": return "Tovar qo'shildi.";
                case "receipt.boxClosed": return "Quti yopildi";
                case "receipt.closedBox": return "Yopilgan quti";
                case "receipt.finished": return "Qabul yakunlandi.";
                case "receipt.currentBoxCount": return "Joriy qutida";
                case "receipt.emptyBox": return "Quti bo'sh. Avval tovar qo'shing.";
                case "receipt.closeBoxConfirm": return "Qutini tekshiring";
                case "receipt.closeBoxYes": return "Ha, qutini yopish";
                case "receipt.recheckBox": return "SHKni qayta tekshirish";
                case "receipt.recheckTitle": return "Qutini qayta tekshirish";
                case "receipt.recheckProgress": return "Qayta skanerlandi";
                case "receipt.recheckAdd": return "SHK qo'shish";
                case "receipt.recheckVerify": return "Tekshirish";
                case "receipt.recheckClear": return "Qayta boshlash";
                case "receipt.recheckCountMismatch": return "Soni mos kelmadi. Menejerni chaqiring.";
                case "receipt.recheckMismatch": return "Tovarlar ro'yxati mos kelmadi. Menejerni chaqiring.";
                case "receipt.recheckOk": return "Quti tekshirildi.";
                case "receipt.wrongProduct": return "Tovar noto'g'ri. Menejerni chaqiring";
                case "receipt.boxItems": return "Qutidagi tovarlar";
                case "receipt.receiptTotals": return "Qutilar / tovarlar";
                case "receipt.closeCurrentBoxFirst": return "Avval joriy qutini yoping.";
                case "receipt.finishedTitle": return "Qabul yopildi";
                case "receipt.document": return "Hujjat";
                case "receipt.finishedBoxes": return "Qutilar";
                case "receipt.finishedItems": return "Tovarlar";
                case "receipt.managerTitle": return "Menejerni chaqiring";
                case "pick.hint": return "Faol buyurtmani tanlang. Kimdir TSD bilan ishlayotgan buyurtmalar sariq rangda.";
                case "pick.refresh": return "Buyurtmalarni yangilash";
                case "pick.empty": return "Faol buyurtmalar yo'q. Yangilashni bosing.";
                case "pick.request": return "Buyurtma";
                case "pick.inWork": return "Ishda";
                case "pick.relabel": return "Qayta markalash";
                case "pick.moves": return "Ko'chirishlar";
                case "pick.relabelNext": return "Qayta markalash keyingi bosqichda ochiladi.";
                case "pick.movesNext": return "Ko'chirishlar keyingi bosqichda ochiladi.";
                case "pick.backToRequests": return "Buyurtmalarga qaytish";
                case "pick.loaded": return "Buyurtmalar yuklandi";
                case "moves.title": return "Ko'chirishlar";
                case "moves.progress": return "Ko'chirishlar";
                case "moves.currentTarget": return "Yangi quti";
                case "moves.complete": return "Ko'chirishlar tugadi. Buyurtma qadoqlandi.";
                case "moves.empty": return "Ko'chirish uchun vazifalar yo'q.";
                case "moves.selectBox": return "Ko'chirish kerak bo'lgan qutini tanlang:";
                case "moves.scanTargetBox": return "Yangi quti SHKini skanerlash";
                case "moves.setTargetBox": return "Yangi qutini tanlash";
                case "moves.scanItem": return "Ko'chiriladigan tovar SHKini skanerlash";
                case "moves.products": return "Ko'chiriladigan tovarlar:";
                case "moves.nextBox": return "Keyingi quti";
                case "moves.finish": return "Ko'chirishlarni yakunlash";
                case "moves.scanTargetToast": return "Yangi quti SHKini skanerlang.";
                case "moves.scanItemToast": return "Tovar SHKini skanerlang.";
                case "moves.targetOpened": return "Yangi quti ochildi.";
                case "moves.itemMoved": return "Tovar ko'chirildi.";
                case "boxless.mode": return "Mijoz qutisiz saqlanadi. Yig'ish faqat jo'natma qutilari bo'yicha.";
                case "boxless.title": return "Qutilar bo'yicha yig'ish";
                case "boxless.progress": return "Yig'ildi";
                case "boxless.scanBox": return "Jo'natma qutisi SHKini skanerlash";
                case "boxless.scanItem": return "Tovar SHKini skanerlash";
                case "boxless.currentBox": return "Ochiq quti";
                case "boxless.currentQuantity": return "Qutida";
                case "boxless.closeBox": return "Qutini yopish";
                case "boxless.finish": return "Qadoqlashni yakunlash";
                case "boxless.closedBoxes": return "Yopilgan qutilar:";
                case "boxless.goods": return "Buyurtma tovarlari:";
                case "boxless.packed": return "Yig'ildi";
                case "boxless.scanBoxToast": return "Quti SHKini skanerlang.";
                case "boxless.scanItemToast": return "Tovar SHKini skanerlang.";
                case "boxless.boxOpened": return "Quti ochildi.";
                case "boxless.itemAdded": return "Tovar qutiga qo'shildi.";
                case "boxless.boxClosed": return "Quti yopildi.";
                case "boxless.complete": return "Qadoqlash tugadi. WB/Ozon fayllari tayyor.";
                case "stage.searchRequired": return "Avval barcha qutilarni topishni yakunlang.";
                case "stage.managerCodeTitle": return "Menejer kodi";
                case "stage.managerCodeInput": return "4 xonali kod";
                case "stage.managerCodeUnlock": return "Bosqichni ochish";
                case "stage.managerCodeCancel": return "Bekor qilish";
                case "stage.managerCodeRejected": return "Kod mos kelmadi. Qayta kiriting yoki bekor qiling.";
                case "stage.managerCodeHint": return "4 xonali menejer kodini kiriting.";
                case "stage.relabelLocked": return "Qutilarni qidirish tugamaguncha qayta markalash bosqichi yopiq. Menejer kodini kiriting yoki bekor qiling.";
                case "stage.movesLocked": return "Oldingi bosqichlar tugamaguncha ko'chirish bosqichi yopiq. Menejer kodini kiriting yoki bekor qiling.";
                case "stage.supervisorBypass": return "Bosqich rahbar tomonidan qidirish tugashini kutmasdan ochildi. Faqat topilgan qutilar bilan ishlang.";
                case "stage.noFoundBoxes": return "Hozircha topilgan qutilar yo'q.";
                case "stage.foundBoxes": return "Topilgan qutilar:";
                case "stage.relabelTitle": return "Qayta markalash";
                case "stage.movesTitle": return "Qutilar bo'yicha ko'chirishlar";
                case "stage.relabelHint": return "Qayta markalashni topilgan qutilar bo'yicha bajaring. Agar quti hali topilmagan bo'lsa, uni avval qidirishda skanerlang.";
                case "stage.movesHint": return "Ko'chirishlarni faqat topilgan qutilar bo'yicha bajaring. Yangi qutiga ko'chirish skani keyingi ekranda yoziladi.";
                case "relabel.progress": return "Qayta markalash";
                case "relabel.complete": return "Qayta markalash tugadi. Endi ko'chirishlarga o'tish mumkin.";
                case "relabel.empty": return "Qayta markalash uchun vazifalar yo'q.";
                case "relabel.selectBox": return "Qayta markalash kerak bo'lgan qutini tanlang:";
                case "relabel.scanSource": return "Eski SHKni skanerlash";
                case "relabel.boxDone": return "Bu qutida qayta markalash tugadi.";
                case "relabel.products": return "Qayta markalanadigan tovarlar:";
                case "relabel.from": return "Eski SHK";
                case "relabel.to": return "Yangi SHK";
                case "relabel.sourceNotFound": return "Bu qutida bunday SHK qayta markalash uchun yo'q.";
                case "relabel.wrongSource": return "Noto'g'ri tovar olindi. Eski SHK qayta markalash topshirig'iga mos kelmaydi.";
                case "relabel.confirmSource": return "Tovarni tasdiqlang";
                case "relabel.scanTargetTitle": return "Yangi SHKni skanerlang";
                case "relabel.scanTarget": return "Yangi SHK";
                case "relabel.scanTargetToast": return "Yangi SHKni skanerlang.";
                case "relabel.itemDone": return "Qayta markalash belgilandi.";
                case "relabel.queued": return "Navbatdagi eski SHK";
                case "relabel.scanSourceBatch": return "Eski SHKlarni ketma-ket skanerlang";
                case "relabel.scanTargetBatch": return "Yangi SHKlarni ketma-ket skanerlang";
                case "relabel.scanTargets": return "Yangi SHKlarni skanerlash";
                case "relabel.clearQueue": return "Navbatni tozalash";
                case "relabel.batchSourceAdded": return "Eski SHK navbatga qo'shildi.";
                case "relabel.batchFull": return "Bu tovar bo'yicha kerakli eski SHKlar allaqachon navbatda.";
                case "relabel.confirmTarget": return "Yangi SHKni tasdiqlang";
                case "relabel.wrongTarget": return "Yangi SHK topshiriqqa mos kelmaydi.";
                case "relabel.backToSources": return "Eski SHKlarga qaytish";
                case "boxSearch.title": return "Qutilarni qidirish";
                case "boxSearch.scanBoxToast": return "Quti raqamini skanerlang.";
                case "boxSearch.alreadyFound": return "Quti allaqachon topilgan va solishtirishda qatnashmaydi.";
                case "boxSearch.found": return "Kerakli quti topildi. Uni yig'ish zonasiga olib boring.";
                case "boxSearch.notNeeded": return "Bu quti buyurtma yig'ishda qatnashmaydi.";
                case "boxSearch.progressFound": return "Topildi";
                case "boxSearch.progressOf": return "/";
                case "boxSearch.progressRemaining": return "Qoldi";
                case "boxSearch.complete": return "Qidirish yakunlandi. Keyingi bosqichga o'tish mumkin: qayta markalash.";
                case "boxSearch.scanInput": return "Quti raqamini skanerlash";
                case "boxSearch.empty": return "Qidirish uchun qutilar yo'q.";
                case "boxSearch.listTitle": return "Qidiriladigan qutilar:";
                case "boxSearch.collapse": return "Qidirishni yig'ish";
                case "boxSearch.notAllFoundTitle": return "Hamma qutilar topilmadi";
                case "boxSearch.remainingToFind": return "Topish kerak";
                case "boxSearch.collapseShort": return "Yig'ish";
                case "boxSearch.stay": return "Qolish";
                case "boxSearch.noMissing": return "Yetishmayotgan qutilar yo'q.";
                case "boxSearch.andMore": return "yana";
                case "inventory.placeholder": return "Bo'lim asosiy menyu sifatida tayyor. Keyingi bosqichda quti, tovar skani va WMS bilan solishtirish qo'shiladi.";
                case "sync.otherOwner": return "Navbat boshqa xodim tomonidan yaratilgan. Sinxronlash uchun uning loginida kiring.";
                case "sync.done": return "Sinxronlash yakunlandi";
                case "update.alreadyChecking": return "Yangilanish tekshiruvi allaqachon ketmoqda.";
                case "update.noInternet": return "Internet yo'q. Yangilanishni hozir tekshirib bo'lmaydi.";
                case "update.latest": return "So'nggi versiya o'rnatilgan";
                case "update.checkFailed": return "Yangilanishni tekshirib bo'lmadi";
                case "update.available": return "Yangi versiya mavjud";
                case "update.defaultNotes": return "APKni yuklab olish va o'rnatish uchun yangilashni bosing.";
                case "update.title": return "LOGOff TSD yangilanishi";
                case "update.later": return "Keyinroq";
                case "update.noApk": return "Yangilanish manifestida APK ko'rsatilmagan.";
                case "update.allowInstall": return "Ushbu ilovadan o'rnatishga ruxsat bering va yangilashni yana bosing.";
                case "update.downloading": return "Yangilanish yuklanmoqda...";
                case "update.createDirFailed": return "Yangilanishlar papkasini yaratib bo'lmadi.";
                case "update.downloadFailed": return "Yangilanishni yuklab bo'lmadi";
                default: return key;
            }
        }
        if ("en".equals(language)) {
            switch (key) {
                case "common.back": return "Back";
                case "login.title": return "Employee login";
                case "login.login": return "Login";
                case "login.password": return "Password";
                case "login.device": return "TSD / station code";
                case "login.server": return "WMS server";
                case "login.connect": return "Connect to WMS";
                case "menu.receipt": return "Goods receiving";
                case "menu.pick": return "Pick request";
                case "menu.inventory": return "Inventory";
                case "menu.sync": return "Sync queue";
                case "menu.settings": return "Settings";
                case "menu.update": return "Check update";
                case "menu.exit": return "Exit";
                case "settings.title": return "Settings";
                case "settings.note": return "Choose the interface scale and app language.";
                case "settings.scale": return "Interface scale";
                case "settings.scale.recommended": return "Recommended";
                case "settings.scale.compact": return "Compact";
                case "settings.scale.large": return "Large";
                case "settings.language": return "Language";
                case "settings.save": return "Save settings";
                case "settings.saved": return "Settings saved";
                case "common.backAgainExit": return "Press Back again to close the app.";
                case "common.refresh": return "Refresh";
                case "common.client": return "Client";
                case "common.city": return "City";
                case "common.cityMissing": return "city not specified";
                case "common.status": return "Status";
                case "common.rows": return "rows";
                case "common.box": return "Box";
                case "common.size": return "Size";
                case "common.queue": return "Queue";
                case "common.online": return "Online";
                case "common.offline": return "Offline";
                case "common.offlineSaved": return "Offline, data is saved on TSD";
                case "common.employee": return "employee";
                case "common.units": return "pcs";
                case "common.operationError": return "Operation error";
                case "common.operationCreateFailed": return "Could not create operation";
                case "login.enterCredentials": return "Enter login and password.";
                case "login.noTsdAccess": return "No TSD access. Ask an administrator to enable TSD work in the profile.";
                case "login.connected": return "Employee connected";
                case "menu.syncFirst": return "Sync the queue first";
                case "receipt.refreshClients": return "Refresh clients";
                case "receipt.start": return "Start receiving";
                case "receipt.newBox": return "New box";
                case "receipt.noClients": return "No available clients.";
                case "receipt.scanBox": return "Scan box number";
                case "receipt.openBox": return "Open box";
                case "receipt.finish": return "Finish receiving";
                case "receipt.opened": return "opened.";
                case "receipt.scanProduct": return "Scan product";
                case "receipt.productBarcode": return "Product barcode";
                case "receipt.acceptBarcode": return "Accept product barcode";
                case "receipt.closeBox": return "Close box";
                case "receipt.scanBarcodeToast": return "Scan product barcode.";
                case "receipt.barcodeShort": return "Barcode";
                case "receipt.name": return "Name";
                case "receipt.article": return "Article";
                case "receipt.sizeColor": return "Size / color";
                case "receipt.brand": return "Brand";
                case "receipt.confirmProduct": return "Check product";
                case "receipt.confirmYes": return "Yes, this is the product";
                case "receipt.confirmNo": return "No, cancel";
                case "receipt.confirmNoManager": return "No, call manager";
                case "receipt.scanKiz": return "Scan KIZ";
                case "receipt.kiz": return "Product KIZ";
                case "receipt.saveProduct": return "Save product";
                case "receipt.cancelBarcode": return "Cancel barcode";
                case "receipt.scanKizToast": return "Scan KIZ.";
                case "receipt.kizDuplicate": return "This KIZ is already in the current receiving.";
                case "receipt.productAdded": return "Product added.";
                case "receipt.boxClosed": return "Box closed";
                case "receipt.closedBox": return "Closed box";
                case "receipt.finished": return "Receiving finished.";
                case "receipt.currentBoxCount": return "Current box count";
                case "receipt.emptyBox": return "The box is empty. Add products first.";
                case "receipt.closeBoxConfirm": return "Check box";
                case "receipt.closeBoxYes": return "Yes, close box";
                case "receipt.recheckBox": return "Recheck barcodes";
                case "receipt.recheckTitle": return "Recheck box";
                case "receipt.recheckProgress": return "Rechecked";
                case "receipt.recheckAdd": return "Add barcode";
                case "receipt.recheckVerify": return "Verify";
                case "receipt.recheckClear": return "Start over";
                case "receipt.recheckCountMismatch": return "Quantity does not match. Call manager.";
                case "receipt.recheckMismatch": return "Product list does not match. Call manager.";
                case "receipt.recheckOk": return "Box checked.";
                case "receipt.wrongProduct": return "Wrong product. Call manager";
                case "receipt.boxItems": return "Box items";
                case "receipt.receiptTotals": return "Boxes / items";
                case "receipt.closeCurrentBoxFirst": return "Close the current box first.";
                case "receipt.finishedTitle": return "Receiving closed";
                case "receipt.document": return "Document";
                case "receipt.finishedBoxes": return "Boxes";
                case "receipt.finishedItems": return "Items";
                case "receipt.managerTitle": return "Call manager";
                case "pick.hint": return "Select an active request. Requests already handled on TSD are highlighted yellow.";
                case "pick.refresh": return "Refresh requests";
                case "pick.empty": return "No active requests yet. Press refresh.";
                case "pick.request": return "Request";
                case "pick.inWork": return "In work";
                case "pick.relabel": return "Relabeling";
                case "pick.moves": return "Movements";
                case "pick.relabelNext": return "Relabeling will open in the next step.";
                case "pick.movesNext": return "Movements will open in the next step.";
                case "pick.backToRequests": return "Back to requests";
                case "pick.loaded": return "Requests loaded";
                case "moves.title": return "Movements";
                case "moves.progress": return "Moved";
                case "moves.currentTarget": return "New box";
                case "moves.complete": return "Movements complete. Request is packed.";
                case "moves.empty": return "No movement tasks.";
                case "moves.selectBox": return "Select a box for movement:";
                case "moves.scanTargetBox": return "Scan new box barcode";
                case "moves.setTargetBox": return "Use new box";
                case "moves.scanItem": return "Scan product barcode to move";
                case "moves.products": return "Products to move:";
                case "moves.nextBox": return "Next box";
                case "moves.finish": return "Finish movements";
                case "moves.scanTargetToast": return "Scan new box barcode.";
                case "moves.scanItemToast": return "Scan product barcode.";
                case "moves.targetOpened": return "New box opened.";
                case "moves.itemMoved": return "Product moved.";
                case "boxless.mode": return "Client stores goods without warehouse boxes. Pick only by shipment boxes.";
                case "boxless.title": return "Pick by boxes";
                case "boxless.progress": return "Packed";
                case "boxless.scanBox": return "Scan shipment box barcode";
                case "boxless.scanItem": return "Scan product barcode";
                case "boxless.currentBox": return "Open box";
                case "boxless.currentQuantity": return "In box";
                case "boxless.closeBox": return "Close box";
                case "boxless.finish": return "Finish packing";
                case "boxless.closedBoxes": return "Closed boxes:";
                case "boxless.goods": return "Request goods:";
                case "boxless.packed": return "Packed";
                case "boxless.scanBoxToast": return "Scan box barcode.";
                case "boxless.scanItemToast": return "Scan product barcode.";
                case "boxless.boxOpened": return "Box opened.";
                case "boxless.itemAdded": return "Product added to box.";
                case "boxless.boxClosed": return "Box closed.";
                case "boxless.complete": return "Packing complete. WB/Ozon files are ready.";
                case "stage.searchRequired": return "Finish finding all boxes first.";
                case "stage.managerCodeTitle": return "Manager code";
                case "stage.managerCodeInput": return "4-digit code";
                case "stage.managerCodeUnlock": return "Open stage";
                case "stage.managerCodeCancel": return "Cancel";
                case "stage.managerCodeRejected": return "Code did not match. Try again or cancel.";
                case "stage.managerCodeHint": return "Enter the 4-digit manager code.";
                case "stage.relabelLocked": return "Relabeling is locked until box search is complete. Enter a manager code or cancel.";
                case "stage.movesLocked": return "Movements are locked until previous stages are complete. Enter a manager code or cancel.";
                case "stage.supervisorBypass": return "Stage opened by a supervisor before box search is complete. Work only with found boxes.";
                case "stage.noFoundBoxes": return "No boxes have been found yet.";
                case "stage.foundBoxes": return "Found boxes:";
                case "stage.relabelTitle": return "Relabeling";
                case "stage.movesTitle": return "Box movements";
                case "stage.relabelHint": return "Perform relabeling using the found boxes. If a box is not found yet, scan it in box search first.";
                case "stage.movesHint": return "Perform movements only from found boxes. Movement scan into a new box will be recorded on the next screen.";
                case "relabel.progress": return "Relabeling";
                case "relabel.complete": return "Relabeling is complete. You can proceed to movements.";
                case "relabel.empty": return "No relabeling tasks.";
                case "relabel.selectBox": return "Select a box for relabeling:";
                case "relabel.scanSource": return "Scan old barcode";
                case "relabel.boxDone": return "Relabeling is complete in this box.";
                case "relabel.products": return "Products to relabel:";
                case "relabel.from": return "Old barcode";
                case "relabel.to": return "New barcode";
                case "relabel.sourceNotFound": return "This box has no such barcode for relabeling.";
                case "relabel.wrongSource": return "Wrong product picked. The old barcode does not match the relabeling task.";
                case "relabel.confirmSource": return "Confirm product";
                case "relabel.scanTargetTitle": return "Scan new barcode";
                case "relabel.scanTarget": return "New barcode";
                case "relabel.scanTargetToast": return "Scan the new barcode.";
                case "relabel.itemDone": return "Relabeling marked complete.";
                case "relabel.queued": return "Old barcodes queued";
                case "relabel.scanSourceBatch": return "Scan old barcodes one by one";
                case "relabel.scanTargetBatch": return "Scan new barcodes one by one";
                case "relabel.scanTargets": return "Scan new barcodes";
                case "relabel.clearQueue": return "Clear queue";
                case "relabel.batchSourceAdded": return "Old barcode added to queue.";
                case "relabel.batchFull": return "All required old barcodes for this product are already queued.";
                case "relabel.confirmTarget": return "Confirm new barcode";
                case "relabel.wrongTarget": return "New barcode does not match the task.";
                case "relabel.backToSources": return "Back to old barcodes";
                case "boxSearch.title": return "Box search";
                case "boxSearch.scanBoxToast": return "Scan box number.";
                case "boxSearch.alreadyFound": return "Box is already found and no longer participates in matching.";
                case "boxSearch.found": return "Required box found. Move it to the picking area.";
                case "boxSearch.notNeeded": return "This box is not part of the request.";
                case "boxSearch.progressFound": return "Found";
                case "boxSearch.progressOf": return "of";
                case "boxSearch.progressRemaining": return "Remaining";
                case "boxSearch.complete": return "Search complete. You can proceed to the next step: relabeling.";
                case "boxSearch.scanInput": return "Scan box number";
                case "boxSearch.empty": return "No boxes to search.";
                case "boxSearch.listTitle": return "Boxes to search:";
                case "boxSearch.collapse": return "Collapse search";
                case "boxSearch.notAllFoundTitle": return "Not all boxes found";
                case "boxSearch.remainingToFind": return "Remaining to find";
                case "boxSearch.collapseShort": return "Collapse";
                case "boxSearch.stay": return "Stay";
                case "boxSearch.noMissing": return "No missing boxes.";
                case "boxSearch.andMore": return "and more";
                case "inventory.placeholder": return "This section is ready as a main menu. Next we will add box scan, product scan, and WMS reconciliation.";
                case "sync.otherOwner": return "The queue was created by another employee. Log in as that employee to sync.";
                case "sync.done": return "Sync finished";
                case "update.alreadyChecking": return "Update check is already running.";
                case "update.noInternet": return "No internet. Cannot check for updates now.";
                case "update.latest": return "Latest version installed";
                case "update.checkFailed": return "Could not check update";
                case "update.available": return "New version available";
                case "update.defaultNotes": return "Press refresh to download and install the APK.";
                case "update.title": return "LOGOff TSD update";
                case "update.later": return "Later";
                case "update.noApk": return "APK is not specified in the update manifest.";
                case "update.allowInstall": return "Allow installs from this app and press refresh again.";
                case "update.downloading": return "Downloading update...";
                case "update.createDirFailed": return "Could not create updates folder.";
                case "update.downloadFailed": return "Could not download update";
                default: return key;
            }
        }
        switch (key) {
            case "common.back": return "Назад";
            case "login.title": return "Вход сотрудника";
            case "login.login": return "Логин";
            case "login.password": return "Пароль";
            case "login.device": return "Код ТСД / места";
            case "login.server": return "Сервер WMS";
            case "login.connect": return "Подключиться к WMS";
            case "menu.receipt": return "Приемка товара";
            case "menu.pick": return "Сборка заявки";
            case "menu.inventory": return "Инвентаризация";
            case "menu.sync": return "Синхронизировать очередь";
            case "menu.settings": return "Настройки";
            case "menu.update": return "Проверить обновление";
            case "menu.exit": return "Выйти";
            case "settings.title": return "Настройки";
            case "settings.note": return "Выберите удобный масштаб интерфейса и язык приложения.";
            case "settings.scale": return "Разрешение / масштаб интерфейса";
            case "settings.scale.recommended": return "Рекомендованное";
            case "settings.scale.compact": return "Желаемое компактное";
            case "settings.scale.large": return "Желаемое крупное";
            case "settings.language": return "Язык";
            case "settings.save": return "Сохранить настройки";
            case "settings.saved": return "Настройки сохранены";
            case "common.backAgainExit": return "Нажмите назад еще раз, чтобы закрыть приложение.";
            case "common.refresh": return "Обновить";
            case "common.client": return "Клиент";
            case "common.city": return "Город";
            case "common.cityMissing": return "город не указан";
            case "common.status": return "Статус";
            case "common.rows": return "строк";
            case "common.box": return "Короб";
            case "common.size": return "Размер";
            case "common.queue": return "Очередь";
            case "common.online": return "Онлайн";
            case "common.offline": return "Офлайн";
            case "common.offlineSaved": return "Офлайн, данные сохраняются на ТСД";
            case "common.employee": return "сотрудник";
            case "common.units": return "шт.";
            case "common.operationError": return "Ошибка операции";
            case "common.operationCreateFailed": return "Не удалось создать операцию";
            case "login.enterCredentials": return "Введите логин и пароль.";
            case "login.noTsdAccess": return "Нет доступа к ТСД. Попросите администратора включить галочку Работа с ТСД в профиле.";
            case "login.connected": return "Сотрудник подключен";
            case "menu.syncFirst": return "Сначала синхронизируйте очередь";
            case "receipt.refreshClients": return "Обновить клиентов";
            case "receipt.start": return "Начать приемку";
            case "receipt.newBox": return "Новый короб";
            case "receipt.noClients": return "Нет доступных клиентов.";
            case "receipt.scanBox": return "Скан номера короба";
            case "receipt.openBox": return "Открыть короб";
            case "receipt.finish": return "Закончить приемку";
            case "receipt.opened": return "открыт.";
            case "receipt.scanProduct": return "Скан товара";
            case "receipt.productBarcode": return "Штрихкод товара";
            case "receipt.acceptBarcode": return "Принять ШК товара";
            case "receipt.closeBox": return "Закрыть короб";
            case "receipt.scanBarcodeToast": return "Сканируйте штрихкод товара.";
            case "receipt.barcodeShort": return "ШК";
            case "receipt.name": return "Наименование";
            case "receipt.article": return "Артикул";
            case "receipt.sizeColor": return "Размер / цвет";
            case "receipt.brand": return "Бренд";
            case "receipt.confirmProduct": return "Проверьте товар";
            case "receipt.confirmYes": return "Да, это этот товар";
            case "receipt.confirmNo": return "Нет, отменить";
            case "receipt.confirmNoManager": return "Нет, позвать менеджера";
            case "receipt.scanKiz": return "Скан КИЗ";
            case "receipt.kiz": return "КИЗ товара";
            case "receipt.saveProduct": return "Записать товар";
            case "receipt.cancelBarcode": return "Отменить ШК";
            case "receipt.scanKizToast": return "Сканируйте КИЗ.";
            case "receipt.kizDuplicate": return "Этот КИЗ уже есть в текущей приемке.";
            case "receipt.productAdded": return "Товар добавлен.";
            case "receipt.boxClosed": return "Короб закрыт";
            case "receipt.closedBox": return "Закрыт короб";
            case "receipt.finished": return "Приемка завершена.";
            case "receipt.currentBoxCount": return "В текущем коробе";
            case "receipt.emptyBox": return "Короб пустой. Сначала добавьте товар.";
            case "receipt.closeBoxConfirm": return "Проверьте короб";
            case "receipt.closeBoxYes": return "Да, закрыть короб";
            case "receipt.recheckBox": return "Перепикать ШК";
            case "receipt.recheckTitle": return "Проверка короба";
            case "receipt.recheckProgress": return "Повторно пропикано";
            case "receipt.recheckAdd": return "Добавить ШК";
            case "receipt.recheckVerify": return "Проверить";
            case "receipt.recheckClear": return "Начать заново";
            case "receipt.recheckCountMismatch": return "Количество не совпало. Позовите менеджера.";
            case "receipt.recheckMismatch": return "Состав товаров не совпал. Позовите менеджера.";
            case "receipt.recheckOk": return "Короб проверен.";
            case "receipt.wrongProduct": return "Товар неверный. Позовите менеджера";
            case "receipt.boxItems": return "Товаров в коробе";
            case "receipt.receiptTotals": return "Коробов / товаров";
            case "receipt.closeCurrentBoxFirst": return "Сначала закройте текущий короб.";
            case "receipt.finishedTitle": return "Приемка закрыта";
            case "receipt.document": return "Документ";
            case "receipt.finishedBoxes": return "Коробов";
            case "receipt.finishedItems": return "Товаров";
            case "receipt.managerTitle": return "Позовите менеджера";
            case "pick.hint": return "Выберите активную заявку. Желтым подсвечены заявки, где уже кто-то работает с ТСД.";
            case "pick.refresh": return "Обновить заявки";
            case "pick.empty": return "Активных заявок пока нет. Нажмите обновить.";
            case "pick.request": return "Заявка";
            case "pick.inWork": return "Уже в работе";
            case "pick.relabel": return "Перемаркировка";
            case "pick.moves": return "Перемещения";
            case "pick.relabelNext": return "Перемаркировка будет открыта следующим шагом.";
            case "pick.movesNext": return "Перемещения будут открыты следующим шагом.";
            case "pick.backToRequests": return "Назад к заявкам";
            case "pick.loaded": return "Заявок загружено";
            case "moves.title": return "Перемещения";
            case "moves.progress": return "Перемещено";
            case "moves.currentTarget": return "Новый короб";
            case "moves.complete": return "Перемещения завершены. Заявка упакована.";
            case "moves.empty": return "Заданий на перемещение нет.";
            case "moves.selectBox": return "Выберите короб для перемещения:";
            case "moves.scanTargetBox": return "Скан ШК нового короба";
            case "moves.setTargetBox": return "Выбрать новый короб";
            case "moves.scanItem": return "Скан ШК товара для перемещения";
            case "moves.products": return "Товары для перемещения:";
            case "moves.nextBox": return "Далее";
            case "moves.finish": return "Закончить перемещения";
            case "moves.scanTargetToast": return "Сканируйте ШК нового короба.";
            case "moves.scanItemToast": return "Сканируйте ШК товара.";
            case "moves.targetOpened": return "Новый короб открыт.";
            case "moves.itemMoved": return "Товар перемещен.";
            case "boxless.mode": return "Клиент хранит товар без складских коробов. Сборка идет только по коробам отгрузки.";
            case "boxless.title": return "Сборка по коробам";
            case "boxless.progress": return "Собрано";
            case "boxless.scanBox": return "Скан ШК короба отгрузки";
            case "boxless.scanItem": return "Скан ШК товара";
            case "boxless.currentBox": return "Открытый короб";
            case "boxless.currentQuantity": return "В коробе";
            case "boxless.closeBox": return "Закрыть короб";
            case "boxless.finish": return "Завершить упаковку";
            case "boxless.closedBoxes": return "Закрытые короба:";
            case "boxless.goods": return "Товары заявки:";
            case "boxless.packed": return "Собрано";
            case "boxless.scanBoxToast": return "Сканируйте ШК короба.";
            case "boxless.scanItemToast": return "Сканируйте ШК товара.";
            case "boxless.boxOpened": return "Короб открыт.";
            case "boxless.itemAdded": return "Товар добавлен в короб.";
            case "boxless.boxClosed": return "Короб закрыт.";
            case "boxless.complete": return "Упаковка завершена. Файлы WB/Ozon готовы.";
            case "stage.searchRequired": return "Сначала завершите поиск всех коробов.";
            case "stage.managerCodeTitle": return "Код менеджера";
            case "stage.managerCodeInput": return "4-значный код";
            case "stage.managerCodeUnlock": return "Открыть этап";
            case "stage.managerCodeCancel": return "Отмена";
            case "stage.managerCodeRejected": return "Код не подошел. Введите еще раз или отмените.";
            case "stage.managerCodeHint": return "Введите 4-значный код менеджера.";
            case "stage.relabelLocked": return "Этап перемаркировки закрыт, пока не завершен поиск коробов. Введите код менеджера или нажмите Отмена.";
            case "stage.movesLocked": return "Этап перемещений закрыт, пока не завершены предыдущие этапы. Введите код менеджера или нажмите Отмена.";
            case "stage.supervisorBypass": return "Этап открыт старшим сотрудником до завершения поиска. Работайте только с уже найденными коробами.";
            case "stage.noFoundBoxes": return "Пока нет найденных коробов.";
            case "stage.foundBoxes": return "Найденные короба:";
            case "stage.relabelTitle": return "Перемаркировка";
            case "stage.movesTitle": return "Перемещения по коробам";
            case "stage.relabelHint": return "Выполняйте перемаркировку по найденным коробам. Если короб еще не найден, сначала просканируйте его в поиске.";
            case "stage.movesHint": return "Выполняйте перемещения только из найденных коробов. Скан перемещения в новый короб будет записываться на следующем экране.";
            case "relabel.progress": return "Перемаркировка";
            case "relabel.complete": return "Перемаркировка завершена. Можно переходить к перемещениям.";
            case "relabel.empty": return "Заданий на перемаркировку нет.";
            case "relabel.selectBox": return "Выберите короб для перемаркировки:";
            case "relabel.scanSource": return "Скан старого ШК";
            case "relabel.boxDone": return "В этом коробе перемаркировка завершена.";
            case "relabel.products": return "Товары для перемаркировки:";
            case "relabel.from": return "Старый ШК";
            case "relabel.to": return "Новый ШК";
            case "relabel.sourceNotFound": return "В этом коробе нет такого ШК для перемаркировки.";
            case "relabel.wrongSource": return "Неправильный товар. Старый ШК не совпадает с заданием перемаркировки.";
            case "relabel.confirmSource": return "Подтвердите товар";
            case "relabel.scanTargetTitle": return "Скан нового ШК";
            case "relabel.scanTarget": return "Новый ШК";
            case "relabel.scanTargetToast": return "Сканируйте новый ШК.";
            case "relabel.itemDone": return "Перемаркировка отмечена.";
            case "relabel.queued": return "Старых ШК в очереди";
            case "relabel.scanSourceBatch": return "Пикайте старые ШК подряд";
            case "relabel.scanTargetBatch": return "Пикайте новые ШК подряд";
            case "relabel.scanTargets": return "Сканировать новые ШК";
            case "relabel.clearQueue": return "Очистить очередь";
            case "relabel.batchSourceAdded": return "Старый ШК добавлен в очередь.";
            case "relabel.batchFull": return "По этому товару уже набрано нужное количество старых ШК.";
            case "relabel.confirmTarget": return "Подтвердите новый ШК";
            case "relabel.wrongTarget": return "Новый ШК не совпадает с заданием перемаркировки.";
            case "relabel.backToSources": return "Назад к старым ШК";
            case "boxSearch.title": return "Поиск коробов";
            case "boxSearch.scanBoxToast": return "Сканируйте номер короба.";
            case "boxSearch.alreadyFound": return "Короб уже найден и больше не участвует в сравнении.";
            case "boxSearch.found": return "Нужный короб найден. Переместите его в зону сборки.";
            case "boxSearch.notNeeded": return "Этот короб не участвует в сборке заявки.";
            case "boxSearch.progressFound": return "Найдено";
            case "boxSearch.progressOf": return "из";
            case "boxSearch.progressRemaining": return "Осталось";
            case "boxSearch.complete": return "Поиск завершен. Можно приступать к следующему этапу: перемаркировка.";
            case "boxSearch.scanInput": return "Скан номера короба";
            case "boxSearch.empty": return "Коробов для поиска нет.";
            case "boxSearch.listTitle": return "Короба для поиска:";
            case "boxSearch.collapse": return "Свернуть поиск";
            case "boxSearch.notAllFoundTitle": return "Найдены не все короба";
            case "boxSearch.remainingToFind": return "Осталось найти";
            case "boxSearch.collapseShort": return "Свернуть";
            case "boxSearch.stay": return "Остаться";
            case "boxSearch.noMissing": return "Недостающих коробов нет.";
            case "boxSearch.andMore": return "и еще";
            case "inventory.placeholder": return "Раздел готов как основное меню. Следующим шагом добавим скан короба, товара и сверку с WMS.";
            case "sync.otherOwner": return "Очередь создана другим сотрудником. Войдите под ним для синхронизации.";
            case "sync.done": return "Синхронизация завершена";
            case "update.alreadyChecking": return "Проверка обновления уже идет.";
            case "update.noInternet": return "Нет интернета. Проверить обновление сейчас нельзя.";
            case "update.latest": return "Установлена последняя версия";
            case "update.checkFailed": return "Не удалось проверить обновление";
            case "update.available": return "Доступна новая версия";
            case "update.defaultNotes": return "Нажмите обновить, чтобы скачать и установить APK.";
            case "update.title": return "Обновление LOGOff TSD";
            case "update.later": return "Позже";
            case "update.noApk": return "В манифесте обновления не указан APK.";
            case "update.allowInstall": return "Разрешите установку из этого приложения и нажмите обновить еще раз.";
            case "update.downloading": return "Скачиваю обновление...";
            case "update.createDirFailed": return "Не удалось создать папку обновлений.";
            case "update.downloadFailed": return "Не удалось скачать обновление";
            default: return key;
        }
    }

    private String text(EditText input) {
        return input.getText().toString().trim();
    }

    private void toast(String text) {
        Toast.makeText(this, text, Toast.LENGTH_LONG).show();
    }

    private boolean isOnline() {
        ConnectivityManager manager = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        NetworkInfo active = manager == null ? null : manager.getActiveNetworkInfo();
        return active != null && active.isConnected();
    }

    private void loadSession() {
        apiUrl = prefs.getString("apiUrl", DEFAULT_API_URL);
        api = new ApiClient(apiUrl);
        token = prefs.getString("token", "");
        userId = prefs.getString("userId", "");
        userName = prefs.getString("userName", "");
        deviceCode = prefs.getString("deviceCode", "TSD-01");
        interfaceMode = prefs.getString("interfaceMode", "recommended");
        language = prefs.getString("language", "ru");
        loadCodes(roleCodes, prefs.getString("roleCodes", ""));
        loadCodes(permissionCodes, prefs.getString("permissionCodes", ""));
    }

    private String normalizeDevice(String value) {
        String normalized = value == null ? "" : value.trim().toUpperCase(Locale.ROOT);
        return normalized.isEmpty() ? "TSD-01" : normalized;
    }

    private static boolean sameScan(String left, String right) {
        return scanKey(left).equals(scanKey(right));
    }

    private static String scanKey(String value) {
        return value == null ? "" : value.trim().toUpperCase(Locale.ROOT);
    }

    private static String newReceiptId() {
        return "TSD-" + System.currentTimeMillis();
    }

    private static String firstNonEmpty(String... values) {
        for (String value : values) {
            if (value != null && !value.trim().isEmpty()) {
                return value;
            }
        }
        return "-";
    }

    private static String compact(String left, String right) {
        String a = left == null ? "" : left.trim();
        String b = right == null ? "" : right.trim();
        if (!a.isEmpty() && !b.isEmpty()) {
            return a + " / " + b;
        }
        return firstNonEmpty(a, b, "-");
    }

    private static boolean canUseTsd(JSONObject user) {
        JSONArray permissions = user.optJSONArray("permissionCodes");
        if (permissions == null) {
            return false;
        }
        for (int i = 0; i < permissions.length(); i++) {
            String code = permissions.optString(i);
            if ("system:admin".equals(code) || "tsd:use".equals(code)) {
                return true;
            }
        }
        return false;
    }

    private void loadAccess(JSONObject user) {
        roleCodes.clear();
        permissionCodes.clear();
        addCodes(roleCodes, user.optJSONArray("roleCodes"));
        addCodes(permissionCodes, user.optJSONArray("permissionCodes"));
    }

    private static void addCodes(HashSet<String> target, JSONArray values) {
        if (values == null) {
            return;
        }
        for (int i = 0; i < values.length(); i++) {
            String code = values.optString(i).trim().toUpperCase(Locale.ROOT);
            if (!code.isEmpty()) {
                target.add(code);
            }
        }
    }

    private static void loadCodes(HashSet<String> target, String value) {
        target.clear();
        String[] parts = (value == null ? "" : value).split(",");
        for (String part : parts) {
            String code = part.trim().toUpperCase(Locale.ROOT);
            if (!code.isEmpty()) {
                target.add(code);
            }
        }
    }

    private static String joinCodes(HashSet<String> values) {
        StringBuilder builder = new StringBuilder();
        for (String value : values) {
            if (builder.length() > 0) {
                builder.append(',');
            }
            builder.append(value);
        }
        return builder.toString();
    }

    private boolean hasStageControl() {
        return permissionCodes.contains("SYSTEM:ADMIN")
            || roleCodes.contains("OWNER")
            || roleCodes.contains("ADMIN")
            || roleCodes.contains("MANAGER");
    }

    private boolean isStageLockedError(Exception error) {
        String message = error.getMessage();
        return message != null && message.startsWith("TSD_STAGE_LOCKED|");
    }

    private String stageLockMessage(Exception error, String fallbackStage) {
        String message = error.getMessage();
        if (message == null || !message.startsWith("TSD_STAGE_LOCKED|")) {
            return stageDefaultLockMessage(fallbackStage);
        }
        String[] parts = message.split("\\|", 3);
        if (parts.length >= 3 && !parts[2].trim().isEmpty()) {
            return parts[2].trim();
        }
        if (parts.length >= 2 && !parts[1].trim().isEmpty()) {
            return stageDefaultLockMessage(parts[1].trim());
        }
        return stageDefaultLockMessage(fallbackStage);
    }

    private String stageDefaultLockMessage(String stage) {
        return "moves".equals(stage) ? tr("stage.movesLocked") : tr("stage.relabelLocked");
    }

    private String activeWorkersLabel(JSONArray workers) {
        if (workers == null || workers.length() == 0) {
            return "";
        }
        ArrayList<String> labels = new ArrayList<>();
        for (int i = 0; i < workers.length(); i++) {
            JSONObject worker = workers.optJSONObject(i);
            if (worker == null) {
                continue;
            }
            String name = firstNonEmpty(worker.optString("userName"), tr("common.employee"));
            String device = firstNonEmpty(worker.optString("deviceCode"), "ТСД");
            String stage = firstNonEmpty(worker.optString("stage"), tr("pick.inWork").toLowerCase(Locale.ROOT));
            labels.add(name + " / " + device + " / " + stage);
        }
        StringBuilder builder = new StringBuilder();
        for (String label : labels) {
            if (builder.length() > 0) {
                builder.append("; ");
            }
            builder.append(label);
        }
        return builder.toString();
    }

    private interface Job {
        void run() throws Exception;
    }

    private static final class Choice {
        final String value;
        final String label;

        Choice(String value, String label) {
            this.value = value;
            this.label = label;
        }

        @Override
        public String toString() {
            return label;
        }
    }

    private static final class Client {
        final String id;
        final String name;

        Client(String id, String name) {
            this.id = id;
            this.name = name == null || name.isEmpty() ? id : name;
        }

        @Override
        public String toString() {
            return name;
        }
    }

    private static final class ReceiptSku {
        final String barcode;
        final String internalSku;
        final String clientSku;
        final String article;
        final String name;
        final String color;
        final String size;
        final String brand;
        final String photoUrl;
        final ArrayList<String> characteristics;

        ReceiptSku(
            String barcode,
            String internalSku,
            String clientSku,
            String article,
            String name,
            String color,
            String size,
            String brand,
            String photoUrl,
            ArrayList<String> characteristics
        ) {
            this.barcode = barcode == null ? "" : barcode;
            this.internalSku = internalSku == null ? "" : internalSku;
            this.clientSku = clientSku == null ? "" : clientSku;
            this.article = article == null ? "" : article;
            this.name = name == null ? "" : name;
            this.color = color == null ? "" : color;
            this.size = size == null ? "" : size;
            this.brand = brand == null ? "" : brand;
            this.photoUrl = photoUrl == null ? "" : photoUrl;
            this.characteristics = characteristics;
        }

        static ReceiptSku fromJson(String barcode, JSONObject sku) {
            ArrayList<String> characteristics = new ArrayList<>();
            JSONArray rows = sku.optJSONArray("marketplaceCharacteristics");
            if (rows != null) {
                for (int i = 0; i < rows.length() && characteristics.size() < 5; i++) {
                    JSONObject row = rows.optJSONObject(i);
                    if (row == null) {
                        continue;
                    }
                    String name = row.optString("name", "").trim();
                    String value = row.optString("value", "").trim();
                    if (!name.isEmpty() && !value.isEmpty()) {
                        characteristics.add(name + ": " + value);
                    }
                }
            }

            JSONArray photos = sku.optJSONArray("marketplacePhotos");
            String photoUrl = photos != null && photos.length() > 0 ? photos.optString(0, "") : "";
            return new ReceiptSku(
                barcode,
                sku.optString("internalSku", ""),
                sku.optString("clientSku", ""),
                sku.optString("article", ""),
                sku.optString("name", ""),
                sku.optString("color", ""),
                sku.optString("size", ""),
                sku.optString("brand", ""),
                photoUrl,
                characteristics
            );
        }

        String shortLabel() {
            String articleText = !article.isEmpty() ? article : (!clientSku.isEmpty() ? clientSku : internalSku);
            String details = MainActivity.compact(size, color);
            return name + (articleText.isEmpty() ? "" : " · " + articleText) + ("-".equals(details) ? "" : " · " + details);
        }
    }

    private static final class ReceiptLine {
        final String boxCode;
        final String barcode;
        final String kiz;
        final ReceiptSku sku;

        ReceiptLine(String boxCode, String barcode, String kiz, ReceiptSku sku) {
            this.boxCode = boxCode == null ? "" : boxCode;
            this.barcode = barcode == null ? "" : barcode;
            this.kiz = kiz == null ? "" : kiz;
            this.sku = sku;
        }

        String label() {
            return sku == null ? barcode : sku.shortLabel();
        }
    }

    private static final class ReceiptBoxSummary {
        final String boxCode;
        final int itemsCount;
        final String summaryText;

        ReceiptBoxSummary(String boxCode, int itemsCount, String summaryText) {
            this.boxCode = boxCode == null ? "" : boxCode;
            this.itemsCount = itemsCount;
            this.summaryText = summaryText == null ? "" : summaryText;
        }
    }

    private static final class ProductCounter {
        final String barcode;
        final String label;
        int quantity;

        ProductCounter(ReceiptLine line) {
            this.barcode = line.barcode;
            this.label = line.label();
            this.quantity = 0;
        }
    }

    private static final class PickRequest {
        final String id;
        final String title;
        final String status;
        final String city;
        final String clientName;
        final boolean storesWithoutBoxes;
        final int itemsCount;
        final int activeWorkersCount;
        final String activeWorkersText;

        PickRequest(
            String id,
            String title,
            String status,
            String city,
            String clientName,
            boolean storesWithoutBoxes,
            int itemsCount,
            int activeWorkersCount,
            String activeWorkersText
        ) {
            this.id = id == null ? "" : id;
            this.title = title == null ? "" : title;
            this.status = status == null ? "" : status;
            this.city = city == null ? "" : city;
            this.clientName = clientName == null || clientName.isEmpty() ? "-" : clientName;
            this.storesWithoutBoxes = storesWithoutBoxes;
            this.itemsCount = itemsCount;
            this.activeWorkersCount = activeWorkersCount;
            this.activeWorkersText = activeWorkersText == null ? "" : activeWorkersText;
        }

        String shortNumber() {
            if (!title.trim().isEmpty()) {
                return title.trim();
            }
            return id.length() > 8 ? id.substring(0, 8) : id;
        }

        String label(String cityMissing, String inWorkLabel) {
            String base = shortNumber() + "\n" + clientName + " · " + firstNonEmpty(city, cityMissing);
            if (!hasActiveWorkers()) {
                return base;
            }
            return base + "\n" + inWorkLabel + ": " + activeWorkersText;
        }

        boolean hasActiveWorkers() {
            return activeWorkersCount > 0 && !activeWorkersText.isEmpty();
        }
    }
}
