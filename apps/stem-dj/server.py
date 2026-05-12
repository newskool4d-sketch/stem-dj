from __future__ import annotations

import hashlib
import json
import mimetypes
import os
import shutil
import subprocess
import threading
import time
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse


APP_DIR = Path(__file__).resolve().parent
STATIC_DIR = APP_DIR / "static"
CONFIG_PATH = APP_DIR / "settings.json"
DEFAULT_LIBRARY_DIR = Path.home() / "Music" / "DJ Library"
LOCAL_DEMUCS = APP_DIR / "tools" / "demucs-env" / "Scripts" / "demucs.exe"
AUDIO_EXTENSIONS = {".mp3", ".wav", ".flac", ".m4a", ".aac", ".ogg"}
STEM_NAMES = ("vocals", "drums", "bass", "other")

TRACKS: dict[str, Path] = {}
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


def scan_library() -> list[dict]:
    ensure_dirs()
    base_dir = library_dir()
    stem_root = stems_dir()
    deadline = time.monotonic() + 6
    max_tracks = 2000
    tracks = []
    TRACKS.clear()
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
                TRACKS[tid] = path
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
        SCAN_STATE["limited"] = limited
        SCAN_STATE["message"] = (
            f"라이브러리가 커서 먼저 찾은 {len(tracks)}개만 표시했습니다."
            if limited else ""
        )
    return tracks


def safe_track_path(tid: str) -> Path | None:
    if tid not in TRACKS:
        scan_library()
    path = TRACKS.get(tid)
    if not path:
        return None
    try:
        path.resolve().relative_to(library_dir().resolve())
    except ValueError:
        return None
    return path


def stem_dir(tid: str) -> Path:
    return stems_dir() / tid


def stems_ready(tid: str) -> bool:
    base = stem_dir(tid)
    return all((base / f"{name}.wav").exists() for name in STEM_NAMES)


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
        chunk = range_header.split("=", 1)[1].split(",", 1)[0]
        left, _, right = chunk.partition("-")
        if left:
            start = int(left)
        if right:
            end = int(right)
        end = min(end, size - 1)
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


def purge_old_jobs() -> None:
    cutoff = time.time() - 3600  # 1시간 경과 job 제거
    with JOBS_LOCK:
        stale = [jid for jid, j in JOBS.items()
                 if j.get("status") in ("done", "error") and j.get("updated", 0) < cutoff]
        for jid in stale:
            del JOBS[jid]


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
            stream_file(self, stem_dir(tid) / f"{name}.wav")
            return
        super().do_GET()

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/api/settings":
            length = int(self.headers.get("Content-Length", "0") or 0)
            payload = json.loads(self.rfile.read(length).decode("utf-8") or "{}")
            library = str(payload.get("library", "")).strip()
            if not library:
                write_json(self, {"status": "error", "message": "라이브러리 경로가 비어 있습니다."}, 400)
                return
            target = Path(library).expanduser()
            try:
                target.mkdir(parents=True, exist_ok=True)
                save_config({"library": str(target)})
                TRACKS.clear()
                ensure_dirs()
            except Exception as exc:
                write_json(self, {"status": "error", "message": str(exc)}, 400)
                return
            write_json(self, {"status": "ok", "library": str(target), "tracks": scan_library()})
            return
        if parsed.path != "/api/stems/start":
            self.send_error(HTTPStatus.NOT_FOUND, "not found")
            return
        length = int(self.headers.get("Content-Length", "0") or 0)
        payload = json.loads(self.rfile.read(length).decode("utf-8") or "{}")
        tid = payload.get("id", "")
        if not safe_track_path(tid):
            write_json(self, {"status": "error", "message": "트랙을 찾을 수 없습니다."}, 404)
            return
        if stems_ready(tid):
            write_json(self, {"status": "done", "message": "이미 분리된 stem이 있습니다.", **stem_payload(tid)})
            return
        job_id = f"{tid}-{int(time.time())}"
        set_job(job_id, status="queued", message="stem 분리 대기 중입니다.")
        thread = threading.Thread(target=run_demucs_job, args=(job_id, tid), daemon=True)
        thread.start()
        write_json(self, {"status": "queued", "job": job_id})


def main() -> None:
    ensure_dirs()
    os.chdir(STATIC_DIR)
    server = ThreadingHTTPServer(("127.0.0.1", 8765), StemDJHandler)
    print("Stem DJ running at http://127.0.0.1:8765")
    print(f"Library: {library_dir()}")
    server.serve_forever()


if __name__ == "__main__":
    main()
