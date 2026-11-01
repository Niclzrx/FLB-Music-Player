# Relatório CEIA — Análise completa do port Android (Capacitor)

**Para:** IA(s) analistas com outras percepções (arquitetura, performance, segurança, Android, UX)
**Data:** 2026-11-01 (manhã, horário de Brasília)
**Autor:** análise estática do port mobile existente — **nenhum código foi alterado**
**Estado do repositório no momento da análise:**
- `HEAD` = `66c0aca` ("CEIA: guia transcriçao suave")
- **Há trabalho por commitar (programador ativo)**: 7 ficheiros modificados no working tree —
  `android/.../MobilePartyServer.java`, `src/main/modules/party/PartyServer.ts`,
  `src/renderer/i18n/{en,pt-BR}.ts`, `src/renderer/store/modules/local-music/party-manager.ts`,
  `src/renderer/views/party/party-view.vue`, `src/types/index.ts` (+458/−77).
  O tema do WIP é uma feature de "sala ao vivo" (status online/connecting dos convidados,
  copiar código/convite, reconectar). **Este relatório descreve o working tree completo** —
  não o commit `HEAD`. Se for propor mudanças em party-*, MobilePartyServer ou i18n,
  **conflitará com o programador**; prefira análise/validação nessas áreas, não escrita.
- Artefactos: `mobile/www` buildado às 09:04 (inclui tudo até ao HEAD);
  `android/app/src/main/assets/public` sincronizado às 08:31 — **assets do APK dessincronizados**,
  correr `npm run android:sync` antes de qualquer teste em dispositivo.

**Commits do port (base da análise):** `81a712a` (feat: mobile port), `73b4637` (fix: mobile port),
`3c37a80` (fix: mobile port feat: transição suave), `66c0aca` (doc do fade).
Relatório pré-existente do fade: `docs/mobile-track-fade-report.md` (ler antes; não duplica aqui).

---

## 1. O que é o port — arquitetura em uma página

O app Android é o **mesmo renderer Vue 2** do Electron, com uma camada de emulação do `ipcRenderer`:

```
┌─ Renderer (bundle compartilhado, src/renderer + src/App.vue) ─────────────┐
│  store Vuex, componentes, party-view, settings...                         │
│  import { ipcRenderer, isMobileApp } from "@/platform/ipc"               │
└───────────────┬───────────────────────────────────────────────────────────┘
                │
   src/platform/ipc.ts ─ detecta: tem `window.process.versions.electron` + require?
                │
      ┌─────────┴──────────┐
      │ Electron           │ Mobile (WebView Capacitor)
      │ require("electron")│ mobile-ipc.ts (848 linhas) — shim:
      │ .ipcRenderer real  │  • IndexedDB "flb-music-mobile" (stores: tracks, audio, records)
      │                    │  • registerPlugin FolderAccess (SAF) + PartyHost (Java)
      │                    │  • emite eventos via handlers Map (emula .on/.emit)
      │                    │  • fontes: fileLocation = "flb-media://<blobId>"
      │                    │    resolvido por toFileUrl → window.__FLB_MEDIA_URLS__ → blob:
      └────────────────────┘
Nativo (android/app/src/main/java/com/flb/music/):
  • MainActivity.java — regista os 2 plugins
  • FolderAccessPlugin.java (187 l.) — ACTION_OPEN_DOCUMENT_TREE, lista recursivamente
    áudio, readFile devolve ficheiro inteiro em **base64** pela bridge
  • PartyHostPlugin.java (111 l.) — fachada + MulticastLock
  • MobilePartyServer.java (650 l.) — servidor HTTP+SSE caseiro na porta **47831**,
    discovery UDP **47832**, compatível com as rotas do PartyServer desktop
Build: npm run build:mobile (vue-cli build → mobile/www, FLB_MOBILE_BUILD=1 + --openssl-legacy-provider)
       npm run android:sync (cap sync) → npm run android:apk (gradlew assembleDebug)
Capacitor 8.6 · minSdk 24 · compile/targetSdk 36 · appId com.flb.music
```

**Decisões estruturais que explicam quase todos os achados:**

1. **Cópia integral da biblioteca**: ao escolher uma pasta, cada áudio é lido do SAF,
   convertido em base64, atravessa a bridge, vira `File` → `Blob` → **IndexedDB**. A biblioteca
   do telemóvel é duplicada no armazenamento do app. Consequências: import lento, pico de
   memória por ficheiro, arranque com `getAll()` de tudo.
2. **Capas embutidas ficam como `data:` URL dentro dos objetos track** (lidas do ID3 no
   navegador). Consequência: qualquer serialização de tracks (bridge, JSON, partilha na festa)
   carrega centenas de KB por faixa.
3. **Party no Android é reescrita Java do servidor desktop** (compatível por protocolo,
   não por código) — as proteções do desktop (rate limiters, limpeza de uploads em disco)
   **não** migraram todas (ver §4).
4. O renderer continua a depender de invariantes DOM/Node do Electron
   (`document.querySelector("audio")`, `require` de módulos npm, `file://`)
   — cada uma delas é um ponto de verificação obrigatório (ver §3).

---

## 2. Mapa de ficheiros do port

| Camada | Ficheiro | Papel / notas |
|---|---|---|
| Plataforma | `src/platform/ipc.ts` (21 l.) | Ponto único: `isMobileApp`, `ipcRenderer`, `readTrackBlob` |
| Shim | `src/platform/mobile-ipc.ts` (848 l.) | **O coração do port**: IDB, import, tags ID3 escritas/leres à mão, capas online (Deezer), party events, emulate `send`/`invoke`/`on` |
| UI | `src/App.vue` | Bottom nav, brand bar, ~590 linhas de CSS `@media (max-width:700px)` com `!important` |
| UI | `src/renderer/views/party/party-view.vue` | Guest/host mobile, scanner QR (jsQR), input manual de endereço |
| UI | `settings.vue`, `on-board.vue`, `home-tab.vue` | Escondem peças desktop; onboarding mobile com flag `flb-mobile-onboard-complete` |
| Store | `party-manager.ts` | `partyStart` envia biblioteca no mobile; QR gerado no renderer (`qrcode`); normaliza `hostUrl` |
| Store | `playback-manger.ts` | Fade na troca (compartilhado); `queueTracksFromGuest` |
| Util | `src/renderer/utils/index.ts` | `toFileUrl` resolve `flb-media://`; `trackSource` |
| Nativo | `FolderAccessPlugin.java` | SAF recursivo; **readFile = ficheiro inteiro em base64** |
| Nativo | `MobilePartyServer.java` | HTTP/SSE/UDP caseiro; `SafeJson` (JSONObject que engole erros) |
| Build | `mobile/build.mjs`, `mobile/build-apk.mjs`, `capacitor.config.json` | `allowMixedContent: true` (necessário p/ http LAN) |
| Manifest | `AndroidManifest.xml` | INTERNET, CAMERA, CHANGE_WIFI_MULTICAST_STATE, ACCESS_WIFI/NETWORK_STATE; `usesCleartextTraffic=true`; **sem FOREGROUND_SERVICE/WAKE_LOCK** |

---

## 3. Contratos e invariantes (não quebrar — ou verificar que continuam válidos)

1. **Canais IPC**: o shim tem de falar a linguagem de `ipc-listener.vue` (26 listeners).
   Canais emitidos pelo shim: `userSettings`, `userPlaylists`, `recentlyPlayed`, `playStats`,
   `foldersToScan`, `processedFiles`, `addMultipleTracks`, `parsingProgress`, `parsingDone`,
   `isOnline`, `appVersion`, `userID`, `updatedTrack`, `deleteComplete`, `coversRepaired`,
   `notification`, `closeNotification`, `urlImage`, `importedCoverArt` + eventos party.
   Canais ignorados de propósito (no-op): `sendNotification`, `closeWindow`, `minimize`,
   `maximize`, `toggleMiniMode`, `checkForUpdate`, `downloadArtistPicture` (mobile-ipc.ts:753-761).
2. **Primeiro `<audio>` do DOM é o principal** (invariante do fade, do equalizer, do
   track-bar, do party-manager). `durationOf()` cria `<audio>` fora do DOM — seguro.
3. **`fileLocation` mobile = `flb-media://<blobId>`**; resolução por `toFileUrl` →
   `window.__FLB_MEDIA_URLS__[filePath]` (utils/index.ts:19-20). Uploads de convidados usam
   `flb-party-upload://<uuid>` — **protocolo diferente** (ver A1).
4. **Dedup de importação por `mobileSourceKey`**: pastas = `${folder.uri}|${uri}|${size}|${mtime}`;
   ficheiros soltos = `name:size:lastModified`.
5. **WebAudio**: volume master é `GainNode` (equalizer.ts), não `element.volume`; contexto
   suspenso até gesto (`pointerdown`/`keydown` já registados).
6. **Party protocolo**: porta 47831 (HTTP), 47832 (UDP `FLB_PARTY_DISCOVER` →
   `FLB_PARTY_FOUND:47831`); rotas `/api/session`, `/api/events` (SSE, guestId por query),
   `/api/tracks`, `/api/queue`, `/api/add`, `/api/upload`, `/api/pending/cancel`, `/api/leave`,
   `/api/art`. Compatível com convidados desktop (EventSource sem headers → guestId na query).

---

## 4. Achados — analisar, não corrigir sem coordenação

Severidade: 🔴 suspeito de bug/quebra · 🟠 risco alto · 🟡 médio · ⚪ menor/dívida.

### A. Suspeitos de bug (reproduzir/verificar primeiro)

**A1 🔴 Upload de convidado pode não tocar num host Android.**
No desktop o upload é gravado em disco real (`PartySession.PARTY_UPLOADS_FOLDER`) com path
verdadeiro. No Android, `MobilePartyServer.uploadTrack` cria
`fileLocation = "flb-party-upload://<uuid>"` (java:313) e o shim guarda o blob em
`mediaUrls[fileLocation]` (mobile-ipc.ts:638) — **mas** `toFileUrl` só resolve `flb-media://`
(utils/index.ts:19); para `flb-party-upload://` cai no ramo `file://` e gera
`file:///flb-party-upload://...` → fonte inválida. Verificar em dispositivo: host Android +
convidado envia uma música → ela entra na fila e toca?

**A2 🟡 `parsingProgress` com formato errado.**
O shim emite `[percent, total]` (mobile-ipc.ts:242) mas os consumidores esperam
`[currentIndex, total]` e mostram `${currentIndex}/${total}` (ipc-listener.vue:255,
on-board.vue:183) → notificação "45/12". O canal é **morto no desktop** (main nunca emite),
só o mobile o usa — o "100" esconde o onboarding por acidente do percento. Decidir o contrato.

**A3 🟡 Uploads deixam lixo permanente no IndexedDB.**
`deleteTracks` só apaga do store `audio` se existir registo em `tracks`
(`if (record) delete(record.mobileBlobId)`, mobile-ipc.ts:478). Uploads de convidados não têm
registo em `tracks` → áudio órfão para sempre. Acresce: `departedGuestPlayingFiles` no desktop
apaga o ficheiro ("deleted by the main process") — no mobile ninguém o faz.

**A4 ⚪ Contagem de capas reparadas ilegível.**
`subTitle: "notification.coversRepairedCount"` emitido sem valores (mobile-ipc.ts:588) —
a chave tem `{count}` (pt-BR.ts:324) → mostrará "{count} capa(s)" literal (confirmar como
`base-notification` resolve chaves/valores).

**A5 🟠 Remoção de pasta identifica por NOME.**
`removeFromScannedFolders` compara `item.name === targetPath` (mobile-ipc.ts:768) e apaga
tracks com `folderInfo.path === folder.name` (777) — `folderInfo.path` é o nome, não o path
(228-230). Duas pastas com o mesmo nome (ex.: "Music" em locais diferentes) → tracks erradas
apagadas.

**A6 ⚪ Estado residual pós-reset.**
`resetApp` limpa IDB e mediaUrls mas não `flb-mobile-onboard-complete` /
`flb-mobile-has-library` (mobile-ipc.ts:718-740). `flb-mobile-has-library` é escrito em 2
sítios e **nunca lido** (morta).

**A7 🟡 Importações paralelas podem duplicar faixas.**
`initializeApp` dispara rescan de todas as pastas em background (mobile-ipc.ts:358-363);
o utilizador pode carregar "Adicionar pasta"/"refresh" ao mesmo tempo — cada chamada tem o
seu `Set` de dedupe (`known`) → corrida com resultado possível: duplicados.

**A8 🟡 Mensagem de erro errada para endereço inválido na festa.**
`new URL(hostUrl)` em `joinParty` (party-manager.ts:370) lança exceção com input inválido
(espaços, "htp://..."), cai no `catch` genérico → "party.errorNotFound" em vez de dizer que o
endereço é inválido. Em WIP (programador está neste ficheiro).

### B. Memória e performance (telemóveis de gama média/baixa)

**B1 🔴 `partyStart` serializa a biblioteca INTEIRA pela Capacitor bridge — com capas.**
`party-manager.ts:301` envia `addedTracks` (objetos TrackType completos, incl. `albumArt`
`data:`URL de centenas de KB cada) → `MobilePartyServer` constructor mete tudo num `JSONArray`
(java:70). Estimativa grosseira: 1.000 faixas com capa embutida ≈ **centenas de MB de JSON**;
5.000 faixas = crash praticamente garantido em telemóvel comum. **Medir** (B1 na checklist):
criar festa com biblioteca grande e observar tempo de "a criar" e memória. Só o mobile envia
`tracks` (busca de convidado); desktop não tem este problema.

**B2 🟠 Fila da festa inteira com capas enviada a cada 3 s.**
`buildPartySnapshot` inclui `customQueue` + `nowPlaying` completos (ipc-listener.vue:94-105);
timer de 3 s (175-178) + debounce 250 ms (106-111) → bridge JSON repetido. Nota: os DTOs do
servidor para os convidados são enxutos (`trackDto` só id/título/artista/álbum/duração/artId) —
o peso é **host↔bridge**, não host↔convidado.

**B3 🟠 Capas redecodificadas em cada broadcast no servidor Java.**
`trackDto` chama `decodeImage` (base64 → bytes) por item a cada conversão (java:371-391) e
`art.put(...)` a cada vez — fila de 50 faixas com capa = 50 decodificações por evento, a cada
`updateQueue`/`setEntryMode`/heartbeat.

**B4 🔴 Importação de cada faixa passa 3–4 cópias pela memória.**
Caminho: `readFile` Java lê stream inteiro → `ByteArrayOutputStream` → base64
(FolderAccessPlugin.java:98-109) → string JSON pela bridge → `atob` → `Uint8Array` → `Blob`
(mobile-ipc.ts:254-259) → `file.arrayBuffer()` p/ tags (206) → blob no IDB (235). Para um FLAC
de 40 MB: pico de >250 MB transiente. **Um ficheiro de cada vez, sequencial** — biblioteca
grande = minutos e risco de OOM. Alternativa arquitetónica óbvia para um analisador Android:
ContentResolver com stream/cópia direta p/ ficheiro interno, ou `content://` no `<audio>`
(há trade-offs: WebView não toca `content://` diretamente — analisar).

**B5 🟠 `hydrateMediaUrls` cria uma blob URL por TODA a biblioteca no arranque**
(mobile-ipc.ts:308-319) e mantém-as até delete/reset. milhares de `URL.createObjectURL`
ativas — medir heap no WebView (as URLs não são revogadas; blobs grandes podem nunca ir p/ disco).

**B6 🟡 `allTracks()` (`getAll()` completo, capas incluídas) chamado ~7× durante cada import**
(mobile-ipc.ts:196, 246, 263, 281, 340, 449, 541) — recarrega a biblioteca toda repetidamente.

**B7 🟡 Rescan recursivo completo do SAF em cada arranque** (358-363) — para "conhecido"
só precisa de metadata, mas ainda é uma caminhada de cursor por cada subpasta/ficheiro a cada
boot (em background; aceitável, mas com bibliotecas de 10k ficheiros some bateria).

**B8 🟡 ID3 lido com o ficheiro inteiro em `arrayBuffer`** (206) — só os primeiros KB são
precisos; e capas ficam duplicadas (data:URL no registo track **e** no blob de áudio).

**B9 🟡 `writeMp3Tags` reescreve o ficheiro inteiro num Blob em memória** (400-435) e
**descarta todos os frames existentes** (só re-grava TIT2/TPE1/TALB/APIC): género, ano, nº de
faixa, letras embutidas, etc. **perdem-se** na edição de tags no mobile. Além disso escreve
encoding UTF-8 (3) num cabeçalho **ID3v2.3** — v2.3 oficialmente não prevê UTF-8 (a maioria
dos leitores aceita; verificar compatibilidade).

### C. Party server Android — segurança e robustez (comparar com o desktop)

**C1 🔴 Sem rate limiting.** Desktop: `RateLimiter` em `sessionLimiter`/`uploadLimiter`
(PartyServer.ts:104 etc.). Mobile: nenhum. `/api/session` aceita tentativas ilimitadas →
código de 6 dígitos (900k) brute-forceável em minutos a partir da LAN. Irónicamente o cliente
já trata `too_many_requests` (party-manager.ts:396) mas o servidor Java **nunca** o emite.

**C2 🟡 Convidado nunca expira.** `guest.lastSeenAt` é atualizado (java:262) mas nunca usado
para eviction; convidados mortos ficam na lista para sempre (o desktop tem lógica de saída/limpeza).

**C3 🟡 Dedupe de uploads ineficaz.** `guest.trackIds.add(hash(location))` com `location` de
UUID aleatório (java:326) — o mesmo ficheiro pode ser subido N vezes; no desktop o hash é do
conteúdo/path estável? (verificar PartySession desktop).

**C4 🟡 Upload de 60 MB triplica no host**: `readBody` (60MB máx.) + `mobileBase64` em
`SafeJson` (java:324) + passagem por `notifyListeners` → outra string na JS. Em telemóvel
antigo, risco real de OOM do processo host.

**C5 ⚪ `lanAddress()` devolve `127.0.0.1` como fallback silencioso** (java:584) — QR/URL
inútil gerado sem aviso (rede VPN/celular ativa, etc.). A lógica de prioridade wlan>
eth>outros (561-592) está correta e bem pensada — só o fallback é silencioso.

**C6 ⚪ Extensão vazia passa no allowlist** (`"...".contains("")` é true, java:308) —
ficheiro sem extensão é aceite como "track.mp3". Menor.

**C7 ⚪ Segurança geral LAN**: CORS `*`, auth por guestId de 16 chars, sem HTTPS, nome da sala
sanitizado só de `<>` (java:65). Aceitável para festa de casa; registar a decisão, não é bug.

### D. Lacunas funcionais do Android como player de música

**D1 🔴 Sem foreground service, sem MediaSession interativa, sem wakelock.**
Manifest (linhas 41-46): só INTERNET/CAMERA/WiFi. Consequências a validar em dispositivo:
- toca ao minimize/apagar ecrã? (áudio WebView em background geralmente continua, mas o
  processo pode ser morto; sem `FOREGROUND_SERVICE_MEDIA_PLAYBACK` não há garantia);
- notificação/lockscreen com botões? `update-windows-media-info.ts` só **põe metadados**
  (com guarda nova) e **não regista `setActionHandler`** → botões play/pause do Android não
  respondem;
- chamada telefónica/áudio de outro app: sem `AudioFocus` tratado, sobreposição de áudio.

**D2 🟠 "Descobrir" (FLBing) na bottom nav mobile** (App.vue:40-43 → rota `/meld`).
Os canais `bing*`/downloads não têm implementação no shim e o desktop usa `require("fs")`
nos managers de download. **Verificar o que acontece ao abrir o Meld no mobile** — provável
secção morta ou erros no console (não confirmado nesta análise).

**D3 🟡 Canais desktop no-ops** (lista em §3.1) — ok, mas "Repair Covers"/updates/artistas
têm comportamentos parciais: `fetchArtistsInfo`/`getLyrics` correm online sem problema;
`downloadArtistPicture` no-op silencioso.

### E. Design, build e dívida

**E1 ⚪ `FLB_MOBILE_BUILD=1` é definido no build mas nunca lido** (único grep: build.mjs:12).
Ou é intenção futura, ou sobrou. Enquanto existir, alguém pode pensar que existem dois bundles
comportamentais — não existem; é o mesmo bundle, distinguido só em runtime por `isMobileApp`.

**E2 🟡 Detecção por ausência de `require` do Electron** (ipc.ts:5-10) — abrir o renderer num
browser comum (ex.: `npx vue-cli-service serve`) classifica-o como "mobile" e ativa o shim
completo (IndexedDB + plugins ausentes → escolha de pasta falharia). Aceitável; registar.

**E3 🟡 `defaultSettings` duplicado** no shim (mobile-ipc.ts:321-334) vs
`src/main/modules/Settings.ts` — qualquer setting novo no desktop tem de ser espelhado à mão;
hoje já divergem (campos como `videoSupport`/notificações não espelhados — por omissão
falsos no mobile, que é o efeito desejado, mas frágil).

**E4 🟠 CSS mobile por `@media (max-width: 700px)` gigante no App.vue (~590 linhas, 190-719)**
com `!important` generalizado: aplica-se **também a janela desktop estreita**; a classe
`.mobileMode` existe no template mas quase tudo é por media query. Regras de settings duplicadas
(App.vue 442-485 vs `settings.vue` `.mobileSettings` 644+) — drift garantido a médio prazo.
Sugestão de direção (para a IA de arquitetura decidir, não para aplicar agora): ancorar no
flag/isMobileApp + classe, e restringir o media query ao layout.

**E5 ⚪ `require("qrcode")` no renderer** (party-manager.ts:305) — funciona (webpack embute o
pacote; Electron tem nodeIntegration), mas é um require dinâmico no renderer; alinhar com o
padrão de imports estáticos se for mexer.

**E6 ⚪ `send()` do shim é fire-and-forget** (mobile-ipc.ts:827-831) — erros só no console
(o comentário explica a restrição do gesto de toque para o file picker; é intencional).

**E7 ⚪ `components.js` e `glob.js` na raiz** (tracked, 22/10) e pasta `state/` vazia —
fora do escopo do port; parecem residuais. `dist_electron/`, `.gradle-user-home/` presentes.

**E8 🟡 Node ≥ 17 exigido pelo build mobile** (`--openssl-legacy-provider` em NODE_OPTIONS,
build.mjs:13) — em Node 16 o processo nem arranca. Registar no README do port.

**E9 ⚪ i18n** completo em en/pt-BR para as chaves novas (verificado). O WIP do programador
adiciona mais 14 chaves `party.*` em ambos — manter sincronia.

---

## 5. O que está bem resolvido (referência — não reescrever por esporte)

- Camada `platform/ipc.ts` limpa e mínima; **zero imports diretos de `electron`/`fs` restantes
  no renderer** (grep verificado).
- MulticastLock + seleção de interface com prioridade e exclusão de VPN/celular (java:561-592).
- `allowMixedContent` + `usesCleartextTraffic` presentes e **necessários** (WebView https
  tocando http do host LAN) — não remover.
- Permissão persistente SAF pedida com tolerância a providers que não a suportam
  (FolderAccessPlugin.java:56-62).
- `navigator.storage.persist()` pedido no arranque (mobile-ipc.ts:337-338) — importante dado
  que a biblioteca vive em IDB.
- QR é convite completo (endereço + código) lido pelo guest (party-view `onQrScanned`,
  1001-1016); host gera o QR no renderer — bom desenho, sem dependência nativa.
- Cancelamento do seletor de pasta tratado pelo código `CANCELLED` (mobile-ipc.ts:667-669).
- Onboarding mobile com skip + flags de localStorage; guardas de `mediaSession` no
  update-windows-media-info.
- O relatório do fade (docs/mobile-track-fade-report.md) mantém-se válido: o fade é código
  compartilhado; riscos de WebView listados lá (autoplay, AudioContext suspenso, rAF em
  background) continuam a aplicar-se.

---

## 6. Perguntas para as outras percepções (guia de análise)

**Para a IA de arquitetura:**
1. A1 é mesmo quebra? Consegue-se tocar `flb-party-upload://` por alguma rota que não vi?
2. Vale a pena manter a cópia integral da biblioteca p/ IDB (B4) ou deve o port ler via
   ContentResolver com cache seletiva? Que impacto tem no design de `flb-media://`?
3. `partyStart` com biblioteca inteira (B1): qual a alternativa correta — mandar só
   metadados sem capas (já é o que `trackDto` faz no desktop: só artId), ou paginação?

**Para a IA de performance/mobile:**
4. Medir B1/B4/B5 em aparelho real: heap do WebView com 1k/5k faixas; tempo de import por faixa.
5. D1: o áudio sobrevive a ecrã apagado e a 30 min em background neste setup (WebView puro,
   sem service)? É o teste que decide se o port é utilizável como player de bolso.

**Para a IA de segurança:**
6. C1: confirmar ausência de rate limit e desenhar o mínimo aceitável alinhado com o desktop
   (`RateLimiter` já existe em `src/main/modules/party/rateLimiter.ts` — pode ser portado
   quase tal qual para Java).
7. Rever o `MobilePartyServer` como alvo de rede: parsing de request line/headers por
   `readLine` byte-a-byte, `safeCopy`, `SafeJson` engolindo erros — há forma de resposta
   divergente que um convidado malicioso possa explorar?

**Para a IA de UX/produto:**
8. D2: estado real da aba "Descobrir" no mobile.
9. A2/A4: como mostrar progresso e notificações com contratos únicos (desktop vs shim).
10. E4: direção de CSS (classe vs media query) — decidir antes de mais styling mobile.

---

## 7. Como reconstruir e verificar (para quem for testar)

```bash
npm run build:mobile     # gera mobile/www (Node >= 17; usa --openssl-legacy-provider)
npm run android:sync     # build:mobile + cap sync android  (obrigatório: assets estavam velhos)
npm run android:apk      # gradlew assembleDebug
# ou: npx cap open android
```

**Checklist de aparelho (além da do relatório do fade):**
- [ ] A1: host Android + convidado envia música → toca? (o teste mais importante deste relatório)
- [ ] B1: biblioteca grande (≥1k faixas com capas) → criar festa → tempo/OOM.
- [ ] B4: importar pasta com FLACs grandes → memória/ANR.
- [ ] B5: arranque com biblioteca grande → heap do WebView.
- [ ] D1: tocar → apagar ecrã → 30 min → voltar; chamada telefónica no meio; lockscreen.
- [ ] D2: abrir "Descobrir" no mobile.
- [ ] A5: duas pastas com o mesmo nome → remover uma delas.
- [ ] C1: brute-force do código (validar que falha com facilidade — hoje deve conseguir-se).
- [ ] A7: carregar "Adicionar pasta" duas vezes seguidas rápido → duplicados?

---

## 8. Nota final

Análise estática; nada foi alterado. Todos os "suspeitos" (A1, A2, C1, B1…) são hipóteses
com localização exata para quem tiver o aparelho e o contexto do WIP confirmar. O programador
está agora em `party-view.vue`/`party-manager.ts`/`MobilePartyServer.java` (feature de sala
ao vivo com `status?: "connecting" | "online"` em `PartyGuestInfoType`) — qualquer proposta
nesses ficheiros deve nascer depois desse trabalho entrar no git.
