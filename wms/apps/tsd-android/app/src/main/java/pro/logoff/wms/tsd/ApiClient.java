package pro.logoff.wms.tsd;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URLEncoder;
import java.net.URL;
import java.nio.charset.StandardCharsets;

final class ApiClient {
    private final String baseUrl;

    ApiClient(String baseUrl) {
        this.baseUrl = trimSlash(baseUrl);
    }

    JSONObject login(String login, String password) throws IOException, JSONException {
        JSONObject body = new JSONObject()
            .put("email", login)
            .put("password", password);
        return new JSONObject(request("POST", "/auth/login", null, body.toString()));
    }

    JSONArray clients(String token) throws IOException, JSONException {
        return new JSONArray(request("GET", "/tsd/clients", token, null));
    }

    JSONArray activeRequests(String token) throws IOException, JSONException {
        return new JSONArray(request("GET", "/tsd/requests/active", token, null));
    }

    JSONObject boxSearch(String token, String requestId, String deviceCode) throws IOException, JSONException {
        String path = "/tsd/requests/" + enc(requestId) + "/box-search?deviceCode=" + enc(deviceCode);
        return new JSONObject(request("GET", path, token, null));
    }

    JSONObject scanBoxSearch(String token, String requestId, String boxCode, String deviceCode) throws IOException, JSONException {
        JSONObject body = new JSONObject()
            .put("boxCode", boxCode)
            .put("deviceCode", deviceCode);
        return new JSONObject(request("POST", "/tsd/requests/" + enc(requestId) + "/box-search/scan", token, body.toString()));
    }

    JSONObject skuByBarcode(String token, String clientId, String barcode) throws IOException, JSONException {
        String path = "/tsd/sku-by-barcode?clientId=" + enc(clientId) + "&barcode=" + enc(barcode);
        return new JSONObject(request("GET", path, token, null));
    }

    JSONArray sync(String token, JSONArray operations) throws IOException, JSONException {
        JSONObject body = new JSONObject()
            .put("operations", operations)
            .put("deviceClock", new java.util.Date().toInstant().toString());
        return new JSONArray(request("POST", "/tsd/sync", token, body.toString()));
    }

    private String request(String method, String path, String token, String body) throws IOException {
        HttpURLConnection connection = (HttpURLConnection) new URL(baseUrl + path).openConnection();
        connection.setRequestMethod(method);
        connection.setConnectTimeout(12000);
        connection.setReadTimeout(20000);
        connection.setRequestProperty("Accept", "application/json");
        connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
        connection.setRequestProperty("User-Agent", "LOGOff-TSD-Android/0.1.4");
        if (token != null && !token.isEmpty()) {
            connection.setRequestProperty("Authorization", "Bearer " + token);
        }
        if (body != null) {
            connection.setDoOutput(true);
            try (OutputStream output = connection.getOutputStream()) {
                output.write(body.getBytes(StandardCharsets.UTF_8));
            }
        }

        int code = connection.getResponseCode();
        String response = read(code >= 400 ? connection.getErrorStream() : connection.getInputStream());
        if (code >= 400) {
            throw new IOException(errorText(response, code));
        }
        return response;
    }

    private static String read(InputStream stream) throws IOException {
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

    private static String errorText(String response, int code) {
        try {
            JSONObject json = new JSONObject(response);
            Object message = json.opt("message");
            if (message instanceof JSONArray) {
                return ((JSONArray) message).join(", ");
            }
            if (message != null) {
                return String.valueOf(message);
            }
        } catch (JSONException ignored) {
        }
        return "Ошибка WMS: HTTP " + code;
    }

    private static String enc(String value) throws IOException {
        return URLEncoder.encode(value, StandardCharsets.UTF_8.name());
    }

    private static String trimSlash(String value) {
        String trimmed = value == null ? "" : value.trim();
        while (trimmed.endsWith("/")) {
            trimmed = trimmed.substring(0, trimmed.length() - 1);
        }
        return trimmed.isEmpty() ? "https://wms.logoff.pro/api/v1" : trimmed;
    }
}
