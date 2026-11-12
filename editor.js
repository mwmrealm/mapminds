/* MapMinds — map editor (hidden: tap the version line in Settings 5 times, or open the app with ?edit=1).
   Stand on campus, drag a pin onto its real building (satellite layer helps), or use "my GPS position" while standing at the door.
   Corrections live in this browser (OVER / CUSTOM / HIDDEN in app.js) and can be exported as a new campus-places.csv
   that you publish for everybody.  Everything here goes through app.js: rebuildPlaces() merges the corrections. */
'use strict';

let EDIT_TARGET = null;                       // place being edited in the form; null = adding a new one
let EDIT_NEW_POS = null;                      // position for a place being added

function saveOverrides() {
  store.set('mm_over', JSON.stringify(OVER)); store.set('mm_custom', JSON.stringify(CUSTOM)); store.set('mm_hidden', JSON.stringify(HIDDEN));
}
function editCount() { return Object.keys(OVER).length + CUSTOM.length + HIDDEN.length; }
function refreshAfterEdit() {
  saveOverrides(); rebuildPlaces(); renderDynamic();
  const i = $('ebInfo'); if (i) i.textContent = T('editorOnBar') + ' · ' + (editCount() ? fmt(T('editCount'), { n: editCount() }) : T('editNone'));
}

function editorEnter() {
  showScreen('map'); ensureMap();
  SELECTED = null; closeRoute(true); setUIMode('edit');
  refreshAfterEdit(); toast(T('editorHint'), 5000);
  map.invalidateSize();
}
function editorExit() { setUIMode('browse'); SELECTED = null; refreshMarkers(); syncMapUI(); }
function editorMapClick() { return false; }                 // taps on empty map do nothing in edit mode (long-press shows coordinates)

function editorDragEnd(p, ll) {
  OVER[p.id] = Object.assign({}, OVER[p.id], { lat: +ll.lat.toFixed(6), lon: +ll.lng.toFixed(6) });
  refreshAfterEdit(); toast(nm(p) + ' → ' + OVER[p.id].lat + ', ' + OVER[p.id].lon, 3500);
}

/* ---------- edit form ---------- */
function fillCatSelect(sel) {
  const s = $('efCat'); s.innerHTML = '';
  Object.keys(CATS).forEach(c => { const o = document.createElement('option'); o.value = c; o.textContent = catLabel(c); s.appendChild(o); });
  s.value = sel && CATS[sel] ? sel : 'building';
}
function editorSelect(p) {
  EDIT_TARGET = p; EDIT_NEW_POS = null;
  $('efTitle').textContent = dl(p);
  $('efZh').value = zhName(p) || ''; $('efEn').value = p.en || '';
  fillCatSelect(p.cat);
  $('efDelete').style.display = 'inline-block';
  $('efGps').style.display = 'inline-flex'; $('efShift').style.display = 'inline-flex';
  openOverlay('editForm');
}
function editorAdd() {
  const c = map.getCenter();
  EDIT_TARGET = null; EDIT_NEW_POS = { lat: +c.lat.toFixed(6), lon: +c.lng.toFixed(6) };
  $('efTitle').textContent = T('addPlace');
  $('efZh').value = ''; $('efEn').value = ''; fillCatSelect('building');
  $('efDelete').style.display = 'none'; $('efGps').style.display = 'none'; $('efShift').style.display = 'none';
  openOverlay('editForm');
}
function editorSave() {
  const zh = $('efZh').value.trim(), en = $('efEn').value.trim(), cat = $('efCat').value;
  if (!zh && !en) { toast(T('nameNeeded'), 2500); return; }
  if (EDIT_TARGET) {
    OVER[EDIT_TARGET.id] = Object.assign({}, OVER[EDIT_TARGET.id], { zh, en, cat });
  } else if (EDIT_NEW_POS) {
    CUSTOM.push({ id: 'u' + Date.now().toString(36), own: true, cat, lat: EDIT_NEW_POS.lat, lon: EDIT_NEW_POS.lon, code: '', zh, en, name: zh || en, approx: false, aliases: [] });
    toast(T('added'), 2500);
  }
  closeOverlay('editForm'); refreshAfterEdit();
}
function editorDelete() {
  if (!EDIT_TARGET || !confirm(T('confirmDel'))) return;
  const id = EDIT_TARGET.id, ci = CUSTOM.findIndex(c => c.id === id);
  if (ci >= 0) CUSTOM.splice(ci, 1); else if (!HIDDEN.includes(id)) HIDDEN.push(id);
  delete OVER[id]; closeOverlay('editForm'); SELECTED = null; refreshAfterEdit();
}
function gpsNow() {
  if (!USER) { toast(T('gpsNeeded'), 3500); startGPS(); return null; }
  if (USER.acc > 40) toast(fmt(T('gpsAcc'), { n: Math.round(USER.acc) }), 3500);
  return { lat: +USER.lat.toFixed(6), lon: +USER.lon.toFixed(6) };
}
function editorUseGps() {                                   // put this pin where I am standing
  const p = EDIT_TARGET, pos = gpsNow(); if (!p || !pos) return;
  OVER[p.id] = Object.assign({}, OVER[p.id], pos);
  closeOverlay('editForm'); refreshAfterEdit(); map.flyTo([pos.lat, pos.lon], 19); toast(nm(p) + ' → ' + pos.lat + ', ' + pos.lon, 3500);
}
function editorShiftAll() {                                 // same correction for every curated place (fixes a systematic offset)
  const p = EDIT_TARGET, pos = gpsNow(); if (!p || !pos) return;
  const dLat = pos.lat - p.lat, dLon = pos.lon - p.lon, m = Math.round(hav([p.lat, p.lon], [pos.lat, pos.lon]));
  if (!confirm(fmt(T('confirmShift'), { m, n: PLACES.filter(x => x.own).length }))) return;
  PLACES.filter(x => x.own).forEach(x => { const o = OVER[x.id] || {}; OVER[x.id] = Object.assign({}, o, { lat: +((o.lat != null ? o.lat : x.lat) + dLat).toFixed(6), lon: +((o.lon != null ? o.lon : x.lon) + dLon).toFixed(6) }); });
  closeOverlay('editForm'); refreshAfterEdit(); map.flyTo([pos.lat, pos.lon], 18); toast(fmt(T('shiftDone'), { m }), 4500);
}
function editorReset() {
  if (!confirm(T('confirmReset'))) return;
  OVER = {}; CUSTOM = []; HIDDEN = []; refreshAfterEdit(); toast(T('cleared'));
}

/* ---------- export ---------- */
const csvCell = v => { v = String(v == null ? '' : v); return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
function editorExport() {
  const rows = [['id', 'code', 'zh', 'en', 'category', 'lat', 'lon', 'crs', 'conf', 'aliases']];
  PLACES.filter(p => p.own || p.edited).forEach(p => {
    rows.push([p.id, p.code || '', zhName(p), p.en || '', p.cat, (+p.lat).toFixed(6), (+p.lon).toFixed(6), 'wgs84', p.approx ? 'approx' : 'high', (p.aliases || []).join(';')]);
  });
  const csv = '﻿' + rows.map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
  try {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); a.download = 'campus-places.csv';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast(T('exported'), 4500);
  } catch (e) { if (navigator.clipboard) navigator.clipboard.writeText(csv).then(() => toast(T('copied'))); }
}

/* ---------- unlocking ---------- */
function showEditorRow() { const r = $('editorRow'); if (r) r.style.display = 'flex'; }
function editorInit() {
  if (store.get('mm_editor', '0') === '1' || /[?&]edit=1/.test(location.search)) { store.set('mm_editor', '1'); showEditorRow(); }
  let taps = 0, last = 0; const v = $('verTap');
  if (v) v.addEventListener('click', () => {
    const now = Date.now(); taps = now - last < 1200 ? taps + 1 : 1; last = now;
    if (taps >= 5) { taps = 0; store.set('mm_editor', '1'); showEditorRow(); toast(T('editorUnlocked'), 3000); }
  });
}
