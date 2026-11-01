package com.flb.music;

import android.util.Base64;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.NetworkInterface;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Enumeration;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.function.BiConsumer;

/** Small HTTP/SSE host for Android, compatible with the desktop party routes. */
final class MobilePartyServer {
    private static final int PORT = 47831;
    private static final int MAX_BODY = 60 * 1024 * 1024;
    private final BiConsumer<String, JSONObject> emit;
    private final JSONArray tracks = new JSONArray();
    private final Map<String, Guest> guests = new ConcurrentHashMap<>();
    private final Map<String, Pending> pending = new ConcurrentHashMap<>();
    private final Map<String, String> blocked = new ConcurrentHashMap<>();
    private final Map<String, byte[]> art = new ConcurrentHashMap<>();
    private final List<SseClient> sseClients = new CopyOnWriteArrayList<>();
    private final ExecutorService workers = Executors.newCachedThreadPool(runnable -> {
        Thread thread = new Thread(runnable, "flb-party-client");
        thread.setDaemon(true);
        return thread;
    });
    private final String code;
    private final String name;
    private volatile String entryMode;
    private volatile JSONObject snapshot = new SafeJson();
    private volatile ServerSocket serverSocket;
    private volatile DatagramSocket discoverySocket;

    MobilePartyServer(BiConsumer<String, JSONObject> emit, String roomName, String mode, JSArray library) throws Exception {
        this.emit = emit;
        String safeName = roomName == null ? "" : roomName.trim().replace("<", "").replace(">", "");
        this.name = safeName.isEmpty() ? "Festa" : safeName.substring(0, Math.min(32, safeName.length()));
        this.entryMode = "approval".equals(mode) ? "approval" : "free";
        SecureRandom random = new SecureRandom();
        this.code = String.format(Locale.US, "%06d", 100000 + random.nextInt(900000));
        if (library != null) for (int i = 0; i < library.length(); i++) tracks.put(library.getJSONObject(i));
        snapshot.put("queue", new JSONArray());
        snapshot.put("playing", false);
        snapshot.put("position", 0);
        snapshot.put("duration", 0);
        snapshot.put("volume", 1);
    }

    boolean isRunning() { return serverSocket != null && !serverSocket.isClosed(); }

    JSObject start() throws Exception {
        ServerSocket socket = new ServerSocket();
        socket.setReuseAddress(true);
        socket.bind(new InetSocketAddress("0.0.0.0", PORT));
        serverSocket = socket;
        workers.execute(() -> acceptLoop(socket));
        startDiscovery();
        return hostInfo();
    }

    JSObject hostInfo() {
        JSObject info = new JSObject();
        info.put("code", code);
        info.put("lanUrl", "http://" + lanAddress() + ":" + PORT);
        info.put("qrDataUrl", "");
        return info;
    }

    void stop() {
        broadcast("session-ended", new SafeJson());
        for (SseClient client : sseClients) client.close();
        sseClients.clear();
        try { if (serverSocket != null) serverSocket.close(); } catch (Exception ignored) { }
        serverSocket = null;
        try { if (discoverySocket != null) discoverySocket.close(); } catch (Exception ignored) { }
        discoverySocket = null;
        workers.shutdownNow();
        guests.clear();
        pending.clear();
        blocked.clear();
        art.clear();
        this.emit.accept("partyGuestsUpdate", new SafeJson().putValue("guests", new JSONArray()));
        this.emit.accept("partyPendingUpdate", new SafeJson().putValue("pending", new JSONArray()));
        this.emit.accept("partyBlockedUpdate", new SafeJson().putValue("blocked", new JSONArray()));
    }

    void updateQueue(JSONObject value) {
        snapshot = value == null ? new SafeJson() : value;
        broadcast("queue", queuePayload());
    }

    void setEntryMode(String mode) {
        entryMode = "approval".equals(mode) ? "approval" : "free";
        broadcast("queue", queuePayload());
    }

    void kickGuest(String id) {
        Guest guest = guests.get(id);
        if (guest == null) return;
        sendToGuest(id, "kicked", new SafeJson());
        leave(guest);
    }

    void blockGuest(String id) {
        Guest guest = guests.get(id);
        if (guest == null) return;
        blocked.put(guest.deviceToken, guest.name);
        this.emit.accept("partyGuestBlocked", new SafeJson().putValue("guestId", guest.id));
        kickGuest(id);
        emitBlocked();
    }

    void unblockGuest(String token) {
        blocked.remove(token);
        emitBlocked();
    }

    void resolvePending(String id, boolean accept) {
        Pending item = pending.remove(id);
        if (item == null) return;
        if (accept) addToQueue(item.track, item.guest, item.uploadedTrack);
        sendToGuest(item.guest.id, "pending-decision", new SafeJson()
            .putValue("pendingId", id).putValue("accepted", accept).putValue("track", item.dto));
        emitPending();
    }

    private void acceptLoop(ServerSocket listener) {
        while (!listener.isClosed()) {
            try {
                Socket client = listener.accept();
                workers.execute(() -> handle(client));
            } catch (Exception error) {
                if (!listener.isClosed()) android.util.Log.w("FLBParty", "Could not accept party client", error);
            }
        }
    }

    private void startDiscovery() {
        try {
            DatagramSocket socket = new DatagramSocket(null);
            socket.setReuseAddress(true);
            socket.setBroadcast(true);
            socket.bind(new InetSocketAddress(47832));
            discoverySocket = socket;
            workers.execute(() -> {
                byte[] buffer = new byte[128];
                while (!socket.isClosed()) {
                    try {
                        DatagramPacket question = new DatagramPacket(buffer, buffer.length);
                        socket.receive(question);
                        String message = new String(question.getData(), question.getOffset(), question.getLength(), StandardCharsets.UTF_8);
                        if (!"FLB_PARTY_DISCOVER".equals(message)) continue;
                        byte[] answer = "FLB_PARTY_FOUND:47831".getBytes(StandardCharsets.UTF_8);
                        socket.send(new DatagramPacket(answer, answer.length, question.getAddress(), question.getPort()));
                    } catch (Exception error) {
                        if (!socket.isClosed()) android.util.Log.w("FLBParty", "LAN discovery failed", error);
                    }
                }
            });
        } catch (Exception error) {
            android.util.Log.w("FLBParty", "Could not bind party discovery port", error);
        }
    }

    private void handle(Socket socket) {
        try {
            socket.setSoTimeout(0);
            InputStream input = socket.getInputStream();
            String requestLine = readLine(input);
            if (requestLine == null || requestLine.isEmpty()) { socket.close(); return; }
            String[] request = requestLine.split(" ", 3);
            if (request.length < 2) { socket.close(); return; }
            String method = request[0];
            String target = request[1];
            Map<String, String> headers = new ConcurrentHashMap<>();
            String line;
            while ((line = readLine(input)) != null && !line.isEmpty()) {
                int separator = line.indexOf(':');
                if (separator > 0) headers.put(line.substring(0, separator).trim().toLowerCase(Locale.ROOT), line.substring(separator + 1).trim());
            }
            int bodyLength = Math.min(MAX_BODY + 1, parseInt(headers.get("content-length"), 0));
            byte[] body = readBody(input, bodyLength);
            String path = target.split("\\?", 2)[0];
            Map<String, String> query = parseQuery(target);
            if ("OPTIONS".equals(method)) { send(socket, 204, "application/json", new byte[0]); return; }
            if (!"/".equals(path) && !"/api/session".equals(path) && !isGuestRequest(path)) {
                sendJson(socket, 404, new SafeJson().putValue("error", "not_found")); return;
            }
            if ("GET".equals(method) && "/".equals(path)) { sendLanding(socket); return; }
            if ("POST".equals(method) && "/api/session".equals(path)) { session(socket, body); return; }
            if ("GET".equals(method) && "/api/events".equals(path)) { events(socket, query.get("guestId")); return; }
            if ("GET".equals(method) && "/api/art".equals(path)) { serveArt(socket, query.get("artId")); return; }

            Guest guest = authenticated(headers.get("x-guest-id"));
            if (guest == null) { sendJson(socket, 401, new SafeJson().putValue("error", "invalid_guest")); return; }
            if ("GET".equals(method) && "/api/tracks".equals(path)) { searchTracks(socket, query.get("q"), query.get("limit")); return; }
            if ("GET".equals(method) && "/api/queue".equals(path)) { sendJson(socket, 200, queuePayload()); return; }
            if ("POST".equals(method) && "/api/add".equals(path)) { addTrack(socket, guest, body); return; }
            if ("POST".equals(method) && "/api/upload".equals(path)) { uploadTrack(socket, guest, query.get("name"), body); return; }
            if ("POST".equals(method) && "/api/pending/cancel".equals(path)) { cancelPending(socket, guest, body); return; }
            if ("POST".equals(method) && "/api/leave".equals(path)) { sendJson(socket, 200, new SafeJson().putValue("ok", true)); leave(guest); return; }
            sendJson(socket, 404, new SafeJson().putValue("error", "not_found"));
        } catch (Exception error) {
            try { sendJson(socket, 500, new SafeJson().putValue("error", "server_error")); } catch (Exception ignored) { }
        } finally {
            try { socket.close(); } catch (Exception ignored) { }
        }
    }

    private boolean isGuestRequest(String path) {
        return path.startsWith("/api/") && !"/api/session".equals(path);
    }

    private void session(Socket socket, byte[] bytes) throws Exception {
        JSONObject request = json(bytes);
        String suppliedCode = request.optString("code", "");
        String guestName = request.optString("name", "").trim();
        String token = request.optString("deviceToken", "").trim();
        if (guestName.isEmpty() || token.isEmpty()) { sendJson(socket, 400, new SafeJson().putValue("error", "missing_name")); return; }
        if (blocked.containsKey(token)) { sendJson(socket, 403, new SafeJson().putValue("error", "blocked")); return; }
        if (!code.equals(suppliedCode)) { sendJson(socket, 401, new SafeJson().putValue("error", "wrong_code")); return; }
        Guest guest = new Guest(UUID.randomUUID().toString().replace("-", "").substring(0, 16), guestName.substring(0, Math.min(24, guestName.length())), token);
        guests.put(guest.id, guest);
        emitGuests();
        sendJson(socket, 200, new SafeJson().putValue("guestId", guest.id)
            .putValue("hostName", "FLB Music Android")
            .putValue("roomName", name)
            .putValue("entryMode", entryMode));
    }

    private Guest authenticated(String id) {
        Guest guest = id == null ? null : guests.get(id);
        if (guest != null) guest.lastSeenAt = System.currentTimeMillis();
        return guest;
    }

    private void searchTracks(Socket socket, String rawQuery, String rawLimit) throws Exception {
        String query = rawQuery == null ? "" : rawQuery.toLowerCase(Locale.ROOT).trim();
        JSONArray result = new JSONArray();
        int limit = Math.min(100, Math.max(1, parseInt(rawLimit, 40)));
        int total = 0;
        for (int i = 0; i < tracks.length(); i++) {
            JSONObject track = tracks.optJSONObject(i);
            if (track == null) continue;
            String haystack = (track.optString("defaultTitle", "") + " " + track.optString("defaultArtist", "") + " " + track.optString("album", "")).toLowerCase(Locale.ROOT);
            if (!query.isEmpty() && !haystack.contains(query)) continue;
            total++;
            if (result.length() < limit) result.put(trackDto(track));
        }
        sendJson(socket, 200, new SafeJson().putValue("tracks", result).putValue("total", total));
    }

    private void addTrack(Socket socket, Guest guest, byte[] bytes) throws Exception {
        JSONObject request = json(bytes);
        String id = request.optString("trackId", "");
        JSONObject track = findTrack(id);
        if (track == null) { sendJson(socket, 404, new SafeJson().putValue("error", "unknown_track")); return; }
        if (guest.trackIds.contains(id)) { sendJson(socket, 409, new SafeJson().putValue("error", "duplicate")); return; }
        JSONObject dto = trackDto(track);
        guest.trackIds.add(id);
        if ("approval".equals(entryMode)) {
            String pendingId = "p" + UUID.randomUUID().toString().substring(0, 8);
            Pending item = new Pending(pendingId, guest, track, dto, null);
            pending.put(pendingId, item);
            emitPending();
            sendJson(socket, 202, new SafeJson().putValue("ok", true).putValue("pending", true).putValue("pendingId", pendingId).putValue("track", dto));
            return;
        }
        guest.addedTracks++;
        addToQueue(track, guest, null);
        emitGuests();
        sendJson(socket, 202, new SafeJson().putValue("ok", true).putValue("track", dto));
    }

    private void uploadTrack(Socket socket, Guest guest, String fileName, byte[] bytes) throws Exception {
        if (bytes.length == 0 || bytes.length > MAX_BODY) { sendJson(socket, 413, new SafeJson().putValue("error", "file_too_big")); return; }
        String safeName = fileName == null ? "track.mp3" : fileName.substring(fileName.lastIndexOf('/') + 1).replaceAll("[^A-Za-z0-9._ -]", "_");
        String extension = safeName.contains(".") ? safeName.substring(safeName.lastIndexOf('.')).toLowerCase(Locale.ROOT) : "";
        if (!".mp3 .flac .wav .m4a .aac .ogg .opus .wma .aiff .ape".contains(extension)) { sendJson(socket, 415, new SafeJson().putValue("error", "unsupported_format")); return; }
        String base = safeName.contains(".") ? safeName.substring(0, safeName.lastIndexOf('.')) : safeName;
        String[] parts = base.split("\\s+-\\s+", 2);
        String artist = parts.length > 1 ? parts[0] : "Unknown artist";
        String title = parts.length > 1 ? parts[1] : base;
        String location = "flb-party-upload://" + UUID.randomUUID();
        SafeJson track = new SafeJson()
            .putValue("fileLocation", location).putValue("r_fileLocation", location)
            .putValue("fileName", safeName).putValue("title", title).putValue("artist", artist)
            .putValue("defaultTitle", title).putValue("defaultArtist", artist)
            .putValue("extractedTitle", title).putValue("extractedArtist", artist)
            .putValue("album", "Unknown album").putValue("albumArt", "")
            .putValue("duration", 0).putValue("formattedLength", "00:00")
            .putValue("dateAdded", System.currentTimeMillis())
            .putValue("folderInfo", new SafeJson().putValue("name", "Party upload").putValue("path", "Party uploads"));
        SafeJson uploaded = new SafeJson(track.toString());
        uploaded.putValue("mobileBase64", Base64.encodeToString(bytes, Base64.NO_WRAP));
        JSONObject dto = trackDto(track);
        guest.trackIds.add(hash(location));
        if ("approval".equals(entryMode)) {
            String pendingId = "p" + UUID.randomUUID().toString().substring(0, 8);
            pending.put(pendingId, new Pending(pendingId, guest, track, dto, uploaded));
            emitPending();
            sendJson(socket, 202, new SafeJson().putValue("ok", true).putValue("pending", true).putValue("pendingId", pendingId).putValue("track", dto));
            return;
        }
        guest.addedTracks++;
        addToQueue(track, guest, uploaded);
        emitGuests();
        sendJson(socket, 200, new SafeJson().putValue("ok", true).putValue("track", dto));
    }

    private void cancelPending(Socket socket, Guest guest, byte[] bytes) throws Exception {
        String id = json(bytes).optString("pendingId", "");
        Pending item = pending.get(id);
        if (item == null || !item.guest.id.equals(guest.id)) { sendJson(socket, 404, new SafeJson().putValue("error", "unknown_pending")); return; }
        pending.remove(id);
        emitPending();
        sendJson(socket, 200, new SafeJson().putValue("ok", true));
    }

    private SafeJson safeCopy(JSONObject source) {
        SafeJson result = new SafeJson();
        java.util.Iterator<String> keys = source.keys();
        while (keys.hasNext()) { String key = keys.next(); result.putValue(key, source.opt(key)); }
        return result;
    }

    private void addToQueue(JSONObject track, Guest guest, JSONObject uploaded) {
        SafeJson suggestedBy = new SafeJson().putValue("guestId", guest.id).putValue("guestName", guest.name);
        SafeJson payload = new SafeJson().putValue("fileLocation", track.optString("fileLocation", "")).putValue("suggestedBy", suggestedBy);
        if (uploaded != null) payload.putValue("uploadedTrack", safeCopy(uploaded).putValue("suggestedBy", suggestedBy));
        this.emit.accept("partyGuestTrackRequested", payload);
    }

    private JSONObject findTrack(String id) {
        for (int i = 0; i < tracks.length(); i++) {
            JSONObject track = tracks.optJSONObject(i);
            if (track != null && id.equals(hash(track.optString("fileLocation", "")))) return track;
        }
        return null;
    }

    private JSONObject trackDto(JSONObject track) {
        String location = track.optString("fileLocation", "");
        String artValue = track.optString("albumArt", "");
        String artId = null;
        if (!artValue.isEmpty()) {
            artId = hash(artValue);
            byte[] data = decodeImage(artValue);
            if (data != null) art.put(artId, data);
        }
        SafeJson dto = new SafeJson()
            .putValue("id", location.isEmpty() ? JSONObject.NULL : hash(location))
            .putValue("title", track.optString("defaultTitle", track.optString("fileName", "")))
            .putValue("artist", track.optString("defaultArtist", ""))
            .putValue("album", track.optString("album", ""))
            .putValue("formattedLength", track.optString("formattedLength", ""))
            .putValue("duration", track.optDouble("duration", 0))
            .putValue("artId", artId == null ? JSONObject.NULL : artId);
        JSONObject suggestedBy = track.optJSONObject("suggestedBy");
        if (suggestedBy != null) dto.putValue("suggestedBy", suggestedBy);
        return dto;
    }

    private JSONObject queuePayload() {
        JSONArray queue = new JSONArray();
        JSONArray rawQueue = snapshot.optJSONArray("queue");
        if (rawQueue != null) for (int i = 0; i < rawQueue.length(); i++) {
            JSONObject track = rawQueue.optJSONObject(i);
            if (track != null) queue.put(trackDto(track));
        }
        JSONObject nowPlaying = snapshot.optJSONObject("nowPlaying");
        return new SafeJson()
            .putValue("queue", queue)
            .putValue("nowPlaying", nowPlaying == null ? JSONObject.NULL : trackDto(nowPlaying))
            .putValue("playing", snapshot.optBoolean("playing", false))
            .putValue("position", snapshot.optDouble("position", 0))
            .putValue("duration", snapshot.optDouble("duration", 0))
            .putValue("volume", snapshot.optDouble("volume", 1))
            .putValue("roomName", name)
            .putValue("entryMode", entryMode);
    }

    private void events(Socket socket, String guestId) throws Exception {
        Guest guest = authenticated(guestId);
        if (guest == null) { sendJson(socket, 401, new SafeJson().putValue("error", "invalid_guest")); return; }
        OutputStream output = socket.getOutputStream();
        writeHeaders(output, 200, "text/event-stream; charset=utf-8", -1, true);
        SseClient client = new SseClient(guest.id, socket, output);
        sseClients.add(client);
        client.send("queue", queuePayload());
        try {
            while (isRunning() && !socket.isClosed()) {
                Thread.sleep(15000);
                client.send("heartbeat", new SafeJson().putValue("t", System.currentTimeMillis()));
            }
        } catch (Exception ignored) {
        } finally {
            sseClients.remove(client);
            try { socket.close(); } catch (Exception ignored) { }
        }
    }

    private void serveArt(Socket socket, String artId) throws Exception {
        byte[] image = art.get(artId == null ? "" : artId);
        if (image == null) { sendJson(socket, 404, new SafeJson().putValue("error", "unknown_art")); return; }
        send(socket, 200, "image/jpeg", image);
    }

    private void sendLanding(Socket socket) throws Exception {
        String html = "<!doctype html><meta name='viewport' content='width=device-width'><body style='font-family:sans-serif;background:#111;color:#fff;display:grid;place-items:center;height:100vh'><main style='text-align:center'><h1>🎉 " + escapeHtml(name) + "</h1><p>Abra o FLB Music e escolha <b>Entrar</b>.</p><p>Código: <b>" + code + "</b></p></main></body>";
        send(socket, 200, "text/html; charset=utf-8", html.getBytes(StandardCharsets.UTF_8));
    }

    private void emitGuests() {
        JSONArray result = new JSONArray();
        for (Guest guest : guests.values()) result.put(new SafeJson()
            .putValue("id", guest.id).putValue("name", guest.name)
            .putValue("addedTracks", guest.addedTracks).putValue("joinedAt", guest.joinedAt));
        this.emit.accept("partyGuestsUpdate", new SafeJson().putValue("guests", result));
    }

    private void emitPending() {
        JSONArray result = new JSONArray();
        for (Pending item : pending.values()) result.put(new SafeJson()
            .putValue("id", item.id).putValue("guestId", item.guest.id)
            .putValue("guestName", item.guest.name).putValue("submittedAt", item.createdAt)
            .putValue("track", item.dto));
        this.emit.accept("partyPendingUpdate", new SafeJson().putValue("pending", result));
    }

    private void emitBlocked() {
        JSONArray result = new JSONArray();
        for (Map.Entry<String, String> item : blocked.entrySet()) result.put(new SafeJson()
            .putValue("token", item.getKey()).putValue("name", item.getValue()));
        this.emit.accept("partyBlockedUpdate", new SafeJson().putValue("blocked", result));
    }

    private void leave(Guest guest) {
        guests.remove(guest.id);
        pending.values().removeIf(item -> item.guest.id.equals(guest.id));
        for (SseClient client : sseClients) if (client.guestId.equals(guest.id)) client.close();
        this.emit.accept("partyGuestLeft", new SafeJson().putValue("guestId", guest.id).putValue("guestName", guest.name));
        emitGuests();
        emitPending();
    }

    private void sendToGuest(String guestId, String event, JSONObject payload) {
        for (SseClient client : sseClients) if (client.guestId.equals(guestId)) client.send(event, payload);
    }

    private void broadcast(String event, JSONObject payload) {
        for (SseClient client : sseClients) client.send(event, payload);
    }

    private void sendJson(Socket socket, int status, JSONObject value) throws Exception {
        send(socket, status, "application/json; charset=utf-8", value.toString().getBytes(StandardCharsets.UTF_8));
    }

    private void send(Socket socket, int status, String type, byte[] body) throws Exception {
        OutputStream output = socket.getOutputStream();
        writeHeaders(output, status, type, body.length, false);
        output.write(body);
        output.flush();
    }

    private void writeHeaders(OutputStream output, int status, String type, int length, boolean keepAlive) throws Exception {
        String phrase = status == 200 ? "OK" : status == 202 ? "Accepted" : status == 204 ? "No Content" : status == 400 ? "Bad Request" : status == 401 ? "Unauthorized" : status == 403 ? "Forbidden" : status == 404 ? "Not Found" : status == 409 ? "Conflict" : status == 413 ? "Payload Too Large" : status == 415 ? "Unsupported Media Type" : status == 429 ? "Too Many Requests" : "Internal Server Error";
        String headers = "HTTP/1.1 " + status + " " + phrase + "\r\n" +
            "Content-Type: " + type + "\r\n" +
            "Access-Control-Allow-Origin: *\r\n" +
            "Access-Control-Allow-Headers: content-type, x-guest-id\r\n" +
            "Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n" +
            (length >= 0 ? "Content-Length: " + length + "\r\n" : "") +
            "Cache-Control: no-cache\r\n" +
            "Connection: " + (keepAlive ? "keep-alive" : "close") + "\r\n\r\n";
        output.write(headers.getBytes(StandardCharsets.UTF_8));
        output.flush();
    }

    private String readLine(InputStream input) throws Exception {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        int value;
        while ((value = input.read()) != -1) {
            if (value == '\n') break;
            if (value != '\r') bytes.write(value);
            if (bytes.size() > 8192) throw new Exception("HTTP header line too long");
        }
        if (value == -1 && bytes.size() == 0) return null;
        return bytes.toString("UTF-8");
    }

    private byte[] readBody(InputStream input, int length) throws Exception {
        if (length <= 0) return new byte[0];
        ByteArrayOutputStream result = new ByteArrayOutputStream(Math.min(length, 1024 * 1024));
        byte[] buffer = new byte[64 * 1024];
        int remaining = length;
        while (remaining > 0) {
            int count = input.read(buffer, 0, Math.min(buffer.length, remaining));
            if (count < 0) break;
            result.write(buffer, 0, count);
            remaining -= count;
        }
        return result.toByteArray();
    }

    private JSONObject json(byte[] bytes) throws Exception {
        return bytes.length == 0 ? new SafeJson() : new JSONObject(new String(bytes, StandardCharsets.UTF_8));
    }

    private Map<String, String> parseQuery(String target) {
        Map<String, String> result = new ConcurrentHashMap<>();
        int query = target.indexOf('?');
        if (query < 0) return result;
        for (String pair : target.substring(query + 1).split("&")) {
            String[] item = pair.split("=", 2);
            try { result.put(URLDecoder.decode(item[0], "UTF-8"), item.length > 1 ? URLDecoder.decode(item[1], "UTF-8") : ""); }
            catch (Exception ignored) { }
        }
        return result;
    }

    private int parseInt(String value, int fallback) { try { return Integer.parseInt(value); } catch (Exception ignored) { return fallback; } }

    private String lanAddress() {
        try {
            Enumeration<NetworkInterface> interfaces = NetworkInterface.getNetworkInterfaces();
            while (interfaces.hasMoreElements()) {
                NetworkInterface network = interfaces.nextElement();
                if (!network.isUp() || network.isLoopback()) continue;
                Enumeration<InetAddress> addresses = network.getInetAddresses();
                while (addresses.hasMoreElements()) {
                    InetAddress address = addresses.nextElement();
                    if (address instanceof Inet4Address && !address.isLoopbackAddress() && !address.isLinkLocalAddress()) return address.getHostAddress();
                }
            }
        } catch (Exception ignored) { }
        return "127.0.0.1";
    }

    private byte[] decodeImage(String value) {
        try {
            if (!value.startsWith("data:")) return null;
            int comma = value.indexOf(',');
            if (comma < 0) return null;
            return Base64.decode(value.substring(comma + 1), Base64.DEFAULT);
        } catch (Exception ignored) { return null; }
    }

    private String hash(String input) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-1").digest(input.getBytes(StandardCharsets.UTF_8));
            StringBuilder result = new StringBuilder();
            for (byte value : digest) result.append(String.format(Locale.US, "%02x", value));
            return result.substring(0, 16);
        } catch (Exception ignored) { return Integer.toHexString(input.hashCode()); }
    }

    private String escapeHtml(String input) { return input.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"); }

    private final class SseClient {
        final String guestId;
        final Socket socket;
        final OutputStream output;
        SseClient(String id, Socket socket, OutputStream output) { this.guestId = id; this.socket = socket; this.output = output; }
        synchronized void send(String event, JSONObject payload) {
            try {
                output.write(("event: " + event + "\ndata: " + payload.toString() + "\n\n").getBytes(StandardCharsets.UTF_8));
                output.flush();
            } catch (Exception error) { close(); }
        }
        void close() { try { socket.close(); } catch (Exception ignored) { } }
    }

    private static final class Guest {
        final String id, name, deviceToken;
        final long joinedAt = System.currentTimeMillis();
        final java.util.Set<String> trackIds = Collections.newSetFromMap(new ConcurrentHashMap<>());
        volatile long lastSeenAt = joinedAt;
        volatile int addedTracks = 0;
        Guest(String id, String name, String token) { this.id = id; this.name = name; this.deviceToken = token; }
    }

    private static final class SafeJson extends JSONObject {
        SafeJson() { super(); }
        SafeJson(String value) throws JSONException { super(value); }
        SafeJson putValue(String key, Object value) {
            try { put(key, value); } catch (JSONException ignored) { }
            return this;
        }
    }

    private static final class Pending {
        final String id; final Guest guest; final JSONObject track, dto, uploadedTrack; final long createdAt = System.currentTimeMillis();
        Pending(String id, Guest guest, JSONObject track, JSONObject dto, JSONObject upload) { this.id = id; this.guest = guest; this.track = track; this.dto = dto; this.uploadedTrack = upload; }
    }
}


