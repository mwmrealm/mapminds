/* MapMinds — strings added in v4 (merged into the I18N table from app.js) */
'use strict';
Object.assign(I18N.en, {
  startNav: 'Start', preview: 'Preview', previewing: 'Previewing the route at high speed', previewTag: 'preview', navStarted: 'Navigation started',
  navEnded: 'Navigation ended', min: 'min', arriveAt: 'Arrive', speakIn: 'In {d} meters, {a}', arrived: 'You have arrived at', arrivedVoice: 'You have arrived',
  rerouting: 'Rerouting…', voiceOn: 'Voice guidance on', voice: 'Voice guidance', voiceHint: 'Speak turn instructions while navigating',
  noGps: 'Location is off — starting from the campus centre. Allow location for accurate directions.',
  offCampus: 'You are far from campus — starting from the nearest gate.',
  startFrom: 'Start from…', pickOnMap: 'Choose on map', scanQr: 'Scan a campus QR code', scanQrSub: 'Signs on buildings tell the app where you are', endNav: 'End',
  gpsWeak: 'Weak GPS signal — still searching…', gpsOff: 'Location blocked. Allow it in your browser or phone settings.',
  qrTitle: 'Scan QR code', qrAim: 'Point the camera at a MapMinds QR sign', qrNoCam: 'Camera unavailable — type the code below instead.', qrUnknown: 'Unknown code:', qrSet: 'You are at {n}', qrManualPh: 'or type a code, e.g. QR_LIBRARY_001', qrGo: 'Go',
  editorMode: 'Fix locations (editor)', editorSub: 'Drag pins to their true position, long-press the map to add a place', editorHint: 'Editor on: drag a pin to move it. Long-press the map to add a place.',
  editCount: '{n} correction(s) saved on this device', editNone: 'No corrections yet', exportBtn: 'Export corrected CSV', resetEdits: 'Discard my corrections',
  addName: 'Name of the new place (中文 or English):', addCat: 'Category — type one of:', added: 'Place added', confirmDel: 'Delete this place you added?', confirmReset: 'Discard all your location corrections on this device?',
  exported: 'campus-places.csv saved — replace the file on your server with it', addHere: 'Add place here', delPlace: 'Delete', mapData: 'Map data', editorOnBar: 'Editor mode — drag pins to correct them', done: 'Done',
  dataBuiltin: 'Built-in campus list', dataLive: 'Live map data', dataSnapshot: 'Saved map data', dataSource: 'Source', builtinOnly: 'Live OpenStreetMap data is unreachable from here — showing the built-in campus list.',
  mapLangNote: 'Street names on the map tiles follow the map provider; place names in MapMinds follow your language.'
});
Object.assign(I18N.zh, {
  startNav: '开始', preview: '预览', previewing: '正在快速预览路线', previewTag: '预览', navStarted: '导航已开始',
  navEnded: '导航已结束', min: '分钟', arriveAt: '预计到达', speakIn: '前方{d}米，{a}', arrived: '你已到达', arrivedVoice: '你已到达目的地',
  rerouting: '正在重新规划路线…', voiceOn: '语音导航已开启', voice: '语音导航', voiceHint: '导航时语音播报转向提示',
  noGps: '定位未开启——将从校园中心出发。允许定位可获得准确路线。',
  offCampus: '你离校园较远——将从最近的校门出发。',
  startFrom: '从哪里出发…', pickOnMap: '在地图上选择', scanQr: '扫描校园二维码', scanQrSub: '楼宇上的标识牌可告诉应用你的位置', endNav: '结束',
  gpsWeak: 'GPS 信号较弱，仍在搜索…', gpsOff: '定位被禁止，请在浏览器或手机设置中允许。',
  qrTitle: '扫描二维码', qrAim: '将摄像头对准 MapMinds 二维码标识', qrNoCam: '无法使用摄像头——请在下方输入编码。', qrUnknown: '无法识别的编码：', qrSet: '你在 {n}', qrManualPh: '或输入编码，如 QR_LIBRARY_001', qrGo: '确定',
  editorMode: '修正位置（编辑模式）', editorSub: '拖动图钉到真实位置，长按地图可添加地点', editorHint: '编辑模式已开启：拖动图钉即可移动，长按地图可添加地点。',
  editCount: '本设备已保存 {n} 处修正', editNone: '暂无修正', exportBtn: '导出修正后的 CSV', resetEdits: '放弃我的修正',
  addName: '新地点名称（中文或英文）：', addCat: '类别——请输入其中之一：', added: '已添加地点', confirmDel: '删除你添加的这个地点？', confirmReset: '放弃本设备上的所有位置修正？',
  exported: 'campus-places.csv 已保存——用它替换服务器上的同名文件', addHere: '在此添加地点', delPlace: '删除', mapData: '地图数据', editorOnBar: '编辑模式——拖动图钉进行修正', done: '完成',
  dataBuiltin: '内置校园地点', dataLive: '实时地图数据', dataSnapshot: '已保存的地图数据', dataSource: '数据来源', builtinOnly: '当前无法连接 OpenStreetMap 实时数据——正在显示内置校园地点。',
  mapLangNote: '地图底图上的街道名称由地图服务商决定；MapMinds 中的地点名称会随你的语言切换。'
});

Object.assign(I18N.en, {
  useGps: 'Use my GPS position', shiftAll: 'Shift all places the same way', nameNeeded: 'Enter a Chinese or English name',
  gpsNeeded: 'Waiting for your GPS position — try again in a moment', gpsAcc: 'GPS accuracy is only ±{n} m — stand in the open for a better fix',
  confirmShift: 'Move {n} curated places by {m} m so they match where you are standing now?', shiftDone: 'All places shifted by {m} m',
  editorUnlocked: 'Map editor unlocked — see Settings', then: 'Then', offRoute: 'Off route — rerouting if this continues', notAtStart: 'You are not at the start point — follow the route to it, or tap Change.'
});
Object.assign(I18N.zh, {
  useGps: '使用我的 GPS 位置', shiftAll: '同步平移所有地点', nameNeeded: '请输入中文或英文名称',
  gpsNeeded: '正在等待 GPS 定位，请稍后再试', gpsAcc: 'GPS 精度仅 ±{n} 米，请到空旷处再试',
  confirmShift: '将 {n} 个预置地点整体平移 {m} 米，使其与你当前站立的位置吻合？', shiftDone: '所有地点已平移 {m} 米',
  editorUnlocked: '地图编辑器已解锁，请在设置中查看', then: '然后', offRoute: '偏离路线，持续偏离将重新规划', notAtStart: '你不在起点，请先前往起点，或点击“更改”。'
});
Object.assign(I18N.en, { catEmpty: 'No places in this category yet — they appear when live map data loads, or add them in the map editor.' });
Object.assign(I18N.zh, { catEmpty: '该分类暂无地点：联网加载实时地图数据后会出现，也可在地图编辑器中添加。' });
