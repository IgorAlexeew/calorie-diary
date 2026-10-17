package app.caloriediary;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.Locale;

/* Meal reminders: one daily alarm per enabled meal, skipped when that meal is already in today's diary.
   The same class receives the alarms and BOOT_COMPLETED (alarms don't survive a reboot). */
public class Reminders extends BroadcastReceiver {
    static final String CHANNEL = "meals";
    static final String ACTION_FIRE = "app.caloriediary.REMIND";
    static final String[] MEALS = {"Завтрак", "Обед", "Перекус", "Ужин"};
    static final String[] TITLES = {"Время завтрака", "Время обеда", "Время перекуса", "Время ужина"};

    static SharedPreferences prefs(Context c) { return c.getSharedPreferences("config", Context.MODE_PRIVATE); }

    /* [{meal, h, m, on}] — breakfast, lunch and dinner on by default, snack off */
    static JSONArray load(Context c) {
        try {
            String s = prefs(c).getString("reminders", null);
            if (s != null) return new JSONArray(s);
        } catch (Exception e) { }
        JSONArray a = new JSONArray();
        int[][] d = {{0, 9, 0, 1}, {1, 13, 30, 1}, {2, 16, 30, 0}, {3, 19, 0, 1}};
        try {
            for (int[] r : d) a.put(new JSONObject().put("meal", r[0]).put("h", r[1]).put("m", r[2]).put("on", r[3] == 1));
        } catch (Exception e) { }
        return a;
    }

    static void save(Context c, String json) {
        try {
            new JSONArray(json);
            prefs(c).edit().putString("reminders", json).apply();
        } catch (Exception e) { }
        schedule(c);
    }

    static boolean anyOn(Context c) {
        JSONArray a = load(c);
        for (int i = 0; i < a.length(); i++) if (a.optJSONObject(i).optBoolean("on")) return true;
        return false;
    }

    static PendingIntent pending(Context c, int meal) {
        Intent i = new Intent(c, Reminders.class).setAction(ACTION_FIRE).putExtra("meal", meal);
        return PendingIntent.getBroadcast(c, 100 + meal, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static void schedule(Context c) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        JSONArray a = load(c);
        for (int meal = 0; meal < MEALS.length; meal++) am.cancel(pending(c, meal));
        for (int i = 0; i < a.length(); i++) {
            JSONObject r = a.optJSONObject(i);
            if (r == null || !r.optBoolean("on")) continue;
            Calendar t = Calendar.getInstance();
            t.set(Calendar.HOUR_OF_DAY, r.optInt("h"));
            t.set(Calendar.MINUTE, r.optInt("m"));
            t.set(Calendar.SECOND, 0);
            t.set(Calendar.MILLISECOND, 0);
            if (t.getTimeInMillis() <= System.currentTimeMillis() + 1000) t.add(Calendar.DAY_OF_MONTH, 1);
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, t.getTimeInMillis(), pending(c, r.optInt("meal")));
        }
    }

    static String today() { return new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date()); }

    /* today's summary pushed by the page: {date, meals:[bool x4], eaten:{kcal,p,f,c}, target:{kcal,p,f,c}} */
    static boolean alreadyLogged(Context c, int meal) {
        try {
            JSONObject o = new JSONObject(prefs(c).getString("today", "{}"));
            if (!today().equals(o.optString("date"))) return false;
            JSONArray m = o.optJSONArray("meals");
            return m != null && m.optBoolean(meal);
        } catch (Exception e) {
            return false;
        }
    }

    static void ensureChannel(Context c) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationChannel ch = new NotificationChannel(CHANNEL, "Напоминания о еде", NotificationManager.IMPORTANCE_DEFAULT);
        ch.setDescription("Напоминают записать приём пищи");
        ((NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE)).createNotificationChannel(ch);
    }

    static void notify(Context c, int meal) {
        ensureChannel(c);
        Intent open = new Intent(c, MainActivity.class).setAction(MainActivity.ACTION_ADD)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pi = PendingIntent.getActivity(c, 200 + meal, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(c, CHANNEL) : new Notification.Builder(c);
        b.setSmallIcon(R.drawable.ic_notify)
            .setContentTitle(TITLES[meal])
            .setContentText("Запиши, что съел, пока не забыл.")
            .setContentIntent(pi)
            .setAutoCancel(true)
            .setColor(0xFF2E9E5B);
        try {
            ((NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE)).notify(meal, b.build());
        } catch (SecurityException e) { }
    }

    @Override
    public void onReceive(Context c, Intent i) {
        if (ACTION_FIRE.equals(i.getAction())) {
            int meal = i.getIntExtra("meal", 0);
            if (meal >= 0 && meal < MEALS.length && !alreadyLogged(c, meal)) notify(c, meal);
        }
        schedule(c);
    }
}
