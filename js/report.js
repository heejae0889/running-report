// 나의 맞춤 러닝 레포트 페이지 스크립트
// 공통 함수(getParams, buildQuery, loadJSON, pickCourse, loadKakaoMap 등)는 js/common.js 참고

document.addEventListener('DOMContentLoaded', () => {
  // ---- [임시] 설문에서 넘어온 값 확인용 — 레포트 담당자가 실제 화면을 만들면 지워 주세요 ----
  const p = getParams();
  const main = document.querySelector('main');
  const box = document.createElement('div');
  box.className = 'card-soft p-3 mb-3';
  box.innerHTML = `
    <p class="fw-bold mb-2">📦 설문에서 받은 값 (임시 확인용)</p>
    <ul class="mb-0 small">
      ${Object.entries(p).map(([k, v]) => `<li><code>${k}</code>: ${v ?? '<span class="text-muted">(없음)</span>'}</li>`).join('')}
    </ul>`;
  main.prepend(box);
  // ---- [임시] 끝 ----
});
