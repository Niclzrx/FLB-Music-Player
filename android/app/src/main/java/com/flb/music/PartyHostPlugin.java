package com.flb.music;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import android.content.Context;
import android.net.wifi.WifiManager;

import org.json.JSONObject;

@CapacitorPlugin(name = "PartyHost")
public class PartyHostPlugin extends Plugin {
    private MobilePartyServer server;
    private WifiManager.MulticastLock multicastLock;

    @PluginMethod
    public synchronized void startParty(PluginCall call) {
        try {
            if (server != null && server.isRunning()) {
                call.resolve(server.hostInfo());
                return;
            }
            JSArray tracks = call.getArray("tracks", new JSArray());
            server = new MobilePartyServer(
                this::dispatchEvent,
                call.getString("name", "Festa"),
                call.getString("entryMode", "free"),
                tracks
            );
            acquireMulticastLock();
            call.resolve(server.start());
        } catch (Exception error) {
            server = null;
            releaseMulticastLock();
            call.reject("Não foi possível abrir a festa nesta rede Wi-Fi.", error);
        }
    }

    @PluginMethod
    public void updateQueue(PluginCall call) {
        if (server != null) server.updateQueue(call.getObject("snapshot", new JSObject()));
        call.resolve();
    }

    @PluginMethod
    public synchronized void updateLibrary(PluginCall call) {
        try {
            if (server != null) server.updateLibrary(call.getArray("tracks", new JSArray()));
            call.resolve();
        } catch (Exception error) {
            call.reject("Não foi possível atualizar as músicas disponíveis na festa.", error);
        }
    }

    @PluginMethod
    public synchronized void stopParty(PluginCall call) {
        if (server != null) server.stop();
        server = null;
        releaseMulticastLock();
        call.resolve();
    }

    @PluginMethod
    public void setEntryMode(PluginCall call) {
        if (server != null) server.setEntryMode(call.getString("mode", "free"));
        call.resolve();
    }

    @PluginMethod
    public void resolvePending(PluginCall call) {
        if (server != null) server.resolvePending(
            call.getString("pendingId", ""),
            call.getBoolean("accept", false)
        );
        call.resolve();
    }

    @PluginMethod
    public void kickGuest(PluginCall call) {
        if (server != null) server.kickGuest(call.getString("guestId", ""));
        call.resolve();
    }

    @PluginMethod
    public void blockGuest(PluginCall call) {
        if (server != null) server.blockGuest(call.getString("guestId", ""));
        call.resolve();
    }

    @PluginMethod
    public void unblockGuest(PluginCall call) {
        if (server != null) server.unblockGuest(call.getString("deviceToken", ""));
        call.resolve();
    }

    private void dispatchEvent(String name, JSONObject data) {
        try {
            notifyListeners(name, JSObject.fromJSONObject(data));
        } catch (Exception ignored) { }
    }

    private void acquireMulticastLock() {
        try {
            WifiManager wifi = (WifiManager) getContext().getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            multicastLock = wifi.createMulticastLock("flb-party-discovery");
            multicastLock.setReferenceCounted(false);
            multicastLock.acquire();
        } catch (Exception ignored) { }
    }

    private void releaseMulticastLock() {
        try {
            if (multicastLock != null && multicastLock.isHeld()) multicastLock.release();
        } catch (Exception ignored) { }
        multicastLock = null;
    }
}
