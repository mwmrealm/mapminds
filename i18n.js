/* MapMinds i18n: UI strings + Chinese -> English place-name translator (offline) */
'use strict';

const CJK = /[一-龥]/;

/* =====================================================================
   PLACE-NAME TRANSLATOR
   Chinese name  ->  English (known words translated, proper names in pinyin)
   ===================================================================== */
const TERMS = {
  // campus / institutions
  '郑州大学': 'Zhengzhou University', '郑大': 'ZZU', '主校区': 'Main Campus', '南校区': 'South Campus', '北校区': 'North Campus', '东校区': 'East Campus', '新校区': 'New Campus', '校区': 'Campus', '校园': 'Campus', '大学': 'University', '学院': 'College', '附属': 'Affiliated', '第一附属医院': 'First Affiliated Hospital', '校医院': 'Campus Clinic',
  '核心': 'Core', '教学区': 'Teaching Area', '教学': 'Teaching', '行政': 'Administration', '综合': 'Comprehensive', '管理': 'Management', '服务': 'Service', '科学': 'Science', '科技': 'Science and Technology', '创新': 'Innovation', '创业': 'Entrepreneurship', '国际': 'International', '教育': 'Education', '交流': 'Exchange', '学生': 'Student', '青年': 'Youth', '活动': 'Activity', '文化': 'Culture', '艺术': 'Art', '美术': 'Fine Arts', '音乐': 'Music', '书法': 'Calligraphy', '体育': 'Physical Education', '运动': 'Sports', '健身': 'Fitness', '游泳': 'Swimming', '篮球': 'Basketball', '足球': 'Football', '网球': 'Tennis', '排球': 'Volleyball', '羽毛球': 'Badminton', '乒乓球': 'Table Tennis', '田径': 'Track and Field',
  // disciplines
  '机械': 'Mechanical', '动力': 'Power', '工程': 'Engineering', '化工': 'Chemical Engineering', '化学': 'Chemistry', '物理': 'Physics', '数学': 'Mathematics', '统计': 'Statistics', '生命科学': 'Life Sciences', '生物': 'Biology', '医学': 'Medicine', '药学': 'Pharmacy', '护理': 'Nursing', '公共卫生': 'Public Health', '口腔': 'Stomatology', '基础医学': 'Basic Medicine', '临床': 'Clinical', '法学': 'Law', '政治': 'Politics', '公共管理': 'Public Administration', '经济': 'Economics', '外语': 'Foreign Languages', '外国语': 'Foreign Languages', '语言': 'Languages', '文学': 'Literature', '历史': 'History', '哲学': 'Philosophy', '新闻': 'Journalism', '传播': 'Communication', '心理': 'Psychology', '信息': 'Information', '计算机': 'Computer Science', '软件': 'Software', '网络空间安全': 'Cyberspace Security', '电气': 'Electrical', '电子': 'Electronic', '材料': 'Materials', '水利': 'Water Conservancy', '土木': 'Civil', '建筑': 'Architecture', '环境': 'Environment', '地球': 'Earth', '地理': 'Geography', '农业': 'Agriculture', '生态': 'Ecology', '能源': 'Energy', '力学': 'Mechanics', '航空': 'Aeronautical', '汽车': 'Automotive', '纳米': 'Nano', '产业': 'Industry', '研究': 'Research', '实验': 'Experimental', '实训': 'Training', '测试': 'Testing', '国家': 'National', '重点': 'Key', '大': 'Great', '医科': 'Medical', '商': 'Business', '商学': 'Business',
  // services / transport
  '地铁': 'Metro', '公交': 'Bus', '校车': 'Shuttle', '停车': 'Parking', '机动车': 'Vehicle', '自行车': 'Bicycle', '共享单车': 'Shared Bikes', '快递': 'Express Delivery', '驿站': 'Station', '超市': 'Supermarket', '便利店': 'Convenience Store', '银行': 'Bank', '邮局': 'Post Office', '打印': 'Printing', '咖啡': 'Coffee', '奶茶': 'Milk Tea', '清真': 'Halal', '教工': 'Staff', '教师': 'Faculty', '留学生': 'International Students', '研究生': 'Graduate', '本科生': 'Undergraduate', '一卡通': 'Campus Card',
  // landmarks
  '钟楼': 'Clock Tower', '医科园': 'Medical Campus', '人工智能': 'Artificial Intelligence', '智能': 'Intelligent', '数据': 'Data', '大数据': 'Big Data', '雕塑': 'Sculpture', '湖': 'Lake', '山': 'Hill', '桥': 'Bridge', '亭': 'Pavilion', '塔': 'Tower', '碑': 'Monument', '河': 'River', '池': 'Pond', '西四环': 'West 4th Ring', '四环': '4th Ring', '三环': '3rd Ring',
  // connectors & numbers
  '与': 'and', '和': 'and', '及': 'and', '的': '', '第': 'No.',
  '一': '1', '二': '2', '三': '3', '四': '4', '五': '5', '六': '6', '七': '7', '八': '8', '九': '9', '十': '10',
  // directions
  '东南门': 'Southeast Gate', '东北门': 'Northeast Gate', '西南门': 'Southwest Gate', '西北门': 'Northwest Gate', '南门': 'South Gate', '北门': 'North Gate', '东门': 'East Gate', '西门': 'West Gate', '正门': 'Main Gate', '侧门': 'Side Gate', '后门': 'Back Gate',
  '东北': 'Northeast', '东南': 'Southeast', '西北': 'Northwest', '西南': 'Southwest', '东': 'East', '南': 'South', '西': 'West', '北': 'North', '中': 'Central', '正': 'Main', '校': 'Campus'
};
const SINGLE_DIR = new Set(['东', '南', '西', '北', '中', '正', '校', '大', '商', '山', '湖', '河', '池', '桥', '亭', '塔', '碑']);
// whole-name overrides for names we know exactly
const NAME_OVERRIDE = {
  '科学大道': 'Science Avenue', '莲花街': 'Lianhua Street', '长椿路': 'Changchun Road', '石楠路': 'Shinan Road', '翠竹街': 'Cuizhu Street', '西四环': 'West 4th Ring Road', '厚德大道': 'Houde Avenue',
  '郑州大学站': 'Zhengzhou Daxue Station', '郑大科技园站': 'ZZU Sci-Tech Park Station', '河南工业大学站': 'Henan University of Technology Station',
  '理学院': 'School of Science', '法学院': 'School of Law', '文学院': 'School of Liberal Arts', '医学院': 'School of Medicine', '工学院': 'School of Engineering', '农学院': 'School of Agriculture', '马克思主义学院': 'School of Marxism', '快递驿站': 'Parcel Pickup Station', '校友林': 'Alumni Forest',
  '钟楼': 'Clock Tower', '图书馆': 'Library', '综合管理中心': 'Administration Building', '行政楼': 'Administration Building'
};
// suffix rules, longest first. x = translated head (may be '')
const SUFFIX = [
  ['驿站', x => x ? x + ' Station' : 'Station'], ['科技园', x => x ? x + ' Science Park' : 'Science Park'], ['产业园', x => x ? x + ' Industrial Park' : 'Industrial Park'], ['工业园', x => x ? x + ' Industrial Park' : 'Industrial Park'], ['园区', x => x ? x + ' Park' : 'Park'],
  ['地铁站', x => (x ? x + ' ' : '') + 'Metro Station'], ['研究院', x => x ? x + ' Institute' : 'Institute'], ['实验室', x => x ? x + ' Laboratory' : 'Laboratory'], ['实验楼', x => x ? x + ' Laboratory Building' : 'Laboratory Building'],
  ['教学楼', x => x ? x + ' Teaching Building' : 'Teaching Building'], ['办公楼', x => x ? x + ' Office Building' : 'Office Building'], ['综合楼', x => x ? x + ' Complex' : 'Complex'], ['宿舍楼', x => x ? x + ' Dormitory' : 'Dormitory'],
  ['图书馆', x => x ? x + ' Library' : 'Library'], ['体育馆', x => x ? x + ' Gymnasium' : 'Gymnasium'], ['游泳馆', x => x ? x + ' Swimming Pool' : 'Swimming Pool'], ['体育场', x => x ? x + ' Stadium' : 'Stadium'], ['运动场', x => x ? x + ' Sports Field' : 'Sports Field'],
  ['篮球场', x => x ? x + ' Basketball Court' : 'Basketball Court'], ['足球场', x => x ? x + ' Football Field' : 'Football Field'], ['网球场', x => x ? x + ' Tennis Court' : 'Tennis Court'], ['餐饮中心', x => x ? x + ' Dining Center' : 'Dining Center'],
  ['停车场', x => x ? x + ' Parking Lot' : 'Parking Lot'], ['超市', x => x ? x + ' Supermarket' : 'Supermarket'], ['食堂', x => x ? x + ' Canteen' : 'Canteen'], ['餐厅', x => x ? x + ' Canteen' : 'Canteen'], ['宿舍', x => x ? x + ' Dormitory' : 'Dormitory'], ['公寓', x => x ? x + ' Apartments' : 'Apartments'],
  ['学院', x => x ? 'School of ' + x : 'School'], ['医院', x => x ? x + ' Hospital' : 'Hospital'], ['操场', x => x ? x + ' Sports Ground' : 'Sports Ground'], ['广场', x => x ? x + ' Square' : 'Square'], ['公园', x => x ? x + ' Park' : 'Park'], ['花园', x => x ? x + ' Garden' : 'Garden'],
  ['大道', x => x ? x + ' Avenue' : 'Avenue'], ['中心', x => x ? x + ' Center' : 'Center'], ['校区', x => x ? x + ' Campus' : 'Campus'], ['大门', x => x ? x + ' Gate' : 'Gate'], ['校门', x => x ? x + ' Campus Gate' : 'Campus Gate'],
  ['路', x => x ? x + ' Road' : 'Road'], ['街', x => x ? x + ' Street' : 'Street'], ['门', x => x ? x + ' Gate' : 'Gate'], ['楼', x => x ? x + ' Building' : 'Building'], ['馆', x => x ? x + ' Hall' : 'Hall'], ['站', x => x ? x + ' Station' : 'Station']
];
const _pyCache = new Map(), _enCache = new Map();
const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;
function pinyinWords(zh) {          // 聚英园 -> "Juyingyuan"; long names are split in pairs
  if (_pyCache.has(zh)) return _pyCache.get(zh);
  let out = zh;
  try {
    const sy = pinyinPro.pinyin(zh, { toneType: 'none', type: 'array' });
    if (sy.length <= 4) out = cap(sy.join(''));
    else { const g = []; for (let i = 0; i < sy.length; i += 2) g.push(cap(sy.slice(i, i + 2).join(''))); out = g.join(' '); }
  } catch (e) {}
  _pyCache.set(zh, out); return out;
}
const TERM_KEYS = Object.keys(TERMS).sort((a, b) => b.length - a.length);
function segment(head, singles) {
  const out = []; let i = 0, unk = '', hasUnk = false;
  const flush = () => { if (unk) { out.push(pinyinWords(unk)); unk = ''; hasUnk = true; } };
  while (i < head.length) {
    let hit = null;
    for (const k of TERM_KEYS) {
      if (head.startsWith(k, i)) { if (k.length === 1 && SINGLE_DIR.has(k) && !singles) continue; hit = k; break; }
    }
    if (hit) { flush(); if (TERMS[hit]) out.push(TERMS[hit]); i += hit.length; }
    else if (CJK.test(head[i])) { unk += head[i]; i++; }
    else { flush(); out.push(head[i]); i++; }
  }
  flush();
  return { text: out.join(' ').replace(/\s+/g, ' ').replace(/([A-Za-z]) (\d)/g, '$1 $2').trim(), hasUnk };
}
function seg(head) {
  if (!head) return '';
  let r = segment(head, true);
  if (r.hasUnk) r = segment(head, false);     // "东风" must be Dongfeng, not "East Feng"
  return r.text;
}
const CN_DIGIT = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 两: 2, 十: 10 };
function cnToNum(s) {
  if (s === '十') return 10; if (s.length === 1) return CN_DIGIT[s];
  if (s[0] === '十') return 10 + CN_DIGIT[s[1]]; if (s.length === 2 && s[1] === '十') return CN_DIGIT[s[0]] * 10;
  if (s.length === 3 && s[1] === '十') return CN_DIGIT[s[0]] * 10 + CN_DIGIT[s[2]]; return null;
}
function zhToEn(zh) {
  zh = (zh || '').trim().replace(/([一二三四五六七八九十两]{1,3})(?=号)/g, (m, n) => { const v = cnToNum(n); return v == null ? m : v; });
  if (!zh || !CJK.test(zh)) return zh;
  if (_enCache.has(zh)) return _enCache.get(zh);
  let r;
  const par = zh.match(/^(.*?)[（(]([^）)]*)[）)](.*)$/);
  if (par && par[1]) r = zhToEn(par[1]) + ' (' + zhToEn(par[2]) + ')' + (par[3] ? ' ' + zhToEn(par[3]) : '');
  else if (NAME_OVERRIDE[zh]) r = NAME_OVERRIDE[zh];
  else if (TERMS[zh]) r = TERMS[zh];
  else {
    let m;
    if ((m = zh.match(/^(.*?)[-－—](.+)$/)) && m[1]) r = zhToEn(m[1]) + ' - ' + zhToEn(m[2]);
    else if ((m = zh.match(/^(.*?)(\d+)\s*号楼$/))) r = (m[1] ? zhToEn(m[1]) + ' ' : '') + 'Building ' + m[2];
    else if ((m = zh.match(/^(.*?)(\d+)\s*号门$/))) r = (m[1] ? zhToEn(m[1]) + ' ' : '') + 'Gate ' + m[2];
    else if ((m = zh.match(/^(.*?)(\d+)\s*食堂$/))) r = (m[1] ? zhToEn(m[1]) + ' ' : '') + 'Canteen ' + m[2];
    else {
      for (const [suf, f] of SUFFIX) {
        if (zh.length >= suf.length && zh.endsWith(suf)) {
          const head = zh.slice(0, zh.length - suf.length);
          r = (NAME_OVERRIDE[head + suf]) || f(seg(head)); break;
        }
      }
      if (!r) r = seg(zh);
    }
  }
  r = r.replace(/\s+/g, ' ').trim();
  _enCache.set(zh, r); return r;
}
// pinyin helpers for search ("tushuguan", "tsg")
const _pySearch = new Map();
function pinyinSearchKeys(zh) {
  if (!zh || !CJK.test(zh)) return '';
  if (_pySearch.has(zh)) return _pySearch.get(zh);
  let r = '';
  try {
    const full = pinyinPro.pinyin(zh, { toneType: 'none', type: 'array' });
    r = full.join('').toLowerCase() + '|' + full.map(s => s[0]).join('').toLowerCase();
  } catch (e) {}
  _pySearch.set(zh, r); return r;
}

/* =====================================================================
   UI STRINGS
   ===================================================================== */
const I18N = {
  en: {
    tagline: 'Live Campus Navigator', univ: 'Zhengzhou University', start: 'Start Exploring',
    offlineNote: 'Save the map once while online, then use it without internet', smartNav: 'Smart Campus Navigation', mapBtn: 'Map',
    searchPh: 'Name or number, e.g. library, 17, 17-205…', searchAria: 'Search places', quick: 'Quick Explore', food: 'Food', parking: 'Parking',
    library: 'Library', photo: 'Photo Spots', gates: 'Gates', sports: 'Sports', transit: 'Transit', sos: 'Emergency', viewFull: 'View Full Map', placesOnCampus: 'Places on campus',
    saved: 'Saved places', mapTitle: 'Campus Map', dragHint: 'Tap a pin for details • Pinch to zoom', whereTo: 'Where do you want to go?',
    offlineTitle: 'Offline Maps', offlineSub: 'Save the live map for use without internet', view: 'View', download: 'Download',
    imgDisclaimer: 'The illustrated maps below are an unofficial overview, not to scale. Use the live map for navigation.',
    mapZhTitle: 'Illustrated overview (Chinese)', mapZhSub: 'Unofficial · not to scale', mapEnTitle: 'Illustrated overview (English)', mapEnSub: 'Unofficial · not to scale',
    navSteps: 'Navigation Steps', settings: 'Settings', settingsSub: 'Personalize your experience', appearance: 'Appearance',
    themeHint: 'Switch between light and dark', language: 'Language', howto: 'How to Use', about: 'About Us',
    locationSec: 'Location & navigation', gpsFix: 'Fix shifted GPS dot', gpsFixHint: 'Turn on if your blue dot appears ~500 m away from where you stand (some Chinese in-app browsers).',
    voice: 'Voice guidance', voiceHint: 'Speak turn-by-turn directions while navigating',
    installApp: 'Install app', clearData: 'Reset saved data', clearSub: 'Clears favourites, cached places and offline tiles', confirmClear: 'Clear favourites, cached places and offline map tiles?', cleared: 'Saved data cleared',
    navHome: 'Home', navMap: 'Map', navOffline: 'Offline', navRoute: 'Route', navSettings: 'Settings',
    botName: 'MapMinds Guide', online: 'Ready', askPh: 'Ask me about the campus…',
    lightMode: 'Light Mode', darkMode: 'Dark Mode', mapMissing: 'Image file not found next to index.html',
    resultsTitle: 'Search results', noResults: 'No places found. Try another word.',
    loadingPlaces: 'Loading campus data…', placesLoaded: '{n} places', loadFailNone: 'No campus data yet. Check your connection and tap Retry.', retry: 'Retry', all: 'All',
    dataBuiltin: 'Built-in campus data', dataLive: 'Updated from OpenStreetMap', dataDetails: 'Technical details', noDetails: 'No problems recorded.',
    directions: 'Directions', steps: 'Steps', walkMin: 'min walk', from: 'From', to: 'To', changeStart: 'Change',
    tapToStart: 'Tap the map to set your start point', myLocation: 'My location', startPoint: 'Start point', destination: 'Destination',
    locating: 'Finding your location…', gpsDenied: 'Location unavailable. Allow location access to navigate from where you are.',
    routing: 'Finding route…', routeFail: 'Route service unavailable. Showing a straight line.', straightNote: 'Straight-line estimate (no route service)',
    noRoute: 'No route yet. Pick a place on the map and tap Directions.',
    startGate: 'No GPS yet, starting from {g}. Tap Change to pick another start.', farAway: 'You are far from campus — starting from {g}.',
    areaTitle: 'Offline map area', areaSub: 'Save campus map tiles to use without internet', cacheBtn: 'Save for offline',
    caching: 'Saving… {n}%', cachedDone: 'Saved {n} tiles ✓', needHttps: 'Offline saving needs the app hosted on https (or localhost).', cacheFail: 'Some tiles could not be saved. Check your connection and try again.',
    notSaved: 'Not saved yet', dataTitle: 'Campus places data', dataSub: '{n} places · {s}', refresh: 'Refresh', refreshed: 'Campus data refreshed', refreshNone: 'Could not reach OpenStreetMap right now — using built-in data.',
    aboutText: 'MapMinds helps students, staff and visitors find their way around Zhengzhou University with a live map, turn-by-turn walking directions, offline maps and a built-in campus guide.',
    ab1: 'Live Maps', ab2: 'Offline Ready', ab3: 'Campus Guide',
    credits: 'Map data © OpenStreetMap contributors · Routing by OSM community servers · Unofficial student project',
    h1t: 'Find a place', h1b: 'Type a name in English, Chinese or pinyin — or a room number like “17-205”. You can also tap a Quick Explore shortcut or a category chip on the map.',
    h2t: 'Navigate', h2b: 'Tap a pin, press Directions, choose Walk or Bike, then Start. The map follows you, shows the next turn and re-routes if you leave the path. Allow location access for live guidance.',
    h3t: 'Offline maps', h3b: 'Open Offline and tap Save for offline while you have internet. Places stay searchable and saved map tiles stay visible; new walking routes need internet.',
    h6t: 'Save places', h6b: 'Tap the star on a place card to save it. Saved places appear on the Home screen.',
    h4t: 'Campus guide', h4b: 'Tap the robot button and ask things like “nearest canteen” or “where is the library”. Drag the button to move it.',
    h5t: 'Language & theme', h5b: 'Switch English / 中文 on the Home screen. All place, gate and street names switch with it. Choose dark or light mode in Settings.',
    botHello: "Hi! 👋 I'm your MapMinds guide. Ask me where things are, like “nearest canteen”.",
    botFallback: "I couldn't find that. Try a building name, or ask about the library, canteen, gates, metro, parking or sports fields.",
    botNoData: "Campus data isn't loaded yet. Please try again in a moment.",
    showOnMap: 'Show on map', showAll: 'Show all', getThere: 'Directions',
    chips: ['Where is the library?', 'Nearest canteen', 'Gates', 'Metro station', 'Sports'],
    away: '{d} away', approx: 'Approximate location', openIn: 'Open in…', share: 'Share this place', copied: 'Link copied', favAdd: 'Save place', favRemove: 'Remove from saved',
    offlineBadge: 'You are offline — saved maps and data still work', updateReady: 'New version ready — tap to update',
    sosTitle: 'Emergency numbers (China)', police: 'Police', ambulance: 'Ambulance', fire: 'Fire',
    sosNote: 'Tell the operator you are at Zhengzhou University Main Campus, Kexue Avenue 100 (科学大道100号).',
    room: 'Room {r} · Floor {f}', tilesAlt: 'Primary map server is slow — switched to a backup.',
    copyRow: 'Copy as data row', copiedShort: 'Copied',
    // navigation
    walk: 'Walk', bike: 'Bike', navEta: 'Arrival', navStart: 'Start', navEnd: 'End', fastest: 'Fastest', routeN: 'Route {n}', arriveAt: 'Arrive {t}', min: 'min', then: 'Then', closeRoute: 'Close route',
    recenter: 'Recenter', mute: 'Mute voice', unmute: 'Turn on voice', rerouting: 'You left the route — finding a new one…', rerouted: 'New route ready', rerouteFail: 'Could not update the route. Keep following the map.',
    arrivedTitle: 'You have arrived', arrivedAt: 'You have arrived at {p}', done: 'Done', gpsWait: 'Waiting for GPS signal…', remaining: 'left', inDist: 'In {d}',
    demo: 'Simulate walk', demoStop: 'Stop simulation', onRouteVia: 'via {r}',
    head: 'Head {c}', headOn: 'Head {c} on {r}', headToward: 'Head toward {p}', startOn: 'Start on {r}', contStraight: 'Continue straight', contOn: 'Continue on {r}',
    turnLeft: 'Turn left', turnRight: 'Turn right', slightLeft: 'Bear left', slightRight: 'Bear right', sharpLeft: 'Turn sharp left', sharpRight: 'Turn sharp right', uturn: 'Make a U-turn',
    keepLeft: 'Keep left', keepRight: 'Keep right', onto: '{v} onto {r}', atEnd: '{v} at the end of the road', roundabout: 'Enter the roundabout', roundaboutExit: 'At the roundabout, take exit {n}', arriveDest: 'Arrive at {p}', arriveSide: 'Your destination is on the {s}', left: 'left', right: 'right',
    compass: ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'], m: 'm', km: 'km', mSpeech: 'meters', kmSpeech: 'kilometers',
    speakIn: 'In {d}, {t}', speakNow: '{t}',
    // editor
    editor: 'Map editor', editorSub: 'Drag pins to their exact spot, then export', editorOn: 'Editor mode: drag a pin to move it', addPlace: 'Add place', exportCsv: 'Export CSV', resetEdits: 'Reset my edits', exit: 'Exit', tapMapToAdd: 'Tap the map where the new place is', nameZh: 'Chinese name', nameEn: 'English name', category: 'Category', save: 'Save', cancel: 'Cancel', deletePlace: 'Delete', moved: 'Position saved on this device', exported: 'CSV downloaded — replace campus-places.csv in your hosted folder', confirmReset: 'Remove all your position edits and added places from this device?', editsCleared: 'Edits cleared', unlocked: 'Map editor unlocked', edits: '{n} edits'
  },
  zh: {
    tagline: '实时校园导航', univ: '郑州大学', start: '开始探索',
    offlineNote: '联网时保存一次地图，之后无网络也能使用', smartNav: '智慧校园导航', mapBtn: '地图',
    searchPh: '名称或编号，如 图书馆、17、17-205…', searchAria: '搜索地点', quick: '快速探索', food: '美食', parking: '停车',
    library: '图书馆', photo: '拍照打卡', gates: '校门', sports: '运动', transit: '公交地铁', sos: '紧急求助', viewFull: '查看完整地图', placesOnCampus: '校园地点',
    saved: '已收藏', mapTitle: '校园地图', dragHint: '点击图钉查看详情 • 双指缩放', whereTo: '你想去哪里？',
    offlineTitle: '离线地图', offlineSub: '保存实时地图，无网络也能使用', view: '查看', download: '下载',
    imgDisclaimer: '下方插画地图仅为非官方示意图，不按比例绘制。导航请使用实时地图。',
    mapZhTitle: '示意图（中文）', mapZhSub: '非官方 · 不按比例', mapEnTitle: '示意图（英文）', mapEnSub: '非官方 · 不按比例',
    navSteps: '导航步骤', settings: '设置', settingsSub: '个性化你的体验', appearance: '外观',
    themeHint: '在浅色与深色之间切换', language: '语言', howto: '使用说明', about: '关于我们',
    locationSec: '定位与导航', gpsFix: '修正定位偏移', gpsFixHint: '如果蓝点与你的实际位置相差约 500 米（部分国内内置浏览器），请开启。',
    voice: '语音导航', voiceHint: '导航时语音播报转向提示',
    installApp: '安装应用', clearData: '重置本地数据', clearSub: '清除收藏、缓存的地点和离线地图', confirmClear: '清除收藏、缓存的地点和离线地图瓦片？', cleared: '已清除本地数据',
    navHome: '首页', navMap: '地图', navOffline: '离线', navRoute: '路线', navSettings: '设置',
    botName: 'MapMinds 校园向导', online: '就绪', askPh: '问问我关于校园的问题…',
    lightMode: '浅色模式', darkMode: '深色模式', mapMissing: '未在 index.html 同目录找到图片文件',
    resultsTitle: '搜索结果', noResults: '没有找到相关地点，换个词试试。',
    loadingPlaces: '正在加载校园数据…', placesLoaded: '{n} 个地点', loadFailNone: '暂无校园数据，请检查网络后点击重试。', retry: '重试', all: '全部',
    dataBuiltin: '内置校园数据', dataLive: '已从 OpenStreetMap 更新', dataDetails: '技术详情', noDetails: '没有记录到问题。',
    directions: '路线', steps: '步骤', walkMin: '分钟步行', from: '起点', to: '终点', changeStart: '更改',
    tapToStart: '点击地图设置起点', myLocation: '我的位置', startPoint: '起点', destination: '目的地',
    locating: '正在定位…', gpsDenied: '无法获取定位。请允许定位权限，才能从你所在位置导航。',
    routing: '正在规划路线…', routeFail: '路线服务不可用，显示直线。', straightNote: '直线估算（无路线服务）',
    noRoute: '还没有路线。请在地图上选择地点并点击“路线”。',
    startGate: '暂无定位，将从“{g}”出发。点击“更改”可选择其他起点。', farAway: '你离校园较远，将从“{g}”出发。',
    areaTitle: '离线地图区域', areaSub: '保存校园地图瓦片，无网络也能使用', cacheBtn: '保存离线',
    caching: '保存中… {n}%', cachedDone: '已保存 {n} 个瓦片 ✓', needHttps: '离线保存需要通过 https（或 localhost）托管。', cacheFail: '部分瓦片保存失败，请检查网络后重试。',
    notSaved: '尚未保存', dataTitle: '校园地点数据', dataSub: '{n} 个地点 · {s}', refresh: '刷新', refreshed: '校园数据已刷新', refreshNone: '暂时连不上 OpenStreetMap，继续使用内置数据。',
    aboutText: 'MapMinds 通过实时地图、逐向步行导航、离线地图和内置校园向导，帮助学生、教职工和访客轻松在郑州大学校园内找路。',
    ab1: '实时地图', ab2: '离线可用', ab3: '校园向导',
    credits: '地图数据 © OpenStreetMap 贡献者 · 路线由 OSM 社区服务器提供 · 非官方学生项目',
    h1t: '查找地点', h1b: '可输入中文、英文或拼音名称，或“17-205”这样的房间号。也可以点击快速探索按钮或地图上的分类标签。',
    h2t: '开始导航', h2b: '点击图钉，按“路线”，选择步行或骑行，然后点“开始”。地图会跟随你、提示下一个转弯，偏离路线时自动重新规划。请允许定位权限以获得实时指引。',
    h3t: '离线地图', h3b: '有网络时进入“离线”页面并点击“保存离线”。地点可继续搜索，已保存的地图瓦片可继续查看；规划新的步行路线需要网络。',
    h6t: '收藏地点', h6b: '点击地点卡片上的星标即可收藏，收藏的地点会显示在首页。',
    h4t: '校园向导', h4b: '点击机器人按钮，问“最近的食堂”或“图书馆在哪”。可拖动按钮调整位置。',
    h5t: '语言与主题', h5b: '在首页切换 English / 中文，所有地点、校门和道路名称都会随之切换。可在设置中选择深色或浅色模式。',
    botHello: '你好！👋 我是 MapMinds 向导，可以问我“最近的食堂”等问题。',
    botFallback: '没有找到相关地点。可以试试楼宇名称，或询问图书馆、食堂、校门、地铁站、停车场、运动场。',
    botNoData: '校园数据尚未加载，请稍后再试。',
    showOnMap: '在地图上显示', showAll: '全部显示', getThere: '路线',
    chips: ['图书馆在哪？', '最近的食堂', '校门', '地铁站', '运动场'],
    away: '距离 {d}', approx: '位置为大致范围', openIn: '用其他应用打开…', share: '分享此地点', copied: '链接已复制', favAdd: '收藏地点', favRemove: '取消收藏',
    offlineBadge: '当前离线 — 已保存的地图和数据仍可使用', updateReady: '有新版本，点击更新',
    sosTitle: '紧急电话（中国）', police: '报警', ambulance: '急救', fire: '火警',
    sosNote: '请告诉接线员你在郑州大学主校区，科学大道100号。',
    room: '{r}室 · {f}楼', tilesAlt: '主地图服务器较慢，已切换到备用服务器。',
    copyRow: '复制为数据行', copiedShort: '已复制',
    walk: '步行', bike: '骑行', navEta: '到达', navStart: '开始', navEnd: '结束', fastest: '最快', routeN: '路线 {n}', arriveAt: '{t} 到达', min: '分钟', then: '然后', closeRoute: '关闭路线',
    recenter: '回到当前位置', mute: '关闭语音', unmute: '开启语音', rerouting: '你已偏离路线，正在重新规划…', rerouted: '已更新路线', rerouteFail: '无法更新路线，请参照地图前进。',
    arrivedTitle: '你已到达', arrivedAt: '你已到达{p}', done: '完成', gpsWait: '正在等待 GPS 信号…', remaining: '剩余', inDist: '{d}后',
    demo: '模拟步行', demoStop: '停止模拟', onRouteVia: '经{r}',
    head: '向{c}出发', headOn: '沿{r}向{c}出发', headToward: '朝{p}方向前进', startOn: '从{r}出发', contStraight: '直行', contOn: '沿{r}直行',
    turnLeft: '左转', turnRight: '右转', slightLeft: '稍向左转', slightRight: '稍向右转', sharpLeft: '向左急转', sharpRight: '向右急转', uturn: '掉头',
    keepLeft: '靠左行驶', keepRight: '靠右行驶', onto: '{v}，进入{r}', atEnd: '在道路尽头{v}', roundabout: '进入环岛', roundaboutExit: '在环岛从第 {n} 个出口驶出', arriveDest: '到达{p}', arriveSide: '目的地在你的{s}侧', left: '左', right: '右',
    compass: ['北', '东北', '东', '东南', '南', '西南', '西', '西北'], m: '米', km: '公里', mSpeech: '米', kmSpeech: '公里',
    speakIn: '{d}后，{t}', speakNow: '{t}',
    editor: '地图编辑器', editorSub: '拖动图钉到准确位置，然后导出', editorOn: '编辑模式：拖动图钉即可移动', addPlace: '添加地点', exportCsv: '导出 CSV', resetEdits: '重置我的修改', exit: '退出', tapMapToAdd: '在地图上点击新地点的位置', nameZh: '中文名称', nameEn: '英文名称', category: '分类', save: '保存', cancel: '取消', deletePlace: '删除', moved: '位置已保存到本设备', exported: 'CSV 已下载，请替换托管文件夹里的 campus-places.csv', confirmReset: '清除本设备上所有位置修改和新增地点？', editsCleared: '已清除修改', unlocked: '已解锁地图编辑器', edits: '{n} 处修改'
  }
};
