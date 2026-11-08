# 트립 런닝 — 여행지 맞춤 러닝 코스 레포트

웹프로그래밍 팀 프로젝트 · AI소프트웨어학부 23팀 (정희재, 정우진, 조성연, 정태안)

설문(여행지·거리·날짜)에 답하면 러닝 코스, 날씨, 주변 맛집·관광지, 행사 정보를 한 장의 맞춤 레포트로 보여 주는 웹 서비스입니다.
HTML · CSS · JavaScript + Bootstrap 5만 사용합니다 (서버/DB 없음).

---

## 1. 실행 방법

1. VS Code에 확장 **Live Server**를 설치합니다.
2. 이 폴더를 VS Code로 열고, `index.html`에서 우클릭 → **Open with Live Server**를 누릅니다.
3. 브라우저에서 `http://127.0.0.1:5500/index.html`이 열리면 성공입니다.

> ⚠ HTML 파일을 더블클릭해서 열면(`file://`) 데이터(json)와 지도가 동작하지 않습니다. 꼭 Live Server로 열어 주세요.

### 카카오맵 연결 확인
1. `js/config.js`에 카카오 JavaScript 키를 넣습니다.
2. Live Server로 `tools/map-check.html`을 엽니다.
3. "✅ 카카오맵 연결 성공"이 뜨고 주황색 코스가 보이면 정상입니다.

안 뜰 때 확인할 것
- 카카오 디벨로퍼스 **[JavaScript SDK 도메인]**에 `http://127.0.0.1:5500`과 `http://localhost:5500`이 둘 다 등록됐는지
- **카카오맵 사용 설정이 ON**인지
- REST API 키가 아니라 **JavaScript 키**를 넣었는지
- '테스트 앱'의 키가 아닌지 (테스트 앱은 하루 호출량이 매우 적음)

---

## 2. 폴더 구조

```
running-report/
├─ index.html          시작 화면
├─ survey.html         설문 입력 (+ 분석 중)
├─ report.html         맞춤 레포트
├─ (4번째 페이지)       회의에서 결정
├─ css/
│  ├─ common.css       공통 색·폰트·컴포넌트  ← 수정 전 팀에 공유
│  └─ 페이지이름.css    페이지 전용 스타일
├─ js/
│  ├─ config.js        카카오 키 등 설정
│  ├─ common.js        공통 함수            ← 수정 전 팀에 공유
│  └─ 페이지이름.js     페이지 전용 스크립트
├─ data/
│  ├─ courses.json     러닝 코스 (경로 좌표 포함)
│  ├─ spots.json       맛집·관광지
│  └─ events.json      행사
├─ img/                사진 (저작권 확인된 것만)
└─ tools/map-check.html  개발용: 지도 점검 · 경로 좌표 찍기
```

**규칙: 자기 페이지 파일(`페이지.html`, `css/페이지.css`, `js/페이지.js`)만 수정합니다.**
`common.css`, `common.js`, `data/*.json`을 바꿀 때는 단톡방에 먼저 알려 주세요. 그래야 합칠 때 충돌이 안 납니다.

---

## 3. 담당

| 페이지 | 담당 | 브랜치 |
|---|---|---|
| 시작 화면 `index.html` + 공통/배포 | | `feature/index` |
| 설문 `survey.html` | | `feature/survey` |
| 레포트 `report.html` | | `feature/report` |
| (4번째 페이지) | | `feature/____` |

---

## 4. 페이지 간 데이터 약속 (중요)

설문 결과는 **URL 파라미터**로 레포트에 넘깁니다. 이 주소가 그대로 '공유 링크'가 됩니다.

```
report.html?region=busan&km=5&date=2026-11-14&level=입문&scenery=바다
```

| 이름 | 값 | 필수 |
|---|---|---|
| `region` | `busan` / `seoul` / `jeju` / `gangneung` / `gyeongju` / `yeosu` (`js/common.js`의 REGIONS) | ✅ |
| `km` | 숫자 (예: 5) | ✅ |
| `date` | `YYYY-MM-DD` | ✅ |
| `level` | 입문 / 보통 / 숙련 | 선택 |
| `scenery` | 바다 / 강변 / 도심 / 공원 / 산책로 | 선택 |
| `time` | 아침 / 낮 / 저녁 | 선택 |
| `after` | 식사 / 카페 / 관광 | 선택 |

```js
// 설문에서 보낼 때
location.href = 'report.html?' + buildQuery({ region: 'busan', km: 5, date: '2026-11-14' });

// 레포트에서 받을 때
const { region, km, date } = getParams();
```

### 데이터 형식 (`data/*.json`)

`courses.json`
```json
{
  "id": "busan-gwangalli",
  "region": "busan",
  "regionName": "부산",
  "name": "광안리 해변 왕복 코스",
  "distanceKm": 3.8,
  "durationMin": 25,
  "level": "입문",
  "scenery": "바다",
  "photo": "",
  "description": "코스 소개",
  "start": { "name": "출발 지점", "lat": 35.15, "lng": 129.13 },
  "end":   { "name": "도착 지점", "lat": 35.15, "lng": 129.13 },
  "path":  [[35.1553, 129.1318], [35.1546, 129.1296]]
}
```
`spots.json`: `id, courseId, type("food" | "tour"), name, description, lat, lng, walkMinFromEnd, photo`
`events.json`: `id, region, courseId, type, name, startDate, endDate, time, place, lat, lng, congestion, note, photo`

> 지금 들어 있는 데이터는 모두 **예시**입니다. 경로 좌표는 대략적인 값이니 `tools/map-check.html`의 '경로 찍기'로 실제 길을 따라 다시 찍어 교체해 주세요.

---

## 5. Git 작업 규칙 (GitHub Desktop 기준)

1. **작업 시작 전**: `main` 선택 → **Fetch / Pull origin** (최신 코드 받기)
2. 자기 브랜치로 전환: `feature/내페이지` (처음엔 Current Branch → New Branch)
3. 작업 → 작은 단위로 **Commit** (메시지 예: `설문 진행바 추가`, `레포트 지도 경로 표시`)
4. **Push origin**
5. 기능이 완성되면 GitHub에서 **Pull Request** 생성 → 팀원 1명이 확인 → **Merge**
6. 다른 사람 PR이 merge되면, 내 브랜치에서 `Branch → Update from main`

- `main`에는 직접 커밋하지 않습니다. `main`은 "항상 실행되는 버전"입니다.
- 각자 **자기 GitHub 계정으로** 커밋합니다 (팀원별 활동 증빙).

---

## 6. 사용 API · 라이브러리

| 용도 | 사용 | 비고 |
|---|---|---|
| UI | Bootstrap 5.3 | CDN |
| 폰트 | Pretendard | CDN |
| 지도 | 카카오맵 JavaScript API | JavaScript 키 + 도메인 등록 |
| 날씨 | Open-Meteo | 키 없음 |
| 레포트 이미지 저장 | html2canvas | CDN |
| 맛집·관광·행사 | 예시 JSON → (여유 있으면) 한국관광공사 TourAPI | |

## 7. 배포 (GitHub Pages)

레포 **Settings → Pages → Branch: `main` / root → Save**
→ `https://깃허브아이디.github.io/레포이름/` 주소가 생깁니다. 이 주소의 앞부분(`https://깃허브아이디.github.io`)을 카카오 JavaScript SDK 도메인에도 등록해야 지도가 뜹니다.
