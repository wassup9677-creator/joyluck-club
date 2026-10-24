# JOYLUCK CLUB 독서기록 (Vercel 배포용)

가입 없이 **초대 링크 하나**로 카카오톡 인앱 브라우저에서 바로 열리는 독서모임 기록 앱입니다.

## 구조
- `public/index.html` : 화면 (정적 파일)
- `api/db.js` : 서버리스 API (Vercel Function)
- 저장소 : Upstash Redis (Vercel Marketplace, 무료 플랜 가능)

## 배포 순서
1. 이 폴더를 GitHub 저장소로 올립니다. (또는 터미널에서 `npx vercel` 실행)
2. [vercel.com](https://vercel.com) → **Add New → Project** → 저장소를 Import → **Deploy**
3. 프로젝트의 **Storage** 탭 → **Upstash Redis(KV)** 생성 후 이 프로젝트에 Connect
   (`KV_REST_API_URL`, `KV_REST_API_TOKEN` 환경변수가 자동으로 들어갑니다)
4. **Settings → Environment Variables** 에 `CLUB_CODE` 추가
   (모임 초대 코드, 예: `joyluck2026`)
5. **Deployments → Redeploy** 로 다시 배포합니다.

## 사용
- 앱을 열고 초대 코드와 이름을 입력하면 입장됩니다.
- 앱 안의 **카카오톡으로 공유** 버튼이 `https://내도메인.vercel.app/#code=초대코드` 형태의 링크를 만듭니다.
  친구는 이 링크를 누르면 코드가 자동 입력되고 이름만 쓰면 됩니다.

## 참고
- 초대 코드를 아는 사람은 누구나 입장할 수 있습니다. 코드가 새어 나가면 `CLUB_CODE`를 바꾸고 Redeploy 하세요.
- 로그인이 없어서 이름은 본인이 정하는 별명이며, 같은 기기·브라우저에서만 내 글로 인식됩니다.

## 책 검색 (알라딘)
알라딘 OpenAPI의 **TTBKey**를 환경변수 `ALADIN_TTB_KEY`로 넣으면 알라딘에서 책과 표지를 검색합니다.
- 가입: https://www.aladin.co.kr/ttb/wjoinus.aspx → 키 확인: https://www.aladin.co.kr/ttb/wblog_manage.aspx
- 키가 없으면 Google Books로 검색합니다.
- 키는 서버에서만 사용되어 화면에 노출되지 않습니다. (하루 5,000회 제한)
