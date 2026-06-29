package pro.logoff.wms.tsd;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.ConnectivityManager;
import android.net.NetworkInfo;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.Editable;
import android.text.InputType;
import android.text.TextWatcher;
import android.view.Gravity;
import android.view.inputmethod.EditorInfo;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Spinner;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MainActivity extends Activity {
    private static final String DEFAULT_API_URL = "https://wms.logoff.pro/api/v1";
    private static final int RED = Color.rgb(180, 0, 18);
    private static final int BG = Color.rgb(247, 244, 241);

    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ArrayList<Client> clients = new ArrayList<>();
    private final ArrayList<PickRequest> pickRequests = new ArrayList<>();
    private final HashSet<String> confirmedBarcodes = new HashSet<>();
    private final HashSet<String> receiptKiz = new HashSet<>();

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
    private String receiptId = newReceiptId();
    private String boxCode = "";
    private String pendingBarcode = "";
    private boolean boxSearchScanBusy = false;
    private String lastBoxSearchScanCode = "";
    private long lastBoxSearchScanAtMs = 0L;

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
            } else {
                showMenu();
                loadClients();
                syncQueue();
            }
        }, 700);
    }

    private void showSplash() {
        LinearLayout root = page();
        root.setGravity(Gravity.CENTER);
        TextView logo = new TextView(this);
        logo.setText("LOGOff");
        logo.setTextColor(Color.WHITE);
        logo.setTextSize(30);
        logo.setGravity(Gravity.CENTER);
        logo.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        logo.setBackgroundColor(RED);
        root.addView(logo, new LinearLayout.LayoutParams(dp(150), dp(150)));
        setContentView(root);
    }

    private void showLogin() {
        LinearLayout root = page();
        root.setPadding(dp(18), dp(24), dp(18), dp(18));
        addLogo(root, false);
        addTitle(root, "Вход сборщицы");

        EditText login = input("Логин", false);
        login.setText(prefs.getString("login", ""));
        EditText password = input("Пароль", true);
        EditText device = input("Код ТСД / места", false);
        device.setText(deviceCode);
        EditText server = input("Сервер WMS", false);
        server.setText(apiUrl);

        Button button = primary("Подключиться к WMS");
        button.setOnClickListener(v -> {
            apiUrl = text(server);
            api = new ApiClient(apiUrl);
            login(login.getText().toString(), password.getText().toString(), device.getText().toString());
        });

        root.addView(login);
        root.addView(password);
        root.addView(device);
        root.addView(server);
        root.addView(button);
        setContentView(wrap(root));
    }

    private void login(String login, String password, String device) {
        if (login.trim().isEmpty() || password.trim().isEmpty()) {
            toast("Введите логин и пароль.");
            return;
        }
        runAsync(() -> {
            JSONObject response = api.login(login.trim(), password);
            JSONObject user = response.getJSONObject("user");
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
                .apply();
            main.post(() -> {
                toast("Сборщик " + userName + " подключен.");
                showMenu();
                loadClients();
                syncQueue();
            });
        });
    }

    private void showMenu() {
        LinearLayout root = page();
        root.setPadding(dp(14), dp(16), dp(14), dp(14));
        addHeader(root);
        addStatus(root);

        Button receipt = primary("Приемка товара");
        receipt.setTextSize(22);
        receipt.setMinHeight(dp(86));
        receipt.setOnClickListener(v -> showReceiptStart());
        root.addView(receipt);

        Button pick = primary("Сборка заявки");
        pick.setTextSize(22);
        pick.setMinHeight(dp(86));
        pick.setOnClickListener(v -> showPickRequests());
        root.addView(pick);

        Button inventory = primary("Инвентаризация");
        inventory.setTextSize(22);
        inventory.setMinHeight(dp(86));
        inventory.setOnClickListener(v -> showInventoryMenu());
        root.addView(inventory);

        Button sync = secondary("Синхронизировать очередь (" + queue.size() + ")");
        sync.setOnClickListener(v -> syncQueue());
        root.addView(sync);

        Button exit = secondary("Выйти");
        exit.setOnClickListener(v -> {
            if (queue.size() > 0) {
                toast("Сначала синхронизируйте очередь: " + queue.size());
                return;
            }
            prefs.edit().remove("token").remove("userId").remove("userName").apply();
            token = "";
            showLogin();
        });
        root.addView(exit);
        setContentView(wrap(root));
    }

    private void showReceiptStart() {
        LinearLayout root = page();
        root.setPadding(dp(14), dp(16), dp(14), dp(14));
        addHeader(root);
        addTitle(root, "Приемка товара");

        Spinner spinner = new Spinner(this);
        ArrayAdapter<Client> adapter = new ArrayAdapter<>(this, android.R.layout.simple_spinner_dropdown_item, clients);
        spinner.setAdapter(adapter);
        root.addView(spinner, matchWrap());

        Button refresh = secondary("Обновить клиентов");
        refresh.setOnClickListener(v -> loadClients());
        root.addView(refresh);

        Button start = primary("Новый короб");
        start.setOnClickListener(v -> {
            if (clients.isEmpty()) {
                toast("Нет доступных клиентов.");
                return;
            }
            Client selected = (Client) spinner.getSelectedItem();
            selectedClientId = selected.id;
            selectedClientName = selected.name;
            showBoxScan();
        });
        root.addView(start);

        Button back = secondary("Назад");
        back.setOnClickListener(v -> showMenu());
        root.addView(back);
        setContentView(wrap(root));
    }

    private void showPickRequests() {
        LinearLayout root = page();
        root.setPadding(dp(14), dp(16), dp(14), dp(14));
        addHeader(root);
        addTitle(root, "Сборка заявки");
        root.addView(note("Выберите активную заявку. В списке видно номер, клиента и город."));

        Button refresh = secondary("Обновить заявки");
        refresh.setOnClickListener(v -> loadPickRequests(true));
        root.addView(refresh);

        if (pickRequests.isEmpty()) {
            root.addView(note("Активных заявок пока нет. Нажмите обновить."));
        }

        for (PickRequest request : pickRequests) {
            Button item = secondary(request.label());
            item.setGravity(Gravity.LEFT | Gravity.CENTER_VERTICAL);
            item.setOnClickListener(v -> showPickRequestActions(request));
            root.addView(item);
        }

        Button back = secondary("Назад");
        back.setOnClickListener(v -> showMenu());
        root.addView(back);
        setContentView(wrap(root));
        if (pickRequests.isEmpty()) {
            loadPickRequests(false);
        }
    }

    private void showPickRequestActions(PickRequest request) {
        LinearLayout root = page();
        root.setPadding(dp(14), dp(16), dp(14), dp(14));
        addHeader(root);
        addTitle(root, "Заявка " + request.shortNumber());
        root.addView(note("Клиент: " + request.clientName));
        root.addView(note("Город: " + firstNonEmpty(request.city, "-")));
        root.addView(note("Статус: " + request.status + " · строк: " + request.itemsCount));

        Button boxes = primary("1. Поиск коробов");
        boxes.setOnClickListener(v -> loadBoxSearch(request));
        root.addView(boxes);

        Button relabel = primary("2. Перемаркировка");
        relabel.setOnClickListener(v -> toast("Перемаркировка будет открыта следующим шагом."));
        root.addView(relabel);

        Button moves = primary("3. Перемещения");
        moves.setOnClickListener(v -> toast("Перемещения будут открыты следующим шагом."));
        root.addView(moves);

        Button back = secondary("Назад к заявкам");
        back.setOnClickListener(v -> showPickRequests());
        root.addView(back);
        setContentView(wrap(root));
    }

    private void loadBoxSearch(PickRequest request) {
        runAsync(() -> {
            JSONObject state = api.boxSearch(token, request.id);
            main.post(() -> showBoxSearch(request, state));
        });
    }

    private void scanBoxForRequest(PickRequest request, String boxCode) {
        String normalized = boxCode.trim();
        if (normalized.isEmpty()) {
            toast("Сканируйте номер короба.");
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
                JSONObject state = api.scanBoxSearch(token, request.id, normalized);
                JSONObject lastScan = state.optJSONObject("lastScan");
                main.post(() -> {
                    boolean foundNow = lastScan != null && lastScan.optBoolean("matched");
                    if (lastScan != null && lastScan.optBoolean("alreadyFound")) {
                        toast("Короб уже найден и больше не участвует в сравнении.");
                    } else if (foundNow) {
                        toast("Нужный короб найден. Переместите его в зону сборки.");
                    } else {
                        toast("Этот короб не участвует в сборке заявки.");
                    }
                    showBoxSearch(request, state, foundNow);
                });
            } finally {
                main.post(() -> boxSearchScanBusy = false);
            }
        });
    }

    private void showBoxSearch(PickRequest request, JSONObject state) {
        showBoxSearch(request, state, false);
    }

    private void showBoxSearch(PickRequest request, JSONObject state, boolean flashGreen) {
        LinearLayout root = page();
        if (flashGreen) {
            root.setBackgroundColor(Color.rgb(12, 128, 72));
        }
        root.setPadding(dp(14), dp(16), dp(14), dp(14));
        addHeader(root);
        addTitle(root, "Поиск коробов");
        root.addView(note("Заявка: " + request.shortNumber()));
        root.addView(note("Клиент: " + request.clientName + " · город: " + firstNonEmpty(request.city, "-")));

        int found = state.optInt("found");
        int total = state.optInt("total");
        int remaining = state.optInt("remaining");
        boolean complete = state.optBoolean("isComplete");
        root.addView(note("Найдено " + found + " из " + total + ". Осталось: " + remaining));
        if (complete) {
            TextView done = note("Поиск завершен. Можно приступать к следующему этапу: перемаркировка.");
            done.setTextColor(Color.rgb(12, 128, 72));
            root.addView(done);
        }

        EditText scan = input("Скан номера короба", false);
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
            root.addView(note("Коробов для поиска нет."));
        } else {
            root.addView(note("Короба для поиска:"));
            for (int i = 0; i < boxes.length(); i++) {
                JSONObject box = boxes.optJSONObject(i);
                if (box == null) {
                    continue;
                }
                TextView row = note(box.optString("code"));
                row.setTextSize(20);
                row.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
                row.setPadding(dp(12), dp(12), dp(12), dp(12));
                LinearLayout.LayoutParams params = matchWrap();
                params.setMargins(0, dp(4), 0, dp(4));
                row.setLayoutParams(params);
                if (box.optBoolean("found")) {
                    row.setText("✓ " + box.optString("code"));
                    row.setTextColor(Color.WHITE);
                    row.setBackgroundColor(Color.rgb(12, 128, 72));
                } else {
                    row.setTextColor(Color.rgb(45, 38, 38));
                    row.setBackgroundColor(Color.WHITE);
                }
                root.addView(row);
            }
        }

        Button refresh = secondary("Обновить");
        refresh.setOnClickListener(v -> loadBoxSearch(request));
        root.addView(refresh);

        Button collapse = secondary("Свернуть поиск");
        collapse.setOnClickListener(v -> leaveBoxSearch(request, state));
        root.addView(collapse);
        setContentView(wrap(root));
        if (flashGreen) {
            main.postDelayed(() -> root.setBackgroundColor(BG), 450);
        }
        scan.requestFocus();
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
            .setTitle("Найдены не все короба")
            .setMessage("Осталось найти: " + remaining + "\n\n" + missingBoxesText(state))
            .setPositiveButton("Свернуть", (dialog, which) -> showPickRequestActions(request))
            .setNegativeButton("Остаться", null)
            .show();
    }

    private String missingBoxesText(JSONObject state) {
        JSONArray missing = state.optJSONArray("missingBoxes");
        if (missing == null || missing.length() == 0) {
            return "Недостающих коробов нет.";
        }
        StringBuilder builder = new StringBuilder();
        for (int i = 0; i < missing.length(); i++) {
            if (i > 0) {
                builder.append('\n');
            }
            builder.append("• ").append(missing.optString(i));
            if (i >= 29 && missing.length() > 30) {
                builder.append('\n').append("и еще ").append(missing.length() - 30);
                break;
            }
        }
        return builder.toString();
    }

    private void showInventoryMenu() {
        LinearLayout root = page();
        root.setPadding(dp(14), dp(16), dp(14), dp(14));
        addHeader(root);
        addTitle(root, "Инвентаризация");
        root.addView(note("Раздел готов как основное меню. Следующим шагом добавим скан короба, товара и сверку с WMS."));
        Button back = secondary("Назад");
        back.setOnClickListener(v -> showMenu());
        root.addView(back);
        setContentView(wrap(root));
    }

    private void showBoxScan() {
        boxCode = "";
        pendingBarcode = "";
        LinearLayout root = receiptPage("Новый короб");
        EditText box = input("Скан номера короба", false);
        box.setSingleLine(true);
        box.setImeOptions(EditorInfo.IME_ACTION_DONE);
        box.setOnEditorActionListener((v, actionId, event) -> {
            openBox(text(box));
            return true;
        });
        Button open = primary("Открыть короб");
        open.setOnClickListener(v -> openBox(text(box)));
        root.addView(box);
        root.addView(open);
        if (queue.size() > 0 || !receiptKiz.isEmpty()) {
            Button finish = secondary("Закончить приемку");
            finish.setOnClickListener(v -> finishReceipt());
            root.addView(finish);
        }
        setContentView(wrap(root));
        box.requestFocus();
    }

    private void openBox(String value) {
        String normalized = value.trim();
        if (normalized.isEmpty()) {
            toast("Сканируйте номер короба.");
            return;
        }
        boxCode = normalized;
        toast("Короб " + boxCode + " открыт.");
        showBarcodeScan();
    }

    private void showBarcodeScan() {
        LinearLayout root = receiptPage("Скан товара");
        TextView box = note("Короб: " + boxCode);
        root.addView(box);
        EditText barcode = input("Штрихкод товара", false);
        barcode.setSingleLine(true);
        barcode.setImeOptions(EditorInfo.IME_ACTION_DONE);
        barcode.setOnEditorActionListener((v, actionId, event) -> {
            scanBarcode(text(barcode));
            return true;
        });
        Button accept = primary("Принять ШК товара");
        accept.setOnClickListener(v -> scanBarcode(text(barcode)));
        root.addView(barcode);
        root.addView(accept);
        Button close = secondary("Закрыть короб");
        close.setOnClickListener(v -> showBoxClosed());
        root.addView(close);
        setContentView(wrap(root));
        barcode.requestFocus();
    }

    private void scanBarcode(String value) {
        String barcode = value.trim();
        if (barcode.isEmpty()) {
            toast("Сканируйте штрихкод товара.");
            return;
        }
        if (confirmedBarcodes.contains(barcode)) {
            pendingBarcode = barcode;
            showKizScan();
            return;
        }
        runAsync(() -> {
            JSONObject sku = api.skuByBarcode(token, selectedClientId, barcode);
            main.post(() -> showSkuConfirm(barcode, sku));
        });
    }

    private void showSkuConfirm(String barcode, JSONObject sku) {
        String text = "ШК: " + barcode
            + "\nНаименование: " + sku.optString("name", "-")
            + "\nАртикул: " + firstNonEmpty(sku.optString("article"), sku.optString("clientSku"), sku.optString("internalSku"), "-")
            + "\nРазмер / цвет: " + compact(sku.optString("size"), sku.optString("color"))
            + "\nБренд: " + firstNonEmpty(sku.optString("brand"), "-");
        new AlertDialog.Builder(this)
            .setTitle("Проверьте товар")
            .setMessage(text)
            .setPositiveButton("Да, это этот товар", (dialog, which) -> {
                confirmedBarcodes.add(barcode);
                pendingBarcode = barcode;
                showKizScan();
            })
            .setNegativeButton("Нет, отменить", (dialog, which) -> showBarcodeScan())
            .show();
    }

    private void showKizScan() {
        LinearLayout root = receiptPage("Скан КИЗ");
        root.addView(note("Короб: " + boxCode));
        root.addView(note("ШК товара: " + pendingBarcode));
        EditText kiz = input("КИЗ товара", false);
        kiz.setSingleLine(true);
        kiz.setImeOptions(EditorInfo.IME_ACTION_DONE);
        kiz.setOnEditorActionListener((v, actionId, event) -> {
            saveKiz(text(kiz));
            return true;
        });
        Button save = primary("Записать товар");
        save.setOnClickListener(v -> saveKiz(text(kiz)));
        root.addView(kiz);
        root.addView(save);
        Button cancel = secondary("Отменить ШК");
        cancel.setOnClickListener(v -> {
            pendingBarcode = "";
            showBarcodeScan();
        });
        root.addView(cancel);
        setContentView(wrap(root));
        kiz.requestFocus();
    }

    private void saveKiz(String value) {
        String kiz = value.trim();
        if (kiz.isEmpty()) {
            toast("Сканируйте КИЗ.");
            return;
        }
        if (receiptKiz.contains(kiz)) {
            toast("Этот КИЗ уже есть в текущей приемке.");
            return;
        }
        try {
            JSONObject operation = receiptOperation(kiz);
            queue.add(operation, userId);
            receiptKiz.add(kiz);
            toast("Товар добавлен. В очереди: " + queue.size());
            pendingBarcode = "";
            syncQueue();
            showBarcodeScan();
        } catch (JSONException error) {
            toast("Не удалось создать операцию: " + error.getMessage());
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

    private void showBoxClosed() {
        LinearLayout root = receiptPage("Короб закрыт");
        root.addView(note("Закрыт короб: " + boxCode));
        Button next = primary("Новый короб");
        next.setOnClickListener(v -> showBoxScan());
        Button finish = secondary("Закончить приемку");
        finish.setOnClickListener(v -> finishReceipt());
        root.addView(next);
        root.addView(finish);
        setContentView(wrap(root));
    }

    private void finishReceipt() {
        confirmedBarcodes.clear();
        receiptKiz.clear();
        receiptId = newReceiptId();
        boxCode = "";
        pendingBarcode = "";
        syncQueue();
        toast("Приемка завершена.");
        showMenu();
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
                next.add(new PickRequest(
                    item.optString("id"),
                    item.optString("title"),
                    item.optString("status"),
                    item.optString("destinationCity"),
                    client == null ? "" : client.optString("name"),
                    count == null ? 0 : count.optInt("items")
                ));
            }
            main.post(() -> {
                pickRequests.clear();
                pickRequests.addAll(next);
                if (showResultToast) {
                    toast("Заявок загружено: " + pickRequests.size());
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
            toast("Очередь создана другим сборщиком. Войдите под ним для синхронизации.");
            return;
        }
        runAsync(() -> {
            JSONArray results = api.sync(token, queue.all());
            queue.removeKeys(results);
            main.post(() -> toast("Синхронизация завершена. В очереди: " + queue.size()));
        });
    }

    private void runAsync(Job job) {
        io.execute(() -> {
            try {
                job.run();
            } catch (Exception error) {
                main.post(() -> toast(error.getMessage() == null ? "Ошибка операции." : error.getMessage()));
            }
        });
    }

    private LinearLayout receiptPage(String title) {
        LinearLayout root = page();
        root.setPadding(dp(14), dp(16), dp(14), dp(14));
        addHeader(root);
        addTitle(root, title);
        root.addView(note("Клиент: " + selectedClientName));
        root.addView(note(isOnline() ? "Онлайн" : "Офлайн, данные сохраняются на ТСД"));
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
        logo.setText("LOGOff");
        logo.setTextColor(Color.WHITE);
        logo.setGravity(Gravity.CENTER);
        logo.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        logo.setTextSize(compact ? 13 : 30);
        logo.setBackgroundColor(RED);
        int size = compact ? dp(48) : dp(132);
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(size, compact ? dp(48) : dp(92));
        params.setMargins(0, 0, compact ? dp(10) : 0, dp(12));
        root.addView(logo, params);
    }

    private void addTitle(LinearLayout root, String title) {
        TextView view = new TextView(this);
        view.setText(title);
        view.setTextSize(24);
        view.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        view.setTextColor(Color.rgb(35, 30, 30));
        view.setPadding(0, dp(10), 0, dp(12));
        root.addView(view, matchWrap());
    }

    private void addStatus(LinearLayout root) {
        root.addView(note((isOnline() ? "Онлайн" : "Офлайн") + " · очередь: " + queue.size()));
    }

    private EditText input(String hint, boolean password) {
        EditText input = new EditText(this);
        input.setHint(hint);
        input.setTextSize(20);
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
        view.setTextSize(16);
        view.setTextColor(Color.rgb(62, 54, 54));
        view.setPadding(0, dp(4), 0, dp(8));
        return view;
    }

    private Button primary(String text) {
        Button button = new Button(this);
        button.setText(text);
        button.setTextColor(Color.WHITE);
        button.setTextSize(18);
        button.setAllCaps(false);
        button.setBackgroundColor(RED);
        button.setMinHeight(dp(58));
        button.setLayoutParams(buttonParams());
        return button;
    }

    private Button secondary(String text) {
        Button button = new Button(this);
        button.setText(text);
        button.setTextSize(17);
        button.setAllCaps(false);
        button.setMinHeight(dp(54));
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
    }

    private String normalizeDevice(String value) {
        String normalized = value == null ? "" : value.trim().toUpperCase(Locale.ROOT);
        return normalized.isEmpty() ? "TSD-01" : normalized;
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

    private interface Job {
        void run() throws Exception;
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

    private static final class PickRequest {
        final String id;
        final String title;
        final String status;
        final String city;
        final String clientName;
        final int itemsCount;

        PickRequest(String id, String title, String status, String city, String clientName, int itemsCount) {
            this.id = id == null ? "" : id;
            this.title = title == null ? "" : title;
            this.status = status == null ? "" : status;
            this.city = city == null ? "" : city;
            this.clientName = clientName == null || clientName.isEmpty() ? "-" : clientName;
            this.itemsCount = itemsCount;
        }

        String shortNumber() {
            if (!title.trim().isEmpty()) {
                return title.trim();
            }
            return id.length() > 8 ? id.substring(0, 8) : id;
        }

        String label() {
            return shortNumber() + "\n" + clientName + " · " + firstNonEmpty(city, "город не указан");
        }
    }
}
