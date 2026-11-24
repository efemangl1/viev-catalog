// Kullanım: node scripts/fetch-packages.mjs   (önce fetch-products.mjs çalıştırılmış olmalı)
// vievmobilya.com.tr düğün paketi sayfalarından paket içeriğini çeker:
//  - Pakete dahil takımlar (görsel, ad, fiyat, eski fiyat, ürün bağlantısı)
//  - Her takımın parça listesi (2× Üçlü Koltuk gibi) ve notlar
// Sonuç: src/data/packages.json; ayrıca products.json'daki paketlerin fiyat/eski fiyat/görselleri güncellenir.
import { readFile, writeFile } from 'node:fs/promises';

const ORIGIN = 'https://vievmobilya.com.tr';
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

const decode = (s) =>
  s.replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>');

const toLines = (html) =>
  decode(
    html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '')
      .replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<[^>]+>/g, '\n'),
  ).split('\n').map((l) => l.trim()).filter(Boolean);

const num = (s) => (s ? Number(s.replace(/\./g, '')) : undefined);
const abs = (u) => (u.startsWith('http') ? u : ORIGIN + u);
const isPrice = (l) => /^[\d.]+\s*₺$/.test(l);

function parse(html) {
  const iDahil = html.indexOf('Pakete Dahil');
  const iNeler = html.indexOf('Bu Pakette Neler Var');
  if (iDahil < 0) return null;

  // 1) Pakete dahil takımlar
  const seg = html.slice(iDahil, iNeler > 0 ? iNeler : undefined);
  const advantage = (seg.match(/([\d.]+\s*₺)\s*avantaj/) || [])[1];
  const pieces = [];
  const seen = new Set();
  for (const chunk of seg.split('<a href="').slice(1)) {
    const slug = (chunk.match(/^https:\/\/vievmobilya\.com\.tr\/urun\/([^"]+)"/) || [])[1];
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    const body = chunk.slice(0, chunk.indexOf('</a>'));
    const img = (body.match(/<img[^>]+src="([^"]+)"/) || [])[1];
    const ps = [...body.matchAll(/<p[^>]*>([^<]+)<\/p>/g)].map((m) => decode(m[1].trim()));
    const prices = [...body.matchAll(/([\d.]+)\s*₺/g)].map((m) => num(m[1]));
    pieces.push({
      slug,
      type: ps[0] || '',
      name: ps[1] || '',
      image: img ? abs(img) : undefined,
      price: prices[0],
      oldPrice: prices[1],
      subtitle: undefined,
      description: undefined,
      parts: [],
      notes: [],
    });
  }

  // 2) Takım içerikleri (parça listeleri)
  let footerNote;
  if (iNeler > 0) {
    const lines = toLines(html.slice(iNeler));
    const names = new Set(pieces.map((p) => p.name));
    // Takım başlığı: bir satır (tür) + hemen ardından takımın adı
    const isStart = (arr, k) => names.has(arr[k + 1]) && !names.has(arr[k]) && !/^\d+×$/.test(arr[k]);
    const end = lines.findIndex((l) => l.startsWith('Parçaları beğeninize göre değiştirebiliriz'));
    const work = lines.slice(1, end > 0 ? end : lines.length);
    footerNote = end > 0 ? lines[end] : undefined;
    let cur;
    for (let i = 0; i < work.length; i++) {
      const l = work[i];
      if (isStart(work, i)) {
        cur = pieces.find((p) => p.name === work[i + 1] && !p.description && !p.parts.length);
        i += 1;
        if (!cur) continue;
        // opsiyonel alt başlık (ör. 3+3+1): harf içermeyen kısa satır
        if (work[i + 1] && /^[\d+\sx×]+$/.test(work[i + 1])) { cur.subtitle = work[i + 1]; i += 1; }
        if (work[i + 1] && !/^\d+×$/.test(work[i + 1]) && !isStart(work, i + 1)) { cur.description = work[i + 1]; i += 1; }
        continue;
      }
      if (!cur) continue;
      if (/^\d+×$/.test(l) && work[i + 1]) {
        const part = { qty: Number(l.replace('×', '')), name: work[i + 1] };
        i += 1;
        if (work[i + 1] && /^[·+•-]/.test(work[i + 1])) { part.note = work[i + 1].replace(/^[·+•-]\s*/, ''); i += 1; }
        cur.parts.push(part);
      } else if (!names.has(l)) {
        cur.notes.push(l);
      }
    }
  }

  // 3) Paket fiyatı / eski fiyat: "Düğün paketi teklifi al" butonundan hemen önceki satırlar
  const lines = toLines(html.slice(0, iDahil));
  const k = lines.findLastIndex((l) => /Düğün paketi teklifi al/i.test(l));
  let price, oldPrice;
  if (k > 0) {
    const prev = [];
    for (let j = k - 1; j >= 0 && prev.length < 2 && isPrice(lines[j]); j--) prev.unshift(num(lines[j].replace(/\s*₺/, '')));
    if (prev.length === 2) [price, oldPrice] = prev;
    else if (prev.length === 1) price = prev[0];
  }
  const cover = (html.match(/<meta property="og:image" content="([^"]+)"/) || [])[1];
  return { advantage, price, oldPrice, footerNote, pieces, cover };
}

const products = JSON.parse(await readFile('src/data/products.json', 'utf8'));
const pkgs = products.filter((p) => p.id.startsWith('mobilya-dp-'));
console.log(`${pkgs.length} düğün paketi`);

const out = {};
let i = 0, failed = 0;
await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
  while (i < pkgs.length) {
    const p = pkgs[i++];
    const html = await get(p.url);
    const r = html && parse(html);
    if (!r || r.pieces.length === 0) { failed++; console.log('  atlandı:', p.url); continue; }
    out[p.id] = r;
    if (i % 30 === 0) console.log(`  ${i}/${pkgs.length}`);
  }
}));

// products.json'daki paket kayıtlarını zenginleştir
for (const p of products) {
  const r = out[p.id];
  if (!r) continue;
  if (r.price) p.price = r.price;
  p.oldPrice = r.oldPrice && p.price && r.oldPrice > p.price ? r.oldPrice : undefined;
  const imgs = [...new Set([...p.images, ...r.pieces.map((x) => x.image).filter(Boolean)])];
  p.images = imgs;
}

await writeFile('src/data/packages.json', JSON.stringify(out));
await writeFile('src/data/products.json', JSON.stringify(products));

const counts = {};
for (const r of Object.values(out)) counts[r.pieces.length] = (counts[r.pieces.length] || 0) + 1;
const types = {};
for (const r of Object.values(out)) for (const x of r.pieces) types[x.type] = (types[x.type] || 0) + 1;
console.log(`Okunan: ${Object.keys(out).length}, atlanan: ${failed}`);
console.log('Takım sayısı dağılımı:', counts);
console.log('Takım türleri:', types);
console.log('Parçasız takım:', Object.values(out).flatMap((r) => r.pieces).filter((x) => !x.parts.length).length);
