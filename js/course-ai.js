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

// 원하는 거리와 이 정도(25%) 넘게 다르면 다시 요청
const DISTANCE_TOLERANCE = 0.25;

// ---------- 메인: 설문 답 → 코스 ----------
// onStep(text): 진행 상황을 화면에 보여 줄 때 사용
async function buildAiCourse(params, onStep = () => {}) {
  const region = getRegion(params.region);
  const target = params.km || 5;

  onStep('제미나이가 코스를 구상하고 있어요…');
  let plan = await askGeminiForPlan(params);
  onStep('들를 곳의 위치를 찾고 있어요…');
  let course = await planToCourse(plan, region);

  // 거리가 많이 다르면 한 번 더 (더 가까운 쪽을 사용)
  const off = Math.abs(course.distanceKm - target) / target;
  if (off > DISTANCE_TOLERANCE) {
    onStep(`거리를 맞추고 있어요… (${course.distanceKm}km → 목표 ${target}km)`);
    try {
      const plan2 = await askGeminiForPlan(params, { previousKm: course.distanceKm, previousPlan: plan });
      const course2 = await planToCourse(plan2, region);
      if (Math.abs(course2.distanceKm - target) < Math.abs(course.distanceKm - target)) {
        plan = plan2;
        course = course2;
      }
    } catch (e) {
      console.warn('두 번째 시도 실패, 첫 번째 코스를 사용', e);
    }
  }
  return course;
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
5. 입문자면 평탄한 길, 여럿이면 넓은 길, 밤이면 조명이 있는 길을 우선해.
6. reasons에는 이 사람에게 이 코스가 맞는 이유를, tips에는 그날 이 코스를 달릴 때의 팁을 각각 2~3개, 한 문장씩 써.`;

  if (retry) {
    prompt += `\n\n[다시 짜기]\n직전에 짠 코스(${retry.previousPlan.waypoints.map((w) => w.query).join(' → ')}, ${retry.previousPlan.type})는 실제로 재 보니 ${retry.previousKm}km였어. 원하는 거리 ${p.km}km에 더 가깝도록 들를 곳을 바꾸거나 늘리거나 줄여서 다시 짜 줘.`;
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

async function callGemini(prompt, schema, model = AI_KEYS().GEMINI_MODEL || 'gemini-flash-latest') {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': AI_KEYS().GEMINI_API_KEY },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: schema, temperature: 0.7 },
    }),
  });
  const data = await res.json().catch(() => ({}));

  // 모델 이름이 바뀌어서 없다고 나오면, 쓸 수 있는 Flash 모델을 찾아 한 번 더
  if (res.status === 404 && !callGemini.retried) {
    callGemini.retried = true;
    const alt = await findFlashModel();
    if (alt && alt !== model) return callGemini(prompt, schema, alt);
  }
  if (!res.ok) throw new Error(`제미나이 오류 (${res.status}): ${data?.error?.message || '알 수 없는 오류'}`);

  const text = data?.candidates?.[0]?.content?.parts?.map((x) => x.text || '').join('') || '';
  if (!text) throw new Error('제미나이가 빈 답을 보냈어요.');
  return text;
}

async function findFlashModel() {
  try {
    const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=100', {
      headers: { 'x-goog-api-key': AI_KEYS().GEMINI_API_KEY },
    });
    const data = await res.json();
    const ok = (data.models || []).filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'));
    const flash = ok.find((m) => /flash/.test(m.name) && !/lite|image|tts|live|exp|preview/.test(m.name))
      || ok.find((m) => /flash/.test(m.name));
    return flash ? flash.name.replace('models/', '') : null;
  } catch (e) {
    return null;
  }
}

// =============================================
// ② 카카오: 장소 이름 → 좌표
// =============================================
async function planToCourse(plan, region) {
  const points = [];
  for (const wp of plan.waypoints) {
    const found = await findPlace(wp.query, region) || await findPlace(`${region.name} ${wp.query}`, region);
    if (found) points.push({ name: wp.name || wp.query, lat: found.lat, lng: found.lng });
    else console.warn('장소를 찾지 못해 건너뜀:', wp.query);
  }
  // 같은 곳이 연달아 나오면 하나로
  const uniq = points.filter((pt, i) => i === 0 || distanceKm(pt.lat, pt.lng, points[i - 1].lat, points[i - 1].lng) > 0.05);
  if (uniq.length < 2) throw new Error('제미나이가 고른 장소를 지도에서 찾지 못했어요.');

  const course = await routeThrough(uniq, plan.type, region);
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
      const hit = data.find((d) => (d.road_address_name || d.address_name || '').startsWith(region.name));
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
