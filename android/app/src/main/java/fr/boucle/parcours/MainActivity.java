package fr.boucle.parcours;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Module de l'app (pas un paquet npm) : l'écran verrouillé du suivi.
        registerPlugin(LiveTrackPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
