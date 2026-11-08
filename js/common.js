// ---------- 지역 목록 ----------
const REGIONS = [
  { code: 'busan',     name: '부산', addr: '부산',   center: { lat: 35.1532, lng: 129.1186 } },
  { code: 'seoul',     name: '서울', addr: '서울',   center: { lat: 37.5296, lng: 126.9343 } },
  { code: 'jeju',      name: '제주', addr: '제주',   center: { lat: 33.5145, lng: 126.5210 } },
  { code: 'gangneung', name: '강릉', addr: '강릉시', center: { lat: 37.7956, lng: 128.9050 } },
  { code: 'gyeongju',  name: '경주', addr: '경주시', center: { lat: 35.8350, lng: 129.2600 } },
  { code: 'yeosu',     name: '여수', addr: '여수시', center: { lat: 34.7400, lng: 127.7400 } },
];

function getRegion(code) {
  return REGIONS.find((r) => r.code === code) || null;
}

// ---------- 페이지 간 데이터 전달 ----------

function buildQuery(obj) {
  const params = new URLSearchParams();
  Object.entries(obj).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') params.set(key, value);
  });
  return params.toString();
}

function getParams() {
  const p = new URLSearchParams(location.search);
  return {
    region: p.get('region'),               
    date: p.get('date'),                   
    stay: p.get('stay'),                   
    days: p.get('days'),                   
    time: p.get('time'),                   
    group: p.get('group'),                
    level: p.get('level'),               
    pace: p.get('pace'),                 
    km: p.get('km') ? Number(p.get('km')) : null,
    scenery: p.get('scenery'),           
  };
}

// ---------- 키·몸무게----------
function saveBodyInfo(info) {
  try {
    if (info) sessionStorage.setItem('tripRunningBody', JSON.stringify(info));
    else sessionStorage.removeItem('tripRunningBody');
  } catch (e) {}
}
function readBodyInfo() {
  try { return JSON.parse(sessionStorage.getItem('tripRunningBody')); } catch (e) { return null; }
}

// ---------- 데이터 불러오기 ----------
async function loadJSON(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path} 불러오기 실패 (${res.status})`);
  return res.json();
}

// ---------- 코스 선정 ----------
function pickCourse(courses, { region, km, scenery, level }) {
  const candidates = courses.filter((c) => c.region === region);
  if (candidates.length === 0) return null;
  const score = (c) => {
    let s = Math.abs(c.distanceKm - (km || c.distanceKm));
    if (scenery && c.scenery === scenery) s -= 1;
    if (level && c.level === level) s -= 0.5;
    return s;
  };
  return candidates.sort((a, b) => score(a) - score(b))[0];
}

// ---------- 거리 계산 (두 좌표 사이 직선거리) ----------
function distanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// ---------- 날짜 표시----------
function formatDateKo(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return `${d.getMonth() + 1}월 ${d.getDate()}일(${days[d.getDay()]})`;
}

// ---------- 카카오맵 불러오기 ----------
function loadKakaoMap() {
  return new Promise((resolve, reject) => {
    if (window.kakao && window.kakao.maps) return kakao.maps.load(resolve);
    const script = document.createElement('script');
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${CONFIG.KAKAO_JS_KEY}&libraries=services&autoload=false`;
    script.onload = () => kakao.maps.load(resolve);
    script.onerror = () => reject(new Error('카카오맵 SDK를 불러오지 못했습니다. 키/도메인 등록/카카오맵 사용 설정을 확인하세요.'));
    document.head.appendChild(script);
  });
}

// ---------- 공통 헤더 / 푸터 ----------
function renderLayout() {
  const page = location.pathname.split('/').pop() || 'index.html';
  const nav = [
    { href: 'index.html', label: '홈' },
    { href: 'survey.html', label: '코스 찾기' },
  ];
  const header = document.getElementById('site-header');
  if (header) {
    header.className = 'site-header';
    header.innerHTML = `
      <nav class="navbar navbar-expand container py-2">
        <a class="navbar-brand" href="index.html">트립 런닝</a>
        <ul class="navbar-nav ms-auto">
          ${nav.map((n) => `<li class="nav-item"><a class="nav-link ${page === n.href ? 'active' : ''}" href="${n.href}">${n.label}</a></li>`).join('')}
        </ul>
      </nav>`;
  }
  const footer = document.getElementById('site-footer');
  if (footer) {
    footer.className = 'site-footer';
    footer.innerHTML = `<div class="container text-center">© 2026 트립 런닝 · AI소프트웨어학부 23팀 웹프로그래밍 팀 프로젝트 · 사진 Unsplash</div>`;
  }
}

document.addEventListener('DOMContentLoaded', renderLayout);
