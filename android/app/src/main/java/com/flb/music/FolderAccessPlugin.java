package com.flb.music;

import android.app.Activity;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.DocumentsContract;
import android.provider.OpenableColumns;
import android.util.Base64;

import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@CapacitorPlugin(name = "FolderAccess")
public class FolderAccessPlugin extends Plugin {
    private static final int READ_CHUNK_SIZE = 256 * 1024;
    private final Map<String, InputStream> activeReads = new ConcurrentHashMap<>();
    private static final String[] AUDIO_EXTENSIONS = {
        ".mp3", ".flac", ".wav", ".m4a", ".aac", ".ogg", ".opus",
        ".wma", ".aiff", ".ape"
    };

    @PluginMethod
    public void pickFolder(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        intent.addFlags(Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION | Intent.FLAG_GRANT_PREFIX_URI_PERMISSION);
        startActivityForResult(call, intent, "folderPicked");
    }

    @ActivityCallback
    private void folderPicked(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result == null || result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            call.reject("Folder selection cancelled", "CANCELLED");
            return;
        }

        Uri treeUri = result.getData().getData();
        if (treeUri == null) {
            call.reject("No folder was selected");
            return;
        }

        int permissionFlags = result.getData().getFlags()
            & (Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        try {
            getContext().getContentResolver().takePersistableUriPermission(treeUri, permissionFlags);
        } catch (Exception ignored) {
            // The current selection remains readable; Android may omit persistable flags for some providers.
        }

        try {
            JSObject response = new JSObject();
            response.put("uri", treeUri.toString());
            response.put("name", documentName(treeUri, DocumentsContract.getTreeDocumentId(treeUri)));
            response.put("files", listAudioFiles(treeUri));
            call.resolve(response);
        } catch (Exception error) {
            call.reject("Não foi possível ler a pasta selecionada. Confira a permissão de acesso.", error);
        }
    }

    @PluginMethod
    public void listFolder(PluginCall call) {
        String rawUri = call.getString("uri", "");
        if (rawUri.isEmpty()) {
            call.reject("Folder URI is missing");
            return;
        }
        try {
            Uri treeUri = Uri.parse(rawUri);
            JSObject response = new JSObject();
            response.put("uri", rawUri);
            response.put("name", documentName(treeUri, DocumentsContract.getTreeDocumentId(treeUri)));
            response.put("files", listAudioFiles(treeUri));
            call.resolve(response);
        } catch (Exception error) {
            call.reject("Could not read the selected folder", error);
        }
    }

    @PluginMethod
    public void beginReadFile(PluginCall call) {
        String rawUri = call.getString("uri", "");
        if (rawUri.isEmpty()) {
            call.reject("Audio file URI is missing");
            return;
        }

        try {
            Uri uri = Uri.parse(rawUri);
            InputStream input = getContext().getContentResolver().openInputStream(uri);
            if (input == null) {
                call.reject("The selected audio file is no longer available");
                return;
            }
            String sessionId = UUID.randomUUID().toString();
            activeReads.put(sessionId, input);
            JSObject response = new JSObject();
            response.put("sessionId", sessionId);
            String mimeType = getContext().getContentResolver().getType(uri);
            response.put("mimeType", mimeType == null ? "" : mimeType);
            call.resolve(response);
        } catch (Exception error) {
            call.reject("Could not read the selected audio file", error);
        }
    }

    @PluginMethod
    public void readFileChunk(PluginCall call) {
        String sessionId = call.getString("sessionId", "");
        InputStream input = activeReads.get(sessionId);
        if (input == null) {
            call.reject("Audio read session has expired");
            return;
        }
        try {
            byte[] buffer = new byte[READ_CHUNK_SIZE];
            int count = 0;
            while (count < buffer.length) {
                int read = input.read(buffer, count, buffer.length - count);
                if (read < 0) break;
                count += read;
            }
            boolean done = count == 0;
            JSObject response = new JSObject();
            response.put("base64", count == 0 ? "" : Base64.encodeToString(buffer, 0, count, Base64.NO_WRAP));
            response.put("done", done);
            call.resolve(response);
            if (done) closeRead(sessionId);
        } catch (Exception error) {
            closeRead(sessionId);
            call.reject("Could not read the selected audio file", error);
        }
    }

    @PluginMethod
    public void closeReadFile(PluginCall call) {
        closeRead(call.getString("sessionId", ""));
        call.resolve();
    }

    private void closeRead(String sessionId) {
        InputStream input = activeReads.remove(sessionId);
        if (input == null) return;
        try { input.close(); } catch (Exception ignored) { }
    }

    private JSArray listAudioFiles(Uri treeUri) {
        List<JSObject> files = new ArrayList<>();
        List<String> scanErrors = new ArrayList<>();
        try {
            String rootId = DocumentsContract.getTreeDocumentId(treeUri);
            collectAudioFiles(treeUri, rootId, files, new java.util.HashSet<>(), scanErrors);
        } catch (Exception error) {
            android.util.Log.w("FLBFolderAccess", "Could not list audio files in selected folder", error);
            throw new IllegalStateException("Não foi possível ler esta pasta. Escolha outra pasta de música e permita o acesso.", error);
        }
        if (files.isEmpty() && !scanErrors.isEmpty()) {
            throw new IllegalStateException("O Android não permitiu ler o conteúdo desta pasta. Selecione a pasta novamente e confirme o acesso.");
        }
        JSArray result = new JSArray();
        for (JSObject file : files) result.put(file);
        return result;
    }

    private void collectAudioFiles(Uri treeUri, String parentId, List<JSObject> files,
                                   java.util.Set<String> visited, List<String> scanErrors) {
        if (parentId == null || !visited.add(parentId)) return;
        Uri childrenUri = DocumentsContract.buildChildDocumentsUriUsingTree(treeUri, parentId);
        String[] columns = {
            DocumentsContract.Document.COLUMN_DOCUMENT_ID,
            DocumentsContract.Document.COLUMN_DISPLAY_NAME,
            DocumentsContract.Document.COLUMN_MIME_TYPE,
            DocumentsContract.Document.COLUMN_SIZE,
            DocumentsContract.Document.COLUMN_LAST_MODIFIED
        };

        try (Cursor cursor = getContext().getContentResolver().query(childrenUri, columns, null, null, null)) {
            if (cursor == null) return;
            int idColumn = cursor.getColumnIndex(DocumentsContract.Document.COLUMN_DOCUMENT_ID);
            int nameColumn = cursor.getColumnIndex(DocumentsContract.Document.COLUMN_DISPLAY_NAME);
            int mimeColumn = cursor.getColumnIndex(DocumentsContract.Document.COLUMN_MIME_TYPE);
            int sizeColumn = cursor.getColumnIndex(DocumentsContract.Document.COLUMN_SIZE);
            int modifiedColumn = cursor.getColumnIndex(DocumentsContract.Document.COLUMN_LAST_MODIFIED);
            if (idColumn < 0 || nameColumn < 0) {
                throw new IllegalStateException("O provedor de arquivos não informou os nomes dos arquivos.");
            }

            while (cursor.moveToNext()) {
                String documentId = cursor.getString(idColumn);
                String name = nameColumn >= 0 ? cursor.getString(nameColumn) : "";
                String mime = mimeColumn >= 0 && !cursor.isNull(mimeColumn) ? cursor.getString(mimeColumn) : "";
                if (DocumentsContract.Document.MIME_TYPE_DIR.equals(mime)) {
                    collectAudioFiles(treeUri, documentId, files, visited, scanErrors);
                } else if (isAudio(name, mime)) {
                    JSObject item = new JSObject();
                    item.put("uri", DocumentsContract.buildDocumentUriUsingTree(treeUri, documentId).toString());
                    item.put("name", name);
                    item.put("type", mime == null ? "" : mime);
                    item.put("size", sizeColumn >= 0 && !cursor.isNull(sizeColumn) ? cursor.getLong(sizeColumn) : 0L);
                    item.put("lastModified", modifiedColumn >= 0 && !cursor.isNull(modifiedColumn) ? cursor.getLong(modifiedColumn) : 0L);
                    files.add(item);
                }
            }
        } catch (Exception error) {
            android.util.Log.w("FLBFolderAccess", "Could not scan music subfolder " + parentId, error);
            scanErrors.add(parentId);
        }
    }

    private String documentName(Uri treeUri, String documentId) {
        Uri documentUri = DocumentsContract.buildDocumentUriUsingTree(treeUri, documentId);
        try (Cursor cursor = getContext().getContentResolver().query(documentUri,
            new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                int column = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (column >= 0) return cursor.getString(column);
            }
        } catch (Exception ignored) { }
        String path = treeUri.getLastPathSegment();
        return path == null || path.isEmpty() ? "Music" : path;
    }

    private boolean isAudio(String name, String mime) {
        if (mime != null && mime.toLowerCase(Locale.ROOT).startsWith("audio/")) return true;
        String lower = name == null ? "" : name.toLowerCase(Locale.ROOT);
        for (String extension : AUDIO_EXTENSIONS) if (lower.endsWith(extension)) return true;
        return false;
    }
}

