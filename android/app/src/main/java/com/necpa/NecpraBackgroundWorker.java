package com.necpa;

import android.content.Context;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

public final class NecpraBackgroundWorker extends Worker {
    public NecpraBackgroundWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        Log.i("NecpraBackground", "Native background maintenance wake executed");
        return Result.success();
    }
}
