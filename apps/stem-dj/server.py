from __future__ import annotations

# allow: SIZE_OK - Single-file stdlib server entrypoint retained for this safety slice.
import hashlib
import json
import mimetypes
import os
import shutil
import subprocess
import threading
import time
import uuid
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse


APP_DIR = Path(__file__).resolve().parent
STATIC_DIR = APP_DIR / "static"
CONFIG_PATH = Path(os.environ.get("STEM_DJ_CONFIG_PATH", str(APP_DIR / "settings.json"))).expanduser()
DEFAULT_LIBRARY_DIR = Path(
    os.environ.get("STEM_DJ_DEFAULT_LIBRARY", str(Path.home() / "Music" / "DJ Library"))
).expanduser()
LOCAL_DEMUCS = APP_DIR / "tools" / "demucs-env" / "Scripts" / "demucs.exe"
AUDIO_EXTENSIONS = {".mp3", ".wav", ".flac", ".m4a", ".aac", ".ogg"}
STEM_NAMES = ("vocals", "drums", "bass", "other")
SERVER_HOST = "127.0.0.1"
SERVER_PORT = 8765
ALLOWED_ORIGINS = frozenset({
    f"http://{SERVER_HOST}:{SERVER_PORT}",
    f"http://localhost:{SERVER_PORT}",
})
JOB_RETENTION_SECONDS = 3600
ACTIVE_JOB_STALE_SECONDS = 3600
STALE_JOB_MESSAGE = "stem 분리 작업이 오래 응답하지 않아 중단된 것으로 표시했습니다. 다시 시도해 주세요."
MAX_JSON_BODY = 64 * 1024

TRACKS: dict[str, Path] = {}
TRACKS_LOCK = threading.Lock()
JOBS: dict[str, dict] = {}
JOBS_LOCK = threading.Lock()
SCAN_STATE = {"limited": False, "message": ""}


def ensure_dirs() -> None:
    library_dir().mkdir(parents=True, exist_ok=True)
    stems_dir().mkdir(parents=True, exist_ok=True)


def load_config() -> dict:
    if not CONFIG_PATH.exists():
        return {"library": str(DEFAULT_LIBRARY_DIR)}
    try:
        data = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
        return {"library": data.get("library") or str(DEFAULT_LIBRARY_DIR)}
    except Exception:
        return {"library": str(DEFAULT_LIBRARY_DIR)}


def save_config(data: dict) -> None:
    CONFIG_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def library_dir() -> Path:
    return Path(load_config()["library"]).expanduser()


def stems_dir() -> Path:
    return library_dir() / ".stems"


def track_id(path: Path) -> str:
    return hashlib.sha1(str(path.resolve()).encode("utf-8")).hexdigest()[:16]


def path_is_inside(path: Path, root: Path) -> bool:
    try:
        path.resolve().relative_to(root.resolve())
    except ValueError:
        return False
    return True


def scan_library() -> list[dict]:
    ensure_dirs()
    base_dir = library_dir()
    stem_root = stems_dir()
    deadline = time.monotonic() + 6
    max_tracks = 2000
    tracks = []
    # 스캔 중 다른 요청이 빈 TRACKS를 보지 않도록 지역 dict에 모은 뒤 한 번에 교체한다.
    new_tracks: dict[str, Path] = {}
    limited = False
    try:
        for root, dirnames, filenames in os.walk(base_dir):
            root_path = Path(root)
            if time.monotonic() > deadline or len(tracks) >= max_tracks:
                limited = True
                break
            dirnames[:] = [
                name for name in dirnames
                if not name.startswith(".") and (root_path / name).resolve() != stem_root.resolve()
            ]
            for filename in sorted(filenames):
                if time.monotonic() > deadline or len(tracks) >= max_tracks:
                    limited = True
                    break
                path = root_path / filename
                if path.suffix.lower() not in AUDIO_EXTENSIONS:
                    continue
                tid = track_id(path)
                new_tracks[tid] = path
                stat = path.stat()
                tracks.append(
                    {
                        "id": tid,
                        "title": path.stem,
                        "filename": path.name,
                        "path": str(path),
                        "size": stat.st_size,
                        "modified": int(stat.st_mtime),
                        "stemReady": stems_ready(tid),
                        "url": f"/media?id={tid}",
                    }
                )
    finally:
        with TRACKS_LOCK:
            TRACKS.clear()
            TRACKS.update(new_tracks)
        SCAN_STATE["limited"] = limited
        SCAN_STATE["message"] = (
            f"라이브러리가 커서 먼저 찾은 {len(tracks)}개만 표시했습니다."
            if limited else ""
        )
    return tracks


def safe_track_path(tid: str) -> Path | None:
    if not isinstance(tid, str) or not tid:
        return None
    with TRACKS_LOCK:
        path = TRACKS.get(tid)
    if path is None:
        scan_library()
        with TRACKS_LOCK:
            path = TRACKS.get(tid)
    if not path:
        return None
    if not path_is_inside(path, library_dir()):
        return None
    return path


def stem_dir(tid: str) -> Path:
    return stems_dir() / tid


def stems_ready(tid: str) -> bool:
    base = stem_dir(tid)
    return all((base / f"{name}.wav").exists() for name in STEM_NAMES)


def safe_stem_path(tid: str, name: str) -> Path | None:
    if name not in STEM_NAMES or not safe_track_path(tid):
        return None
    path = stem_dir(tid) / f"{name}.wav"
    if not path_is_inside(path, stems_dir()):
        return None
    return path


def stem_payload(tid: str) -> dict:
    ready = stems_ready(tid)
    return {
        "ready": ready,
        "stems": {
            name: f"/stem?id={tid}&name={name}" if ready else None
            for name in STEM_NAMES
        },
    }


def find_demucs() -> str | None:
    if LOCAL_DEMUCS.exists():
        return str(LOCAL_DEMUCS)
    return shutil.which("demucs")


def write_json(handler: SimpleHTTPRequestHandler, data: dict | list, status: int = 200) -> None:
    body = json.dumps(data, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def stream_file(handler: SimpleHTTPRequestHandler, path: Path) -> None:
    if not path.exists() or not path.is_file():
        handler.send_error(HTTPStatus.NOT_FOUND, "file not found")
        return
    ctype = mimetypes.guess_type(str(path))[0] or "application/octet-stream"
    size = path.stat().st_size
    start = 0
    end = size - 1
    range_header = handler.headers.get("Range")
    if range_header and range_header.startswith("bytes="):
        chunk = range_header.split("=", 1)[1].split(",", 1)[0].strip()
        left, _, right = chunk.partition("-")
        # isdigit()만으로는 '²' 같은 유니코드 숫자가 통과해 int()에서 예외가 나므로 ASCII로 제한한다.
        is_num = lambda x: x.isascii() and x.isdigit()
        valid = (is_num(left) or not left) and (is_num(right) or not right) and bool(left or right)
        if valid and not left:
            # suffix range: bytes=-N → 마지막 N바이트
            start = max(0, size - int(right))
        elif valid:
            start = int(left)
            if right:
                end = min(int(right), size - 1)
        if not valid or start > end or start >= size:
            handler.send_response(HTTPStatus.REQUESTED_RANGE_NOT_SATISFIABLE)
            handler.send_header("Content-Range", f"bytes */{size}")
            handler.send_header("Content-Length", "0")
            handler.end_headers()
            return
        handler.send_response(HTTPStatus.PARTIAL_CONTENT)
        handler.send_header("Content-Range", f"bytes {start}-{end}/{size}")
    else:
        handler.send_response(HTTPStatus.OK)
    length = max(0, end - start + 1)
    handler.send_header("Content-Type", ctype)
    handler.send_header("Accept-Ranges", "bytes")
    handler.send_header("Content-Length", str(length))
    handler.end_headers()
    with path.open("rb") as fh:
        fh.seek(start)
        remaining = length
        while remaining > 0:
            data = fh.read(min(1024 * 512, remaining))
            if not data:
                break
            handler.wfile.write(data)
            remaining -= len(data)


def run_demucs_job(job_id: str, tid: str) -> None:
    purge_old_jobs()  # 오래된 job 정리
    source = safe_track_path(tid)
    if not source:
        set_job(job_id, status="error", message="트랙을 찾을 수 없습니다.")
        return
    demucs = find_demucs()
    if not demucs:
        set_job(
            job_id,
            status="error",
            message="Demucs가 설치되어 있지 않습니다. Python 3.10/3.11 환경에 demucs를 설치한 뒤 다시 실행하세요.",
        )
        return
    out_root = stems_dir() / "_jobs" / job_id
    target = stem_dir(tid)
    target.mkdir(parents=True, exist_ok=True)
    set_job(job_id, status="running", message="stem 분리 중입니다. 곡 길이에 따라 몇 분 걸릴 수 있습니다.")
    try:
        cmd = [demucs, "-n", "htdemucs", "--out", str(out_root), str(source)]
        proc = subprocess.run(cmd, capture_output=True, text=True, check=False)
        if proc.returncode != 0:
            set_job(job_id, status="error", message=(proc.stderr or proc.stdout or "Demucs 실행 실패").strip())
            return
        produced = out_root / "htdemucs" / source.stem
        missing = [name for name in STEM_NAMES if not (produced / f"{name}.wav").exists()]
        if missing:
            set_job(job_id, status="error", message=f"분리 결과 파일 누락: {', '.join(missing)}")
            return
        for name in STEM_NAMES:
            shutil.copy2(produced / f"{name}.wav", target / f"{name}.wav")
        set_job(job_id, status="done", message="stem 분리가 완료되었습니다.", stems=stem_payload(tid)["stems"])
    except Exception as exc:
        set_job(job_id, status="error", message=str(exc))
    finally:
        shutil.rmtree(out_root, ignore_errors=True)


def set_job(job_id: str, **updates) -> None:
    with JOBS_LOCK:
        job = JOBS.setdefault(job_id, {})
        job.update(updates)
        job["updated"] = time.time()


def new_job_id(tid: str) -> str:
    return f"{tid}-{uuid.uuid4().hex}"


def purge_old_jobs() -> None:
    now = time.time()
    terminal_cutoff = now - JOB_RETENTION_SECONDS
    active_cutoff = now - ACTIVE_JOB_STALE_SECONDS
    with JOBS_LOCK:
        stale_terminal = [
            jid for jid, job in JOBS.items()
            if job.get("status") in ("done", "error") and job.get("updated", 0) < terminal_cutoff
        ]
        stale_active = [
            jid for jid, job in JOBS.items()
            if job.get("status") in ("queued", "running") and job.get("updated", 0) < active_cutoff
        ]
        for jid in stale_terminal:
            del JOBS[jid]
        for jid in stale_active:
            job = JOBS[jid]
            job["status"] = "error"
            job["message"] = STALE_JOB_MESSAGE
            job["updated"] = now


class StemDJHandler(SimpleHTTPRequestHandler):
    server_version = "StemDJ/0.1"

    def translate_path(self, path: str) -> str:
        parsed = urlparse(path)
        clean = unquote(parsed.path).lstrip("/")
        if not clean:
            clean = "index.html"
        resolved = (STATIC_DIR / clean).resolve()
        if not resolved.is_relative_to(STATIC_DIR):
            return str(STATIC_DIR / "__traversal_blocked__")  # 존재하지 않는 경로 → 404
        return str(resolved)

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        qs = parse_qs(parsed.query)
        if parsed.path == "/api/library":
            tracks = scan_library()
            write_json(
                self,
                {
                    "library": str(library_dir()),
                    "tracks": tracks,
                    "demucs": bool(find_demucs()),
                    "scanLimited": SCAN_STATE["limited"],
                    "scanMessage": SCAN_STATE["message"],
                },
            )
            return
        if parsed.path == "/api/settings":
            write_json(self, {"library": str(library_dir()), "defaultLibrary": str(DEFAULT_LIBRARY_DIR)})
            return
        if parsed.path == "/api/stems":
            tid = qs.get("id", [""])[0]
            write_json(self, stem_payload(tid) if safe_track_path(tid) else {"ready": False, "stems": {}})
            return
        if parsed.path == "/api/stems/job":
            purge_old_jobs()
            job_id = qs.get("job", [""])[0]
            with JOBS_LOCK:
                job = JOBS.get(job_id, {"status": "missing", "message": "작업을 찾을 수 없습니다."})
            write_json(self, job)
            return
        if parsed.path == "/media":
            path = safe_track_path(qs.get("id", [""])[0])
            stream_file(self, path) if path else self.send_error(HTTPStatus.NOT_FOUND, "track not found")
            return
        if parsed.path == "/stem":
            tid = qs.get("id", [""])[0]
            name = qs.get("name", [""])[0]
            if name not in STEM_NAMES:
                self.send_error(HTTPStatus.BAD_REQUEST, "invalid stem name")
                return
            path = safe_stem_path(tid, name)
            stream_file(self, path) if path else self.send_error(HTTPStatus.NOT_FOUND, "stem not found")
            return
        super().do_GET()

    # 상태 변경 POST에 대한 CSRF 방어.
    # 악성 웹페이지가 Content-Type: text/plain(프리플라이트 미유발)으로 로컬 서버에
    # JSON 본문을 보내 설정을 바꾸는 것을 막는다. 정식 UI(동일 출처) 요청만 허용한다.
    def _reject_csrf(self) -> bool:
        origin = self.headers.get("Origin")
        if origin is not None and origin not in ALLOWED_ORIGINS:
            write_json(self, {"status": "error", "message": "허용되지 않은 출처의 요청입니다."}, 403)
            return True
        ctype = (self.headers.get("Content-Type") or "").split(";", 1)[0].strip().lower()
        if ctype != "application/json":
            write_json(self, {"status": "error", "message": "Content-Type은 application/json이어야 합니다."}, 415)
            return True
        return False

    def _read_json_object(self) -> dict | None:
        """JSON 객체 본문을 읽는다. 실패 시 오류 응답을 보내고 None을 반환한다."""
        try:
            length = int(self.headers.get("Content-Length", "0") or 0)
        except ValueError:
            length = -1
        if length < 0:
            write_json(self, {"status": "error", "message": "Content-Length가 올바르지 않습니다."}, 400)
            return None
        if length > MAX_JSON_BODY:
            write_json(self, {"status": "error", "message": "요청 본문이 너무 큽니다."}, 413)
            return None
        try:
            payload = json.loads(self.rfile.read(length).decode("utf-8") or "{}")
        except (UnicodeDecodeError, json.JSONDecodeError):
            write_json(self, {"status": "error", "message": "JSON 본문을 해석할 수 없습니다."}, 400)
            return None
        if not isinstance(payload, dict):
            write_json(self, {"status": "error", "message": "JSON 객체 본문이 필요합니다."}, 400)
            return None
        return payload

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        if self._reject_csrf():
            return
        if parsed.path == "/api/settings":
            payload = self._read_json_object()
            if payload is None:
                return
            library = str(payload.get("library", "")).strip()
            if not library:
                write_json(self, {"status": "error", "message": "라이브러리 경로가 비어 있습니다."}, 400)
                return
            target = Path(library).expanduser()
            try:
                target.mkdir(parents=True, exist_ok=True)
                save_config({"library": str(target)})
                ensure_dirs()
            except Exception as exc:
                write_json(self, {"status": "error", "message": str(exc)}, 400)
                return
            write_json(self, {"status": "ok", "library": str(target), "tracks": scan_library()})
            return
        if parsed.path != "/api/stems/start":
            self.send_error(HTTPStatus.NOT_FOUND, "not found")
            return
        purge_old_jobs()
        payload = self._read_json_object()
        if payload is None:
            return
        tid = payload.get("id", "")
        if not safe_track_path(tid):
            write_json(self, {"status": "error", "message": "트랙을 찾을 수 없습니다."}, 404)
            return
        if stems_ready(tid):
            write_json(self, {"status": "done", "message": "이미 분리된 stem이 있습니다.", **stem_payload(tid)})
            return
        # 같은 트랙의 작업이 이미 대기·진행 중이면 새로 띄우지 않고 그 작업을 돌려준다
        # (덱에서 곡을 바꿨다 돌아와 다시 누르면 같은 대상 폴더에 중복 복사되는 것을 막음).
        with JOBS_LOCK:
            active = next(
                (
                    (jid, job) for jid, job in JOBS.items()
                    if job.get("track") == tid and job.get("status") in ("queued", "running")
                ),
                None,
            )
            if active:
                job_id, status = active[0], active[1]["status"]
            else:
                job_id, status = new_job_id(tid), "queued"
                JOBS[job_id] = {
                    "status": status, "track": tid,
                    "message": "stem 분리 대기 중입니다.", "updated": time.time(),
                }
        if not active:
            thread = threading.Thread(target=run_demucs_job, args=(job_id, tid), daemon=True)
            thread.start()
        write_json(self, {"status": status, "job": job_id})


def main() -> None:
    ensure_dirs()
    os.chdir(STATIC_DIR)
    server = ThreadingHTTPServer((SERVER_HOST, SERVER_PORT), StemDJHandler)
    print(f"Stem DJ running at http://{SERVER_HOST}:{SERVER_PORT}")
    print(f"Library: {library_dir()}")
    server.serve_forever()


if __name__ == "__main__":
    main()
