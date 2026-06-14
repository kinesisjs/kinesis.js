# Live data — WebSocket / HTTP

How to feed a live API or WebSocket stream into Kinesis.js and get the smoothest possible result — every setting that matters, what you have to do, and what to expect (and not expect) from the engine.

> This page is bilingual. **[🇹🇷 Türkçe](#turkce)** · **[🇬🇧 English](#english)**

---

## Türkçe {#turkce}

### Zihinsel model — motor ne yapar, ne yapmaz {#tr-model}

Kinesis.js bir **akış interpolasyon motorudur**. Sen periyodik ham pozisyonları `tracker.ingest()` ile sokarsın; motor 60fps'te aradaki kareleri üretip marker'ı akıcı şekilde kaydırır.

İki temel gerçeği baştan netleştirelim:

1. **Motor yalnızca _iki bilinen nokta arasını_ doldurur.** Canlı veride bir sonraki noktayı henüz bilmezsin — bu yüzden render, gerçek zamanın bir miktar (feed periyodu kadar) **gerisinde** kalır. Bu, motorun eksiği değil; teleport yerine akıcılık üretmenin tek yoludur. Ayrıntı: [renderLagMs](#tr-renderlag).
2. **Veri çekmek senin sorumluluğun.** WebSocket bağlantısı, yeniden bağlanma, kimlik doğrulama, HTTP polling — hepsi uygulama kodunda. Motor yalnızca interpolasyon + yaşam döngüsünü yönetir. Bkz. [Ne beklememeli](#tr-scope).

### 1. Temel bağlantı {#tr-wiring}

`start()` bir kez çağrılır; `ingest()` her veri geldiğinde.

::: code-group

```ts [WebSocket]
import { Tracker } from '@kinesisjs/core';
import { OpenLayersAdapter, createVehicleStyle } from '@kinesisjs/openlayers';
import type { Position } from '@kinesisjs/core';

const tracker = new Tracker({
  adapter: new OpenLayersAdapter(map, { style: createVehicleStyle({ icon: '/car.png' }) }),
  interpolation: 'adaptive',
  renderLagMs: 1000, // ≈ feed periyodu — aşağıya bak
});
tracker.start();

const ws = new WebSocket('wss://your-backend/vehicles');
ws.onmessage = (event) => {
  const positions: Position[] = JSON.parse(event.data);
  tracker.ingest(positions);
};
```

```ts [HTTP polling]
import { Tracker } from '@kinesisjs/core';
import { OpenLayersAdapter } from '@kinesisjs/openlayers';

const tracker = new Tracker({
  adapter: new OpenLayersAdapter(map),
  interpolation: 'adaptive',
  renderLagMs: 5000, // 5 sn'de bir veri çekiyorsan render-lag da ~5 sn
});
tracker.start();

async function poll() {
  const res = await fetch('/api/vehicles');
  if (res.ok) tracker.ingest(await res.json());
}
setInterval(poll, 5000);
```

:::

### 2. En önemli ayar: `renderLagMs` {#tr-renderlag}

Bu, gerçek-zamanlı interpolasyonu mümkün kılan tampondur. Marker, `now − renderLagMs` anına karşılık gelen pozisyonda çizilir. **Varsayılan: 1000 ms.**

Kuralı basit: **`renderLagMs` ≈ feed periyodun.** Saniyede bir veri (1 Hz) → `1000`. 5 saniyede bir → `5000`.

::: danger renderLagMs: 0 = teleport
`0` verirsen tampon kapanır: yeni nokta gelir gelmez `elapsed ≥ period` hep doğru olur ve interpolasyon **hiç çalışmaz** — marker noktadan noktaya zıplar. Akıcı görüntü istiyorsan `0` kullanma.
:::

::: tip Doğru değeri nasıl bulurum?

- Feed periyodun sabitse: periyoda eşitle.
- Çok kısa verirsen marker hedefe varır ve **bir sonraki veriyi beklerken donar** (sonra zıplar).
- Çok uzun verirsen gereksiz gecikme hissedilir.
- Feed periyodun **değişkense** `renderLagMs` ile uğraşma; bunun yerine [playout](#tr-playout) kullan.

:::

### 3. Düzensiz (jitter'lı) feed için: `playout` {#tr-playout}

WebSocket mesajları bazen 0.5 sn bazen 3 sn arayla geliyorsa, klasik yol marker'ı her segmentte hızlandırıp yavaşlatır — göz yorucu bir "lastik" etkisi. Playout buffer, değişken gelişi **sabit render hızına** çevirir.

```ts
const tracker = new Tracker({
  adapter,
  interpolation: 'smooth', // jitter + dönüşler için ideal eş
  playout: 'auto', // son ~10 periyodu ölçer, hızı kendi ayarlar
});
```

Daha fazla kontrol istersen elle ver:

```ts
playout: {
  pace: 1000,      // her segment kaç ms sürsün (≈ ortalama feed periyodu)
  bufferMs: 4500,  // en kötü gap × 1.5 (jitter yutucu)
  maxQueue: 20,    // araç başına kuyruk üst sınırı (varsayılan 20)
}
```

::: warning Takas: gecikme ↔ akıcılık
Playout, akıcılık karşılığında `bufferMs` kadar **ekstra algılanan gecikme** ekler. `bufferMs`'i en kötü gap'inden büyük seç; yoksa kuyruk boşalır ve marker bir sonraki veri gelene kadar donar. Playout aktifken `renderLagMs` **yok sayılır** (aynı işi `bufferMs` yapar).
:::

### 4. Interpolation modu seçimi {#tr-interp}

| Mod          | Ne zaman                            | Not                                                                     |
| ------------ | ----------------------------------- | ----------------------------------------------------------------------- |
| `'adaptive'` | **Çoğu canlı feed için önerilen**   | Periyoda göre otomatik: yoğun→linear, seyrek→fade, çok seyrek→snap      |
| `'smooth'`   | Sık dönüşlü rotalar, jitter'lı feed | 3 nokta Catmull-Rom; köşeleri yuvarlar (3. veriye kadar linear'a düşer) |
| `'linear'`   | Basit, öngörülebilir (varsayılan)   | Düz çizgi lerp                                                          |
| `'cubic'`    | Hafif yumuşatma                     | İki nokta üzerinde smoothstep                                           |
| `'geodesic'` | Gemi / uçak                         | Büyük daire yayı                                                        |
| `'none'`     | İnterpolasyon istemiyorsan          | Doğrudan snap                                                           |

Modların derin açıklaması: [Interpolation kavram sayfası](/concepts/interpolation). Yol ağına oturan (sokak takip eden) hareket için [`@kinesisjs/route-aware`](https://www.npmjs.com/package/@kinesisjs/route-aware) bir `CustomInterpolator` olarak takılır.

### 5. Burst koruması: `ingestThrottle` {#tr-throttle}

Araç başına minimum ingest aralığı (ms). Bu pencere içindeki tekrar ingest'ler **düşürülür** ve `ingest` event'inde `throttled` olarak sayılır. **Varsayılan: 100 ms.**

::: warning Feed periyodundan küçük tut
`ingestThrottle` feed periyodundan büyükse gerçek veriyi kaybedersin. 1 Hz feed için varsayılan `100` gayet iyi; 20 Hz gibi çok hızlı feed'lerde 50'ye indir. Patlamalı (tek seferde yüzlerce) feed'lerde throttle CPU'yu korur.
:::

### 6. Yaşam döngüsü eşikleri {#tr-lifecycle}

Bir araç veri göndermeyi kesince durumu değişir. Bu eşikleri feed kadansına göre ayarla:

| Seçenek               | Varsayılan | Anlamı                                                                       |
| --------------------- | ---------- | ---------------------------------------------------------------------------- |
| `warningThreshold`    | `60000`    | Bu kadar sessizlikten sonra `warning` durumuna geçer (marker haritada kalır) |
| `staleThreshold`      | `600000`   | Bu kadar sessizlikten sonra `stale` sayılıp **haritadan kaldırılır**         |
| `maxInterpolationGap` | `30000`    | İki nokta arası bu kadar açıksa interpolasyon atlanır (eski konuma snap)     |

`warning` durumunu görselleştirmek için adaptör `warningOpacity` ile marker'ı soldurabilir (OpenLayers / Leaflet adaptörlerinde mevcut). Planlı bitişlerde (vardiya sonu) `tracker.markCompleted(id)` çağır — `stale` ile karışmasın.

### 7. Gönderdiğin veri: `Position` {#tr-position}

```ts
interface Position {
  id: string; // KARARLI ve benzersiz olmalı (plaka, araç ID)
  lng: number; // WGS84 boylam (zorunlu)
  lat: number; // WGS84 enlem (zorunlu)
  timestamp?: number; // sunucu zaman damgası (epoch ms) — bilgilendirici
  speed?: number; // km/h — stil (hız bandı) + sapma kontrolü
  heading?: number; // 0–360° — marker döndürme + keskin dönüş kontrolü
  meta?: Record<string, unknown>; // sana ait; trail rengi vb. için meta.color
}
```

Önemli noktalar:

- **`id` kararlı olmalı.** Aynı araç her zaman aynı `id` ile gelmeli; yoksa motor onu yeni araç sanar ve eski iz silinmez.
- **Doğrulama otomatik.** `id` yoksa/string değilse, koordinat sonsuz/aralık dışıysa (lng ±180, lat ±90) nokta sessizce atlanır ve `error` kanalına `INVALID_POSITION` düşer. Public metotlar asla `throw` etmez.
- **Zamanlama `timestamp`'e değil, alış anına dayanır.** Motor render-lag/period hesabını, paketin istemciye ulaştığı an (`Date.now()`) üzerinden yapar — sunucu `timestamp`'ini göndermen zamanlamayı _iyileştirmez_ (alanı saklar ama akıcılık için kullanmaz). `speed`/`heading` ise stil ve sapma kontrolünde işe yarar; varsa gönder.

### 8. İzleme ve teşhis {#tr-observability}

Olup biteni event'lerle ve `getStats()` ile izle:

```ts
tracker.on('ingest', ({ count, throttled, latency }) => {
  // count: işlenen, throttled: düşürülen, latency: bu ingest'in ms süresi
});
tracker.on('vehiclewarning', ({ vehicleId }) => {
  /* "veri gecikti" rozeti göster */
});
tracker.on('error', ({ code, message }) => {
  console.warn(`[kinesis ${code}]`, message);
});

// Periyodik sağlık ölçümü:
const s = tracker.getStats();
s.fps; // ölçülen kare hızı
s.vehicleCount; // canlı araç sayısı
s.performanceMetrics.tickHistoryP95; // tick süresi p95 (ms)
s.performanceMetrics.droppedTicksLast60s; // son 60 sn'de geç kalan tick
```

`error` kanalına mutlaka abone ol — sorunları sessiz event olarak görürsün, exception olarak değil.

### 9. Temizlik {#tr-cleanup}

SPA navigasyonunda veya sayfa kapanışında `destroy()` çağır: tick döngüsünü durdurur, slot'ları temizler, `adapter.destroy()`'u çağırır ve tüm dinleyicileri bırakır.

```ts
// Angular sarmalayıcı (@kinesisjs/angular) bunu DestroyRef ile otomatik yapar.
window.addEventListener('beforeunload', () => {
  tracker.destroy();
  map.dispose();
});
```

### 10. Yük çok ağırsa: Web Worker modu {#tr-worker}

Binlerce araç ana iş parçacığını zorluyorsa tick döngüsünü worker'a taşı:

```ts
const tracker = new Tracker({ adapter, interpolation: 'adaptive', worker: true });
```

Uyarılar: `CustomInterpolator` worker sınırını geçemez (ikisi birden verilince kurucu `throw` eder), fade animasyonları snap'e döner, `getStats()` ~30 tick'te bir tazelenir. Ayrıntı: [Web Worker modu](/concepts/web-worker).

### Kütüphaneden ne beklemeli, ne beklememeli {#tr-scope}

**✅ Beklenenler**

- İki ham pozisyon arasında 60fps akıcı hareket (renderLagMs/playout doğru ayarlıysa).
- Çok saatlik oturumlarda sabit bellek (araç başına sabit slot; iz büyümez).
- Veri kesildiğinde otomatik yaşam döngüsü (`warning` → `stale` → kaldırma).
- Hatalı koordinatların sessizce reddi + `error` kanalı.

**❌ Kapsam dışı — bunları sen / başka paketler yapar**

- **WebSocket / HTTP yönetimi, yeniden bağlanma, kimlik doğrulama** → uygulama kodu.
- **GPS gürültü filtresi / Kalman / dead-reckoning** → çekirdek yapmaz ([predict](https://www.npmjs.com/search?q=%40kinesisjs) yol haritasında).
- **Geçmiş oynatma / zaman çizelgesi tarama** → çekirdek dışı (replay yol haritasında).
- **Sokak ağına oturma** → [`@kinesisjs/route-aware`](https://www.npmjs.com/package/@kinesisjs/route-aware).
- **Render gecikmesini sıfırlama** → mümkün değil; canlı interpolasyon doğası gereği feed periyodu kadar geride render eder.

Daha fazlası: [Limitations](/concepts/limitations).

### Senaryoya göre hızlı reçete {#tr-recipes}

| Feed                    | Önerilen ayarlar                                 |
| ----------------------- | ------------------------------------------------ |
| 1 Hz, düzenli WebSocket | `interpolation: 'adaptive'`, `renderLagMs: 1000` |
| 5 sn HTTP polling       | `interpolation: 'adaptive'`, `renderLagMs: 5000` |
| Düzensiz / jitter'lı    | `interpolation: 'smooth'`, `playout: 'auto'`     |
| Çok sık dönüşlü rota    | `interpolation: 'smooth'`                        |
| Gemi / uçak             | `interpolation: 'geodesic'`                      |
| Binlerce araç           | yukarıdakiler + `worker: true`                   |

---

## English {#english}

### Mental model — what the engine does and doesn't {#en-model}

Kinesis.js is a **streaming interpolation engine**. You push periodic raw positions in with `tracker.ingest()`; the engine generates the in-between frames at 60fps and slides the marker smoothly.

Two facts to internalize up front:

1. **The engine only fills the gap _between two known points_.** With live data you don't know the next point yet — so the render stays a little **behind** real time, by roughly your feed period. That's not a shortcoming; it's the only way to produce smooth motion instead of teleporting. Details: [renderLagMs](#en-renderlag).
2. **Fetching data is your job.** The WebSocket connection, reconnection, auth, HTTP polling — all live in your app code. The engine only owns interpolation + lifecycle. See [What not to expect](#en-scope).

### 1. Basic wiring {#en-wiring}

Call `start()` once; call `ingest()` every time data arrives.

::: code-group

```ts [WebSocket]
import { Tracker } from '@kinesisjs/core';
import { OpenLayersAdapter, createVehicleStyle } from '@kinesisjs/openlayers';
import type { Position } from '@kinesisjs/core';

const tracker = new Tracker({
  adapter: new OpenLayersAdapter(map, { style: createVehicleStyle({ icon: '/car.png' }) }),
  interpolation: 'adaptive',
  renderLagMs: 1000, // ≈ feed period — see below
});
tracker.start();

const ws = new WebSocket('wss://your-backend/vehicles');
ws.onmessage = (event) => {
  const positions: Position[] = JSON.parse(event.data);
  tracker.ingest(positions);
};
```

```ts [HTTP polling]
import { Tracker } from '@kinesisjs/core';
import { OpenLayersAdapter } from '@kinesisjs/openlayers';

const tracker = new Tracker({
  adapter: new OpenLayersAdapter(map),
  interpolation: 'adaptive',
  renderLagMs: 5000, // polling every 5 s → ~5 s of render lag
});
tracker.start();

async function poll() {
  const res = await fetch('/api/vehicles');
  if (res.ok) tracker.ingest(await res.json());
}
setInterval(poll, 5000);
```

:::

### 2. The single most important setting: `renderLagMs` {#en-renderlag}

This is the buffer that makes real-time interpolation actually run. The marker is rendered at the position corresponding to `now − renderLagMs`. **Default: 1000 ms.**

The rule is simple: **`renderLagMs` ≈ your feed period.** One update per second (1 Hz) → `1000`. One every 5 seconds → `5000`.

::: danger renderLagMs: 0 = teleport
With `0` the buffer is off: the moment a new point lands, `elapsed ≥ period` is always true and interpolation **never runs** — the marker jumps from point to point. Don't use `0` if you want smooth motion.
:::

::: tip How do I find the right value?

- Steady feed period → match it.
- Too low → the marker reaches the target and **freezes waiting for the next update** (then jumps).
- Too high → unnecessary perceived latency.
- If your feed period **varies**, don't fight with `renderLagMs` — use [playout](#en-playout) instead.

:::

### 3. For irregular (jittery) feeds: `playout` {#en-playout}

If WebSocket messages arrive 0.5 s apart sometimes and 3 s apart other times, the classical path speeds the marker up and slows it down each segment — a tiring "rubber-band" effect. The playout buffer converts variable arrival into a **constant render rate**.

```ts
const tracker = new Tracker({
  adapter,
  interpolation: 'smooth', // ideal partner for jitter + turns
  playout: 'auto', // measures the last ~10 periods, sets the pace itself
});
```

For more control, configure it manually:

```ts
playout: {
  pace: 1000,      // ms each segment should occupy (≈ average feed period)
  bufferMs: 4500,  // worst-case gap × 1.5 (jitter absorption)
  maxQueue: 20,    // per-vehicle queue cap (default 20)
}
```

::: warning Trade-off: latency ↔ smoothness
Playout adds `bufferMs` of **extra perceived latency** in exchange for smooth motion. Pick `bufferMs` larger than your worst-case gap, or the queue underruns and the marker freezes until the next update. While playout is active, `renderLagMs` is **ignored** (`bufferMs` plays the same role).
:::

### 4. Choosing an interpolation mode {#en-interp}

| Mode         | When                                | Note                                                                           |
| ------------ | ----------------------------------- | ------------------------------------------------------------------------------ |
| `'adaptive'` | **Recommended for most live feeds** | Period-aware: dense→linear, sparse→fade, very sparse→snap                      |
| `'smooth'`   | Turn-heavy routes, jittery feeds    | 3-point Catmull-Rom; rounds corners (falls back to linear until the 3rd point) |
| `'linear'`   | Simple, predictable (default)       | Straight-line lerp                                                             |
| `'cubic'`    | Light easing                        | Smoothstep over two points                                                     |
| `'geodesic'` | Ships / aircraft                    | Great-circle arc                                                               |
| `'none'`     | No interpolation wanted             | Direct snap                                                                    |

Deep dive on modes: [Interpolation concept page](/concepts/interpolation). For road-snapping (street-following) motion, [`@kinesisjs/route-aware`](https://www.npmjs.com/package/@kinesisjs/route-aware) plugs in as a `CustomInterpolator`.

### 5. Burst protection: `ingestThrottle` {#en-throttle}

Minimum ingest interval per vehicle (ms). Repeat ingests inside this window are **dropped** and counted as `throttled` on the `ingest` event. **Default: 100 ms.**

::: warning Keep it below your feed period
If `ingestThrottle` exceeds your feed period you lose real data. The `100` default is fine for a 1 Hz feed; for very fast feeds (e.g. 20 Hz) drop it to 50. For bursty feeds (hundreds at once) the throttle protects CPU.
:::

### 6. Lifecycle thresholds {#en-lifecycle}

When a vehicle stops sending, its state changes. Tune these to your feed cadence:

| Option                | Default  | Meaning                                                                     |
| --------------------- | -------- | --------------------------------------------------------------------------- |
| `warningThreshold`    | `60000`  | After this much silence → `warning` state (marker stays on the map)         |
| `staleThreshold`      | `600000` | After this much silence → `stale` and **removed from the map**              |
| `maxInterpolationGap` | `30000`  | If two points are this far apart, interpolation is skipped (snap to latest) |

To visualize `warning`, the adapter can dim the marker via `warningOpacity` (available in the OpenLayers / Leaflet adapters). For planned endings (end of shift) call `tracker.markCompleted(id)` so it isn't conflated with `stale`.

### 7. The data you send: `Position` {#en-position}

```ts
interface Position {
  id: string; // MUST be stable and unique (plate, vehicle ID)
  lng: number; // WGS84 longitude (required)
  lat: number; // WGS84 latitude (required)
  timestamp?: number; // server timestamp (epoch ms) — informational
  speed?: number; // km/h — styling (speed bands) + sanity checks
  heading?: number; // 0–360° — marker rotation + sharp-turn check
  meta?: Record<string, unknown>; // yours; e.g. meta.color for the trail
}
```

Key points:

- **`id` must be stable.** The same vehicle must always arrive with the same `id`, or the engine treats it as a brand-new vehicle and never clears the old trail.
- **Validation is automatic.** A missing/non-string `id`, or non-finite / out-of-range coordinates (lng ±180, lat ±90), causes the point to be skipped silently with an `INVALID_POSITION` on the `error` channel. Public methods never `throw`.
- **Timing is driven by arrival, not `timestamp`.** The engine computes render-lag/period from when the packet reaches the client (`Date.now()`) — sending the server `timestamp` does _not_ improve timing (it's stored but not used for smoothness). `speed`/`heading`, however, feed styling and sanity checks, so send them when you have them.

### 8. Observability {#en-observability}

Watch what's happening through events and `getStats()`:

```ts
tracker.on('ingest', ({ count, throttled, latency }) => {
  // count: processed, throttled: dropped, latency: ms this ingest took
});
tracker.on('vehiclewarning', ({ vehicleId }) => {
  /* show a "data delayed" badge */
});
tracker.on('error', ({ code, message }) => {
  console.warn(`[kinesis ${code}]`, message);
});

// Periodic health probe:
const s = tracker.getStats();
s.fps; // measured frame rate
s.vehicleCount; // live vehicles
s.performanceMetrics.tickHistoryP95; // tick duration p95 (ms)
s.performanceMetrics.droppedTicksLast60s; // late ticks in the last 60 s
```

Always subscribe to the `error` channel — you see problems as quiet events, not exceptions.

### 9. Cleanup {#en-cleanup}

On SPA navigation or page unload, call `destroy()`: it stops the tick loop, clears slots, calls `adapter.destroy()`, and drops all listeners.

```ts
// The Angular wrapper (@kinesisjs/angular) does this automatically via DestroyRef.
window.addEventListener('beforeunload', () => {
  tracker.destroy();
  map.dispose();
});
```

### 10. When the load is heavy: Web Worker mode {#en-worker}

If thousands of vehicles strain the main thread, move the tick loop into a worker:

```ts
const tracker = new Tracker({ adapter, interpolation: 'adaptive', worker: true });
```

Caveats: a `CustomInterpolator` can't cross the worker boundary (setting both throws), fade animations degrade to snapping, and `getStats()` refreshes every ~30 ticks. Details: [Web Worker mode](/concepts/web-worker).

### What to expect — and what not to {#en-scope}

**✅ Expect**

- 60fps smooth motion between two raw positions (when renderLagMs/playout are set right).
- Bounded memory across multi-hour sessions (fixed per-vehicle slot; trails don't grow).
- Automatic lifecycle when data stops (`warning` → `stale` → removal).
- Silent rejection of bad coordinates + an `error` channel.

**❌ Out of scope — you (or other packages) handle these**

- **WebSocket / HTTP management, reconnection, auth** → your app code.
- **GPS noise filtering / Kalman / dead-reckoning** → not in core (predict is on the roadmap).
- **Historical playback / timeline scrubbing** → outside core (replay is on the roadmap).
- **Road-snapping** → [`@kinesisjs/route-aware`](https://www.npmjs.com/package/@kinesisjs/route-aware).
- **Zero render latency** → impossible; live interpolation inherently renders a feed-period behind.

More: [Limitations](/concepts/limitations).

### Quick recipes by feed type {#en-recipes}

| Feed                   | Recommended settings                             |
| ---------------------- | ------------------------------------------------ |
| 1 Hz, steady WebSocket | `interpolation: 'adaptive'`, `renderLagMs: 1000` |
| 5 s HTTP polling       | `interpolation: 'adaptive'`, `renderLagMs: 5000` |
| Irregular / jittery    | `interpolation: 'smooth'`, `playout: 'auto'`     |
| Turn-heavy route       | `interpolation: 'smooth'`                        |
| Ships / aircraft       | `interpolation: 'geodesic'`                      |
| Thousands of vehicles  | any of the above + `worker: true`                |

---

## Next steps

- [Interpolation modes](/concepts/interpolation)
- [Web Worker mode](/concepts/web-worker)
- [Limitations](/concepts/limitations)
- [First map (Vanilla TS)](/guide/first-map-vanilla)
