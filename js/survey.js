// =============================================
// 러닝 코스 설문 페이지 스크립트
// - 질문은 아래 QUESTIONS 배열만 고치면 추가/삭제/순서 변경이 됩니다.
// - 답변은 answers 객체에 모았다가, 마지막에 report.html?region=..&km=.. 로 넘깁니다.
// 공통 함수(REGIONS, buildQuery, formatDateKo)는 js/common.js 참고
// =============================================

// ---------- 질문 목록 ----------
// type 종류
//   'cards'  : 큰 그림 카드 (누르면 바로 다음)
//   'choice' : 버튼 선택 (누르면 바로 다음). custom: true면 '직접 입력' 추가
//   'scale'  : A/B 사이 동그라미 5개 척도 (누르면 바로 다음)
//   'date'   : 날짜 선택 + '다음' 버튼
const QUESTIONS = [
  {
    key: 'region',
    type: 'cards',
    text: '어디로 여행 가세요?',
    hint: '여행지를 고르면 그 지역의 러닝 코스를 찾아 드려요.',
    options: [
      { value: 'busan', label: '부산', desc: '바다 따라 달리기', icon: '🌊', color: '#e3f0fb' },
      { value: 'seoul', label: '서울', desc: '한강 러닝', icon: '🏙️', color: '#eceaf8' },
      { value: 'jeju',  label: '제주', desc: '해안도로 러닝', icon: '🍊', color: '#fff1df' },
    ],
  },
  {
    key: 'km',
    type: 'choice',
    text: '얼마나 달리고 싶으세요?',
    hint: '평소 달리는 거리를 기준으로 골라 주세요.',
    options: [
      { value: 3,  label: '3km',  sub: '가볍게 몸 풀기' },
      { value: 5,  label: '5km',  sub: '가장 인기 있는 거리' },
      { value: 7,  label: '7km',  sub: '조금 더 욕심내기' },
      { value: 10, label: '10km', sub: '제대로 달리기' },
    ],
    custom: { min: 1, max: 42, unit: 'km' },
  },
  {
    key: 'date',
    type: 'date',
    text: '언제 달릴 예정인가요?',
    hint: '그날의 날씨와 근처 행사를 함께 알려 드려요.',
  },
  {
    key: 'level',
    type: 'choice',
    text: '러닝 경험은 어느 정도인가요?',
    hint: '코스 난이도를 고를 때 참고해요.',
    options: [
      { value: '입문', label: '입문', sub: '이제 막 시작했어요' },
      { value: '보통', label: '보통', sub: '꾸준히 달리고 있어요' },
      { value: '숙련', label: '숙련', sub: '대회도 나가 봤어요' },
    ],
  },
  {
    key: 'scenery',
    type: 'scale',
    text: '달리면서 보고 싶은 풍경은?',
    a: { label: '탁 트인 바다와 강', value: '바다' },
    b: { label: '활기찬 도심과 공원', value: '도심' },
  },
  {
    key: 'time',
    type: 'choice',
    text: '언제 달리는 걸 좋아하세요?',
    options: [
      { value: '아침', label: '🌅 아침', sub: '상쾌한 새벽 공기' },
      { value: '낮',   label: '☀️ 낮',   sub: '여유로운 오후' },
      { value: '저녁', label: '🌙 저녁', sub: '노을과 야경' },
    ],
  },
  {
    key: 'after',
    type: 'scale',
    text: '러닝이 끝나면 뭘 하고 싶으세요?',
    a: { label: '근처 맛집에서 든든하게 먹기', value: '식사' },
    b: { label: '주변 관광지 둘러보기', value: '관광' },
  },
];

// ---------- 상태 ----------
let current = 0;        // 지금 보고 있는 질문 번호 (0부터)
const answers = {};     // { region: 'busan', km: 5, ... }
const scaleRaw = {};    // 척도 질문에서 누른 동그라미 위치(-2~2) — 이전으로 돌아왔을 때 표시용

// ---------- 화면 요소 ----------
const $body = document.getElementById('questionBody');
const $prev = document.getElementById('prevBtn');
const $next = document.getElementById('nextBtn');
const $fill = document.getElementById('progressFill');
const $currentNum = document.getElementById('currentNum');

document.getElementById('totalNum').textContent = QUESTIONS.length;

// ---------- 질문 그리기 ----------
function render(direction = 'forward') {
  const q = QUESTIONS[current];

  // 진행 상태
  $currentNum.textContent = current + 1;
  $fill.style.width = `${(current / QUESTIONS.length) * 100}%`;

  // 공통: 질문 문구
  let html = `
    <p class="q-label">Q${current + 1}.</p>
    <h2 class="q-text">${q.text}</h2>
    ${q.hint ? `<p class="q-hint">${q.hint}</p>` : '<div class="mb-3"></div>'}
  `;

  // 유형별 입력 영역
  if (q.type === 'cards') html += renderCards(q);
  if (q.type === 'choice') html += renderChoice(q);
  if (q.type === 'scale') html += renderScale(q);
  if (q.type === 'date') html += renderDate(q);
  html += '<p class="error-msg" id="errorMsg"></p>';

  $body.innerHTML = html;
  $body.className = direction === 'forward' ? 'slide-in' : 'slide-in-back';

  // '다음' 버튼은 날짜·직접 입력처럼 바로 넘길 수 없는 질문에서만 보여 줍니다
  $next.classList.toggle('d-none', q.type !== 'date');
  $prev.textContent = current === 0 ? '‹ 처음으로' : '‹ 이전';

  bindEvents(q);
}

function renderCards(q) {
  return `<div class="pick-cards">${q.options.map((o) => `
    <button type="button" class="pick-card ${answers[q.key] === o.value ? 'selected' : ''}" data-value="${o.value}">
      <div class="pick-icon" style="background:${o.color}">${o.icon}</div>
      <div class="pick-name">${o.label}</div>
      <div class="pick-desc">${o.desc}</div>
    </button>`).join('')}
  </div>`;
}

function renderChoice(q) {
  const isCustom = q.custom && answers[q.key] && !q.options.some((o) => o.value === answers[q.key]);
  let html = `<div class="choice-list">${q.options.map((o) => `
    <button type="button" class="choice-btn ${answers[q.key] === o.value ? 'selected' : ''}" data-value="${o.value}">
      ${o.label}${o.sub ? `<span class="choice-sub">${o.sub}</span>` : ''}
    </button>`).join('')}
    ${q.custom ? `<button type="button" class="choice-btn ${isCustom ? 'selected' : ''}" data-custom="true">
      직접 입력<span class="choice-sub">${q.custom.min}~${q.custom.max}${q.custom.unit}</span></button>` : ''}
  </div>`;
  if (q.custom) {
    html += `
      <div class="custom-input ${isCustom ? '' : 'd-none'}" id="customBox">
        <input type="number" class="form-control" id="customValue" min="${q.custom.min}" max="${q.custom.max}"
               step="0.5" placeholder="예: 8" value="${isCustom ? answers[q.key] : ''}" />
        <span>${q.custom.unit}</span>
        <button type="button" class="btn btn-navy btn-sm ms-1" id="customOk">확인</button>
      </div>`;
  }
  return html;
}

function renderScale(q) {
  const picked = scaleRaw[q.key];
  return `
    <div class="scale-options">
      <div class="scale-option side-a"><b>A.</b>${q.a.label}</div>
      <div class="scale-option side-b"><b>B.</b>${q.b.label}</div>
    </div>
    <div class="scale-dots">
      ${[-2, -1, 0, 1, 2].map((v) => `
        <button type="button" class="scale-dot ${picked === v ? 'selected' : ''}" data-v="${v}"
                aria-label="${['A에 매우 가까움', 'A에 가까움', '상관없음', 'B에 가까움', 'B에 매우 가까움'][v + 2]}"></button>`).join('')}
    </div>
    <div class="scale-ends"><span class="end-a">A</span><span class="text-muted fw-normal small">상관없음</span><span class="end-b">B</span></div>
  `;
}

function renderDate(q) {
  // 한국 시간 기준 날짜 (toISOString은 UTC라 아침엔 어제 날짜가 나올 수 있음)
  const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const today = new Date();
  const min = ymd(today);
  today.setFullYear(today.getFullYear() + 1);
  const max = ymd(today);
  return `
    <input type="date" class="form-control date-input" id="dateValue" min="${min}" max="${max}" value="${answers[q.key] || ''}" />
    <p class="date-preview" id="datePreview">${answers[q.key] ? formatDateKo(answers[q.key]) + ' 에 달려요' : ''}</p>
  `;
}

// ---------- 이벤트 연결 ----------
function bindEvents(q) {
  // 카드·버튼 선택 → 표시 후 바로 다음 질문
  $body.querySelectorAll('.pick-card, .choice-btn:not([data-custom])').forEach((btn) => {
    btn.addEventListener('click', () => {
      const raw = btn.dataset.value;
      const option = q.options.find((o) => String(o.value) === raw);
      markSelected(btn);
      answers[q.key] = option.value;
      goNextSoon();
    });
  });

  // 직접 입력
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

  // 척도 동그라미
  $body.querySelectorAll('.scale-dot').forEach((dot) => {
    dot.addEventListener('click', () => {
      const v = Number(dot.dataset.v);
      markSelected(dot);
      scaleRaw[q.key] = v;
      // A쪽(-2,-1)이면 A값, B쪽(1,2)이면 B값, 가운데(0)는 '상관없음' → 빈 값
      answers[q.key] = v < 0 ? q.a.value : v > 0 ? q.b.value : '';
      goNextSoon();
    });
  });

  // 날짜
  const dateInput = document.getElementById('dateValue');
  if (dateInput) {
    dateInput.addEventListener('change', () => {
      document.getElementById('datePreview').textContent =
        dateInput.value ? `${formatDateKo(dateInput.value)} 에 달려요` : '';
      showError('');
    });
  }
}

function markSelected(el) {
  el.parentElement.querySelectorAll('.selected').forEach((s) => s.classList.remove('selected'));
  el.classList.add('selected');
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
  setTimeout(() => { moving = false; goNext(); }, 280);
}

function goNext() {
  const q = QUESTIONS[current];

  // 날짜 질문은 '다음' 버튼을 눌렀을 때 검사
  if (q.type === 'date') {
    const v = document.getElementById('dateValue').value;
    if (!v) { showError('달릴 날짜를 골라 주세요.'); return; }
    if (v < document.getElementById('dateValue').min) { showError('오늘 이후 날짜를 골라 주세요.'); return; }
    answers.date = v;
  }

  if (current < QUESTIONS.length - 1) {
    current++;
    render('forward');
  } else {
    finish();
  }
}

function goPrev() {
  if (current === 0) {
    location.href = 'index.html';
    return;
  }
  current--;
  render('back');
}

$next.addEventListener('click', goNext);
$prev.addEventListener('click', goPrev);

// ---------- 마지막: 분석 중 → 레포트로 이동 ----------
function finish() {
  $fill.style.width = '100%';
  document.getElementById('questionCard').classList.add('d-none');
  document.getElementById('progressArea').classList.add('d-none');
  document.getElementById('analyzing').classList.remove('d-none');

  const steps = ['코스를 고르는 중…', '그날 날씨를 확인하는 중…', '주변 맛집과 관광지를 찾는 중…', '레포트를 정리하는 중…'];
  const $step = document.getElementById('analyzingStep');
  steps.forEach((text, i) => setTimeout(() => { $step.textContent = text; }, i * 600));

  setTimeout(() => {
    location.href = 'report.html?' + buildQuery(answers);
  }, 2500);
}

// ---------- 시작 ----------
document.addEventListener('DOMContentLoaded', () => render());
