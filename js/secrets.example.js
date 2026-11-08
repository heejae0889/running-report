// =============================================
// 개인 키 파일 예시
// 1) 이 파일을 복사해서 같은 폴더에 secrets.js 라는 이름으로 저장하세요.
// 2) secrets.js 안에 자기 키를 넣으세요.
// secrets.js는 .gitignore에 들어 있어서 GitHub에 올라가지 않아요. (이 예시 파일만 올라감)
// 키가 비어 있으면 레포트는 data/courses.json의 예시 코스를 보여 줍니다.
// =============================================
const SECRETS = {
  // Google AI Studio에서 발급한 제미나이 API 키
  GEMINI_API_KEY: '',
  // 사용할 제미나이 모델 (gemini-flash-latest = 가장 최신 Flash 모델을 자동으로 사용)
  GEMINI_MODEL: 'gemini-flash-latest',

  // SK open API > 내 앱 > 앱키(appKey) — TMAP 보행자 경로안내용
  TMAP_APP_KEY: '',
};
