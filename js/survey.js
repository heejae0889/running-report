// =============================================
// 러닝 코스 설문 페이지 스크립트
// - 질문은 아래 QUESTIONS 배열만 고치면 추가/삭제/순서 변경이 됩니다.
// - 답변은 answers 객체에 모았다가, 마지막에 report.html?region=..&km=.. 로 넘깁니다.
// 공통 함수(buildQuery, formatDateKo)는 js/common.js 참고
// =============================================

// Unsplash 사진 주소 만들기 (w: 가로 크기)
const photo = (id, w = 1600) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&q=70`;

// ---------- 질문 목록 ----------
// 순서: 여행 정보(어디, 언제, 숙박, 기간) → 러닝 계획(시간대, 인원) → 내 실력(경험, 페이스, 거리, 키·몸무게) → 취향(풍경)
// type 종류
//   'photo'  : 사진 카드 (누르면 바로 다음)
//   'choice' : 버튼 선택 (누르면 바로 다음). custom이 있으면 '직접 입력' 추가
//   'date'   : 날짜 선택 + '다음' 버튼
//   'body'   : 키·몸무게 입력 + '다음' / '건너뛰기' (공유 링크에 넣지 않고 이 브라우저에만 잠깐 저장)
// bg     : 이 질문에서 보여 줄 배경 사진 (Unsplash 사진 번호)
// skipIf : 이 조건이면 질문을 건너뛰고 skipValue로 자동 답변
const QUESTIONS = [
  {
    key: 'region',
    type: 'photo',
    text: '어디로 여행 가세요?',
    hint: '여행지에서 달리기 좋은 코스를 찾아 드려요.',
    bg: '1602619075660-d0f5459cb189',
    options: [
      { value: 'busan', label: '부산', desc: '바다를 끼고 달리기', img: '1638591751482-1a7d27fcea15' },
      { value: 'seoul', label: '서울', desc: '한강을 따라 달리기', img: '1760000843601-2070baed2478' },
      { value: 'jeju',  label: '제주', desc: '해안 절벽을 따라 달리기', img: '1562680802-9cf8b15f419d' },
    ],
  },
  {
    key: 'date',
    type: 'date',
    text: '언제 달릴 예정인가요?',
    hint: '그날의 날씨와 근처에서 열리는 행사를 함께 알려 드려요.',
    bg: '1634085398114-5091e0d9ed9e',
  },
  {
    key: 'stay',
    type: 'choice',
    text: '여행 중에 숙박하시나요?',
    hint: '숙박한다면 숙소 근처에서 출발하는 코스도 함께 고려해요.',
    bg: '1696866509067-f99acf4415e5',
    options: [
      { value: '숙박함', label: '네, 숙박해요', sub: '하루 이상 머물러요' },
      { value: '숙박 안 함', label: '아니요, 당일치기예요', sub: '그날 돌아가요' },
    ],
  },
  {
    key: 'days',
    type: 'choice',
    text: '여행은 며칠 동안인가요?',
    hint: '일정이 길면 다른 날 달릴 코스도 추천해 드릴 수 있어요.',
    bg: '1612977512598-3b8d6a498bbb',
    skipIf: (a) => a.stay === '숙박 안 함',
    skipValue: '당일치기',
    options: [
      { value: '1박 2일', label: '1박 2일' },
      { value: '2박 3일', label: '2박 3일' },
      { value: '3박 이상', label: '3박 이상', sub: '여유롭게 머물러요' },
    ],
  },
  {
    key: 'time',
    type: 'choice',
    text: '하루 중 언제 달리고 싶으세요?',
    hint: '시간대에 따라 어울리는 코스와 날씨 안내가 달라져요.',
    bg: '1556746834-2eb6bfdc8424',
    options: [
      { value: '새벽·아침', label: '새벽·아침', sub: '상쾌한 공기, 한산한 길' },
      { value: '낮', label: '낮', sub: '햇살 아래 여유롭게' },
      { value: '저녁', label: '저녁', sub: '노을 지는 시간' },
      { value: '밤', label: '밤', sub: '야경과 함께' },
    ],
  },
  {
    key: 'group',
    type: 'choice',
    text: '누구와 함께 달리나요?',
    hint: '여럿이 달리면 길이 넓고 쉬어 가기 좋은 코스를 골라요.',
    bg: '1739368732843-800f36a9b7d0',
    options: [
      { value: '혼자', label: '혼자' },
      { value: '2명', label: '2명', sub: '친구, 연인, 가족과' },
      { value: '3~4명', label: '3~4명' },
      { value: '5명 이상', label: '5명 이상', sub: '러닝 크루와 함께' },
    ],
  },
  {
    key: 'level',
    type: 'choice',
    text: '러닝 경험은 어느 정도인가요?',
    hint: '코스의 난이도와 오르막 정도를 맞출 때 참고해요.',
    bg: '1762697447213-9d61fbd7ef11',
    options: [
      { value: '입문', label: '이제 막 시작했어요', sub: '5km가 아직 버거워요' },
      { value: '보통', label: '꾸준히 달리고 있어요', sub: '5~10km는 편하게 달려요' },
      { value: '숙련', label: '대회도 나가 봤어요', sub: '하프·풀코스 경험이 있어요' },
    ],
  },
  {
    key: 'pace',
    type: 'choice',
    text: '목표 페이스는 어느 정도인가요?',
    hint: '1km를 달리는 데 걸리는 시간이에요. 예상 소요 시간 계산에 써요.',
    bg: '1761064039885-afa38ab58a21',
    options: [
      { value: '7분 이상', label: '천천히 즐기며', sub: '1km에 7분 이상' },
      { value: '6~7분', label: '편안하게', sub: '1km에 6~7분' },
      { value: '5~6분', label: '조금 빠르게', sub: '1km에 5~6분' },
      { value: '5분 이내', label: '기록에 도전', sub: '1km에 5분 이내' },
      { value: '모름', label: '잘 모르겠어요', sub: '경험에 맞춰 알아서 계산해요' },
    ],
  },
  {
    key: 'km',
    type: 'choice',
    text: '얼마나 달리고 싶으세요?',
    hint: '원하는 거리에 최대한 가깝게 코스를 짜 드려요.',
    bg: '1769284331730-9955c15e7dac',
    options: [
      { value: 3,  label: '3km',  sub: '가볍게 몸 풀기' },
      { value: 5,  label: '5km',  sub: '가장 많이 달리는 거리' },
      { value: 7,  label: '7km',  sub: '조금 더 욕심내기' },
      { value: 10, label: '10km', sub: '제대로 달리기' },
    ],
    custom: { min: 1, max: 42, unit: 'km' },
  },
  {
    key: 'body',
    type: 'body',
    text: '키와 몸무게를 알려 주세요',
    hint: '예상 소모 칼로리 계산에만 쓰고, 공유 링크에는 담기지 않아요. 건너뛰어도 괜찮아요.',
    bg: '1553012547-284d8c582b1f',
  },
  {
    key: 'scenery',
    type: 'photo',
    compact: true,
    text: '달리면서 어떤 풍경을 보고 싶으세요?',
    hint: '가장 끌리는 하나를 골라 주세요.',
    bg: '1758438919146-f3f59a6d2544',
    options: [
      { value: '바다', label: '바다', img: '1647767444020-01b866b7e00c' },
      { value: '강·호수', label: '강·호수', img: '1636625716229-0e72a641e3c5' },
      { value: '도심 야경', label: '도심 야경', img: '1546874177-9e664107314e' },
      { value: '공원·숲', label: '공원·숲', img: '1592859600972-1b0834d83747' },
      { value: '산·언덕', label: '산·언덕', img: '1787894116346-90a3dc6c5328' },
    ],
  },
];

// ---------- 상태 ----------
let current = 0;     // 지금 보고 있는 질문 번호 (QUESTIONS 기준, 0부터)
const answers = {};  // { region: 'busan', date: '2026-11-14', ... }

// ---------- 화면 요소 ----------
const $body = document.getElementById('questionBody');
const $prev = document.getElementById('prevBtn');
const $next = document.getElementById('nextBtn');
const $fill = document.getElementById('progressFill');
const $runner = document.getElementById('progressRunner');
const $count = document.getElementById('progressCount');
const bgLayers = [document.getElementById('bgA'), document.getElementById('bgB')];
let activeLayer = 0;

// ---------- 건너뛰기 계산 ----------
const isSkipped = (i) => Boolean(QUESTIONS[i].skipIf && QUESTIONS[i].skipIf(answers));
const visibleIndexes = () => QUESTIONS.map((_, i) => i).filter((i) => !isSkipped(i));

// ---------- 배경 사진 바꾸기 (두 장을 번갈아 겹쳐서 부드럽게) ----------
let currentBg = '';
function setBackground(id) {
  if (!id || id === currentBg) return;
  currentBg = id;
  const next = bgLayers[1 - activeLayer];
  next.style.backgroundImage = `url('${photo(id, window.innerWidth > 900 ? 2000 : 1100)}')`;
  next.classList.add('is-active');
  bgLayers[activeLayer].classList.remove('is-active');
  activeLayer = 1 - activeLayer;
}

// 다음 질문 사진을 미리 받아 두면 전환할 때 깜빡이지 않아요
function preload(i) {
  const q = QUESTIONS[i];
  if (!q) return;
  new Image().src = photo(q.bg, window.innerWidth > 900 ? 2000 : 1100);
  (q.options || []).forEach((o) => { if (o.img) new Image().src = photo(o.img, 600); });
}

// ---------- 질문 그리기 ----------
function render(direction = 'forward') {
  const q = QUESTIONS[current];
  const order = visibleIndexes();
  const step = order.indexOf(current) + 1;
  const total = order.length;

  // 진행 상태: 지금까지 달려온 만큼 주황색으로
  const ratio = total > 1 ? (step - 1) / (total - 1) : 0;
  $fill.style.width = `${ratio * 100}%`;
  $runner.style.left = `${ratio * 100}%`;
  $count.textContent = `${step} / ${total}`;

  setBackground(q.bg);
  preload(order[order.indexOf(current) + 1]);

  let html = `
    <h1 class="q-text">${q.text}</h1>
    ${q.hint ? `<p class="q-hint">${q.hint}</p>` : ''}
  `;
  if (q.type === 'photo') html += renderPhoto(q);
  if (q.type === 'choice') html += renderChoice(q);
  if (q.type === 'date') html += renderDate(q);
  if (q.type === 'body') html += renderBody(q);
  html += '<p class="error-msg" id="errorMsg" role="alert"></p>';

  $body.innerHTML = html;
  $body.className = direction === 'forward' ? 'slide-in' : 'slide-in-back';

  // '다음' 버튼은 날짜·키몸무게처럼 바로 넘길 수 없는 질문에서만 보여 줍니다
  $next.classList.toggle('d-none', !['date', 'body'].includes(q.type));
  $prev.textContent = step === 1 ? '처음으로' : '이전';

  bindEvents(q);
}

function renderPhoto(q) {
  return `<div class="photo-grid ${q.compact ? 'is-compact' : ''}">${q.options.map((o) => `
    <button type="button" class="photo-tile ${answers[q.key] === o.value ? 'selected' : ''}" data-value="${o.value}"
            style="background-image:url('${photo(o.img, 600)}')" aria-pressed="${answers[q.key] === o.value}">
      <span class="tile-text">
        <span class="tile-name">${o.label}</span>
        ${o.desc ? `<span class="tile-desc">${o.desc}</span>` : ''}
      </span>
    </button>`).join('')}
  </div>`;
}

function renderChoice(q) {
  const isCustom = q.custom && answers[q.key] && !q.options.some((o) => o.value === answers[q.key]);
  let html = `<div class="choice-list">${q.options.map((o) => `
    <button type="button" class="choice-btn ${answers[q.key] === o.value ? 'selected' : ''}" data-value="${o.value}"
            aria-pressed="${answers[q.key] === o.value}">
      ${o.label}${o.sub ? `<span class="choice-sub">${o.sub}</span>` : ''}
    </button>`).join('')}
    ${q.custom ? `<button type="button" class="choice-btn ${isCustom ? 'selected' : ''}" data-custom="true">
      직접 입력<span class="choice-sub">${q.custom.min}~${q.custom.max}${q.custom.unit} 사이</span></button>` : ''}
  </div>`;
  if (q.custom) {
    html += `
      <div class="custom-input ${isCustom ? '' : 'd-none'}" id="customBox">
        <input type="number" id="customValue" min="${q.custom.min}" max="${q.custom.max}" step="0.5"
               placeholder="예: 8" value="${isCustom ? answers[q.key] : ''}" aria-label="원하는 거리 (${q.custom.unit})" />
        <span class="unit">${q.custom.unit}</span>
        <button type="button" class="btn-next" id="customOk">확인</button>
      </div>`;
  }
  return html;
}

// 한국 시간 기준 'YYYY-MM-DD' (toISOString은 UTC라 아침엔 어제 날짜가 나올 수 있음)
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function renderDate(q) {
  const today = new Date();
  const min = ymd(today);
  today.setFullYear(today.getFullYear() + 1);
  const max = ymd(today);
  return `
    <input type="date" class="date-input" id="dateValue" min="${min}" max="${max}"
           value="${answers[q.key] || ''}" aria-label="러닝할 날짜" />
    <p class="date-preview" id="datePreview">${answers[q.key] ? `${formatDateKo(answers[q.key])}에 달려요` : ''}</p>
  `;
}

// 키·몸무게는 공유 링크(URL)에 넣지 않고, 이 브라우저 탭에만 잠깐 저장합니다 (common.js의 readBodyInfo로 읽기)
function renderBody() {
  const saved = readBodyInfo() || {};
  return `
    <div class="body-inputs">
      <label class="body-field">
        <span>키</span>
        <input type="number" id="heightValue" inputmode="decimal" min="100" max="230" step="0.1" placeholder="170" value="${saved.height || ''}" />
        <span class="unit">cm</span>
      </label>
      <label class="body-field">
        <span>몸무게</span>
        <input type="number" id="weightValue" inputmode="decimal" min="25" max="200" step="0.1" placeholder="65" value="${saved.weight || ''}" />
        <span class="unit">kg</span>
      </label>
    </div>
    <button type="button" class="btn-skip" id="skipBody">건너뛰기</button>
  `;
}

// ---------- 이벤트 연결 ----------
function bindEvents(q) {
  // 사진 카드·버튼 선택 → 표시 후 바로 다음 질문
  $body.querySelectorAll('.photo-tile, .choice-btn:not([data-custom])').forEach((btn) => {
    btn.addEventListener('click', () => {
      const option = q.options.find((o) => String(o.value) === btn.dataset.value);
      markSelected(btn);
      answers[q.key] = option.value;
      goNextSoon();
    });
  });

  // 직접 입력 (거리)
  const customBtn = $body.querySelector('[data-custom]');
  if (customBtn) {
    customBtn.addEventListener('click', () => {
      markSelected(customBtn);
      document.getElementById('customBox').classList.remove('d-none');
      document.getElementById('customValue').focus();
    });
    const submitCustom = () => {
      const v = Number(document.getElementById('customValue').value);
      if (!v || v < q.custom.min || v > q.custom.max) {
        showError(`${q.custom.min}~${q.custom.max}${q.custom.unit} 사이로 입력해 주세요.`);
        return;
      }
      answers[q.key] = v;
      goNext();
    };
    document.getElementById('customOk').addEventListener('click', submitCustom);
    document.getElementById('customValue').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submitCustom();
    });
  }

  // 키·몸무게: 건너뛰기
  const skipBody = document.getElementById('skipBody');
  if (skipBody) {
    skipBody.addEventListener('click', () => { saveBodyInfo(null); goNext(true); });
    ['heightValue', 'weightValue'].forEach((id) => {
      document.getElementById(id).addEventListener('keydown', (e) => { if (e.key === 'Enter') goNext(); });
    });
  }

  // 날짜
  const dateInput = document.getElementById('dateValue');
  if (dateInput) {
    dateInput.addEventListener('change', () => {
      document.getElementById('datePreview').textContent =
        dateInput.value ? `${formatDateKo(dateInput.value)}에 달려요` : '';
      showError('');
    });
    dateInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') goNext();
    });
  }
}

function markSelected(el) {
  el.parentElement.querySelectorAll('.selected').forEach((s) => {
    s.classList.remove('selected');
    s.setAttribute('aria-pressed', 'false');
  });
  el.classList.add('selected');
  el.setAttribute('aria-pressed', 'true');
}

function showError(msg) {
  const el = document.getElementById('errorMsg');
  if (el) el.textContent = msg;
}

// ---------- 이동 ----------
// 선택한 표시를 잠깐 보여 준 뒤 넘어가도록 약간 늦춥니다
let moving = false;
function goNextSoon() {
  if (moving) return;
  moving = true;
  setTimeout(() => { moving = false; goNext(); }, 300);
}

function goNext(skipCheck = false) {
  const q = QUESTIONS[current];

  // 키·몸무게 검사 (몸무게만 있어도 칼로리 계산 가능)
  if (q.type === 'body' && !skipCheck) {
    const h = Number(document.getElementById('heightValue').value);
    const w = Number(document.getElementById('weightValue').value);
    if (!w) { showError('몸무게를 입력하거나 건너뛰기를 눌러 주세요.'); return; }
    if (w < 25 || w > 200) { showError('몸무게는 25~200kg 사이로 입력해 주세요.'); return; }
    if (h && (h < 100 || h > 230)) { showError('키는 100~230cm 사이로 입력해 주세요.'); return; }
    saveBodyInfo({ height: h || null, weight: w });
  }

  // 날짜 질문은 '다음' 버튼을 눌렀을 때 검사
  if (q.type === 'date') {
    const input = document.getElementById('dateValue');
    if (!input.value) { showError('달릴 날짜를 골라 주세요.'); return; }
    if (input.value < input.min) { showError('오늘 이후 날짜를 골라 주세요.'); return; }
    if (input.value > input.max) { showError('1년 안의 날짜를 골라 주세요.'); return; }
    answers.date = input.value;
  }

  // 다음 질문 찾기 (건너뛸 질문은 자동 답변하고 넘어감)
  let i = current + 1;
  while (i < QUESTIONS.length && isSkipped(i)) {
    answers[QUESTIONS[i].key] = QUESTIONS[i].skipValue;
    i++;
  }

  if (i < QUESTIONS.length) {
    current = i;
    render('forward');
  } else {
    finish();
  }
}

function goPrev() {
  let i = current - 1;
  while (i >= 0 && isSkipped(i)) i--;
  if (i < 0) {
    location.href = 'index.html';
    return;
  }
  current = i;
  render('back');
}

$next.addEventListener('click', () => goNext());
$prev.addEventListener('click', goPrev);

// 키보드: 숫자 1~9로 선택지 고르기
document.addEventListener('keydown', (e) => {
  if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
  const n = Number(e.key);
  if (!n) return;
  const buttons = $body.querySelectorAll('.photo-tile, .choice-btn');
  if (buttons[n - 1]) buttons[n - 1].click();
});

// ---------- 마지막: 코스를 실제로 만들고 → 다 되면 레포트로 이동 ----------
// 진행바·경로선은 실제 진행 상황(제미나이 구상 → 장소 찾기 → 길 계산)에 맞춰 차오릅니다.
// 제미나이 답을 기다리는 동안에도 멈춰 보이지 않도록, 다음 단계 직전까지 아주 천천히 조금씩 움직여요.
const STEP_ORDER = ['plan', 'place', 'route', 'done'];
const CREEP_LIMIT = { plan: 42, place: 62, route: 84, done: 99 };   // 각 단계에서 기다리는 동안 갈 수 있는 최대치
const progress = { value: 0, target: 0, limit: 0, raf: 0 };

function setProgress(percent, step, text) {
  progress.target = Math.max(progress.target, percent);
  progress.limit = Math.max(progress.target, CREEP_LIMIT[step] || percent);
  if (text) document.getElementById('analyzingStep').textContent = text;

  // 단계 표시: 지난 단계는 체크, 지금 단계는 돌아가는 표시
  const idx = STEP_ORDER.indexOf(step);
  document.querySelectorAll('#analyzingSteps li').forEach((li) => {
    const i = STEP_ORDER.indexOf(li.dataset.step);
    li.classList.toggle('is-done', i < idx || (step === 'done' && percent >= 100));
    li.classList.toggle('is-active', i === idx && !(step === 'done' && percent >= 100));
  });
  if (!progress.raf) progress.raf = requestAnimationFrame(drawProgress);
}

function drawProgress() {
  // 기다리는 중이면 목표치를 한계까지 아주 천천히 올리기
  if (progress.target < progress.limit) progress.target += (progress.limit - progress.target) * 0.006;
  // 화면 값은 목표치를 부드럽게 따라가기
  progress.value += (progress.target - progress.value) * 0.12;
  if (Math.abs(progress.target - progress.value) < 0.05) progress.value = progress.target;

  const pct = Math.min(100, progress.value);
  document.getElementById('analyzingFill').style.width = `${pct}%`;
  document.getElementById('analyzingPercent').textContent = Math.floor(pct);
  document.getElementById('analyzingBar').setAttribute('aria-valuenow', Math.floor(pct));

  // 위쪽 경로선: 진행한 만큼 주황 선이 그려지고, 동그라미(러너)가 따라감
  const path = document.getElementById('analyzingPath');
  const len = path.getTotalLength();
  path.style.strokeDasharray = `${len}`;
  path.style.strokeDashoffset = `${len * (1 - pct / 100)}`;
  const pt = path.getPointAtLength(len * (pct / 100));
  const runner = document.getElementById('analyzingRunner');
  runner.setAttribute('cx', pt.x);
  runner.setAttribute('cy', pt.y);

  progress.raf = requestAnimationFrame(drawProgress);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function finish() {
  // 숙박 안 함이면 여행 기간은 당일치기로 확정
  if (answers.stay === '숙박 안 함') answers.days = '당일치기';

  $fill.style.width = '100%';
  $runner.style.left = '100%';
  document.getElementById('questionCard').classList.add('d-none');
  document.getElementById('analyzing').classList.remove('d-none');

  // 고른 여행지 사진을 배경으로
  const region = QUESTIONS[0].options.find((o) => o.value === answers.region);
  if (region) setBackground(region.img);

  const minShow = sleep(1500);   // 너무 빨리 지나가면 무슨 일이 있었는지 안 보여서 최소 1.5초
  let url = 'report.html?' + buildQuery(answers);
  setProgress(4, 'plan', '여행지 정보를 정리하는 중…');

  if (hasAiKeys()) {
    try {
      await loadKakaoMap();
      const course = await buildAiCourse({ ...answers }, (text, percent, step) => setProgress(percent, step, text));
      saveBuiltCourse(course);
      url += '&route=' + encodeURIComponent(courseToRouteParam(course));
    } catch (e) {
      console.error(e);
      saveCourseError(`AI 코스를 만들지 못해 예시 코스를 보여 드려요. (${e.message})`);
      setProgress(90, 'done', 'AI 코스를 만들지 못해서 예시 코스로 준비할게요…');
      url += '&course=example';
    }
  } else {
    // 키가 없으면 예시 코스로 (단계만 차례대로 보여 주기)
    saveCourseError('js/secrets.js에 제미나이·TMAP 키를 넣으면 AI 맞춤 코스를 만들어요. 지금은 예시 코스예요.');
    setProgress(30, 'place', '예시 코스를 고르는 중…');
    await sleep(500);
    setProgress(70, 'route', '예시 코스를 지도에 맞추는 중…');
    await sleep(500);
    url += '&course=example';
  }

  await minShow;
  setProgress(100, 'done', '레포트를 여는 중…');
  document.getElementById('analyzing').classList.add('is-complete');
  await sleep(700);
  location.href = url;
}

function saveCourseError(msg) {
  try { sessionStorage.setItem('tripRunningCourseError', msg); } catch (e) { /* 무시 */ }
}

// ---------- 시작 ----------
document.addEventListener('DOMContentLoaded', () => render());
