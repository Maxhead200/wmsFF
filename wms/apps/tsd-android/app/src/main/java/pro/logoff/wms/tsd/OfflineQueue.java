package pro.logoff.wms.tsd;

import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

final class OfflineQueue {
    private static final String KEY_QUEUE = "queue";
    private static final String KEY_OWNER = "queueOwnerUserId";

    private final SharedPreferences prefs;

    OfflineQueue(SharedPreferences prefs) {
        this.prefs = prefs;
    }

    JSONArray all() {
        try {
            return new JSONArray(prefs.getString(KEY_QUEUE, "[]"));
        } catch (JSONException ignored) {
            return new JSONArray();
        }
    }

    int size() {
        return all().length();
    }

    String ownerUserId() {
        return prefs.getString(KEY_OWNER, "");
    }

    void add(JSONObject operation, String userId) throws JSONException {
        JSONArray next = all();
        next.put(operation);
        prefs.edit()
            .putString(KEY_QUEUE, next.toString())
            .putString(KEY_OWNER, userId)
            .apply();
    }

    void removeKeys(JSONArray results) throws JSONException {
        JSONArray current = all();
        java.util.HashSet<String> done = new java.util.HashSet<>();
        for (int i = 0; i < results.length(); i++) {
            done.add(results.getJSONObject(i).optString("operationKey"));
        }

        JSONArray next = new JSONArray();
        for (int i = 0; i < current.length(); i++) {
            JSONObject operation = current.getJSONObject(i);
            if (!done.contains(operation.optString("operationKey"))) {
                next.put(operation);
            }
        }

        SharedPreferences.Editor editor = prefs.edit().putString(KEY_QUEUE, next.toString());
        if (next.length() == 0) {
            editor.remove(KEY_OWNER);
        }
        editor.apply();
    }
}
