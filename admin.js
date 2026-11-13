/* MapMinds admin dashboard.
   Saves places (data/places.json) and photos (photos/*.jpg) into your GitHub repo through the GitHub API,
   so the public site shows them after it redeploys. Without a token it works in "local mode" (edits stay in this browser). */
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
const CATS = {
  gate: ['Gate 校门', '#2F80ED', 'fa-door-open'], library: ['Library 图书馆', '#7C3AED', 'fa-book'], food: ['Food 餐饮', '#F59E0B', 'fa-utensils'],
  parking: ['Parking 停车', '#64748B', 'fa-square-parking'], bus: ['Transit 公交地铁', '#0EA5E9', 'fa-train-subway'], sports: ['Sports 运动', '#10B981', 'fa-futbol'],
  photo: ['Photo spot 拍照打卡', '#EC4899', 'fa-camera'], medical: ['Medical 医疗', '#EF4444', 'fa-hospital'], building: ['Building 楼宇', '#1F3A5F', 'fa-building']
};
const CAMPUS = [34.8185, 113.5330];
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };

const Admin = (() => {
  let CFG = lsGet('mm_admin_cfg', null), MODE = null;             // MODE: 'gh' | 'sb' | 'local'
  let PLACES = [], map, layer, sat, osm, satOn = false, editMarker = null, userDot = null;
  let EDIT = null;                                                   // form state
  const BLOBS = new Map();                                           // photo path -> object URL (just uploaded, site may not be redeployed yet)
  let toastT, watchId = null;

  /* ---------- helpers ---------- */
  function toast(m, ms) { const t = $('toast'); t.textContent = m; t.classList.remove('hide'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.add('hide'), ms || 3200); }
  const b64enc = s => { const b = new TextEncoder().encode(s); let bin = ''; for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(bin); };
  const b64dec = s => new TextDecoder().decode(Uint8Array.from(atob(String(s).replace(/\s/g, '')), c => c.charCodeAt(0)));
  const prefix = () => { let p = (CFG && CFG.prefix || '').trim().replace(/^\/+|\/+$/g, ''); return p ? p + '/' : ''; };
  const slug = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 24);
  const rid = () => Math.random().toString(36).slice(2, 6);
  const catOf = c => CATS[c] || CATS.building;
  const nameOf = p => p.en || p.zh || p.id;

  /* ---------- GitHub API ---------- */
  const apiBase = () => ((CFG && CFG.api) || 'https://api.github.com').trim().replace(/\/+$/, '');
  async function gh(path, opt) {
    const r = await fetch(apiBase() + '/repos/' + CFG.owner + '/' + CFG.repo + '/' + path, Object.assign({}, opt, {
      headers: Object.assign({ Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + CFG.token }, opt && opt.body ? { 'Content-Type': 'application/json' } : {})
    }));
    let j = null; try { j = await r.json(); } catch (e) {}
    if (!r.ok) { const err = new Error((j && j.message) || ('HTTP ' + r.status)); err.status = r.status; throw err; }
    return j;
  }
  async function readRemote() {
    try {
      const j = await gh('contents/' + prefix() + 'data/places.json?ref=' + encodeURIComponent(CFG.branch));
      const data = JSON.parse(b64dec(j.content)); if (!Array.isArray(data.places)) data.places = [];
      return { data, sha: j.sha };
    } catch (e) { if (e.status === 404) return { data: { version: 1, places: [] }, sha: null }; throw e; }
  }
  async function putFile(path, b64, sha, msg) {
    const body = { message: msg, content: b64, branch: CFG.branch }; if (sha) body.sha = sha;
    return gh('contents/' + prefix() + path, { method: 'PUT', body: JSON.stringify(body) });
  }
  // read the latest file, apply one change, write it back; retry once if someone saved in between
  async function commitChange(fn, msg) {
    for (let k = 0; k < 3; k++) {
      const { data, sha } = await readRemote();
      fn(data.places);
      try { await putFile('data/places.json', b64enc(JSON.stringify(data, null, 1) + '\n'), sha, msg); PLACES = data.places; return; }
      catch (e) { if (k < 2 && (e.status === 409 || e.status === 422)) continue; throw e; }
    }
  }


  /* ---------- Supabase backend (free database + photo storage) ---------- */
  const SBC = Object.assign({}, window.MM_CONFIG || {}), sbOn = !!(SBC.supabaseUrl && SBC.anonKey), sbUrl = () => mmSupabaseBase(SBC.supabaseUrl);
  SBC.anonKey = String(SBC.anonKey || '').replace(/\s+/g, ''); let SES = lsGet('mm_sb_session', null);
  function sbExplain(e) {
    const m = String((e && e.message) || ''), st = e && e.status;
    if (e instanceof TypeError) return 'Cannot reach Supabase from this browser (network or VPN). Try another network or VPN server.';
    if (/invalid path/i.test(m)) return 'The Supabase address in config.js looks wrong. This page is calling: "' + sbUrl() + '" — it must look like https://abcdxyz.supabase.co (no spaces, nothing after .supabase.co).';
    if (/invalid login|invalid_credentials/i.test(m)) return 'Wrong email or password. (Use the user you created in Supabase → Authentication → Users.)';
    if (/not confirmed/i.test(m)) return 'This email is not confirmed. In Supabase → Authentication → Users, delete the user and add it again with “Auto Confirm User” ticked.';
    if (/signups? (not allowed|disabled)|user not found/i.test(m)) return 'No such user. Create it in Supabase → Authentication → Users → Add user.';
    if (/invalid api key|no api key|apikey/i.test(m)) return 'The key in config.js is not accepted. Copy the Publishable key again (Project Settings → API Keys) and check for spaces.';
    if (/could not find the table|does not exist|PGRST205/i.test(m) || st === 404) return 'The "places" table is missing. Run supabase/setup.sql in Supabase → SQL Editor, then try again.';
    if (/row-level security|42501|permission denied/i.test(m) || st === 403) return 'This account is not an admin. The email on the last line of setup.sql must match your login email exactly. Fix: in SQL Editor run  insert into public.admins (email) values (\'your@email.com\');';
    if (st === 401) return 'Session expired — please sign in again.';
    if (/violates check constraint|places_sane/i.test(m)) return 'The database rejected this place (name missing, bad coordinates or too many photos).';
    return m || 'Something went wrong.';
  }
  const sbFields = ['id', 'zh', 'en', 'cat', 'code', 'lat', 'lon', 'conf', 'aliases', 'dz', 'de', 'photos'];
  async function sbAuth(body, grant) {
    const r = await fetch(sbUrl() + '/auth/v1/token?grant_type=' + grant, { method: 'POST', headers: { apikey: SBC.anonKey, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(j.error_description || j.msg || j.message || ('HTTP ' + r.status)); e.status = r.status; throw e; }
    SES = { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: Math.floor(Date.now() / 1000) + (j.expires_in || 3600), email: j.user && j.user.email };
    lsSet('mm_sb_session', SES); return SES;
  }
  async function sbToken() {
    if (!SES) throw Object.assign(new Error('Not signed in'), { status: 401 });
    if (SES.expires_at - Math.floor(Date.now() / 1000) < 60) await sbAuth({ refresh_token: SES.refresh_token }, 'refresh_token');
    return SES.access_token;
  }
  async function sbReq(path, opt, auth) {
    const h = Object.assign({ apikey: SBC.anonKey }, (auth || SBC.anonKey.startsWith('eyJ')) ? { Authorization: 'Bearer ' + (auth ? await sbToken() : SBC.anonKey) } : {}, (opt && opt.headers) || {});   // new-style sb_publishable_ keys go in apikey only
    const r = await fetch(sbUrl() + path, Object.assign({}, opt, { headers: h }));
    if (!r.ok) { let j = {}; try { j = await r.json(); } catch (e) {} const e = new Error(j.message || j.msg || j.error || ('HTTP ' + r.status)); e.status = r.status; throw e; }
    return r.status === 204 ? null : (r.headers.get('content-type') || '').includes('json') ? r.json() : null;
  }
  const sbLoad = async () => (await sbReq('/rest/v1/places?select=*&order=id', {}, false)) || [];
  function sbRow(rec) { const row = {}; sbFields.forEach(k => { row[k] = rec[k] === undefined ? null : rec[k]; }); row.code = row.code || ''; row.aliases = row.aliases || []; row.photos = row.photos || []; row.conf = row.conf || 'approx'; return row; }
  async function sbUpsertMany(list) {
    await sbReq('/rest/v1/places?on_conflict=id', { method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(list.map(sbRow)) }, true);
  }
  const sbUpsert = rec => sbUpsertMany([rec]);
  const sbDelete = id => sbReq('/rest/v1/places?id=eq.' + encodeURIComponent(id), { method: 'DELETE' }, true);
  async function sbUpload(path, blob) {
    path = path.replace(/^photos\//, '');
    try { await sbReq('/storage/v1/object/photos/' + path, { method: 'POST', headers: { 'Content-Type': 'image/jpeg', 'x-upsert': 'false' }, body: blob }, true); }
    catch (e) {
      const m = String(e.message || '');
      if (/bucket not found/i.test(m)) throw Object.assign(new Error('The "photos" storage bucket does not exist. Re-run supabase/setup.sql in Supabase → SQL Editor, then save again.'), { status: 0 });
      if (e.status === 403 || /row-level|unauthorized|not allowed|policy/i.test(m)) throw Object.assign(new Error('Photo storage refused the upload (storage permission). Re-run the storage part of supabase/setup.sql in SQL Editor, then save again. Details: ' + m.slice(0, 80)), { status: 0 });
      if (e.status === 413 || /too large|size/i.test(m)) throw Object.assign(new Error('The photo is too large (limit 3 MB).'), { status: 0 });
      if (e.status === 415 || /mime/i.test(m)) throw Object.assign(new Error('This photo type is not allowed (use JPG, PNG or WebP).'), { status: 0 });
      throw e;
    }
    return sbUrl() + '/storage/v1/object/public/photos/' + path;
  }
  function openSb(msg) { $('sbEmail').value = (SES && SES.email) || lsGet('mm_sb_email', ''); $('sbPass').value = ''; $('sbMsg').textContent = msg || ''; $('sbOut').classList.toggle('hide', !SES); $('sbClose').classList.toggle('hide', !MODE); $('sbGate').classList.remove('hide'); }
  function closeSb() { $('sbGate').classList.add('hide'); }
  async function sbLogin() {
    const email = $('sbEmail').value.trim(), pw = $('sbPass').value; if (!email || !pw) { $('sbMsg').textContent = 'Enter your admin email and password.'; return; }
    $('sbMsg').textContent = 'Signing in…';
    try { await sbAuth({ email, password: pw }, 'password'); lsSet('mm_sb_email', email); await sbStart(); closeSb(); }
    catch (e) { SES = null; try { localStorage.removeItem('mm_sb_session'); } catch (x) {} $('sbMsg').textContent = sbExplain(e); }
  }
  async function sbStart() {
    PLACES = await sbLoad(); MODE = 'sb'; afterLoad();
    if (!PLACES.length && confirm('The database is empty. Import the starter places from this site (data/places.json)?')) {
      try {
        const seed = (await (await fetch('data/places.json?t=' + Date.now())).json()).places || [];
        await sbUpsertMany(seed);
        PLACES = await sbLoad(); afterLoad(); toast('Imported ' + PLACES.length + ' places');
      } catch (e) { toast('Import failed: ' + sbExplain(e), 8000); }
    } else toast('Signed in · ' + PLACES.length + ' places');
  }
  function sbLogout() { SES = null; try { localStorage.removeItem('mm_sb_session'); } catch (e) {} MODE = null; PLACES = []; openSb('Signed out.'); }

  /* ---------- connect / modes ---------- */
  function openSetup() {
    if (sbOn) { openSb(); return; }
    const c = CFG || {};
    $('gOwner').value = c.owner || ''; $('gRepo').value = c.repo || ''; $('gBranch').value = c.branch || 'main'; $('gPrefix').value = c.prefix || ''; $('gToken').value = c.token || ''; $('gApi').value = c.api || '';
    $('gMsg').textContent = ''; $('gate').classList.remove('hide');
    $('gClose').classList.toggle('hide', !MODE); $('gOut').classList.toggle('hide', !(CFG && CFG.token));
  }
  function closeSetup() { $('gate').classList.add('hide'); }
  async function connect() {
    const c = { owner: $('gOwner').value.trim(), repo: $('gRepo').value.trim(), branch: $('gBranch').value.trim() || 'main', prefix: $('gPrefix').value.trim(), token: $('gToken').value.trim().replace(/\s+/g, ''), api: $('gApi').value.trim() };
    if (!c.owner || !c.repo || !c.token) { $('gMsg').textContent = 'Fill in user, repository and token.'; return; }
    CFG = c; $('gMsg').textContent = 'Connecting…';
    try {
      const repo = await gh('');
      if (repo.permissions && !repo.permissions.push) throw new Error('This token can read but not write the repository.');
      const r = await readRemote(); PLACES = r.data.places;
      lsSet('mm_admin_cfg', CFG); MODE = 'gh'; closeSetup(); afterLoad();
      toast(r.sha ? 'Connected · ' + PLACES.length + ' places' : 'Connected · no data/places.json yet — your first save creates it');
    } catch (e) {
      CFG = lsGet('mm_admin_cfg', null);
      $('gMsg').textContent = e instanceof TypeError ? 'Your browser cannot reach GitHub (network, VPN or an extension is blocking it). Press “Run test” to see which step fails.' : e.status === 401 ? 'Token rejected — check it was copied fully and has not expired.' : e.status === 404 ? 'Repository not found, or the token has no access to it.' : (e.message || 'Could not connect');
    }
  }
  async function diagnose() {
    const base = (($('gApi').value.trim()) || 'https://api.github.com').replace(/\/+$/, ''), tok = $('gToken').value.trim().replace(/\s+/g, ''), o = $('gOwner').value.trim(), r = $('gRepo').value.trim();
    const out = []; const show = () => { $('gMsg').style.whiteSpace = 'pre-wrap'; $('gMsg').textContent = out.join('\n'); };
    const step = async (label, url, auth) => {
      try { const res = await fetch(url, auth ? { headers: { Authorization: 'Bearer ' + tok, Accept: 'application/vnd.github+json' } } : {}); let j = {}; try { j = await res.json(); } catch (e) {}
        out.push((res.ok ? '✅ ' : '❌ ') + label + ' → HTTP ' + res.status + (j.message ? ' (' + j.message.slice(0, 70) + ')' : j.login ? ' (' + j.login + ')' : '')); }
      catch (e) { out.push('❌ ' + label + ' → cannot connect (' + (e.message || e) + ')'); } show();
    };
    out.push('Testing ' + base + ' …'); show();
    await step('1. GitHub reachable (no login)', base + '/zen', false);
    await step('2. Token accepted', base + '/user', true);
    await step('3. Repository ' + o + '/' + r, base + '/repos/' + o + '/' + r, true);
    out.push('', 'If 1 fails: network blocks GitHub → change VPN node, or use the proxy address (see DEPLOY.md).', 'If 1 works but 2 fails to connect: a browser extension / proxy blocks the login header → try another browser or a private window.', 'If 2 says 401: the token is wrong or expired. If 3 says 404: the token was not given access to this repository.'); show();
  }
  function disconnect() { try { localStorage.removeItem('mm_admin_cfg'); } catch (e) {} CFG = null; MODE = null; PLACES = []; closeSetup(); openSetup(); toast('Token removed from this device'); }
  async function localMode() {
    MODE = 'local'; const saved = lsGet('mm_admin_local', null);
    if (saved) PLACES = saved; else { try { const r = await fetch('data/places.json?t=' + Date.now()); PLACES = (await r.json()).places || []; } catch (e) { PLACES = []; } }
    closeSetup(); afterLoad(); toast('Local mode — edits stay in this browser. Use “JSON” to download them.', 5000);
  }
  async function reload() {
    if (MODE === 'sb') { try { PLACES = await sbLoad(); afterLoad(); toast('Reloaded'); } catch (e) { toast('Reload failed: ' + sbExplain(e), 6000); } }
    else if (MODE === 'gh') { try { PLACES = (await readRemote()).data.places; afterLoad(); toast('Reloaded'); } catch (e) { toast('Reload failed: ' + e.message, 5000); } }
    else if (MODE === 'local') { try { localStorage.removeItem('mm_admin_local'); } catch (e) {} localMode(); }
    else openSetup();
  }
  function afterLoad() {
    $('repoLbl').textContent = MODE === 'sb' ? 'Database · ' + ((SES && SES.email) || 'admin') : MODE === 'gh' ? CFG.owner + '/' + CFG.repo + ' · ' + CFG.branch : 'Local mode (not saved to GitHub)';
    renderList(); renderMap();
    if (!afterLoad.h) { afterLoad.h = 1; const m = location.hash.match(/^#edit=(.+)$/); if (m) { const id = decodeURIComponent(m[1]); if (PLACES.some(p => p.id === id)) edit(id); } else if (location.hash === '#new') newPlace(); }
  }

  /* ---------- list + map ---------- */
  function thumbOf(p) { const s = p.photos && p.photos[0]; return s ? (BLOBS.get(s) || s) : null; }
  function renderList() {
    const q = $('q').value.trim().toLowerCase();
    const list = PLACES.filter(p => !q || [p.zh, p.en, p.id, (p.aliases || []).join(' ')].join(' ').toLowerCase().includes(q))
      .sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
    $('list').innerHTML = list.map(p => {
      const c = catOf(p.cat), t = thumbOf(p);
      return '<button class="card item' + (EDIT && EDIT.id === p.id ? ' sel' : '') + '" data-id="' + esc(p.id) + '">' +
        (t ? '<img class="thumb" loading="lazy" src="' + esc(t) + '" alt="">' : '<div class="thumb" style="background:' + c[1] + '"><i class="fa-solid ' + c[2] + '"></i></div>') +
        '<div style="min-width:0"><b>' + esc(nameOf(p)) + '</b><span>' + esc(p.zh && p.en ? p.zh : c[0]) + (p.conf !== 'high' ? ' · <span class="warn">⚠ approx</span>' : '') +
        ((p.photos || []).length ? ' · <i class="fa-regular fa-image"></i> ' + p.photos.length : '') + '</span></div></button>';
    }).join('') || '<p class="note">No places match.</p>';
    $('list').querySelectorAll('.item').forEach(b => b.onclick = () => edit(b.dataset.id));
  }
  function ensureMap() {
    if (map) return;
    map = L.map('map', { zoomControl: true }).setView(CAMPUS, 16);
    const C = window.MM_CONFIG || {}, chain = [];
    if (C.tileUrl) chain.push([C.tileUrl, C.tileAttribution || '© map providers']);
    chain.push(['https://tile.openstreetmap.org/{z}/{x}/{y}.png', '© OpenStreetMap'], ['https://tile.openstreetmap.de/{z}/{x}/{y}.png', '© OpenStreetMap'], ['https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png', '© OpenStreetMap, HOT']);
    let ti = 0;
    const nextTile = l => {
      if (satOn || osm !== l) return;
      if (ti < chain.length - 1) { ti++; map.removeLayer(osm); osm = mk().addTo(map); osm.bringToBack(); toast('Map server slow — switched to a backup.', 3000); }
      else { toggleSat(); toast('Street map not reachable here — showing satellite.', 4000); }
    };
    function mk() {
      let errs = 0, loaded = false; const l = L.tileLayer(chain[ti][0], { maxZoom: 19, subdomains: 'abc', attribution: chain[ti][1] });
      l.on('tileload', () => { errs = 0; loaded = true; });
      l.on('tileerror', () => { if (++errs >= 6) nextTile(l); });
      setTimeout(() => { if (!loaded) nextTile(l); }, 7000);
      return l;
    }
    osm = mk();
    sat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Imagery © Esri' });
    let startSat = false; try { startSat = localStorage.getItem('mm_sat') === '1'; } catch (e) {}
    if (startSat) { satOn = true; sat.addTo(map); } else osm.addTo(map);
    layer = L.layerGroup().addTo(map);
    map.on('click', e => { if (EDIT) setPos(e.latlng.lat, e.latlng.lng, 'high', null); });
    map.on('move', updateCross);
  }
  function renderMap() {
    ensureMap(); layer.clearLayers();
    PLACES.forEach(p => {
      if (EDIT && EDIT.id === p.id) return;
      const c = catOf(p.cat);
      L.circleMarker([p.lat, p.lon], { radius: 8, color: '#fff', weight: 2, fillColor: c[1], fillOpacity: 1 }).addTo(layer)
        .bindTooltip(nameOf(p)).on('click', e => { L.DomEvent.stopPropagation(e); edit(p.id); });
    });
    if (!renderMap.fitted && PLACES.length) { map.fitBounds(L.latLngBounds(PLACES.map(p => [p.lat, p.lon])).pad(.2)); renderMap.fitted = true; }
    setTimeout(() => map.invalidateSize(), 50);
  }
  function toggleSat() { satOn = !satOn; try { localStorage.setItem('mm_sat', satOn ? '1' : '0'); } catch (e) {} if (satOn) { map.removeLayer(osm); sat.addTo(map); } else { map.removeLayer(sat); osm.addTo(map); } }
  function updateCross() { $('cross').classList.toggle('hide', !(EDIT && EDIT.lat == null)); }

  /* ---------- form ---------- */
  function fillCats() { $('fCat').innerHTML = Object.keys(CATS).map(k => '<option value="' + k + '">' + CATS[k][0] + '</option>').join(''); }
  function openForm(state, title) {
    EDIT = state; $('fTitle').textContent = title;
    $('fZh').value = state.zh || ''; $('fEn').value = state.en || ''; $('fCat').value = state.cat || 'building'; $('fCode').value = state.code || '';
    $('fDe').value = state.de || ''; $('fDz').value = state.dz || ''; $('fAl').value = (state.aliases || []).join(';');
    $('delBtn').classList.toggle('hide', state.isNew); $('qrOut').classList.add('hide'); $('qrOut').innerHTML = '';
    $('form').classList.remove('hide', 'min'); document.body.classList.add('formOpen'); $('side').classList.remove('open'); window.scrollTo(0, 0); setTimeout(() => map && map.invalidateSize(), 120); showPos(); renderPhotos(); renderList(); placeEditMarker(); updateCross();
    $('gpsInfo').textContent = state.lat == null ? 'Stand at the place and press the blue button, or move the map so the red target is on the building and press “Use map centre”.' : (state.conf === 'high' ? 'Position saved as accurate.' : 'Position is approximate — mark it again on site.');
  }
  function edit(id) {
    const p = PLACES.find(x => x.id === id); if (!p) return; ensureMap();
    openForm({ id: p.id, isNew: false, zh: p.zh, en: p.en, cat: p.cat, code: p.code, de: p.de, dz: p.dz, aliases: p.aliases, lat: p.lat, lon: p.lon, conf: p.conf, photos: (p.photos || []).slice(), pending: [] }, nameOf(p));
    renderMap(); map.flyTo([p.lat, p.lon], Math.max(map.getZoom(), 18), { duration: .5 });
  }
  function newPlace() {
    if (!MODE) { openSetup(); return; } ensureMap();
    openForm({ id: null, isNew: true, cat: 'building', lat: null, lon: null, conf: 'approx', photos: [], pending: [], aliases: [] }, 'New place');
    renderMap();
  }
  function closeForm() { EDIT = null; stopGps(); $('form').classList.add('hide'); document.body.classList.remove('formOpen'); setTimeout(() => map && map.invalidateSize(), 120); if (editMarker) { map.removeLayer(editMarker); editMarker = null; } renderList(); renderMap(); updateCross(); }
  function showPos() { $('fLat').value = EDIT && EDIT.lat != null ? (+EDIT.lat).toFixed(6) : ''; $('fLon').value = EDIT && EDIT.lon != null ? (+EDIT.lon).toFixed(6) : ''; }
  function placeEditMarker() {
    if (editMarker) { map.removeLayer(editMarker); editMarker = null; }
    if (!EDIT || EDIT.lat == null) return;
    const c = catOf($('fCat').value);
    editMarker = L.marker([EDIT.lat, EDIT.lon], { draggable: true, zIndexOffset: 900, icon: L.divIcon({ className: '', iconSize: [34, 34], iconAnchor: [17, 34], html: '<div style="width:34px;height:34px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:' + c[1] + ';border:3px solid #fff;box-shadow:0 3px 10px rgba(0,0,0,.4)"></div>' }) }).addTo(map);
    editMarker.on('dragend', () => { const ll = editMarker.getLatLng(); setPos(ll.lat, ll.lng, 'high', null, true); });
  }
  function setPos(lat, lon, conf, acc, keepMarker) {
    if (!EDIT) return;
    EDIT.lat = +lat.toFixed(6); EDIT.lon = +lon.toFixed(6); EDIT.conf = conf; showPos();
    if (!keepMarker) placeEditMarker(); updateCross();
    $('gpsInfo').textContent = acc != null ? 'Marked from GPS · accuracy ±' + Math.round(acc) + ' m' + (acc > 30 ? ' — weak, try again in the open' : '') : 'Position set on the map.';
  }
  function coordTyped() {
    const a = parseFloat($('fLat').value), b = parseFloat($('fLon').value);
    if (isFinite(a) && isFinite(b) && EDIT) { setPos(a, b, 'high', null); map.panTo([a, b]); }
  }
  function toggleMin() { $('form').classList.toggle('min'); }
  function toggleList() { $('side').classList.toggle('open'); }
  function useCenter() { if (!EDIT) return; const c = map.getCenter(); setPos(c.lat, c.lng, 'high', null); }

  /* GPS: collect fixes for a few seconds and keep the most accurate one */
  function stopGps() { if (watchId != null) { navigator.geolocation.clearWatch(watchId); watchId = null; } const b = $('gpsBtn'); if (b) { b.disabled = false; b.innerHTML = '<i class="fa-solid fa-location-crosshairs"></i> Mark where I\'m standing'; } }
  function markHere() {
    if (!EDIT) return;
    if (!navigator.geolocation) { toast('This browser has no GPS support'); return; }
    if (!window.isSecureContext) { toast('GPS needs HTTPS — open the deployed https:// address'); return; }
    stopGps(); let best = null; const t0 = Date.now(); $('gpsBtn').disabled = true; $('gpsInfo').textContent = 'Getting a precise GPS fix… hold still';
    const finish = () => {
      const b = best; stopGps();
      if (!b) { $('gpsInfo').textContent = 'No GPS fix. Go outside, turn on Location, and allow it for this site.'; return; }
      setPos(b.latitude, b.longitude, b.accuracy <= 30 ? 'high' : 'approx', b.accuracy); map.flyTo([b.latitude, b.longitude], 19, { duration: .5 });
    };
    watchId = navigator.geolocation.watchPosition(pos => {
      const c = pos.coords; if (!best || c.accuracy < best.accuracy) best = c;
      const sec = (Date.now() - t0) / 1000;
      $('gpsBtn').innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> ±' + Math.round(best.accuracy) + ' m …';
      if (userDot) userDot.setLatLng([c.latitude, c.longitude]); else userDot = L.circleMarker([c.latitude, c.longitude], { radius: 6, color: '#fff', weight: 2, fillColor: '#2F80ED', fillOpacity: 1, interactive: false }).addTo(map);
      if ((best.accuracy <= 6 && sec >= 3) || sec >= 14) finish();
    }, err => { stopGps(); $('gpsInfo').textContent = err.code === 1 ? 'Location permission denied — allow it in the browser settings.' : 'GPS error: ' + err.message; },
    { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
    setTimeout(() => { if (watchId != null) finish(); }, 15000);
  }

  /* ---------- photos ---------- */
  function renderPhotos() {
    const h = [];
    EDIT.photos.forEach((p, i) => h.push('<div class="ph"><img src="' + esc(BLOBS.get(p) || p) + '" alt=""><button data-k="e' + i + '" aria-label="Remove">✕</button></div>'));
    EDIT.pending.forEach((p, i) => h.push('<div class="ph"><img src="' + esc(p.url) + '" alt=""><button data-k="n' + i + '" aria-label="Remove">✕</button></div>'));
    h.push('<button class="addph" onclick="$(\'fFile\').click()" aria-label="Add photo"><i class="fa-solid fa-camera"></i></button>');
    $('fPhotos').innerHTML = h.join('');
    $('fPhotos').querySelectorAll('.ph button').forEach(b => b.onclick = () => {
      const k = b.dataset.k; if (k[0] === 'e') EDIT.photos.splice(+k.slice(1), 1); else { URL.revokeObjectURL(EDIT.pending[+k.slice(1)].url); EDIT.pending.splice(+k.slice(1), 1); } renderPhotos();
    });
  }
  async function shrink(file) {
    const MAX = 1280; let bmp;
    try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
    catch (e) { bmp = await new Promise((ok, no) => { const im = new Image(); im.onload = () => ok(im); im.onerror = no; im.src = URL.createObjectURL(file); }); }
    const w = bmp.width || bmp.naturalWidth, h = bmp.height || bmp.naturalHeight, k = Math.min(1, MAX / Math.max(w, h));
    const cv = document.createElement('canvas'); cv.width = Math.round(w * k); cv.height = Math.round(h * k);
    const cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height); cx.drawImage(bmp, 0, 0, cv.width, cv.height);
    return new Promise((ok, no) => cv.toBlob(b => b ? ok(b) : no(new Error('image encode failed')), 'image/jpeg', 0.82));
  }
  async function addFiles(files) {
    if (!EDIT) return;
    if (MODE !== 'gh' && MODE !== 'sb') { toast('Sign in to add photos.', 4500); $('fFile').value = ''; return; }
    for (const f of Array.from(files)) {
      try { const blob = await shrink(f); EDIT.pending.push({ blob, url: URL.createObjectURL(blob) }); }
      catch (e) { toast('Could not read ' + f.name); }
    }
    $('fFile').value = ''; renderPhotos();
  }
  const blobB64 = blob => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1]); r.onerror = no; r.readAsDataURL(blob); });

  /* ---------- save / delete ---------- */
  async function save() {
    if (!EDIT) return;
    const zh = $('fZh').value.trim(), en = $('fEn').value.trim();
    if (!zh && !en) { toast('Enter a name (Chinese or English).'); return; }
    if (EDIT.lat == null || !isFinite(EDIT.lat)) { toast('Set the location first: mark where you stand, or tap the map.'); return; }
    const btn = $('saveBtn'); btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving…';
    try {
      const id = EDIT.id || ((slug(en) || 'p') + '_' + rid());
      const photos = EDIT.photos.slice(), uploaded = [];
      if (MODE === 'gh' || MODE === 'sb') {
        let n = 0;
        for (const ph of EDIT.pending) {
          const path = 'photos/' + id + '-' + Date.now().toString(36) + (n++) + '.jpg';
          btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Uploading photo ' + n + '/' + EDIT.pending.length + '…';
          const ref = MODE === 'sb' ? await sbUpload(path, ph.blob) : (await putFile(path, await blobB64(ph.blob), null, 'Add photo for ' + (en || zh || id)), path);
          BLOBS.set(ref, ph.url); photos.push(ref); uploaded.push(ph);
        }
      }
      const prev = PLACES.find(p => p.id === id) || {};
      const rec = Object.assign({}, prev, {
        id, zh, en, cat: $('fCat').value, code: $('fCode').value.trim(), lat: EDIT.lat, lon: EDIT.lon, conf: EDIT.conf === 'high' ? 'high' : 'approx',
        aliases: $('fAl').value.split(/[;；]/).map(s => s.trim()).filter(Boolean), dz: $('fDz').value.trim(), de: $('fDe').value.trim(), photos
      });
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving place…';
      const up = list => { const i = list.findIndex(p => p.id === id); if (i >= 0) list[i] = rec; else list.push(rec); };
      if (MODE === 'sb') { await sbUpsert(rec); up(PLACES); }
      else if (MODE === 'gh') await commitChange(up, (EDIT.isNew ? 'Add ' : 'Update ') + (en || zh));
      else { up(PLACES); lsSet('mm_admin_local', PLACES); }
      toast(MODE === 'sb' ? 'Saved ✓  Live for everyone now.' : MODE === 'gh' ? 'Saved ✓  Live for everyone in about a minute.' : 'Saved in this browser ✓', 4500);
      EDIT.pending = []; closeForm();
    } catch (e) {
      if (MODE === 'sb') { toast('Save failed: ' + sbExplain(e), 9000); if (e.status === 401) { MODE = null; openSb('Session expired — please sign in again.'); } }
      else toast('Save failed: ' + (e.status === 401 || e.status === 403 ? 'token has no write permission' : e.message), 6000);
    } finally { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> Save'; }
  }
  async function remove() {
    if (!EDIT || EDIT.isNew) return;
    if (!confirm('Delete “' + (EDIT.zh || EDIT.en || EDIT.id) + '” for everybody?')) return;
    const id = EDIT.id, f = list => { const i = list.findIndex(p => p.id === id); if (i >= 0) list.splice(i, 1); };
    try {
      if (MODE === 'sb') { await sbDelete(id); f(PLACES); }
      else if (MODE === 'gh') await commitChange(f, 'Delete ' + id); else { f(PLACES); lsSet('mm_admin_local', PLACES); }
      closeForm(); toast('Deleted');
    } catch (e) { toast('Delete failed: ' + (MODE === 'sb' ? sbExplain(e) : e.message), 8000); }
  }

  /* ---------- QR / link / download ---------- */
  function showQR() {
    if (!EDIT || EDIT.isNew) { toast('Save the place first.'); return; }
    const base = location.href.replace(/admin\.html.*$/, ''), link = base + 'index.html#p=' + encodeURIComponent(EDIT.id);
    const q = qrcode(0, 'M'); q.addData(link); q.make();
    const url = q.createDataURL(8, 4), name = 'QR-' + EDIT.id + '.png';
    $('qrOut').innerHTML = '<img src="' + url + '" alt="QR"><p class="note" style="word-break:break-all">' + esc(link) + '</p><a class="btn sec sm" download="' + esc(name) + '" href="' + url + '">Download PNG</a>';
    $('qrOut').classList.remove('hide');
  }
  function download() {
    const blob = new Blob([JSON.stringify({ version: 1, places: PLACES }, null, 1) + '\n'], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'places.json'; document.body.appendChild(a); a.click(); a.remove();
    toast('Downloaded places.json — put it in data/places.json of your site');
  }

  /* ---------- boot ---------- */
  function init() {
    fillCats(); $('fCat').onchange = () => { if (EDIT) placeEditMarker(); }; ensureMap();
    window.addEventListener('beforeunload', e => { if (EDIT && (EDIT.pending.length)) { e.preventDefault(); e.returnValue = ''; } });
    if (sbOn) { if (SES) sbStart().catch(e => { openSb(e.status === 401 || e.status === 400 ? 'Please sign in again.' : sbExplain(e)); }); else openSb(); }
    else if (CFG && CFG.token) { MODE = null; connect2(); } else openSetup();
  }
  async function connect2() {                                       // silent reconnect with the saved token
    $('repoLbl').textContent = 'Connecting…';
    try { const r = await readRemote(); PLACES = r.data.places; MODE = 'gh'; afterLoad(); }
    catch (e) { $('repoLbl').textContent = 'Not connected'; openSetup(); $('gMsg').textContent = 'Could not reconnect: ' + (e.message || e); }
  }
  return { toggleMin, toggleList, init, sbLogin, sbLogout, closeSb, diagnose, openSetup, closeSetup, connect, disconnect, localMode, reload, renderList, newPlace, closeForm, markHere, useCenter, toggleSat, coordTyped, addFiles, save, remove, showQR, download };
})();
window.Admin = Admin; window.$ = $;
Admin.init();