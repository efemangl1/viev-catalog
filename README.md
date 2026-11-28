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

## Duyuru bandı, ana sayfa yazıları, öne çıkan ürünler (kodsuz)
`config/settings.json` dosyasından, uygulama yeniden yayınlanmadan değiştirilir (birkaç dakikada tüm telefonlarda):

- **duyuru**: Ana sayfanın en üstünde renkli bir bant. `acik`: `true` görünür, `false` kalkar. `metin`: yazı (en fazla 160 karakter).
  `marka`: `hepsi` / `mobilya` / `corner`. `gitsin`: bant dokununca açılacak adres, örn. `/katalog?kategori=D%C3%BC%C4%9F%C3%BCn%20Paketi`
  (boş bırakılabilir). `bitis`: `YYYY-AA-GG`; bu tarihten sonra bant kendiliğinden kalkar (boş bırakılabilir).
- **anaSayfa -> mobilya / corner**: büyük kutunun `etiket`, `baslik`, `altYazi` yazıları. Boş bırakılan alan hazır metinle gösterilir.
- **anaSayfa -> oneCikanlar**: ana sayfada gösterilecek ürünler, ürünün site adresinin son kısmıyla, örn. `["olimpo-koltuk-takimi", "olimpo-dugun-paketi"]`
  (düğün paketlerinde `mobilya-dp-olimpo-dugun-paketi` yazmak daha güvenli). Boş liste = otomatik seçim. En fazla 8 ürün.

Hatalı yazarsanız (eksik virgül, tırnak, yanlış tarih biçimi) Actions sekmesinde kırmızı çarpı ve hata mesajı çıkar, **eski ayarlar kalır**, uygulama bozulmaz.

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
