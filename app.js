/* MapMinds v4 core: data, search, map, UI.  (navigation lives in nav.js, map editor in editor.js)
   Data flow: campus-places.csv (curated, always available)  +  OpenStreetMap via Overpass (optional, silent refresh) */
'use strict';
/* accepts a pasted dashboard link or an API link and reduces it to https://PROJECT.supabase.co */
function mmSupabaseBase(u) {
  u = String(u || '').trim(); if (!u) return '';
  try {
    if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
    const x = new URL(u), m = x.pathname.match(/\/project\/([a-z0-9]{15,25})/i);
    if (/(^|\.)supabase\.com$/i.test(x.hostname) && m) return 'https://' + m[1] + '.supabase.co';
    return x.origin;
  } catch (e) { return u.replace(/\/+$/, ''); }
}

/* =====================================================================
   CONFIG
   ===================================================================== */
const CAMPUS = {
  center: [34.8180, 113.5300],
  bbox: [34.8070, 113.5130, 34.8295, 113.5440]      // south, west, north, east
};
// Mirrors are raced in parallel; the first good answer wins. Several of them work from mainland China.
const OVERPASS = [
  'https://overpass.nchc.org.tw/api/interpreter',
  'https://overpass.openstreetmap.fr/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.osm.jp/api/interpreter'
];
const TILE_OSM = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
/* Map tile servers, tried in order. Add your own keyed provider (Tianditu, MapTiler, Stadia…) via tileUrl in config.js: it is used first. */
const TILES = [];
(function () {
  const C = window.MM_CONFIG || {};
  if (C.tileUrl) TILES.push({ u: C.tileUrl, a: C.tileAttribution || '© map data providers', s: C.tileSubdomains || 'abc' });
  TILES.push({ u: TILE_OSM, a: '© OpenStreetMap contributors', s: 'abc' });
  TILES.push({ u: 'https://tile.openstreetmap.de/{z}/{x}/{y}.png', a: '© OpenStreetMap contributors', s: 'abc' });
  TILES.push({ u: 'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png', a: '© OpenStreetMap contributors, HOT', s: 'abc' });
})();
let tileIdx = 0;
const TILE_SAT = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const DATA_TTL = 7 * 864e5;
const APP_VERSION = '4.0';

const CATS = {
  gate:     { c: '#2F80ED', i: 'fa-door-open',      en: 'Gates',        zh: '校门',     kw: ['gate', 'gates', 'entrance', '门', '入口'] },
  library:  { c: '#7C3AED', i: 'fa-book',           en: 'Library',      zh: '图书馆',   kw: ['library', 'libraries', '图书'] },
  food:     { c: '#F59E0B', i: 'fa-utensils',       en: 'Food',         zh: '餐饮',     kw: ['food', 'canteen', 'canteens', 'cafeteria', 'restaurant', 'cafe', 'coffee', 'eat', 'lunch', 'dinner', 'halal', '食堂', '餐', '吃', '咖啡', '清真'] },
  parking:  { c: '#64748B', i: 'fa-square-parking', en: 'Parking',      zh: '停车',     kw: ['parking', 'car park', '停车'] },
  bus:      { c: '#0EA5E9', i: 'fa-train-subway',   en: 'Transit',      zh: '公交地铁', kw: ['bus', 'metro', 'subway', 'station', 'transit', '公交', '车站', '地铁', '站'] },
  sports:   { c: '#10B981', i: 'fa-futbol',         en: 'Sports',       zh: '运动',     kw: ['sport', 'sports', 'gym', 'pitch', 'field', 'stadium', 'court', '体育', '操场', '球场', '运动'] },
  photo:    { c: '#EC4899', i: 'fa-camera',         en: 'Photo Spots',  zh: '拍照打卡', kw: ['photo', 'photos', 'park', 'garden', 'lake', 'scenic', 'viewpoint', 'landmark', '景', '公园', '湖', '拍照', '打卡', '地标'] },
  medical:  { c: '#EF4444', i: 'fa-hospital',       en: 'Medical',      zh: '医疗',     kw: ['medical', 'hospital', 'clinic', 'pharmacy', 'doctor', '医', '药'] },
  building: { c: '#1F3A5F', i: 'fa-building',       en: 'Buildings',    zh: '楼宇',     kw: ['building', 'hall', '楼', '馆', '学院'] }
};
const CAT_ALIAS = { canteen: 'food', restaurant: 'food', cafe: 'food', stadium: 'sports', sport: 'sports', metro: 'bus', subway: 'bus', transit: 'bus', landmark: 'photo', hospital: 'medical' };

/* =====================================================================
   LANGUAGE
   ===================================================================== */
let lang = (navigator.language || 'en').toLowerCase().startsWith('zh') ? 'zh' : 'en';
const T = k => (I18N[lang][k] ?? I18N.en[k] ?? k);
const TL = (k, L) => (I18N[L][k] ?? I18N.en[k] ?? k);
const fmt = (s, o) => s.replace(/\{(\w+)\}/g, (_, k) => (o[k] ?? ''));

/* =====================================================================
   STATE
   ===================================================================== */
let PLACES = [], OWN = [], OSMP = [], CUSTOM = [], HIDDEN = [], OVER = {};
let map = null, markerLayer = null, routeLayer = null, altLayer = null, userMarker = null, userCircle = null, startMarker = null, destMarker = null, baseLayer = null;
let satOn = false, filter = 'all', dark = false, gcjFix = false, tileFallbackUsed = false;  // tileFallbackUsed kept for old code paths
let SELECTED = null, SELECTED_ROOM = null, pendingRoom = null, USER = null, START = null, pickStart = false;
let dataState = 'idle', dataTime = null, dataLive = false, dataLog = [], FAVS = [];
let UI_MODE = 'browse', CUR = 'splash';        // browse | preview | nav | arrived | edit
const markers = {};

/* =====================================================================
   HELPERS
   ===================================================================== */
const $ = id => document.getElementById(id);
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} }
};
const jget = (k, d) => { try { const v = JSON.parse(store.get(k, 'null')); return v == null ? d : v; } catch (e) { return d; } };
const catLabel = (c, L) => (CATS[c] || CATS.building)[L || lang];
function hav(a, b) {
  const r = Math.PI / 180, dLat = (b[0] - a[0]) * r, dLon = (b[1] - a[1]) * r;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(x));
}
const fmtDist = m => m < 1000 ? Math.round(m) + ' ' + T('m') : (m / 1000).toFixed(1) + ' ' + T('km');
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function refPoint() { return USER ? [USER.lat, USER.lon] : null; }
let toastTimer;
function toast(msg, ms) {
  const t = $('toast'); t.textContent = msg; t.style.display = 'block';
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.style.display = 'none'; t.onclick = null; t.style.cursor = ''; }, ms || 2800);
}

/* ---------- bilingual names ---------- */
const zhName = p => p.zh || (CJK.test(p.name || '') ? p.name : '');
const enName = p => p.en || (zhName(p) ? zhToEn(zhName(p)) : (p.name || ''));
function nm(p, L) { L = L || lang; return (L === 'zh' ? (zhName(p) || p.en || p.name) : enName(p)) || catLabel(p.cat, L); }
function nm2(p) { const o = lang === 'zh' ? enName(p) : zhName(p); return o && o !== nm(p) ? o : ''; }
function dl(p, L) { const n = nm(p, L); return (p.code && p.cat === 'building' && /^[A-Za-z]?\d{1,3}[A-Za-z]?$/.test(p.code)) ? p.code + ' · ' + n : n; }
const roadName = n => (!n ? '' : (lang === 'zh' ? n : zhToEn(n)));
function roomText(r) { return fmt(T('room'), { r: r.room, f: r.floor }); }
const norm = s => (s || '').toString().toLowerCase().trim();
function indexPlace(p) {
  p._q = [p.zh, p.en, p.name, enName(p), p.code, ...(p.aliases || []), pinyinSearchKeys(zhName(p))].filter(Boolean).join('|').toLowerCase();
  p._exact = [p.zh, p.en, enName(p), p.code, ...(p.aliases || [])].filter(Boolean).map(norm);
}

/* GCJ-02 -> WGS-84 (China coordinate offset): used by the optional GPS fix and for crs=gcj02 rows */
const GCJ = (() => {
  const a = 6378245.0, ee = 0.00669342162296594323;
  const tLat = (x, y) => { let r = -100 + 2 * x + 3 * y + .2 * y * y + .1 * x * y + .2 * Math.sqrt(Math.abs(x)); r += (20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2 / 3; r += (20 * Math.sin(y * Math.PI) + 40 * Math.sin(y / 3 * Math.PI)) * 2 / 3; r += (160 * Math.sin(y / 12 * Math.PI) + 320 * Math.sin(y * Math.PI / 30)) * 2 / 3; return r; };
  const tLon = (x, y) => { let r = 300 + x + 2 * y + .1 * x * x + .1 * x * y + .1 * Math.sqrt(Math.abs(x)); r += (20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2 / 3; r += (20 * Math.sin(x * Math.PI) + 40 * Math.sin(x / 3 * Math.PI)) * 2 / 3; r += (150 * Math.sin(x / 12 * Math.PI) + 300 * Math.sin(x / 30 * Math.PI)) * 2 / 3; return r; };
  function delta(lat, lon) {
    const dLat = tLat(lon - 105, lat - 35), dLon = tLon(lon - 105, lat - 35);
    const rad = lat / 180 * Math.PI; let m = Math.sin(rad); m = 1 - ee * m * m; const sq = Math.sqrt(m);
    return [(dLat * 180) / ((a * (1 - ee)) / (m * sq) * Math.PI), (dLon * 180) / (a / sq * Math.cos(rad) * Math.PI)];
  }
  function bdToGcj(lat, lon) {                      // Baidu BD-09 -> GCJ-02
    const X = Math.PI * 3000 / 180, x = lon - 0.0065, y = lat - 0.006, z = Math.sqrt(x * x + y * y) - 0.00002 * Math.sin(y * X), th = Math.atan2(y, x) - 0.000003 * Math.cos(x * X);
    return [z * Math.sin(th), z * Math.cos(th)];
  }
  return { bdToGcj, toWgs(lat, lon) { const d = delta(lat, lon); return [lat - d[0], lon - d[1]]; } };
})();

/* =====================================================================
   SCREENS, OVERLAYS, MAP-UI MODES
   ===================================================================== */
function showScreen(id) {
  if (id === 'map' && UI_MODE === 'nav') { /* stay in navigation */ }
  CUR = id;
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = $(id);
  el.classList.add('active');
  el.classList.remove('fade-in'); void el.offsetWidth; el.classList.add('fade-in');
  el.scrollTop = 0;
  document.querySelectorAll('[data-nav]').forEach(b => b.classList.toggle('active', b.dataset.nav === id));
  if (id === 'map') { ensureMap(); setTimeout(() => map && map.invalidateSize(), 60); }
  else if (UI_MODE !== 'nav' && typeof stopGPSIfIdle === 'function') stopGPSIfIdle();
  if (id === 'steps') renderSteps();
  if (id === 'download') updateOfflineCards();
  syncMapUI();
}
function setUIMode(m) { UI_MODE = m; syncMapUI(); }
function syncMapUI() {
  const m = UI_MODE, onMap = CUR === 'map', b = document.body;
  b.classList.toggle('routing', m === 'preview');
  b.classList.toggle('navigating', m === 'nav' || m === 'arrived');
  b.classList.toggle('editing', m === 'edit');
  const show = (id, v) => { const e = $(id); if (e) e.style.display = v ? 'block' : 'none'; };
  show('placeCard', m === 'browse' && !!SELECTED);
  show('routePanel', m === 'preview');
  show('navTop', m === 'nav');
  show('navBottom', m === 'nav');
  show('arrivedCard', m === 'arrived');
  show('editBar', m === 'edit');
  const hideFab = CUR === 'splash' || (onMap && (m !== 'browse' || !!SELECTED));
  $('botFab').classList.toggle('show', CUR !== 'splash');
  $('botFab').style.visibility = hideFab ? 'hidden' : '';
  $('botFab').classList.toggle('onmap', onMap);
  $('bottomNav').style.display = (CUR === 'splash' || (onMap && (m === 'nav' || m === 'arrived'))) ? 'none' : 'flex';
  if (map && onMap) setTimeout(() => map.invalidateSize(), 80);
}
let lastFocus = null;
function openOverlay(id) {
  lastFocus = document.activeElement;
  if (id === 'external') updateExternalLinks();
  $(id).classList.add('open');
  if (id === 'chat') setTimeout(() => $('chatInput').focus(), 200);
}
function closeOverlay(id) { $(id).classList.remove('open'); if (lastFocus && lastFocus.focus) { try { lastFocus.focus(); } catch (e) {} } }
document.addEventListener('keydown', e => { if (e.key === 'Escape') { if (typeof stopQR === 'function') stopQR(); document.querySelectorAll('.overlay.open').forEach(o => o.classList.remove('open')); } });

/* =====================================================================
   CAMPUS DATA
   ===================================================================== */
function categorize(t) {
  const name = t.name || '';
  if (t.amenity === 'library') return 'library';
  if (['restaurant', 'cafe', 'canteen', 'fast_food', 'food_court'].includes(t.amenity)) return 'food';
  if (t.amenity === 'parking') return 'parking';
  if (t.highway === 'bus_stop' || t.amenity === 'bus_station' || t.railway === 'subway_entrance' || t.station === 'subway') return 'bus';
  if (['hospital', 'clinic', 'pharmacy', 'doctors'].includes(t.amenity)) return 'medical';
  if (t.barrier === 'gate' || t.barrier === 'lift_gate' || t.entrance || /(南|北|东|西|正|校)门|\bgate\b/i.test(name)) return (name || t.entrance) ? 'gate' : null;
  if (['pitch', 'stadium', 'sports_centre', 'track', 'fitness_centre'].includes(t.leisure)) return 'sports';
  if (name && (['park', 'garden'].includes(t.leisure) || ['attraction', 'viewpoint'].includes(t.tourism) || ['peak', 'water'].includes(t.natural))) return 'photo';
  if (t.building && name) return 'building';
  return null;
}
function elementToPlace(el) {
  const t = el.tags || {};
  const lat = el.lat ?? el.center?.lat, lon = el.lon ?? el.center?.lon;
  if (lat == null || lon == null) return null;
  const cat = categorize(t); if (!cat) return null;
  return {
    id: el.type + el.id, cat, lat, lon,
    name: t.name || '', zh: t['name:zh'] || t['name:zh-Hans'] || (CJK.test(t.name || '') ? t.name : ''),
    en: t['name:en'] || t.int_name || (!CJK.test(t.name || '') ? (t.name || '') : '')
  };
}
function parseElements(list) {
  const seen = new Set(), items = [];
  for (const el of list || []) { const p = elementToPlace(el); if (p && !seen.has(p.id)) { seen.add(p.id); items.push(p); } }
  return items;
}
async function postOverpass(url, query, ms, ctl) {
  const to = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { method: 'POST', body: 'data=' + encodeURIComponent(query), headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: ctl.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json(); return j.elements || [];
  } catch (e) { throw new Error(e.name === 'AbortError' ? 'timeout' : (e.message || 'network')); }
  finally { clearTimeout(to); }
}
async function fetchOverpassRace() {
  const [s, w, n, e] = CAMPUS.bbox, B = `${s},${w},${n},${e}`;
  const q = `[out:json][timeout:25];(nwr["amenity"~"^(library|restaurant|cafe|canteen|fast_food|food_court|bus_station|hospital|clinic|pharmacy|doctors|parking)$"](${B});` +
    `nwr["highway"="bus_stop"](${B});nwr["railway"="subway_entrance"](${B});` +
    `nwr["barrier"~"^(gate|lift_gate)$"]["name"](${B});nwr["entrance"]["name"](${B});` +
    `nwr["leisure"~"^(pitch|stadium|sports_centre|track|fitness_centre|park|garden)$"](${B});` +
    `nwr["tourism"~"^(attraction|viewpoint)$"](${B});nwr["natural"~"^(peak|water)$"]["name"](${B});` +
    `nwr["building"]["name"](${B}););out center tags;`;
  const ctls = OVERPASS.map(() => new AbortController());
  dataLog = [];
  return await new Promise((resolve, reject) => {
    let left = OVERPASS.length, won = false;
    OVERPASS.forEach((url, i) => {
      const host = new URL(url).hostname;
      postOverpass(url, q, 14000, ctls[i]).then(els => {
        const items = parseElements(els);
        if (!items.length) throw new Error('no data');
        if (!won) { won = true; ctls.forEach((c, j) => j !== i && c.abort()); dataLog.push(host + ': OK (' + items.length + ')'); resolve(items); }
      }).catch(err => {
        if (!won) dataLog.push(host + ': ' + err.message);
        if (--left === 0 && !won) reject(new Error('all mirrors failed'));
      });
    });
  });
}

function parseCSV(text) {
  text = text.replace(/^﻿/, '');
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); cur = ''; if (row.some(x => x.trim())) rows.push(row); row = []; }
    else cur += c;
  }
  if (cur || row.length) { row.push(cur); if (row.some(x => x.trim())) rows.push(row); }
  if (rows.length < 2) return [];
  const head = rows[0].map(h => h.trim().toLowerCase());
  return rows.slice(1).filter(r => (r[0] || '').trim().toLowerCase() !== head[0]).map(r => Object.fromEntries(head.map((h, i) => [h, (r[i] || '').trim()])));
}
function normOwn(list) {
  const out = [], ids = new Set();
  (Array.isArray(list) ? list : []).forEach((r, i) => {
    let lat = parseFloat(r.lat ?? r.latitude), lon = parseFloat(r.lon ?? r.lng ?? r.longitude);
    if (!isFinite(lat) || !isFinite(lon)) return;
    const crs = String(r.crs || '').toLowerCase();
    if (crs === 'bd09') [lat, lon] = GCJ.bdToGcj(lat, lon), [lat, lon] = GCJ.toWgs(lat, lon);
    else if (crs === 'gcj02') [lat, lon] = GCJ.toWgs(lat, lon);
    let cat = String(r.category || r.cat || 'building').trim().toLowerCase(); cat = CAT_ALIAS[cat] || cat; if (!CATS[cat]) cat = 'building';
    const al = Array.isArray(r.aliases) ? r.aliases : String(r.aliases || '').split(/[;|]/);
    const zh = String(r.zh || '').trim(), en = String(r.en || '').trim();
    const id = String(r.id || '').trim() || ('own' + i); if (ids.has(id)) return;
    ids.add(id);
    out.push({ id, own: true, cat, lat, lon, code: String(r.code ?? '').trim(), zh, en, name: zh || en, approx: String(r.conf || '').toLowerCase() !== 'high', aliases: al.map(a => String(a).trim()).filter(Boolean),
      photos: (Array.isArray(r.photos) ? r.photos : String(r.photos || '').split(';')).map(x => String(x).trim()).filter(Boolean), dz: String(r.dz || '').trim(), de: String(r.de || '').trim() });
  });
  return out;
}
async function loadOwn() {
  let items = [];
  const C = window.MM_CONFIG || {};
  if (C.supabaseUrl && C.anonKey) {                          // live database (admin dashboard writes here)
    try {
      const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 8000);
      const r = await fetch(mmSupabaseBase(C.supabaseUrl) + '/rest/v1/places?select=*&order=id', { headers: C.anonKey.startsWith('eyJ') ? { apikey: C.anonKey, Authorization: 'Bearer ' + C.anonKey } : { apikey: C.anonKey }, signal: ctl.signal });
      clearTimeout(tm); if (r.ok) { const rows = await r.json(); if (Array.isArray(rows) && rows.length) items = normOwn(rows); }
    } catch (e) {}
  }
  if (!items.length) try { const r = await fetch('data/places.json?t=' + Date.now(), { cache: 'no-cache' }); if (r.ok) { const j = await r.json(); items = normOwn(j.places || j); } } catch (e) {}
  if (!items.length) try { const r = await fetch('campus-places.csv', { cache: 'no-cache' }); if (r.ok) items = normOwn(parseCSV(await r.text())); } catch (e) {}
  if (!items.length) { try { const r = await fetch('campus-places.json', { cache: 'no-cache' }); if (r.ok) items = normOwn(await r.json()); } catch (e) {} }
  if (items.length) store.set('mm_own', JSON.stringify(items)); else items = jget('mm_own', []);
  OWN = items;
}
const sameName = (p, o) => { const a = p._exact || []; return [o.zh, o.en, o.name].map(norm).filter(Boolean).some(n => a.includes(n)); };
function mergePlaces(own, osm) {
  own.forEach(indexPlace);
  const used = new Set();
  const snapped = own.map(p => {
    if (!p.approx) return p;
    const m = osm.find(o => o.cat === p.cat && !used.has(o.id) && sameName(p, o) && hav([p.lat, p.lon], [o.lat, o.lon]) < 800);
    if (!m) return p;
    used.add(m.id); return { ...p, lat: m.lat, lon: m.lon, approx: false, snapped: true };
  });
  const keep = osm.filter(o => !used.has(o.id) && !snapped.some(p => p.cat === o.cat && (hav([p.lat, p.lon], [o.lat, o.lon]) < (p.approx ? 120 : 30) || (o.name && sameName(p, o)))));
  return [...snapped, ...keep];
}
function rebuildPlaces() {
  let list = mergePlaces([...OWN, ...CUSTOM], OSMP).filter(p => !HIDDEN.includes(p.id));
  list = list.map(p => { const o = OVER[p.id]; return o ? { ...p, ...o, name: o.zh || o.en || p.name, approx: o.lat != null ? false : p.approx, edited: true } : p; });
  list.forEach(indexPlace);
  PLACES = list;
  if (SELECTED) SELECTED = PLACES.find(p => p.id === SELECTED.id) || null;
}
async function loadPlaces(force) {
  await loadOwn();
  CUSTOM = jget('mm_custom', []); HIDDEN = jget('mm_hidden', []); OVER = jget('mm_over', {});
  const cached = jget('mm_places', null);
  if (cached && cached.items) { OSMP = cached.items; dataTime = cached.t; dataLive = OSMP.length > 0; }
  rebuildPlaces();
  dataState = PLACES.length ? 'ok' : 'loading'; renderDynamic();
  if (cached && !force && Date.now() - cached.t < DATA_TTL) return;
  if (!navigator.onLine) { if (force) toast(T('offlineBadge')); return; }
  try {
    const items = await fetchOverpassRace();
    OSMP = items; dataTime = Date.now(); dataLive = true;
    store.set('mm_places', JSON.stringify({ t: dataTime, items }));
    if (force) toast(T('refreshed'));
  } catch (e) { if (force) toast(T('refreshNone'), 3500); }       // never show raw server errors
  rebuildPlaces();
  dataState = PLACES.length ? 'ok' : 'error';
  renderDynamic();
}

/* =====================================================================
   FAVOURITES + HOME + SEARCH
   ===================================================================== */
function loadFavs() { FAVS = jget('mm_favs', []); if (!Array.isArray(FAVS)) FAVS = []; }
function toggleFav() {
  if (!SELECTED) return;
  const i = FAVS.indexOf(SELECTED.id);
  if (i >= 0) FAVS.splice(i, 1); else FAVS.push(SELECTED.id);
  store.set('mm_favs', JSON.stringify(FAVS));
  renderCard(); renderHome();
}
const dataSourceText = () => dataLive ? T('dataLive') : T('dataBuiltin');
function renderHome() {
  const st = $('homeStatus'), box = $('homePlaces');
  const sb = $('savedBlock'), sl = $('savedList'); sl.innerHTML = '';
  const favPlaces = FAVS.map(id => PLACES.find(p => p.id === id)).filter(Boolean);
  sb.style.display = favPlaces.length ? 'block' : 'none';
  favPlaces.forEach(p => sl.appendChild(placeRow(p, () => pickPlace(p))));
  if (dataState === 'loading' && !PLACES.length) { st.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i>' + esc(T('loadingPlaces')); box.innerHTML = ''; return; }
  if (dataState === 'error') { st.innerHTML = esc(T('loadFailNone')) + ' <button class="text-skyBlue font-semibold" onclick="loadPlaces(true)">' + esc(T('retry')) + '</button>'; box.innerHTML = ''; return; }
  st.textContent = fmt(T('placesLoaded'), { n: PLACES.length }) + ' · ' + dataSourceText();
  box.innerHTML = '';
  Object.keys(CATS).filter(c => c !== 'building').forEach(c => {
    const n = PLACES.filter(p => p.cat === c).length; if (!n) return;
    const b = document.createElement('button');
    b.className = 'white-card rounded-2xl p-3 w-full flex items-center gap-3 text-left';
    b.onclick = () => goCategory(c);
    b.innerHTML = `<div class="w-10 h-10 rounded-full flex items-center justify-center text-white" style="background:${CATS[c].c}"><i class="fa-solid ${CATS[c].i}"></i></div>
      <div class="flex-1"><p class="font-semibold text-navySoft text-sm">${esc(catLabel(c))}</p></div>
      <span class="text-xs text-slate-500">${n}</span><i class="fa-solid fa-chevron-right text-slate-400 text-xs"></i>`;
    box.appendChild(b);
  });
}
function kwHit(q, kw) {
  if (CJK.test(kw)) return q.includes(kw);
  return new RegExp('(^|[^a-z])' + kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '($|[^a-z])').test(q);
}
function catsForQuery(q) { return Object.keys(CATS).filter(c => CATS[c].kw.some(k => kwHit(q, k)) || norm(CATS[c].en) === q || CATS[c].zh === q); }
function nameMatch(p, q) { const qs = q.replace(/\s+/g, ''); return (p._q || '').includes(q) || (qs && (p._q || '').includes(qs)); }
function searchPlaces(q) {
  q = norm(q); if (!q) return [];
  const byExact = PLACES.filter(p => (p._exact || []).includes(q));
  const byName = PLACES.filter(p => !byExact.includes(p) && nameMatch(p, q));
  const hits = catsForQuery(q);
  // a query that IS a category word ("food", "食堂", "gates") lists the whole category;
  // a query that merely contains one ("图书馆", "17号楼") only does so when nothing matched by name
  const pure = hits.filter(c => CATS[c].kw.includes(q) || norm(CATS[c].en) === q || CATS[c].zh === q);
  const use = pure.length ? pure : (byExact.length + byName.length ? [] : hits);
  const byCat = PLACES.filter(p => use.includes(p.cat) && !byExact.includes(p) && !byName.includes(p));
  const ref = refPoint(); if (ref) byCat.sort((a, b) => hav(ref, [a.lat, a.lon]) - hav(ref, [b.lat, b.lon]));
  return [...byExact, ...byName, ...byCat];
}
function placeRow(p, onPick, extra) {
  const b = document.createElement('button');
  b.className = 'white-card rounded-2xl p-3 w-full flex items-center gap-3 text-left';
  const ref = refPoint(); const d = ref ? ' · ' + fmtDist(hav(ref, [p.lat, p.lon])) : '';
  const o = nm2(p);
  b.innerHTML = `<div class="w-10 h-10 rounded-full flex items-center justify-center text-white shrink-0" style="background:${CATS[p.cat].c}"><i class="fa-solid ${CATS[p.cat].i}"></i></div>
    <div class="flex-1 min-w-0"><p class="font-semibold text-navySoft text-sm truncate">${esc(dl(p))}</p><p class="text-xs text-slate-500 truncate">${esc(o ? o + ' · ' : '')}${esc(catLabel(p.cat))}${esc(d)}${extra ? ' · ' + esc(extra) : ''}</p></div>`;
  b.onclick = onPick; return b;
}
function parseRoom(q) {
  const m = q.trim().match(/^(.+?)[\s\-_·#]*(?:room\s*|rm\.?\s*)?(\d{3,4})\s*(?:室|教室|房间|房)?$/i);
  if (!m) return null;
  const base = norm(m[1]).replace(/^(building|bldg\.?|block)\s*/, '').replace(/\s*(号楼|栋|楼)$/, '').trim(), room = m[2]; if (!base) return null;
  const b = PLACES.find(p => norm(p.code) === base || (p.aliases || []).some(a => norm(a) === base))
         || (base.length >= 2 ? PLACES.find(p => p.cat === 'building' && nameMatch(p, base)) : null);
  if (!b) return null;
  return { b, room, floor: room.length === 3 ? room[0] : room.slice(0, 2) };
}
function pickPlace(p, room) { closeOverlay('results'); showScreen('map'); setTimeout(() => { pendingRoom = room || null; selectPlace(p.id, true); }, 120); }
function doSearch(q) {
  q = (q || '').trim(); if (!q) return;
  if (!PLACES.length) { toast(dataState === 'loading' ? T('loadingPlaces') : T('loadFailNone')); return; }
  const list = $('resultsList'); list.innerHTML = '';
  const rm = parseRoom(q);
  if (rm) list.appendChild(placeRow(rm.b, () => pickPlace(rm.b, rm), roomText(rm)));
  const res = searchPlaces(q).filter(p => !rm || p.id !== rm.b.id).slice(0, 40);
  if (!res.length && !rm) list.innerHTML = `<p class="text-sm text-slate-500 py-4 text-center">${esc(T('noResults'))}</p>`;
  res.forEach(p => list.appendChild(placeRow(p, () => pickPlace(p))));
  openOverlay('results');
}

/* =====================================================================
   MAP
   ===================================================================== */
function makeBase(kind) {
  const opts = { maxZoom: 19, crossOrigin: true };
  if (kind === 'sat') return L.tileLayer(TILE_SAT, { ...opts, attribution: 'Imagery © Esri' });
  const t = TILES[tileIdx] || TILES[0];
  return L.tileLayer(t.u, { ...opts, subdomains: t.s, attribution: t.a });
}
function watchTileErrors(layer) {
  let errs = 0;
  layer.on('tileload', () => { errs = 0; });
  layer.on('tileerror', () => {
    if (++errs >= 6 && navigator.onLine && !satOn && tileIdx < TILES.length - 1) {
      errs = 0; tileIdx++; tileFallbackUsed = true; map.removeLayer(baseLayer); baseLayer = makeBase('osm').addTo(map); baseLayer.bringToBack(); watchTileErrors(baseLayer); toast(T('tilesAlt'), 4000);
    }
  });
}
function ensureMap() {
  if (map) return;
  map = L.map('liveMap', { zoomControl: false, attributionControl: true, tap: true }).setView(CAMPUS.center, 16);
  L.control.zoom({ position: 'bottomleft' }).addTo(map);
  baseLayer = makeBase('osm').addTo(map); watchTileErrors(baseLayer);
  altLayer = L.layerGroup().addTo(map);
  routeLayer = L.layerGroup().addTo(map);
  markerLayer = L.layerGroup().addTo(map);
  let rt; const rf = () => { clearTimeout(rt); rt = setTimeout(refreshMarkers, 120); };
  map.on('zoomend moveend', rf);
  map.on('contextmenu', e => {
    const lat = e.latlng.lat.toFixed(6), lon = e.latlng.lng.toFixed(6), row = `,,,,building,${lat},${lon},wgs84,high,`;
    L.popup().setLatLng(e.latlng).setContent(`<div style="font-size:12px"><b>${lat}, ${lon}</b><br><button id="copyRow" style="margin-top:6px;padding:4px 10px;border-radius:999px;background:#2F80ED;color:#fff;font-weight:600">${esc(T('copyRow'))}</button></div>`).openOn(map);
    setTimeout(() => { const b = $('copyRow'); if (b) b.onclick = () => { (navigator.clipboard ? navigator.clipboard.writeText(row) : Promise.reject()).then(() => toast(T('copiedShort')), () => toast(row)); }; }, 0);
  });
  map.on('click', e => {
    if (pickStart && typeof onStartPicked === 'function') { pickStart = false; onStartPicked(e.latlng); return; }
    if (typeof editorMapClick === 'function' && editorMapClick(e)) return;
  });
  renderChips(); refreshMarkers();
  if (typeof onMapReady === 'function') onMapReady();
  if (USER) placeUserMarker();
}
function toggleSat() {
  if (!map) return;
  satOn = !satOn; map.removeLayer(baseLayer);
  baseLayer = makeBase(satOn ? 'sat' : 'osm').addTo(map); baseLayer.bringToBack();
  if (!satOn) watchTileErrors(baseLayer);
  $('liveMap').classList.toggle('sat', satOn);
}
function recenter() { if (map) map.flyTo(CAMPUS.center, 16); }
function pinIcon(p, sel) {
  return L.divIcon({ className: '', iconSize: sel ? [38, 38] : [30, 30], iconAnchor: sel ? [19, 38] : [15, 30],
    html: `<div class="pin${sel ? ' sel' : ''}${p.approx ? ' approx' : ''}" style="background:${CATS[p.cat].c}"><i class="fa-solid ${CATS[p.cat].i}"></i></div>` });
}
function refreshMarkers() {
  if (!map) return;
  markerLayer.clearLayers(); Object.keys(markers).forEach(k => delete markers[k]);
  const editing = UI_MODE === 'edit', navigating = UI_MODE === 'nav' || UI_MODE === 'arrived';
  const z = map.getZoom(), showB = z >= 17, bounds = map.getBounds().pad(0.3);
  let list = PLACES.filter(p => (filter === 'all' ? (editing || p.cat !== 'building' || showB || p.own) : p.cat === filter) && (bounds.contains([p.lat, p.lon]) || (SELECTED && SELECTED.id === p.id)));
  if (UI_MODE === 'preview' || navigating) list = list.filter(p => SELECTED && p.id === SELECTED.id);   // keep the route clean
  list.forEach(p => {
    const sel = SELECTED && SELECTED.id === p.id;
    const m = L.marker([p.lat, p.lon], { icon: pinIcon(p, sel), title: dl(p), alt: dl(p), keyboard: true, draggable: editing });
    if (z >= 17 || editing) m.bindTooltip(dl(p), { permanent: true, direction: 'bottom', offset: [0, 2], className: 'pin-label' });
    m.on('click', () => { if (!navigating) selectPlace(p.id, false); });
    if (editing && typeof editorDragEnd === 'function') m.on('dragend', ev => editorDragEnd(p, ev.target.getLatLng()));
    m.addTo(markerLayer); markers[p.id] = m;
  });
}
function renderChips() {
  const row = $('chipRow'); row.innerHTML = '';
  const mk = (key, label) => { const b = document.createElement('button'); b.className = 'chip' + (filter === key ? ' on' : ''); b.textContent = label; b.onclick = () => setFilter(key); row.appendChild(b); };
  mk('all', T('all'));
  Object.keys(CATS).forEach(c => { if (PLACES.some(p => p.cat === c)) mk(c, catLabel(c)); });
}
function setFilter(f) {
  filter = f; renderChips(); refreshMarkers();
  if (f !== 'all' && map) {
    const pts = PLACES.filter(p => p.cat === f).map(p => [p.lat, p.lon]);
    if (pts.length) map.fitBounds(L.latLngBounds(pts).pad(0.25), { maxZoom: 18 });
  }
}
function goCategory(c) {
  if (!PLACES.length) toast(dataState === 'loading' ? T('loadingPlaces') : T('loadFailNone'));
  showScreen('map'); setTimeout(() => { setFilter(c); if (PLACES.length && !PLACES.some(p => p.cat === c)) toast(T('catEmpty'), 4000); }, 150);
}
function selectPlace(id, fly) {
  const p = PLACES.find(x => x.id === id); if (!p) return;
  if (UI_MODE === 'preview' && typeof closeRoute === 'function') closeRoute(true);
  if (UI_MODE === 'edit') { SELECTED = p; refreshMarkers(); if (typeof editorSelect === 'function') editorSelect(p); return; }
  SELECTED = p; SELECTED_ROOM = pendingRoom; pendingRoom = null; ensureMap();
  if (UI_MODE !== 'browse') UI_MODE = 'browse';
  refreshMarkers();
  if (fly) map.flyTo([p.lat, p.lon], Math.max(map.getZoom(), 17), { duration: .6 });
  renderCard(); syncMapUI();
  try { history.replaceState(null, '', '#p=' + encodeURIComponent(p.id)); } catch (e) {}
}
function renderCard() {
  const p = SELECTED;
  if (!p) { syncMapUI(); return; }
  const ic = $('pcIcon'); ic.style.background = CATS[p.cat].c; ic.innerHTML = `<i class="fa-solid ${CATS[p.cat].i}"></i>`;
  $('pcName').textContent = dl(p);
  $('pcName2').textContent = nm2(p); $('pcName2').style.display = nm2(p) ? 'block' : 'none';
  const ref = refPoint();
  const sub = [catLabel(p.cat)]; if (SELECTED_ROOM) sub.unshift(roomText(SELECTED_ROOM)); if (ref) sub.push(fmt(T('away'), { d: fmtDist(hav(ref, [p.lat, p.lon])) }));
  $('pcSub').textContent = sub.join(' · ');
  $('pcApprox').style.display = p.approx ? 'inline-flex' : 'none';
  const ph = $('pcPhotos'), ds = $('pcDesc'), pics = p.photos || [];
  ph.innerHTML = ''; ph.style.display = pics.length ? 'flex' : 'none';
  pics.forEach((src, i) => { const im = document.createElement('img'); im.src = src; im.loading = 'lazy'; im.alt = dl(p); im.className = 'pc-photo'; im.onclick = () => openPhoto(p, i); im.onerror = () => im.remove(); ph.appendChild(im); });
  const desc = (lang === 'zh' ? (p.dz || p.de) : (p.de || p.dz)) || ''; ds.textContent = desc; ds.style.display = desc ? 'block' : 'none';
  const fav = FAVS.includes(p.id), fb = $('pcFav');
  fb.innerHTML = `<i class="fa-${fav ? 'solid' : 'regular'} fa-star text-sm" style="color:${fav ? '#F59E0B' : 'inherit'}"></i>`;
  fb.setAttribute('aria-label', fav ? T('favRemove') : T('favAdd'));
  syncMapUI();
}
/* photo viewer (tap a photo on the place card) */
let PH = { list: [], i: 0 };
function openPhoto(p, i) { PH = { list: p.photos || [], i: i || 0 }; showPhoto(); openOverlay('photoView'); }
function showPhoto() {
  const n = PH.list.length; if (!n) return; PH.i = (PH.i + n) % n;
  $('pvImg').src = PH.list[PH.i]; $('pvCount').textContent = n > 1 ? (PH.i + 1) + ' / ' + n : '';
  $('pvPrev').style.display = $('pvNext').style.display = n > 1 ? 'flex' : 'none';
  $('pvCap').textContent = SELECTED ? dl(SELECTED) : '';
}
function photoStep(d) { PH.i += d; showPhoto(); }
(function () {
  let x0 = null;
  document.addEventListener('touchstart', e => { if (e.target.id === 'pvImg') x0 = e.touches[0].clientX; }, { passive: true });
  document.addEventListener('touchend', e => { if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; x0 = null; if (Math.abs(dx) > 50) photoStep(dx < 0 ? 1 : -1); });
  document.addEventListener('keydown', e => { const o = document.getElementById('photoView'); if (!o || !o.classList.contains('open')) return; if (e.key === 'ArrowRight') photoStep(1); if (e.key === 'ArrowLeft') photoStep(-1); });
})();
function closeCard() { SELECTED = null; SELECTED_ROOM = null; syncMapUI(); refreshMarkers(); try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {} }

function updateExternalLinks() {
  const p = SELECTED; if (!p) return;
  const nmq = encodeURIComponent(nm(p, 'zh') || nm(p, 'en'));
  $('extAmap').href = `https://uri.amap.com/marker?position=${p.lon},${p.lat}&name=${nmq}&coordinate=wgs84&callnative=1`;
  $('extBaidu').href = `https://api.map.baidu.com/marker?location=${p.lat},${p.lon}&title=${nmq}&content=ZZU&output=html&coord_type=wgs84&src=webapp.mapminds`;
  $('extGoogle').href = `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lon}`;
}
async function sharePlace() {
  if (!SELECTED) return;
  const url = location.origin + location.pathname + '#p=' + encodeURIComponent(SELECTED.id);
  try {
    if (navigator.share) { await navigator.share({ title: 'MapMinds · ' + nm(SELECTED), text: nm(SELECTED), url }); return; }
    await navigator.clipboard.writeText(url); toast(T('copied'));
  } catch (e) { if (e && e.name !== 'AbortError') toast(url, 5000); }
}

/* user position marker (position updates come from nav.js) */
function placeUserMarker() {
  if (!map || !USER) return;
  const ll = [USER.lat, USER.lon];
  if (!userMarker) {
    userMarker = L.marker(ll, { icon: L.divIcon({ className: '', iconSize: [22, 22], iconAnchor: [11, 11], html: '<div class="me-wrap"><div class="me-dot"></div></div>' }), zIndexOffset: 1000, interactive: false }).addTo(map);
    userCircle = L.circle(ll, { radius: USER.acc, color: '#2F80ED', weight: 1, fillOpacity: .08, interactive: false }).addTo(map);
  } else { userMarker.setLatLng(ll); userCircle.setLatLng(ll).setRadius(USER.acc); }
}

/* =====================================================================
   OFFLINE (tile cache + data)
   ===================================================================== */
const lon2x = (lon, z) => Math.floor((lon + 180) / 360 * 2 ** z);
const lat2y = (lat, z) => { const r = lat * Math.PI / 180; return Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * 2 ** z); };
async function cacheTiles() {
  if (!('caches' in window)) { toast(T('needHttps')); return; }
  if (!navigator.onLine) { toast(T('offlineBadge')); return; }
  const [s, w, n, e] = CAMPUS.bbox, urls = [];
  for (let z = 14; z <= 17; z++) {
    const x0 = lon2x(w, z), x1 = lon2x(e, z), y0 = lat2y(n, z), y1 = lat2y(s, z);
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) urls.push((TILES[tileIdx] || TILES[0]).u.replace('{s}', 'a').replace('{z}', z).replace('{x}', x).replace('{y}', y));
  }
  const btn = $('tileBtn'), bar = $('tileBar'), st = $('tileStatus');
  btn.disabled = true;
  const cache = await caches.open('mm-tiles');
  let done = 0, ok = 0, idx = 0;
  async function worker() {
    while (idx < urls.length) {
      const u = urls[idx++];
      try { const r = await fetch(u, { mode: 'cors' }); if (r.ok) { await cache.put(u, r); ok++; } } catch (er) {}
      done++; const pct = Math.round(done / urls.length * 100);
      bar.style.width = pct + '%'; st.textContent = fmt(T('caching'), { n: pct });
    }
  }
  await Promise.all([worker(), worker()]);
  btn.disabled = false;
  if (ok < urls.length * 0.9) toast(T('cacheFail'), 4000);
  store.set('mm_tiles', String(ok));
  updateOfflineCards();
}
function updateOfflineCards() {
  const n = +store.get('mm_tiles', 0) || 0;
  $('tileStatus').textContent = n ? fmt(T('cachedDone'), { n }) : T('notSaved');
  $('tileBar').style.width = n ? '100%' : '0%';
  $('dataSub').textContent = PLACES.length ? fmt(T('dataSub'), { n: PLACES.length, s: dataSourceText() + (dataTime ? ' · ' + new Date(dataTime).toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-GB') : '') }) : T('notSaved');
  $('dataLog').textContent = dataLog.length ? dataLog.join('\n') : T('noDetails');
}
async function clearLocalData() {
  if (!confirm(T('confirmClear'))) return;
  ['mm_favs', 'mm_places', 'mm_own', 'mm_tiles', 'mm_fab'].forEach(k => store.del(k));
  try { await caches.delete('mm-tiles'); } catch (e) {}
  FAVS = []; OSMP = []; dataTime = null; dataLive = false;
  rebuildPlaces(); renderDynamic(); toast(T('cleared'));
}

/* =====================================================================
   IMAGE OVERVIEW VIEWER
   ===================================================================== */
let viewerWidth = 100;
function openViewer(which) {
  const src = which === 'zh' ? 'map-zh.jpg' : 'map-en.jpg';
  viewerWidth = 100;
  const img = $('viewerImg'); img.style.width = '100%'; img.src = src; img.onerror = () => toast(T('mapMissing'));
  $('viewerTitle').textContent = which === 'zh' ? T('mapZhTitle') : T('mapEnTitle');
  const a = $('viewerDl'); a.href = src; a.download = which === 'zh' ? 'ZZU-Overview-ZH.jpg' : 'ZZU-Overview-EN.jpg';
  openOverlay('viewer');
}
function zoomViewer(d) { viewerWidth = Math.min(300, Math.max(60, viewerWidth + d)); $('viewerImg').style.width = viewerWidth + '%'; }

/* =====================================================================
   THEME + LANGUAGE + CONNECTIVITY + INSTALL
   ===================================================================== */
function updateThemeLabel() {
  $('themeLabel').textContent = dark ? T('darkMode') : T('lightMode');
  $('themeIcon').className = 'fa-solid ' + (dark ? 'fa-moon' : 'fa-sun') + ' text-zzu';
  $('themeToggle').classList.toggle('on', dark); $('themeToggle').setAttribute('aria-checked', dark);
  const m = document.querySelector('meta[name=theme-color]'); if (m) m.content = dark ? '#0B1626' : '#2F80ED';
}
function toggleTheme() { dark = !dark; document.body.classList.toggle('dark', dark); updateThemeLabel(); store.set('mm_dark', dark ? '1' : '0'); }
function toggleGcj() { gcjFix = !gcjFix; store.set('mm_gcj', gcjFix ? '1' : '0'); $('gcjToggle').classList.toggle('on', gcjFix); $('gcjToggle').setAttribute('aria-checked', gcjFix); }
function renderDynamic() {
  renderHome(); renderChips(); if (SELECTED) renderCard();
  if (typeof renderSteps === 'function') renderSteps();
  if (typeof renderNavLang === 'function') renderNavLang();
  updateOfflineCards();
  if (map) refreshMarkers();
}
function applyLang() {
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
  document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = T(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-ph]').forEach(el => { el.placeholder = T(el.dataset.i18nPh); });
  document.querySelectorAll('[data-i18n-aria]').forEach(el => { el.setAttribute('aria-label', T(el.dataset.i18nAria)); });
  document.querySelectorAll('.langBtn').forEach(b => { const on = b.dataset.l === lang; b.style.background = on ? 'linear-gradient(135deg,#7CC4FF,#2F80ED)' : 'transparent'; b.style.color = on ? '#fff' : ''; b.setAttribute('aria-pressed', on); });
  updateThemeLabel(); renderBotChips(); renderDynamic();
  const log = $('chatLog');
  if (log.children.length <= 1) { log.innerHTML = ''; addMsg(T('botHello'), 'bot'); }
  store.set('mm_lang', lang);
}
function setLang(l) { lang = l; applyLang(); }
function updateOnline() { $('offlinePill').style.display = navigator.onLine ? 'none' : 'block'; }
window.addEventListener('online', () => { updateOnline(); if (!dataLive) loadPlaces(false); }); window.addEventListener('offline', updateOnline);

let deferredInstall = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredInstall = e; $('installRow').style.display = 'flex'; });
window.addEventListener('appinstalled', () => { deferredInstall = null; $('installRow').style.display = 'none'; });
async function installApp() { if (!deferredInstall) return; deferredInstall.prompt(); try { await deferredInstall.userChoice; } catch (e) {} deferredInstall = null; $('installRow').style.display = 'none'; }

/* =====================================================================
   CAMPUS GUIDE
   ===================================================================== */
function addMsg(text, who, acts) {
  const log = $('chatLog');
  const d = document.createElement('div'); d.className = 'msg ' + who;
  const t = document.createElement('div'); t.textContent = text; d.appendChild(t);
  if (acts && acts.length) {
    const a = document.createElement('div'); a.className = 'acts';
    acts.forEach(x => { const b = document.createElement('button'); b.className = 'chip'; b.textContent = x.label; b.onclick = x.fn; a.appendChild(b); });
    d.appendChild(a);
  }
  log.appendChild(d); log.scrollTop = log.scrollHeight;
}
function renderBotChips() {
  const c = $('chips'); c.innerHTML = '';
  T('chips').forEach(txt => { const b = document.createElement('button'); b.className = 'chip'; b.textContent = txt; b.onclick = () => { $('chatInput').value = txt; sendChat(); }; c.appendChild(b); });
}
function showPlaceFromBot(p, withRoute) {
  closeOverlay('chat'); showScreen('map');
  setTimeout(() => { selectPlace(p.id, true); if (withRoute) setTimeout(() => startDirections(), 700); }, 150);
}
function botAnswer(q) {
  const low = q.toLowerCase();
  const LG = CJK.test(q) ? 'zh' : (/[a-z]/i.test(q) ? 'en' : lang);
  const S = I18N[LG];
  if (/^(hi|hello|hey|你好|您好)/i.test(low)) return { text: S.botHello };
  if (!PLACES.length) return { text: S.botNoData };
  const nearest = /nearest|nearby|closest|near me|最近|附近|离我|近的/.test(low);
  const hitCats = catsForQuery(low), catKey = hitCats[0];
  const clean = low.replace(/where is|where's|how (do i )?(get|go) to|the |nearest|closest|nearby|find|show me|在哪里|在哪|怎么去|最近的|附近的|最近|附近|[?？。！!]/g, '').trim();
  const ref = refPoint() || CAMPUS.center;
  const dist = p => hav(ref, [p.lat, p.lon]);
  const dTxt = p => refPoint() ? ' (' + fmtDist(dist(p)) + ')' : '';
  const nmL = p => nm(p, LG);
  const acts = p => [{ label: S.showOnMap, fn: () => showPlaceFromBot(p, false) }, { label: S.getThere, fn: () => showPlaceFromBot(p, true) }];
  if (nearest && catKey) {
    const list = PLACES.filter(p => p.cat === catKey).sort((a, b) => dist(a) - dist(b));
    if (list.length) { const p = list[0]; return { text: (LG === 'zh' ? `最近的${CATS[catKey].zh}是 ${nmL(p)}${dTxt(p)}。` : `The nearest ${CATS[catKey].en.toLowerCase()} is ${nmL(p)}${dTxt(p)}.`) + (refPoint() ? '' : (LG === 'zh' ? '（开启定位可获得更准确的结果）' : ' (Turn on location for a more accurate answer.)')), acts: acts(p) }; }
  }
  const hits = clean.length >= 2 ? PLACES.filter(p => nameMatch(p, clean)) : [];
  if (hits.length) {
    const p = hits.sort((a, b) => dist(a) - dist(b))[0];
    return { text: LG === 'zh' ? `找到了：${nmL(p)}（${CATS[p.cat].zh}）${dTxt(p)}。` : `Found it: ${nmL(p)} (${CATS[p.cat].en.replace(/s$/, '')})${dTxt(p)}.`, acts: acts(p) };
  }
  if (catKey) {
    const list = PLACES.filter(p => p.cat === catKey).sort((a, b) => dist(a) - dist(b));
    if (list.length) {
      const top = list.slice(0, 3).map(nmL).join(LG === 'zh' ? '、' : ', ');
      return { text: LG === 'zh' ? `共有 ${list.length} 处${CATS[catKey].zh}，例如：${top}。` : `There are ${list.length} ${CATS[catKey].en.toLowerCase()} on the map, e.g. ${top}.`, acts: [{ label: S.showAll, fn: () => { closeOverlay('chat'); goCategory(catKey); } }, { label: S.showOnMap, fn: () => showPlaceFromBot(list[0], false) }] };
    }
  }
  return { text: S.botFallback };
}
function sendChat() {
  const inp = $('chatInput'); const q = inp.value.trim(); if (!q) return;
  inp.value = ''; addMsg(q, 'user');
  const log = $('chatLog');
  const typing = document.createElement('div'); typing.className = 'msg bot typing'; typing.innerHTML = '<span></span><span></span><span></span>';
  log.appendChild(typing); log.scrollTop = log.scrollHeight;
  setTimeout(() => { typing.remove(); const a = botAnswer(q); addMsg(a.text, 'bot', a.acts); }, 450);
}

/* =====================================================================
   LOGO FALLBACK + DRAGGABLE GUIDE BUTTON
   ===================================================================== */
const FALLBACK_LOGO = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><rect width="100" height="100" fill="#fff"/><circle cx="50" cy="50" r="38" fill="none" stroke="#C9161D" stroke-width="3"/><circle cx="50" cy="50" r="30" fill="none" stroke="#1B6B45" stroke-width="2"/><polygon points="50,24 66,70 58,70 50,48 42,70 34,70" fill="#C9161D"/><path d="M26 52 Q50 36 76 40 Q58 56 30 58 Z" fill="#1B6B45"/><text x="50" y="14" text-anchor="middle" font-size="10" font-weight="700" fill="#1B6B45">N</text></svg>`;
function initFab() {
  const fab = $('botFab'), app = $('app');
  const M = 12, NAV = 84;
  let drag = false, moved = false, sx = 0, sy = 0, ox = 0, oy = 0;
  const size = () => ({ W: app.clientWidth, H: app.clientHeight, s: fab.offsetWidth || 56 });
  function place(side, yFrac) {
    const { H, s } = size();
    const y = Math.min(H - s - NAV, Math.max(8, yFrac * H));
    fab.style.bottom = 'auto'; fab.style.top = y + 'px';
    if (side === 'left') { fab.style.left = M + 'px'; fab.style.right = 'auto'; } else { fab.style.right = M + 'px'; fab.style.left = 'auto'; }
  }
  function restore() { const v = jget('mm_fab', null); if (v) place(v.side, v.y); }
  fab.addEventListener('pointerdown', e => {
    moved = false; drag = false;
    const r = fab.getBoundingClientRect();
    sx = e.clientX; sy = e.clientY; ox = e.clientX - r.left; oy = e.clientY - r.top;
    fab.setPointerCapture(e.pointerId);
  });
  fab.addEventListener('pointermove', e => {
    if (!fab.hasPointerCapture(e.pointerId)) return;
    if (!drag && Math.hypot(e.clientX - sx, e.clientY - sy) > 6) { drag = true; moved = true; fab.classList.add('dragging'); fab.style.transition = 'none'; }
    if (!drag) return;
    const a = app.getBoundingClientRect(), { W, H, s } = size();
    const x = Math.min(W - s - 4, Math.max(4, e.clientX - a.left - ox));
    const y = Math.min(H - s - NAV, Math.max(8, e.clientY - a.top - oy));
    fab.style.left = x + 'px'; fab.style.top = y + 'px'; fab.style.right = 'auto'; fab.style.bottom = 'auto';
  });
  function end(e) {
    if (fab.hasPointerCapture && fab.hasPointerCapture(e.pointerId)) fab.releasePointerCapture(e.pointerId);
    if (!drag) return;
    drag = false; fab.classList.remove('dragging');
    const { W, H, s } = size();
    const x = parseFloat(fab.style.left) || 0, y = parseFloat(fab.style.top) || 0;
    const side = (x + s / 2) < W / 2 ? 'left' : 'right';
    fab.style.transition = 'left .2s ease';
    fab.style.left = (side === 'left' ? M : W - s - M) + 'px';
    setTimeout(() => { fab.style.transition = ''; place(side, y / H); }, 220);
    store.set('mm_fab', JSON.stringify({ side, y: y / H }));
  }
  fab.addEventListener('pointerup', end);
  fab.addEventListener('pointercancel', end);
  fab.addEventListener('click', () => { if (moved) { moved = false; return; } openOverlay('chat'); });
  window.addEventListener('resize', restore);
  restore();
}

/* =====================================================================
   SERVICE WORKER + DEEP LINK + BOOT
   ===================================================================== */
function registerSW() {
  if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
  navigator.serviceWorker.register('sw.js').then(reg => {
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing; if (!nw) return;
      nw.addEventListener('statechange', () => {
        if (nw.state === 'installed' && navigator.serviceWorker.controller) {
          toast(T('updateReady'), 12000); const t = $('toast'); t.style.cursor = 'pointer';
          t.onclick = () => { t.onclick = null; nw.postMessage('SKIP_WAITING'); };
        }
      });
    });
  }).catch(() => {});
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (reloaded) return; reloaded = true; if (CUR !== 'splash' && UI_MODE !== 'nav') location.reload(); });
}
function openFromHash() {
  const m = location.hash.match(/^#p=(.+)$/); if (!m) return;
  const id = decodeURIComponent(m[1]);
  const go = () => { const p = PLACES.find(x => x.id === id); if (p) { showScreen('map'); setTimeout(() => selectPlace(p.id, true), 150); return true; } return false; };
  if (!go()) { let tries = 0; const iv = setInterval(() => { if (go() || ++tries > 20) clearInterval(iv); }, 500); }
}

const MM = {
  boot() {
    if (store.get('mm_dark', '0') === '1') { dark = true; document.body.classList.add('dark'); }
    const saved = store.get('mm_lang', null); if (saved === 'en' || saved === 'zh') lang = saved;
    gcjFix = store.get('mm_gcj', '0') === '1'; $('gcjToggle').classList.toggle('on', gcjFix); $('gcjToggle').setAttribute('aria-checked', gcjFix);
    document.querySelectorAll('.logo-circle img').forEach(img => img.addEventListener('error', () => { img.outerHTML = FALLBACK_LOGO; }));
    loadFavs();
    if (typeof navInit === 'function') navInit();
    if (typeof editorInit === 'function') editorInit();
    applyLang(); updateOnline(); initFab(); syncMapUI();
    loadPlaces(false).then(openFromHash);
    registerSW();
  }
};