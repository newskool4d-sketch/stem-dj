# Stem DJ Lab

로컬 음원 라이브러리와 파일 불러오기를 함께 지원하는 2-deck DJ 웹앱입니다.

## 실행

```powershell
cd C:\Users\홍주형\workspace\apps\stem-dj
python server.py
```

브라우저에서 `http://127.0.0.1:8765`를 엽니다.

## 음악 라이브러리

기본 폴더:

```text
C:\Users\홍주형\Music\DJ Library
```

지원 확장자:

```text
mp3, wav, flac, m4a, aac, ogg
```

앱 실행 후 `Refresh`를 누르면 폴더의 음원을 다시 스캔합니다. 브라우저의 `Add files` 버튼으로 임시 로컬 파일도 추가할 수 있습니다.

화면 하단 라이브러리 영역의 `Library folder path`에 원하는 폴더 경로를 입력하고 `Set Library`를 누르면 앱 설정으로 저장됩니다. 설정 파일은 앱 폴더의 `settings.json`입니다.

## 기능

- Deck A/B 재생
- 라이브러리 곡 로드 및 로컬 파일 로드
- 파형 표시
- BPM 간이 감지
- tempo/pitch 조절
- crossfader
- platter scratch mode
- hot cue 4개
- beat loop: 1/2, 1, 4, 8
- stem split 버튼
- stem별 mute/solo/volume
- EQ: low/mid/high
- filter, echo, reverb
- master recording

## Stem Split

Stem 분리는 Demucs가 설치된 경우에만 동작합니다.

현재 서버는 `demucs` 명령을 PATH에서 찾습니다. 설치되어 있지 않으면 재생과 DJ 조작은 동작하고, stem split 버튼은 설치 안내 메시지를 표시합니다.
또는 이 앱 폴더의 `tools\demucs-env\Scripts\demucs.exe`도 자동으로 찾습니다.

권장 환경:

```text
Python 3.10 또는 3.11
Demucs
ffmpeg
```

분리 결과는 아래 폴더에 캐시됩니다.

```text
C:\Users\홍주형\Music\DJ Library\.stems
```

본인이 이용 권한을 가진 음원만 처리하세요.

## Demucs 설치 스크립트

Python 3.11이 설치되어 있으면 아래 스크립트로 앱 전용 Demucs 가상환경을 만들 수 있습니다.

```powershell
cd C:\Users\홍주형\workspace\apps\stem-dj
.\setup-demucs.ps1
```

설치 후 서버를 다시 시작합니다.

현재 PC에 Python 3.11이 없다면 먼저 설치합니다.

```powershell
winget install --id Python.Python.3.11 --source winget
```

설치 확인:

```powershell
py -0p
py -3.11 --version
```

환경 진단:

```powershell
cd C:\Users\홍주형\workspace\apps\stem-dj
.\diagnose.ps1
```
