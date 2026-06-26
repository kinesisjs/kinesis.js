# Deploys — per-version status log

Bu klasör, projenin **versiyon bazında durum kayıtlarını** tutar. Amaç: "hangi
versiyonda ne yaptık, son yayına göre güvenlik / performans / test / feature
tarafında ne değişti" sorusunu GitHub'a gitmeden tek dosyadan okuyabilmek.

> Bu dosyalar git'te izlenir ama public dokümantasyon sitesine **çıkmaz**
> (`.vitepress/config.ts` → `srcExclude: ['deploys/**']`). Dahili kayıt amaçlıdır.

## Adlandırma

- Her durum dosyası, o çalışma branch'inin hedeflediği **çekirdek (core) sürümüyle**
  adlandırılır: `documents/deploys/v<core>.md` (ör. `v0.6.0.md`).
- Branch adı da aynıdır: yeni iş → branch `v<core>` (ör. `v0.6.0`).
- Monorepo bağımsız sürümlü olduğu için "versiyon" başlığı **core**'a sabitlenir;
  diğer paketlerin gerçek bump'ları dosyanın _Sürüm bump'ları_ bölümünde listelenir.
- İş core'u bump'lamıyorsa bile, hedeflenen sonraki core sürümü etiket olarak kullanılır.

## Bir durum dosyası nasıl yazılır

1. Yeni iş başlarken `_TEMPLATE.md`'yi kopyala → `v<core>.md`.
2. **Önceki yayın (baseline)**'ı referans al: kategorik bölümleri _son publish'e göre_
   **diff** olarak yaz (her şeyi değil, sadece bu versiyonda değişeni).
3. Her commit'te dosyayı güncelle ve **aynı commit'e dahil et** (ayrı commit açma).
   _Commit log_ bölümüne her commit için bir satır ekle (`hash — konu`).
4. Yayın (changeset `version packages`) sonrası bu dosya **dondurulmuş kayıt** olur;
   bir sonraki yayının core sürümüyle yeni bir dosya başlar ve yeni baseline o olur.

## Baseline

`v0.5.1.md` — bu konvansiyon kurulduğunda yayında olan durumun tam snapshot'ı.
Sonraki ilk versiyon dosyası diff'ini buna dayandırır.

Kuralın tamamı kök dizindeki [`CLAUDE.md`](../../CLAUDE.md) içindedir.
