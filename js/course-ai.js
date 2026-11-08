//   제미나이 - 설문 답을 보고 코스를 기획 => 들를 곳을 '장소 이름'으로 정함
//   카카오 - 장소 이름 => 정확한 좌표
//   TMAP - 좌표 사이의 실제 걷는 길 => 경로 좌표, 실제 거리
//   거리 확인 - 원하는 거리와 많이 다르면 제미나이에게 한 번 더 요청

const AI_KEYS = () => (typeof SECRETS !== 'undefined' ? SECRETS : {});
const hasAiKeys = () => Boolean(AI_KEYS().GEMINI_API_KEY && AI_KEYS().TMAP_APP_KEY);
const hasTmapKey = () => Boolean(AI_KEYS().TMAP_APP_KEY);

// 첫 시도 포함 최대 5번까지 시도하고, 그래도 25% 안에 드는 코스가 없으면 가장 가까웠던 코스를 사용
const DISTANCE_TOLERANCE = 0.25;
const MAX_ATTEMPTS = 5;
const MAX_RETRIES = MAX_ATTEMPTS - 1;

// ---------- 메인 ----------
// 시도마다: 제미나이 구상 → 장소 찾기 → 길 계산
// 중간에 실패해도 그 시도만 버리고 다음 시도로 넘어감 (5번 모두 실패할 때만 에러)
async function buildAiCourse(params, onStep = () => {}) {
  const region = getRegion(params.region);
  const target = params.km || 5;
  const gap = (c) => Math.abs(c.distanceKm - target) / target;

  let best = null;
  let lastError = null;
  const tried = [];

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (best && gap(best) <= DISTANCE_TOLERANCE) break;

    // 진행바: 첫 시도 8% → 85%, 다시 시도는 남은 86% → 96%를 나눠서 사용
    const first = attempt === 0;
    const from = first ? 45 : 86 + ((attempt - 1) / MAX_RETRIES) * 10;
    const size = first ? 40 : 10 / MAX_RETRIES;
    if (first) onStep('제미나이가 코스를 구상하고 있어요…', 8, 'plan');
    else onStep('거리를 맞추고 있어요…', from, 'plan');

    try {
      const plan = await askGeminiForPlan(params, tried.length ? { attempts: tried } : null);
      const course = await planToCourse(plan, region, (text, frac, step) => onStep(text, from + frac * size, step));
      tried.push({ plan, km: course.distanceKm });
      if (!best || gap(course) < gap(best)) best = course;
    } catch (e) {
      lastError = e;
      console.warn(`${attempt + 1}번째 시도 실패`, e);
    }
  }

  if (!best) throw lastError || new Error('코스를 만들지 못했어요.');
  onStep('코스가 완성됐어요!', 97, 'done');
  return best;
}

// 설문 페이지에서 만든 코스를 레포트 페이지로 넘기기 (이 탭에만 잠깐 저장)
function saveBuiltCourse(course) {
  try {
    sessionStorage.setItem('tripRunningCourse', JSON.stringify({ route: courseToRouteParam(course), course }));
  } catch (e) {  }
}
function readBuiltCourse(routeRaw) {
  try {
    const saved = JSON.parse(sessionStorage.getItem('tripRunningCourse'));
    return saved && saved.route === routeRaw ? saved.course : null;
  } catch (e) {
    return null;
  }
}

// 공유 링크로 열었을 때
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

// 제미나이 프롬포트
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

// 카카오
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
  // 서로 120m 안으로 붙은 장소는 하나로 (TMAP은 너무 가까운 경유지를 거부함)
  const uniq = [];
  points.forEach((pt) => {
    const prev = uniq[uniq.length - 1];
    if (!prev || distanceKm(pt.lat, pt.lng, prev.lat, prev.lng) > 0.12) uniq.push(pt);
  });
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
      // 주소가 그 지역인 첫 번째 결과
      const addrKey = region.addr || region.name;
      const hit = data.find((d) => (d.road_address_name || d.address_name || '').includes(addrKey));
      resolve(hit ? { lat: Number(hit.y), lng: Number(hit.x), name: hit.place_name } : null);
    }, {
      location: new kakao.maps.LatLng(region.center.lat, region.center.lng),
      sort: kakao.maps.services.SortBy.ACCURACY,
    });
  });
}


// TMAP
async function routeThrough(points, type, region) {
  let leg;
  try {
    leg = await tmapPedestrian(points[0], points[points.length - 1], points.slice(1, -1).slice(0, 5));   // TMAP 경유지는 최대 5곳
  } catch (e) {
    console.warn('한 번에 길찾기 실패 → 구간별로 다시', e);
    ({ leg, points } = await routeLegByLeg(points));
  }
  const start = points[0];
  const end = points[points.length - 1];

  let path = leg.path;
  let meters = leg.meters;
  if (type === '왕복') {                                            // 반환점까지 간 길을 그대로 돌아오기
    path = [...path, ...path.slice(0, -1).reverse()];
    meters *= 2;
  } else if (type === '순환') {                                     // 마지막 장소 → 출발점으로 돌아오는 길을 따로 찾아 이어 붙이기
    const back = await tmapPedestrian(end, start);                  
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

// 구간별로 길찾기: 실패한 구간은 다음 장소를 빼고 다시 이어 보기
async function routeLegByLeg(input) {
  const points = [...input];
  const path = [];
  let meters = 0;
  let i = 0;
  while (i < points.length - 1) {
    try {
      const leg = await tmapPedestrian(points[i], points[i + 1]);
      path.push(...(path.length ? leg.path.slice(1) : leg.path));
      meters += leg.meters;
      i++;
    } catch (e) {
      if (points.length <= 2) throw e;
      points.splice(i + 1, 1);   // 갈 수 없는 다음 장소를 빼고 그다음 장소로 (출발점은 유지)
    }
  }
  return { leg: { path, meters }, points };
}

async function tmapPedestrian(start, end, via = [], retried = false) {
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
  // 가끔 응답이 깨져서 오므로 글자로 받은 뒤 읽기
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch (e) { data = null; }

  if (!data || (res.ok && !Array.isArray(data.features))) {
    if (!retried) {                                               // 깨진 응답은 잠깐 쉬고 한 번 더
      await new Promise((r) => setTimeout(r, 700));
      return tmapPedestrian(start, end, via, true);
    }
    throw new Error('TMAP 응답을 읽지 못했어요.');
  }
  if (!res.ok) throw new Error(`TMAP 길찾기 오류: ${data.error?.message || data.error?.code || res.status}`);

  // LineString 좌표 잇기
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
