// Kullanım: node scripts/notify-new-packages.mjs   (build-catalog.mjs'den SONRA çalışır)
// data/catalog.json'a bakar, yeni eklenen düğün paketleri için kayıtlı telefonlara TEK bir toplu bildirim yollar.
//
// Kurallar (config/settings.json -> "bildirimler"):
//   acik            : false yapılırsa hiçbir bildirim gitmez; o sırada eklenenler "yeni" sayılmaz (toplu yükleme için acil durdurma)
//   kategoriler     : hangi kategoriler bildirim üretir (varsayılan sadece "Düğün Paketi")
//   sessizBaslangic : bu saatten (Türkiye saati) itibaren gönderilmez (varsayılan 21)
//   sessizBitis     : bu saate kadar gönderilmez (varsayılan 9); bekleyenler sabaha kalır
//   gundeEnFazla    : günde en fazla kaç bildirim (varsayılan 1); fazlası ertesi güne kalır
//
// Gizli anahtar (SUPABASE_SERVICE_KEY) yoksa ya da DRY_RUN=1 ise bildirim GÖNDERİLMEZ, sadece ne yapılacağı yazılır.
// Durum dosyası: data/notify-state.json  { known: [id...], pending: [id...], sent: { date, count } }
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const CATALOG = 'data/catalog.json';
const STATE = 'data/notify-state.json';
const SETTINGS = 'config/settings.json';
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
const DRY = process.env.DRY_RUN === '1' || !SUPABASE_URL || !SERVICE_KEY;
const NOW = process.env.NOW_OVERRIDE ? new Date(process.env.NOW_OVERRIDE) : new Date();
const CHANNEL = 'yeni-paket';

const readJson = (f) => JSON.parse(readFileSync(f, 'utf8'));

// --- Ayarlar ---
let cfg = { acik: true, kategoriler: ['Düğün Paketi'], sessizBaslangic: 21, sessizBitis: 9, gundeEnFazla: 1 };
if (existsSync(SETTINGS)) {
  try {
    cfg = { ...cfg, ...(readJson(SETTINGS).bildirimler || {}) };
  } catch (e) {
    console.log(`(${SETTINGS} okunamadı, varsayılan kurallar kullanılıyor: ${e.message})`);
  }
}

// --- Türkiye saati ---
const parts = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false,
}).formatToParts(NOW);
const pick = (t) => parts.find((p) => p.type === t).value;
const today = `${pick('year')}-${pick('month')}-${pick('day')}`;
const hour = Number(pick('hour')) % 24;
const inQuiet = cfg.sessizBaslangic > cfg.sessizBitis
  ? hour >= cfg.sessizBaslangic || hour < cfg.sessizBitis
  : hour >= cfg.sessizBaslangic && hour < cfg.sessizBitis;

// --- Katalog ---
const catalog = readJson(CATALOG);
const eligible = catalog.products.filter((p) => cfg.kategoriler.includes(p.category) && p.images?.length > 0);
const eligibleIds = new Set(eligible.map((p) => p.id));
const byId = new Map(eligible.map((p) => [p.id, p]));

// --- Durum ---
const stateExisted = existsSync(STATE);
let state = stateExisted ? readJson(STATE) : { known: [], pending: [], sent: { date: '', count: 0 } };
const before = JSON.stringify(state);
const save = () => {
  state.known = [...new Set(state.known)].sort();
  state.pending = [...new Set(state.pending)];
  if (JSON.stringify(state) !== before) writeFileSync(STATE, JSON.stringify(state, null, 1) + '\n');
};

if (!stateExisted) {
  // İlk çalıştırma: mevcut ürünleri "zaten biliniyor" say, kimseye bildirim gitmesin
  state.known = [...eligibleIds];
  save();
  console.log(`İlk çalıştırma: ${eligibleIds.size} ürün "biliniyor" olarak kaydedildi, bildirim gönderilmedi.`);
  process.exit(0);
}

const known = new Set(state.known);
const fresh = eligible.filter((p) => !known.has(p.id) && !state.pending.includes(p.id)).map((p) => p.id);

if (cfg.acik === false) {
  // Acil durdurma: şimdiye kadar bekleyen ve yeni görünenler sessizce "bilinen" olur
  state.known.push(...fresh, ...state.pending);
  state.pending = [];
  save();
  console.log(`Bildirimler KAPALI (acik=false). ${fresh.length} yeni ürün bildirimsiz kaydedildi.`);
  process.exit(0);
}

state.pending.push(...fresh);
state.pending = state.pending.filter((id) => eligibleIds.has(id)); // siteden kalkanları at
if (fresh.length) console.log(`Yeni bulunan: ${fresh.map((id) => byId.get(id).name).join(', ')}`);

if (state.pending.length === 0) {
  save();
  console.log('Bildirim gerektiren yeni ürün yok.');
  process.exit(0);
}

const sentToday = state.sent?.date === today ? state.sent.count : 0;
if (inQuiet) {
  save();
  console.log(`Sessiz saat (Türkiye saati ${hour}:00): ${state.pending.length} ürün sabaha bekliyor.`);
  process.exit(0);
}
if (sentToday >= cfg.gundeEnFazla) {
  save();
  console.log(`Bugün zaten ${sentToday} bildirim gitti (sınır ${cfg.gundeEnFazla}): ${state.pending.length} ürün yarına bekliyor.`);
  process.exit(0);
}

// --- Mesaj ---
const items = state.pending.map((id) => byId.get(id));
const onlyPackages = cfg.kategoriler.length === 1 && cfg.kategoriler[0] === 'Düğün Paketi';
const what = onlyPackages ? 'düğün paketi' : 'ürün';
const short = (n) => n.replace(/ Düğün Paketi$/i, '').trim();
let title, body, url;
if (items.length === 1) {
  title = `Yeni ${what} geldi`;
  body = `${items[0].name} şimdi uygulamada.`;
  url = `/urun/${items[0].id}`;
} else {
  title = `${items.length} yeni ${what} geldi`;
  const names = items.slice(0, 2).map((p) => (onlyPackages ? short(p.name) : p.name));
  const rest = items.length - names.length;
  body = rest > 0 ? `${names.join(', ')} ve ${rest} tane daha uygulamada.` : `${names.join(' ve ')} şimdi uygulamada.`;
  url = `/katalog?kategori=${encodeURIComponent(cfg.kategoriler[0])}`;
}

console.log(`Gönderilecek: "${title}" / "${body}" -> ${url}`);

if (DRY) {
  save(); // bekleyenler kaydedilir ama "gönderildi" sayılmaz
  console.log(DRY_REASON());
  process.exit(0);
}
function DRY_REASON() {
  return process.env.DRY_RUN === '1'
    ? '(DRY_RUN: gönderilmedi)'
    : '(SUPABASE_URL / SUPABASE_SERVICE_KEY tanımlı değil: gönderilmedi, bekleyenler saklandı)';
}

// --- Telefon kodlarını al ---
const sb = (path, init = {}) =>
  fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });

const tokens = [];
for (let offset = 0; ; offset += 1000) {
  const res = await sb(`push_tokens?select=token&enabled=eq.true&order=created_at.asc&limit=1000&offset=${offset}`);
  if (!res.ok) throw new Error(`Supabase kodları okunamadı: HTTP ${res.status} ${await res.text()}`);
  const rows = await res.json();
  tokens.push(...rows.map((r) => r.token));
  if (rows.length < 1000) break;
}
console.log(`Kayıtlı ve bildirimi açık telefon: ${tokens.length}`);

if (tokens.length === 0) {
  // Gönderecek kimse yok: bir şey kaybetmemek için "gönderildi" saymıyoruz, bekleyenler kalır
  save();
  console.log('Kayıtlı telefon yok, bildirim bekletildi.');
  process.exit(0);
}

// --- Expo push servisi (100'erli gruplar) ---
let ok = 0, failed = 0;
const dead = [];
for (let i = 0; i < tokens.length; i += 100) {
  const chunk = tokens.slice(i, i + 100);
  const res = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(chunk.map((to) => ({ to, title, body, data: { url }, channelId: CHANNEL, sound: 'default', priority: 'default' }))),
  });
  if (!res.ok) { failed += chunk.length; console.log(`Expo hata: HTTP ${res.status} ${await res.text()}`); continue; }
  const { data } = await res.json();
  data.forEach((t, k) => {
    if (t.status === 'ok') ok++;
    else {
      failed++;
      if (t.details?.error === 'DeviceNotRegistered') dead.push(chunk[k]);
      else console.log(`Bildirim hatası: ${t.message || JSON.stringify(t)}`);
    }
  });
}
console.log(`Gönderim: ${ok} başarılı, ${failed} başarısız.`);

// Silinmiş/kaldırılmış uygulamaların kodlarını temizle
if (dead.length) {
  const list = dead.map((t) => `"${t}"`).join(',');
  const del = await sb(`push_tokens?token=in.(${encodeURIComponent(list)})`, { method: 'DELETE' });
  console.log(`Geçersiz ${dead.length} kod silindi (HTTP ${del.status}).`);
}

if (ok === 0) {
  // Hiç gitmediyse (ağ/anahtar sorunu) "gönderildi" sayma, sonraki çalıştırmada tekrar denensin
  save();
  throw new Error('Hiçbir bildirim gönderilemedi; bekleyenler saklandı, sonraki çalıştırmada tekrar denenecek.');
}

state.known.push(...state.pending);
state.pending = [];
state.sent = { date: today, count: sentToday + 1 };
save();
console.log('Tamam: bildirim gönderildi ve kaydedildi.');
