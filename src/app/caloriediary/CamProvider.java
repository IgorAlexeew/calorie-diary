package app.caloriediary;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;

import java.io.File;
import java.io.FileNotFoundException;

/* Serves camera shots from the app cache so the camera app can write them and the WebView can read them. */
public class CamProvider extends ContentProvider {
    /* ${applicationId}.cam in the manifest: the classic and pixel apps each have their own */
    static String authority(Context c) { return c.getPackageName() + ".cam"; }

    static File dir(Context c) {
        File d = new File(c.getCacheDir(), "camera");
        d.mkdirs();
        return d;
    }

    static Uri newPhotoUri(Context c) {
        File[] old = dir(c).listFiles();
        long now = System.currentTimeMillis();
        if (old != null) for (File f : old) if (now - f.lastModified() > 86400000L) f.delete();
        return Uri.parse("content://" + authority(c) + "/shot_" + now + ".jpg");
    }

    static boolean hasPhoto(Context c, Uri u) {
        File f = fileFor(c, u);
        return f != null && f.exists() && f.length() > 0;
    }

    static File fileFor(Context c, Uri u) {
        String name = u.getLastPathSegment();
        if (name == null || name.contains("/") || name.contains("..")) return null;
        return new File(dir(c), name);
    }

    @Override public boolean onCreate() { return true; }

    @Override
    public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        File f = fileFor(getContext(), uri);
        if (f == null) throw new FileNotFoundException();
        return ParcelFileDescriptor.open(f, ParcelFileDescriptor.parseMode(mode));
    }

    @Override
    public Cursor query(Uri uri, String[] proj, String sel, String[] args, String sort) {
        File f = fileFor(getContext(), uri);
        MatrixCursor c = new MatrixCursor(new String[]{OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE});
        if (f != null) c.addRow(new Object[]{f.getName(), f.length()});
        return c;
    }

    @Override public String getType(Uri uri) { return "image/jpeg"; }
    @Override public Uri insert(Uri uri, ContentValues v) { return null; }
    @Override public int delete(Uri uri, String s, String[] a) { return 0; }
    @Override public int update(Uri uri, ContentValues v, String s, String[] a) { return 0; }
}
