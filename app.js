'use strict';
/* TAMER TAKİP — e-fatura, tedarikçi, ürün, cari, banka/kart, gelir-gider, stok */

// ---------- yardımcılar ----------
const TR = 'tr-TR';
const NF2 = new Intl.NumberFormat(TR, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const NF0 = new Intl.NumberFormat(TR, { maximumFractionDigits: 0 });
const NF3 = new Intl.NumberFormat(TR, { maximumFractionDigits: 3 });
const fmt = n => (n == null || isNaN(n) || n === '') ? '' : NF2.format(n);
const fmt0 = n => (n == null || isNaN(n)) ? '' : NF0.format(n);
const fmtQ = n => (n == null || isNaN(n)) ? '' : NF3.format(n);
const AY = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const up = s => String(s || '').toLocaleUpperCase(TR);
const norm = s => up(s).replace(/İ/g, 'I').replace(/Ş/g, 'S').replace(/Ğ/g, 'G').replace(/Ü/g, 'U').replace(/Ö/g, 'O').replace(/Ç/g, 'C').replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const dTR = iso => iso ? iso.slice(8, 10) + '.' + iso.slice(5, 7) + '.' + iso.slice(0, 4) : '';
const mIdx = iso => parseInt(iso.slice(5, 7), 10) - 1;
const sum = (a, f) => a.reduce((s, x) => s + (f ? f(x) : x), 0);
const r2 = n => Math.round(n * 100) / 100;
const $ = s => document.querySelector(s);
function toast(msg, err) { const t = $('#toast'); t.textContent = msg; t.className = err ? 'err' : ''; t.style.display = 'block'; clearTimeout(toast.t); toast.t = setTimeout(() => t.style.display = 'none', err ? 7000 : 3500); }
function openModal(html) { $('#mbody').innerHTML = html; $('#modal').classList.remove('hidden'); }
function closeModal() { $('#modal').classList.add('hidden'); }
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });

const UNIT = { C62: 'Adet', NIU: 'Adet', EA: 'Adet', AD: 'Adet', KGM: 'Kg', GRM: 'Gr', LTR: 'Lt', PA: 'Paket', PK: 'Paket', AB: 'Paket', BX: 'Kutu', DZN: 'Düzine', KWH: 'kWh', KW: 'kW', MON: 'Ay', HUR: 'Saat', MTR: 'Metre', MTK: 'm²', BG: 'Torba' };
function prodName(name, desc) {
  let n = String(name || '').trim();
  if (n.replace(/[^\p{L}]/gu, '').length < 3 && String(desc || '').trim()) n = String(desc).trim();
  return n.replace(/\s+/g, ' ');
}

// ---------- kategoriler ----------
const SUP_CATS = ['Gıda & Hammadde', 'İçecek & Kahve', 'Kira & Otopark', 'Elektrik', 'Doğalgaz', 'Su', 'İletişim', 'Temizlik & Ambalaj', 'Ekipman & Demirbaş', 'Bakım & Hizmet', 'Danışmanlık & Muhasebe', 'Reklam & Pazarlama', 'Yazılım & Abonelik', 'Sigorta', 'Ulaşım & Yemek', 'Diğer'];
// kind: gelir | gider | odeme (cariye ödeme) | notr (gelir/gidere girmez)
const TX_CATS = {
  'POS tahsilatı': 'gelir', 'Nakit satış': 'gelir', 'Nakit yatırma': 'gelir', 'Diğer gelir': 'gelir',
  'Tedarikçi ödemesi': 'odeme',
  'Personel / maaş': 'gider', 'SGK primi': 'gider', 'Stopaj / gelir vergisi': 'gider', 'Vergi / harç': 'gider',
  'KDV ödemesi': 'kdv', 'Kurumlar / geçici vergi': 'vergi', 'Pazaryeri ödemesi': 'odeme', 'Kira & Otopark': 'gider', 'Banka & POS masrafı': 'gider', 'Kredi / faiz': 'gider', 'Faturasız gider': 'gider', 'Sınıflanmamış': 'gider',
  'Ortak / şahsi': 'notr', 'Virman (kendi hesap)': 'notr', 'Kart borç ödemesi': 'notr', 'Taksit (toplamı sayıldı)': 'notr', 'Önceki yıl (kapsam dışı)': 'notr'
};
function guessCat(name) {
  const n = norm(name);
  for (const [re, c] of CAT_HINTS) if (re.test(n)) return c; // işletmeye özel ipuçları (private)
  const R = [
    [/ENERJISA|ELEKTRIK PERAKENDE/, 'Elektrik'], [/IGDAS|GAZ DAGITIM/, 'Doğalgaz'], [/ISKI|\bSU\b.*IDARE|SU HIZMETLERI/, 'Su'],
    [/TTNET|TELEKOM|TURKCELL|VODAFONE|SUPERONLINE|TURKNET/, 'İletişim'], [/GAYRIMENKUL|EMLAK|OTOPARK/, 'Kira & Otopark'], [/REKLAM|MEDYA|AJANS|INFLUENCER|TANITIM|GOOGLE ADS/, 'Reklam & Pazarlama'],
    [/MICROSOFT|ANTHROPIC|CLAUDE|ABONELIK|AMAZON PRIME/, 'Yazılım & Abonelik'], [/SIGORTA/, 'Sigorta'],
    [/TRENDYOL|HEPSIBURADA/, 'Ekipman & Demirbaş'], [/KARGO|KAHVE DUNYASI/, 'Ulaşım & Yemek'],
    [/MUSAVIR|MALI MUS|MUHASEBE|HUKUK|AVUKAT|DANISMANLIK/, 'Danışmanlık & Muhasebe'],
    [/KAHVE|COFFEE|ROASTERY|ROASTER|KAFFE|\bCAY\b|ICECEK|KAYNAK SU|MADEN SU|MESRUBAT|COCA|PEPSI/, 'İçecek & Kahve'],
    [/TEMIZLIK|HIJYEN|KIMYA|KIMYEVI|AMBALAJ|KAGIT|PLASTIK|MOP|DETERJAN/, 'Temizlik & Ambalaj'],
    [/IKLIMLENDIRME|KLIMA|SOGUTMA|MAKINA|MAKINE|ENDUSTRIYEL|ELEKTRONIK|BAUHAUS|KOCTAS|IKEA|APPLE|MEDIA MARKT|MOBILYA|AYDINLATMA|AVIZE|DEKORASYON|INSAAT MALZ|YAPI MARKET/, 'Ekipman & Demirbaş'],
    [/SERVIS|BAKIM|TEKNIK|ILACLAMA|HASERE|GUVENLIK|IS SAGLIGI|OTOMATIK KAPI|ASANSOR|YAZILIM|BILISIM/, 'Bakım & Hizmet'],
    [/MARTI|YEMEKSEPETI|TURIZM SEYAHAT|PAMUKKALE|TAKSI|AKARYAKIT|PETROL|OPET|SHELL/, 'Ulaşım & Yemek'],
    [/GIDA|TARIM|MARKET|METRO|MIGROS|BIDFOOD|TAVUK|MANDIRA|\bSUT\b|PEYNIR|\bET\b|FIRIN|UNLU|SARKUTERI|BALIK|SEBZE|MEYVE|DONDURMA|PASTA|CIKOLATA|BAHARAT/, 'Gıda & Hammadde']
  ];
  for (const [re, c] of R) if (re.test(n)) return c;
  return 'Diğer';
}
// ad yetmezse faturadaki ürün adlarına bak
function guessCatFull(p, linesByVkn) {
  const c = guessCat(p.name);
  const ls = linesByVkn.get(p.key) || []; if (!ls.length) return c;
  const txt = ' ' + norm(ls.slice(0, 40).map(l => l.name).join(' ')) + ' ';
  if (c !== 'Diğer' && !(c === 'Kira & Otopark' && !/KIRA|OTOPARK|AIDAT/.test(txt))) return c;
  const R = [
    [/AJANS|ORGANIZASYON|REKLAM|INFLUENCER|TANITIM/, 'Reklam & Pazarlama'], [/OTOPARK|KIRA BEDELI|AIDAT/, 'Kira & Otopark'],
    [/DEFTER|BEYANNAME|MUSAVIR/, 'Danışmanlık & Muhasebe'],
    [/TAMIR|SERVIS|ISCILIK|BAKIM|MONTAJ|ILACLAMA|YANGIN|KEPENK|HAVALANDIRMA|DOLUM|MUAYENE/, 'Bakım & Hizmet'],
    [/MADEN SUYU| BUZ |KAHVE CEKIRDEK|SURUP|MONIN|LIMONATA|MEYVE SUYU| CAY /, 'İçecek & Kahve'],
    [/HAVLU|SABUN|DEZENFEKTAN|POSET|PIPET|PECETE|DETERJAN|COP TORBA|STREC|FOLYO|BARDAK|ONLUK|BEZ /, 'Temizlik & Ambalaj'],
    [/KIRLENT|TABLO|SAKSI|YAPAY|VAZO|DEKOR| LED |PERDE|SERAMIK|BATARYA|EVIYE|KUMANDA|KABLO|TARTI|MAKINA|SEMSIYE|BICAK|FIRCA/, 'Ekipman & Demirbaş'],
    [/PEYNIR| SUT | UN | UNU |YAG|TAVUK|SEBZE|MEYVE|SALCA|SEKER|YUMURTA|CREMYVIT|JELATIN|LIMON|EKMEK|PASTA/, 'Gıda & Hammadde']
  ];
  for (const [re, c2] of R) if (re.test(txt)) return c2;
  return 'Diğer';
}

// ---------- veri / kalıcılık ----------
let S = null;
const IDX = { inv: new Map(), invNo: new Set(), tx: new Set(), tokens: new Map(), partyHasInv: new Set() };
function newState() { return { ver: 1, invoices: [], lines: [], tx: [], parties: {}, rules: [], counts: {}, planned: [], meta: {}, log: [] }; }
const DB = {
  open() { return new Promise((res, rej) => { const r = indexedDB.open('tamer_takip', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); },
  async get(k) { const db = await this.open(); return new Promise((res, rej) => { const q = db.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); },
  async put(k, v) { const db = await this.open(); return new Promise((res, rej) => { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = () => res(); t.onerror = () => rej(t.error); }); }
};
// ---------- BULUT (Supabase, "finans" şeması, tt_* tabloları) ----------
const CLOUD = {
  url: 'https://zengmcrnlvuzqumxwssw.supabase.co',
  key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InplbmdtY3JubHZ1enF1bXh3c3N3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIxNzQzMzAsImV4cCI6MjEwNzc1MDMzMH0.49fBnNHXwN3b4P2_utfCacMpSs7FqLuwMUY4ONsZ-7g',
  sess: null, role: null, online: false, busy: false, err: '',
  loadSess() { try { this.sess = JSON.parse(localStorage.getItem('tt_sess') || 'null'); } catch { this.sess = null; } },
  saveSess() { try { this.sess ? localStorage.setItem('tt_sess', JSON.stringify(this.sess)) : localStorage.removeItem('tt_sess'); } catch { } },
  async auth(body, grant) {
    const r = await fetch(`${this.url}/auth/v1/token?grant_type=${grant}`, { method: 'POST', headers: { apikey: this.key, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error_description || j.msg || j.error || ('Giriş hatası ' + r.status));
    this.sess = { at: j.access_token, rt: j.refresh_token, exp: Date.now() + (j.expires_in || 3600) * 1000, uid: j.user && j.user.id, email: j.user && j.user.email };
    this.saveSess(); return this.sess;
  },
  login(user, pass) { const email = user.includes('@') ? user.trim() : user.trim().toLowerCase() + '@matters.app'; return this.auth({ email, password: pass }, 'password'); },
  async token() {
    if (!this.sess) throw new Error('Oturum yok');
    if (Date.now() > this.sess.exp - 60000) await this.auth({ refresh_token: this.sess.rt }, 'refresh_token');
    return this.sess.at;
  },
  logout() { this.sess = null; this.role = null; this.saveSess(); },
  async req(method, path, body, prefer, range) {
    const h = { apikey: this.key, Authorization: 'Bearer ' + await this.token(), 'Accept-Profile': 'finans', 'Content-Profile': 'finans' };
    if (body !== undefined) h['Content-Type'] = 'application/json';
    if (prefer) h.Prefer = prefer;
    if (range) { h['Range-Unit'] = 'items'; h.Range = range; }
    const r = await fetch(`${this.url}/rest/v1/${path}`, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
    if (!r.ok) { const t = await r.text(); throw new Error(`${path.split('?')[0]}: ${r.status} ${t.slice(0, 200)}`); }
    const t = await r.text(); return t ? JSON.parse(t) : null;
  },
  async all(table, order) {
    // önce toplam sayı, sonra sayfalar paralel (1000'er satır)
    const P = 1000;
    const h = { apikey: this.key, Authorization: 'Bearer ' + await this.token(), 'Accept-Profile': 'finans', Prefer: 'count=exact', 'Range-Unit': 'items', Range: `0-${P - 1}` };
    const q = table.includes('?') ? `${table}&order=${order}` : `${table}?select=*&order=${order}`;
    const r = await fetch(`${this.url}/rest/v1/${q}`, { headers: h });
    if (!r.ok) throw new Error(`${table}: ${r.status} ${(await r.text()).slice(0, 200)}`);
    const first = await r.json(); const total = parseInt((r.headers.get('content-range') || '').split('/')[1], 10) || first.length;
    const pages = []; for (let from = P; from < total; from += P) pages.push(from);
    const res = new Array(pages.length); let idx = 0;
    const worker = async () => { while (idx < pages.length) { const i = idx++; res[i] = await this.req('GET', q, undefined, 'count=none', `${pages[i]}-${pages[i] + P - 1}`); } };
    await Promise.all(Array.from({ length: Math.min(6, pages.length) }, worker));
    return first.concat(...res);
  },
  async upsert(table, rows, key) { for (let i = 0; i < rows.length; i += 500) await this.req('POST', `${table}?on_conflict=${key}`, rows.slice(i, i + 500), 'resolution=merge-duplicates,return=minimal'); },
  async del(table, key, ids) { for (let i = 0; i < ids.length; i += 100) await this.req('DELETE', `${table}?${key}=in.(${encodeURIComponent(ids.slice(i, i + 100).map(x => '"' + String(x).replace(/"/g, '\\"') + '"').join(','))})`); }
};
// değişen kayıtlar (buluta gönderilmeyi bekleyen)
const PEND = { inv: new Set(), lines: new Set(), tx: new Set(), txDel: new Set(), par: new Set(), rules: new Set(), counts: new Set(), countsDel: new Set(), plan: new Set(), meta: new Set() };
const mark = (k, id) => PEND[k].add(id);
const pendCount = () => Object.values(PEND).reduce((s, x) => s + x.size, 0);
function pendToJSON() { const o = {}; for (const k in PEND) o[k] = [...PEND[k]]; return o; }
function pendFromJSON(o) { for (const k in PEND) { PEND[k].clear(); for (const v of (o && o[k]) || []) PEND[k].add(v); } }
function markAll() {
  S.invoices.forEach(i => mark('inv', i.ettn)); S.lines.forEach(l => mark('lines', l.id)); S.tx.forEach(t => mark('tx', t.k));
  Object.keys(S.parties).forEach(k => mark('par', k)); S.rules.forEach(r => mark('rules', r.kw));
  for (const k in S.counts) for (const c of S.counts[k]) mark('counts', c.id);
  (S.planned || []).forEach(p => mark('plan', p.id));
  Object.keys(S.meta || {}).forEach(k => mark('meta', k));
}
function ensureLineIds() { const n = new Map(); for (const l of S.lines) { const i = (n.get(l.ettn) || 0) + 1; n.set(l.ettn, i); if (!l.id) l.id = l.ettn + '#' + i; } }
function ensureCountIds() { for (const k in S.counts) S.counts[k].forEach((c, i) => { if (!c.id) c.id = k + '|' + c.d + '|' + i; }); }
const rowInv = i => ({ ettn: i.ettn, no: i.no, date: i.date, vkn: i.vkn, name: i.name, type: i.type, net: i.net, vat: i.vat, total: i.total, pay: i.pay, due: i.due || null, src: i.src });
const rowLine = l => ({ id: l.id, ettn: l.ettn, date: l.date, vkn: l.vkn, name: l.name, code: l.code, qty: l.qty, unit: l.unit, net: l.net, rate: l.rate, vat: l.vat });
const rowTx = t => ({ k: t.k, src: t.src, acc: t.acc, date: t.date, descr: t.desc, sector: t.sector || '', amt: t.amt, file: t.file, man: !!t.man, cat: t.man ? t.cat : null, party: t.man ? t.party : null });
const rowPar = p => ({ key: p.key, name: p.name, vkn: p.vkn || '', cat: p.cat, cat_set: !!p.catSet, devir: p.devir || 0, updated_at: new Date().toISOString() });
async function flushCloud() {
  if (!CLOUD.sess || CLOUD.busy || !pendCount()) { syncBadge(); return; }
  if (CLOUD.role === 'viewer') { syncBadge(); return; }
  CLOUD.busy = true; syncBadge();
  try {
    const take = k => { const a = [...PEND[k]]; a.forEach(x => PEND[k].delete(x)); return a; };
    const back = (k, a) => a.forEach(x => PEND[k].add(x));
    const steps = [
      ['inv', ids => CLOUD.upsert('tt_invoices', ids.map(id => IDX.inv.get(id.toLowerCase())).filter(Boolean).map(rowInv), 'ettn')],
      ['lines', ids => { const s = new Set(ids); return CLOUD.upsert('tt_lines', S.lines.filter(l => s.has(l.id)).map(rowLine), 'id'); }],
      ['tx', ids => { const s = new Set(ids); return CLOUD.upsert('tt_tx', S.tx.filter(t => s.has(t.k)).map(rowTx), 'k'); }],
      ['par', ids => CLOUD.upsert('tt_parties', ids.map(k => S.parties[k]).filter(Boolean).map(rowPar), 'key')],
      ['rules', async ids => { const s = new Set(ids); const keep = S.rules.filter(r => s.has(r.kw)); await CLOUD.upsert('tt_rules', keep.map(r => ({ kw: r.kw, cat: r.cat, party: r.party || null, created_at: r.at || new Date().toISOString() })), 'kw'); const gone = ids.filter(id => !keep.some(r => r.kw === id)); if (gone.length) await CLOUD.del('tt_rules', 'kw', gone); }],
      ['counts', ids => { const s = new Set(ids); const rows = []; for (const k in S.counts) for (const c of S.counts[k]) if (s.has(c.id)) rows.push({ id: c.id, pkey: k, d: c.d, q: c.q }); return CLOUD.upsert('tt_counts', rows, 'id'); }],
      ['countsDel', ids => CLOUD.del('tt_counts', 'id', ids)],
      ['txDel', ids => CLOUD.del('tt_tx', 'k', ids)],
      ['meta', ids => CLOUD.upsert('tt_meta', ids.filter(k => S.meta && k in S.meta).map(k => ({ k, v: S.meta[k] })), 'k')],
      ['plan', ids => { const s = new Set(ids); return CLOUD.upsert('tt_planned', (S.planned || []).filter(p => s.has(p.id)).map(p => ({ id: p.id, kind: p.kind || 'odeme', due: p.due, amount: p.amount, party: p.party || null, invoice_no: p.invoice_no || null, descr: p.descr || '', status: p.status || 'bekliyor', recurrence: p.recurrence || 'yok', src: p.src || 'TT', updated_at: new Date().toISOString() })), 'id'); }]
    ];
    for (const [k, fn] of steps) { const ids = take(k); if (!ids.length) continue; try { await fn(ids); } catch (e) { back(k, ids); throw e; } }
    CLOUD.online = true; CLOUD.err = '';
    await CLOUD.req('POST', 'tt_meta?on_conflict=k', [{ k: 'seedVer', v: S.seedVer || 0 }], 'resolution=merge-duplicates,return=minimal').catch(() => { });
  } catch (e) { CLOUD.online = false; CLOUD.err = e.message; console.warn(e); }
  finally { CLOUD.busy = false; DB.put('pending', JSON.stringify(pendToJSON())).catch(() => { }); syncBadge(); if (pendCount() && CLOUD.online) setTimeout(flushCloud, 500); }
}
let syncT;
setInterval(() => { if (pendCount() && !CLOUD.busy && CLOUD.sess) flushCloud(); }, 60000); // bağlantı gelince bekleyenleri gönder
// ---------- yetki ----------
const ROLE_TR = { admin: 'Yönetici', editor: 'Düzenleyici', viewer: 'Görüntüleyici' };
const canWrite = () => !(CLOUD.sess && CLOUD.role === 'viewer');
const isAdmin = () => !CLOUD.sess || CLOUD.role === 'admin';
function guard() { if (canWrite()) return true; toast('Sadece görüntüleme yetkiniz var; değişiklik yapılamaz.', true); return false; }
function syncBadge() {
  document.body.classList.toggle('ro', !canWrite());
  const el = $('#sync'); if (!el) return;
  if (!CLOUD.sess) { el.innerHTML = '<span title="Buluta bağlı değil, veriler sadece bu bilgisayarda">⚠ Çevrimdışı</span> <a href="javascript:void 0" onclick="showLogin()">Giriş</a>'; return; }
  const who = esc((CLOUD.sess.email || '').replace('@matters.app', '')) + (CLOUD.role ? ' (' + (ROLE_TR[CLOUD.role] || CLOUD.role) + ')' : '');
  const st = CLOUD.busy ? '⟳ Kaydediliyor…' : pendCount() ? (CLOUD.online ? '⟳ ' + pendCount() + ' bekliyor' : '⚠ ' + pendCount() + ' kayıt gönderilemedi') : '☁ Bulutta kayıtlı';
  el.innerHTML = `<span title="${esc(CLOUD.err)}">${st}</span> · ${who} · <a href="javascript:void 0" onclick="doLogout()">Çıkış</a>`;
}
let saveT;
function save() {
  clearTimeout(saveT);
  saveT = setTimeout(() => {
    DB.put('state', JSON.stringify(S)).catch(e => toast('Kaydedilemedi: ' + e, true));
    DB.put('pending', JSON.stringify(pendToJSON())).catch(() => { });
    flushCloud();
  }, 250);
}
// buluttan tüm veriyi çek → S
async function loadFromCloud() {
  const [inv, lines, tx, par, rules, counts, meta] = await Promise.all([
    CLOUD.all('tt_invoices', 'ettn'), CLOUD.all('tt_lines', 'id'), CLOUD.all('tt_tx?select=k,src,acc,date,descr,sector,amt,file,man,cat,party,created_at', 'k'), CLOUD.all('tt_parties', 'key'),
    CLOUD.all('tt_rules', 'created_at.desc'), CLOUD.all('tt_counts', 'id'), CLOUD.all('tt_meta', 'k')]);
  const planned = await CLOUD.all('tt_planned', 'due').catch(() => []);
  const n = s => (s == null ? 0 : Number(s));
  const st = newState();
  st.invoices = inv.map(i => ({ ettn: i.ettn, no: i.no, date: i.date, vkn: i.vkn, name: i.name, type: i.type, net: n(i.net), vat: n(i.vat), total: n(i.total), pay: n(i.pay), due: i.due || '', src: i.src }));
  // satır sırası fatura içindeki sırayı korusun
  st.lines = lines.map(l => ({ id: l.id, ettn: l.ettn, date: l.date, vkn: l.vkn, name: l.name, code: l.code, qty: n(l.qty), unit: l.unit, net: n(l.net), rate: n(l.rate), vat: n(l.vat), _o: parseInt(String(l.id).split('#').pop(), 10) || 0 }))
    .sort((a, b) => a.ettn < b.ettn ? -1 : a.ettn > b.ettn ? 1 : a._o - b._o);
  st.lines.forEach(l => delete l._o);
  st.tx = tx.map(t => ({ k: t.k, src: t.src, acc: t.acc, date: t.date, desc: t.descr || '', sector: t.sector || '', amt: n(t.amt), file: t.file, cat: t.man ? (t.cat || '') : '', party: t.man ? t.party : null, man: !!t.man, eff: null, _c: t.created_at }))
    .sort((a, b) => (a._c || '').localeCompare(b._c || ''));
  st.tx.forEach(t => delete t._c);
  for (const p of par) st.parties[p.key] = { key: p.key, name: p.name, vkn: p.vkn || '', cat: p.cat || 'Diğer', catSet: !!p.cat_set, devir: n(p.devir), phone: p.phone || '', email: p.email || '', term: p.term_days == null ? null : Number(p.term_days) };
  st.rules = rules.map(r => ({ kw: r.kw, cat: r.cat, party: r.party || null, at: r.created_at }));
  for (const c of counts) (st.counts[c.pkey] = st.counts[c.pkey] || []).push({ id: c.id, d: c.d, q: n(c.q) });
  st.planned = planned.map(p => ({ id: p.id, kind: p.kind, due: p.due, amount: n(p.amount), party: p.party, invoice_no: p.invoice_no, descr: p.descr || '', status: p.status, recurrence: p.recurrence, src: p.src }));
  const sv = meta.find(m => m.k === 'seedVer'); st.seedVer = sv ? Number(sv.v) : 0;
  const pv = meta.find(m => m.k === 'private'); st.priv = pv && pv.v ? pv.v : null;
  st.meta = {}; for (const m of meta) if (m.k !== 'seedVer' && m.k !== 'private') st.meta[m.k] = m.v;
  return st;
}

function ensureParty(key, name, vkn) {
  let p = S.parties[key];
  if (!p) { p = S.parties[key] = { key, name: name || key, vkn: vkn || '', cat: guessCat(name || key), devir: 0 }; mark('par', key); }
  return p;
}
function reindex() {
  IDX.inv.clear(); IDX.invNo.clear(); IDX.tx.clear(); IDX.partyHasInv.clear();
  for (const i of S.invoices) { IDX.inv.set(i.ettn.toLowerCase(), i); IDX.invNo.add(i.no + '|' + i.vkn); IDX.partyHasInv.add(i.vkn); }
  for (const t of S.tx) IDX.tx.add(t.k);
  const lbv = new Map(); for (const l of S.lines) { if (!lbv.has(l.vkn)) lbv.set(l.vkn, []); lbv.get(l.vkn).push(l); }
  for (const p of Object.values(S.parties)) if (!p.catSet) p.cat = guessCatFull(p, lbv);
  // tedarikçi adı -> anahtar kelime (banka açıklamasında aramak için)
  IDX.tokens.clear();
  const STOP = new Set('GIDA SAN SANAYI TIC TICARET LTD STI SIRKETI SIRKET ANONIM LIMITED VE ITH IHR ITHALAT IHRACAT PAZARLAMA PAZ DAG DAGITIM URUNLERI URUN INSAAT TURIZM MARKET MAGAZACILIK HIZMETLERI HIZMET ISTANBUL YAPI KREDI BANKASI BANKA TEKNOLOJI ENDUSTRIYEL GENEL TOPTAN PERAKENDE SATIS MALZ MALZEMELERI ELEKTRIK KAHVE GROUP GRUP DANISMANLIK'.split(' ').concat(PRIV_STOP));
  // kişi (TCKN): adının ve soyadının tüm kelimeleri geçmeli; firma: ilk ayırt edici kelime,
  // aynı kelimeyle başlayan birden fazla firma varsa ilk iki kelime (ör. YILDIZ TAVUKCULUK / YILDIZ ISTANBUL)
  const cand = [];
  for (const p of Object.values(S.parties)) {
    if (!p.vkn) continue;
    const w = norm(p.name).split(' ').filter(x => x.length >= 4 && !STOP.has(x));
    if (!w.length) continue;
    if (p.vkn.length === 11) cand.push({ p, t1: '@' + norm(p.name).split(' ').filter(x => x.length >= 2).join(' ') });
    else { const raw = norm(p.name).split(' ').filter(x => x.length >= 2); cand.push({ p, t1: w[0], t2: raw[0] === w[0] && raw.length > 1 ? raw[0] + ' ' + raw[1] : (w.length > 1 ? w[0] + ' ' + w[1] : null) }); }
  }
  const c1 = new Map(); for (const c of cand) c1.set(c.t1, (c1.get(c.t1) || 0) + 1);
  const c2 = new Map(); for (const c of cand) if (c1.get(c.t1) > 1 && c.t2) c2.set(c.t2, (c2.get(c.t2) || 0) + 1);
  for (const c of cand) {
    if (c1.get(c.t1) === 1) IDX.tokens.set(c.t1, c.p.key);
    else if (c.t2 && c2.get(c.t2) === 1) IDX.tokens.set(c.t2, c.p.key);
  }
}

function addInvoice(inv) {
  const k = inv.ettn.toLowerCase();
  if (IDX.inv.has(k) || IDX.invNo.has(inv.no + '|' + inv.vkn)) return false;
  S.invoices.push(inv); IDX.inv.set(k, inv); mark('inv', inv.ettn); IDX.invNo.add(inv.no + '|' + inv.vkn); IDX.partyHasInv.add(inv.vkn);
  ensureParty(inv.vkn, inv.name, inv.vkn);
  return true;
}
function addStatementRows(rows, file) {
  const occ = new Map(); let added = 0, dup = 0;
  for (const r of rows) {
    const desc = String(r.desc || '').replace(/\s+/g, ' ').trim();
    const base = r.acc + '|' + r.date + '|' + desc + '|' + Number(r.amt).toFixed(2);
    const n = (occ.get(base) || 0) + 1; occ.set(base, n);
    const k = base + '#' + n;
    if (IDX.tx.has(k)) { dup++; continue; }
    S.tx.push({ k, src: r.src, acc: r.acc, date: r.date, desc, sector: r.sector || '', amt: r2(Number(r.amt)), file, cat: '', party: null, man: false, eff: null });
    IDX.tx.add(k); mark('tx', k); added++;
  }
  return { added, dup };
}

// ---------- sınıflandırma ----------
// İşletmeye özel eşleştirme bilgileri (tedarikçi VKN/TCKN'leri, kişi adları, şirket/ortak adı) koda YAZILMAZ:
// bilgisayarda data/private.js'te, bulutta tt_meta 'private' kaydında (girişle korunur) durur.
let BUILTIN = [], OWN_RE = /(?!)/, PARTNER_RE = /(?!)/, CAT_HINTS = [], PRIV_STOP = [];
function applyPriv(p) {
  p = p || {};
  BUILTIN = Array.isArray(p.builtin) ? p.builtin : [];
  try { OWN_RE = p.ownCo ? new RegExp(p.ownCo) : /(?!)/; } catch { OWN_RE = /(?!)/; }
  try { PARTNER_RE = p.partner ? new RegExp(p.partner) : /(?!)/; } catch { PARTNER_RE = /(?!)/; }
  CAT_HINTS = (p.catHints || []).map(h => { try { return [new RegExp(h[0]), h[1]]; } catch { return null; } }).filter(Boolean);
  PRIV_STOP = String(p.stop || '').split(/\s+/).filter(Boolean);
}
// bilgisayardaki dosya ile buluttaki kopyadan yenisi
function currentPriv() { const a = window.TT_PRIVATE, b = S && S.priv; if (a && (!b || (a.v || 0) > (b.v || 0))) return a; return b || a || null; }
function partyMatch(n, t) {
  const sp = ' ' + n + ' ';
  for (const b of BUILTIN) if (sp.includes(' ' + b[0])) return (b[2] && b[3] && t.date >= b[2]) ? b[3] : b[1];
  const words = new Set(n.split(' '));
  for (const [tok, key] of IDX.tokens) {
    if (tok[0] === '@') { const ws = tok.slice(1).split(' '); if (ws.length >= 2 && ws.every(w => words.has(w))) return key; }
    else if (sp.includes(' ' + tok)) return key;
  }
  return null;
}
function partyKeyLive(key) {
  if (!key) return null;
  if (key.startsWith('X:')) { ensureParty(key, key.slice(2), ''); return key; }
  if (S.parties[key]) return key;
  return null;
}
function classifyTx(t, ctx) {
  if (t.man) return;
  t.eff = null; t.party = null;
  const n = norm(t.desc);
  const set = (c, p) => { t.cat = c; t.party = p || null; };
  for (const r of S.rules) if (n.includes(r.kw)) { if (r.party) ensureParty(r.party, r.party.startsWith('X:') ? r.party.slice(2) : r.party, ''); return set(r.cat, r.party); }
  if (t.src === 'manual') return;
  if (t.src === 'card') {
    if (/^ODEME\b/.test(n) || n.includes('ODEME SUBE KODU') || n.includes('TESEKKUR EDERIZ')) return set('Kart borç ödemesi');
    if (n.includes('KART UCRETI') || n.includes('KART AIDATI')) return set('Banka & POS masrafı');
    if (/KREDI FAIZI|BSMV FAIZ|GECIKME FAIZI/.test(n)) return set('Kredi / faiz');
    if (t.date < '2026-01-01') return set('Önceki yıl (kapsam dışı)');
    if (t.amt > 0) {
      if (/ODEME|TAHSILAT/.test(n)) return set('Kart borç ödemesi');
      const rp = partyKeyLive(partyMatch(n, t)); // iade
      return rp ? set('Tedarikçi ödemesi', rp) : set('Diğer gelir');
    }
    if (/\bGIB\b|VERGI ODEME|TICARET ODA/.test(n)) return set(taxCat(n));
    if (/TRENDYOL|HEPSIPAY|HEPSIBURADA/.test(n)) return set('Pazaryeri ödemesi'); // faturayı satıcı keser; o fatura zaten gider
    const m = t.desc.match(/([\d.]+(?:,\d+)?) TL'lik işlemin (\d+)\/(\d+) taksidi/i) || t.desc.match(/\(([\d.,]+) TL İşlemin (\d+)\/(\d+) Taksidi\)/i);
    if (m) {
      const raw = m[1]; const total = raw.includes(',') ? parseFloat(raw.replace(/\./g, '').replace(',', '.')) : parseFloat(raw);
      const key = t.acc + '|' + t.date + '|' + total;
      if (ctx.inst.has(key)) return set('Taksit (toplamı sayıldı)');
      ctx.inst.add(key); t.eff = -total;
    }
    const p = partyKeyLive(partyMatch(n, t));
    return p ? set('Tedarikçi ödemesi', p) : set('Faturasız gider');
  }
  // banka
  const posFee = /UYE ISYERI UCRETI|POS YAZILIM|POSYAZ|POS KOMISYON|POS BAKIM/.test(n);
  if (!posFee && t.amt > 0 && (n.includes('PESINSATIS') || n.includes('PESIN SATIS') || /^ISYERI NO/.test(n) || /^PK\d+ /.test(n))) return set('POS tahsilatı');
  if (posFee) return set('Banka & POS masrafı');
  // sadece banka ücretleri (avukatlık/ilaçlama "ücreti" gibi hizmet ödemeleri değil)
  if (/(HAVALE|EFT|FAST|MESAJ|TRANSFERI|ISLETIM|KART) UCRETI|^BSMV|BSMV TAHSILATI|BSMV TUTARI|KOMISYON TUTARI|KOMISYONU TAHSILATI|HESAP ISLETIM|^KESINTI VE EKLERI|BANKA MASRAF/.test(n)) return set('Banka & POS masrafı');
  if (/OTOMATIK ODEME|KREDI KARTI ODEME|K KARTI ODEME|KK ODEME|KK TAHSILAT/.test(n)) return set('Kart borç ödemesi');
  if (n.includes('PORTY')) return set('Diğer gelir');
  if (n.includes('IPTAL')) return set('Sınıflanmamış');
  if (PARTNER_RE.test(n)) return set('Ortak / şahsi');
  if (/\bMAAS\b|PERSONEL (UCRET|AVANS)|UCRET ODEME|AVANS|ICRA KESINTI|HACIZ/.test(n) && !/KIYAFET|UNIFORMA/.test(n)) return set('Personel / maaş');
  if (/\bSGK\b|SOSYAL GUVENLIK/.test(n)) return set('SGK primi');
  if (/^VERGI|VERGI DAIRESI|\bGIB\b|MUHTASAR|STOPAJ|BELEDIYE|HARC|ISTINAF|IHTARNAME|NOTER/.test(n)) return set(taxCat(n));
  if (/KREDI TAKSIT|KREDI ODEME|FAIZ/.test(n)) return set('Kredi / faiz');
  if (/DEPO (KIRA|AIDAT)|AIDAT ODEMESI|APARTMAN YONETIMI/.test(n)) return set('Kira & Otopark');
  // kasa takibi başladıysa bankaya yatırılan nakit, kasada zaten satış olarak girildiği için gelir değil virmandır
  if (/^PARA YATIRMA/.test(n) && t.amt > 0) return set(KASA_START && t.date >= KASA_START ? 'Virman (kendi hesap)' : 'Nakit yatırma');
  const p = partyKeyLive(partyMatch(n, t));
  if (p) return set('Tedarikçi ödemesi', p);
  // kendi hesaplar arası: gönderen/alıcı şirketin kendisi (açıklamada şirketin kısa adının geçmesi yetmez; tam unvan aranır)
  if (OWN_RE.test(n) || /GARANTIDEN GONDERILEN|FINANSAL GONDERIM|FINANSAL BORC/.test(n)) return set('Virman (kendi hesap)');
  return set(t.amt > 0 ? 'Diğer gelir' : 'Sınıflanmamış');
}
// vergi ödemesinin türü (GİB vergi kodu / açıklamaya göre)
function taxCat(n) {
  if (/KDV|KATMA DEGER|GERCEK USULDE K|VERGI 0015|VERGI 4017/.test(n)) return 'KDV ödemesi';
  if (/GELIR VERGISI|STOPAJ|MUHTASAR|VERGI 0003|VERGI 0011/.test(n)) return 'Stopaj / gelir vergisi';
  if (/KURUM|VERGI 0010|VERGI 0033|GECICI/.test(n)) return 'Kurumlar / geçici vergi';
  return 'Vergi / harç';
}
const KASA_ACC = 'Kasa';
const accCfg = () => { const a = (S && S.meta && S.meta.accounts) || {}; return { banks: a.banks || {}, kasa: a.kasa || { start: null, open: 0 } }; };
let KASA_START = null;
function reclassifyAll() {
  applyPriv(currentPriv());
  KASA_START = accCfg().kasa.start || null;
  reindex();
  const ctx = { inst: new Set() };
  for (const t of S.tx) {
    if (t.man && t.eff != null) { const m = t.desc.match(/([\d.]+(?:,\d+)?) TL'lik işlemin/); if (m) ctx.inst.add(t.acc + '|' + t.date + '|' + parseFloat(m[1].replace(/\./g, '').replace(',', '.'))); }
  }
  for (const t of S.tx) classifyTx(t, ctx);
}
const txAmt = t => (t.eff != null ? t.eff : t.amt);
// Ziraat POS satırı: "... Komisyon : 2,92 ..." → bankaya net yatar, komisyon açıklamada
function posComm(t) { const m = t.desc.match(/(?:Komisyon\s*:|\bK:)\s*([\d.]+(?:,\d+)?)/i); return m ? parseFloat(m[1].replace(/\./g, '').replace(',', '.')) || 0 : 0; }

// ---------- başlangıç ----------
// başlangıç verisini mevcut veriye ekler (mükerrerleri atlar)
function mergeSeed() {
  const SD = window.SEED || { v: 0, invoices: [], lines: [], stmts: [] };
  reindex();
  const newEttn = new Set(); let ni = 0;
  for (const r of SD.invoices) if (addInvoice({ ettn: r[0], no: r[1], date: r[2], vkn: r[3], name: r[4], type: r[5], net: r[6], vat: r[7], total: r[8], pay: r[9], due: r[10] || '', src: r[11] })) { newEttn.add(r[0]); ni++; }
  const lc = new Map();
  for (const r of SD.lines) if (newEttn.has(r[0])) { const i = (lc.get(r[0]) || 0) + 1; lc.set(r[0], i); const id = r[0] + '#' + i; S.lines.push({ id, ettn: r[0], date: r[1], vkn: r[2], name: prodName(r[3], r[4]), code: r[5], qty: r[6], unit: UNIT[r[7]] || r[7], net: r[9], rate: r[10], vat: r[11] }); mark('lines', id); }
  const byFile = new Map();
  for (const r of SD.stmts) { if (!byFile.has(r[6])) byFile.set(r[6], []); byFile.get(r[6]).push({ src: r[0], acc: r[1], date: r[2], desc: r[3], sector: r[4], amt: r[5] }); }
  let nt = 0; for (const [f, rows] of byFile) nt += addStatementRows(rows, f).added;
  S.seedVer = SD.v || 0;
  S.log.push(dTR(new Date().toISOString().slice(0, 10)) + ` Başlangıç verisi (sürüm ${S.seedVer}): ${ni} fatura, ${nt} banka/kart hareketi eklendi.`);
  reclassifyAll();
}
function fromSeed() { S = newState(); mergeSeed(); }
const seedNewer = () => (S.seedVer || 1) < ((window.SEED && window.SEED.v) || 0);
function setLoading(msg) { $('#view').innerHTML = `<div class="card" style="text-align:center;padding:40px">${esc(msg)}</div>`; }
async function loadLocal() {
  try {
    const raw = await DB.get('state'); if (!raw) return false;
    S = JSON.parse(raw); S.planned = S.planned || []; S.meta = S.meta || {}; ensureLineIds(); ensureCountIds();
    const p = await DB.get('pending'); if (p) pendFromJSON(JSON.parse(p));
    return true;
  } catch (e) { console.error(e); return false; }
}
// çevrimdışıyken yapılmış, buluta gitmemiş değişiklikleri buluttan gelen veriye ekle
function carryPending(old, st) {
  const byK = (arr, f) => new Map(arr.map(x => [f(x), x]));
  const inv = byK(old.invoices, i => i.ettn), stInv = new Set(st.invoices.map(i => i.ettn));
  for (const id of PEND.inv) if (inv.has(id) && !stInv.has(id)) st.invoices.push(inv.get(id));
  const ln = byK(old.lines, l => l.id), stLn = new Set(st.lines.map(l => l.id));
  for (const id of PEND.lines) if (ln.has(id) && !stLn.has(id)) st.lines.push(ln.get(id));
  const tx = byK(old.tx, t => t.k), stTx = byK(st.tx, t => t.k);
  for (const id of PEND.tx) if (tx.has(id)) { const t = tx.get(id); if (stTx.has(id)) Object.assign(stTx.get(id), t); else st.tx.push(t); }
  for (const id of PEND.par) if (old.parties[id]) st.parties[id] = old.parties[id];
  for (const id of PEND.rules) { const r = old.rules.find(x => x.kw === id); st.rules = st.rules.filter(x => x.kw !== id); if (r) st.rules.unshift(r); }
  for (const k in old.counts) for (const c of old.counts[k]) if (PEND.counts.has(c.id)) (st.counts[k] = st.counts[k] || []).push(c);
  for (const id of PEND.countsDel) for (const k in st.counts) st.counts[k] = st.counts[k].filter(c => c.id !== id);
  for (const id of PEND.plan) { const p = (old.planned || []).find(x => x.id === id); if (!p) continue; st.planned = (st.planned || []).filter(x => x.id !== id); st.planned.push(p); }
  for (const k of PEND.meta) if (old.meta && k in old.meta) { st.meta = st.meta || {}; st.meta[k] = old.meta[k]; }
  if (PEND.txDel.size) st.tx = st.tx.filter(t => !PEND.txDel.has(t.k));
}
async function flushAll() { let guard = 0; while (pendCount() && guard++ < 50) { await flushCloud(); if (!CLOUD.online) throw new Error(CLOUD.err || 'gönderilemedi'); } }
async function startCloud(hasLocal, quiet) {
  if (!quiet) setLoading('Buluta bağlanılıyor…');
  CLOUD.role = await CLOUD.req('POST', 'rpc/my_role', {});
  if (!CLOUD.role) throw new Error('Bu kullanıcının TAMER TAKİP yetkisi yok');
  CLOUD.online = true; syncBadge(); renderTabs();
  const any = await CLOUD.req('GET', 'tt_invoices?select=ettn&limit=1');
  if (!any.length) {
    // bulut boş → bu bilgisayardaki (yoksa başlangıç) verisi ilk kez buluta aktarılır
    if (!S) fromSeed(); else if (seedNewer()) mergeSeed();
    ensureLineIds(); ensureCountIds(); markAll(); reclassifyAll();
    setLoading(`İlk kez buluta aktarılıyor: ${S.invoices.length} fatura, ${S.lines.length} satır, ${S.tx.length} hareket… (1–3 dakika)`);
    await flushAll();
    S.log.push(dTR(new Date().toISOString().slice(0, 10)) + ' Veriler buluta aktarıldı.');
  } else {
    if (!quiet) setLoading('Buluttan veriler yükleniyor…');
    const st = await loadFromCloud();
    if (hasLocal && S && pendCount()) carryPending(S, st);
    st.log = (S && S.log) || [];
    S = st;
    if (seedNewer()) mergeSeed(); else reclassifyAll();
  }
  // işletmeye özel eşleştirme ayarları: bu bilgisayardaki dosya buluttakinden yeniyse buluta yükle
  // (telefon/web sürümü bu ayarları buradan alır; GitHub'a hiç gitmez)
  const lp = window.TT_PRIVATE;
  if (lp && (!S.priv || (lp.v || 0) > (S.priv.v || 0)) && CLOUD.role !== 'viewer') {
    try { await CLOUD.req('POST', 'tt_meta?on_conflict=k', [{ k: 'private', v: lp }], 'resolution=merge-duplicates,return=minimal'); S.priv = lp; }
    catch (e) { console.warn('gizli ayarlar yüklenemedi', e); }
    reclassifyAll();
  }
  DB.put('state', JSON.stringify(S)).catch(() => { });
  flushCloud();
}
function showLogin(first) {
  openModal(`<h3>TAMER TAKİP – Giriş</h3>
  <div class="mut" style="margin-bottom:12px">Veriler bulutta (Supabase) saklanır; her bilgisayardan ve telefondan aynı verilere ulaşırsınız. MATTERS / FINANS kullanıcı adınız ve şifrenizle girin.</div>
  <div class="tools" style="flex-direction:column;align-items:stretch;max-width:340px">
    <input type="text" id="lu" placeholder="Kullanıcı adı (ör. admin)" autocomplete="username" style="padding:8px">
    <input type="password" id="lp" placeholder="Şifre" autocomplete="current-password" style="padding:8px">
    <button class="btn" id="lb">Giriş yap</button>
    <div id="le" class="neg"></div>
    ${first ? '<a href="javascript:void 0" onclick="closeModal()" class="mut" style="margin-top:6px">Şimdilik çevrimdışı devam et (veriler sadece bu bilgisayarda)</a>' : ''}
  </div>`);
  const go2 = async () => {
    $('#le').textContent = ''; $('#lb').disabled = true; $('#lb').textContent = 'Giriş yapılıyor…';
    try { await CLOUD.login($('#lu').value, $('#lp').value); closeModal(); await startCloud(true); initYears(); go(CUR); toast('Giriş yapıldı'); }
    catch (e) { CLOUD.logout(); $('#le').textContent = /invalid/i.test(e.message) ? 'Kullanıcı adı veya şifre hatalı' : e.message; $('#lb').disabled = false; $('#lb').textContent = 'Giriş yap'; if (S) { initYears(); go(CUR); } }
    syncBadge();
  };
  $('#lb').onclick = go2; $('#lp').onkeydown = e => { if (e.key === 'Enter') go2(); }; setTimeout(() => $('#lu') && $('#lu').focus(), 50);
}
function doLogout() {
  if (pendCount() && !confirm(pendCount() + ' değişiklik henüz buluta gönderilemedi. Yine de çıkılsın mı? (Bu bilgisayarda saklı kalır.)')) return;
  CLOUD.logout(); syncBadge(); showLogin(true);
}
async function boot() {
  CLOUD.loadSess();
  const hasLocal = await loadLocal();
  if (CLOUD.sess && hasLocal && S && S.invoices.length) {
    // önce bu bilgisayardaki son kopyayı hemen göster, bulutu arka planda yenile
    reclassifyAll(); syncBadge(); initYears(); renderTabs(); go(location.hash.slice(1) || 'ozet');
    const el = $('#sync'); if (el) el.innerHTML = '⟳ Buluttan güncelleniyor…';
    try {
      await startCloud(true, true);
      initYears(); if (!$('#modal').classList.contains('hidden') || document.activeElement && /INPUT|SELECT/.test(document.activeElement.tagName)) { /* kullanıcı bir şey yazıyor, ekranı bozma */ } else go(CUR);
    } catch (e) { console.error(e); CLOUD.online = false; CLOUD.err = e.message; if (/Oturum|refresh|JWT|invalid/i.test(e.message)) { CLOUD.logout(); showLogin(true); } }
    syncBadge(); remindDue(); return;
  }
  if (CLOUD.sess) {
    try { await startCloud(hasLocal); }
    catch (e) {
      console.error(e); CLOUD.online = false; CLOUD.err = e.message;
      if (/Oturum|refresh|JWT|invalid/i.test(e.message)) { CLOUD.logout(); }
      if (!S) fromSeed(); else reclassifyAll();
      toast('Buluta bağlanılamadı, bu bilgisayardaki verilerle çalışılıyor: ' + e.message, true);
    }
  } else {
    if (!S) fromSeed(); else if (seedNewer()) mergeSeed(); else reclassifyAll();
  }
  syncBadge(); initYears(); renderTabs(); go(location.hash.slice(1) || 'ozet');
  if (!CLOUD.sess) showLogin(true); else remindDue();
}

// ---------- genel UI ----------
const TABS = [['ozet', 'Özet'], ['faturalar', 'Tedarikçi Faturaları'], ['urunler', 'Kimden Ne Aldım'], ['cari', 'Cari'], ['vadeler', 'Vadeler'], ['kasa', 'Kasa & Nakit'], ['banka', 'Banka & Kart'], ['gelirgider', 'Gelir – Gider'], ['stok', 'Stok'], ['yukle', 'Yükle / Yedek'], ['kullanicilar', 'Kullanıcılar']];
let CUR = 'ozet';
function renderTabs() { $('#tabs').innerHTML = TABS.filter(([k]) => k !== 'kullanicilar' || (CLOUD.sess && CLOUD.role === 'admin')).map(([k, l]) => `<button data-k="${k}" class="${k === CUR ? 'on' : ''}">${l}</button>`).join(''); $('#tabs').querySelectorAll('button').forEach(b => b.onclick = () => go(b.dataset.k)); }
function go(k) { if (!VIEWS[k]) k = 'ozet'; CUR = k; location.hash = k; renderTabs(); closeModal(); try { VIEWS[k](); } catch (e) { console.error(e); $('#view').innerHTML = `<div class="card neg">Hata: ${esc(e.message)}</div>`; } }
function initYears() {
  const ys = new Set(); S.invoices.forEach(i => ys.add(i.date.slice(0, 4))); S.tx.forEach(t => { if (t.date >= '2000') ys.add(t.date.slice(0, 4)); });
  const arr = [...ys].sort(); const sel = $('#year'); const prev = sel.value;
  sel.innerHTML = arr.map(y => `<option>${y}</option>`).join('');
  sel.value = arr.includes(prev) ? prev : (arr[arr.length - 1] || String(new Date().getFullYear()));
  sel.onchange = () => go(CUR); $('#kdv').onchange = () => go(CUR);
}
const YEAR = () => $('#year').value;
const KDV = () => $('#kdv').checked;
const invAmt = i => KDV() ? i.total : i.net;
const pName = key => (S.parties[key] && S.parties[key].name) || key;
function monthsWithData(list, dateF) { const s = new Set(); for (const x of list) s.add(mIdx(dateF(x))); return [...s].sort((a, b) => a - b); }

// ---------- ÖZET ----------
let chart;
function vOzet() {
  const y = YEAR(); const gg = computeGG(y);
  const gel = sum(ggTot(gg.gelir)), gid = sum(ggTot(gg.gider)), yat = sum(ggTot(gg.yatirim)), ver = sum(ggTot(gg.vergi));
  const cari = computeCari(); const borc = sum(cari.filter(c => c.bal > 0.5), c => c.bal);
  const invY = S.invoices.filter(i => i.date.startsWith(y));
  const top = groupBy(invY, i => i.vkn).map(([k, a]) => ({ k, t: sum(a, invAmt), n: a.length })).sort((a, b) => b.t - a.t).slice(0, 12);
  const warns = buildWarnings(y);
  $('#view').innerHTML = `
  <div class="kpis">
    <div class="kpi"><div class="l">Gelir (${y}, ${KDV() ? 'KDV dahil' : 'KDV hariç'})</div><div class="v pos">${fmt0(gel)} ₺</div></div>
    <div class="kpi"><div class="l">İşletme gideri</div><div class="v neg">${fmt0(gid)} ₺</div></div>
    <div class="kpi"><div class="l">Faaliyet sonucu</div><div class="v ${gel - gid >= 0 ? 'pos' : 'neg'}">${fmt0(gel - gid)} ₺</div></div>
    <div class="kpi"><div class="l">Yatırım + kurumlar vergisi</div><div class="v">${fmt0(yat + ver)} ₺</div></div>
    <div class="kpi"><div class="l">Net nakit sonucu</div><div class="v ${gel - gid - yat - ver >= 0 ? 'pos' : 'neg'}">${fmt0(gel - gid - yat - ver)} ₺</div></div>
    <div class="kpi"><div class="l">Tedarikçilere açık borç (cari)</div><div class="v">${fmt0(borc)} ₺</div></div>
    <div class="kpi"><div class="l">Fatura / tedarikçi (${y})</div><div class="v">${invY.length} / ${new Set(invY.map(i => i.vkn)).size}</div></div>
  </div>
  ${warns.length ? `<div class="card"><h2>Dikkat</h2>${warns.map(w => `<div class="warn">${w}</div>`).join('')}</div>` : ''}
  <div class="grid2">
    <div class="card"><h2>Aylık gelir – gider</h2><canvas id="ch" height="260"></canvas></div>
    <div class="card"><h2>En çok alım yapılan tedarikçiler (${y})</h2><div class="tw" style="max-height:360px"><table>
      <tr><th>Tedarikçi</th><th class="n">Fatura</th><th class="n">Tutar</th></tr>
      ${top.map(t => `<tr class="click" onclick="supDetail('${esc(t.k)}')"><td>${esc(pName(t.k))}</td><td class="n">${t.n}</td><td class="n">${fmt(t.t)}</td></tr>`).join('')}
    </table></div></div>
  </div>`;
  const gm = ggTot(gg.gelir), xm = ggTot(gg.gider), ym = ggTot(gg.yatirim).map((v, i) => v + ggTot(gg.vergi)[i]);
  if (chart) chart.destroy();
  if (window.Chart) chart = new Chart($('#ch'), { type: 'bar', data: { labels: AY.map(a => a.slice(0, 3)), datasets: [{ label: 'Gelir', data: gm, backgroundColor: '#2e8b57', stack: 'gel' }, { label: 'İşletme gideri', data: xm, backgroundColor: '#c0504d', stack: 'g' }, { label: 'Yatırım + kurumlar v.', data: ym, backgroundColor: '#e0a458', stack: 'g' }] }, options: { plugins: { tooltip: { callbacks: { label: c => c.dataset.label + ': ' + fmt(c.raw) + ' ₺' } } }, scales: { x: { stacked: true }, y: { stacked: true, ticks: { callback: v => fmt0(v) } } } } });
}
function groupBy(arr, f) { const m = new Map(); for (const x of arr) { const k = f(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); } return [...m]; }
function buildWarnings(y) {
  const w = [];
  const dd = dueSummary();
  if (dd.over.length || dd.soon.length) w.push(`<b>Vade:</b> ${dd.over.length} ödemenin vadesi geçmiş (${fmt(sum(dd.over, p => p.amount))} ₺), ${dd.soon.length} ödeme 3 gün içinde (${fmt(sum(dd.soon, p => p.amount))} ₺). <a href="#vadeler">Vadeler</a>`);
  const unc = S.tx.filter(t => t.date.startsWith(y) && t.cat === 'Sınıflanmamış');
  if (unc.length) w.push(`<b>${unc.length}</b> banka çıkışı sınıflanmamış (${fmt(-sum(unc, txAmt))} ₺). <a href="#banka" onclick="BF.cat='Sınıflanmamış'">Banka & Kart</a> sekmesinden kategorisini seçin.`);
  const noInv = Object.values(S.parties).filter(p => !IDX.partyHasInv.has(p.key)).map(p => ({ p, a: -sum(S.tx.filter(t => t.party === p.key && t.cat === 'Tedarikçi ödemesi' && t.date.startsWith(y)), txAmt) })).filter(x => x.a > 0);
  if (noInv.length) w.push(`E-faturası olmayan ödemeler: ${noInv.map(x => `${esc(x.p.name)} (${fmt0(x.a)} ₺)`).join(', ')}. Fatura isteyin / muhasebeye iletin.`);
  const sus = groupBy(S.invoices.filter(i => i.date.startsWith(y)), i => i.vkn + '|' + i.date + '|' + i.total).filter(([, a]) => a.length > 1).filter(([, a]) => { const l = a.map(i => S.lines.filter(x => x.ettn === i.ettn).map(x => x.name + x.qty).sort().join(';')); return l.every(s => s === l[0]); });
  if (sus.length) w.push('Şüpheli mükerrer fatura (aynı gün, aynı tedarikçi, aynı tutar ve ürünler): ' + sus.map(([, a]) => esc(pName(a[0].vkn)) + ' ' + a.map(i => i.no).join(' / ') + ' ' + fmt(a[0].total) + ' ₺').join('; '));
  const pdf = S.invoices.filter(i => i.src === 'PDF');
  if (pdf.length) w.push(`${pdf.length} fatura sadece PDF olarak geldi ve elle girildi (ürün satırları PDF'ten okundu).`);
  return w;
}

// ---------- TEDARİKÇİ FATURALARI ----------
let FF = { q: '' };
function vFaturalar() {
  const y = YEAR(); const invY = S.invoices.filter(i => i.date.startsWith(y));
  const months = monthsWithData(invY, i => i.date);
  const rows = groupBy(invY, i => i.vkn).map(([k, a]) => { const m = Array(12).fill(0); a.forEach(i => m[mIdx(i.date)] += invAmt(i)); return { k, name: pName(k), m, t: sum(m), n: a.length }; }).sort((a, b) => b.t - a.t);
  $('#view').innerHTML = `<div class="card"><div class="tools"><input type="search" id="q" placeholder="Tedarikçi ara…" value="${esc(FF.q)}"><span class="mut">Satıra tıklayın: ay ay faturalar ve ürünler. Tutarlar ${KDV() ? 'KDV dahil' : 'KDV hariç'}.</span><span style="flex:1"></span><button class="btn sec" onclick="exportPivot()">Excel'e aktar</button></div>
  <div class="tw"><table id="pv"></table></div></div>`;
  const draw = () => {
    const q = norm(FF.q); const rs = rows.filter(r => !q || norm(r.name).includes(q) || r.k.includes(q));
    const tm = Array(12).fill(0); rs.forEach(r => r.m.forEach((v, i) => tm[i] += v));
    $('#pv').innerHTML = `<tr><th>Tedarikçi</th><th class="n">Fatura</th>${months.map(m => `<th class="n">${AY[m]}</th>`).join('')}<th class="n">TOPLAM</th></tr>` +
      rs.map(r => `<tr class="click" onclick="supDetail('${esc(r.k)}')"><td>${esc(r.name)}</td><td class="n">${r.n}</td>${months.map(m => `<td class="n">${r.m[m] ? fmt(r.m[m]) : ''}</td>`).join('')}<td class="n"><b>${fmt(r.t)}</b></td></tr>`).join('') +
      `<tr class="tot"><td>TOPLAM (${rs.length} tedarikçi)</td><td class="n">${sum(rs, r => r.n)}</td>${months.map(m => `<td class="n">${fmt(tm[m])}</td>`).join('')}<td class="n">${fmt(sum(tm))}</td></tr>`;
  };
  $('#q').oninput = e => { FF.q = e.target.value; draw(); }; draw();
  window.exportPivot = () => { const q = norm(FF.q); const rs = rows.filter(r => !q || norm(r.name).includes(q)); xlsxDownload('Tedarikci_Ay_' + y, [['Tedarikçi', 'VKN', 'Fatura', ...months.map(m => AY[m]), 'Toplam'], ...rs.map(r => [r.name, r.k, r.n, ...months.map(m => r2(r.m[m])), r2(r.t)])]); };
}
function supDetail(vkn) {
  const y = YEAR(); const p = S.parties[vkn] || { name: vkn };
  const inv = S.invoices.filter(i => i.vkn === vkn && i.date.startsWith(y)).sort((a, b) => a.date.localeCompare(b.date));
  const byM = groupBy(inv, i => mIdx(i.date));
  const prods = aggProducts(S.lines.filter(l => l.vkn === vkn && l.date.startsWith(y)));
  openModal(`<h3>${esc(p.name)}</h3><div class="mut" style="margin-bottom:10px">VKN/TCKN: ${esc(vkn)} · Kategori: ${esc(p.cat || '')} · ${y}</div>${contactLine(S.parties[vkn])}
  <div class="tw" style="max-height:340px"><table><tr><th>Ay</th><th>Fatura No</th><th>Tarih</th><th class="n">Matrah</th><th class="n">KDV</th><th class="n">Toplam</th></tr>
  ${byM.map(([m, a]) => a.map(i => `<tr><td>${AY[m]}</td><td>${esc(i.no)}${i.src === 'PDF' ? ' <span class="tag w">PDF</span>' : ''}${i.type === 'IADE' ? ' <span class="tag w">İADE</span>' : ''}</td><td>${dTR(i.date)}</td><td class="n">${fmt(i.net)}</td><td class="n">${fmt(i.vat)}</td><td class="n">${fmt(i.total)}</td></tr>`).join('') +
    `<tr class="sub"><td>${AY[m]} toplamı</td><td>${a.length} fatura</td><td></td><td class="n">${fmt(sum(a, i => i.net))}</td><td class="n">${fmt(sum(a, i => i.vat))}</td><td class="n">${fmt(sum(a, i => i.total))}</td></tr>`).join('')}
  <tr class="tot"><td>${y} TOPLAM</td><td>${inv.length} fatura</td><td></td><td class="n">${fmt(sum(inv, i => i.net))}</td><td class="n">${fmt(sum(inv, i => i.vat))}</td><td class="n">${fmt(sum(inv, i => i.total))}</td></tr></table></div>
  <h3 style="margin-top:16px">Bu tedarikçiden alınan ürünler</h3>${prodTable(prods, false)}`);
}

// ---------- ÜRÜNLER ----------
function aggProducts(lines) {
  const m = new Map();
  for (const l of [...lines].sort((a, b) => a.date.localeCompare(b.date))) {
    const k = l.vkn + '|' + up(l.name) + '|' + l.unit;
    let p = m.get(k); if (!p) m.set(k, p = { k, vkn: l.vkn, name: l.name, code: l.code, unit: l.unit, n: 0, q: 0, t: 0, min: null, max: null, last: null, lastD: '', first: l.date });
    p.n++; p.q += l.qty; p.t += l.net;
    const u = l.qty ? l.net / l.qty : null;
    if (u != null && u > 0) { if (p.min == null || u < p.min) p.min = u; if (p.max == null || u > p.max) p.max = u; p.last = u; p.lastD = l.date; }
  }
  return [...m.values()].sort((a, b) => b.t - a.t);
}
function prodTable(ps, withSup, limit) {
  const L = limit || 100000;
  return `<div class="tw" style="max-height:${withSup ? 'calc(100vh - 260px)' : '360px'}"><table><tr>${withSup ? '<th>Tedarikçi</th>' : ''}<th>Ürün</th><th>Birim</th><th class="n">Alım</th><th class="n">Toplam miktar</th><th class="n">Toplam tutar (KDV hariç)</th><th class="n">Ort. fiyat</th><th class="n">En düşük</th><th class="n">En yüksek</th><th class="n">Son fiyat</th><th>Son alım</th></tr>
  ${ps.slice(0, L).map(p => `<tr class="click" onclick="prodHist('${esc(p.k)}')">${withSup ? `<td>${esc(pName(p.vkn))}</td>` : ''}<td>${esc(p.name)}</td><td>${esc(p.unit)}</td><td class="n">${p.n}</td><td class="n">${fmtQ(p.q)}</td><td class="n">${fmt(p.t)}</td><td class="n">${p.q ? fmt(p.t / p.q) : ''}</td><td class="n">${fmt(p.min)}</td><td class="n">${fmt(p.max)}</td><td class="n">${fmt(p.last)}${p.last && p.min && p.last > p.min * 1.15 ? ' <span class="tag w">↑</span>' : ''}</td><td>${dTR(p.lastD)}</td></tr>`).join('')}
  </table></div>${ps.length > L ? `<div class="mut more">İlk ${L} ürün gösteriliyor (${ps.length}). Aramayı daraltın.</div>` : ''}`;
}
function prodHist(k) {
  const [vkn, nameU, unit] = k.split('|');
  const ls = S.lines.filter(l => l.vkn === vkn && up(l.name) === nameU && l.unit === unit).sort((a, b) => a.date.localeCompare(b.date));
  openModal(`<h3>${esc(ls[0] ? ls[0].name : nameU)}</h3><div class="mut" style="margin-bottom:10px">${esc(pName(vkn))} · ${esc(unit)}</div>
  <div class="tw" style="max-height:60vh"><table><tr><th>Tarih</th><th>Fatura</th><th class="n">Miktar</th><th class="n">Birim fiyat (net)</th><th class="n">Tutar (KDV hariç)</th><th class="n">KDV %</th></tr>
  ${ls.map(l => { const i = IDX.inv.get(l.ettn.toLowerCase()); return `<tr><td>${dTR(l.date)}</td><td>${esc(i ? i.no : '')}</td><td class="n">${fmtQ(l.qty)}</td><td class="n">${l.qty ? fmt(l.net / l.qty) : ''}</td><td class="n">${fmt(l.net)}</td><td class="n">${fmt0(l.rate)}</td></tr>`; }).join('')}
  <tr class="tot"><td>Toplam</td><td>${ls.length} alım</td><td class="n">${fmtQ(sum(ls, l => l.qty))}</td><td></td><td class="n">${fmt(sum(ls, l => l.net))}</td><td></td></tr></table></div>`);
}
let UF = { q: '', sup: '' };
function vUrunler() {
  const y = YEAR(); const lines = S.lines.filter(l => l.date.startsWith(y));
  const sups = groupBy(lines, l => l.vkn).map(([k]) => k).sort((a, b) => pName(a).localeCompare(pName(b), TR));
  const all = aggProducts(lines);
  $('#view').innerHTML = `<div class="card"><div class="tools"><input type="search" id="q" placeholder="Ürün ara (ör. peynir, un, kahve)…" value="${esc(UF.q)}">
  <select id="sup"><option value="">Tüm tedarikçiler</option>${sups.map(s => `<option value="${esc(s)}" ${s === UF.sup ? 'selected' : ''}>${esc(pName(s))}</option>`).join('')}</select>
  <span class="mut" id="cnt"></span><span style="flex:1"></span><button class="btn sec" id="ex">Excel'e aktar</button></div><div id="pt"></div></div>`;
  const filt = () => { const q = norm(UF.q); return all.filter(p => (!UF.sup || p.vkn === UF.sup) && (!q || norm(p.name).includes(q) || norm(pName(p.vkn)).includes(q))); };
  const draw = () => { const ps = filt(); $('#cnt').textContent = ps.length + ' ürün · ' + fmt(sum(ps, p => p.t)) + ' ₺ (KDV hariç)'; $('#pt').innerHTML = prodTable(ps, true, 600); };
  $('#q').oninput = e => { UF.q = e.target.value; draw(); }; $('#sup').onchange = e => { UF.sup = e.target.value; draw(); };
  $('#ex').onclick = () => xlsxDownload('Urunler_' + y, [['Tedarikçi', 'Ürün', 'Birim', 'Alım', 'Toplam miktar', 'Toplam tutar', 'Ort. fiyat', 'En düşük', 'En yüksek', 'Son fiyat', 'Son alım'], ...filt().map(p => [pName(p.vkn), p.name, p.unit, p.n, p.q, r2(p.t), p.q ? r2(p.t / p.q) : '', p.min, p.max, p.last, dTR(p.lastD)])]);
  draw();
}

// ---------- CARİ ----------
function computeCari() {
  const res = [];
  for (const p of Object.values(S.parties)) {
    const inv = S.invoices.filter(i => i.vkn === p.key);
    const pay = S.tx.filter(t => t.party === p.key && t.cat === 'Tedarikçi ödemesi');
    if (!inv.length && !pay.length && !p.devir) continue;
    const f = sum(inv, i => i.pay), o = -sum(pay, txAmt);
    res.push({ p, f, o, bal: (p.devir || 0) + f - o, lastI: inv.reduce((m, i) => i.date > m ? i.date : m, ''), lastP: pay.reduce((m, t) => t.date > m ? t.date : m, ''), nI: inv.length, nP: pay.length });
  }
  return res;
}
let CF = { q: '', only: 'all', sort: 'bal' };
function vCari() {
  const rows = computeCari();
  $('#view').innerHTML = `<div class="card"><div class="tools"><input type="search" id="q" placeholder="Cari ara…" value="${esc(CF.q)}">
  <select id="only"><option value="all">Hepsi</option><option value="borc">Borcumuz olanlar</option><option value="eksi">Fazla ödenen / faturası eksik</option><option value="odenen">Ödemesi olanlar</option></select>
  <select id="srt"><option value="bal">Bakiyeye göre</option><option value="name">Ada göre</option><option value="f">Fatura toplamına göre</option></select>
  <span style="flex:1"></span><button class="btn sec" id="ex">Excel'e aktar</button></div>
  <div class="mut" style="margin-bottom:8px">Bakiye = Devir + Faturalar − Ödemeler (pozitif: tedarikçiye borcumuz var). Sarı <b>Devir</b> kutusuna 2026 öncesi bakiyeyi yazabilirsiniz. Kategori gelir-gider raporunda kullanılır. İsme tıklayın: hesap ekstresi.</div>
  <div class="tw"><table id="ct"></table></div></div>`;
  $('#only').value = CF.only; $('#srt').value = CF.sort;
  const filt = () => { const q = norm(CF.q); let rs = rows.filter(r => (!q || norm(r.p.name).includes(q) || r.p.key.includes(q)) && (CF.only === 'all' || (CF.only === 'borc' && r.bal > 0.5) || (CF.only === 'eksi' && r.bal < -0.5) || (CF.only === 'odenen' && r.nP))); rs.sort(CF.sort === 'name' ? (a, b) => a.p.name.localeCompare(b.p.name, TR) : CF.sort === 'f' ? (a, b) => b.f - a.f : (a, b) => b.bal - a.bal); return rs; };
  const draw = () => {
    const rs = filt();
    $('#ct').innerHTML = `<tr><th>Cari</th><th>Telefon</th><th>Kategori</th><th class="n">Devir</th><th class="n">Faturalar</th><th class="n">Ödemeler</th><th class="n">Bakiye</th><th>Son fatura</th><th>Son ödeme</th></tr>` +
      rs.map(r => `<tr><td><a href="javascript:void 0" onclick="cariEkstre('${esc(r.p.key)}')">${esc(r.p.name)}</a>${r.nI ? '' : ' <span class="tag w">e-fatura yok</span>'}</td>
      <td style="white-space:nowrap">${r.p.phone ? `<a href="tel:${esc(String(r.p.phone).replace(/[^\d+]/g, ''))}">${esc(r.p.phone)}</a>` : ''}</td>
      <td><select data-k="${esc(r.p.key)}" class="cat">${SUP_CATS.map(c => `<option ${c === r.p.cat ? 'selected' : ''}>${c}</option>`).join('')}</select></td>
      <td class="n"><input class="dv" data-k="${esc(r.p.key)}" value="${r.p.devir ? fmt(r.p.devir) : ''}" placeholder="0,00"></td>
      <td class="n">${fmt(r.f)}</td><td class="n">${fmt(r.o)}</td><td class="n ${r.bal > 0.5 ? 'neg' : r.bal < -0.5 ? 'pos' : ''}"><b>${fmt(r.bal)}</b></td><td>${dTR(r.lastI)}</td><td>${dTR(r.lastP)}</td></tr>`).join('') +
      `<tr class="tot"><td>TOPLAM (${rs.length})</td><td></td><td></td><td class="n">${fmt(sum(rs, r => r.p.devir || 0))}</td><td class="n">${fmt(sum(rs, r => r.f))}</td><td class="n">${fmt(sum(rs, r => r.o))}</td><td class="n">${fmt(sum(rs, r => r.bal))}</td><td></td><td></td></tr>`;
    $('#ct').querySelectorAll('select.cat').forEach(s => s.onchange = () => { if (!guard()) return vCari(); S.parties[s.dataset.k].cat = s.value; S.parties[s.dataset.k].catSet = true; mark('par', s.dataset.k); save(); toast('Kategori kaydedildi'); });
    $('#ct').querySelectorAll('input.dv').forEach(inp => inp.onchange = () => { if (!guard()) return vCari(); const v = parseTR(inp.value); S.parties[inp.dataset.k].devir = isNaN(v) ? 0 : v; mark('par', inp.dataset.k); save(); vCari(); toast('Devir kaydedildi'); });
  };
  $('#q').oninput = e => { CF.q = e.target.value; draw(); }; $('#only').onchange = e => { CF.only = e.target.value; draw(); }; $('#srt').onchange = e => { CF.sort = e.target.value; draw(); };
  $('#ex').onclick = () => xlsxDownload('Cari', [['Cari', 'VKN', 'Kategori', 'Devir', 'Faturalar', 'Ödemeler', 'Bakiye', 'Son fatura', 'Son ödeme'], ...filt().map(r => [r.p.name, r.p.vkn, r.p.cat, r.p.devir || 0, r2(r.f), r2(r.o), r2(r.bal), dTR(r.lastI), dTR(r.lastP)])]);
  draw();
}
// carinin iletişim satırı (telefona dokununca arar, e-postaya dokununca e-posta açar)
function contactLine(p) {
  if (!p) return '';
  const a = [];
  if (p.phone) a.push(`☎ <a href="tel:${esc(String(p.phone).replace(/[^\d+]/g, ''))}">${esc(p.phone)}</a>`);
  if (p.email) a.push(`✉ <a href="mailto:${esc(p.email)}">${esc(p.email)}</a>`);
  if (p.term != null) a.push(`Ödeme vadesi: ${esc(p.term)} gün`);
  return a.length ? `<div style="margin:-4px 0 10px">${a.join(' · ')}</div>` : '';
}
function cariEkstre(key) {
  const p = S.parties[key];
  const items = [...S.invoices.filter(i => i.vkn === key).map(i => ({ d: i.date, t: 'Fatura ' + i.no, b: i.pay, a: 0 })), ...S.tx.filter(t => t.party === key && t.cat === 'Tedarikçi ödemesi').map(t => ({ d: t.date, t: t.acc + ' – ' + t.desc, b: 0, a: -txAmt(t) }))].sort((x, y) => x.d.localeCompare(y.d) || (y.b - x.b));
  let bal = p.devir || 0;
  openModal(`<h3>${esc(p.name)} – hesap ekstresi</h3>${contactLine(p)}<div class="tw" style="max-height:65vh"><table><tr><th>Tarih</th><th>İşlem</th><th class="n">Borç (fatura)</th><th class="n">Alacak (ödeme)</th><th class="n">Bakiye</th></tr>
  <tr><td></td><td>Devir</td><td></td><td></td><td class="n">${fmt(bal)}</td></tr>
  ${items.map(x => { bal += x.b - x.a; return `<tr><td>${dTR(x.d)}</td><td>${esc(x.t)}</td><td class="n">${x.b ? fmt(x.b) : ''}</td><td class="n">${x.a ? fmt(x.a) : ''}</td><td class="n">${fmt(bal)}</td></tr>`; }).join('')}
  <tr class="tot"><td></td><td>Bakiye</td><td class="n">${fmt(sum(items, x => x.b))}</td><td class="n">${fmt(sum(items, x => x.a))}</td><td class="n">${fmt(bal)}</td></tr></table></div>`);
}

// ---------- BANKA & KART ----------
let BF = { q: '', acc: '', cat: '', m: '', lim: 400, apply: true };
function vBanka() {
  const y = YEAR();
  const accs = [...new Set(S.tx.map(t => t.acc))].sort();
  const cats = Object.keys(TX_CATS);
  const partyOpts = Object.values(S.parties).map(p => p.name).sort((a, b) => a.localeCompare(b, TR));
  $('#view').innerHTML = `<div class="card"><div class="tools">
   <input type="search" id="q" placeholder="Açıklamada ara…" value="${esc(BF.q)}">
   <select id="acc"><option value="">Tüm hesaplar/kartlar</option>${accs.map(a => `<option ${a === BF.acc ? 'selected' : ''}>${esc(a)}</option>`).join('')}</select>
   <select id="cat"><option value="">Tüm kategoriler</option>${cats.map(c => `<option ${c === BF.cat ? 'selected' : ''}>${c}</option>`).join('')}<option value="__nopos" ${BF.cat === '__nopos' ? 'selected' : ''}>POS ve masraflar hariç</option></select>
   <select id="m"><option value="">Tüm aylar</option>${AY.map((a, i) => `<option value="${i}" ${String(i) === BF.m ? 'selected' : ''}>${a}</option>`).join('')}</select>
   <label class="chk" title="Kategori/cari değiştirdiğinizde aynı açıklamalı diğer hareketlere ve gelecekte yüklenecek ekstrelere de uygulanır"><input type="checkbox" id="ap" ${BF.apply ? 'checked' : ''}> Benzerlerine de uygula</label>
   <span class="mut" id="cnt"></span></div>
   <datalist id="plist">${partyOpts.map(n => `<option value="${esc(n)}">`).join('')}</datalist>
   <div class="tw"><table id="bt"></table></div><div id="more"></div></div>`;
  const filt = () => { const q = norm(BF.q); return S.tx.filter(t => t.date.startsWith(y) && (!BF.acc || t.acc === BF.acc) && (!BF.cat || (BF.cat === '__nopos' ? !['POS tahsilatı', 'Banka & POS masrafı'].includes(t.cat) : t.cat === BF.cat)) && (BF.m === '' || mIdx(t.date) === +BF.m) && (!q || norm(t.desc).includes(q) || norm(pName(t.party)).includes(q))).sort((a, b) => b.date.localeCompare(a.date)); };
  const draw = () => {
    const ts = filt(); const inn = sum(ts.filter(t => txAmt(t) > 0), txAmt), out = sum(ts.filter(t => txAmt(t) < 0), txAmt);
    $('#cnt').innerHTML = `${ts.length} hareket · Giriş <span class="pos">${fmt(inn)}</span> · Çıkış <span class="neg">${fmt(out)}</span>`;
    $('#bt').innerHTML = `<tr><th>Tarih</th><th>Hesap</th><th>Açıklama</th><th class="n">Tutar</th><th>Kategori</th><th>Cari (tedarikçi)</th></tr>` +
      ts.slice(0, BF.lim).map(t => `<tr><td>${dTR(t.date)}</td><td class="mut">${esc(t.acc)}</td><td>${esc(t.desc)}${t.sector ? ` <span class="tag">${esc(t.sector)}</span>` : ''}${t.eff != null ? ` <span class="tag w">taksitli: toplam ${fmt(-t.eff)} sayıldı</span>` : ''}${t.man ? ' <span class="tag">elle</span>' : ''}</td>
      <td class="n ${txAmt(t) >= 0 ? 'pos' : 'neg'}">${fmt(t.amt)}</td>
      <td><select data-k="${esc(t.k)}" class="tc">${cats.map(c => `<option ${c === t.cat ? 'selected' : ''}>${c}</option>`).join('')}</select></td>
      <td><input class="party" list="plist" data-k="${esc(t.k)}" value="${esc(t.party ? pName(t.party) : '')}" placeholder="—"></td></tr>`).join('');
    $('#more').innerHTML = ts.length > BF.lim ? `<button class="btn sec more" onclick="BF.lim+=400;vBanka()">Daha fazla göster (${ts.length - BF.lim})</button>` : '';
    $('#bt').querySelectorAll('select.tc').forEach(s => s.onchange = () => setTx(s.dataset.k, s.value, undefined));
    $('#bt').querySelectorAll('input.party').forEach(inp => inp.onchange = () => setTx(inp.dataset.k, undefined, inp.value.trim()));
  };
  $('#q').oninput = e => { BF.q = e.target.value; BF.lim = 400; draw(); };
  $('#acc').onchange = e => { BF.acc = e.target.value; draw(); }; $('#cat').onchange = e => { BF.cat = e.target.value; draw(); }; $('#m').onchange = e => { BF.m = e.target.value; draw(); };
  $('#ap').onchange = e => { BF.apply = e.target.checked; };
  draw();
}
function setTx(k, cat, partyName) {
  if (!guard()) return vBanka();
  const t = S.tx.find(x => x.k === k); if (!t) return;
  let party = t.party;
  if (partyName !== undefined) {
    if (!partyName) party = null;
    else { const p = Object.values(S.parties).find(p => up(p.name) === up(partyName)); party = p ? p.key : ensureParty('X:' + partyName, partyName, '').key; }
    cat = party ? 'Tedarikçi ödemesi' : (cat || (t.cat === 'Tedarikçi ödemesi' ? 'Sınıflanmamış' : t.cat));
  }
  if (cat === undefined) cat = t.cat;
  if (cat !== 'Tedarikçi ödemesi') party = null;
  if (BF.apply) {
    const kw = norm(t.desc).replace(/\b\d[\d ]*\b/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
    if (kw.length >= 4) { S.rules = S.rules.filter(r => r.kw !== kw); S.rules.unshift({ kw, cat, party, at: new Date().toISOString() }); mark('rules', kw); }
    if (t.man) mark('tx', t.k);
    t.man = false; reclassifyAll();
    const n = S.tx.filter(x => !x.man && norm(x.desc).includes(kw)).length;
    toast(`Kural kaydedildi: "${kw}" → ${cat}${party ? ' / ' + pName(party) : ''} (${n} hareket)`);
  } else { t.cat = cat; t.party = party; t.man = true; mark('tx', t.k); toast('Kaydedildi'); }
  save(); vBanka();
}

// ---------- GELİR – GİDER ----------
// Satışlardaki KDV oranı (KDV hariç görünümde gelirden düşülür). Yeme-içme için varsayılan %10.
const salesVat = () => { try { const v = parseFloat(localStorage.getItem('tt_sales_vat')); return isNaN(v) ? 10 : v; } catch { return 10; } };
const YATIRIM_CATS = new Set(['Ekipman & Demirbaş']);
// Bölümler: gelir · gider (işletme) · yatirim (demirbaş) · vergi (kurumlar/geçici)
// KDV dahil: nakit bakışı (brüt satış, KDV dahil faturalar, devlete ödenen KDV gider)
// KDV hariç: kâr bakışı (satış / (1+oran), fatura matrahı, KDV ödemesi hesaba girmez)
function computeGG(y) {
  const sec = { gelir: new Map(), gider: new Map(), yatirim: new Map(), vergi: new Map() };
  const dahil = KDV(); const vf = 1 + salesVat() / 100;
  const add = (s, cat, d, a, item) => { const map = sec[s]; if (!map.has(cat)) map.set(cat, { cat, m: Array(12).fill(0), items: Array.from({ length: 12 }, () => []) }); const r = map.get(cat); r.m[mIdx(d)] += a; r.items[mIdx(d)].push(item); };
  const pSec = p => (p && YATIRIM_CATS.has(p.cat)) ? 'yatirim' : 'gider';
  for (const t of S.tx) {
    if (!t.date.startsWith(y)) continue;
    const kind = TX_CATS[t.cat]; const a = txAmt(t); const w = t.acc + ' – ' + t.desc;
    if (kind === 'gelir') {
      const kom = t.cat === 'POS tahsilatı' ? posComm(t) : 0; // net yatan + komisyon = brüt satış; komisyon ayrıca gider
      const salesLike = t.cat === 'POS tahsilatı' || t.cat === 'Nakit yatırma' || t.cat === 'Nakit satış';
      const g = (a + kom) / (dahil || !salesLike ? 1 : vf);
      add('gelir', t.cat, t.date, g, { d: t.date, w, a: g });
      if (kom) add('gider', 'Banka & POS masrafı', t.date, kom, { d: t.date, w: t.acc + ' – POS komisyonu', a: kom });
    }
    else if (kind === 'gider') add('gider', t.cat === 'Sınıflanmamış' ? 'Sınıflanmamış çıkışlar' : t.cat, t.date, -a, { d: t.date, w, a: -a });
    else if (kind === 'kdv') { if (dahil) add('gider', 'KDV ödemesi (devlete)', t.date, -a, { d: t.date, w, a: -a }); }
    else if (kind === 'vergi') add('vergi', t.cat, t.date, -a, { d: t.date, w, a: -a });
    else if (kind === 'odeme' && t.party && !IDX.partyHasInv.has(t.party)) { const p = S.parties[t.party]; add(pSec(p), (p && p.cat) || 'Diğer', t.date, -a, { d: t.date, w: (p ? p.name : '') + ' (faturasız) – ' + t.desc, a: -a }); }
  }
  for (const i of S.invoices) {
    if (!i.date.startsWith(y)) continue;
    const p = S.parties[i.vkn]; const a = dahil ? i.pay : i.net;
    add(pSec(p), (p && p.cat) || 'Diğer', i.date, a, { d: i.date, w: (p ? p.name : i.name) + ' – ' + i.no, a });
  }
  const ord = c => { const i = SUP_CATS.indexOf(c); return i < 0 ? 100 + c.length : i; };
  const out = s => [...sec[s].values()].sort((a, b) => s === 'gelir' ? sum(b.m) - sum(a.m) : ord(a.cat) - ord(b.cat));
  return { gelir: out('gelir'), gider: out('gider'), yatirim: out('yatirim'), vergi: out('vergi') };
}
const ggTot = rows => { const m = Array(12).fill(0); rows.forEach(r => r.m.forEach((v, i) => m[i] += v)); return m; };
let GGD = null;
function vGelirGider() {
  const y = YEAR(); const gg = computeGG(y); GGD = gg; const dahil = KDV();
  const all = [...gg.gelir, ...gg.gider, ...gg.yatirim, ...gg.vergi];
  const months = [...new Set(all.flatMap(r => r.m.map((v, i) => v ? i : -1)).filter(i => i >= 0))].sort((a, b) => a - b);
  const tg = ggTot(gg.gelir), tx = ggTot(gg.gider), ty = ggTot(gg.yatirim), tv = ggTot(gg.vergi);
  const fs = tg.map((v, i) => v - tx[i]); const net = fs.map((v, i) => v - ty[i] - tv[i]);
  const cols = months.length + 3;
  const row = (r, side, idx, base) => `<tr><td>${esc(r.cat)}</td>${months.map(m => `<td class="n">${r.m[m] ? `<a href="javascript:void 0" onclick="ggCell('${side}',${idx},${m})">${fmt(r.m[m])}</a>` : ''}</td>`).join('')}<td class="n"><b>${fmt(sum(r.m))}</b></td><td class="n mut">${sum(base) ? fmt0(sum(r.m) / sum(base) * 100) + '%' : ''}</td></tr>`;
  const totRow = (label, arr, cls) => `<tr class="tot"><td>${label}</td>${months.map(m => `<td class="n ${cls || (arr[m] >= 0 ? 'pos' : 'neg')}">${fmt(arr[m])}</td>`).join('')}<td class="n ${cls || (sum(arr) >= 0 ? 'pos' : 'neg')}">${fmt(sum(arr))}</td><td class="n mut">${sum(tg) && !cls ? fmt0(sum(arr) / sum(tg) * 100) + '%' : ''}</td></tr>`;
  const head = t => `<tr class="sub"><td colspan="${cols}">${t}</td></tr>`;
  $('#view').innerHTML = `<div class="card"><h2>Gelir – Gider ${y} <span class="mut" style="font-weight:400">(${dahil ? 'KDV dahil – nakit bakışı' : 'KDV hariç – kâr bakışı'} · rakama tıklayın: ayrıntı)</span></h2>
  <div class="tools"><label class="mut">Satışlardaki KDV oranı % <input type="text" id="svat" value="${salesVat()}" style="width:50px;padding:4px"></label><span class="mut">(sadece "KDV hariç" görünümde gelirden düşülür)</span><span style="flex:1"></span><button class="btn sec" id="ex">Excel'e aktar</button></div>
  <div class="tw"><table>
  <tr><th>Kalem</th>${months.map(m => `<th class="n">${AY[m]}</th>`).join('')}<th class="n">TOPLAM</th><th class="n">Gelire oranı</th></tr>
  ${head('GELİRLER')}${gg.gelir.map((r, i) => row(r, 'g', i, tg)).join('')}${totRow('Toplam gelir', tg, 'pos')}
  ${head('İŞLETME GİDERLERİ')}${gg.gider.map((r, i) => row(r, 'x', i, tg)).join('')}${totRow('Toplam işletme gideri', tx, 'neg')}
  ${totRow('FAALİYET SONUCU (gelir − işletme gideri)', fs)}
  ${gg.yatirim.length ? head('YATIRIM / DEMİRBAŞ (kalıcı alımlar: makine, mobilya, elektronik)') + gg.yatirim.map((r, i) => row(r, 'y', i, tg)).join('') + totRow('Toplam yatırım', ty, 'neg') : ''}
  ${gg.vergi.length ? head('KÂR ÜZERİNDEN VERGİ') + gg.vergi.map((r, i) => row(r, 'v', i, tg)).join('') : ''}
  ${totRow('NET NAKİT SONUCU (yatırım ve kurumlar vergisi sonrası)', net)}
  </table></div>
  <div class="mut" style="margin-top:10px;line-height:1.6">
  • <b>Gelir</b>: bankaya yatan POS satışları (komisyon eklenmiş brüt tutar) + kasadan bankaya yatırılan nakit + diğer gelirler + elle girilen gelirler. Bankaya yatırılmayan nakit satışlar görünmez.<br>
  • <b>İşletme giderleri</b>: e-faturalar (tedarikçinin kategorisine göre) + faturası olmayan ödemeler + maaş, SGK, stopaj, banka/POS masrafları${dahil ? ' + devlete ödenen KDV' : ''}.<br>
  • <b>Yatırım</b>: "Ekipman & Demirbaş" kategorisindeki alımlar; işletmenin aylık kârlılığından ayrı gösterilir. Kategoriyi Cari sekmesinden değiştirebilirsiniz.<br>
  • Tedarikçiye yapılan ödeme ayrıca gider sayılmaz (faturası zaten gider). Virman, kart borç ödemesi, pazaryeri ödemeleri ve ortak/şahsi hareketler hesaba girmez.<br>
  • <b>KDV dahil</b> = cebinizden çıkan/giren para. <b>KDV hariç</b> = muhasebe kârına yakın bakış (satış ve alış KDV'siz, devlete ödenen KDV hariç).</div></div>`;
  $('#svat').onchange = e => { const v = parseTR(e.target.value); if (!isNaN(v) && v >= 0 && v < 100) { try { localStorage.setItem('tt_sales_vat', String(v)); } catch { } vGelirGider(); } };
  const xr = (rows) => rows.map(r => [r.cat, ...months.map(m => r2(r.m[m])), r2(sum(r.m))]);
  const xt = (l, a) => [l, ...months.map(m => r2(a[m])), r2(sum(a))];
  $('#ex').onclick = () => xlsxDownload('Gelir_Gider_' + y + (dahil ? '_KDV_dahil' : '_KDV_haric'), [['Kalem', ...months.map(m => AY[m]), 'Toplam'], ['GELİRLER'], ...xr(gg.gelir), xt('Toplam gelir', tg), ['İŞLETME GİDERLERİ'], ...xr(gg.gider), xt('Toplam işletme gideri', tx), xt('FAALİYET SONUCU', fs), ['YATIRIM / DEMİRBAŞ'], ...xr(gg.yatirim), xt('Toplam yatırım', ty), ['KÂR ÜZERİNDEN VERGİ'], ...xr(gg.vergi), xt('NET NAKİT SONUCU', net)]);
}
function ggCell(side, idx, m) {
  const r = ({ g: GGD.gelir, x: GGD.gider, y: GGD.yatirim, v: GGD.vergi })[side][idx]; const it = [...r.items[m]].sort((a, b) => b.a - a.a);
  const grp = groupBy(it, x => x.w.split(' – ')[0]).map(([k, a]) => ({ k, a: sum(a, x => x.a), n: a.length })).sort((a, b) => b.a - a.a);
  openModal(`<h3>${esc(r.cat)} – ${AY[m]} ${YEAR()}: ${fmt(r.m[m])} ₺</h3>
  ${grp.length > 1 && grp.length < it.length ? `<div class="tw" style="max-height:220px;margin-bottom:12px"><table><tr><th>Kimden / nereye</th><th class="n">Adet</th><th class="n">Tutar</th></tr>${grp.map(g => `<tr><td>${esc(g.k)}</td><td class="n">${g.n}</td><td class="n">${fmt(g.a)}</td></tr>`).join('')}</table></div>` : ''}
  <div class="tw" style="max-height:50vh"><table><tr><th>Tarih</th><th>Açıklama</th><th class="n">Tutar</th></tr>${it.map(x => `<tr><td>${dTR(x.d)}</td><td>${esc(x.w)}</td><td class="n">${fmt(x.a)}</td></tr>`).join('')}</table></div>`);
}

// ---------- VADELER (planlı ödeme / tahsilat) ----------
const todayISO = () => new Date().toISOString().slice(0, 10);
const addDays = (iso, d) => { const x = new Date(iso + 'T12:00:00'); x.setDate(x.getDate() + d); return x.toISOString().slice(0, 10); };
const daysBetween = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 864e5);
function nextDue(iso, rec) { const x = new Date(iso + 'T12:00:00'); if (rec === 'haftalik') x.setDate(x.getDate() + 7); else if (rec === 'aylik') x.setMonth(x.getMonth() + 1); else if (rec === 'yillik') x.setFullYear(x.getFullYear() + 1); else return null; return x.toISOString().slice(0, 10); }
// bankada/kartta bu plana uyan bir ödeme var mı? (aynı cari, tutar ±1 TL, vadeden 60 gün önce ile bugün arası)
function planMatch(p) {
  if (!p.party) return null;
  const used = new Set((S.planned || []).filter(x => x.matchK).map(x => x.matchK));
  // ödeme, faturanın kesildiği günden (fatura yoksa vadeden 30 gün önceden) sonra olmalı
  const inv = p.invoice_no ? S.invoices.find(i => i.no === p.invoice_no && i.vkn === p.party) : null;
  const from = inv ? inv.date : addDays(p.due, -30);
  return S.tx.find(t => t.party === p.party && t.cat === 'Tedarikçi ödemesi' && Math.abs(Math.abs(txAmt(t)) - p.amount) <= 1 && t.date >= from && !used.has(t.k)) || null;
}
function dueSummary() {
  const t = todayISO(); const open = (S.planned || []).filter(p => p.status === 'bekliyor');
  const over = open.filter(p => p.due < t), soon = open.filter(p => p.due >= t && p.due <= addDays(t, 3));
  return { open, over, soon };
}
function remindDue() {
  const d = dueSummary(); if (!d.over.length && !d.soon.length) return;
  toast(`Vade hatırlatma: ${d.over.length} gecikmiş (${fmt0(sum(d.over, p => p.amount))} ₺), ${d.soon.length} ödeme 3 gün içinde (${fmt0(sum(d.soon, p => p.amount))} ₺). Vadeler sekmesine bakın.`);
}
let VF = { st: 'bekliyor', q: '' };
function vVadeler() {
  const t = todayISO(); const all = S.planned || [];
  const d = dueSummary(); const in30 = d.open.filter(p => p.due >= t && p.due <= addDays(t, 30));
  const partyOpts = Object.values(S.parties).map(p => p.name).sort((a, b) => a.localeCompare(b, TR));
  $('#view').innerHTML = `
  <div class="kpis">
    <div class="kpi"><div class="l">Vadesi geçmiş</div><div class="v neg">${d.over.length} · ${fmt0(sum(d.over, p => p.amount))} ₺</div></div>
    <div class="kpi"><div class="l">3 gün içinde</div><div class="v">${d.soon.length} · ${fmt0(sum(d.soon, p => p.amount))} ₺</div></div>
    <div class="kpi"><div class="l">30 gün içinde</div><div class="v">${in30.length} · ${fmt0(sum(in30, p => p.amount))} ₺</div></div>
    <div class="kpi"><div class="l">Toplam bekleyen</div><div class="v">${d.open.length} · ${fmt0(sum(d.open, p => p.amount))} ₺</div></div>
  </div>
  <div class="card"><div class="tools">
    <select id="vst"><option value="bekliyor">Bekleyenler</option><option value="tamamlandi">Ödenenler</option><option value="iptal">İptal edilenler</option><option value="">Hepsi</option></select>
    <input type="search" id="vq" placeholder="Cari / fatura ara…" value="${esc(VF.q)}">
    <span style="flex:1"></span>
    <button class="btn sec" id="vfat" title="Vadesi bugünden sonra olan ve planı olmayan e-faturalar için plan oluşturur">Vadeli faturalardan ekle</button>
    <button class="btn" id="vnew">+ Yeni planlı ödeme</button></div>
    <datalist id="plist2">${partyOpts.map(n => `<option value="${esc(n)}">`).join('')}</datalist>
    <div class="tw"><table id="vt"></table></div>
    <div class="mut" style="margin-top:8px">"Bankada görünüyor": aynı cariye, aynı tutarda (±1 ₺) bir banka/kart ödemesi bulundu; kontrol edip "Ödendi" diyebilirsiniz.</div></div>`;
  $('#vst').value = VF.st;
  const draw = () => {
    const q = norm(VF.q);
    const rows = all.filter(p => (!VF.st || p.status === VF.st) && (!q || norm(pName(p.party) + ' ' + (p.invoice_no || '') + ' ' + p.descr).includes(q))).sort((a, b) => a.due.localeCompare(b.due));
    $('#vt').innerHTML = `<tr><th>Vade</th><th>Durum</th><th>Cari</th><th>Fatura / açıklama</th><th class="n">Tutar</th><th>Banka eşleşmesi</th><th></th></tr>` +
      rows.map(p => {
        const dd = daysBetween(t, p.due); const m = p.status === 'bekliyor' ? planMatch(p) : null;
        const st = p.status !== 'bekliyor' ? `<span class="tag">${p.status === 'tamamlandi' ? 'ödendi' : 'iptal'}</span>` : dd < 0 ? `<span class="tag w" style="background:#fde8e6;color:var(--neg)">${-dd} gün gecikti</span>` : dd === 0 ? '<span class="tag w">bugün</span>' : `<span class="tag">${dd} gün kaldı</span>`;
        return `<tr><td>${dTR(p.due)}${p.recurrence && p.recurrence !== 'yok' ? ` <span class="tag">${p.recurrence}</span>` : ''}</td><td>${st}</td><td>${p.party ? `<a href="javascript:void 0" onclick="cariEkstre('${esc(p.party)}')">${esc(pName(p.party))}</a>` : ''}</td>
        <td>${esc(p.invoice_no || '')}<div class="mut" style="font-size:12px">${esc((p.descr || '').replace(/^.*·\s*/, '').slice(0, 60) === (p.invoice_no || '') ? '' : (p.descr || '').slice(0, 70))}</div></td>
        <td class="n"><b>${fmt(p.amount)}</b></td>
        <td>${m ? `<span class="tag" style="background:#e3f4e8;color:var(--pos)" title="${esc(m.desc)}">✓ ${dTR(m.date)} ${esc(m.acc.split(' ')[0])} ${fmt(-txAmt(m))}</span>` : ''}</td>
        <td style="white-space:nowrap">${p.status === 'bekliyor' ? `<button class="btn sec" onclick="planSet('${esc(p.id)}','tamamlandi'${m ? `,'${esc(m.k)}'` : ''})">Ödendi</button> <button class="btn red" onclick="planSet('${esc(p.id)}','iptal')">İptal</button>` : `<button class="btn sec" onclick="planSet('${esc(p.id)}','bekliyor')">Geri al</button>`}</td></tr>`;
      }).join('') + `<tr class="tot"><td colspan="4">${rows.length} kayıt</td><td class="n">${fmt(sum(rows, p => p.amount))}</td><td colspan="2"></td></tr>`;
  };
  $('#vst').onchange = e => { VF.st = e.target.value; draw(); }; $('#vq').oninput = e => { VF.q = e.target.value; draw(); };
  $('#vnew').onclick = planNewForm; $('#vfat').onclick = planFromInvoices;
  draw();
}
function planSet(id, status, matchK) {
  if (!guard()) return;
  const p = (S.planned || []).find(x => x.id === id); if (!p) return;
  p.status = status; if (matchK) p.matchK = matchK; if (status === 'bekliyor') delete p.matchK; mark('plan', id);
  if (status === 'tamamlandi' && p.recurrence && p.recurrence !== 'yok') {
    const nd = nextDue(p.due, p.recurrence);
    if (nd && !(S.planned.some(x => x.status === 'bekliyor' && x.party === p.party && x.due === nd && x.amount === p.amount))) {
      const np = { id: 'T:' + Date.now(), kind: p.kind, due: nd, amount: p.amount, party: p.party, invoice_no: '', descr: p.descr, status: 'bekliyor', recurrence: p.recurrence, src: 'TT' };
      S.planned.push(np); mark('plan', np.id); toast('Sonraki tekrar eklendi: ' + dTR(nd));
    }
  }
  save(); vVadeler();
}
function planNewForm() {
  openModal(`<h3>Yeni planlı ödeme</h3><div class="tools" style="flex-direction:column;align-items:stretch;max-width:420px">
    <input type="text" id="pp" list="plist2" placeholder="Cari (tedarikçi) adı" style="padding:7px">
    <input type="text" id="pa" placeholder="Tutar (ör. 12.500,00)" style="padding:7px">
    <input type="text" id="pd" placeholder="Vade GG.AA.YYYY" value="${dTR(addDays(todayISO(), 7))}" style="padding:7px">
    <input type="text" id="pn" placeholder="Açıklama (ör. kira, fatura no)" style="padding:7px">
    <select id="pr" style="padding:7px"><option value="yok">Tekrar yok</option><option value="aylik">Her ay</option><option value="haftalik">Her hafta</option><option value="yillik">Her yıl</option></select>
    <button class="btn" id="ps">Kaydet</button></div>
    <datalist id="plist2">${Object.values(S.parties).map(p => `<option value="${esc(p.name)}">`).join('')}</datalist>`);
  $('#ps').onclick = () => {
    if (!guard()) return;
    const a = parseTR($('#pa').value); const m = $('#pd').value.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/); const pn = $('#pp').value.trim();
    if (isNaN(a) || a <= 0 || !m) return toast('Tutar ve vade (GG.AA.YYYY) gerekli', true);
    let party = null; if (pn) { const p = Object.values(S.parties).find(p => up(p.name) === up(pn)); party = p ? p.key : ensureParty('X:' + pn, pn, '').key; }
    const np = { id: 'T:' + Date.now(), kind: 'odeme', due: `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`, amount: r2(a), party, invoice_no: '', descr: $('#pn').value.trim(), status: 'bekliyor', recurrence: $('#pr').value, src: 'TT' };
    (S.planned = S.planned || []).push(np); mark('plan', np.id); save(); closeModal(); vVadeler(); toast('Planlı ödeme eklendi');
  };
}
function planFromInvoices() {
  if (!guard()) return;
  const t = todayISO(); const have = new Set((S.planned || []).map(p => p.invoice_no).filter(Boolean));
  // faturada vade yoksa carinin ödeme vadesi (gün) kullanılır
  const dueOf = i => (i.due && /^\d{4}-\d{2}-\d{2}$/.test(i.due)) ? i.due : (S.parties[i.vkn] && S.parties[i.vkn].term != null ? addDays(i.date, S.parties[i.vkn].term) : '');
  const cand = S.invoices.filter(i => dueOf(i) >= t && !have.has(i.no) && i.pay > 0).map(i => Object.assign({}, i, { due: dueOf(i) }));
  if (!cand.length) return toast('Vadesi bugünden sonra olan, planı olmayan e-fatura yok.');
  if (!confirm(`${cand.length} vadeli e-fatura için plan oluşturulsun mu? (Toplam ${fmt(sum(cand, i => i.pay))} ₺)`)) return;
  for (const i of cand) { const np = { id: 'I:' + i.ettn, kind: 'odeme', due: i.due, amount: i.pay, party: i.vkn, invoice_no: i.no, descr: pName(i.vkn) + ' · ' + i.no, status: 'bekliyor', recurrence: 'yok', src: 'e-fatura' }; S.planned.push(np); mark('plan', np.id); }
  save(); vVadeler(); toast(cand.length + ' plan eklendi');
}

// ---------- KASA & NAKİT AKIŞI ----------
// Banka bakiyesi = 2026 açılış (dökümden) + o tarihten sonraki tüm hareketler. Kasa = kasa başlangıç tutarı + kasa hareketleri.
function accBalances() {
  const cfg = accCfg(); const out = [];
  const names = new Set([...Object.keys(cfg.banks), ...S.tx.filter(t => t.src === 'bank').map(t => t.acc)]);
  for (const a of [...names].sort()) {
    const c = cfg.banks[a] || null;
    const txs = S.tx.filter(t => t.acc === a && (!c || !c.date || t.date >= c.date));
    out.push({ acc: a, open: c ? Number(c.open) || 0 : null, sum: sum(txs, t => t.amt), bal: c ? (Number(c.open) || 0) + sum(txs, t => t.amt) : null, last: txs.reduce((m, t) => t.date > m ? t.date : m, ''), n: txs.length });
  }
  const k = cfg.kasa; const ktx = S.tx.filter(t => t.acc === KASA_ACC && (!k.start || t.date >= k.start));
  out.push({ acc: KASA_ACC, kasa: true, open: Number(k.open) || 0, sum: sum(ktx, t => t.amt), bal: k.start ? (Number(k.open) || 0) + sum(ktx, t => t.amt) : null, last: ktx.reduce((m, t) => t.date > m ? t.date : m, ''), n: ktx.length, start: k.start });
  return out;
}
// Tahmin: son 90 günün banka+kasa hareketlerinden, ayın her günü için ortalama giriş/çıkış (maaş, kira, SGK gibi ay içi zamanlamayı korur)
function cashForecast(weeks) {
  weeks = weeks || 12;
  const bal = accBalances().filter(b => b.bal != null); const accs = new Set(bal.map(b => b.acc));
  const start = sum(bal, b => b.bal);
  const lastDate = S.tx.filter(t => accs.has(t.acc) && t.src !== 'manual').reduce((m, t) => t.date > m ? t.date : m, '') || todayISO();
  const from = addDays(lastDate, -90);
  const skip = new Set(['Virman (kendi hesap)', 'Ortak / şahsi']);
  const hist = S.tx.filter(t => accs.has(t.acc) && t.date > from && t.date <= lastDate && !skip.has(t.cat));
  const domIn = Array(32).fill(0), domOut = Array(32).fill(0), domCnt = Array(32).fill(0);
  for (let d = addDays(from, 1); d <= lastDate; d = addDays(d, 1)) domCnt[+d.slice(8, 10)]++;
  for (const t of hist) { const dd = +t.date.slice(8, 10); if (t.amt > 0) domIn[dd] += t.amt; else domOut[dd] -= t.amt; }
  const totIn = sum(domIn), totOut = sum(domOut);
  const dIn = i => domCnt[i] ? domIn[i] / domCnt[i] : totIn / 90, dOut = i => domCnt[i] ? domOut[i] / domCnt[i] : totOut / 90;
  const byCat = groupBy(hist, t => t.cat).map(([c, a]) => ({ c, m: sum(a, t => t.amt) / 90 * 30 })).sort((a, b) => a.m - b.m);
  const planned = (S.planned || []).filter(p => p.status === 'bekliyor');
  const rows = []; let b = start; let d = addDays(lastDate, 1);
  for (let w = 0; w < weeks; w++) {
    const r = { d0: d, inn: 0, out: 0, min: b };
    for (let i = 0; i < 7; i++) { const dd = +d.slice(8, 10); r.inn += dIn(dd); r.out += dOut(dd); b += dIn(dd) - dOut(dd); if (b < r.min) r.min = b; r.d1 = d; d = addDays(d, 1); }
    r.bal = b; r.pl = sum(planned.filter(p => p.due >= r.d0 && p.due <= r.d1), p => p.amount);
    rows.push(r);
  }
  const overdue = planned.filter(p => p.due < addDays(lastDate, 1));
  return { start, lastDate, from, monIn: totIn / 90 * 30, monOut: totOut / 90 * 30, byCat, rows, overdue, bal };
}
const KASA_TYPES = [['satis', 'Nakit satış (gün sonu)', 1], ['gider', 'Nakit gider', -1], ['tedarikci', 'Tedarikçiye nakit ödeme', -1], ['banka', 'Bankaya yatırma', -1], ['ortak_giris', 'Ortaktan kasaya para', 1], ['ortak_cikis', 'Kasadan ortağa / şahsi', -1]];
function vKasa() {
  const bals = accBalances(); const fc = cashForecast(12); const cfg = accCfg();
  const kasa = bals.find(b => b.kasa);
  const giderCats = Object.keys(TX_CATS).filter(c => TX_CATS[c] === 'gider' && c !== 'Sınıflanmamış');
  const ktx = S.tx.filter(t => t.acc === KASA_ACC).sort((a, b) => b.date.localeCompare(a.date) || b.k.localeCompare(a.k));
  const net = fc.monIn - fc.monOut;
  $('#view').innerHTML = `
  <div class="kpis">
    <div class="kpi"><div class="l">Toplam nakit (bankalar${kasa.bal != null ? ' + kasa' : ''}, ${dTR(fc.lastDate)})</div><div class="v">${fmt0(fc.start)} ₺</div></div>
    <div class="kpi"><div class="l">Aylık ortalama giriş (son 90 gün)</div><div class="v pos">${fmt0(fc.monIn)} ₺</div></div>
    <div class="kpi"><div class="l">Aylık ortalama çıkış (son 90 gün)</div><div class="v neg">${fmt0(fc.monOut)} ₺</div></div>
    <div class="kpi"><div class="l">Aylık net</div><div class="v ${net >= 0 ? 'pos' : 'neg'}">${fmt0(net)} ₺</div></div>
  </div>
  <div class="grid2">
    <div class="card"><h2>Hesap bakiyeleri</h2>
      <div class="tw" style="max-height:none"><table><tr><th>Hesap</th><th class="n">2026 açılış</th><th class="n">Hareketler</th><th class="n">Güncel bakiye</th><th>Son hareket</th></tr>
      ${bals.map(b => `<tr><td>${esc(b.acc)}${b.kasa ? (b.start ? ` <span class="mut">(${dTR(b.start)}'den beri)</span>` : ' <span class="tag w">başlangıç girilmedi</span>') : ''}</td>
        <td class="n">${b.kasa ? fmt(b.open) : `<input class="dv" data-a="${esc(b.acc)}" value="${b.open != null ? fmt(b.open) : ''}" placeholder="girin">`}</td>
        <td class="n">${fmt(b.sum)}</td><td class="n"><b>${b.bal != null ? fmt(b.bal) : '—'}</b></td><td>${dTR(b.last)}</td></tr>`).join('')}
      <tr class="tot"><td>Toplam</td><td></td><td></td><td class="n">${fmt(sum(bals.filter(b => b.bal != null), b => b.bal))}</td><td></td></tr></table></div>
      <div class="mut" style="margin-top:6px">Açılış = 31.12.2025 akşamındaki bakiye (banka dökümünden). Bakiyeler, yüklenen son ekstre tarihine kadardır. Kredi kartları burada yok; kart borcu bankadan ödendiği gün nakit çıkışı sayılır.</div>
    </div>
    <div class="card"><h2>Kasa</h2>
      <div class="tools"><label class="mut">Kasa takibi başlangıcı <input type="text" id="ks" value="${cfg.kasa.start ? dTR(cfg.kasa.start) : ''}" placeholder="GG.AA.YYYY" style="width:110px;padding:5px"></label>
      <label class="mut">O günkü kasa tutarı <input type="text" id="ko" value="${cfg.kasa.start ? fmt(cfg.kasa.open) : ''}" placeholder="0,00" style="width:110px;padding:5px"></label><button class="btn sec" id="kss">Kaydet</button></div>
      <div class="mut" style="margin-bottom:10px">Başlangıçtan sonra bankaya yatırılan nakit "gelir" değil, kasadan bankaya virman sayılır (nakit satışı kasaya girdiğiniz için iki kez gelir yazılmaz).</div>
      <h3 style="margin:6px 0">Kasa hareketi ekle</h3>
      <div class="tools"><input type="text" id="kd" value="${dTR(todayISO())}" placeholder="GG.AA.YYYY" style="width:110px;min-width:0">
        <select id="kt">${KASA_TYPES.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>
        <input type="text" id="ka" placeholder="Tutar" style="width:110px;min-width:0">
        <select id="kc" style="display:none">${giderCats.map(c => `<option>${c}</option>`).join('')}</select>
        <input type="text" id="kp" list="plist3" placeholder="Tedarikçi" style="display:none">
        <input type="text" id="kn" placeholder="Açıklama (isteğe bağlı)">
        <button class="btn" id="kb">Ekle</button></div>
      <datalist id="plist3">${Object.values(S.parties).map(p => `<option value="${esc(p.name)}">`).join('')}</datalist>
      <div class="tw" style="max-height:260px;margin-top:8px"><table><tr><th>Tarih</th><th>Tür / kategori</th><th>Açıklama</th><th class="n">Tutar</th><th></th></tr>
      ${ktx.slice(0, 200).map(t => `<tr><td>${dTR(t.date)}</td><td>${esc(t.cat)}${t.party ? ' · ' + esc(pName(t.party)) : ''}</td><td>${esc(t.desc)}</td><td class="n ${t.amt >= 0 ? 'pos' : 'neg'}">${fmt(t.amt)}</td><td><button class="btn red" style="padding:2px 8px" onclick="kasaSil('${esc(t.k)}')">Sil</button></td></tr>`).join('') || '<tr><td colspan="5" class="mut">Henüz kasa hareketi yok.</td></tr>'}
      </table></div>
    </div>
  </div>
  <div class="card"><h2>Nakit akışı tahmini – önümüzdeki 12 hafta</h2>
    ${fc.overdue.length ? `<div class="warn">Vadesi geçmiş ${fc.overdue.length} planlı ödeme var (${fmt(sum(fc.overdue, p => p.amount))} ₺). <a href="#vadeler">Vadeler</a></div>` : ''}
    <div class="tw" style="max-height:none"><table><tr><th>Hafta</th><th class="n">Tahmini giriş</th><th class="n">Tahmini çıkış</th><th class="n">Hafta sonu bakiye</th><th class="n">Haftanın en düşüğü</th><th class="n">Bu hafta vadesi gelen (bilgi)</th></tr>
    <tr class="sub"><td>Başlangıç (${dTR(fc.lastDate)})</td><td></td><td></td><td class="n">${fmt(fc.start)}</td><td></td><td></td></tr>
    ${fc.rows.map(r => `<tr><td>${dTR(r.d0)} – ${dTR(r.d1)}</td><td class="n pos">${fmt(r.inn)}</td><td class="n neg">${fmt(r.out)}</td><td class="n"><b class="${r.bal < 0 ? 'neg' : ''}">${fmt(r.bal)}</b></td><td class="n ${r.min < 0 ? 'neg' : ''}">${fmt(r.min)}${r.min < 0 ? ' ⚠' : ''}</td><td class="n mut">${r.pl ? fmt(r.pl) : ''}</td></tr>`).join('')}
    </table></div>
    <div class="mut" style="margin-top:8px;line-height:1.6">• Tahmin, son 90 günün (${dTR(addDays(fc.from, 1))} – ${dTR(fc.lastDate)}) banka${kasa.bal != null ? ' ve kasa' : ''} hareketlerinin <b>ayın günlerine göre ortalamasıdır</b>: maaş, kira, SGK, kart ödemesi gibi ödemeler ayın hangi günlerinde çıkıyorsa tahminde de o günlerde düşülür.<br>
    • Kendi hesaplarınız arası virman ve ortak/şahsi hareketler hesaba katılmaz. Sezon etkisi, tek seferlik büyük ödemeler ve yeni yatırımlar tahmine giremez.<br>
    • "Vadesi gelen" sütunu bilgi içindir; bu ödemeler ortalama tedarikçi ödemelerinin içinde zaten vardır, ayrıca düşülmez.</div>
  </div>
  <div class="card"><h2>Aylık ortalama nakit hareketleri (son 90 gün, kalem kalem)</h2>
    <div class="tw" style="max-height:none"><table><tr><th>Kalem</th><th class="n">Aylık ortalama</th></tr>
    ${fc.byCat.map(x => `<tr><td>${esc(x.c)}</td><td class="n ${x.m >= 0 ? 'pos' : 'neg'}">${fmt(x.m)}</td></tr>`).join('')}
    <tr class="tot"><td>Net</td><td class="n ${net >= 0 ? 'pos' : 'neg'}">${fmt(net)}</td></tr></table></div></div>`;
  const syncType = () => { const v = $('#kt').value; $('#kc').style.display = v === 'gider' ? '' : 'none'; $('#kp').style.display = v === 'tedarikci' ? '' : 'none'; };
  $('#kt').onchange = syncType; syncType();
  $('#view').querySelectorAll('input.dv[data-a]').forEach(inp => inp.onchange = () => {
    if (!guard()) return vKasa(); const v = parseTR(inp.value); if (isNaN(v)) return toast('Geçersiz tutar', true);
    const a = (S.meta.accounts = S.meta.accounts || { banks: {}, kasa: { start: null, open: 0 } }); a.banks = a.banks || {};
    a.banks[inp.dataset.a] = { open: r2(v), date: '2026-01-01' }; mark('meta', 'accounts'); save(); vKasa(); toast('Açılış bakiyesi kaydedildi');
  });
  $('#kss').onclick = () => {
    if (!guard()) return; const m = $('#ks').value.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/); const o = parseTR($('#ko').value || '0');
    if (!m || isNaN(o)) return toast('Başlangıç tarihi (GG.AA.YYYY) ve tutar gerekli', true);
    const a = (S.meta.accounts = S.meta.accounts || { banks: {}, kasa: {} });
    a.kasa = { start: `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`, open: r2(o) };
    mark('meta', 'accounts'); reclassifyAll(); save(); vKasa(); toast('Kasa başlangıcı kaydedildi');
  };
  $('#kb').onclick = () => {
    if (!guard()) return;
    const m = $('#kd').value.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/); const a = parseTR($('#ka').value); const ty = KASA_TYPES.find(x => x[0] === $('#kt').value);
    if (!m || isNaN(a) || a <= 0) return toast('Tarih (GG.AA.YYYY) ve tutar gerekli', true);
    if (!accCfg().kasa.start) return toast('Önce kasa takibi başlangıç tarihini ve o günkü kasa tutarını kaydedin.', true);
    const iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    if (iso < accCfg().kasa.start) return toast('Tarih, kasa başlangıcından önce olamaz.', true);
    let cat = { satis: 'Nakit satış', gider: $('#kc').value, tedarikci: 'Tedarikçi ödemesi', banka: 'Virman (kendi hesap)', ortak_giris: 'Ortak / şahsi', ortak_cikis: 'Ortak / şahsi' }[ty[0]];
    let party = null;
    if (ty[0] === 'tedarikci') { const pn = $('#kp').value.trim(); if (!pn) return toast('Tedarikçi adını yazın', true); const p = Object.values(S.parties).find(p => up(p.name) === up(pn)); party = p ? p.key : ensureParty('X:' + pn, pn, '').key; }
    const desc = $('#kn').value.trim() || ty[1];
    const k = 'kasa|' + iso + '|' + Date.now();
    S.tx.push({ k, src: 'manual', acc: KASA_ACC, date: iso, desc, sector: '', amt: r2(ty[2] * a), file: 'kasa', cat, party, man: true, eff: null }); IDX.tx.add(k); mark('tx', k);
    save(); initYears(); vKasa(); toast('Kasa hareketi eklendi');
  };
}
function kasaSil(k) {
  if (!guard()) return; const t = S.tx.find(x => x.k === k); if (!t || t.acc !== KASA_ACC) return;
  if (!confirm(`${dTR(t.date)} ${t.desc} ${fmt(t.amt)} ₺ silinsin mi?`)) return;
  S.tx = S.tx.filter(x => x.k !== k); IDX.tx.delete(k); PEND.tx.delete(k); mark('txDel', k); save(); vKasa(); toast('Silindi');
}

// ---------- KULLANICILAR (yalnızca yönetici) ----------
let USERS = [];
async function vKullanicilar() {
  if (!(CLOUD.sess && CLOUD.role === 'admin')) { $('#view').innerHTML = '<div class="card">Bu bölüm sadece yöneticiler içindir.</div>'; return; }
  $('#view').innerHTML = '<div class="card">Kullanıcılar yükleniyor…</div>';
  try { USERS = await CLOUD.req('GET', 'members?select=user_id,username,full_name,role,active,created_at&order=full_name'); }
  catch (e) { $('#view').innerHTML = `<div class="card neg">Kullanıcılar okunamadı: ${esc(e.message)}</div>`; return; }
  const me = CLOUD.sess.uid;
  $('#view').innerHTML = `<div class="card"><h2>Kullanıcılar</h2>
  <div class="mut" style="margin-bottom:10px;line-height:1.6"><b>Yönetici</b>: her şey + kullanıcı yönetimi · <b>Düzenleyici</b>: kayıt girer, kategori/cari/vade değiştirir, ekstre ve fatura yükler · <b>Görüntüleyici</b>: sadece bakar, hiçbir şeyi değiştiremez (muhasebeci için uygun).<br>
  Kullanıcılar programı aynı adresten açar ve kendi kullanıcı adı + şifresiyle girer. Pasif yapılan kullanıcı artık giriş yapsa da hiçbir veriyi göremez.</div>
  <div class="tw" style="max-height:none"><table><tr><th>Kullanıcı adı</th><th>Ad soyad</th><th>Yetki</th><th>Durum</th><th></th></tr>
  ${USERS.map(u => `<tr><td>${esc(u.username)}${u.user_id === me ? ' <span class="tag">siz</span>' : ''}</td><td>${esc(u.full_name)}</td>
    <td><select data-u="${esc(u.user_id)}" class="ur" ${u.user_id === me ? 'disabled' : ''}>${['admin', 'editor', 'viewer'].map(r => `<option value="${r}" ${r === u.role ? 'selected' : ''}>${ROLE_TR[r]}</option>`).join('')}</select></td>
    <td>${u.user_id === me ? '<span class="tag">aktif</span>' : `<label class="chk"><input type="checkbox" class="ua" data-u="${esc(u.user_id)}" ${u.active ? 'checked' : ''}> aktif</label>`}</td>
    <td><button class="btn sec" onclick="userPw('${esc(u.user_id)}','${esc(u.username)}')">Şifre belirle</button></td></tr>`).join('')}
  </table></div></div>
  <div class="card"><h2>Yeni kullanıcı</h2>
    <div class="tools" style="flex-direction:column;align-items:stretch;max-width:420px">
      <input type="text" id="nu" placeholder="Kullanıcı adı (ör. muhasebe, ortak)" autocomplete="off" style="padding:7px">
      <input type="text" id="nf" placeholder="Ad soyad" autocomplete="off" style="padding:7px">
      <select id="nr" style="padding:7px"><option value="viewer">Görüntüleyici (sadece bakar)</option><option value="editor">Düzenleyici</option><option value="admin">Yönetici</option></select>
      <input type="password" id="np" placeholder="Şifre (en az 6 karakter)" autocomplete="new-password" style="padding:7px">
      <button class="btn" id="nb">Kullanıcıyı ekle</button>
      <div class="mut">Kişinin MATTERS'ta zaten hesabı varsa (aynı kullanıcı adı), o hesap bağlanır; şifre yazarsanız şifresi de bununla değişir.</div>
    </div></div>`;
  $('#view').querySelectorAll('select.ur').forEach(s => s.onchange = async () => { try { await CLOUD.req('PATCH', `members?user_id=eq.${s.dataset.u}`, { role: s.value }, 'return=minimal'); toast('Yetki güncellendi'); } catch (e) { toast('Güncellenemedi: ' + e.message, true); } vKullanicilar(); });
  $('#view').querySelectorAll('input.ua').forEach(c => c.onchange = async () => { try { await CLOUD.req('PATCH', `members?user_id=eq.${c.dataset.u}`, { active: c.checked }, 'return=minimal'); toast(c.checked ? 'Kullanıcı aktif' : 'Kullanıcı pasif yapıldı'); } catch (e) { toast('Güncellenemedi: ' + e.message, true); } vKullanicilar(); });
  $('#nb').onclick = userAdd;
}
async function userAdd() {
  const u = $('#nu').value.trim().toLowerCase(), fn = $('#nf').value.trim(), role = $('#nr').value, pw = $('#np').value;
  if (!/^[a-z0-9._-]{3,30}$/.test(u)) return toast('Kullanıcı adı 3–30 karakter olmalı: küçük harf, rakam, nokta, tire (Türkçe karakter olmadan).', true);
  if (USERS.some(m => m.username === u)) return toast('Bu kullanıcı adı zaten listede.', true);
  if (pw && pw.length < 6) return toast('Şifre en az 6 karakter olmalı.', true);
  $('#nb').disabled = true; $('#nb').textContent = 'Ekleniyor…';
  try {
    const email = u + '@matters.app'; let uid = null;
    if (pw) {
      const res = await fetch(`${CLOUD.url}/auth/v1/signup`, { method: 'POST', headers: { apikey: CLOUD.key, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: pw }) });
      const j = await res.json().catch(() => ({}));
      const msg = j.msg || j.error_description || j.message || '';
      if (res.ok && ((j.user && j.user.id) || j.id) && !(j.user && Array.isArray(j.user.identities) && !j.user.identities.length)) uid = (j.user && j.user.id) || j.id;
      else if (!res.ok && !/already|registered|exists/i.test(msg)) throw new Error(/signup|disabled|not allowed/i.test(msg) ? 'Supabase\'de yeni kayıt kapalı; hesabı Supabase panelinden açmanız gerekir.' : (msg || 'Kayıt hatası ' + res.status));
    }
    if (uid) { try { await CLOUD.req('POST', 'members', [{ user_id: uid, username: u, full_name: fn || u, role, active: true }], 'return=minimal'); } catch { uid = null; } }
    if (!uid) {
      // hesap zaten var (ör. MATTERS çalışanı) → TAMER TAKİP'e bağla
      const id = await CLOUD.req('POST', 'rpc/tt_link_member', { p_username: u, p_full_name: fn, p_role: role });
      if (pw) await CLOUD.req('POST', 'rpc/admin_set_password', { p_user_id: id, p_password: pw });
    }
    toast(`${u} eklendi (${ROLE_TR[role]})`);
  } catch (e) { toast('Eklenemedi: ' + e.message, true); }
  vKullanicilar();
}
function userPw(uid, uname) {
  openModal(`<h3>${esc(uname)} – şifre belirle</h3><div class="tools" style="flex-direction:column;align-items:stretch;max-width:340px">
    <input type="password" id="pw1" placeholder="Yeni şifre (en az 6 karakter)" autocomplete="new-password" style="padding:7px">
    <input type="password" id="pw2" placeholder="Yeni şifre (tekrar)" autocomplete="new-password" style="padding:7px">
    <button class="btn" id="pwb">Kaydet</button></div>`);
  $('#pwb').onclick = async () => {
    const a = $('#pw1').value, b = $('#pw2').value; if (a.length < 6) return toast('Şifre en az 6 karakter olmalı.', true); if (a !== b) return toast('Şifreler aynı değil.', true);
    try { await CLOUD.req('POST', 'rpc/admin_set_password', { p_user_id: uid, p_password: a }); closeModal(); toast('Şifre değiştirildi'); } catch (e) { toast('Değiştirilemedi: ' + e.message, true); }
  };
}

// ---------- STOK ----------
let SF = { q: '', only: false };
function vStok() {
  const all = aggProducts(S.lines);
  $('#view').innerHTML = `<div class="card"><h2>Stok</h2>
  <div class="mut" style="margin-bottom:10px">Alımlar faturalardan otomatik gelir. Sayım yaptığınızda <b>Sayım gir</b> ile elinizdeki miktarı yazın; program <b>tahmini mevcut</b> (son sayım + sonra alınan) ve iki sayım arasındaki <b>tüketimi</b> hesaplar.</div>
  <div class="tools"><input type="search" id="q" placeholder="Ürün ara…" value="${esc(SF.q)}"><label class="chk"><input type="checkbox" id="only" ${SF.only ? 'checked' : ''}> Sadece sayımı olanlar</label><span class="mut" id="cnt"></span></div>
  <div class="tw"><table id="st"></table></div></div>`;
  const draw = () => {
    const q = norm(SF.q);
    const ps = all.filter(p => (!q || norm(p.name).includes(q) || norm(pName(p.vkn)).includes(q)) && (!SF.only || (S.counts[p.k] || []).length));
    $('#cnt').textContent = ps.length + ' ürün';
    $('#st').innerHTML = `<tr><th>Ürün</th><th>Tedarikçi</th><th>Birim</th><th class="n">Toplam alınan</th><th class="n">Son 30 gün alınan</th><th>Son sayım</th><th class="n">Sayımdan sonra alınan</th><th class="n">Tahmini mevcut</th><th></th></tr>` +
      ps.slice(0, 500).map(p => { const st = stockOf(p); return `<tr><td><a href="javascript:void 0" onclick="stokHist('${esc(p.k)}')">${esc(p.name)}</a></td><td class="mut">${esc(pName(p.vkn))}</td><td>${esc(p.unit)}</td><td class="n">${fmtQ(p.q)}</td><td class="n">${fmtQ(st.last30)}</td><td>${st.c ? dTR(st.c.d) + ' · ' + fmtQ(st.c.q) : '<span class="mut">—</span>'}</td><td class="n">${st.c ? fmtQ(st.after) : ''}</td><td class="n"><b>${st.c ? fmtQ(st.c.q + st.after) : ''}</b></td><td><button class="btn sec" onclick="stokSay('${esc(p.k)}')">Sayım gir</button></td></tr>`; }).join('');
  };
  $('#q').oninput = e => { SF.q = e.target.value; draw(); }; $('#only').onchange = e => { SF.only = e.target.checked; draw(); };
  draw();
}
function linesOf(k) { const [vkn, nameU, unit] = k.split('|'); return S.lines.filter(l => l.vkn === vkn && up(l.name) === nameU && l.unit === unit); }
function stockOf(p) {
  const ls = linesOf(p.k); const cs = (S.counts[p.k] || []).slice().sort((a, b) => a.d.localeCompare(b.d)); const c = cs[cs.length - 1];
  const today = new Date(); const d30 = new Date(today - 30 * 864e5).toISOString().slice(0, 10);
  return { c, after: c ? sum(ls.filter(l => l.date > c.d), l => l.qty) : 0, last30: sum(ls.filter(l => l.date >= d30), l => l.qty) };
}
function stokSay(k) {
  if (!guard()) return;
  const v = prompt('Sayılan miktar (bugün itibarıyla):'); if (v == null) return;
  const q = parseTR(v); if (isNaN(q)) return toast('Geçersiz miktar', true);
  const d = prompt('Sayım tarihi (GG.AA.YYYY):', dTR(new Date().toISOString().slice(0, 10))); if (!d) return;
  const m = d.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/); if (!m) return toast('Tarih GG.AA.YYYY olmalı', true);
  const cd = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; const cid = k + '|' + cd + '|' + Date.now();
  (S.counts[k] = S.counts[k] || []).push({ id: cid, d: cd, q }); mark('counts', cid);
  save(); vStok(); toast('Sayım kaydedildi');
}
function stokSil(k) {
  if (!guard()) return;
  if (!confirm('Son sayım silinsin mi?')) return;
  const cs = (S.counts[k] || []).sort((a, b) => a.d.localeCompare(b.d)); const c = cs.pop();
  if (c && c.id) { PEND.counts.delete(c.id); mark('countsDel', c.id); }
  save(); closeModal(); vStok();
}
function stokHist(k) {
  const ls = linesOf(k); const cs = (S.counts[k] || []).slice().sort((a, b) => a.d.localeCompare(b.d));
  const ev = [...ls.map(l => ({ d: l.date, t: 'Alım', q: l.qty })), ...cs.map(c => ({ d: c.d, t: 'Sayım', q: c.q }))].sort((a, b) => a.d.localeCompare(b.d) || (a.t === 'Alım' ? -1 : 1));
  let lastC = null, bought = 0; const out = [];
  for (const e of ev) {
    if (e.t === 'Alım') { bought += e.q; out.push(`<tr><td>${dTR(e.d)}</td><td>Alım</td><td class="n">${fmtQ(e.q)}</td><td></td></tr>`); }
    else { const cons = lastC ? lastC.q + bought - e.q : null; out.push(`<tr class="sub"><td>${dTR(e.d)}</td><td>Sayım</td><td class="n">${fmtQ(e.q)}</td><td class="n">${cons != null ? 'Tüketim: ' + fmtQ(cons) : ''}</td></tr>`); lastC = e; bought = 0; }
  }
  const p = ls[0] || {};
  openModal(`<h3>${esc(p.name || '')} – stok hareketleri</h3><div class="tw" style="max-height:60vh"><table><tr><th>Tarih</th><th>Hareket</th><th class="n">Miktar (${esc(p.unit || '')})</th><th class="n"></th></tr>${out.join('')}</table></div>
  ${cs.length ? `<button class="btn red" style="margin-top:10px" onclick="stokSil('${esc(k)}')">Son sayımı sil</button>` : ''}`);
}

// ---------- YÜKLE / YEDEK ----------
function vYukle() {
  $('#view').innerHTML = `<div class="grid2">
  <div class="card"><h2>1) E-fatura yükle</h2><div class="mut" style="margin-bottom:8px">Entegratörden indirdiğiniz <b>ZIP</b> veya <b>XML</b> dosyaları. Aynı fatura ikinci kez yüklenmez (ETTN ve fatura no ile kontrol). ZIP içindeki PDF'ler sadece kontrol edilir.</div>
    <div class="drop" id="d1">Dosyaları buraya sürükleyin veya tıklayın</div><input type="file" id="f1" multiple accept=".zip,.xml" hidden></div>
  <div class="card"><h2>2) Banka / kredi kartı ekstresi yükle</h2><div class="mut" style="margin-bottom:8px">İnternet şubesinden indirilen <b>Excel (.xls/.xlsx)</b> veya CSV. Aynı hareket ikinci kez eklenmez; dönemleri çakışan dosyaları gönül rahatlığıyla yükleyebilirsiniz.</div>
    <div class="drop" id="d2">Dosyaları buraya sürükleyin veya tıklayın</div><input type="file" id="f2" multiple accept=".xls,.xlsx,.csv" hidden></div>
  </div>
  <div class="card"><h2>Sonuç</h2><div class="log" id="log">${esc(S.log.slice(-25).join('\n'))}</div></div>
  <div class="grid2">
  <div class="card"><h2>3) Elle kayıt (nakit gelir/gider vb.)</h2>
    <div class="tools"><input type="text" id="md" placeholder="Tarih GG.AA.YYYY" style="min-width:130px" value="${dTR(new Date().toISOString().slice(0, 10))}"><input type="text" id="mt" placeholder="Açıklama"><input type="text" id="ma" placeholder="Tutar" style="min-width:110px">
    <select id="mk">${Object.keys(TX_CATS).filter(c => TX_CATS[c] !== 'notr').map(c => `<option>${c}</option>`).join('')}</select><button class="btn" id="mb">Ekle</button></div>
    <div class="mut">Gelir kategorisinde tutar giriş, diğerlerinde çıkış olarak kaydedilir. Kayıtlar "Kasa" hesabına işlenir. Günlük kasa için <a href="#kasa">Kasa & Nakit</a> sekmesi daha pratiktir.</div></div>
  <div class="card"><h2>4) Yedek</h2><div class="mut" style="margin-bottom:8px">Veriler bu bilgisayarda, programın içinde saklanır. Ayda bir yedek alıp OneDrive'da saklayın.</div>
    <div class="tools"><button class="btn" id="bk">Yedek al</button><button class="btn sec" id="rs">Yedekten geri yükle</button><input type="file" id="f3" accept=".json" hidden>
    <span style="flex:1"></span><button class="btn red" id="rz">Başlangıç verisine dön</button></div>
    <div class="mut">Kayıtlı: ${S.invoices.length} fatura · ${S.lines.length} fatura satırı · ${S.tx.length} banka/kart hareketi · ${Object.keys(S.parties).length} cari · ${S.rules.length} öğrenilmiş kural</div></div></div>`;
  const wire = (d, f, fn) => { const D = $(d), F = $(f); D.onclick = () => F.click(); F.onchange = () => { fn([...F.files]); F.value = ''; }; D.ondragover = e => { e.preventDefault(); D.classList.add('over'); }; D.ondragleave = () => D.classList.remove('over'); D.ondrop = e => { e.preventDefault(); D.classList.remove('over'); fn([...e.dataTransfer.files]); }; };
  wire('#d1', '#f1', importInvoices); wire('#d2', '#f2', importStatements);
  $('#mb').onclick = () => {
    if (!guard()) return;
    const m = $('#md').value.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/); const a = parseTR($('#ma').value); const c = $('#mk').value; const t = $('#mt').value.trim();
    if (!m || isNaN(a) || !t) return toast('Tarih, açıklama ve tutarı doldurun', true);
    const iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; const amt = TX_CATS[c] === 'gelir' ? Math.abs(a) : -Math.abs(a);
    const k = 'manual|' + Date.now(); S.tx.push({ k, src: 'manual', acc: KASA_ACC, date: iso, desc: t, sector: '', amt, file: 'elle', cat: c, party: null, man: true, eff: null }); IDX.tx.add(k); mark('tx', k);
    logMsg(`Elle kayıt: ${dTR(iso)} ${t} ${fmt(amt)} (${c})`); save(); initYears(); toast('Eklendi'); $('#mt').value = ''; $('#ma').value = '';
  };
  $('#bk').onclick = () => { const b = new Blob([JSON.stringify(S)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'TAMER_TAKIP_yedek_' + new Date().toISOString().slice(0, 10) + '.json'; a.click(); toast('Yedek indirildi (İndirilenler klasörü)'); };
  $('#rs').onclick = () => $('#f3').click();
  $('#f3').onchange = async () => { const f = $('#f3').files[0]; if (!f || !guard()) return; try { const o = JSON.parse(await f.text()); if (!o.invoices || !o.tx) throw new Error('Geçerli bir TAMER TAKİP yedeği değil'); if (!confirm('Mevcut veriler yedektekiyle değiştirilecek. Devam?')) return; S = o; ensureLineIds(); ensureCountIds(); reclassifyAll(); markAll(); save(); initYears(); toast('Yedek geri yüklendi' + (CLOUD.sess ? ', buluta gönderiliyor' : '')); vYukle(); } catch (e) { toast('Yedek okunamadı: ' + e.message, true); } };
  $('#rz').onclick = () => { if (CLOUD.sess) return toast('Bulut kullanılırken başlangıç verisine dönülemez (herkesin verisi silinirdi).', true); if (!confirm('Tüm değişiklikleriniz (yüklemeler, kurallar, devirler, sayımlar) silinip başlangıç verisine dönülecek. Önce yedek almanız önerilir. Devam?')) return; fromSeed(); save(); initYears(); vYukle(); toast('Başlangıç verisine dönüldü'); };
}
function logMsg(s) { S.log.push(dTR(new Date().toISOString().slice(0, 10)) + ' ' + s); if (S.log.length > 500) S.log = S.log.slice(-500); const l = $('#log'); if (l) { l.textContent = S.log.slice(-25).join('\n'); l.scrollTop = 1e9; } }

// --- e-fatura (UBL-TR) ---
const kids = (el, name) => { const ln = name.includes(':') ? name.split(':')[1] : name; return el ? [...el.children].filter(c => c.localName === ln) : []; };
function q1(el, path) { let cur = [el]; for (const p of path.split('/')) { const nx = []; for (const c of cur) nx.push(...kids(c, p)); cur = nx; if (!cur.length) return null; } return cur[0]; }
const qt = (el, path) => { const n = q1(el, path); return n ? n.textContent.trim() : ''; };
const num = s => { const v = parseFloat(s); return isNaN(v) ? 0 : v; };
function decodeXml(u8) {
  const head = new TextDecoder('ascii').decode(u8.slice(0, 200)); const m = head.match(/encoding=["']([^"']+)/i);
  let enc = (m ? m[1] : 'utf-8').toLowerCase(); if (u8[0] === 0xFF && u8[1] === 0xFE) enc = 'utf-16le';
  try { return new TextDecoder(enc).decode(u8); } catch { return new TextDecoder('utf-8').decode(u8); }
}
function parseUBL(text) {
  const doc = new DOMParser().parseFromString(text, 'application/xml'); const r = doc.documentElement;
  if (!r || r.localName !== 'Invoice') return null;
  const sup = q1(r, 'cac:AccountingSupplierParty/cac:Party');
  let name = qt(sup, 'cac:PartyName/cbc:Name'); if (!name) name = (qt(sup, 'cac:Person/cbc:FirstName') + ' ' + qt(sup, 'cac:Person/cbc:FamilyName')).trim();
  let vkn = ''; for (const pi of kids(sup, 'cac:PartyIdentification')) { const id = kids(pi, 'cbc:ID')[0]; if (id && /^(VKN|TCKN)$/i.test(id.getAttribute('schemeID') || '')) { vkn = id.textContent.trim(); break; } }
  const type = qt(r, 'cbc:InvoiceTypeCode'); const sg = type === 'IADE' ? -1 : 1;
  const inv = { ettn: qt(r, 'cbc:UUID'), no: qt(r, 'cbc:ID'), date: qt(r, 'cbc:IssueDate'), vkn, name: name.replace(/\s+/g, ' '), type,
    net: sg * num(qt(r, 'cac:LegalMonetaryTotal/cbc:TaxExclusiveAmount')), vat: sg * num(qt(r, 'cac:TaxTotal/cbc:TaxAmount')), total: sg * num(qt(r, 'cac:LegalMonetaryTotal/cbc:TaxInclusiveAmount')), pay: sg * num(qt(r, 'cac:LegalMonetaryTotal/cbc:PayableAmount')), due: qt(r, 'cac:PaymentMeans/cbc:PaymentDueDate'), src: 'XML' };
  const lines = kids(r, 'cac:InvoiceLine').map(l => { const qe = kids(l, 'cbc:InvoicedQuantity')[0]; const u = qe ? qe.getAttribute('unitCode') : ''; return { ettn: inv.ettn, date: inv.date, vkn, name: prodName(qt(l, 'cac:Item/cbc:Name'), qt(l, 'cac:Item/cbc:Description')), code: qt(l, 'cac:Item/cac:SellersItemIdentification/cbc:ID'), qty: sg * num(qe ? qe.textContent : 0), unit: UNIT[u] || u, net: sg * num(qt(l, 'cbc:LineExtensionAmount')), rate: num(qt(l, 'cac:TaxTotal/cac:TaxSubtotal/cbc:Percent')), vat: sg * num(qt(l, 'cac:TaxTotal/cbc:TaxAmount')) }; });
  return { inv, lines };
}
async function importInvoices(files) {
  if (!guard()) return;
  let add = 0, dup = 0, bad = 0, pdfDup = 0; const pdfOnly = [], newSup = new Set(); const before = new Set(Object.keys(S.parties));
  const handleXml = (u8, nm) => { try { const p = parseUBL(decodeXml(u8)); if (!p || !p.inv.ettn) { bad++; return; } if (addInvoice(p.inv)) { p.lines.forEach((l, i) => { l.id = p.inv.ettn + '#' + (i + 1); mark('lines', l.id); }); S.lines.push(...p.lines); add++; if (!before.has(p.inv.vkn)) newSup.add(p.inv.name); } else dup++; } catch (e) { bad++; console.warn(nm, e); } };
  const handlePdf = nm => { const b = nm.split('/').pop(); const parts = b.split('_'); if (parts.length >= 2 && IDX.invNo.has(parts[0] + '|' + parts[1])) pdfDup++; else pdfOnly.push(b); };
  logMsg('E-fatura yükleme başladı: ' + files.map(f => f.name).join(', '));
  for (const f of files) {
    if (/\.zip$/i.test(f.name)) {
      const z = await JSZip.loadAsync(f);
      for (const e of Object.values(z.files)) { if (e.dir) continue; if (/\.xml$/i.test(e.name)) handleXml(await e.async('uint8array'), e.name); else if (/\.pdf$/i.test(e.name)) handlePdf(e.name); else if (/\.zip$/i.test(e.name)) { const z2 = await JSZip.loadAsync(await e.async('uint8array')); for (const e2 of Object.values(z2.files)) if (/\.xml$/i.test(e2.name)) handleXml(await e2.async('uint8array'), e2.name); } }
    } else if (/\.xml$/i.test(f.name)) handleXml(new Uint8Array(await f.arrayBuffer()), f.name);
  }
  reclassifyAll(); save(); initYears();
  logMsg(`E-fatura: ${add} yeni fatura eklendi, ${dup} mükerrer atlandı${bad ? ', ' + bad + ' dosya okunamadı' : ''}${pdfDup ? ', ' + pdfDup + ' PDF zaten XML olarak var' : ''}.` + (newSup.size ? `\n  Yeni tedarikçi: ${[...newSup].join(', ')}` : '') + (pdfOnly.length ? `\n  DİKKAT: ${pdfOnly.length} PDF'in XML'i yok (portaldan XML olarak indirip yükleyin): ${pdfOnly.slice(0, 20).join(', ')}` : ''));
  toast(`${add} yeni fatura eklendi, ${dup} mükerrer atlandı`);
}
// --- ekstre ---
function parseTR(v) {
  if (typeof v === 'number') return v;
  let s = String(v || '').replace(/TL|TRY|₺/gi, '').replace(/\s/g, '').trim(); if (!s) return NaN;
  const neg = /^-|-$|^\(.*\)$/.test(s); s = s.replace(/[()+-]/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.'); else if ((s.match(/\./g) || []).length > 1) s = s.replace(/\./g, '');
  const n = parseFloat(s); return isNaN(n) ? NaN : (neg ? -n : n);
}
function toISO(v) {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'number' && v > 20000 && v < 80000) return new Date(Math.round((v - 25569) * 864e5)).toISOString().slice(0, 10);
  const s = String(v || '').trim(); let m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/); if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`; return null;
}
const H = s => norm(String(s || ''));
function parseStatementRows(rows, fileName) {
  const COL = { date: ['TARIH', 'ISLEM TARIHI', 'ISLEM TARIH', 'VALOR', 'TARIH SAAT'], desc: ['ACIKLAMA', 'ISLEMLER', 'ISLEM ACIKLAMASI', 'ACIKLAMALAR', 'ISLEM', 'HAREKET ACIKLAMASI'], amt: ['ISLEM TUTARI', 'TUTAR', 'TUTAR TL', 'ISLEM TUTARI TL', 'HAREKET TUTARI'], debit: ['BORC', 'BORC TUTARI'], credit: ['ALACAK', 'ALACAK TUTARI'], sector: ['SEKTOR'] };
  let hi = -1, map = null;
  for (let i = 0; i < Math.min(rows.length, 60); i++) {
    const hs = rows[i].map(H); const find = list => { for (const n of list) { const j = hs.indexOf(n); if (j >= 0) return j; } return -1; };
    const m = { date: find(COL.date), desc: find(COL.desc), amt: find(COL.amt), debit: find(COL.debit), credit: find(COL.credit), sector: find(COL.sector) };
    if (m.date >= 0 && m.desc >= 0 && (m.amt >= 0 || (m.debit >= 0 && m.credit >= 0))) { hi = i; map = m; break; }
  }
  if (hi < 0) throw new Error('Başlık satırı bulunamadı (Tarih / Açıklama / Tutar)');
  // ISLEM kolonu açıklama ile karışmasın: hem ISLEM hem ACIKLAMA varsa ACIKLAMA'yı seç
  const meta = rows.slice(0, hi).map(r => r.map(x => String(x ?? '')).join(' | ')).join('\n');
  const all = norm(fileName + ' ' + meta);
  const ibanM = meta.replace(/\s/g, '').match(/TR\d{2}(\d{5})/);
  const BANKCODE = { '00067': 'YKB', '00062': 'Garanti', '00010': 'Ziraat', '00064': 'İş Bankası', '00046': 'Akbank', '00015': 'Vakıfbank', '00012': 'Halkbank', '00111': 'QNB', '00032': 'TEB', '00134': 'Denizbank', '00059': 'Şekerbank', '00203': 'Albaraka', '00205': 'Kuveyt Türk', '00206': 'Türkiye Finans', '00209': 'Ziraat Katılım', '00210': 'Vakıf Katılım' };
  const bank = (ibanM && BANKCODE[ibanM[1]]) ? BANKCODE[ibanM[1]] : /\bYKB\b|YAPI KREDI|YAPIKREDI/.test(all) ? 'YKB' : /GARANTI/.test(all) ? 'Garanti' : /ZIRAAT/.test(all) ? 'Ziraat' : /IS BANK|ISBANK/.test(all) ? 'İş Bankası' : /AKBANK/.test(all) ? 'Akbank' : /VAKIF/.test(all) ? 'Vakıfbank' : /HALK/.test(all) ? 'Halkbank' : /QNB|FINANSBANK/.test(all) ? 'QNB' : /ENPARA/.test(all) ? 'Enpara' : 'Banka';
  const cardM = meta.match(/Kart No[^\d]*([\d*\s#-]{12,})/i) || meta.match(/(\d{4}[\s*#-]+\d{4})\s+Numaral/i) || meta.match(/(\d{4}\s*[*#]{4}\s*[*#]{4}\s*\d{4})/); const hdrs = rows[hi].map(H);
  // işaret kuralı: dosyada "-" ile başlayan tutar varsa tutarlar olduğu gibi (harcama eksi); yoksa YKB usulü (harcama işaretsiz, ödeme "+")
  const signed = rows.slice(hi + 1).some(r => { const v = map.amt >= 0 ? r[map.amt] : ''; return (typeof v === 'number' && v < 0) || /^\s*-/.test(String(v)); });
  const isCard = !!cardM || hdrs.includes('KART NO') || /\bKK\b|KREDI KARTI|KART EKSTRE/.test(norm(fileName));
  let acc;
  if (isCard) { const d = (cardM ? cardM[1] : '').replace(/\D/g, ''); acc = `${bank} Kart …${d.slice(-4) || '????'}`; }
  else { const ib = meta.match(/TR\d{2}[\d ]{10,}/); const hn = meta.match(/Hesap No[^\d]*(\d{5,})/i); const d = ib ? ib[0].replace(/\D/g, '') : hn ? hn[1] : ''; const vad = /Vadesiz/i.test(meta) ? 'Vadesiz TL ' : 'Hesap '; acc = `${bank} ${vad}…${d.slice(-4) || '????'}`; }
  const out = [];
  for (let i = hi + 1; i < rows.length; i++) {
    const r = rows[i]; const date = toISO(r[map.date]); if (!date) continue;
    let desc = String(r[map.desc] ?? '').trim();
    let amt;
    if (map.amt >= 0) {
      const raw = r[map.amt]; amt = parseTR(raw); if (isNaN(amt)) continue;
      if (isCard && !signed) { const s = String(raw).trim(); amt = (typeof raw === 'number') ? -raw : (s.startsWith('+') ? Math.abs(amt) : -Math.abs(amt)); }
    } else { const d = parseTR(r[map.debit]) || 0, c = parseTR(r[map.credit]) || 0; amt = (isNaN(c) ? 0 : c) - Math.abs(isNaN(d) ? 0 : d); if (!amt) continue; }
    out.push({ src: isCard ? 'card' : 'bank', acc, date, desc, sector: map.sector >= 0 ? String(r[map.sector] ?? '').trim() : '', amt });
  }
  return { acc, rows: out };
}
async function importStatements(files) {
  if (!guard()) return;
  for (const f of files) {
    try {
      const wb = XLSX.read(await f.arrayBuffer(), { type: 'array', cellDates: false, codepage: 1254 });
      let res = null, err = null;
      for (const sn of wb.SheetNames) { try { const rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, raw: true, defval: '' }); res = parseStatementRows(rows, f.name); if (res.rows.length) break; } catch (e) { err = e; } }
      if (!res) throw err || new Error('okunamadı');
      const r = addStatementRows(res.rows, f.name);
      logMsg(`${f.name}: ${res.acc} → ${r.added} yeni hareket, ${r.dup} zaten vardı.`);
    } catch (e) { logMsg(`${f.name}: HATA – ${e.message}`); }
  }
  reclassifyAll(); save(); initYears();
  const unc = S.tx.filter(t => t.cat === 'Sınıflanmamış').length;
  toast('Ekstre yüklendi.' + (unc ? ` ${unc} çıkış sınıflanmamış: Banka & Kart sekmesinden bakın.` : ''));
}

// ---------- Excel dışa aktarma ----------
function xlsxDownload(name, aoa) { const ws = XLSX.utils.aoa_to_sheet(aoa); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Sayfa1'); XLSX.writeFile(wb, name + '.xlsx'); }

const VIEWS = { ozet: vOzet, faturalar: vFaturalar, urunler: vUrunler, cari: vCari, vadeler: vVadeler, kasa: vKasa, kullanicilar: vKullanicilar, banka: vBanka, gelirgider: vGelirGider, stok: vStok, yukle: vYukle };
window.addEventListener('hashchange', () => { const k = location.hash.slice(1); if (k && k !== CUR && VIEWS[k]) go(k); });
boot();
