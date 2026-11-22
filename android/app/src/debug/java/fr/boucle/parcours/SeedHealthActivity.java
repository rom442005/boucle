package fr.boucle.parcours;

import android.app.Activity;
import android.health.connect.HealthConnectException;
import android.health.connect.HealthConnectManager;
import android.health.connect.InsertRecordsResponse;
import android.health.connect.datatypes.ActiveCaloriesBurnedRecord;
import android.health.connect.datatypes.DistanceRecord;
import android.health.connect.datatypes.ExerciseSessionRecord;
import android.health.connect.datatypes.ExerciseSessionType;
import android.health.connect.datatypes.Metadata;
import android.health.connect.datatypes.Record;
import android.health.connect.datatypes.RestingHeartRateRecord;
import android.health.connect.datatypes.StepsRecord;
import android.health.connect.datatypes.Vo2MaxRecord;
import android.health.connect.datatypes.units.Energy;
import android.health.connect.datatypes.units.Length;
import android.os.Build;
import android.os.Bundle;
import android.os.OutcomeReceiver;
import android.util.Log;
import androidx.annotation.RequiresApi;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;

/**
 * Version de test seulement (dossier debug, absent de la version publiée) : dépose 28 jours de données
 * d'essai dans Health Connect (pas, pouls au repos, VO2 max, sorties course, vélo, marche et rando avec
 * leur distance et leurs calories), pour vérifier sur l'émulateur ce que Boucle lit et envoie.
 * Lancement : adb shell am start -n fr.boucle.parcours/.SeedHealthActivity
 * Relancer ne crée pas de doublon : chaque enregistrement garde le même identifiant.
 */
public class SeedHealthActivity extends Activity {

    private static final String TAG = "BoucleSeed";

    /** jours passés, type, mètres, minutes */
    private static final int[][] OUTINGS = {
        { 1, ExerciseSessionType.EXERCISE_SESSION_TYPE_RUNNING, 10200, 52 },
        { 3, ExerciseSessionType.EXERCISE_SESSION_TYPE_BIKING, 42500, 98 },
        { 5, ExerciseSessionType.EXERCISE_SESSION_TYPE_RUNNING, 8100, 41 },
        { 6, ExerciseSessionType.EXERCISE_SESSION_TYPE_WALKING, 6400, 75 },
        { 8, ExerciseSessionType.EXERCISE_SESSION_TYPE_RUNNING, 12400, 64 },
        { 10, ExerciseSessionType.EXERCISE_SESSION_TYPE_BIKING, 35600, 82 },
        { 12, ExerciseSessionType.EXERCISE_SESSION_TYPE_RUNNING, 7800, 39 },
        { 14, ExerciseSessionType.EXERCISE_SESSION_TYPE_HIKING, 14200, 210 },
        { 15, ExerciseSessionType.EXERCISE_SESSION_TYPE_RUNNING, 15100, 79 },
        { 17, ExerciseSessionType.EXERCISE_SESSION_TYPE_BIKING, 51800, 121 },
        { 19, ExerciseSessionType.EXERCISE_SESSION_TYPE_RUNNING, 9300, 47 },
        { 22, ExerciseSessionType.EXERCISE_SESSION_TYPE_RUNNING, 21100, 112 },
        { 24, ExerciseSessionType.EXERCISE_SESSION_TYPE_BIKING, 28400, 66 },
        { 26, ExerciseSessionType.EXERCISE_SESSION_TYPE_RUNNING, 8800, 45 },
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            Log.w(TAG, "Android 14 minimum");
            finish();
            return;
        }
        seed();
    }

    private static Metadata meta(String id) {
        return new Metadata.Builder().setClientRecordId(id).build();
    }

    @RequiresApi(Build.VERSION_CODES.UPSIDE_DOWN_CAKE)
    private void seed() {
        ZoneId zone = ZoneId.systemDefault();
        LocalDate today = LocalDate.now(zone);
        Instant now = Instant.now();
        List<Record> records = new ArrayList<>();
        for (int ago = 0; ago < 28; ago++) {
            LocalDate day = today.minusDays(ago);
            Instant from = day.atTime(9, 0).atZone(zone).toInstant();
            Instant to = day.atTime(21, 0).atZone(zone).toInstant();
            if (to.isAfter(now)) to = now.minusSeconds(60);
            if (to.isAfter(from)) {
                records.add(new StepsRecord.Builder(meta("seed-steps-" + day), from, to, 5200 + (ago * 3779L) % 7000).build());
            }
            if (ago % 2 == 1) {
                records.add(new RestingHeartRateRecord.Builder(meta("seed-rhr-" + day), day.atTime(7, 0).atZone(zone).toInstant(), 50 + (ago * 7L) % 7).build());
            }
        }
        int other = Vo2MaxRecord.Vo2MaxMeasurementMethod.MEASUREMENT_METHOD_OTHER;
        records.add(new Vo2MaxRecord.Builder(meta("seed-vo2-1"), today.minusDays(20).atTime(19, 0).atZone(zone).toInstant(), other, 47.8).build());
        records.add(new Vo2MaxRecord.Builder(meta("seed-vo2-2"), today.minusDays(6).atTime(19, 0).atZone(zone).toInstant(), other, 49.1).build());
        for (int[] o : OUTINGS) {
            LocalDate day = today.minusDays(o[0]);
            Instant start = day.atTime(18, 0).atZone(zone).toInstant();
            Instant end = start.plusSeconds(o[3] * 60L);
            records.add(new ExerciseSessionRecord.Builder(meta("seed-ex-" + day), start, end, o[1]).build());
            records.add(new DistanceRecord.Builder(meta("seed-dist-" + day), start, end, Length.fromMeters(o[2])).build());
            double kcalPerKm = o[1] == ExerciseSessionType.EXERCISE_SESSION_TYPE_BIKING ? 25 : o[1] == ExerciseSessionType.EXERCISE_SESSION_TYPE_RUNNING ? 65 : 55;
            records.add(new ActiveCaloriesBurnedRecord.Builder(meta("seed-kcal-" + day), start, end, Energy.fromCalories(o[2] / 1000.0 * kcalPerKm * 1000)).build());
        }
        HealthConnectManager hc = getSystemService(HealthConnectManager.class);
        hc.insertRecords(records, getMainExecutor(), new OutcomeReceiver<InsertRecordsResponse, HealthConnectException>() {
            @Override
            public void onResult(InsertRecordsResponse r) {
                Log.i(TAG, "OK " + r.getRecords().size() + " enregistrements");
                finish();
            }

            @Override
            public void onError(HealthConnectException e) {
                Log.e(TAG, "ERREUR " + e.getMessage());
                finish();
            }
        });
    }
}
