// =============================================
// 나의 러닝 레포트 페이지 스크립트
//
// 화면에 들어가는 내용과 데이터 출처
//   코스·거리      : data/courses.json 예시 코스 (나중에 제미나이 + TMAP으로 교체)
//   예상 시간      : 거리 × 목표 페이스
//   칼로리         : 운동 강도(MET) × 몸무게 × 시간
//   날씨           : Open-Meteo (키 필요 없음)
//   쉬어 갈 곳·숙소: 카카오 장소 검색 (카카오 JavaScript 키)
//   행사           : 한국관광공사 TourAPI (config.js의 TOUR_API_KEY, 없으면 예시 데이터)
// 공통 함수(getParams, getRegion, loadJSON, pickCourse, loadKakaoMap, readBodyInfo 등)는 js/common.js 참고
// =============================================

const photo = (id, w = 1600) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&q=70`;

// 여행지별 상단 사진 (설문의 여행지 카드와 같은 사진)
const REGION_PHOTOS = {
  busan: '1638591751482-1a7d27fcea15',
  seoul: '1760000843601-2070baed2478',
  jeju: '1562680802-9cf8b15f419d',
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

  // 설문을 거치지 않았으면 안내 화면
  if (!p.region || !p.date || !getRegion(p.region)) {
    $('emptyState').classList.remove('d-none');
    return;
  }
  $('report').classList.remove('d-none');
  $('actionBar').classList.remove('d-none');

  // 1) 코스 정하기 (지금은 예시 코스 중에서 고름)
  try {
    const courses = await loadJSON('data/courses.json');
    state.course = pickCourse(courses, p);
  } catch (e) {
    console.error(e);
  }
  if (!state.course) {
    $('courseNote').textContent = '코스 데이터를 불러오지 못했어요. Live Server로 열었는지 확인해 주세요.';
    return;
  }
  state.courseKm = state.course.distanceKm;

  renderHero();
  renderFacts();

  // 2) 지도 · 날씨 · 행사는 서로 기다리지 않고 동시에
  state.mapReady = initMap();
  loadWeather();
  loadEvents();
  try {
    await state.mapReady;
    loadRestSpots();
    loadStays();
  } catch (e) {
    console.error(e);
    $('map').innerHTML = '<p class="empty-msg" style="padding:20px">지도를 불러오지 못했어요. 카카오 키와 도메인 등록을 확인해 주세요.</p>';
    $('restList').innerHTML = '<li class="empty-msg">지도를 불러오지 못해 주변 장소를 찾지 못했어요.</li>';
    $('stayList').innerHTML = '<li class="empty-msg">지도를 불러오지 못해 숙소를 찾지 못했어요.</li>';
  }

  bindActions();
}

// =============================================
// 1. 상단 요약
// =============================================
function renderHero() {
  const p = state.params;
  const region = getRegion(p.region);
  const course = state.course;

  // 사진
  const pid = REGION_PHOTOS[p.region];
  if (pid) $('hero').style.setProperty('--hero-bg', `url('${photo(pid, window.innerWidth > 900 ? 2000 : 1100)}')`);

  // 날짜 · 시간대 · 남은 날
  const today = new Date(ymd(new Date()) + 'T00:00:00');
  const dday = Math.round((new Date(p.date + 'T00:00:00') - today) / 86400000);
  const ddayText = dday === 0 ? '오늘' : dday > 0 ? `${dday}일 남음` : '지난 날짜';
  $('heroWhen').textContent = [formatDateKo(p.date), p.time, ddayText].filter(Boolean).join(' · ');
  $('heroTitle').textContent = `${region.name} 러닝 레포트`;
  $('heroCourse').textContent = course.name;
  document.title = `${region.name} 러닝 레포트 · 트립 런닝`;

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
  const roundTrip = c.start.lat === c.end.lat && c.start.lng === c.end.lng;
  const facts = [
    ['출발', c.start.name],
    ['도착', c.end.name],
    ['코스 형태', roundTrip ? '같은 곳으로 돌아오는 코스' : '한 방향 코스'],
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

  // 지도로 잰 실제 길이로 거리 갱신
  const realKm = line.getLength() / 1000;
  if (realKm > 0.1) {
    state.courseKm = Math.round(realKm * 10) / 10;
    renderStats();
  }

  addPin('start', path[0], 'S', 'pin--start', c.start.name);
  addPin('end', path[path.length - 1], 'E', 'pin--end', c.end.name);

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
  const c = state.course;
  const roundTrip = c.start.lat === c.end.lat && c.start.lng === c.end.lng;
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
// 5. 날씨 (Open-Meteo)
// =============================================
async function loadWeather() {
  const p = state.params;
  const { lat, lng } = state.course.start;
  const hours = TIME_HOURS[p.time] || TIME_HOURS['새벽·아침'];

  const today = new Date(ymd(new Date()) + 'T00:00:00');
  const target = new Date(p.date + 'T00:00:00');
  const daysAhead = Math.round((target - today) / 86400000);

  // 15일 안이면 예보, 그보다 멀면 작년 같은 날 기록
  let url;
  let isForecast = true;
  const common = `latitude=${lat}&longitude=${lng}&timezone=Asia%2FSeoul&wind_speed_unit=ms`;
  if (daysAhead >= 0 && daysAhead <= 15) {
    url = `https://api.open-meteo.com/v1/forecast?${common}&hourly=temperature_2m,apparent_temperature,precipitation_probability,precipitation,weather_code,wind_speed_10m,relative_humidity_2m&start_date=${p.date}&end_date=${p.date}`;
  } else {
    isForecast = false;
    const lastYear = new Date(target);
    lastYear.setFullYear(target.getFullYear() - 1);
    const d = ymd(lastYear);
    url = `https://archive-api.open-meteo.com/v1/archive?${common}&hourly=temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,relative_humidity_2m&start_date=${d}&end_date=${d}`;
  }

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
    const wind = Math.max(0, ...pickHours(h.wind_speed_10m));
    const humid = avg(pickHours(h.relative_humidity_2m));
    const code = Math.max(0, ...pickHours(h.weather_code));
    const [desc, icon] = weatherText(code);

    $('weatherSource').textContent = isForecast
      ? `${p.time || '아침'} 시간대 예보예요.`
      : `아직 예보가 나오지 않은 날짜라, 작년 같은 날 ${p.time || '아침'} 기록을 보여 드려요.`;

    const rainCell = isForecast
      ? `<div><dt>비 올 확률</dt><dd>${Math.round(rainProb)}%</dd></div>`
      : `<div><dt>강수량</dt><dd>${rainMm.toFixed(1)}mm</dd></div>`;

    $('weather').innerHTML = `
      <div class="weather-main">
        <span class="weather-icon" aria-hidden="true">${icon}</span>
        <div>
          <div class="weather-temp">${Math.round(temp)}°</div>
        </div>
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
      <p class="weather-tip">${runningTip(feels, isForecast ? rainProb : rainMm > 0.5 ? 70 : 0, wind)}</p>
    `;
  } catch (e) {
    console.error(e);
    $('weatherSource').textContent = '';
    $('weather').innerHTML = '<p class="empty-msg">날씨 정보를 불러오지 못했어요. 잠시 뒤 새로고침해 주세요.</p>';
  }
}

// 체감 온도·비·바람으로 한 줄 조언
function runningTip(feels, rainChance, wind) {
  const tips = [];
  if (feels < 0) tips.push('영하의 추위예요. 장갑과 귀를 덮는 모자를 챙기고, 실내에서 충분히 몸을 풀고 나가세요.');
  else if (feels < 8) tips.push('쌀쌀해요. 얇은 겉옷을 입고 시작해서 몸이 데워지면 벗어 주세요.');
  else if (feels < 18) tips.push('달리기 딱 좋은 기온이에요.');
  else if (feels < 25) tips.push('조금 더울 수 있어요. 물을 챙기고 페이스를 살짝 늦춰 보세요.');
  else tips.push('더워요. 그늘이 있는 구간을 고르고, 중간중간 물을 꼭 마셔 주세요.');
  if (rainChance >= 60) tips.push('비 소식이 있으니 모자나 얇은 우비를 챙기세요.');
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

  if (CONFIG.TOUR_API_KEY) {
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

// 한국관광공사 TourAPI: 행사정보조회
async function fetchTourEvents(date, lat, lng) {
  const day = date.replaceAll('-', '');
  // 그날 진행 중인 행사도 포함하려고 120일 전에 시작한 것부터 받아서 날짜로 거르기
  const from = new Date(date + 'T00:00:00');
  from.setDate(from.getDate() - 120);
  const params = new URLSearchParams({
    serviceKey: CONFIG.TOUR_API_KEY,
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

  // 이미지로 저장
  $('saveBtn').addEventListener('click', async () => {
    const btn = $('saveBtn');
    btn.disabled = true;
    closeLabel();
    const report = $('report');
    report.classList.add('is-capturing');
    try {
      const canvas = await html2canvas(report, {
        useCORS: true,
        backgroundColor: '#eef0f3',
        scale: Math.min(2, window.devicePixelRatio || 1),
      });
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('이미지 만들기 실패');
      const region = getRegion(state.params.region);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `트립런닝_${region.name}_${state.params.date}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      toast('레포트 이미지를 저장했어요.');
    } catch (e) {
      console.error(e);
      toast('이미지로 저장하지 못했어요. 화면 캡처 기능을 이용해 주세요.');
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
