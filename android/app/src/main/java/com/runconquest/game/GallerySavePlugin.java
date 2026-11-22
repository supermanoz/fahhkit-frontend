package com.runconquest.game;

import android.Manifest;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;

// Saves a run image (PNG with alpha, or JPG) into the phone's gallery under
// Pictures/<album> (Android only - see src/utils/saveImage.js). Replaces the
// @capacitor-community/media path on Android, which wrote into the app's own
// media folder and asked for the photos permission at save time.
//
//  - Android 10+ (API 29+): MediaStore.Images insert with RELATIVE_PATH and
//    IS_PENDING. The app owns the row it creates, so NO storage permission is
//    needed or requested. The row stays pending (invisible to other apps)
//    until every byte is written, then is published; a failed write deletes
//    it, so the gallery never shows a half-written image.
//  - Android 9 and below (API 22-28): MediaStore has no scoped storage there,
//    so the image is written into Pictures/<album> directly and indexed with
//    the media scanner. That needs WRITE_EXTERNAL_STORAGE (declared in the
//    manifest with maxSdkVersion 28, requested at save time).
//
// The JS side hands over a file in the app cache (Filesystem.writeFile) so a
// large image doesn't have to cross the bridge a second time.
@CapacitorPlugin(
    name = "GallerySave",
    permissions = {
        @Permission(strings = { Manifest.permission.WRITE_EXTERNAL_STORAGE }, alias = GallerySavePlugin.LEGACY_STORAGE)
    }
)
public class GallerySavePlugin extends Plugin {

    static final String LEGACY_STORAGE = "legacyStorage";
    private static final String DEFAULT_ALBUM = "Run Conquest";
    private static final int COPY_BUFFER = 64 * 1024;

    @PluginMethod
    public void saveImage(PluginCall call) {
        if (call.getString("path") == null) {
            call.reject("Image path is required");
            return;
        }
        // Only Android 9 and below ever asks the user for anything.
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q
                && getPermissionState(LEGACY_STORAGE) != PermissionState.GRANTED) {
            requestPermissionForAlias(LEGACY_STORAGE, call, "legacyStoragePermissionCallback");
            return;
        }
        save(call);
    }

    @PermissionCallback
    private void legacyStoragePermissionCallback(PluginCall call) {
        if (getPermissionState(LEGACY_STORAGE) == PermissionState.GRANTED) {
            save(call);
        } else {
            // "denied" + "permission" so the JS side maps it to its friendly
            // "Photos access is off" state with the Open settings button.
            call.reject("Storage permission denied", "PERMISSION_DENIED");
        }
    }

    private void save(PluginCall call) {
        String path = call.getString("path");
        String fileName = call.getString("fileName");
        String mimeType = call.getString("mimeType", "image/png");
        String album = call.getString("album", DEFAULT_ALBUM);

        File source = sourceFile(path);
        if (source == null || !source.isFile()) {
            call.reject("Image file not found", "FILE_NOT_FOUND");
            return;
        }
        String displayName = displayNameFor(fileName, source, mimeType);

        try {
            Uri saved = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
                    ? saveWithMediaStore(source, displayName, mimeType, album)
                    : saveLegacy(source, displayName, mimeType, album);
            JSObject result = new JSObject();
            result.put("uri", saved.toString());
            result.put("fileName", displayName);
            call.resolve(result);
        } catch (SecurityException e) {
            call.reject("Permission denied: " + e.getMessage(), "PERMISSION_DENIED");
        } catch (IOException | RuntimeException e) {
            call.reject("Could not save image: " + e.getMessage(), "SAVE_FAILED");
        }
    }

    // ---- Android 10+: MediaStore, no storage permission -----------------

    private Uri saveWithMediaStore(File source, String displayName, String mimeType, String album)
            throws IOException {
        ContentResolver resolver = getContext().getContentResolver();
        ContentValues values = new ContentValues();
        values.put(MediaStore.MediaColumns.DISPLAY_NAME, displayName);
        values.put(MediaStore.MediaColumns.MIME_TYPE, mimeType);
        values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/" + album);
        // Hidden from the gallery and other apps until fully written.
        values.put(MediaStore.MediaColumns.IS_PENDING, 1);

        Uri uri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values);
        if (uri == null) {
            throw new IOException("MediaStore insert returned null");
        }
        boolean published = false;
        try {
            try (InputStream in = new FileInputStream(source);
                 OutputStream out = resolver.openOutputStream(uri)) {
                if (out == null) {
                    throw new IOException("Could not open the gallery entry for writing");
                }
                copy(in, out);
            }
            ContentValues done = new ContentValues();
            done.put(MediaStore.MediaColumns.IS_PENDING, 0);
            resolver.update(uri, done, null, null);
            published = true;
        } finally {
            if (!published) {
                // Never leave an empty/half-written pending row behind.
                try {
                    resolver.delete(uri, null, null);
                } catch (RuntimeException ignored) {
                    // Nothing more to do - the row stays pending and invisible.
                }
            }
        }
        return uri;
    }

    // ---- Android 9 and below: plain file + media scanner ----------------

    private Uri saveLegacy(File source, String displayName, String mimeType, String album)
            throws IOException {
        File dir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES), album);
        if (!dir.isDirectory() && !dir.mkdirs() && !dir.isDirectory()) {
            throw new IOException("Could not create " + dir.getAbsolutePath());
        }
        File target = uniqueFile(dir, displayName);
        boolean written = false;
        try {
            try (InputStream in = new FileInputStream(source);
                 OutputStream out = new FileOutputStream(target)) {
                copy(in, out);
            }
            written = true;
        } finally {
            if (!written) {
                //noinspection ResultOfMethodCallIgnored
                target.delete();
            }
        }
        // Index it so the gallery shows it right away.
        MediaScannerConnection.scanFile(getContext(), new String[] { target.getAbsolutePath() },
                new String[] { mimeType }, null);
        return Uri.fromFile(target);
    }

    // ---- helpers ---------------------------------------------------------

    private static void copy(InputStream in, OutputStream out) throws IOException {
        byte[] buffer = new byte[COPY_BUFFER];
        int read;
        while ((read = in.read(buffer)) != -1) {
            out.write(buffer, 0, read);
        }
        out.flush();
    }

    // "file:///data/user/0/.../cache/x.png" (what Filesystem.writeFile returns)
    // or a plain path.
    private static File sourceFile(String path) {
        if (path == null) return null;
        Uri uri = Uri.parse(path);
        String p = uri.getPath();
        return p != null ? new File(p) : new File(path);
    }

    // Display name always carries the right extension for the mime type.
    private static String displayNameFor(String fileName, File source, String mimeType) {
        String ext = "image/jpeg".equals(mimeType) ? "jpg" : "png";
        String base = fileName;
        if (base == null || base.trim().isEmpty()) {
            base = source.getName();
        }
        int dot = base.lastIndexOf('.');
        if (dot > 0) {
            base = base.substring(0, dot);
        }
        // Nothing path-like may reach the gallery name.
        base = base.replaceAll("[\\\\/:*?\"<>|]", "_");
        return base + "." + ext;
    }

    private static File uniqueFile(File dir, String displayName) {
        File candidate = new File(dir, displayName);
        if (!candidate.exists()) return candidate;
        int dot = displayName.lastIndexOf('.');
        String base = dot > 0 ? displayName.substring(0, dot) : displayName;
        String ext = dot > 0 ? displayName.substring(dot) : "";
        for (int i = 1; i < 1000; i++) {
            candidate = new File(dir, base + " (" + i + ")" + ext);
            if (!candidate.exists()) return candidate;
        }
        return new File(dir, base + "-" + System.currentTimeMillis() + ext);
    }
}
