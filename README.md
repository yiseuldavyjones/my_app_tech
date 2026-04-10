# 파킹톡 (ParkingTalk)

> 영덕레스피아 공원 주차장 이중주차 해결을 위한 위치 기반 주차 커뮤니케이션 웹앱  
> 전화 없이 차량 소유자와 빠르게 연결해 대기 시간을 줄입니다.

---

## 기술 스택

| 구분 | 기술 |
|---|---|
| Frontend | React 19 + Vite |
| Backend / DB | Firebase Firestore (REST API) |
| 인증 | 카카오 OAuth |
| 배포 | Firebase Hosting |

---

## 완료된 기능

- [x] 카카오 로그인 / 로그아웃
- [x] 차량 등록 (차량번호, 색상, 차종, 주차구역, 출차 예정 시간)
- [x] 주차 현황 리스트 (차량번호 마스킹 처리)
- [x] 차 빼기 요청 전송
- [x] 수락 / 거절 응답 시스템
- [x] 상태 표시 — 주차중 / 요청중 / 이동중 / 응답없음
- [x] 요청 수신 시 상단 알림 배너 + 뱃지
- [x] 10초 폴링으로 실시간 동기화
- [x] 수락 후 5분 경과 시 자동 출차 처리
- [x] 업비트 스타일 UI

---

## 앞으로 할 일

### 🔴 우선순위 높음

- [ ] **FCM 푸시 알림**  
  Firestore 폴링 방식 대신 Firebase Cloud Messaging으로 실시간 푸시 알림 전송  
  앱이 백그라운드 상태여도 알림 수신 가능하도록 구현

- [ ] **출차 예정 시간 자동 알림**  
  등록한 출차 예정 시간이 되면 차주에게 자동으로 알림 전송  
  ("출차 예정 시간이 되었습니다. 이동 준비해주세요")

- [ ] **응답없음 자동 처리**  
  요청 전송 후 N분 이내 응답 없을 시 상태를 `응답없음`으로 자동 변경  
  요청자에게 "응답 없음" 알림 전송

### 🟡 우선순위 중간

- [ ] **구역별 필터**  
  A구역 / B구역 등 구역 탭 또는 버튼으로 필터링  
  본인 위치 근처 구역만 빠르게 확인 가능

- [ ] **출차 예정 시간순 정렬**  
  "곧 빠질 차"를 리스트 상단에 노출  
  대기자가 기다릴 차량을 쉽게 파악 가능

- [ ] **요청 후 경과 타이머**  
  차 빼기 요청 이후 몇 분 경과했는지 표시  
  요청자가 대기 상황을 실시간으로 확인 가능

- [ ] **내 주차 위치 공유**  
  카카오맵 / 네이버지도 링크로 정확한 주차 위치 핀 공유  
  차주가 위치를 더 구체적으로 안내 가능

### 🟢 우선순위 낮음 (추후 확장)

- [ ] **패널티 시스템**  
  응답 없음이 반복되는 사용자에게 경고 뱃지 표시  
  커뮤니티 질서 형성

- [ ] **즐겨찾기 / 자주 이용하는 사용자**  
  자주 주차하는 사용자를 즐겨찾기로 등록  
  빠르게 요청 전송 가능

- [ ] **QR 코드 식별**  
  차량 번호 대신 QR 코드로 차량 등록 및 요청  
  번호판 확인 없이 스캔만으로 요청 가능

- [ ] **차량 사진 등록**  
  Firebase Storage 연동으로 차량 사진 업로드  
  차량 식별 용이성 향상

- [ ] **다국어 지원**  
  한국어 외 영어 지원 (관광객 대응)

- [ ] **CCTV / IoT 연동**  
  주차장 내 센서 또는 카메라와 연동해 자동 등록/출차 처리  
  장기 로드맵

---

## 로컬 실행

```bash
# 의존성 설치
npm install

# 개발 서버 실행
npm run dev

# 프로덕션 빌드
npm run build

# Firebase 배포
firebase deploy
```

## 환경변수 설정

`.env` 파일에 아래 변수를 설정하세요:

```
VITE_FB_PROJECT_ID=your_project_id
VITE_FB_API_KEY=your_api_key
VITE_KAKAO_JS_KEY=your_kakao_js_key
```

---

## Firestore 컬렉션 구조

### `parkings`
| 필드 | 타입 | 설명 |
|---|---|---|
| userId | string | 차주 카카오 ID |
| nickname | string | 차주 닉네임 |
| carNumber | string | 차량번호 |
| carColor | string | 차량 색상 |
| carType | string | 차종 |
| location | string | 주차 구역 |
| expectedLeaveTime | string | 출차 예정 시간 (HH:MM) |
| status | string | parked / requested / moving / no_response |
| lastRequesterId | string | 마지막 요청자 ID |
| createdAt | string | 등록 시각 (ISO 8601) |

### `requests`
| 필드 | 타입 | 설명 |
|---|---|---|
| parkingId | string | 대상 주차 문서 ID |
| parkingUserId | string | 차주 ID |
| requesterId | string | 요청자 ID |
| requesterNickname | string | 요청자 닉네임 |
| status | string | pending / accepted / declined |
| createdAt | string | 요청 시각 |
| respondedAt | string | 응답 시각 |
