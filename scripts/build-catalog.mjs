// Kullanım: node scripts/build-catalog.mjs
// Tüm veri çekme betiklerini sırayla çalıştırır ve uygulamanın internetten okuyacağı tek dosyayı üretir:
//   data/catalog.json  -> { generatedAt, hash, products, packages, corner }
// Koruma: yeni veri öncekinden belirgin biçimde küçükse (site geçici olarak bozuk/erişilemezse)
// dosya DEĞİŞTİRİLMEZ, hata koduyla çıkılır. Veri değişmediyse dosya aynı kalır (gereksiz güncelleme yok).
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const steps = ['fetch-products.mjs', 'fetch-packages.mjs', 'fetch-old-prices.mjs', 'fetch-corner-modules.mjs'];

mkdirSync('src/data', { recursive: true });
mkdirSync('data', { recursive: true });

for (const s of steps) {
  console.log(`\n=== ${s}`);
  execFileSync(process.execPath, [join(here, s)], { stdio: 'inherit' });
}

const read = (f) => JSON.parse(readFileSync(f, 'utf8'));
const products = read('src/data/products.json');
// Paketler paralel çekildiği için anahtar sırası her seferinde değişir: sırala (aksi halde her saat "değişti" sanılır)
const rawPackages = read('src/data/packages.json');
const packages = Object.fromEntries(Object.keys(rawPackages).sort().map((k) => [k, rawPackages[k]]));
const corner = read('src/data/corner-modules.json');

// Temel sağlık kontrolleri
const count = (b) => products.filter((p) => p.brand === b).length;
if (count('mobilya') < 500 || count('corner') < 50 || corner.length < 5) {
  throw new Error(`Veri beklenenden çok az (mobilya ${count('mobilya')}, corner ${count('corner')}, köşe modeli ${corner.length}) — yazılmadı`);
}

const OUT = 'data/catalog.json';
const prev = existsSync(OUT) ? read(OUT) : null;
if (prev && products.length < prev.products.length * 0.8) {
  throw new Error(`Ürün sayısı ${prev.products.length} -> ${products.length}'e düştü (>%20) — site sorunlu olabilir, yazılmadı`);
}

const body = { products, packages, corner };
const hash = createHash('sha256').update(JSON.stringify(body)).digest('hex').slice(0, 16);
if (prev && prev.hash === hash) {
  console.log(`\nVeri değişmedi (${hash}) — ${OUT} aynı kaldı.`);
} else {
  const generatedAt = new Date().toISOString();
  writeFileSync(OUT, JSON.stringify({ generatedAt, hash, ...body }));
  writeFileSync('src/data/meta.json', JSON.stringify({ generatedAt }) + '\n');
  const prevIds = new Set((prev?.products ?? []).map((p) => p.id));
  const nowIds = new Set(products.map((p) => p.id));
  const added = products.filter((p) => !prevIds.has(p.id)).length;
  const removed = [...prevIds].filter((id) => !nowIds.has(id)).length;
  console.log(`\nGüncellendi: ${products.length} ürün (+${added} / -${removed}) -> ${OUT} (${hash})`);
}
