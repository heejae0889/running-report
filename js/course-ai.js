// =============================================
// AI 맞춤 코스 만들기
//   ① 제미나이 : 설문 답을 보고 코스를 기획 → 들를 곳을 '장소 이름'으로 정함
//   ② 카카오   : 장소 이름 → 정확한 좌표
//   ③ TMAP     : 좌표 사이의 실제 걷는 길 → 경로 좌표, 실제 거리
//   ④ 거리 확인: 원하는 거리와 많이 다르면 제미나이에게 한 번 더 요청
// 키는 js/secrets.js (GitHub에 안 올라가는 파일)에서 읽습니다.
// 만들어진 코스는 data/courses.json과 같은 모양이라, 레포트는 예시 코스와 똑같이 그립니다.
// =============================================

const AI_KEYS = () => (typeof SECRETS !== 'undefined' ? SECRETS : {});
const hasAiKeys = () => Boolean(AI_KEYS().GEMINI_API_KEY && AI_KEYS().TMAP_APP_KEY);
const hasTmapKey = () => Boolean(AI_KEYS().TMAP_APP_KEY);

// 원하는 거리와 25% 넘게 다르면 제미나이에게 다시 짜 달라고 요청
// (무한히 기다리지 않도록 최대 3번까지 다시 시도하고, 그래도 안 맞으면 가장 가까웠던 코스를 사용)
const DISTANCE_TOLERANCE = 0.25;
const MAX_RETRIES = 3;

// ---------- 메인: 설문 답 → 코스 ----------
// onStep(text, percent, step): 진행 상황을 화면에 보여 줄 때 사용
//   step: 'plan'(제미나이 구상) → 'place'(장소 찾기) → 'route'(길 계산) → 'done'
//   percent: 0~100, 진행바를 얼마나 채울지
async function buildAiCourse(params, onStep = () => {}) {
  const region = getRegion(params.region);
  const target = params.km || 5;
  const gap = (c) => Math.abs(c.distanceKm - target) / target;

  // 첫 시도: 진행바 8% → 85%
  onStep('제미나이가 코스를 구상하고 있어요…', 8, 'plan');
  let plan = await askGeminiForPlan(params);
  let best = await planToCourse(plan, region, (text, frac, step) => onStep(text, 45 + frac * 40, step));
  const tried = [{ plan, km: best.distanceKm }];

  // 다시 시도: 남은 진행바(86% → 96%)를 시도 횟수만큼 나눠서 사용
  for (let attempt = 1; attempt <= MAX_RETRIES && gap(best) > DISTANCE_TOLERANCE; attempt++) {
    const from = 86 + ((attempt - 1) / MAX_RETRIES) * 10;
    const size = 10 / MAX_RETRIES;
    const last = tried[tried.length - 1];
    onStep(`거리를 맞추고 있어요… (${last.km}km → 목표 ${target}km, ${attempt}/${MAX_RETRIES})`, from, 'plan');
    try {
      const nextPlan = await askGeminiForPlan(params, { attempts: tried });
      const next = await planToCourse(nextPlan, region, (text, frac, step) => onStep(text, from + frac * size, step));
      tried.push({ plan: nextPlan, km: next.distanceKm });
      if (gap(next) < gap(best)) best = next;
    } catch (e) {
      console.warn(`${attempt}번째 다시 시도 실패`, e);
    }
  }

  onStep('코스가 완성됐어요!', 97, 'done');
  return best;
}

// 설문 페이지에서 만든 코스를 레포트 페이지로 넘기기 (이 탭에만 잠깐 저장)
function saveBuiltCourse(course) {
  try {
    sessionStorage.setItem('tripRunningCourse', JSON.stringify({ route: courseToRouteParam(course), course }));
  } catch (e) { /* 저장이 막힌 브라우저면 레포트에서 TMAP으로 다시 그림 */ }
}
function readBuiltCourse(routeRaw) {
  try {
    const saved = JSON.parse(sessionStorage.getItem('tripRunningCourse'));
    return saved && saved.route === routeRaw ? saved.course : null;
  } catch (e) {
    return null;
  }
}

// 공유 링크로 열었을 때: 저장된 들를 곳(좌표)으로 TMAP 경로만 다시 그리기
async function rebuildCourseFromRoute(route, regionCode) {
  const region = getRegion(regionCode);
  const points = route.w.map(([name, lat, lng]) => ({ name, lat, lng }));
  const course = await routeThrough(points, route.t, region);
  course.name = route.n;
  course.description = route.s || '';
  return course;
}

// 공유 링크에 넣을 짧은 형태
function courseToRouteParam(course) {
  return JSON.stringify({
    n: course.name,
    t: course.type,
    s: course.description,
    w: course.waypoints.map((w) => [w.name, +w.lat.toFixed(6), +w.lng.toFixed(6)]),
  });
}

// =============================================
// ① 제미나이: 코스 기획
// =============================================
async function askGeminiForPlan(p, retry = null) {
  const region = getRegion(p.region);
  const lines = [
    `- 지역: ${region.name} (반드시 ${region.name} 안의 장소만)`,
    `- 원하는 총 거리: ${p.km || 5}km (왕복이면 왕복 합계)`,
    `- 날짜와 시간대: ${p.date} ${p.time || ''}`,
    `- 러닝 경험: ${p.level || '보통'}, 목표 페이스: 1km당 ${p.pace || '모름'}`,
    `- 함께 달리는 인원: ${p.group || '혼자'}`,
    `- 보고 싶은 풍경: ${p.scenery || '상관없음'}`,
    `- 숙박: ${p.stay || '-'}, 여행 기간: ${p.days || '-'}`,
  ];

  let prompt = `너는 한국 여행지의 러닝 코스를 짜 주는 전문가야. 아래 조건에 맞는 러닝 코스를 하나 짜 줘.

[조건]
${lines.join('\n')}

[규칙]
1. waypoints는 달리는 순서대로 2~6개. 첫 번째가 출발점이야.
   - type이 '왕복'이면 마지막 waypoint가 반환점이야. (돌아오는 길은 쓰지 마)
   - type이 '순환'이면 출발점으로 다시 돌아오는 코스야. (출발점을 마지막에 다시 쓰지 마)
   - type이 '편도'면 마지막 waypoint가 도착점이야.
2. 각 waypoint의 query는 카카오맵에서 그대로 검색되는 실제 장소 이름이어야 해. (예: '광안리해수욕장', '민락수변공원', '여의나루역 2번출구') 지어낸 이름은 절대 쓰지 마.
3. 산책로, 해변길, 강변길, 공원길처럼 사람이 달릴 수 있는 길로 이어지게 하고, 자동차 전용 도로나 출입이 제한된 곳은 피해.
4. 장소 사이의 실제 거리를 생각해서 총 거리가 원하는 거리에 최대한 가깝게 해.
   들를 곳은 0.5~1.5km 간격으로 촘촘하게 잡아서, 길찾기가 해변 산책로·강변길 같은 원하는 길을 벗어나 큰 도로로 돌아가지 않게 해.
5. 입문자면 평탄한 길, 여럿이면 넓은 길, 밤이면 조명이 있는 길을 우선해.
6. reasons에는 이 사람에게 이 코스가 맞는 이유를, tips에는 그날 이 코스를 달릴 때의 팁을 각각 2~3개, 한 문장씩 써.
7. summary, reasons, tips에는 거리 숫자(km)를 쓰지 말고, 코스를 다시 짠 과정이나 이전 코스 이야기도 쓰지 마. 사용자에게 보여 줄 글이야.`;

  if (retry) {
    const history = retry.attempts
      .map((t, i) => `${i + 1}) ${t.plan.waypoints.map((w) => w.query).join(' → ')} (${t.plan.type}) → 실제 ${t.km}km`)
      .join('\n');
    const lastKm = retry.attempts[retry.attempts.length - 1].km;
    const direction = lastKm < p.km ? '더 멀리 가도록 반환점을 멀리 잡거나 들를 곳을 늘려' : '더 가깝게 반환점을 당기거나 들를 곳을 줄여';
    prompt += `\n\n[다시 짜기]\n지금까지 짠 코스를 실제 길로 재 보니 원하는 거리 ${p.km}km와 차이가 컸어.\n${history}\n이번에는 ${direction} 원하는 거리의 ±25% 안에 들어오게 다시 짜 줘.`;
  }

  const schema = {
    type: 'OBJECT',
    properties: {
      courseName: { type: 'STRING', description: '코스 이름 (예: 광안리 해변 노을 코스)' },
      summary: { type: 'STRING', description: '코스 소개 한두 문장' },
      type: { type: 'STRING', enum: ['왕복', '순환', '편도'] },
      waypoints: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            name: { type: 'STRING', description: '화면에 보여 줄 짧은 이름' },
            query: { type: 'STRING', description: '카카오맵 검색어 (실제 장소 이름)' },
          },
          required: ['name', 'query'],
        },
      },
      reasons: { type: 'ARRAY', items: { type: 'STRING' } },
      tips: { type: 'ARRAY', items: { type: 'STRING' } },
    },
    required: ['courseName', 'summary', 'type', 'waypoints', 'reasons', 'tips'],
  };

  const text = await callGemini(prompt, schema);
  let plan;
  try {
    plan = JSON.parse(text);
  } catch (e) {
    throw new Error('제미나이 답을 읽지 못했어요.');
  }
  if (!Array.isArray(plan.waypoints) || plan.waypoints.length < 2) throw new Error('제미나이가 들를 곳을 충분히 정하지 못했어요.');
  plan.waypoints = plan.waypoints.slice(0, 6);
  if (!['왕복', '순환', '편도'].includes(plan.type)) plan.type = '왕복';
  return plan;
}

// 사용할 모델 순서: secrets.js에서 고른 모델 → 예비 모델들
// (요청이 몰려서 503, 사용량 초과 429, 모델 없음 404, 응답이 너무 느리면 다음 모델로)
const GEMINI_FALLBACK_MODELS = ['gemini-3.5-flash-lite', 'gemini-flash-lite-latest', 'gemini-flash-latest'];
const GEMINI_TIMEOUT_MS = 25000;

async function callGemini(prompt, schema) {
  const models = [...new Set([AI_KEYS().GEMINI_MODEL, ...GEMINI_FALLBACK_MODELS].filter(Boolean))];
  let lastError = '알 수 없는 오류';

  for (const model of models) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), GEMINI_TIMEOUT_MS);
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': AI_KEYS().GEMINI_API_KEY },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json', responseSchema: schema, temperature: 0.7 },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        lastError = `${model} (${res.status}): ${data?.error?.message || '오류'}`;
        if ([401, 403].includes(res.status)) break;            // 키 문제는 다른 모델로 바꿔도 같음
        console.warn('제미나이 다음 모델로 전환:', lastError);
        continue;
      }
      const text = data?.candidates?.[0]?.content?.parts?.map((x) => x.text || '').join('') || '';
      if (text) return text;
      lastError = `${model}: 빈 답`;
    } catch (e) {
      lastError = e.name === 'AbortError' ? `${model}: 응답이 너무 늦음` : `${model}: ${e.message}`;
      console.warn('제미나이 다음 모델로 전환:', lastError);
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(`제미나이 오류 - ${lastError}`);
}

// =============================================
// ② 카카오: 장소 이름 → 좌표
// =============================================
// report(text, frac, step): frac은 0~1 (장소 찾기 0~0.5, 길 계산 0.5~1)
async function planToCourse(plan, region, report = () => {}) {
  const points = [];
  const n = plan.waypoints.length;
  for (let i = 0; i < n; i++) {
    const wp = plan.waypoints[i];
    report(`'${wp.name || wp.query}' 위치를 찾고 있어요…`, (i / n) * 0.5, 'place');
    const found = await findPlace(wp.query, region) || await findPlace(`${region.name} ${wp.query}`, region);
    if (found) points.push({ name: wp.name || wp.query, lat: found.lat, lng: found.lng });
    else console.warn('장소를 찾지 못해 건너뜀:', wp.query);
  }
  report('실제 걷는 길을 계산하고 있어요…', 0.55, 'route');
  // 같은 곳이 연달아 나오면 하나로
  const uniq = points.filter((pt, i) => i === 0 || distanceKm(pt.lat, pt.lng, points[i - 1].lat, points[i - 1].lng) > 0.05);
  if (uniq.length < 2) throw new Error('제미나이가 고른 장소를 지도에서 찾지 못했어요.');

  const course = await routeThrough(uniq, plan.type, region);
  report(`길 계산 완료: ${course.distanceKm}km`, 1, 'route');
  course.name = plan.courseName;
  course.description = plan.summary;
  course.reasons = plan.reasons || [];
  course.tips = plan.tips || [];
  return course;
}

function findPlace(query, region) {
  return new Promise((resolve) => {
    const places = new kakao.maps.services.Places();
    const timer = setTimeout(() => resolve(null), 8000);
    places.keywordSearch(query, (data, status) => {
      clearTimeout(timer);
      if (status !== kakao.maps.services.Status.OK) return resolve(null);
      // 주소가 그 지역인 첫 번째 결과 (예: '강원특별자치도 강릉시 …'에 '강릉시'가 들어 있는지)
      const addrKey = region.addr || region.name;
      const hit = data.find((d) => (d.road_address_name || d.address_name || '').includes(addrKey));
      resolve(hit ? { lat: Number(hit.y), lng: Number(hit.x), name: hit.place_name } : null);
    }, {
      location: new kakao.maps.LatLng(region.center.lat, region.center.lng),
      sort: kakao.maps.services.SortBy.ACCURACY,
    });
  });
}

// =============================================
// ③ TMAP: 좌표 사이의 실제 걷는 길
// =============================================
async function routeThrough(points, type, region) {
  const start = points[0];
  const end = points[points.length - 1];
  const via = points.slice(1, -1).slice(0, 5);                       // TMAP 경유지는 최대 5곳
  const leg = await tmapPedestrian(start, end, via);

  let path = leg.path;
  let meters = leg.meters;
  if (type === '왕복') {                                            // 반환점까지 간 길을 그대로 돌아오기
    path = [...path, ...path.slice(0, -1).reverse()];
    meters *= 2;
  } else if (type === '순환') {                                     // 마지막 장소 → 출발점으로 돌아오는 길을 따로 찾아 이어 붙이기
    const back = await tmapPedestrian(end, start);                  // (출발=도착인 요청은 TMAP이 거부할 수 있어서 두 번에 나눔)
    path = [...path, ...back.path.slice(1)];
    meters += back.meters;
  }

  const last = path[path.length - 1];
  return {
    id: 'ai',
    source: 'ai',
    type,
    region: region.code,
    regionName: region.name,
    start: { name: start.name, lat: path[0][0], lng: path[0][1] },
    end: { name: type === '편도' ? end.name : start.name, lat: last[0], lng: last[1] },
    path,
    waypoints: points,
    distanceKm: Math.round((meters / 1000) * 10) / 10,
  };
}

async function tmapPedestrian(start, end, via = []) {
  const body = {
    startX: String(start.lng),
    startY: String(start.lat),
    endX: String(end.lng),
    endY: String(end.lat),
    startName: encodeURIComponent(start.name),
    endName: encodeURIComponent(end.name),
    reqCoordType: 'WGS84GEO',
    resCoordType: 'WGS84GEO',
    searchOption: '0',
  };
  if (via.length) body.passList = via.map((v) => `${v.lng},${v.lat}`).join('_');

  const res = await fetch('https://apis.openapi.sk.com/tmap/routes/pedestrian?version=1&format=json', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', appKey: AI_KEYS().TMAP_APP_KEY },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !Array.isArray(data.features)) {
    const msg = data?.error?.message || data?.error?.code || `HTTP ${res.status}`;
    throw new Error(`TMAP 길찾기 오류: ${msg}`);
  }

  // LineString 좌표를 이어 붙이기 (TMAP은 [경도, 위도] 순서)
  const path = [];
  data.features.forEach((f) => {
    if (f.geometry?.type !== 'LineString') return;
    f.geometry.coordinates.forEach(([lng, lat]) => {
      const prev = path[path.length - 1];
      if (!prev || prev[0] !== lat || prev[1] !== lng) path.push([lat, lng]);
    });
  });
  if (path.length < 2) throw new Error('TMAP이 길을 찾지 못했어요.');

  const meters = Number(data.features[0]?.properties?.totalDistance) || 0;
  return { path, meters };
}
