// =============================================
// 시작 화면 (index.html) 스크립트
// - 스크롤 위치에 따라 사진 확대·문구 나타남 효과 (애플 홈페이지 느낌)
// - 오른쪽 단계 표시, 아래쪽 스크롤 안내
// =============================================

document.addEventListener('DOMContentLoaded', () => {
  const panels = [...document.querySelectorAll('.panel')];
  const stops = document.getElementById('routeStops');
  const fill = document.getElementById('routeFill');
  const hint = document.getElementById('scrollHint');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- 오른쪽 단계 점 만들기 ----------
  panels.forEach((panel, i) => {
    const title = panel.querySelector('h1, h2')?.textContent.replace(/\s+/g, ' ').trim() || '';
    const li = document.createElement('li');
    li.innerHTML = `<a href="#${panel.id}" aria-label="${i + 1}단계: ${title}"></a>`;
    stops.appendChild(li);
  });
  const dots = [...stops.querySelectorAll('a')];

  dots.forEach((dot, i) => {
    dot.addEventListener('click', (e) => {
      e.preventDefault();
      goTo(i);
    });
  });

  function goTo(i) {
    const target = panels[Math.max(0, Math.min(i, panels.length - 1))];
    target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' });
  }

  // ---------- 스크롤 안내: 누르면 다음 화면 ----------
  hint.addEventListener('click', () => goTo(currentIndex() + 1));

  function currentIndex() {
    return Math.round(window.scrollY / window.innerHeight);
  }

  // ---------- 스크롤에 따라 화면 효과 갱신 ----------
  function update() {
    const vh = window.innerHeight;

    panels.forEach((panel) => {
      // p: 0이면 화면에 딱 맞음, +1이면 한 화면 아래, -1이면 한 화면 위
      const p = panel.getBoundingClientRect().top / vh;
      const d = Math.min(Math.abs(p), 1);
      const fade = Math.max(0, 1 - d * 1.7);
      panel.style.setProperty('--fade', fade.toFixed(3));
      if (!reduceMotion) {
        panel.style.setProperty('--zoom', (1 + d * 0.12).toFixed(4));
        panel.style.setProperty('--shift', `${(p * 70).toFixed(1)}px`);
      }
    });

    // 오른쪽 단계 표시
    const index = currentIndex();
    const progress = Math.min(window.scrollY / (vh * (panels.length - 1)), 1);
    fill.style.height = `${progress * 100}%`;
    dots.forEach((dot, i) => {
      dot.classList.toggle('is-passed', i < index);
      dot.classList.toggle('is-current', i === index);
      if (i === index) dot.setAttribute('aria-current', 'step');
      else dot.removeAttribute('aria-current');
    });

    // 마지막 화면에서는 스크롤 안내 숨기기
    hint.classList.toggle('is-hidden', index >= panels.length - 1);
  }

  // 스크롤할 때마다 바로 계산하면 버벅이므로, 화면을 새로 그릴 때 한 번만 계산
  let ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      update();
      ticking = false;
    });
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);

  // 키보드: ↓ / PageDown / 스페이스 → 다음, ↑ / PageUp → 이전
  window.addEventListener('keydown', (e) => {
    const tag = document.activeElement.tagName;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return;
    if (e.key === ' ' && ['BUTTON', 'A'].includes(tag)) return; // 버튼에 초점이 있으면 스페이스는 버튼 누르기
    if (['ArrowDown', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); goTo(currentIndex() + 1); }
    if (['ArrowUp', 'PageUp'].includes(e.key)) { e.preventDefault(); goTo(currentIndex() - 1); }
  });

  update();
});
