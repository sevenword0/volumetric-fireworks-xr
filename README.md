# PYROVERSE XR

WebGPU 기반 실시간 3D 볼류메트릭 불꽃놀이 설계·공기 상호작용·음악 자동 쇼·WebXR 뷰어입니다.

**Live:** https://sevenword0.github.io/volumetric-fireworks-xr/

## Visual FX & impact audio

- 실시간 블룸 강도, 반경, 휘도 임계값 조절
- 최종 화면 채도, 속도 버퍼 기반 모션 블러, 수면 범위와 무관하게 블룸보다 먼저 계산되는 파티클 깊이 초점과 보케 감마·5~25탭 샘플링 조절
- 가산 발광, 스크린, 알파 파티클 블렌딩 모드
- 포탄 크기, 별 수, 크랙클 성분, 관찰 거리를 반영한 합성 폭발음과 음속 지연
- 파티클 급증 시 프레임별 생성 예산, 잔상 억제, 저가치 입자 회수, 동적 조명·반사·볼륨 부하를 자동 조절하는 버스트 가드
- 파티클, 해상도·수면 반사, 볼륨 유체, 조명·그림자, 후처리·보케 중 자동 최적화 적용 항목을 개별 선택하고 상단 상태바에서 동작 확인
- 불꽃 파티클·폭발 조명·볼륨 발광을 함께 조절하는 전역 밝기와 음악/예약 발사의 고부하 구간 사전 연산
- 링·이중 링·새턴 고리·중심 링에만 적용되는 25~300% 고리 파티클량과 연동된 선제 부하 예측
- 모든 효과 설정은 브라우저에 로컬 저장되며 음악 파일과 마찬가지로 외부 서버에 전송되지 않음

## 주요 기능

- Three.js `WebGPURenderer` + TSL 렌더 경로와 WebGL 2 자동 폴백
- 중력, 관성, 최대 50× 전역 항력, 바람, 보텍스, 지면/오브젝트 충돌을 반영하는 파티클 물리
- 드래그로 공기를 밀고, 회전시키고, 충격파를 만드는 세 가지 공기 도구
- CPU 유체 격자와 WebGPU 볼륨 레이마칭을 결합한 연기, 부력, 산란, 발광, 볼륨 그림자
- 불꽃이 주변 오브젝트·수면·연기에 영향을 주는 동적 포인트 라이트와 소프트 섀도
- 피오니, 국화, 달리아, 가무로, 버들, 호스테일, 크로세트, 링, 새턴, 하트, 별, 스마일, 나비, 나선, 갤럭시 등 36개 프리셋
- 형상 × 별 효과 × 중심핵 × 팔레트 × 별 수 × 반경 × 꼬리 × 수명 × 스트로브 × 분열 × 색 전환 조합 설계
- 단발, 좌우 대칭, 5연 부채, 7연 아크, 수평 웨이브, 원형 포위, 13발 피날레 배치와 -40~40m 발사 중심·10~250% 위치 범위 조절
- 수동·배치·음악 쇼 전체에 합성되는 50~200% 전역 최초 발사 강도
- 로컬 오디오 FFT/스펙트럴 플럭스 분석, BPM 추정, 감도·밀도·다양성·피날레 강도 기반 자동 큐와 처음부터 재생·파형 클릭·정밀 타임라인 탐색
- 월광 호수, 네온 시티, 설산, 코스믹 환경과 사용자 이미지 배경 매핑, mip 흐림이 적용되는 반사 수면, 20~110° 카메라 화각 조절
- 무광 바닥, 실시간 수면 반사, 바닥 없음 모드
- 컨트롤러 레이 선택과 선택/발사 입력을 지원하는 5면 XR 큐브 UI
- 자동 품질 조절, 블룸/그림자 토글, UI 숨김, 전체화면, 데스크톱·모바일 반응형 UI

음악과 환경 이미지는 브라우저에서만 읽으며 서버로 업로드하지 않습니다.

## 불꽃 설계 모델

실제 공중 포탄의 `lift charge → time fuse → burst charge → stars` 구조와, 포탄 내부 별(star)의 배치가 폭발 형상을 결정한다는 원리를 데이터 모델로 옮겼습니다. 이 앱에서 각 셸은 다음 요소를 조합합니다.

1. 포탄 형상: 구, 링, 평면 도형, 나선, 다중 분열, 지상 발사
2. 별 조성 표현: 클린, 코멧, 브로케이드, 글리터, 스트로브, 크랙클, 낙하, 고게터
3. 중심핵: 없음, 단일/이중 피스틸, 중심 링, 크랙클 코어
4. 색과 시간: 다중 팔레트, 색 전환, 점화 지연, 연소 수명
5. 운동: 발사 속도, 폭발 속도, 항력, 중력 계수, 꼬리 생성률, 분열 시점

참고 자료:

- [U.S. Department of Energy — Facts about fireworks](https://www.energy.gov/nnsa/articles/facts-about-fireworks)
- [Library of Congress — How do fireworks work?](https://www.loc.gov/everyday-mysteries/chemistry/item/how-do-fireworks-work/)
- [PBS — Name that firework](https://www.pbs.org/a-capitol-fourth/fireworks-fun/name-that-firework/)
- [Natural Resources Canada — Display Fireworks Manual](https://natural-resources.canada.ca/minerals-mining/explosives-fireworks-ammunition/explosives/display-fireworks-manual-2010)
- [American Chemical Society — Fireworks chemistry](https://www.acs.org/education/chemmatters/resources/fireworks-what-do-we-know-about-fireworks/further-exploration-activities.html)

## 실행

Node.js 22.12 이상이 필요합니다.

```bash
npm ci
npm run dev
```

전체 검증과 배포 빌드:

```bash
npm run check
```

## 조작

- 드래그 / 휠: 카메라 회전 / 줌
- `Space`: 선택한 배치로 발사
- `W`, `V`, `X`, `C`: 바람 / 보텍스 / 충격 / 카메라 도구
- `H`, `F`: UI 숨김·표시 / 전체화면 전환
- `←`, `→`: 프리셋 이동
- XR: 큐브 면을 컨트롤러 레이로 가리키고 트리거로 선택, 스퀴즈로 발사
- XR 음악 쇼: 처음부터 재생과 10초 앞·뒤 타임라인 탐색

## 호환성

WebGPU가 활성화된 최신 Chrome 또는 Edge를 권장합니다. Three.js 렌더러가 WebGPU를 사용할 수 없으면 WebGL 2 백엔드로 폴백합니다. 몰입형 XR은 HTTPS, WebXR 지원 브라우저, 호환 HMD가 필요합니다.

관련 사양과 구현 문서:

- [Three.js WebGPU renderer](https://threejs.org/manual/en/webgpurenderer)
- [W3C WebXR Device API](https://www.w3.org/TR/webxr/)
- [W3C Web Audio API](https://www.w3.org/TR/webaudio-1.1/)

## 구조

```text
src/
  audio/      FFT, 온셋/BPM 분석, 자동 쇼 큐
  core/       저장 가능한 안전 상태 모델
  pyro/       프리셋, 도형 생성, 파티클 물리
  scene/      환경, 오브젝트, 조명, 반사 수면
  ui/         2D 스튜디오와 XR 큐브 UI
  volume/     유체 격자, 볼륨 렌더, 볼륨 그림자
```

`main` 브랜치에 푸시하면 최신 공식 Pages 액션으로 검사, 테스트, 빌드, 배포가 자동 실행됩니다.

## 라이선스

MIT
