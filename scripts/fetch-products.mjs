// Kullanım: node scripts/fetch-products.mjs
// vievmobilya.com.tr ve vievcorner.com ürün sayfalarından (JSON-LD) ürün verisini çeker
// ve src/data/products.json dosyasına yazar.
import { writeFile, mkdir } from 'node:fs/promises';

const SITES = [
  { brand: 'mobilya', origin: 'https://vievmobilya.com.tr', paths: ['/urun/', '/dugun-paketi/'] },
  { brand: 'corner', origin: 'https://vievcorner.com', paths: ['/urun/'] },
];
const UA = { 'user-agent': 'Mozilla/5.0 VievAppDataSync' };
const CONCURRENCY = 8;

const get = async (url, tries = 3) => {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: UA });
      if (r.ok) return await r.text();
    } catch {}
    await new Promise((r) => setTimeout(r, 500 * (i + 1)));
  }
  return null;
};

const parseTL = (s) => (s ? Number(String(s).replace(/\./g, '').replace(',', '.')) : undefined);

const parseProduct = (html, brand, url) => {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)];
  let ld;
  for (const b of blocks) {
    try {
      const j = JSON.parse(b[1]);
      if (j['@type'] === 'Product') { ld = j; break; }
    } catch {}
  }
  if (!ld) return null;
  const offer = Array.isArray(ld.offers) ? ld.offers[0] : ld.offers;
  const price = offer?.price ? Number(offer.price) : null;
  const images = (Array.isArray(ld.image) ? ld.image : ld.image ? [ld.image] : []).filter(Boolean);
  // Üstü çizili eski fiyat (varsa): ana fiyattan hemen sonra gelen ilk line-through değeri
  let oldPrice;
  const m = html.match(/line-through[^]{0,200}?children\\":\\"([\d.]+)\s*(?:TL|₺)/);
  if (m) {
    const v = parseTL(m[1]);
    if (v && price && v > price) oldPrice = v;
  }
  const slug = url.split('/').filter(Boolean).pop();
  const isPackage = url.includes('/dugun-paketi/');
  return {
    id: `${brand}-${isPackage ? 'dp-' : ''}${slug}`,
    brand,
    slug,
    name: ld.name,
    category: isPackage ? 'Düğün Paketi' : ld.category || 'Diğer',
    sku: ld.sku,
    price: price && price > 0 ? price : null,
    oldPrice,
    images,
    url,
  };
};

const pool = async (items, fn) => {
  const out = [];
  let i = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx], idx);
        if ((idx + 1) % 100 === 0) console.log(`  ${idx + 1}/${items.length}`);
      }
    }),
  );
  return out;
};

// Sitemap güncel olmayabilir (yeni yüklenen ürünler geç görünür): kategori listelerini de tara.
const listingUrls = async (site, xml) => {
  const found = new Set();
  const origin = site.origin;
  // Listeler: sitedeki kategori sayfaları (sitemap'te kök yola yakın olanlar) + bilinen yollar
  const cats = new Set(
    [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)]
      .map((m) => m[1].trim().replace(origin, ''))
      .filter((p) => p && !p.includes('/urun/') && !p.includes('/dugun-paketi/') && !p.includes('/blog')
        && !/^\/(hakkimizda|magazalar|iletisim|gizlilik|musteri-hizmetleri|fiyat-hesapla|favorilerim)?$/.test(p)),
  );
  if (site.brand === 'mobilya') cats.add('/dugun-paketi');
  const linkRe = /href="((?:https?:\/\/[^"\/]+)?\/(?:urun|dugun-paketi)\/[^"?#\/]+)"/g;
  for (const cat of cats) {
    for (let page = 1; page <= 80; page++) {
      const html = await get(`${origin}${cat}${page > 1 ? `?page=${page}` : ''}`);
      if (!html) break;
      let added = 0;
      for (const m of html.matchAll(linkRe)) {
        const u = m[1].startsWith('http') ? m[1] : origin + m[1];
        if (!found.has(u)) { found.add(u); added++; }
      }
      if (added === 0) break;
    }
  }
  return found;
};

const all = [];
for (const site of SITES) {
  const xml = await get(`${site.origin}/sitemap.xml`);
  if (!xml) throw new Error(`sitemap alınamadı: ${site.origin}`);
  const fromMap = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((m) => m[1].trim())
    .filter((u) => site.paths.some((p) => u.includes(p) && !u.endsWith(p)));
  const fromListing = await listingUrls(site, xml);
  const mapSet = new Set(fromMap);
  const extra = [...fromListing].filter((u) => !mapSet.has(u) && site.paths.some((p) => u.includes(p)));
  console.log(`${site.brand}: sitemap ${fromMap.length}, listelerde ${fromListing.size}, yalnız listede olan (yeni) ${extra.length}`);
  for (const u of extra.slice(0, 30)) console.log('   +', u.replace(site.origin, ''));
  const urls = [...new Set([...fromMap, ...extra])];
  console.log(`${site.brand}: ${urls.length} ürün sayfası`);
  const res = await pool(urls, async (u) => {
    const html = await get(u);
    return html ? parseProduct(html, site.brand, u) : null;
  });
  const ok = res.filter(Boolean);
  console.log(`  ${ok.length} ürün okundu, ${res.length - ok.length} atlandı`);
  all.push(...ok);
}

// Aynı id çakışırsa ilkini tut
const seen = new Set();
const unique = all.filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));

await mkdir('src/data', { recursive: true });
await writeFile('src/data/products.json', JSON.stringify(unique));
console.log(`Toplam ${unique.length} ürün -> src/data/products.json`);
