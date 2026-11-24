package fr.boucle.parcours;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.IBinder;
import android.os.Looper;
import androidx.core.content.ContextCompat;
import androidx.core.app.NotificationCompat;

/**
 * Service au premier plan du suivi en direct : une notification permanente, visible sur l'écran verrouillé,
 * avec le chrono (il tourne tout seul, base = départ + pauses), la distance, l'allure ou la vitesse, le
 * restant, l'heure d'arrivée, une barre de progression et les boutons Pause/Reprendre et Terminer.
 * Type « location » : Android garde la position active pendant la sortie, écran éteint. Le service lit
 * lui-même le GPS et passe chaque position à l'app (la page web ne reçoit plus la sienne écran éteint).
 */
public class LiveTrackService extends Service {

    static final String ACTION_SHOW = "fr.boucle.live.SHOW";
    static final String ACTION_PAUSE = "fr.boucle.live.PAUSE";
    static final String ACTION_RESUME = "fr.boucle.live.RESUME";
    static final String ACTION_STOP = "fr.boucle.live.STOP";
    private static final String CHANNEL = "suivi";
    private static final int ID = 4242;
    private LocationManager lm;
    private final LocationListener listener = (Location l) ->
        LiveTrackPlugin.emitPosition(
            l.getLongitude(),
            l.getLatitude(),
            l.hasAccuracy() ? l.getAccuracy() : null,
            l.hasSpeed() ? l.getSpeed() : null,
            l.hasBearing() ? l.getBearing() : null,
            l.getTime()
        );

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String a = intent != null ? intent.getAction() : null;
        if (ACTION_PAUSE.equals(a)) {
            LiveTrackPlugin.emit("pause");
            return START_NOT_STICKY;
        }
        if (ACTION_RESUME.equals(a)) {
            LiveTrackPlugin.emit("resume");
            return START_NOT_STICKY;
        }
        if (ACTION_STOP.equals(a)) {
            LiveTrackPlugin.emit("stop");
            return START_NOT_STICKY;
        }
        if (intent == null) {
            // Relancé par le système sans données : rien à montrer.
            stopSelf();
            return START_NOT_STICKY;
        }
        Notification n = build(intent);
        try {
            if (Build.VERSION.SDK_INT >= 29) startForeground(ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
            else startForeground(ID, n);
        } catch (Exception e) {
            // Sans droit de position au premier plan : la notification reste, sans service au premier plan.
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) nm.notify(ID, n);
        }
        listen();
        return START_NOT_STICKY;
    }

    /** GPS lu par le service (une position par seconde), une seule fois par sortie. */
    private void listen() {
        if (lm != null) return;
        if (ContextCompat.checkSelfPermission(this, android.Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) return;
        lm = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
        if (lm == null) return;
        try {
            if (lm.isProviderEnabled(LocationManager.GPS_PROVIDER)) lm.requestLocationUpdates(LocationManager.GPS_PROVIDER, 1000, 0, listener, Looper.getMainLooper());
            else if (lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) lm.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 2000, 0, listener, Looper.getMainLooper());
        } catch (SecurityException ignored) {
            lm = null;
        }
    }

    @Override
    public void onDestroy() {
        if (lm != null) lm.removeUpdates(listener);
        lm = null;
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm != null) nm.cancel(ID);
        super.onDestroy();
    }

    private PendingIntent action(String a, int code) {
        Intent i = new Intent(this, LiveTrackService.class).setAction(a);
        return PendingIntent.getService(this, code, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private Notification build(Intent in) {
        channel();
        boolean paused = in.getBooleanExtra("paused", false);
        String distance = in.getStringExtra("distance");
        String metric = in.getStringExtra("metric");
        String left = in.getStringExtra("left");
        String eta = in.getStringExtra("eta");
        String elapsed = in.getStringExtra("elapsed");
        int progress = (int) Math.round(Math.max(0, Math.min(1, in.getDoubleExtra("progress", 0))) * 1000);

        // « 3,42 km · 5:12 /km », puis « Reste 6,6 km · arrivée 18:42 ».
        String head = paused ? "En pause · " + elapsed + " · " + distance : distance + " · " + metric;
        StringBuilder sub = new StringBuilder("Reste ").append(left);
        if (eta != null && !eta.isEmpty()) sub.append(" · arrivée ").append(eta);

        Intent open = getPackageManager().getLaunchIntentForPackage(getPackageName());
        PendingIntent content = open != null
                ? PendingIntent.getActivity(this, 1, open.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT)
                : null;

        NotificationCompat.Builder b = new NotificationCompat.Builder(this, CHANNEL)
                .setSmallIcon(R.drawable.ic_stat_boucle)
                .setColor(0xFFFF2D55)
                .setContentTitle(head)
                .setContentText(sub.toString())
                .setSubText(in.getStringExtra("title"))
                .setProgress(1000, progress, false)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setSilent(true)
                .setCategory("workout")
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
                .setContentIntent(content)
                .addAction(0, paused ? "Reprendre" : "Pause", action(paused ? ACTION_RESUME : ACTION_PAUSE, 2))
                .addAction(0, "Terminer", action(ACTION_STOP, 3));
        if (paused) {
            b.setShowWhen(false).setUsesChronometer(false);
        } else {
            // Le chrono compte depuis « when » : départ + pauses = temps en mouvement.
            b.setWhen(in.getLongExtra("chronoBase", System.currentTimeMillis())).setShowWhen(true).setUsesChronometer(true);
        }
        return b.build();
    }

    private void channel() {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null || nm.getNotificationChannel(CHANNEL) != null) return;
        NotificationChannel c = new NotificationChannel(CHANNEL, "Suivi en direct", NotificationManager.IMPORTANCE_LOW);
        c.setDescription("La sortie en cours sur l'écran verrouillé : chrono, distance, allure.");
        c.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        c.setShowBadge(false);
        nm.createNotificationChannel(c);
    }
}
