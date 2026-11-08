// =============================================
// 공통 함수 — 모든 페이지에서 사용
// 함수를 추가/수정할 때는 팀에 먼저 공유해 주세요.
// =============================================

// ---------- 지역 목록 (설문 Q1 선택지 & 지도 중심 좌표) ----------
const REGIONS = [
  { code: 'busan', name: '부산', center: { lat: 35.1532, lng: 129.1186 } },
  { code: 'seoul', name: '서울', center: { lat: 37.5296, lng: 126.9343 } },
  { code: 'jeju',  name: '제주', center: { lat: 33.5145, lng: 126.5210 } },
];

function getRegion(code) {
  return REGIONS.find((r) => r.code === code) || null;
}

// ---------- 페이지 간 데이터 전달: URL 파라미터 ----------
// 설문 → 레포트로 이동할 때 이렇게 씁니다.
//   location.href = 'report.html?' + buildQuery({ region: 'busan', km: 5, date: '2026-11-14' });
// 레포트에서 읽을 때:
//   const p = getParams();  // { region: 'busan', km: 5, date: '2026-11-14', ... }
// 이 주소를 그대로 복사하면 '링크 공유'가 됩니다.

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
    region: p.get('region'),               // 'busan' | 'seoul' | 'jeju'
    km: p.get('km') ? Number(p.get('km')) : null,
    date: p.get('date'),                   // 'YYYY-MM-DD'
    level: p.get('level'),                 // '입문' | '보통' | '숙련' (선택 질문)
    scenery: p.get('scenery'),             // '바다' | '강변' | '도심' | '공원' | '산책로' (선택 질문)
    time: p.get('time'),                   // '아침' | '낮' | '저녁' (선택 질문)
    after: p.get('after'),                 // '식사' | '카페' | '관광' (선택 질문)
  };
}

// ---------- 데이터 불러오기 ----------
// ⚠ fetch는 파일을 더블클릭(file://)으로 열면 동작하지 않습니다.
//    반드시 VS Code의 Live Server로 열어 주세요.
async function loadJSON(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path} 불러오기 실패 (${res.status})`);
  return res.json();
}

// ---------- 코스 선정 ----------
// 같은 지역 코스 중 원하는 거리와 가장 가까운 코스를 고릅니다.
// 선택 질문(풍경, 난이도)이 일치하면 우선합니다. 필요하면 규칙을 바꿔도 됩니다.
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

// ---------- 거리 계산 (두 좌표 사이 직선거리, km) ----------
function distanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// ---------- 날짜 표시: '2026-11-14' → '11월 14일(토)' ----------
function formatDateKo(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return `${d.getMonth() + 1}월 ${d.getDate()}일(${days[d.getDay()]})`;
}

// ---------- 카카오맵 SDK 불러오기 ----------
// 사용법: loadKakaoMap().then(() => { const map = new kakao.maps.Map(...); });
function loadKakaoMap() {
  return new Promise((resolve, reject) => {
    if (window.kakao && window.kakao.maps) return kakao.maps.load(resolve);
    const script = document.createElement('script');
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${CONFIG.KAKAO_JS_KEY}&autoload=false`;
    script.onload = () => kakao.maps.load(resolve);
    script.onerror = () => reject(new Error('카카오맵 SDK를 불러오지 못했습니다. 키/도메인 등록/카카오맵 사용 설정을 확인하세요.'));
    document.head.appendChild(script);
  });
}

// ---------- 공통 헤더 / 푸터 ----------
// 각 페이지에 <header id="site-header"></header>, <footer id="site-footer"></footer>만 두면 자동으로 채워집니다.
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
