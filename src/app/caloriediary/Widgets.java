package app.caloriediary;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.RectF;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONObject;

/* Home-screen widgets: А 2x2 (ring), Б 4x2 (ring, macros, button), В 4x1 (strip, button).
   They draw today's summary that the page pushes through Bridge.pushToday. */
public abstract class Widgets extends AppWidgetProvider {
    public static class Small extends Widgets { int layout() { return R.layout.widget_small; } }
    public static class Medium extends Widgets { int layout() { return R.layout.widget_medium; } }
    public static class Strip extends Widgets { int layout() { return R.layout.widget_strip; } }

    abstract int layout();

    static final Class<?>[] ALL = {Small.class, Medium.class, Strip.class};

    static void updateAll(Context c) {
        AppWidgetManager m = AppWidgetManager.getInstance(c);
        for (Class<?> k : ALL) {
            int[] ids = m.getAppWidgetIds(new ComponentName(c, k));
            if (ids.length == 0) continue;
            try {
                ((Widgets) k.newInstance()).onUpdate(c, m, ids);
            } catch (Exception e) { }
        }
    }

    /* today's numbers; a summary from an earlier day counts as nothing eaten yet */
    static class Day {
        int kcal, p, f, c, tKcal = 1800, tP = 140, tF = 60, tC = 175;

        static Day load(Context ctx) {
            Day d = new Day();
            try {
                JSONObject o = new JSONObject(Reminders.prefs(ctx).getString("today", "{}"));
                JSONObject t = o.optJSONObject("target");
                if (t != null) {
                    d.tKcal = Math.max(1, t.optInt("kcal", d.tKcal));
                    d.tP = t.optInt("p", d.tP);
                    d.tF = t.optInt("f", d.tF);
                    d.tC = t.optInt("c", d.tC);
                }
                JSONObject e = o.optJSONObject("eaten");
                if (e != null && Reminders.today().equals(o.optString("date"))) {
                    d.kcal = (int) Math.round(e.optDouble("kcal", 0));
                    d.p = (int) Math.round(e.optDouble("p", 0));
                    d.f = (int) Math.round(e.optDouble("f", 0));
                    d.c = (int) Math.round(e.optDouble("c", 0));
                }
            } catch (Exception ex) { }
            return d;
        }

        boolean over() { return kcal > tKcal; }
        int left() { return Math.abs(tKcal - kcal); }
    }

    static int permille(int v, int max) { return max <= 0 ? 0 : Math.max(0, Math.min(1000, v * 1000 / max)); }

    static Bitmap ring(Context c, Day d) {
        float dp = c.getResources().getDisplayMetrics().density;
        int size = Math.round(100 * dp);
        float stroke = 10 * dp;
        Bitmap b = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        Canvas cv = new Canvas(b);
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setStyle(Paint.Style.STROKE);
        p.setStrokeWidth(stroke);
        p.setStrokeCap(Paint.Cap.ROUND);
        RectF r = new RectF(stroke / 2, stroke / 2, size - stroke / 2, size - stroke / 2);
        p.setColor(c.getResources().getColor(R.color.widget_track, null));
        cv.drawArc(r, 0, 360, false, p);
        float sweep = d.over() ? 360 : 360f * d.kcal / d.tKcal;
        if (sweep > 0) {
            p.setColor(c.getResources().getColor(d.over() ? R.color.widget_over : R.color.widget_ok, null));
            cv.drawArc(r, -90, Math.max(sweep, 1), false, p);
        }
        return b;
    }

    static PendingIntent open(Context c, boolean add) {
        Intent i = new Intent(c, MainActivity.class).setAction(add ? MainActivity.ACTION_ADD : Intent.ACTION_MAIN)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(c, add ? 301 : 300, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    @Override
    public void onUpdate(Context c, AppWidgetManager m, int[] ids) {
        Day d = Day.load(c);
        int layout = layout();
        RemoteViews v = new RemoteViews(c.getPackageName(), layout);
        v.setOnClickPendingIntent(R.id.w_root, open(c, false));
        String leftText = d.over() ? "Перебор " + d.left() : "Осталось " + d.left();

        if (layout == R.layout.widget_small || layout == R.layout.widget_medium) {
            v.setImageViewBitmap(R.id.w_ring, ring(c, d));
            v.setTextViewText(R.id.w_eaten, String.valueOf(d.kcal));
            v.setTextViewText(R.id.w_of, "из " + d.tKcal);
        }
        if (layout == R.layout.widget_small) {
            v.setTextViewText(R.id.w_left, leftText);
            v.setTextColor(R.id.w_left, c.getResources().getColor(d.over() ? R.color.widget_over : R.color.widget_muted, null));
        }
        if (layout == R.layout.widget_medium) {
            v.setTextViewText(R.id.w_p_text, "Белки " + d.p + "/" + d.tP);
            v.setProgressBar(R.id.w_p_bar, 1000, permille(d.p, d.tP), false);
            v.setTextViewText(R.id.w_f_text, "Жиры " + d.f + "/" + d.tF);
            v.setProgressBar(R.id.w_f_bar, 1000, permille(d.f, d.tF), false);
            v.setTextViewText(R.id.w_c_text, "Углеводы " + d.c + "/" + d.tC);
            v.setProgressBar(R.id.w_c_bar, 1000, permille(d.c, d.tC), false);
            v.setOnClickPendingIntent(R.id.w_add, open(c, true));
        }
        if (layout == R.layout.widget_strip) {
            v.setTextViewText(R.id.w_value, d.left() + " ккал");
            v.setTextViewText(R.id.w_label, d.over() ? "сверх нормы" : "осталось");
            v.setTextColor(R.id.w_value, c.getResources().getColor(d.over() ? R.color.widget_over : R.color.widget_fg, null));
            v.setViewVisibility(R.id.w_bar, d.over() ? View.GONE : View.VISIBLE);
            v.setViewVisibility(R.id.w_bar_over, d.over() ? View.VISIBLE : View.GONE);
            v.setProgressBar(R.id.w_bar, 1000, permille(d.kcal, d.tKcal), false);
            v.setOnClickPendingIntent(R.id.w_add, open(c, true));
        }
        for (int id : ids) m.updateAppWidget(id, v);
    }
}
