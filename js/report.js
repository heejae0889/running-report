// =============================================
// 나의 러닝 레포트 페이지 스크립트
//
// 화면에 들어가는 내용과 데이터 출처
//   코스·거리      : data/courses.json 예시 코스 (나중에 제미나이 + TMAP으로 교체)
//   예상 시간      : 거리 × 목표 페이스
//   칼로리         : 운동 강도(MET) × 몸무게 × 시간
//   날씨           : Open-Meteo (키 필요 없음)
//   쉬어 갈 곳·숙소: 카카오 장소 검색 (카카오 JavaScript 키)
//   행사           : 한국관광공사 TourAPI (secrets.js의 TOUR_API_KEY, 없으면 예시 데이터)
//   PDF 저장       : html2canvas(화면 캡처) + jsPDF(PDF 만들기)
// 공통 함수(getParams, getRegion, loadJSON, pickCourse, loadKakaoMap, readBodyInfo 등)는 js/common.js 참고
// =============================================

const photo = (id, w = 1600) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&q=70`;

// 여행지별 상단 사진 (설문의 여행지 카드와 같은 사진)
const REGION_PHOTOS = {
  busan: '1638591751482-1a7d27fcea15',
  seoul: '1760000843601-2070baed2478',
  jeju: '1562680802-9cf8b15f419d',
  gangneung: '1720252741302-77213465eab2',
  gyeongju: '1717346255618-1fbc136cb8f9',
  yeosu: '1587121748119-ffb5090f9d82',
};

// ---------- 계산에 쓰는 값 ----------
// 목표 페이스 답변 → 1km당 분 (모르면 러닝 경험으로 추정)
const PACE_MIN = { '7분 이상': 7.5, '6~7분': 6.5, '5~6분': 5.5, '5분 이내': 4.75 };
const LEVEL_PACE = { '입문': 7.5, '보통': 6.5, '숙련': 5.5 };

// 달리는 속도(km/h)별 운동 강도 MET (ACSM 신체활동 목록 기준)
const MET_TABLE = [
  [6.4, 6.0], [8.0, 8.3], [8.4, 9.0], [9.7, 9.8], [10.8, 10.5],
  [11.3, 11.0], [12.1, 11.8], [12.9, 12.3], [13.8, 12.8], [14.5, 14.5], [16.1, 16.0],
];

// 시간대 답변 → 날씨를 볼 시각
const TIME_HOURS = { '새벽·아침': [6, 7, 8], '낮': [12, 13, 14], '저녁': [17, 18, 19], '밤': [20, 21, 22] };

// 날씨 코드(WMO) → 설명과 아이콘
function weatherText(code) {
  if (code === 0) return ['맑음', '☀️'];
  if (code <= 2) return ['구름 조금', '🌤️'];
  if (code === 3) return ['흐림', '☁️'];
  if (code <= 48) return ['안개', '🌫️'];
  if (code <= 57) return ['이슬비', '🌦️'];
  if (code <= 67) return ['비', '🌧️'];
  if (code <= 77) return ['눈', '🌨️'];
  if (code <= 82) return ['소나기', '🌧️'];
  if (code <= 86) return ['눈 소나기', '🌨️'];
  return ['뇌우', '⛈️'];
}

// ---------- 작은 도구들 ----------
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fmtM = (m) => (m >= 1000 ? `${(m / 1000).toFixed(1)}km` : `${Math.round(m)}m`);

function paceMinutes(p) {
  return PACE_MIN[p.pace] || LEVEL_PACE[p.level] || 6.5;
}
function formatPace(min) {
  let m = Math.floor(min);
  let s = Math.round((min - m) * 60);
  if (s === 60) { m += 1; s = 0; }
  return `${m}'${String(s).padStart(2, '0')}"`;
}
function metForSpeed(kmh) {
  if (kmh <= MET_TABLE[0][0]) return MET_TABLE[0][1];
  for (let i = 1; i < MET_TABLE.length; i++) {
    const [s1, m1] = MET_TABLE[i - 1];
    const [s2, m2] = MET_TABLE[i];
    if (kmh <= s2) return m1 + ((kmh - s1) / (s2 - s1)) * (m2 - m1);
  }
  return MET_TABLE[MET_TABLE.length - 1][1];
}
function calcKcal(weightKg, km, paceMin) {
  const hours = (km * paceMin) / 60;
  return Math.round(metForSpeed(60 / paceMin) * weightKg * hours);
}

// 콜백 방식인 카카오 장소 검색을 Promise로 (응답이 없으면 8초 뒤 빈 결과)
function placesSearch(method, query, options) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve([]), 8000);
    state.places[method](query, (data, status) => {
      clearTimeout(timer);
      resolve(status === kakao.maps.services.Status.OK ? data : []);
    }, options);
  });
}

function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 2400);
}

// ---------- 상태 ----------
const state = {
  params: null,
  course: null,
  courseKm: 0,
  map: null,
  places: null,
  openLabel: null,
  pins: {},          // id → { position, label }
  mapReady: null,    // 지도 준비가 끝나면 풀리는 Promise
  lastPinClick: 0,
};

// =============================================
// 시작
// =============================================
document.addEventListener('DOMContentLoaded', init);

async function init() {
  const p = getParams();
  state.params = p;

  // 설문을 거치지 않았으면 안내 화면 (밝은 배경이라 메뉴 막대도 밝게)
  if (!p.region || !p.date || !getRegion(p.region)) {
    document.body.classList.add('header-light');
    $('emptyState').classList.remove('d-none');
    return;
  }

  // 위쪽 메뉴 막대: 사진 위에서는 어두운 반투명, 사진을 지나면 밝은 반투명
  const updateHeader = () => {
    const heroBottom = $('hero').getBoundingClientRect().bottom;
    document.body.classList.toggle('header-light', heroBottom <= 48);
  };
  window.addEventListener('scroll', updateHeader, { passive: true });
  window.addEventListener('resize', updateHeader);
  $('report').classList.remove('d-none');
  $('actionBar').classList.remove('d-none');

  bindActions();
  renderHeroBase();
  updateHeader();

  // 1) 카카오 지도 SDK 먼저 (AI 코스의 장소 검색에도 필요)
  let kakaoOk = true;
  try {
    await loadKakaoMap();
  } catch (e) {
    console.error(e);
    kakaoOk = false;
  }

  // 2) 코스 정하기: 공유 링크의 코스 → AI 코스 → 예시 코스 순서로 시도
  state.course = await getCourse(p, kakaoOk);
  if (!state.course) {
    setMapStatus('코스 데이터를 불러오지 못했어요. Live Server로 열었는지 확인해 주세요.', true);
    $('heroCourse').textContent = '코스를 불러오지 못했어요';
    return;
  }
  state.courseKm = state.course.distanceKm;

  renderHero();
  renderFacts();
  renderStory();

  // 3) 지도 · 날씨 · 행사는 서로 기다리지 않고 동시에
  state.mapReady = kakaoOk ? initMap() : Promise.reject(new Error('카카오 SDK 없음'));
  loadWeather();
  loadEvents();
  try {
    await state.mapReady;
    setMapStatus('', false, true);
    loadRestSpots();
    loadStays();
  } catch (e) {
    console.error(e);
    setMapStatus('지도를 불러오지 못했어요. 카카오 키와 도메인 등록을 확인해 주세요.', true);
    $('restList').innerHTML = '<li class="empty-msg">지도를 불러오지 못해 주변 장소를 찾지 못했어요.</li>';
    $('stayList').innerHTML = '<li class="empty-msg">지도를 불러오지 못해 숙소를 찾지 못했어요.</li>';
  }
}

// =============================================
// 코스 정하기
// =============================================
// 지도 위 안내 문구 (done=true면 숨김)
function setMapStatus(text, isError = false, done = false) {
  const box = $('mapStatus');
  box.classList.toggle('is-done', done);
  $('mapStatusText').textContent = text;
  box.querySelector('.spinner').style.display = isError ? 'none' : '';
}

async function getCourse(p, kakaoOk) {
  // 예시 코스 (키가 없거나 AI가 실패했을 때)
  const fallback = async (reason) => {
    try {
      const courses = await loadJSON('data/courses.json');
      const c = pickCourse(courses, p);
      if (!c) return null;
      const same = c.start.lat === c.end.lat && c.start.lng === c.end.lng;
      return { ...c, source: 'example', type: c.type || (same ? '왕복' : '편도'), note: reason };
    } catch (e) {
      console.error(e);
      return null;
    }
  };

  if (!kakaoOk) return fallback('지도를 불러오지 못해 예시 코스를 보여 드려요.');

  const search = new URLSearchParams(location.search);
  const routeRaw = search.get('route');
  const aiNote = '';   // AI 코스는 따로 설명 문구를 붙이지 않음

  // 설문에서 방금 만든 코스 → 그대로 사용 (다시 계산하지 않음)
  const built = routeRaw ? readBuiltCourse(routeRaw) : null;
  if (built) return { ...built, note: aiNote };

  // 공유 링크로 열었으면, 링크에 담긴 들를 곳으로 같은 코스를 다시 그리기 (제미나이 호출 없음)
  if (routeRaw && hasTmapKey()) {
    try {
      setMapStatus('공유받은 코스를 그리고 있어요…');
      const c = await rebuildCourseFromRoute(JSON.parse(routeRaw), p.region);
      return { ...c, note: '' };
    } catch (e) {
      console.error(e);
    }
  }

  // 설문에서 AI 코스를 만들지 못했으면 예시 코스 (이유와 함께)
  if (search.get('course') === 'example') {
    let reason = '';
    try { reason = sessionStorage.getItem('tripRunningCourseError') || ''; } catch (e) { /* 무시 */ }
    return fallback(reason || '예시 코스를 보여 드려요.');
  }

  if (!hasAiKeys()) {
    return fallback('js/secrets.js에 제미나이·TMAP 키를 넣으면 AI 맞춤 코스를 만들어요. 지금은 예시 코스예요.');
  }

  try {
    const c = await buildAiCourse(p, (text) => setMapStatus(text));
    // 새로고침하거나 공유해도 같은 코스가 나오도록 주소에 저장
    const url = new URL(location.href);
    url.searchParams.set('route', courseToRouteParam(c));
    history.replaceState(null, '', url);
    return { ...c, note: aiNote };
  } catch (e) {
    console.error(e);
    return fallback(`AI 코스를 만들지 못해 예시 코스를 보여 드려요. (${e.message})`);
  }
}

// 코스 소개 · 추천 이유 · 팁
function renderStory() {
  const c = state.course;
  const list = (title, items) => (items && items.length
    ? `<div><h3>${title}</h3><ul>${items.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>`
    : '');
  const html = [
    c.description ? `<p class="story-summary">${esc(c.description)}</p>` : '',
    list('이 코스를 고른 이유', c.reasons),
    list('달릴 때 팁', c.tips),
  ].join('');
  $('courseStory').innerHTML = html;
}

// =============================================
// 1. 상단 요약
// =============================================
function renderHeroBase() {
  const p = state.params;
  const region = getRegion(p.region);

  // 사진
  const pid = REGION_PHOTOS[p.region];
  if (pid) $('hero').style.setProperty('--hero-bg', `url('${photo(pid, window.innerWidth > 900 ? 2000 : 1100)}')`);

  // 날짜 · 시간대 · 남은 날
  const today = new Date(ymd(new Date()) + 'T00:00:00');
  const dday = Math.round((new Date(p.date + 'T00:00:00') - today) / 86400000);
  const ddayText = dday === 0 ? '오늘' : dday > 0 ? `${dday}일 남음` : '지난 날짜';
  $('heroWhen').textContent = [formatDateKo(p.date), p.time, ddayText].filter(Boolean).join(' · ');
  $('heroTitle').textContent = `${region.name} 러닝 레포트`;
  document.title = `${region.name} 러닝 레포트 · 트립 런닝`;
}

function renderHero() {
  $('heroCourse').textContent = state.course.name;
  $('courseNote').textContent = state.course.note || '';
  renderStats();
}

function renderStats() {
  const p = state.params;
  const km = state.courseKm;
  const pace = paceMinutes(p);
  const minutes = Math.round(km * pace);

  $('statKm').textContent = km.toFixed(1);
  if (minutes >= 60) {
    $('statTime').textContent = `${Math.floor(minutes / 60)}시간 ${minutes % 60}`;
    $('statTimeUnit').textContent = '분';
  } else {
    $('statTime').textContent = minutes;
    $('statTimeUnit').textContent = '분';
  }
  $('statPace').textContent = formatPace(pace);

  const body = readBodyInfo();
  if (body && body.weight) {
    $('statKcal').textContent = calcKcal(body.weight, km, pace).toLocaleString();
    $('kcalForm').classList.add('d-none');
  } else {
    $('statKcal').textContent = '?';
    $('kcalForm').classList.remove('d-none');
  }
}

// 코스 정보 칸
function renderFacts() {
  const p = state.params;
  const c = state.course;
  const typeText = { '왕복': '반환점을 찍고 돌아오는 왕복', '순환': '출발점으로 돌아오는 순환', '편도': '한 방향으로 가는 편도' }[c.type] || '-';
  const facts = [
    ['출발', c.start.name],
    ['도착', c.end.name],
    ['코스 형태', typeText],
    ['원하신 거리', p.km ? `${p.km}km` : '-'],
    ['함께 달리는 인원', p.group || '-'],
    ['여행 일정', p.days || (p.stay === '숙박 안 함' ? '당일치기' : '-')],
  ];
  $('courseFacts').innerHTML = facts
    .map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`)
    .join('');
}

// =============================================
// 2. 지도
// =============================================
async function initMap() {
  await loadKakaoMap();
  const c = state.course;
  const path = c.path.map(([lat, lng]) => new kakao.maps.LatLng(lat, lng));

  state.map = new kakao.maps.Map($('map'), { center: path[0], level: 5 });
  state.map.addControl(new kakao.maps.ZoomControl(), kakao.maps.ControlPosition.RIGHT);
  state.places = new kakao.maps.services.Places();

  // 코스 선: 흰 테두리 + 주황 선을 겹쳐서 지도 위에서 잘 보이게
  new kakao.maps.Polyline({ map: state.map, path, strokeWeight: 10, strokeColor: '#ffffff', strokeOpacity: 0.9 });
  const line = new kakao.maps.Polyline({ map: state.map, path, strokeWeight: 6, strokeColor: '#f07c2a', strokeOpacity: 1 });

  // 예시 코스는 지도로 잰 실제 길이로 거리 갱신 (AI 코스는 TMAP 거리 그대로)
  const realKm = line.getLength() / 1000;
  if (c.source !== 'ai' && realKm > 0.1) {
    state.courseKm = Math.round(realKm * 10) / 10;
    renderStats();
  }

  // AI 코스: 출발과 도착 사이에 들르는 곳
  (c.waypoints || []).slice(1).forEach((w, i, arr) => {
    const isLastTurn = c.type === '왕복' && i === arr.length - 1;
    if (c.type === '편도' && i === arr.length - 1) return; // 편도의 마지막은 도착(E)
    addPin(`via-${i}`, new kakao.maps.LatLng(w.lat, w.lng), isLastTurn ? '반' : i + 1, 'pin--via', isLastTurn ? `${w.name} (반환점)` : w.name);
  });

  const sameStartEnd = distanceKm(c.start.lat, c.start.lng, c.end.lat, c.end.lng) < 0.03;
  if (sameStartEnd) {
    addPin('start', path[0], 'S', 'pin--start', `${c.start.name} (출발·도착)`);
  } else {
    addPin('start', path[0], 'S', 'pin--start', `${c.start.name} (출발)`);
    addPin('end', path[path.length - 1], 'E', 'pin--end', `${c.end.name} (도착)`);
  }

  const bounds = new kakao.maps.LatLngBounds();
  path.forEach((pt) => bounds.extend(pt));
  state.map.setBounds(bounds, 40, 40, 40, 40);

  // 지도 빈 곳을 누르면 이름표 닫기 (표시를 누른 직후의 클릭은 무시)
  kakao.maps.event.addListener(state.map, 'click', () => {
    if (Date.now() - (state.lastPinClick || 0) > 300) closeLabel();
  });
}

// 지도에 동그란 표시 추가 (누르면 이름표)
function addPin(id, position, text, cls, labelText) {
  const el = document.createElement('div');
  el.className = `pin ${cls}`;
  el.textContent = text;
  el.title = labelText;
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    state.lastPinClick = Date.now();
    showLabel(id);
  });
  new kakao.maps.CustomOverlay({ map: state.map, position, content: el, yAnchor: 0.5, zIndex: 3 });
  state.pins[id] = { position, label: labelText };
}

function showLabel(id) {
  const pin = state.pins[id];
  if (!pin) return;
  closeLabel();
  const el = document.createElement('div');
  el.className = 'pin-label';
  el.textContent = pin.label;
  state.openLabel = new kakao.maps.CustomOverlay({ map: state.map, position: pin.position, content: el, yAnchor: -0.6, zIndex: 5 });
  state.map.panTo(pin.position);
}
function closeLabel() {
  if (state.openLabel) state.openLabel.setMap(null);
  state.openLabel = null;
}

// 코스 위를 50m 간격 점으로 촘촘하게 (장소가 코스에서 얼마나 떨어졌는지 계산용)
function densePath() {
  const pts = [];
  let along = 0;
  const path = state.course.path;
  for (let i = 0; i < path.length - 1; i++) {
    const [a1, b1] = path[i];
    const [a2, b2] = path[i + 1];
    const seg = distanceKm(a1, b1, a2, b2) * 1000;
    const steps = Math.max(1, Math.ceil(seg / 50));
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      pts.push({ lat: a1 + (a2 - a1) * t, lng: b1 + (b2 - b1) * t, along: along + seg * t });
    }
    along += seg;
  }
  const last = path[path.length - 1];
  pts.push({ lat: last[0], lng: last[1], along });
  return pts;
}

// 장소 → 코스와의 최단 거리, 출발 후 몇 km 지점인지
function nearestOnCourse(dense, lat, lng) {
  let best = { gap: Infinity, along: 0 };
  dense.forEach((pt) => {
    const gap = distanceKm(lat, lng, pt.lat, pt.lng) * 1000;
    if (gap < best.gap) best = { gap, along: pt.along };
  });
  return best;
}

// =============================================
// 3. 쉬어 갈 곳 (편의점 · 카페 · 화장실 · 공원)
// =============================================
async function loadRestSpots() {
  const dense = densePath();

  // 왕복 코스는 앞 절반만 보면 충분
  const roundTrip = state.course.type === '왕복';
  const usable = roundTrip ? dense.filter((pt) => pt.along <= dense[dense.length - 1].along / 2 + 1) : dense;

  // 약 700m마다 한 곳씩 주변 검색
  const total = usable[usable.length - 1].along;
  const probes = [];
  for (let d = 0; d <= total; d += 700) probes.push(usable.find((pt) => pt.along >= d) || usable[usable.length - 1]);
  if (probes.length < 2) probes.push(usable[usable.length - 1]);

  const TYPES = [
    { key: '편의점', run: (loc) => placesSearch('categorySearch', 'CS2', { location: loc, radius: 250, sort: kakao.maps.services.SortBy.DISTANCE }) },
    { key: '카페', run: (loc) => placesSearch('categorySearch', 'CE7', { location: loc, radius: 250, sort: kakao.maps.services.SortBy.DISTANCE }) },
    { key: '화장실', run: (loc) => placesSearch('keywordSearch', '화장실', { location: loc, radius: 300, sort: kakao.maps.services.SortBy.DISTANCE }) },
    { key: '공원', run: (loc) => placesSearch('keywordSearch', '공원', { location: loc, radius: 350, sort: kakao.maps.services.SortBy.DISTANCE }) },
  ];

  const found = new Map(); // 장소 id → 정보
  await Promise.all(probes.flatMap((pt) => {
    const loc = new kakao.maps.LatLng(pt.lat, pt.lng);
    return TYPES.map(async (type) => {
      const list = await type.run(loc);
      list.forEach((place) => {
        if (type.key === '공원' && !/공원/.test(place.category_name)) return; // '공원 앞 식당' 같은 것 제외
        if (found.has(place.id)) return;
        const lat = Number(place.y);
        const lng = Number(place.x);
        const near = nearestOnCourse(dense, lat, lng);
        if (near.gap > 300) return;
        found.set(place.id, { ...place, lat, lng, type: type.key, gap: near.gap, along: near.along });
      });
    });
  }));

  // 종류별로 코스에서 가장 가까운 2~3곳 → 출발부터 순서대로
  const pick = [];
  ['화장실', '편의점', '카페', '공원'].forEach((key) => {
    const limit = key === '카페' ? 2 : 3;
    [...found.values()].filter((x) => x.type === key).sort((a, b) => a.gap - b.gap).slice(0, limit).forEach((x) => pick.push(x));
  });
  // 너무 많으면 코스에서 가까운 8곳만
  if (pick.length > 8) {
    pick.sort((a, b) => a.gap - b.gap);
    pick.length = 8;
  }
  pick.sort((a, b) => a.along - b.along);

  if (pick.length === 0) {
    $('restList').innerHTML = '<li class="empty-msg">코스 근처에서 쉬어 갈 곳을 찾지 못했어요.</li>';
    return;
  }

  $('restList').innerHTML = pick.map((x, i) => `
    <li>
      <button type="button" class="place-item" data-pin="rest-${i}">
        <span class="place-num">${i + 1}</span>
        <span class="place-text">
          <span class="place-name">${esc(x.place_name)}</span>
          <span class="place-meta">${x.type} · ${x.along < 100 ? '출발 지점 근처' : `출발 후 ${fmtM(x.along)} 지점`}</span>
        </span>
        <span class="place-dist">코스에서 ${fmtM(x.gap)}</span>
      </button>
    </li>`).join('');

  pick.forEach((x, i) => {
    addPin(`rest-${i}`, new kakao.maps.LatLng(x.lat, x.lng), i + 1, 'pin--rest', `${x.place_name} (${x.type})`);
  });
  bindPlaceButtons('#restList');
}

// =============================================
// 4. 출발 지점 근처 숙소
// =============================================
async function loadStays() {
  const p = state.params;
  const start = state.course.start;
  const loc = new kakao.maps.LatLng(start.lat, start.lng);
  const list = await placesSearch('categorySearch', 'AD5', { location: loc, radius: 2000, sort: kakao.maps.services.SortBy.DISTANCE });

  if (p.stay === '숙박 안 함') {
    $('stayNote').textContent = '당일치기 일정이라 참고용으로 보여 드려요. 출발 지점에서 가까운 순서예요.';
  }

  // 같은 건물의 '○○호텔 다이닝홀' 같은 부속 시설은 빼기
  const seen = new Set();
  const stays = list.filter((x) => {
    const base = x.place_name.split(' ')[0];
    if (seen.has(base)) return false;
    seen.add(base);
    return true;
  }).slice(0, 5);

  if (stays.length === 0) {
    $('stayList').innerHTML = '<li class="empty-msg">출발 지점 2km 안에서 숙소를 찾지 못했어요.</li>';
    return;
  }

  $('stayList').innerHTML = stays.map((x, i) => {
    const kind = x.category_name.split('>').pop().trim();
    return `
    <li>
      <button type="button" class="place-item" data-pin="stay-${i}">
        <span class="place-num">${i + 1}</span>
        <span class="place-text">
          <span class="place-name">${esc(x.place_name)}</span>
          <span class="place-meta">${esc(kind)} · ${esc(x.road_address_name || x.address_name)}</span>
        </span>
        <span class="place-dist">${fmtM(Number(x.distance))}</span>
      </button>
    </li>`;
  }).join('');

  stays.forEach((x, i) => {
    addPin(`stay-${i}`, new kakao.maps.LatLng(Number(x.y), Number(x.x)), '숙', 'pin--stay', x.place_name);
  });
  bindPlaceButtons('#stayList');
}

function bindPlaceButtons(selector) {
  document.querySelectorAll(`${selector} .place-item`).forEach((btn) => {
    btn.addEventListener('click', () => {
      showLabel(btn.dataset.pin);
      $('map').scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  });
}

// =============================================
// 5. 날씨 (Open-Meteo) + 미세먼지 + 일출·일몰 + 옷차림 추천
// =============================================
async function loadWeather() {
  const p = state.params;
  const { lat, lng } = state.course.start;
  const hours = TIME_HOURS[p.time] || TIME_HOURS['새벽·아침'];
  const slot = p.time || '새벽·아침';

  const today = new Date(ymd(new Date()) + 'T00:00:00');
  const target = new Date(p.date + 'T00:00:00');
  const daysAhead = Math.round((target - today) / 86400000);

  // 15일 안이면 예보, 그보다 멀면 작년 같은 날 기록
  let url;
  let isForecast = true;
  const common = `latitude=${lat}&longitude=${lng}&timezone=Asia%2FSeoul&wind_speed_unit=ms&daily=sunrise,sunset`;
  if (daysAhead >= 0 && daysAhead <= 15) {
    url = `https://api.open-meteo.com/v1/forecast?${common}&hourly=temperature_2m,apparent_temperature,precipitation_probability,precipitation,weather_code,wind_speed_10m,relative_humidity_2m&start_date=${p.date}&end_date=${p.date}`;
  } else {
    isForecast = false;
    const lastYear = new Date(target);
    lastYear.setFullYear(target.getFullYear() - 1);
    const d = ymd(lastYear);
    url = `https://archive-api.open-meteo.com/v1/archive?${common}&hourly=temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,relative_humidity_2m&start_date=${d}&end_date=${d}`;
  }

  // 미세먼지는 날씨와 동시에 요청 (예보는 약 4일 뒤까지만 나옴)
  const airPromise = loadAirQuality(lat, lng, p.date, hours);

  try {
    const res = await fetch(url);
    const data = await res.json();
    if (!res.ok || !data.hourly) throw new Error(data.reason || '날씨 응답 오류');
    const h = data.hourly;
    const pickHours = (arr) => (arr ? hours.map((i) => arr[i]).filter((v) => v !== null && v !== undefined) : []);
    const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);

    const temp = avg(pickHours(h.temperature_2m));
    const feels = avg(pickHours(h.apparent_temperature));
    const rainProb = Math.max(0, ...pickHours(h.precipitation_probability));
    const rainMm = pickHours(h.precipitation).reduce((a, b) => a + b, 0);
    const rainChance = isForecast ? rainProb : rainMm > 0.5 ? 70 : 0;
    const wind = Math.max(0, ...pickHours(h.wind_speed_10m));
    const humid = avg(pickHours(h.relative_humidity_2m));
    const code = Math.max(0, ...pickHours(h.weather_code));
    const [desc, icon] = weatherText(code);

    // 일출 · 일몰 ('2026-11-17T06:52' → '06:52')
    const hhmm = (iso) => (iso ? iso.slice(11, 16) : null);
    const sunrise = hhmm(data.daily?.sunrise?.[0]);
    const sunset = hhmm(data.daily?.sunset?.[0]);
    const isDark = darkDuringRun(slot, hours, sunrise, sunset);

    $('weatherSource').textContent = isForecast
      ? `${slot} 시간대 예보예요.`
      : `아직 예보가 나오지 않은 날짜라, 작년 같은 날 ${slot} 기록을 보여 드려요.`;

    const rainCell = isForecast
      ? `<div><dt>비 올 확률</dt><dd>${Math.round(rainProb)}%</dd></div>`
      : `<div><dt>강수량</dt><dd>${rainMm.toFixed(1)}mm</dd></div>`;

    const air = await airPromise;
    const outfit = outfitFor(feels, rainChance, wind, isDark, slot === '낮' && code <= 2);

    $('weather').innerHTML = `
      <div class="weather-main">
        <span class="weather-icon" aria-hidden="true">${icon}</span>
        <div class="weather-temp">${Math.round(temp)}°</div>
        <div>
          <div class="weather-desc">${desc}</div>
          <div class="weather-sub">체감 ${Math.round(feels)}°</div>
        </div>
      </div>
      <dl class="weather-grid">
        ${rainCell}
        <div><dt>바람</dt><dd>${wind.toFixed(1)}m/s</dd></div>
        <div><dt>습도</dt><dd>${Math.round(humid)}%</dd></div>
      </dl>

      <div class="wx-rows">
        <section class="wx-row">
          <h3 class="wx-label">공기</h3>
          <div class="wx-body">${renderAir(air)}</div>
        </section>
        <section class="wx-row">
          <h3 class="wx-label">해</h3>
          <div class="wx-body">
            ${sunrise && sunset ? `
              <div class="sun-times">
                <span><span aria-hidden="true">🌅</span> 일출 <b>${sunrise}</b></span>
                <span><span aria-hidden="true">🌇</span> 일몰 <b>${sunset}</b></span>
              </div>
              <p class="wx-note">${sunNote(slot, hours, sunrise, sunset)}${isForecast ? '' : ' (작년 기준)'}</p>` : '<p class="wx-note">일출·일몰 정보를 불러오지 못했어요.</p>'}
          </div>
        </section>
        <section class="wx-row">
          <h3 class="wx-label">옷차림</h3>
          <div class="wx-body">
            <ul class="outfit" aria-label="추천 옷차림">
              ${outfit.map(([emoji, text]) => `<li><span aria-hidden="true">${emoji}</span>${text}</li>`).join('')}
            </ul>
          </div>
        </section>
      </div>

      <p class="weather-tip">${runningTip(feels, rainChance, wind)}</p>
    `;
  } catch (e) {
    console.error(e);
    $('weatherSource').textContent = '';
    $('weather').innerHTML = '<p class="empty-msg">날씨 정보를 불러오지 못했어요. 잠시 뒤 새로고침해 주세요.</p>';
  }
}

// ---------- 미세먼지 (Open-Meteo 대기질, 환경부 등급 기준) ----------
const PM10_GRADES = [[30, '좋음'], [80, '보통'], [150, '나쁨'], [Infinity, '매우 나쁨']];
const PM25_GRADES = [[15, '좋음'], [35, '보통'], [75, '나쁨'], [Infinity, '매우 나쁨']];
const gradeOf = (value, table) => table.find(([max]) => value <= max)[1];
const GRADE_CLASS = { '좋음': 'aq--good', '보통': 'aq--normal', '나쁨': 'aq--bad', '매우 나쁨': 'aq--worst' };

async function loadAirQuality(lat, lng, date, hours) {
  try {
    const res = await fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lng}&hourly=pm10,pm2_5&timezone=Asia%2FSeoul&start_date=${date}&end_date=${date}`);
    if (!res.ok) return null;                       // 예보 범위 밖
    const data = await res.json();
    const pick = (arr) => (arr || []).filter((_, i) => hours.includes(i)).filter((v) => v !== null && v !== undefined);
    const pm10 = pick(data.hourly?.pm10);
    const pm25 = pick(data.hourly?.pm2_5);
    if (!pm10.length || !pm25.length) return null;  // 아직 값이 없음
    return {
      pm10: Math.round(Math.max(...pm10)),
      pm25: Math.round(Math.max(...pm25)),
    };
  } catch (e) {
    return null;
  }
}

function renderAir(air) {
  if (!air) return '<p class="wx-note">아직 미세먼지 예보가 나오지 않았어요. 달리기 3~4일 전부터 확인할 수 있어요.</p>';
  const g10 = gradeOf(air.pm10, PM10_GRADES);
  const g25 = gradeOf(air.pm25, PM25_GRADES);
  const order = ['좋음', '보통', '나쁨', '매우 나쁨'];
  const worst = order[Math.max(order.indexOf(g10), order.indexOf(g25))];
  const note = {
    '좋음': '공기가 깨끗해요. 마음껏 달려도 좋아요.',
    '보통': '달리기에 무리 없는 공기예요.',
    '나쁨': '공기가 나빠요. 거리를 줄이고 강도를 낮추거나 마스크를 챙기세요.',
    '매우 나쁨': '공기가 매우 나빠요. 이날은 실내 운동을 추천해요.',
  }[worst];
  return `
    <div class="aq-pills">
      <span class="aq-pill ${GRADE_CLASS[g10]}">미세먼지 <b>${g10}</b> <small>${air.pm10}㎍/㎥</small></span>
      <span class="aq-pill ${GRADE_CLASS[g25]}">초미세먼지 <b>${g25}</b> <small>${air.pm25}㎍/㎥</small></span>
    </div>
    <p class="wx-note">${note}</p>`;
}

// ---------- 일출 · 일몰 ----------
const toMin = (hm) => { const [h, m] = hm.split(':').map(Number); return h * 60 + m; };
const fromMin = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

// 달리는 시간 중에 어두운 때가 있는지 (시간대의 첫 시각 ~ 마지막 시각+1시간)
function darkDuringRun(slot, hours, sunrise, sunset) {
  if (!sunrise || !sunset) return slot === '밤';
  const start = hours[0] * 60;
  const end = (hours[hours.length - 1] + 1) * 60;
  return start < toMin(sunrise) || end > toMin(sunset);
}

function sunNote(slot, hours, sunrise, sunset) {
  const rise = toMin(sunrise);
  const set = toMin(sunset);
  const start = hours[0] * 60;
  if (slot === '새벽·아침') {
    return start < rise
      ? `해 뜨기 전에는 어두워요. 일출을 보며 달리려면 ${fromMin(rise - 15)}쯤 출발해 보세요.`
      : '해가 뜬 뒤라 밝은 길에서 달릴 수 있어요.';
  }
  if (slot === '낮') return `해가 높은 시간이에요. 일몰(${sunset}) 전까지 여유 있게 달릴 수 있어요.`;
  if (slot === '저녁') return `노을을 보며 달리려면 일몰 30분 전인 ${fromMin(set - 30)}쯤 출발하세요. 일몰 뒤에는 금방 어두워져요.`;
  return `일몰(${sunset}) 이후라 어두워요. 조명이 있는 길로 달리고, 밝은 옷이나 라이트를 챙기세요.`;
}

// ---------- 옷차림 추천 (체감 온도 기준 + 비 · 바람 · 어두움 · 햇빛) ----------
function outfitFor(feels, rainChance, wind, isDark, isSunnyDay) {
  let items;
  if (feels >= 22) items = [['👕', '반팔'], ['🩳', '반바지']];
  else if (feels >= 15) items = [['👕', '반팔'], ['🩳', '반바지'], ['🧥', '출발 전 걸칠 얇은 겉옷']];
  else if (feels >= 9) items = [['👚', '얇은 긴팔'], ['🩳', '반바지나 레깅스']];
  else if (feels >= 3) items = [['👚', '긴팔'], ['🧥', '얇은 바람막이'], ['👖', '레깅스나 긴 바지']];
  else if (feels >= -3) items = [['🧶', '기모 긴팔'], ['🧥', '바람막이'], ['👖', '긴 바지'], ['🧤', '장갑']];
  else items = [['🧶', '기모 상의'], ['🧥', '방풍 재킷'], ['👖', '기모 바지'], ['🧤', '장갑'], ['🧣', '넥워머']];

  const has = (word) => items.some(([, t]) => t.includes(word));
  if (wind >= 6 && !has('바람막이') && !has('재킷')) items.push(['🧥', '얇은 바람막이']);
  if (rainChance >= 50) items.push(['🧢', '챙 있는 모자']);
  if (rainChance >= 70) items.push(['☔', '얇은 우비']);
  if (isSunnyDay) {
    if (!has('모자')) items.push(['🧢', '모자']);
    items.push(['🧴', '선크림']);
  }
  if (isDark) items.push(['🔦', '반사띠나 라이트']);
  return items;
}

// 체감 온도·비·바람으로 한 줄 조언
function runningTip(feels, rainChance, wind) {
  const tips = [];
  if (feels < 0) tips.push('영하의 추위예요. 실내에서 충분히 몸을 풀고 나가세요.');
  else if (feels < 8) tips.push('쌀쌀해요. 겉옷을 입고 시작해서 몸이 데워지면 벗어 주세요.');
  else if (feels < 21) tips.push('달리기 딱 좋은 기온이에요.');
  else if (feels < 26) tips.push('조금 더울 수 있어요. 물을 챙기고 페이스를 살짝 늦춰 보세요.');
  else tips.push('더워요. 그늘이 있는 구간을 고르고, 중간중간 물을 꼭 마셔 주세요.');
  if (rainChance >= 60) tips.push('비 소식이 있으니 젖어도 괜찮은 신발을 신으세요.');
  if (wind >= 8) tips.push('바람이 강해요. 맞바람 구간에서는 무리하지 마세요.');
  return tips.join(' ');
}

// =============================================
// 6. 근처 행사 (TourAPI, 키가 없으면 예시 데이터)
// =============================================
async function loadEvents() {
  const p = state.params;
  const start = state.course.start;
  let events = [];
  let isSample = false;

  if (tourApiKey()) {
    try {
      events = await fetchTourEvents(p.date, start.lat, start.lng);
    } catch (e) {
      console.error(e);
      $('eventNote').textContent = '행사 정보를 불러오지 못했어요. TourAPI 키를 확인해 주세요.';
    }
  } else {
    isSample = true;
    try {
      const all = await loadJSON('data/events.json');
      events = all
        .filter((ev) => ev.region === p.region)
        .map((ev) => ({
          title: ev.name,
          start: ev.startDate,
          end: ev.endDate,
          place: ev.place,
          lat: ev.lat,
          lng: ev.lng,
          img: '',
          dist: distanceKm(start.lat, start.lng, ev.lat, ev.lng),
          note: ev.note,
        }));
    } catch (e) { console.error(e); }
  }

  if (isSample) {
    $('eventNote').textContent = '지금은 예시 데이터예요. 한국관광공사 TourAPI 키를 연결하면 실제 행사를 보여 드려요.';
  } else if (!$('eventNote').textContent) {
    $('eventNote').textContent = `${formatDateKo(p.date)}에 출발 지점 20km 안에서 열리는 행사예요.`;
  }

  if (events.length === 0) {
    $('eventList').innerHTML = '<li class="empty-msg">그날 근처에서 열리는 행사가 없어요.</li>';
    return;
  }

  const fmt = (d) => (d ? `${Number(d.slice(5, 7))}.${Number(d.slice(8, 10))}` : '');
  $('eventList').innerHTML = events.slice(0, 5).map((ev) => `
    <li class="event-item">
      <span class="event-thumb" ${ev.img ? `style="background-image:url('${esc(ev.img)}')"` : ''} aria-hidden="true"></span>
      <div>
        <p class="event-title">${isSample ? '<span class="tag tag--sample">예시</span>' : ''}${esc(ev.title)}</p>
        <p class="event-meta">${fmt(ev.start)}${ev.end && ev.end !== ev.start ? ` ~ ${fmt(ev.end)}` : ''} · ${esc(ev.place)} · 출발 지점에서 ${ev.dist.toFixed(1)}km</p>
        ${ev.note ? `<p class="event-meta">${esc(ev.note)}</p>` : ''}
      </div>
    </li>`).join('');

  // 지도가 준비되면 가까운 행사(5km 안)를 표시
  const addEventPins = () => events.filter((ev) => ev.dist <= 5).slice(0, 5).forEach((ev, i) => {
    addPin(`event-${i}`, new kakao.maps.LatLng(ev.lat, ev.lng), '행', 'pin--event', ev.title);
  });
  state.mapReady.then(addEventPins).catch(() => {});
}

// TourAPI 키: secrets.js(GitHub에 안 올라감) → config.js 순서로 찾기
// Encoding 키(%2B 같은 글자가 섞인 것)를 넣어도 동작하도록 한 번 풀어서 사용
function tourApiKey() {
  const raw = (typeof SECRETS !== 'undefined' && SECRETS.TOUR_API_KEY) || CONFIG.TOUR_API_KEY || '';
  if (!raw) return '';
  try { return raw.includes('%') ? decodeURIComponent(raw) : raw; } catch (e) { return raw; }
}

// 한국관광공사 TourAPI: 행사정보조회
async function fetchTourEvents(date, lat, lng) {
  const day = date.replaceAll('-', '');
  // 그날 진행 중인 행사도 포함하려고 120일 전에 시작한 것부터 받아서 날짜로 거르기
  const from = new Date(date + 'T00:00:00');
  from.setDate(from.getDate() - 120);
  const params = new URLSearchParams({
    serviceKey: tourApiKey(),
    MobileOS: 'ETC',
    MobileApp: 'TripRunning',
    _type: 'json',
    numOfRows: '500',
    pageNo: '1',
    arrange: 'A',
    eventStartDate: ymd(from).replaceAll('-', ''),
  });
  const res = await fetch(`https://apis.data.go.kr/B551011/KorService2/searchFestival2?${params}`);
  const data = await res.json();
  let items = data?.response?.body?.items?.item || [];
  if (!Array.isArray(items)) items = [items];

  const toDash = (s) => (s ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : '');
  return items
    .filter((it) => it.eventstartdate <= day && day <= it.eventenddate && it.mapx && it.mapy)
    .map((it) => ({
      title: it.title,
      start: toDash(it.eventstartdate),
      end: toDash(it.eventenddate),
      place: it.addr1 || '',
      lat: Number(it.mapy),
      lng: Number(it.mapx),
      img: it.firstimage2 || it.firstimage || '',
      dist: distanceKm(lat, lng, Number(it.mapy), Number(it.mapx)),
    }))
    .filter((ev) => ev.dist <= 20)
    .sort((a, b) => a.dist - b.dist);
}

// =============================================
// 7. 저장 · 공유 · 칼로리 입력
// =============================================
function bindActions() {
  // 몸무게 입력 → 칼로리 다시 계산
  $('kcalForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const w = Number($('kcalWeight').value);
    if (!w || w < 25 || w > 200) { toast('몸무게는 25~200kg 사이로 입력해 주세요.'); return; }
    const prev = readBodyInfo() || {};
    saveBodyInfo({ height: prev.height || null, weight: w });
    renderStats();
  });

  // PDF로 저장: 레포트 영역을 그림으로 찍은 뒤, 가로 A4 폭(210mm)의 한 장짜리 PDF로 만들기
  // (페이지를 나누면 지도나 목록이 중간에 잘려서, 화면처럼 길게 이어지는 한 장으로 저장)
  $('saveBtn').addEventListener('click', async () => {
    const btn = $('saveBtn');
    if (!window.html2canvas || !window.jspdf) {
      toast('PDF 기능을 불러오지 못했어요. 인터넷 연결을 확인해 주세요.');
      return;
    }
    btn.disabled = true;
    toast('PDF를 만드는 중이에요…');
    closeLabel();
    const report = $('report');
    report.classList.add('is-capturing');
    try {
      const canvas = await html2canvas(report, {
        useCORS: true,
        backgroundColor: '#eef0f3',
        scale: Math.min(2, Math.max(1.5, window.devicePixelRatio || 1)),
      });
      const img = canvas.toDataURL('image/jpeg', 0.9);
      const pageW = 210;                                   // mm
      const pageH = (pageW * canvas.height) / canvas.width; // 내용 길이만큼
      const pdf = new window.jspdf.jsPDF({ unit: 'mm', format: [pageW, pageH], orientation: pageH > pageW ? 'p' : 'l' });
      pdf.addImage(img, 'JPEG', 0, 0, pageW, pageH);

      const region = getRegion(state.params.region);
      pdf.setProperties({ title: `${region.name} 러닝 레포트 · 트립 런닝` });
      pdf.save(`트립런닝_${region.name}_${state.params.date}.pdf`);
      toast('레포트를 PDF로 저장했어요.');
    } catch (e) {
      console.error(e);
      toast('PDF로 저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.');
    } finally {
      report.classList.remove('is-capturing');
      btn.disabled = false;
    }
  });

  // 공유: 휴대폰은 공유 창, 컴퓨터는 링크 복사 (키·몸무게는 링크에 들어가지 않음)
  $('shareBtn').addEventListener('click', async () => {
    const region = getRegion(state.params.region);
    const shareData = {
      title: `${region.name} 러닝 레포트 · 트립 런닝`,
      text: `${formatDateKo(state.params.date)} ${region.name}에서 달릴 코스예요.`,
      url: location.href,
    };
    if (navigator.share) {
      try { await navigator.share(shareData); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    try {
      await navigator.clipboard.writeText(location.href);
      toast('레포트 링크를 복사했어요.');
    } catch (e) {
      window.prompt('아래 링크를 복사해 주세요.', location.href);
    }
  });
}
