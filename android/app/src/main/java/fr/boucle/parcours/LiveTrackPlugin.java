package fr.boucle.parcours;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Écran verrouillé pendant le suivi (comme Strava) : l'app envoie les chiffres de la sortie, le service au
 * premier plan les montre dans une notification permanente (chrono qui tourne, distance, allure, restant,
 * barre de progression, boutons Pause et Terminer) et garde le GPS actif écran éteint.
 */
@CapacitorPlugin(name = "BoucleLive")
public class LiveTrackPlugin extends Plugin {

    private static LiveTrackPlugin instance;

    @Override
    public void load() {
        instance = this;
    }

    @PluginMethod
    public void start(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 33
                && ContextCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
                && getActivity() != null) {
            ActivityCompat.requestPermissions(getActivity(), new String[] { Manifest.permission.POST_NOTIFICATIONS }, 4243);
        }
        send(call, LiveTrackService.ACTION_SHOW);
    }

    @PluginMethod
    public void update(PluginCall call) {
        send(call, LiveTrackService.ACTION_SHOW);
    }

    @PluginMethod
    public void end(PluginCall call) {
        getContext().stopService(new Intent(getContext(), LiveTrackService.class));
        call.resolve();
    }

    private void send(PluginCall call, String action) {
        Intent i = new Intent(getContext(), LiveTrackService.class).setAction(action);
        i.putExtra("title", call.getString("title", "Boucle"));
        i.putExtra("distance", call.getString("distance", ""));
        i.putExtra("metricLabel", call.getString("metricLabel", ""));
        i.putExtra("metric", call.getString("metric", ""));
        i.putExtra("left", call.getString("left", ""));
        i.putExtra("eta", call.getString("eta"));
        i.putExtra("progress", call.getDouble("progress", 0.0));
        Double base = call.getDouble("chronoBase");
        i.putExtra("chronoBase", base != null ? base.longValue() : System.currentTimeMillis());
        i.putExtra("elapsed", call.getString("elapsed", ""));
        i.putExtra("paused", call.getBoolean("paused", false));
        try {
            ContextCompat.startForegroundService(getContext(), i);
            call.resolve();
        } catch (Exception e) {
            call.reject("Écran verrouillé indisponible : " + e.getMessage());
        }
    }

    /** Une position lue par le service (écran éteint compris), pour le suivi dans l'app. */
    static void emitPosition(double lon, double lat, Float accuracy, Float speed, Float heading, long time) {
        LiveTrackPlugin p = instance;
        if (p == null) return;
        JSObject o = new JSObject();
        o.put("lon", lon);
        o.put("lat", lat);
        if (accuracy != null) o.put("accuracy", accuracy.doubleValue());
        if (speed != null) o.put("speed", speed.doubleValue());
        if (heading != null) o.put("heading", heading.doubleValue());
        o.put("time", time);
        p.notifyListeners("position", o, false);
    }

    /** Un bouton de la notification (pause, resume, stop) : l'app pilote le suivi. */
    static void emit(String action) {
        LiveTrackPlugin p = instance;
        if (p == null) return;
        JSObject o = new JSObject();
        o.put("action", action);
        p.notifyListeners("action", o, true);
    }
}
