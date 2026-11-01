# Relatório — Fade na troca de música · port para o Android (mobile)

**Para:** IA responsável pelo port mobile (Capacitor/Android)
**Data:** 2026-09-26
**Autor:** implementação do fade na versão desktop (Electron)
**Status desktop:** implementado e compilando (`npx tsc --noEmit` → 0 erros)

---

## 1. O que foi implementado (comportamento)

Feature "mudar música suave":

1. **Troca manual de música** (botões ⏮/⏭, setas do teclado, controles de mídia do
   sistema, clique numa música da fila/biblioteca, pedido de convidado da festa):
   a música que está sendo deixada para trás **continua tocando por mais 1 segundo**
   a partir da posição em que parou, com o **volume descendo até zero** — enquanto a
   **nova música já começa a tocar em volume total, instantaneamente**.
2. **Fim natural da música (evento `ended`) ou erro de reprodução:** **sem fade**.
   A música já parou de sofar nesse momento (`paused`/`ended`), então nenhuma cópia
   é criada — é a exceção pedida.
3. **Cliques rápidos** (trocas com menos de 1s entre elas): o **fade é ignorado**.
   A cópia que ainda estava sumindo é cortada na hora e nenhuma nova cópia é feita,
   para que os "rabos" das músicas puladas nunca se acumulem.

## 2. Atenção: o código é compartilhado — provavelmente não há nada a portar

O app Android **usa exatamente o mesmo bundle do renderer**:

- `mobile/build.mjs` roda `vue-cli-service build --dest mobile/www` com
  `FLB_MOBILE_BUILD=1` (e `--openssl-legacy-provider`);
- depois `cap sync android` copia `mobile/www` para dentro do projeto Capacitor.

Todos os arquivos alterados são do **renderer compartilhado**. Ou seja: após
reconstruir, o fade **já deve existir no Android**. O trabalho real é
**verificar e ajustar os riscos específicos do WebView** listados na seção 5,
não reimplementar nada.

> O bundle atual em `mobile/www/js/*` é pré-compilado e **não contém** a feature
> (foi gerado antes desta mudança). Reconstrua antes de testar.

## 3. Arquivos alterados e pontos exatos

| Arquivo | Papel |
|---|---|
| `src/renderer/utils/track-fade.ts` | **Novo.** Toda a lógica da cópia que some. Ponto único de entrada: `fadeOutTrack(audio)`. |
| `src/renderer/store/modules/local-music/playback-manger.ts` | No início da mutação `setPlayingTrack` (linha ~88) chama `fadeOutTheTrackBeingLeft(previousTrack, payload.track)`, que decide se a troca merece fade. |
| `src/renderer/components/root/equalizer/equalizer.ts` | Novo `connectExtraAudioElement(element)`: liga a cópia ao mesmo grafo de áudio (`gainNode`) para ela respeitar o volume master do app. |
| `src/renderer/utils/index.ts` | Novo `trackSource(track)`: a url que o player carrega (usada pelo fade e pelo `audioSource` do `track-bar.vue`). |
| `src/renderer/components/root/player/track-bar.vue` | `audioSource` passou a usar `trackSource()`; removido o stub morto `crossFade()` e campos sem uso. |

Fluxo: `setPlayingTrack` (mutação) → `fadeOutTheTrackBeingLeft` → `fadeOutTrack(audio)`.
A mutação roda **antes** do Vue trocar o `src` do elemento, então o elemento ainda
segura a música antiga — é nesse instante que a posição/`src` são capturados.

Guardas da `fadeOutTheTrackBeingLeft`:

- `previousTrack === nextTrack` → nada a fazer;
- `trackSource(nextTrack) === audio.src` → a fonte não mudou (mesmo arquivo duas
  vezes), o elemento continua tocando sem recarregar;
- senão `fadeOutTrack(audio)`.

Guardas internas de `fadeOutTrack` (nesta ordem):

- troca mais rápida que 1s → corta a cópia atual e retorna (sem fade);
- `paused` ou `ended` → nada soando, não há o que diminuir (**é o que faz o fim
  natural da música não ter fade**);
- sem `src` ou `currentTime <= 0` → nada a copiar.

## 4. Como o player funciona no mobile (fatos que importam)

- **Flag:** `isMobileApp` vem de `src/platform/ipc.ts` (detecta a ausência do
  `require` do Electron).
- **Fonte das músicas:** no mobile, `track.fileLocation` é `flb-media://<blobId>`;
  `toFileUrl()` (em `src/renderer/utils/index.ts`) resolve isso via
  `window.__FLB_MEDIA_URLS__` para uma **`blob:` URL** (montada em
  `src/platform/mobile-ipc.ts`, função `hydrateMediaUrls`/`importFiles`).
  A cópia do fade **reusa o `src` já resolvido do elemento**, então funciona com
  `blob:` sem nenhum tratamento extra.
- **Volume master é WebAudio**, não `HTMLMediaElement.volume`: `setMasterVolume`
  mexe num `GainNode` (`equalizer.ts`). `initializeAudio()` é chamado no `mounted`
  do `playing-pane.vue`, que é compartilhado — **ou seja, roda no Android também**.
  Por isso a cópia é ligada ao mesmo `gainNode` via `connectExtraAudioElement`.
- **Objetos `blob:` nunca são revogados pelo fade** (`URL.revokeObjectURL` não é
  chamado em `track-fade.ts`). Mantenha assim: revogar a url da cópia derrubaria a
  música principal, que usa a mesma url.
- **Invariante `document.querySelector("audio")`**: muito código depende de que a
  primeira `<audio>` do DOM seja a principal (`track-bar.vue`, `party-manager.ts`,
  `ipc-listener.vue`, `equalizer.ts`, `party-view.vue`). A cópia do fade é anexada
  com `document.body.appendChild(...)`, ou seja, **depois** do `#app` — por isso a
  principal continua sendo a primeira. **Não mover a cópia para antes do `#app`.**
- `mobile-ipc.ts` cria uma `<audio>` temporária na função `durationOf()`, mas ela
  **não entra no DOM**, então não conflita.

## 5. Riscos específicos do Android/WebView e o que fazer

### 5.1 Autoplay do `play()` da cópia
O `play()` da cópia é disparado logo após um toque do usuário (o botão de pular),
dentro da janela de ativação — mas pode vir depois de um `loadedmetadata` assíncrono.
**Se o WebView recusar, o `catch` remove a cópia e a troca de música continua
normalmente**: o pior caso é apenas "o fade não aconteceu", nunca áudio cortado ou
travado. Testar num aparelho real, não só no emulador.

### 5.2 `AudioContext` suspenso no WebView
O Android mantém o contexto suspenso até um gesto (`pointerdown`/`keydown` já estão
registrados em `equalizer.ts`). Se a conexão com o grafo falhar,
`connectExtraAudioElement` tem fallback silencioso: a cópia toca **fora** do
`gainNode`, ou seja, **ignora o volume master e o equalizador**.
**Teste obrigatório:** com o volume do app bem baixo, pule de música — se a cauda
que some soar alta demais em relação à música nova, o fallback está sendo usado e
é preciso investigar a conexão do grafo no WebView.

### 5.3 `requestAnimationFrame` para quando o app vai para o segundo plano
Se o usuário pular de música e a tela apagar/logo em seguida, os frames param e o
rampa de volume não anda — a cópia tocaria em volume fixo. **Isso já foi endurecido
no código compartilhado** (faça cherry-pick/merge tranquilamente):

- listener `ended` na cópia → some ao terminar o áudio dela;
- *deadline* duro de `FADE_DURATION_MS + 500` ms via `setTimeout`, independente de
  frames;
- ambos só agem se a cópia ainda for a atual (`fadingCopy === copy`).

**Teste:** pule de música e apague a tela na hora — não pode sobrar áudio tocando.

### 5.4 Desempenho em aparelhos baixos
Durante 1s existem **dois elementos `<audio>` decodificando**. Aceitável, mas se
houver relatos de engasgo em aparelhos fracos, encurtar ou desligar é barato (ver 6).

### 5.5 Volume, boost e equalizador
A cauda passa pelo mesmo `gainNode`, então o slider de volume e o modo boost valem
para ela. Com o equalizador ligado (`setupEqualizer`), a música principal passa
pelos filtros e a cauda não — diferença imperceptível numa cauda de 1s em fade.

### 5.6 Modo festa (party)
Em Android o app é anfitrião **e** convidado. As trocas de música vindas da festa
também passam por `setPlayingTrack`, então o fade se aplica a elas. Vale um teste
de pular música como anfitrião e como convidado.

## 6. Se precisar ajustar/desligar no mobile

Não reescreva: o ponto de entrada é único.

- **Desligar só no Android** — em `fadeOutTheTrackBeingLeft`
  (`playback-manger.ts`), primeira linha:
  ```ts
  import { isMobileApp } from "@/platform/ipc";
  // ...
  if (isMobileApp) return;
  ```
- **Mudar a duração** — constante `FADE_DURATION_MS` (hoje `1000`) em
  `src/renderer/utils/track-fade.ts`.
- **Ligar/desligar por preferência do usuário** — sugestão: expor
  `FADE_DURATION_MS` como setting e passá-lo para `fadeOutTrack(audio, duration)`,
  com `0` desligando o fade. O settings-manager do mobile já tem
  `enableEqualizer` como precedente de setting de áudio.

## 7. Como reconstruir e testar

```bash
npm run build:mobile     # gera mobile/www (usa --openssl-legacy-provider)
npm run android:sync     # build:mobile + cap sync android
npm run android:apk      # sync + mobile/build-apk.mjs (APK)
# ou abrir no Android Studio: npx cap open android
```

**Checklist de aceite no aparelho/emulador:**

- [ ] Pular com ⏭/⏮ → a música nova começa na hora e a antiga some suavemente em ~1s.
- [ ] Deixar a música terminar → a próxima começa sem fade (sem eco da anterior).
- [ ] Pular 3× seguido rápido → nenhuma cauda sobra, tudo instantâneo.
- [ ] Clicar numa música da fila/biblioteca → mesmo comportamento suave.
- [ ] Volume do app em ~20% → a cauda que some também sai baixa (valida o grafo, 5.2).
- [ ] Apagar a tela logo após pular → não sobra áudio tocando (valida 5.3).
- [ ] Modo festa: pular como anfitrião e como convidado.
- [ ] Equalizador ligado/desligado → nada quebra, volume continua correto.
- [ ] Voltar ao app depois de uns minutos → nenhuma `<audio>` órfã no DOM
      (`document.querySelectorAll("audio").length` deve voltar a 1).

## 8. Estado da verificação no desktop

- `npx tsc --noEmit -p tsconfig.json` → **0 erros**.
- Teste manual no Electron (`npm start`) pendente de quem implementou; os mesmos
  itens do checklist se aplicam lá.
- Nenhum comportamento pré-existente foi alterado: `determineNextTrack`, o repeat,
  a restauração da última música no boot e a reprodução com erro seguem igual.
