// Kullanım: node scripts/fetch-old-prices.mjs   (önce fetch-products.mjs çalıştırılmış olmalı)
// vievmobilya.com.tr kategori listelerindeki kartlardan güncel fiyat + üstü çizili eski fiyatı çeker
// (ürün sayfalarında eski fiyat yazmıyor, listelerde yazıyor) ve products.json'u günceller.
import { readFile, writeFile } from 'node:fs/promises';

const ORIGIN = 'https://vievmobilya.com.tr';
const UA = { 'user-agent': 'Mozilla/5.0 VievAppDataSync' };
const CATEGORIES = [
  'koltuk-takimi', 'yatak-odasi-takimi', 'yemek-odasi-takimi', 'tv-unitesi',
  'yatak-giyinme-dolabi', 'yatak-setleri', 'yataklar', 'bazalar', 'basliklar', 'yatak-baza',
];
const MAX_PAGES = 80;

const get = async (url, tries = 3) => {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: UA });
      if (r.ok) return await r.text();
      if (r.status === 404) return null;
    } catch {}
    await new Promise((r) => setTimeout(r, 500 * (i + 1)));
  }
  return null;
};

const num = (s) => Number(s.replace(/\./g, ''));

// Bir kategori sayfasındaki kartlar: { slug, price, oldPrice }
const parseCards = (html) => {
  const out = [];
  for (const part of html.split('<article').slice(1)) {
    const a = part.slice(0, part.indexOf('</article>'));
    const slug = (a.match(/href="https:\/\/vievmobilya\.com\.tr\/urun\/([^"]+)"/) || [])[1];
    if (!slug) continue;
    const old = (a.match(/<s[^>]*>\s*([\d.]+)\s*₺\s*<\/s>/) || [])[1];
    const cur = (a.match(/<span[^>]*>\s*([\d.]+)\s*₺\s*<\/span>/) || [])[1];
    out.push({ slug, price: cur ? num(cur) : null, oldPrice: old ? num(old) : null });
  }
  return out;
};

const listing = new Map(); // slug -> {price, oldPrice}
for (const cat of CATEGORIES) {
  let pages = 0, found = 0;
  for (let p = 1; p <= MAX_PAGES; p++) {
    const html = await get(`${ORIGIN}/${cat}?page=${p}`);
    if (!html) break;
    const cards = parseCards(html);
    const fresh = cards.filter((c) => !listing.has(c.slug) || p === 1);
    if (cards.length === 0) break;
    let added = 0;
    for (const c of cards) if (!listing.has(c.slug)) { listing.set(c.slug, c); added++; }
    pages++; found += cards.length;
    if (added === 0 && p > 1) break; // sayfa tekrar ediyor (son sayfanın ötesi)
    void fresh;
  }
  console.log(`${cat}: ${pages} sayfa, ${found} kart`);
}
console.log('listelerde toplam ürün:', listing.size);

const products = JSON.parse(await readFile('src/data/products.json', 'utf8'));
let eslesen = 0, eskiEklenen = 0, fiyatDolan = 0, fiyatFarkli = 0, farkOrnek = [];
for (const p of products) {
  if (p.brand !== 'mobilya' || p.id.startsWith('mobilya-dp-')) continue; // paketler fetch-packages ile
  const l = listing.get(p.slug);
  if (!l) continue;
  eslesen++;
  if (l.price && p.price && l.price !== p.price) {
    fiyatFarkli++;
    if (farkOrnek.length < 5) farkOrnek.push(`${p.name}: sayfa ${p.price} / liste ${l.price}`);
  }
  if (l.price && !p.price) { p.price = l.price; fiyatDolan++; }
  if (l.oldPrice && p.price && l.oldPrice > p.price) { p.oldPrice = l.oldPrice; eskiEklenen++; }
  else delete p.oldPrice;
}
await writeFile('src/data/products.json', JSON.stringify(products));
console.log({ eslesen, eskiEklenen, fiyatDolan, fiyatFarkli });
if (farkOrnek.length) console.log('fiyat farkı örnekleri:\n ' + farkOrnek.join('\n '));
