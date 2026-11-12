/* MapMinds — "I am here" by scanning a campus QR sign.
   Understands: the Unity project's codes (QR_LIBRARY_001), QR_<PLACE-ID>_001, MapMinds links (…#p=<id>) and bare place ids. */
'use strict';

let GRAPH = null, qrStream = null, qrTimer = null, qrDetector = null, qrBusy = false;

async function loadGraph() {
  try { const r = await fetch('campus-graph.json'); if (r.ok) GRAPH = await r.json(); } catch (e) {}
}
function resolveQR(text) {
  text = String(text || '').trim(); if (!text) return null;
  let id = null, m;
  if ((m = text.match(/[#&?]p=([^&\s]+)/))) id = decodeURIComponent(m[1]);
  if (!id && GRAPH) { const n = (GRAPH.nodes || []).find(x => x.qrId === text); if (n) id = n.placeId || n.id; }
  if (!id && (m = text.match(/^QR_(.+)_\d+$/i))) id = m[1].toLowerCase();
  if (!id) id = text;
  const key = norm(id);
  return PLACES.find(p => norm(p.id) === key) || PLACES.find(p => norm(p.id).replace(/[^a-z0-9]/g, '') === key.replace(/[^a-z0-9]/g, '')) || null;
}
function applyQR(text) {
  const p = resolveQR(text);
  if (!p) { $('qrMsg').textContent = T('qrUnknown') + ' ' + String(text).slice(0, 40); return false; }
  closeQR();
  setStart({ lat: p.lat, lon: p.lon, label: nm(p) });
  showScreen('map');
  setTimeout(() => {
    map.flyTo([p.lat, p.lon], 18, { duration: .6 });
    toast(fmt(T('qrSet'), { n: nm(p) }), 3500);
    if (SELECTED && SELECTED.id !== p.id) startDirections();
  }, 150);
  return true;
}
function stopQR() {
  clearInterval(qrTimer); qrTimer = null;
  if (qrStream) { qrStream.getTracks().forEach(t => t.stop()); qrStream = null; }
  const v = $('qrVideo'); if (v) v.srcObject = null;
}
function closeQR() { stopQR(); closeOverlay('qr'); }
async function openQR() {
  openOverlay('qr'); $('qrMsg').textContent = T('qrAim'); $('qrManual').value = '';
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { $('qrMsg').textContent = T('qrNoCam'); return; }
  try {
    qrStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
    const v = $('qrVideo'); v.srcObject = qrStream; await v.play();
  } catch (e) { $('qrMsg').textContent = T('qrNoCam'); return; }
  if ('BarcodeDetector' in window) { try { qrDetector = new BarcodeDetector({ formats: ['qr_code'] }); } catch (e) { qrDetector = null; } }
  if (!qrDetector && !window.jsQR) await new Promise(res => { const s = document.createElement('script'); s.src = 'vendor/lib/jsqr.min.js'; s.onload = res; s.onerror = res; document.head.appendChild(s); });
  const cv = document.createElement('canvas'), cx = cv.getContext('2d', { willReadFrequently: true });
  qrTimer = setInterval(async () => {
    const v = $('qrVideo'); if (qrBusy || !v || v.readyState < 2 || !v.videoWidth) return;
    qrBusy = true;
    try {
      let text = null;
      if (qrDetector) { const r = await qrDetector.detect(v); if (r && r[0]) text = r[0].rawValue; }
      else if (window.jsQR) {
        const w = Math.min(640, v.videoWidth), h = Math.round(w * v.videoHeight / v.videoWidth); cv.width = w; cv.height = h; cx.drawImage(v, 0, 0, w, h);
        const r = jsQR(cx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'dontInvert' }); if (r) text = r.data;
      }
      if (text && applyQR(text)) { /* done */ } else if (text) { /* unknown code: message already shown, keep scanning */ }
    } catch (e) {} finally { qrBusy = false; }
  }, 220);
}
function submitQRManual() { const t = $('qrManual').value.trim(); if (t) applyQR(t); }
loadGraph();
