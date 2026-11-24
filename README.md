# viev-catalog

Viev uygulamasının ürün kataloğu. `vievmobilya.com.tr` ve `vievcorner.com` sitelerini tarar,
`data/catalog.json` dosyasını üretir. Uygulama bu dosyayı internetten okur.

- **Otomatik:** `.github/workflows/sync.yml` her saat çalışır. Veri değiştiyse `data/catalog.json` güncellenir.
- **Elle çalıştırma:** GitHub'da *Actions → Katalog güncelle → Run workflow*.
- **Bilgisayarda:** `node scripts/build-catalog.mjs`
- **Koruma:** Site geçici olarak bozuksa ya da ürün sayısı %20'den fazla düşerse dosya değiştirilmez.

Not: `scripts/` klasörü `viev-app/scripts` içindekilerin kopyasıdır; ikisini aynı tutun.

Uygulamanın okuduğu adres:
`https://raw.githubusercontent.com/<kullanici-adi>/viev-catalog/main/data/catalog.json`
