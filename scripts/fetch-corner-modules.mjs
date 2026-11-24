// Kullanım: node scripts/fetch-corner-modules.mjs
// vievcorner.com/fiyat-hesapla sayfasındaki "Fiyat Hesaplama Aracı" verisini çeker:
// her köşe takımı modelinin kendi modülleri ve parça fiyatları.
// Sonuç: src/data/corner-modules.json
import { writeFile } from 'node:fs/promises';

const ORIGIN = 'https://vievcorner.com';
const res = await fetch(`${ORIGIN}/fiyat-hesapla`, { headers: { 'user-agent': 'Mozilla/5.0 VievAppDataSync' } });
if (!res.ok) throw new Error(`Sayfa alınamadı: ${res.status}`);
const html = await res.text();

// Next.js (RSC) yükü: self.__next_f.push([1,"..."]) parçalarını birleştir
let txt = '';
const re = /self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g;
for (const m of html.matchAll(re)) {
  try { txt += JSON.parse('"' + m[1] + '"'); } catch {}
}
console.log('payload', txt.length);

const start = txt.search(/\[\{"id":"[^"]+","slug":"[^"]+","name":"[^"]+"[^\]]*?"modules":\[/);
if (start < 0) throw new Error('Model listesi bulunamadı (sitenin yapısı değişmiş olabilir)');

// Köşeli parantez eşleştirerek diziyi kes
let depth = 0, end = -1, inStr = false, esc = false;
for (let i = start; i < txt.length; i++) {
  const c = txt[i];
  if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
  if (c === '"') { inStr = true; continue; }
  if (c === '[' || c === '{') depth++;
  else if (c === ']' || c === '}') { depth--; if (depth === 0) { end = i; break; } }
}
const arr = JSON.parse(txt.slice(start, end + 1));
console.log('modeller:', arr.length, '| alanlar:', Object.keys(arr[0]).join(', '));

const kinds = {}, names = {};
for (const m of arr) for (const mod of m.modules) {
  kinds[mod.kind] = (kinds[mod.kind] || 0) + 1;
  names[mod.name] = (names[mod.name] || 0) + 1;
}
console.log('türler:', kinds);
console.log('modül adları:', names);
const odd = arr.filter((m) => m.modules.length !== 3 || m.modules.some((x) => !x.isStandard));
console.log('3 standart modül dışındaki modeller:', odd.length);
for (const m of odd.slice(0, 5)) {
  console.log(' ', m.name, JSON.stringify(m.modules.map((x) => [x.name, x.price, x.isStandard, x.kind])));
}

const out = arr.map((m) => ({
  slug: m.slug,
  name: m.name,
  image: m.coverImage ? (m.coverImage.startsWith('http') ? m.coverImage : ORIGIN + m.coverImage) : undefined,
  modules: [...m.modules]
    .sort((a, b) => a.order - b.order)
    .map((x) => ({
      id: x.id, name: x.name, price: x.price, standard: !!x.isStandard, kind: x.kind,
      description: x.description ?? undefined, dimensions: x.dimensions ?? undefined, image: x.imageUrl ?? undefined,
    })),
}));
await writeFile('src/data/corner-modules.json', JSON.stringify(out));
console.log('Yazıldı: src/data/corner-modules.json');
