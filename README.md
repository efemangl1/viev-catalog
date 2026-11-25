# viev-catalog

Viev uygulamasının ürün kataloğu ve ayarları. `vievmobilya.com.tr` ve `vievcorner.com` sitelerini tarar,
`data/catalog.json` dosyasını üretir. Uygulama (APK ve web) bu dosyayı internetten okur.

## Ne otomatik güncellenir?
- **Ürünler, fiyatlar, fotoğraflar, düğün paketleri, köşe takımı fiyatları:** Siteden otomatik, her saat.
- **Mağaza adresleri, telefon/WhatsApp numaraları, varsayılan WhatsApp şubesi, Instagram hesapları:**
  `config/settings.json` dosyasını düzenlersiniz; kaydedince birkaç dakika içinde tüm telefonlarda değişir.

## Numara / adres nasıl değiştirilir?
1. GitHub'da `config/settings.json` dosyasını açın, sağ üstteki kalem simgesine (Edit) basın.
2. İlgili satırı değiştirin. Tırnakları ve virgülleri bozmayın.
   - `whatsapp`: ülke kodlu, sadece rakam (örn. `905530720220`)
   - `phone`: `+` ile başlar (örn. `+905530720220`)
   - `defaultStore`: "WhatsApp'tan Sor" butonlarının hangi şubeye gideceği (`stores` içindeki `id`)
3. **Commit changes** düğmesine basın. Birkaç dakika sonra uygulamada görünür.

Dosyada hata varsa (eksik virgül vb.) Actions sekmesinde kırmızı çarpı çıkar ve **eski ayarlar kalır**, uygulama bozulmaz.

## Yeni düğün paketi bildirimi
Robot yeni bir **düğün paketi** bulursa uygulamayı kuran ve bildirimi açan telefonlara tek bir toplu bildirim gönderir.
Kurallar `config/settings.json` içindeki `bildirimler` bölümündedir:
- `acik`: `false` yaparsanız **hiçbir bildirim gitmez** (çok ürün yüklerken kullanın, sonra `true` yapın).
  Kapalıyken eklenen ürünler sonradan da bildirim üretmez.
- `kategoriler`: bildirim üreten kategoriler (şimdilik sadece `Düğün Paketi`).
- `sessizBaslangic` / `sessizBitis`: bu saatler arasında (Türkiye saati) gönderilmez, sabaha kalır.
- `gundeEnFazla`: günde en fazla kaç bildirim (fazlası ertesi güne kalır).

Gerekli gizli anahtarlar (GitHub: *Settings → Secrets and variables → Actions*): `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`.
Tanımlı değilse robot bildirim GÖNDERMEZ, sadece ne göndereceğini yazar.
Durum dosyası: `data/notify-state.json` (robot yönetir, elle değiştirmeyin).

## Diğer
- **Elle çalıştırma:** GitHub'da *Actions → Katalog güncelle → Run workflow*.
- **Bilgisayarda:** `node scripts/build-catalog.mjs`
- **Koruma:** Site geçici olarak bozuksa ya da ürün sayısı %20'den fazla düşerse dosya değiştirilmez.

Not: `scripts/` klasörü `viev-app/scripts` içindekilerin kopyasıdır; ikisini aynı tutun.

Uygulamanın okuduğu adres:
`https://raw.githubusercontent.com/efemangl1/viev-catalog/main/data/catalog.json`
