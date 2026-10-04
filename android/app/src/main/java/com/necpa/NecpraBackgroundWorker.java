package com.necpa;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.Network;
import android.util.Log;
import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

public final class NecpraBackgroundWorker extends Worker {
    private static final String PREFS = "necpra_native_background";
    private static final String BACKEND_URL = "https://nexorah-xnv6.onrender.com/";

    public NecpraBackgroundWorker(@NonNull Context context, @NonNull WorkerParameters params) { super(context, params); }

    @NonNull @Override public Result doWork() {
        Context context=getApplicationContext(); long now=System.currentTimeMillis();
        boolean connected=isConnected(context);
        context.getSharedPreferences(PREFS,Context.MODE_PRIVATE).edit()
                .putLong("lastRunAt",now).putBoolean("networkConnected",connected).apply();
        if(!connected) return Result.retry();
        try {
            java.net.HttpURLConnection c=(java.net.HttpURLConnection)new java.net.URL(BACKEND_URL).openConnection();
            c.setRequestMethod("HEAD"); c.setConnectTimeout(5000); c.setReadTimeout(5000); c.setUseCaches(false);
            int status=c.getResponseCode(); c.disconnect();
            boolean reachable=status>=200&&status<500;
            context.getSharedPreferences(PREFS,Context.MODE_PRIVATE).edit()
                    .putLong("lastBackendCheckAt",now).putInt("lastBackendStatus",status)
                    .putBoolean("backendReachable",reachable).putBoolean("syncRequested",reachable)
                    .putLong("syncRequestedAt",reachable?now:0L).apply();
            Log.i("NecpraBackground","Backend check status="+status+", reachable="+reachable);
            return reachable?Result.success():Result.retry();
        } catch(Throwable t) {
            context.getSharedPreferences(PREFS,Context.MODE_PRIVATE).edit().putBoolean("backendReachable",false).putBoolean("syncRequested",false).apply();
            Log.w("NecpraBackground","Backend check failed",t); return Result.retry();
        }
    }
    private static boolean isConnected(Context context) {
        try {
            ConnectivityManager cm=(ConnectivityManager)context.getSystemService(Context.CONNECTIVITY_SERVICE);
            if(cm==null) return false; Network n=cm.getActiveNetwork();
            return n!=null && cm.getNetworkCapabilities(n)!=null;
        } catch(Throwable t) { return false; }
    }
}
