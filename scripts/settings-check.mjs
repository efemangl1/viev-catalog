// config/settings.json okuyup doğrular; uygulamanın okuyacağı "settings" nesnesini üretir.
// Hata varsa Türkçe bir mesajla fırlatır (katalog o zaman YAZILMAZ, eski ayarlar kalır).
import { existsSync, readFileSync } from 'node:fs';

const str = (v) => typeof v === 'string' && v.trim().length > 0;
const optStr = (v) => v === undefined || v === null || typeof v === 'string';

export function parseSettings(text, where = 'settings.json') {
  let s;
  try {
    s = JSON.parse(text);
  } catch (e) {
    throw new Error(`${where} geçerli bir JSON değil (virgül/tırnak hatası olabilir): ${e.message}`);
  }

  // --- Mağazalar ---
  const need = ['id', 'brand', 'city', 'name', 'address', 'phone', 'phoneLabel', 'whatsapp', 'maps'];
  if (!Array.isArray(s.stores) || s.stores.length === 0) throw new Error(`${where}: "stores" boş ya da yok`);
  const ids = new Set();
  for (const st of s.stores) {
    for (const k of need) if (!str(st[k])) throw new Error(`${where}: "${st.id ?? '?'}" mağazasında "${k}" eksik`);
    if (!/^\d{11,15}$/.test(st.whatsapp)) throw new Error(`${where}: "${st.id}" WhatsApp numarası ülke kodlu ve sadece rakam olmalı (örn. 905530720220)`);
    if (!/^\+\d{11,15}$/.test(st.phone)) throw new Error(`${where}: "${st.id}" telefon + ile başlamalı (örn. +905530720220)`);
    if (ids.has(st.id)) throw new Error(`${where}: "${st.id}" kodu iki kez kullanılmış`);
    ids.add(st.id);
  }
  for (const b of ['mobilya', 'corner']) {
    if (!ids.has(s.defaultStore?.[b])) throw new Error(`${where}: defaultStore.${b} bir mağaza koduna işaret etmiyor`);
  }
  const out = {
    stores: s.stores,
    defaultStore: s.defaultStore,
    instagrams: Array.isArray(s.instagrams) ? s.instagrams : [],
  };

  // --- Duyuru bandı (isteğe bağlı) ---
  if (s.duyuru !== undefined) {
    const d = s.duyuru;
    if (typeof d !== 'object' || d === null) throw new Error(`${where}: "duyuru" bir bölüm olmalı`);
    if (typeof d.acik !== 'boolean') throw new Error(`${where}: duyuru.acik true ya da false olmalı (tırnaksız)`);
    if (!optStr(d.metin)) throw new Error(`${where}: duyuru.metin yazı olmalı (tırnak içinde)`);
    if ((d.metin ?? '').length > 160) throw new Error(`${where}: duyuru.metin en fazla 160 karakter olabilir`);
    if (d.acik && !str(d.metin)) throw new Error(`${where}: duyuru açık ama "metin" boş`);
    if (d.marka !== undefined && !['hepsi', 'mobilya', 'corner'].includes(d.marka)) throw new Error(`${where}: duyuru.marka "hepsi", "mobilya" ya da "corner" olmalı`);
    if (!optStr(d.gitsin) || (str(d.gitsin) && !d.gitsin.startsWith('/'))) throw new Error(`${where}: duyuru.gitsin "/" ile başlamalı (örn. "/katalog?kategori=Düğün%20Paketi") ya da boş bırakılmalı`);
    if (str(d.bitis) && !/^\d{4}-\d{2}-\d{2}$/.test(d.bitis)) throw new Error(`${where}: duyuru.bitis GG biçiminde olmalı: YYYY-AA-GG (örn. 2026-12-31) ya da boş`);
    out.duyuru = { acik: d.acik, metin: d.metin ?? '', marka: d.marka ?? 'hepsi', gitsin: d.gitsin ?? '', bitis: d.bitis ?? '' };
  }

  // --- Ana sayfa metinleri ve öne çıkan ürünler (isteğe bağlı) ---
  if (s.anaSayfa !== undefined) {
    const a = s.anaSayfa;
    if (typeof a !== 'object' || a === null) throw new Error(`${where}: "anaSayfa" bir bölüm olmalı`);
    const ap = {};
    for (const b of ['mobilya', 'corner']) {
      const m = a[b];
      if (m === undefined) continue;
      if (typeof m !== 'object' || m === null) throw new Error(`${where}: anaSayfa.${b} bir bölüm olmalı`);
      for (const k of ['etiket', 'baslik', 'altYazi']) {
        if (!optStr(m[k])) throw new Error(`${where}: anaSayfa.${b}.${k} yazı olmalı (tırnak içinde)`);
        if ((m[k] ?? '').length > 220) throw new Error(`${where}: anaSayfa.${b}.${k} çok uzun (en fazla 220 karakter)`);
      }
      ap[b] = { etiket: m.etiket ?? '', baslik: m.baslik ?? '', altYazi: m.altYazi ?? '' };
    }
    const oc = a.oneCikanlar ?? {};
    ap.oneCikanlar = {};
    for (const b of ['mobilya', 'corner']) {
      const list = oc[b] ?? [];
      if (!Array.isArray(list) || list.some((x) => !str(x))) throw new Error(`${where}: anaSayfa.oneCikanlar.${b} bir liste olmalı: ["urun-adresi-1", "urun-adresi-2"]`);
      if (list.length > 8) throw new Error(`${where}: anaSayfa.oneCikanlar.${b} en fazla 8 ürün olabilir`);
      ap.oneCikanlar[b] = list.map((x) => x.trim());
    }
    out.anaSayfa = ap;
  }

  return out;
}

// Dosya yoksa null döner (çağıran önceki ayarları korur)
export function loadSettings(file) {
  if (!existsSync(file)) return null;
  return parseSettings(readFileSync(file, 'utf8'), file);
}
