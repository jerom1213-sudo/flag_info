# 광주·전남 행사 사전정보 검색 — 다른 PC 사용 안내

공식 지자체 업무계획과 행사 달력을 조회하는 웹 프로그램입니다. 각 PC에서 Node.js 서버를 실행한 뒤 브라우저로 사용합니다. 원문·첨부파일 조회에는 인터넷 연결이 필요합니다.

## 다운로드

- 저장소: [jerom1213-sudo/flag_info](https://github.com/jerom1213-sudo/flag_info)
- [프로그램 소스 ZIP 내려받기](https://github.com/jerom1213-sudo/flag_info/archive/refs/heads/main.zip)
- [Windows·Linux 자동 검사 및 배포 ZIP](https://github.com/jerom1213-sudo/flag_info/actions)

이 저장소에는 행사 조회용 코드와 설치 파일만 포함합니다. 각 PC에서 아래 설치·실행 절차를 진행하세요.

## Windows PC에서 사용

1. [Node.js](https://nodejs.org/) 20 이상(권장 24)과 [Python](https://www.python.org/downloads/windows/) 3.10 이상을 설치합니다. Python 설치 시 **Add Python to PATH**를 선택합니다.
2. 제공된 `the-flag-event-finder.zip`을 **압축 해제**합니다. 또는 GitHub 저장소의 **Code → Download ZIP**으로 내려받아 압축 해제합니다.
3. 폴더의 **setup.cmd**를 더블클릭합니다. 최초 한 번 Python 가상환경과 PDF 분석 패키지를 설치하고 환경을 점검합니다. 관리자 권한은 필요하지 않습니다.
4. **start.cmd**를 더블클릭합니다. 명령창을 켜둔 채 브라우저에서 **http://localhost:4174/events**를 엽니다.
5. 종료하려면 실행 창에서 **Ctrl+C**를 누릅니다. 다음 사용부터는 `start.cmd`만 실행합니다.

프로그램은 기본적으로 해당 PC에서만 접속하도록 `127.0.0.1`에 실행됩니다. 고객·계정·주문 DB가 필요하지 않으며 행사 조회 전용 서버를 사용합니다. 기존 통합관리 프로그램과는 독립적으로 실행됩니다.

## GitHub에 올리는 방법

권장 구성은 **비공개 저장소에 코드를 보관하고 각 PC에서 다운로드하여 실행**하는 방식입니다.

1. GitHub에서 **New repository**를 눌러 저장소 이름(예: `the-flag-event-finder`)을 정합니다. 공개 범위는 **Private**를 권장합니다.
2. [GitHub Desktop](https://desktop.github.com/)을 설치하고 로그인합니다.
3. 만든 저장소를 **Clone**한 폴더에 이 배포본의 파일 전체를 복사합니다. `.github`, `.gitignore`, `scripts`도 포함합니다. ZIP 파일 자체만 올리는 방식은 소스 업데이트 관리에 적합하지 않습니다.
4. 변경사항을 Commit하고 **Push origin**을 누릅니다. 기존 Clone 폴더의 `.git`은 그대로 둡니다.
5. 다른 PC에서는 같은 저장소를 Clone하거나 **Code → Download ZIP**을 선택한 뒤 위 설치 순서를 따릅니다. 비공개 저장소는 로그인 및 접근 권한이 필요합니다.
6. 업데이트 시 실행을 종료하고 **Pull origin**을 누른 뒤 `setup.cmd`, `start.cmd` 순으로 실행합니다. ZIP 사용자도 새 ZIP을 별도 폴더에 압축 해제해 같은 순서를 따릅니다.

배포본 생성 명령은 `npm run package`이며 `release/the-flag-event-finder.zip`과 업로드용 폴더를 생성합니다. 원본 프로젝트의 `db/`, 계정정보, 화면 캡처, Codex 설정, 기존 정적 배포본은 포함하지 않습니다. `.github/workflows/check.yml`은 업로드 후 Windows·Linux 자동 검사와 다운로드용 ZIP 생성에 사용됩니다. Actions 성공 여부와 결과물은 저장소 **Actions** 탭에서 확인합니다.

GitHub Pages는 정적 호스팅이므로 이 앱의 Node.js 조회 API와 Python 첨부 분석을 실행할 수 없습니다. **GitHub 업로드 자체가 온라인 서비스 운영을 의미하지 않습니다.**

- [GitHub: 로컬 코드 업로드](https://docs.github.com/en/migrations/importing-source-code/using-the-command-line-to-import-source-code/adding-locally-hosted-code-to-github)
- [GitHub Pages 안내](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site)

## macOS / Linux 또는 명령줄 사용

Node.js 20 이상과 Python 3.10 이상을 설치한 후 앱 폴더에서 실행합니다.

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
npm run doctor
npm test
npm start
```

Windows PowerShell의 수동 설치:

```powershell
py -3 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
npm run doctor
npm test
npm start
```

## 회사 내부에서 여러 PC가 한 서버를 사용하는 경우

서버를 실행할 PC에서 설치 후 PowerShell로 아래처럼 실행합니다. 이 설정은 같은 네트워크의 다른 PC가 접속할 수 있도록 바인딩을 변경합니다.

```powershell
$env:HOST='0.0.0.0'
$env:PORT='4174'
npm start
```

다른 PC에서 `http://서버PC의내부IP:4174/events`로 접속합니다. 서버 PC의 방화벽 허용이 필요한 경우 회사 관리자에게 내부 네트워크 범위로 설정을 요청합니다. 이 모드는 행사 조회 전용이며 통합관리 DB를 공유하지 않습니다. 서버 PC가 꺼지면 조회할 수 없습니다.

인터넷에서 주소 하나로 쓰려면 Node.js와 Python을 지원하는 별도 서버 호스팅이 필요합니다. 현재 배포본은 PC 설치·내부망 사용을 우선 지원합니다. 공개 호스팅 시에는 접속 인증, HTTPS, 이용자별 조회 제한을 별도로 구성해야 합니다.

## 문제 해결

- 환경 확인: `npm run doctor`. Python/PDF 오류가 나면 `setup.cmd`를 다시 실행합니다.
- `4174` 포트 사용 중: 기존 실행창을 종료하거나 PowerShell에서 `$env:PORT='4175'; npm start` 후 `http://localhost:4175/events`로 접속합니다.
- PDF만 분석 실패: 가상환경에 `pypdf`가 설치됐는지 확인합니다. HWP/HWPX도 Python이 필요합니다.
- 기관 연결 오류: 공식 홈페이지 접근과 인터넷 연결을 확인합니다. ‘최신 자료 다시 조회’로 재검색합니다.
- 스캔 문서나 기관 접근 제한으로 누락될 수 있습니다. 화면의 원문과 기관별 조회 상태를 확인합니다.
- 원문에 없는 사용자 확인 보완 정보는 `event-corrections.json`에 기록합니다. 현재 송암동 축제의 주최기관 보완 정보가 포함되어 있습니다.
