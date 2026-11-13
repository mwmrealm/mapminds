/* MapMinds — GPS, routing and live turn-by-turn navigation.
   Uses the globals of app.js (map, PLACES, SELECTED, USER, START, T(), nm(), dl(), setUIMode() …).
   Flow:  Directions → route preview (alternatives, walk/bike) → Start → live navigation (follow, re-route, voice) → arrived. */
'use strict';

const MAX_ROUTE_KM = 40;                       // farther from campus than this: start from the nearest gate
const SPEED = { foot: 1.35, bike: 4.2 };       // m/s, used for ETA
const OSRM = { foot: 'https://routing.openstreetmap.de/routed-foot/route/v1/foot', bike: 'https://routing.openstreetmap.de/routed-bike/route/v1/bike' };
const VALHALLA = 'https://valhalla1.openstreetmap.de/route';

let ROUTE = null, ROUTES = [], MODE = 'foot', watchId = null, compassHeading = null;
let NAV = { on: false, sim: false, follow: true, voice: false, prog: 0, idx: 0, offCount: 0, lastReroute: 0, rerouting: false, spoken: {}, timer: null, wake: null };
const gpsWaiters = [];

function hideToast() { const t = $('toast'); if (t) { t.style.display = 'none'; t.onclick = null; } }

/* =====================================================================
   GPS
   ===================================================================== */
function startGPS(cb) {
  if (cb) gpsWaiters.push(cb);
  if (!navigator.geolocation) { toast(T('gpsOff'), 4000); flushGps(); return; }
  if (watchId != null) { if (USER) flushGps(); return; }
  const lb = $('locBtn'); if (lb) lb.classList.add('active');
  watchId = navigator.geolocation.watchPosition(onFix, onFixError, { enableHighAccuracy: true, maximumAge: 3000, timeout: 25000 });
}
function flushGps() { while (gpsWaiters.length) { try { gpsWaiters.shift()(); } catch (e) {} } }
function stopGPS() {
  if (watchId != null) { try { navigator.geolocation.clearWatch(watchId); } catch (e) {} watchId = null; }
  const lb = $('locBtn'); if (lb) lb.classList.remove('active');
}
function stopGPSIfIdle() {
  if (UI_MODE === 'nav' || UI_MODE === 'preview' || CUR === 'steps') return;
  stopGPS();
}
function onFix(pos) {
  if (NAV.sim) return;                                           // a demo walk drives USER itself
  let lat = pos.coords.latitude, lon = pos.coords.longitude;
  if (gcjFix) [lat, lon] = GCJ.toWgs(lat, lon);
  const sp = pos.coords.speed, hd = pos.coords.heading;
  const moving = sp != null && sp > 0.6 && hd != null && !isNaN(hd);
  USER = { lat, lon, acc: Math.min(pos.coords.accuracy || 30, 500), heading: moving ? hd : (compassHeading != null ? compassHeading : (USER && USER.heading)), speed: sp || 0, t: Date.now() };
  if (map) { placeUserMarker(); updateUserArrow(); }
  navStatus(null);
  flushGps();
  if (NAV.on) navTick();
  if (SELECTED && UI_MODE === 'browse' && (!onFix.t || Date.now() - onFix.t > 4000)) { onFix.t = Date.now(); renderCard(); }
}
function onFixError(err) {
  if (err && err.code === 1) { stopGPS(); toast(T('gpsOff'), 5000); flushGps(); }
  else if (NAV.on) navStatus(T('gpsWeak'));
}
function gpsOnce(ms) {
  if (USER) return Promise.resolve();
  return new Promise(res => { const to = setTimeout(res, ms); startGPS(() => { clearTimeout(to); res(); }); });
}
function updateUserArrow() {
  if (!userMarker) return;
  const el = userMarker.getElement(); const w = el && el.querySelector('.me-wrap'); if (!w) return;
  const show = (NAV.on || (USER && USER.heading != null)) && USER && USER.heading != null;
  w.classList.toggle('nav', !!show);
  if (show) w.style.setProperty('--rot', USER.heading + 'deg');
}
/* compass: Android fires deviceorientationabsolute; iPhone needs a tap-permission and gives webkitCompassHeading */
let compassOn = false;
function listenCompass() {
  if (compassOn) return; compassOn = true;
  window.addEventListener('deviceorientation', e => {
    let h = e.webkitCompassHeading;
    if (h == null && e.absolute && e.alpha != null) h = (360 - e.alpha) % 360;
    if (h == null || isNaN(h)) return;
    compassHeading = h;
    if (USER && !NAV.sim && (USER.speed || 0) < 0.6) { USER.heading = h; updateUserArrow(); }
  }, true);
}
function enableCompass() {
  const DO = window.DeviceOrientationEvent;
  if (DO && typeof DO.requestPermission === 'function') { DO.requestPermission().then(r => { if (r === 'granted') listenCompass(); }).catch(() => {}); }
  else listenCompass();
}
function locateMe() {
  enableCompass(); ensureMap();
  if (USER) map.flyTo([USER.lat, USER.lon], Math.max(map.getZoom(), 17));
  startGPS(() => { if (USER && map) map.flyTo([USER.lat, USER.lon], Math.max(map.getZoom(), 17)); });
}
function navStatus(msg) { const e = $('nbStatus'); if (!e) return; e.style.display = msg ? 'inline-flex' : 'none'; if (msg) e.textContent = msg; }
window.addEventListener('deviceorientationabsolute', e => {
  if (e.alpha == null) return; compassHeading = (360 - e.alpha) % 360;
  if (USER && !NAV.sim && (USER.speed || 0) < 0.6) { USER.heading = compassHeading; updateUserArrow(); }
}, true);
document.addEventListener('visibilitychange', () => { if (document.hidden && !NAV.on) stopGPS(); else if (!document.hidden && CUR === 'map' && UI_MODE !== 'browse') startGPS(); });

/* =====================================================================
   START POINT
   ===================================================================== */
function nearestGate(ref) {
  const gates = PLACES.filter(p => p.cat === 'gate'); if (!gates.length) return null;
  return gates.slice().sort((a, b) => hav(ref, [a.lat, a.lon]) - hav(ref, [b.lat, b.lon]))[0];
}
function defaultStart() {
  if (START) return START;
  if (USER && hav([USER.lat, USER.lon], CAMPUS.center) < MAX_ROUTE_KM * 1000) return { lat: USER.lat, lon: USER.lon, label: T('myLocation'), gps: true };
  const g = nearestGate(USER ? [USER.lat, USER.lon] : CAMPUS.center) || PLACES.find(p => p.cat === 'bus');
  toast(USER ? T('offCampus') : T('noGps'), 4500);
  if (g) return { lat: g.lat, lon: g.lon, label: nm(g) };
  return { lat: CAMPUS.center[0], lon: CAMPUS.center[1], label: T('startPoint') };
}
function setStart(s) {
  START = s;
  if (startMarker && map) { map.removeLayer(startMarker); startMarker = null; }
  if (s && map && !s.gps) startMarker = L.marker([s.lat, s.lon], { icon: L.divIcon({ className: '', iconSize: [18, 18], html: '<div class="start-dot"></div>' }), interactive: false }).addTo(map);
}
function onStartPicked(ll) { setStart({ lat: ll.lat, lon: ll.lng, label: T('startPoint') }); if (SELECTED) startDirections(); }
function changeStart() { const q = $('startQ'); if (q) q.value = ''; renderStartList(''); openOverlay('startPick'); }
function renderStartList(q) {
  const box = $('startList'); if (!box) return; box.innerHTML = '';
  const row = (icon, color, title, sub, fn) => {
    const b = document.createElement('button'); b.className = 'white-card rounded-2xl p-3 w-full flex items-center gap-3 text-left';
    b.innerHTML = `<div class="w-10 h-10 rounded-full flex items-center justify-center text-white shrink-0" style="background:${color}"><i class="fa-solid ${icon}"></i></div><div class="flex-1 min-w-0"><p class="font-semibold text-navySoft text-sm truncate">${esc(title)}</p>${sub ? `<p class="text-xs text-slate-500 truncate">${esc(sub)}</p>` : ''}</div>`;
    b.onclick = fn; box.appendChild(b);
  };
  const go = () => { closeOverlay('startPick'); if (SELECTED) startDirections(); };
  q = (q || '').trim();
  if (!q) {
    row('fa-location-crosshairs', '#2F80ED', T('myLocation'), USER ? '±' + Math.round(USER.acc) + ' ' + T('m') : T('locating'), () => { setStart(null); if (!USER) startGPS(); go(); });
    row('fa-hand-pointer', '#10B981', T('pickOnMap'), '', () => { closeOverlay('startPick'); pickStart = true; toast(T('tapToStart'), 4000); });
    row('fa-qrcode', '#7C3AED', T('scanQr'), T('scanQrSub'), () => { closeOverlay('startPick'); openQR(); });
  }
  const list = q ? searchPlaces(q).slice(0, 25) : PLACES.filter(p => p.cat === 'gate' || p.cat === 'library' || p.cat === 'bus').slice(0, 12);
  list.forEach(p => row(CATS[p.cat].i, CATS[p.cat].c, dl(p), catLabel(p.cat), () => { setStart({ lat: p.lat, lon: p.lon, label: nm(p) }); go(); }));
}

/* =====================================================================
   ROUTE GEOMETRY
   ===================================================================== */
const MLAT = 110540;
function snapToRoute(rt, lat, lon) {
  const c = rt.coords, cum = rt.cum, k = Math.cos(lat * Math.PI / 180), mlon = k * 111320;
  const px = lon * mlon, py = lat * MLAT;
  let best = { off: Infinity, prog: 0, seg: 0 };
  for (let i = 0; i < c.length - 1; i++) {
    const ax = c[i][1] * mlon, ay = c[i][0] * MLAT, bx = c[i + 1][1] * mlon, by = c[i + 1][0] * MLAT;
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
    let t = L2 ? ((px - ax) * dx + (py - ay) * dy) / L2 : 0; t = Math.max(0, Math.min(1, t));
    const d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
    if (d < best.off) best = { off: d, prog: cum[i] + t * (cum[i + 1] - cum[i]), seg: i };
  }
  return best;
}
function pointAt(rt, d) {
  const c = rt.coords, cum = rt.cum;
  if (d <= 0) return { lat: c[0][0], lon: c[0][1], heading: null };
  for (let i = 0; i < c.length - 1; i++) {
    if (d <= cum[i + 1]) {
      const seg = cum[i + 1] - cum[i] || 1, t = (d - cum[i]) / seg;
      const lat = c[i][0] + (c[i + 1][0] - c[i][0]) * t, lon = c[i][1] + (c[i + 1][1] - c[i][1]) * t;
      const heading = (Math.atan2((c[i + 1][1] - c[i][1]) * Math.cos(lat * Math.PI / 180), c[i + 1][0] - c[i][0]) * 180 / Math.PI + 360) % 360;
      return { lat, lon, heading };
    }
  }
  const last = c[c.length - 1]; return { lat: last[0], lon: last[1], heading: null };
}
function prepRoute(rt) {
  const c = rt.coords; rt.cum = [0];
  for (let i = 1; i < c.length; i++) rt.cum.push(rt.cum[i - 1] + hav(c[i - 1], c[i]));
  rt.total = rt.cum[rt.cum.length - 1] || rt.dist || 1;
  if (!rt.steps || !rt.steps.length) rt.steps = [
    { maneuver: { type: 'depart', location: [c[0][1], c[0][0]] }, name: '', distance: rt.total },
    { maneuver: { type: 'arrive', location: [c[c.length - 1][1], c[c.length - 1][0]] }, name: '', distance: 0 }];
  rt.steps.forEach((s, i) => {
    const m = s.maneuver || {}, loc = m.location;
    s.prog = i === 0 ? 0 : (m.type === 'arrive' ? rt.total : (loc ? snapToRoute(rt, loc[1], loc[0]).prog : 0));
  });
  for (let i = 1; i < rt.steps.length; i++) if (rt.steps[i].prog < rt.steps[i - 1].prog) rt.steps[i].prog = rt.steps[i - 1].prog;
  return rt;
}

/* =====================================================================
   ROUTING SERVICES  (OSRM first, Valhalla as a second opinion; both raced, first good answer wins)
   ===================================================================== */
function fetchJson(url, ms, ctl) {
  const to = setTimeout(() => ctl.abort(), ms);
  return fetch(url, { signal: ctl.signal }).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).finally(() => clearTimeout(to));
}
function osrmRoutes(s, d, mode, ctl) {
  const url = `${OSRM[mode]}/${s.lon},${s.lat};${d.lon},${d.lat}?overview=full&geometries=geojson&steps=true&alternatives=true`;
  return fetchJson(url, 11000, ctl).then(j => {
    if (j.code !== 'Ok' || !j.routes || !j.routes.length) return null;
    return j.routes.slice(0, 3).map(rt => ({ coords: rt.geometry.coordinates.map(c => [c[1], c[0]]), dist: rt.distance, dur: rt.duration, steps: rt.legs[0].steps, engine: 'osrm' }));
  });
}
function decodePoly6(str) {
  let i = 0, lat = 0, lon = 0; const out = [];
  while (i < str.length) {
    let b, shift = 0, res = 0;
    do { b = str.charCodeAt(i++) - 63; res |= (b & 31) << shift; shift += 5; } while (b >= 32);
    lat += (res & 1) ? ~(res >> 1) : (res >> 1);
    shift = 0; res = 0;
    do { b = str.charCodeAt(i++) - 63; res |= (b & 31) << shift; shift += 5; } while (b >= 32);
    lon += (res & 1) ? ~(res >> 1) : (res >> 1);
    out.push([lat / 1e6, lon / 1e6]);
  }
  return out;
}
const VAL_MOD = { 9: 'slight right', 10: 'right', 11: 'sharp right', 12: 'uturn', 13: 'uturn', 14: 'sharp left', 15: 'left', 16: 'slight left' };
function valhallaRoutes(s, d, mode, ctl) {
  const body = { locations: [{ lat: s.lat, lon: s.lon }, { lat: d.lat, lon: d.lon }], costing: mode === 'bike' ? 'bicycle' : 'pedestrian', directions_options: { units: 'kilometers' } };
  return fetchJson(VALHALLA + '?json=' + encodeURIComponent(JSON.stringify(body)), 12000, ctl).then(j => {
    const leg = j && j.trip && j.trip.legs && j.trip.legs[0]; if (!leg) return null;
    const coords = decodePoly6(leg.shape); if (coords.length < 2) return null;
    const steps = leg.maneuvers.map(m => {
      const t = m.type, loc = coords[Math.min(m.begin_shape_index || 0, coords.length - 1)];
      const type = t <= 3 ? 'depart' : (t >= 4 && t <= 6 ? 'arrive' : (t === 26 ? 'roundabout' : 'turn'));
      const modifier = t === 5 ? 'right' : t === 6 ? 'left' : (VAL_MOD[t] || 'straight');
      return { maneuver: { type, modifier, location: [loc[1], loc[0]] }, name: (m.street_names && m.street_names[0]) || '', distance: (m.length || 0) * 1000 };
    });
    return [{ coords, dist: j.trip.summary.length * 1000, dur: j.trip.summary.time, steps, engine: 'valhalla' }];
  });
}
function raceRoutes(s, d, mode) {
  const ctls = [new AbortController(), new AbortController()];
  return new Promise(resolve => {
    let left = 2, done = false;
    const fin = (i, r) => {
      if (done) return;
      if (r) { done = true; ctls.forEach((c, j) => j !== i && c.abort()); resolve(r); }
      else if (--left === 0) resolve(null);
    };
    osrmRoutes(s, d, mode, ctls[0]).then(r => fin(0, r), () => fin(0, null));
    valhallaRoutes(s, d, mode, ctls[1]).then(r => fin(1, r), () => fin(1, null));
  });
}
async function computeRoutes(s, dest, mode, silent) {
  if (!silent) toast(T('routing'), 12000);
  let list = navigator.onLine ? await raceRoutes(s, dest, mode) : null;
  if (!list) {
    const d = hav([s.lat, s.lon], [dest.lat, dest.lon]) * 1.25;       // walking is rarely a straight line
    list = [{ coords: [[s.lat, s.lon], [dest.lat, dest.lon]], dist: d, dur: d / SPEED[mode], steps: null, engine: 'line' }];
    if (!silent) toast(T('routeFail'), 4500);
  } else if (!silent) hideToast();
  list.forEach(r => { r.destId = dest.id; r.room = SELECTED_ROOM; r.startLabel = s.label; r.fromGps = !!s.gps; r.start = s; r.mode = mode; prepRoute(r); });
  return list;
}

/* =====================================================================
   DIRECTIONS (preview)
   ===================================================================== */
async function startDirections() {
  enableCompass();
  if (!SELECTED) return;
  ensureMap();
  if (NAV.on) endNav(true);
  if (!START && !USER && navigator.geolocation) { toast(T('locating'), 7000); await gpsOnce(6000); hideToast(); }
  const dest = SELECTED, s = defaultStart();
  const list = await computeRoutes(s, dest, MODE);
  if (!SELECTED || SELECTED.id !== dest.id) return;                 // user moved on while we were routing
  ROUTES = list; ROUTE = list[0];
  setUIMode('preview'); closeOverlay('results');
  renderRoutePanel(); drawRoute(false); refreshMarkers();
}
function setMode(m) {
  if (m === MODE && ROUTE) return;
  MODE = m; if (SELECTED && (UI_MODE === 'preview')) startDirections(); else renderRoutePanel();
}
function selectAlt(i) { if (!ROUTES[i]) return; ROUTE = ROUTES[i]; renderRoutePanel(); drawRoute(false); }
function routeDestName() { const p = ROUTE && PLACES.find(x => x.id === ROUTE.destId); return p ? dl(p) : ''; }
function renderRoutePanel() {
  if (!ROUTE) return;
  const sp = SPEED[ROUTE.mode || MODE];
  const secs = ROUTE.engine === 'line' ? ROUTE.dist / sp : ROUTE.dur;
  $('rpFrom').textContent = ROUTE.startLabel; $('rpTo').textContent = routeDestName();
  $('rpTime').textContent = Math.max(1, Math.round(secs / 60)) + ' ' + T('min');
  $('rpMeta').textContent = fmtDist(ROUTE.dist) + (ROUTE.room ? ' · ' + roomText(ROUTE.room) : '');
  $('rpModeFoot').classList.toggle('on', MODE === 'foot'); $('rpModeBike').classList.toggle('on', MODE === 'bike');
  const note = $('rpNote');
  let msg = '';
  if (ROUTE.engine === 'line') msg = T('routeFail');
  else if (!ROUTE.fromGps && USER && hav([USER.lat, USER.lon], [ROUTE.start.lat, ROUTE.start.lon]) > 150) msg = T('notAtStart');
  note.style.display = msg ? 'inline-flex' : 'none'; note.textContent = msg;
  const alts = $('rpAlts'); alts.innerHTML = '';
  alts.style.display = ROUTES.length > 1 ? 'flex' : 'none';
  ROUTES.forEach((r, i) => {
    const b = document.createElement('button'); b.className = 'chip' + (r === ROUTE ? ' on' : '');
    b.textContent = Math.max(1, Math.round(r.dur / 60)) + ' ' + T('min') + ' · ' + fmtDist(r.dist); b.onclick = () => selectAlt(i); alts.appendChild(b);
  });
  $('rpSim').style.display = ROUTE.engine === 'line' ? 'none' : 'inline-flex';
  if ($('steps').classList.contains('active')) renderSteps();
}
function drawRoute(keepView) {
  if (!ROUTE || !routeLayer || !map) return;
  routeLayer.clearLayers();
  ROUTES.forEach(r => { if (r !== ROUTE && !NAV.on) L.polyline(r.coords, { color: '#94A3B8', weight: 6, opacity: .8, lineCap: 'round' }).on('click', () => selectAlt(ROUTES.indexOf(r))).addTo(routeLayer); });
  const line = ROUTE.engine === 'line';
  L.polyline(ROUTE.coords, { color: '#fff', weight: 11, opacity: .95, lineCap: 'round', lineJoin: 'round' }).addTo(routeLayer);
  L.polyline(ROUTE.coords, { color: line ? '#F59E0B' : '#2F80ED', weight: 6, dashArray: line ? '2 10' : null, lineCap: 'round', lineJoin: 'round' }).addTo(routeLayer);
  if (!keepView && !NAV.on) map.fitBounds(L.polyline(ROUTE.coords).getBounds(), { paddingTopLeft: [24, 24], paddingBottomRight: [24, 250] });
}
function closeRoute(quiet) {
  if (NAV.on) endNav(true);
  ROUTE = null; ROUTES = [];
  if (routeLayer) routeLayer.clearLayers();
  if (!quiet) { setStart(null); setUIMode('browse'); refreshMarkers(); }
}
function closeArrived() { ROUTE = null; ROUTES = []; if (routeLayer) routeLayer.clearLayers(); setStart(null); setUIMode('browse'); refreshMarkers(); }

/* =====================================================================
   STEP TEXT
   ===================================================================== */
const DIRS = {
  en: { left: 'Turn left', right: 'Turn right', 'slight left': 'Bear left', 'slight right': 'Bear right', 'sharp left': 'Turn sharp left', 'sharp right': 'Turn sharp right', straight: 'Continue straight', uturn: 'Make a U-turn' },
  zh: { left: '左转', right: '右转', 'slight left': '稍向左转', 'slight right': '稍向右转', 'sharp left': '向左急转', 'sharp right': '向右急转', straight: '直行', uturn: '掉头' }
};
const DIR_ICON = { left: ['fa-arrow-left', 0], right: ['fa-arrow-right', 0], 'slight left': ['fa-arrow-up', -40], 'slight right': ['fa-arrow-up', 40], 'sharp left': ['fa-arrow-left', 0], 'sharp right': ['fa-arrow-right', 0], straight: ['fa-arrow-up', 0], uturn: ['fa-rotate-left', 0] };
const iconHtml = info => `<i class="fa-solid ${info.icon}"${info.rot ? ` style="transform:rotate(${info.rot}deg)"` : ''}></i>`;
function stepInfo(s) {
  const m = s.maneuver || {}, road = roadName((s.name || '').trim()), zh = lang === 'zh';
  if (m.type === 'depart') return { icon: 'fa-person-walking', text: zh ? '出发' + (road ? '，沿' + road : '') : 'Start' + (road ? ' on ' + road : '') };
  if (m.type === 'arrive') {
    const side = m.modifier === 'left' ? (zh ? '，目的地在左侧' : ', on your left') : m.modifier === 'right' ? (zh ? '，目的地在右侧' : ', on your right') : '';
    return { icon: 'fa-flag-checkered', text: (zh ? '到达目的地' : 'Arrive at destination') + side + (ROUTE && ROUTE.room ? ' · ' + roomText(ROUTE.room) : ''), end: true };
  }
  if (/roundabout|rotary/.test(m.type)) return { icon: 'fa-rotate-right', text: zh ? '进入环岛' : 'Enter the roundabout' };
  const mod = m.modifier || 'straight', verb = DIRS[lang][mod] || DIRS[lang].straight, di = DIR_ICON[mod] || DIR_ICON.straight;
  return { icon: di[0], rot: di[1], text: verb + (road ? (zh ? '，进入' + road : ' onto ' + road) : '') };
}
function renderSteps() {
  const list = $('stepsList'), sub = $('stepsSub'); if (!list) return;
  list.innerHTML = '';
  if (!ROUTE) { sub.textContent = ''; list.innerHTML = `<div class="white-card rounded-2xl p-5 text-center text-sm text-slate-500"><i class="fa-solid fa-route text-2xl text-skyBlue mb-2"></i><p>${esc(T('noRoute'))}</p><button onclick="showScreen('map')" class="primary-btn mt-3 px-5 py-2 rounded-full text-xs font-semibold">${esc(T('navMap'))}</button></div>`; return; }
  sub.textContent = `${ROUTE.startLabel} → ${routeDestName()} · ${fmtDist(ROUTE.dist)} · ${Math.max(1, Math.round((ROUTE.engine === 'line' ? ROUTE.dist / SPEED[ROUTE.mode || 'foot'] : ROUTE.dur) / 60))} ${T('min')}`;
  ROUTE.steps.forEach((s, i) => {
    const info = stepInfo(s), cur = NAV.on && i === NAV.idx;
    const d = document.createElement('div');
    d.className = 'step-card rounded-2xl p-4' + (cur ? ' current' : ''); if (info.end) d.style.borderLeftColor = '#10B981';
    d.innerHTML = `<div class="flex gap-3 items-center"><div class="w-9 h-9 rounded-full ${info.end ? 'bg-emerald-500' : 'bg-skyBlue'} text-white flex items-center justify-center shrink-0">${iconHtml(info)}</div>
      <div><p class="font-bold text-navySoft text-sm">${esc(info.text)}</p>${s.distance ? `<p class="text-xs text-slate-500">${fmtDist(s.distance)}</p>` : ''}</div></div>`;
    list.appendChild(d);
  });
}
function renderNavLang() { if (UI_MODE === 'preview') renderRoutePanel(); if (NAV.on) updateNavUI(); }

/* =====================================================================
   LIVE NAVIGATION
   ===================================================================== */
function speak(text) {
  if (!NAV.voice || !('speechSynthesis' in window)) return;
  try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.lang = lang === 'zh' ? 'zh-CN' : 'en-US'; speechSynthesis.speak(u); } catch (e) {}
}
function toggleVoice() {
  NAV.voice = !NAV.voice; store.set('mm_voice', NAV.voice ? '1' : '0');
  const t = $('voiceToggle'); if (t) { t.classList.toggle('on', NAV.voice); t.setAttribute('aria-checked', NAV.voice); }
  if (NAV.on) updateNavUI();
  if (NAV.voice) speak(T('voiceOn'));
}
async function requestWake() { try { if ('wakeLock' in navigator) NAV.wake = await navigator.wakeLock.request('screen'); } catch (e) {} }
function releaseWake() { try { NAV.wake && NAV.wake.release(); } catch (e) {} NAV.wake = null; }
document.addEventListener('visibilitychange', () => { if (!document.hidden && NAV.on && !NAV.wake) requestWake(); });

function beginNav(sim) {
  if (!ROUTE) return;
  if (NAV.timer) { clearInterval(NAV.timer); NAV.timer = null; }
  Object.assign(NAV, { on: true, sim, follow: true, prog: 0, idx: 0, offCount: 0, spoken: {}, rerouting: false, lastReroute: Date.now() });
  setUIMode('nav');
  if (map) { map.closePopup(); drawRoute(true); refreshMarkers(); }
  $('nbRecenter').style.display = 'none';
  if (sim) {
    let d = 0; const step = Math.max(14, ROUTE.total / 90);
    USER = Object.assign({}, USER || {}, { lat: ROUTE.coords[0][0], lon: ROUTE.coords[0][1], acc: 5, speed: 1.4 });
    NAV.timer = setInterval(() => {
      d += step; const pt = pointAt(ROUTE, d);
      USER = { lat: pt.lat, lon: pt.lon, acc: 5, heading: pt.heading, speed: 1.4, t: Date.now() };
      placeUserMarker(); updateUserArrow(); navTick();
      if (d > ROUTE.total + 30) { clearInterval(NAV.timer); NAV.timer = null; }
    }, 500);
    toast(T('previewing'), 3500);
  } else {
    speak(T('navStarted'));
    if (!USER) navStatus(T('locating'));
    startGPS(() => navTick());
    if (USER) navTick();
  }
  requestWake(); updateNavUI();
  if (USER && map) { map.setView([USER.lat, USER.lon], 18, { animate: true }); placeUserMarker(); updateUserArrow(); }
}
function startNav() { beginNav(false); }
function simulateNav() { beginNav(true); }
function endNav(quiet) {
  if (NAV.timer) { clearInterval(NAV.timer); NAV.timer = null; }
  const was = NAV.on; NAV.on = false; NAV.sim = false;
  try { speechSynthesis.cancel(); } catch (e) {}
  releaseWake(); navStatus(null);
  const rb = $('nbRecenter'); if (rb) rb.style.display = 'none';
  updateUserArrow();
  if (was && !quiet) { setUIMode('preview'); renderRoutePanel(); if (ROUTE && map) drawRoute(false); refreshMarkers(); toast(T('navEnded'), 2500); }
}
function navTick() {
  if (!NAV.on || !USER || !ROUTE) return;
  const sn = snapToRoute(ROUTE, USER.lat, USER.lon);
  const limit = Math.max(45, (USER.acc || 20) * 1.4);
  if (!NAV.sim) {
    // far from the line for three fixes in a row → plan a new route from where you really are
    NAV.offCount = sn.off > limit ? NAV.offCount + 1 : 0;
    if (NAV.offCount >= 3 && !NAV.rerouting && Date.now() - NAV.lastReroute > 10000) { reroute(); return; }
    if (sn.off > limit) navStatus(T('offRoute')); else if ($('nbStatus').textContent === T('offRoute')) navStatus(null);
  }
  NAV.prog = Math.max(NAV.prog - 25, sn.prog);                       // never jump far backwards on GPS noise
  const steps = ROUTE.steps; let idx = 0;
  for (let i = 0; i < steps.length; i++) if (steps[i].prog <= NAV.prog + 8) idx = i;
  NAV.idx = Math.min(idx, steps.length - 1);
  const remain = Math.max(0, ROUTE.total - NAV.prog);
  const next = steps[Math.min(NAV.idx + 1, steps.length - 1)];
  const dNext = Math.max(0, next.prog - NAV.prog);
  if (remain < Math.max(20, Math.min(35, (USER.acc || 0) * 0.7))) { arrived(); return; }
  if (dNext < 70 && !NAV.spoken[NAV.idx + 1]) {
    NAV.spoken[NAV.idx + 1] = 1;
    const info = stepInfo(next);
    speak(next.maneuver && next.maneuver.type === 'arrive' ? info.text : fmt(T('speakIn'), { d: Math.max(10, Math.round(dNext / 10) * 10), a: info.text }));
  }
  updateNavUI();
  if (NAV.follow && map) map.setView([USER.lat, USER.lon], Math.max(map.getZoom(), 17), { animate: true, duration: .4 });
}
function updateNavUI() {
  if (!NAV.on || !ROUTE) return;
  const steps = ROUTE.steps, next = steps[Math.min(NAV.idx + 1, steps.length - 1)], info = stepInfo(next);
  const after = steps[NAV.idx + 2], remain = Math.max(0, ROUTE.total - NAV.prog), dNext = Math.max(0, next.prog - NAV.prog);
  const sp = SPEED[ROUTE.mode || 'foot'], secs = remain / sp, eta = new Date(Date.now() + secs * 1000);
  $('ntIcon').innerHTML = iconHtml(info);
  $('ntDist').textContent = fmtDist(dNext);
  $('ntText').textContent = info.text;
  $('ntThen').textContent = after ? T('then') + ' ' + stepInfo(after).text : '';
  $('nbEta').textContent = eta.getHours() + ':' + String(eta.getMinutes()).padStart(2, '0');
  $('nbTime').textContent = Math.max(1, Math.round(secs / 60));
  $('nbDist').textContent = fmtDist(remain);
  const v = $('nbVoice'); v.innerHTML = `<i class="fa-solid ${NAV.voice ? 'fa-volume-high' : 'fa-volume-xmark'} text-navySoft"></i>`; v.setAttribute('aria-pressed', NAV.voice);
  if (NAV.sim) navStatus(T('previewTag'));
  if ($('steps').classList.contains('active')) renderSteps();
}
function arrived() {
  const name = routeDestName();
  speak(T('arrivedVoice'));
  endNav(true);
  setUIMode('arrived');
  $('acText').textContent = name;
  if (ROUTE && map) { const last = ROUTE.coords[ROUTE.coords.length - 1]; map.setView(last, 18, { animate: true }); }
}
async function reroute() {
  NAV.rerouting = true; NAV.lastReroute = Date.now(); NAV.offCount = 0;
  toast(T('rerouting'), 2500); speak(T('rerouting'));
  const dest = PLACES.find(p => p.id === ROUTE.destId);
  try {
    if (dest && USER) {
      const list = await computeRoutes({ lat: USER.lat, lon: USER.lon, label: T('myLocation'), gps: true }, dest, ROUTE.mode || MODE, true);
      if (NAV.on) { ROUTES = list; ROUTE = list[0]; NAV.prog = 0; NAV.idx = 0; NAV.spoken = {}; drawRoute(true); }
    }
  } finally { NAV.rerouting = false; }
  updateNavUI();
}
function recenterNav() { NAV.follow = true; $('nbRecenter').style.display = 'none'; if (USER && map) map.setView([USER.lat, USER.lon], Math.max(map.getZoom(), 17), { animate: true }); }

/* =====================================================================
   WIRING
   ===================================================================== */
function onMapReady() {
  map.on('dragstart', () => { if (NAV.on && NAV.follow) { NAV.follow = false; $('nbRecenter').style.display = 'block'; } });
  if (START) setStart(START);
  if (ROUTE) drawRoute(false);
}
function navInit() {
  NAV.voice = store.get('mm_voice', '0') === '1';
  const t = $('voiceToggle'); if (t) { t.classList.toggle('on', NAV.voice); t.setAttribute('aria-checked', NAV.voice); }
  const q = $('startQ'); if (q) q.addEventListener('input', () => renderStartList(q.value));
}