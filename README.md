# LUCKY STRIP — Hotel & Casino

브라우저에서 돌아가는 카지노 미니게임 모음. 공용 뱅크롤을 가진 로비에서 게임을 골라 플레이하고,
모든 게임이 두 가지 테마를 지원한다 — 화려한 **'86 디럭스**와 흑백 **'74 모노**.

| 게임 | 폴더 | 한 줄 설명 |
|---|---|---|
| LUCKY 7 슬롯 | `src/games/slot` | 80년대 3릴 슬롯, 네온 당첨 라인 |
| 블랙잭 | `src/games/blackjack` | 인슈어런스 · 스플릿 · 더블다운 · 서렌더 |
| PERFECT STOP | `src/games/stopwatch` | 목표 시간에 정확히 멈추기 (SHOW / BLIND) |
| HI-LO DICE | `src/games/hilo` | 주사위 2개, UNDER 7 / 7 / OVER 7 |
| LUCKY CLAW | `src/games/claw` | Matter.js 물리 인형뽑기 + 가챠 개봉 |

## 개발

```bash
npm install
npm run dev      # http://localhost:5173 — 저장하면 바로 반영
npm run build    # dist/index.html 한 파일로 빌드 (CSS·JS·물리엔진 모두 인라인)
```

빌드 결과는 **외부 파일 없이 열리는 HTML 한 장**이라 그대로 배포하거나 claude.ai 아티팩트로 올릴 수 있다.
(웹폰트만 Google Fonts에서 받아온다.)

## 구조

```
index.html                 뼈대 — <!-- @include … --> 로 각 화면 HTML을 끼워 넣음
vite.config.js             include 플러그인 + 단일 파일 빌드(vite-plugin-singlefile)
src/
  main.js                  진입점 — CSS/JS 로딩 순서가 곧 동작 순서
  core/
    casino.js              window.Casino: 뱅크롤, 테마, 사운드, 해시 라우터, 게임 등록
    led.js                 window.CasinoLED: 7세그먼트 / 드럼 숫자판
    toast.js               Casino.toast()
    game-kit.js            window.CasinoChipTray + 게임 화면 공용 부분
  styles/                  공통 CSS (base, views, game-shell, 새 게임용 모노 테마)
  partials/svg-defs.html   공용 SVG 정의
  lobby/                   로비 화면 (html · css · js)
  games/<게임>/            게임별 html · css · js
  games/claw/
    claw.js                크레인 물리 · 상태 머신 · 그리기 · 가챠 · 시뮬레이터
    config.js              기계 치수, 상품 등급/모양, 집게 크기 (정적 데이터)
    art.js                 패널 · 가챠용 SVG 아트 (순수 함수)
```

### 게임 하나가 동작하는 방식

각 게임 JS는 자기 화면을 초기화한 뒤 라우터에 자신을 등록한다.

```js
Casino.register('plinko', {
  title: () => 'PLINKO',            // 브라우저 탭 제목
  enter() { /* 화면에 들어올 때 */ },
  canLeave: () => !dropping,        // 진행 중이면 로비로 못 나감
  leave() { /* 나갈 때 정리 */ }
});
```

`#plinko` 해시로 이동하면 `.view` 중 해당 화면이 보이고, 돈은 `Casino.bank` / `Casino.setBank()`로만 다룬다.
테마는 `Casino.theme`(`'86'` | `'74'`)와 `Casino.onTheme(fn)`, 모노 테마 CSS는 `body.mono …` 셀렉터로 쓴다.

### 새 게임 추가 순서

1. `src/games/<이름>/` 에 `<이름>.html` · `.css` · `.js` 생성
   - HTML 최상위: `<div class="view gview" id="<뷰ID>">` (공용 게임 셸 스타일)
   - CSS 첫 줄: `body.v-<이름> #<뷰ID>{display:block}` — 이 화면이 보이는 조건
   - JS 끝: `Casino.register('<이름>', { … })` — 등록된 이름이 곧 `#<이름>` 주소
2. `index.html` 에 `<!-- @include src/games/<이름>/<이름>.html -->` 추가
3. `src/main.js` 에 CSS · JS import 추가 (JS는 `core` 다음, 부팅 코드 앞)
4. `src/lobby/lobby.html` 에 로비 카드(`data-go="<이름>"`) 추가

## LUCKY CLAW 밸런스

브라우저 콘솔에서 `__claw` 디버그 API로 헤드리스 시뮬레이션을 돌릴 수 있다.

```js
__claw.setClaw('M');                              // S | M | L
__claw.simulate(300, { aim: 3, pick: 'smart' });  // { rtp, wins, tries, … }
__claw.grab('boxM', 220, 1.2);                    // 단일 상품을 고정 그립(μ)으로 한 번 집기 → 'Y' | 's' | 'n'
__claw.tune({ GRIP_N: 1.5, STR_STRONG: .08 });    // 튜닝 값 실험
```

현재 값 기준 크기별 RTP는 약 0.84–0.87 (크기별 3,000판 시뮬레이션, 판별 편차 ±0.1 수준).

## 라이선스 / 크레딧

- 물리 엔진: [Matter.js](https://brm.io/matter-js/) 0.20.0 (MIT)
