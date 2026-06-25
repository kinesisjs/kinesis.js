# CLAUDE.md

Kinesis.js — TypeScript-first, framework-agnostic vehicle interpolation engine.
pnpm monorepo, **bağımsız sürümlü** (Changesets). Yayındaki paketler:

- `@kinesisjs/core` — framework-agnostic interpolation motoru (adapter/framework kodu sızdırma)
- `@kinesisjs/openlayers`, `@kinesisjs/leaflet` — harita adaptörleri
- `@kinesisjs/angular` — Angular Signals/RxJS wrapper (build: **ng-packagr**, asla tsup)
- `@kinesisjs/route-aware` — OSRM road-snap `CustomInterpolator`

Genel komutlar: `pnpm verify` (lint+typecheck+test+build), `pnpm size` (bundle bütçe),
`pnpm test:bench`.

---

## Kural: branch adlandırma = versiyon

Yeni iş başlatırken branch adı, o işin hedeflediği **çekirdek (core) sürümü** olur:

```
v<hedef-core-sürümü>      ör. v0.6.0   (yeni minor)   ·   v0.5.2  (patch)
```

- Bağımsız sürümlü monorepo'da "versiyon" başlığı **core**'a sabitlenir; diğer paketlerin
  gerçek bump'ları durum dosyasının _Sürüm bump'ları_ bölümünde listelenir.
- İş core'u bump'lamasa bile, hedeflenen sonraki core sürümü etiket olarak kullanılır.
- Bu kural, `start-branch` skill'inin varsayılan `type/slug` şemasını **bu repoda override eder**.
- Commit **mesajları** Conventional Commits olarak kalır (`feat(core): …`), AI attribution eklenmez.

---

## Kural: her commit'te `documents/deploys/<v-core>.md` güncelle

Her geliştirme/commit'te (ufak ya da büyük), o versiyonun durum dosyasını güncel tut ve
**aynı commit'e dahil et** (durum için ayrı commit açma).

**Akış:**

1. Yeni iş → branch `v<core>` aç. `documents/deploys/_TEMPLATE.md`'yi kopyala →
   `documents/deploys/v<core>.md`. _Önceki yayın (baseline)_ alanına en son yayınlanan
   versiyon dosyasını referans ver (şu an [v0.5.1](documents/deploys/v0.5.1.md)).
2. Kategorik bölümleri (Feature, **Güvenlik**, **Performans**, Test, Docs, Build/Release)
   **son publish'e göre DIFF** olarak yaz — değişmeyeni "— değişiklik yok" diye işaretle,
   her şeyi yeniden yazma.
3. Her commit'te _Commit log_ bölümüne bir satır ekle: `hash — konu`.
4. Kod değişikliği + durum güncellemesi **tek commit**.
5. Yayın (changeset `version packages`) sonrası o dosya **dondurulmuş kayıt** olur; bir
   sonraki yayının core sürümüyle yeni dosya başlar ve yeni baseline o olur.

**Görünürlük:** `documents/deploys/` git'te izlenir ama public dokümantasyon sitesine çıkmaz
(`documents/.vitepress/config.ts` → `srcExclude: ['deploys/**']`). Dahili kayıt amaçlıdır.

Konvansiyonun özeti: [`documents/deploys/README.md`](documents/deploys/README.md).

---

## Hızlı hatırlatmalar

- `@kinesisjs/angular` **ng-packagr** ile derlenir (AOT/Ivy partial-declarations için) — tsup'a düşürme.
- `Tracker.renderLagMs` varsayılanı `1000`, `>0` kalmalı (interpolasyon buna bağlı).
- Per-tick hot-path bütçesine ve sabit-bellek slot pattern'ine dikkat (core).
- Bundle bütçeleri CI'da zorunlu — yeni özellik eklerken `pnpm size`.
