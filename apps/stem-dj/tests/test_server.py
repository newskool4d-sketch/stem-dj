from __future__ import annotations

import contextlib
import http.client
import importlib
import json
import tempfile
import threading
import time
import unittest
from dataclasses import dataclass
from http.server import ThreadingHTTPServer
from pathlib import Path
from typing import Iterator, Mapping

import server


@dataclass(frozen=True, slots=True)
class ServerFixture:
    root: Path
    library: Path
    config: Path

    @classmethod
    def create(cls) -> "ServerFixture":
        root = Path(tempfile.mkdtemp(prefix="stem-dj-test-"))
        library = root / "library"
        config = root / "settings.json"
        library.mkdir()
        return cls(root=root, library=library, config=config)

    def reset_server(self) -> None:
        server.CONFIG_PATH = self.config
        server.DEFAULT_LIBRARY_DIR = self.library
        server.TRACKS.clear()
        server.JOBS.clear()
        server.SCAN_STATE.update({"limited": False, "message": ""})

    def close(self) -> None:
        for path in sorted(self.root.rglob("*"), reverse=True):
            if path.is_file():
                path.unlink()
            elif path.is_dir():
                path.rmdir()
        self.root.rmdir()

    def assert_inside_root(self, path: Path) -> None:
        path.resolve().relative_to(self.root.resolve())


@contextlib.contextmanager
def temp_fixture() -> Iterator[ServerFixture]:
    fixture = ServerFixture.create()
    try:
        fixture.reset_server()
        yield fixture
    finally:
        fixture.reset_server()
        fixture.close()
        importlib.reload(server)


@dataclass(frozen=True, slots=True)
class HttpResponse:
    status: int
    body: bytes
    headers: dict[str, str]

    def json(self) -> dict:
        return json.loads(self.body.decode("utf-8"))


@dataclass(frozen=True, slots=True)
class HttpRequest:
    method: str
    path: str
    body: Mapping[str, str] | None = None


@contextlib.contextmanager
def running_server() -> Iterator[tuple[ThreadingHTTPServer, str]]:
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), server.StemDJHandler)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    try:
        host, port = httpd.server_address
        yield httpd, f"{host}:{port}"
    finally:
        httpd.shutdown()
        thread.join(timeout=5)
        httpd.server_close()


def request(address: str, spec: HttpRequest) -> HttpResponse:
    payload = json.dumps(spec.body).encode("utf-8") if spec.body is not None else None
    headers = {"Content-Type": "application/json"} if payload is not None else {}
    conn = http.client.HTTPConnection(address, timeout=5)
    try:
        conn.request(spec.method, spec.path, body=payload, headers=headers)
        res = conn.getresponse()
        return HttpResponse(
            status=res.status,
            body=res.read(),
            headers={name.lower(): value for name, value in res.getheaders()},
        )
    finally:
        conn.close()


def get(address: str, path: str) -> HttpResponse:
    return request(address, HttpRequest(method="GET", path=path))


def post_json(address: str, path: str, body: Mapping[str, str]) -> HttpResponse:
    return request(address, HttpRequest(method="POST", path=path, body=body))


def write_audio(path: Path, content: bytes = b"fake wav") -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(content)
    return path


class TempLibraryHarnessTest(unittest.TestCase):
    def test_harness_keeps_library_and_stems_inside_temp_root(self) -> None:
        # Given
        with temp_fixture() as fixture:
            # When
            server.ensure_dirs()

            # Then
            self.assertEqual(server.library_dir().resolve(), fixture.library.resolve())
            fixture.assert_inside_root(server.stems_dir())
            self.assertTrue(server.stems_dir().exists())

    def test_missing_track_returns_controlled_not_found(self) -> None:
        # Given
        with temp_fixture():
            with running_server() as (_, address):
                # When
                response = get(address, "/media?id=missing")

                # Then
                self.assertEqual(response.status, 404)


class SettingsAndScanTest(unittest.TestCase):
    def test_settings_save_reload_and_scan_skip_stems(self) -> None:
        # Given
        with temp_fixture() as fixture:
            write_audio(fixture.library / "song.wav")
            hidden = server.stems_dir() / "cached.wav"
            write_audio(hidden)

            # When
            with running_server() as (_, address):
                response = get(address, "/api/library")

            # Then
            self.assertEqual(response.status, 200)
            data = response.json()
            self.assertEqual(data["library"], str(fixture.library))
            self.assertEqual([track["filename"] for track in data["tracks"]], ["song.wav"])
            fixture.assert_inside_root(server.CONFIG_PATH)

    def test_empty_settings_payload_leaves_previous_config_unchanged(self) -> None:
        # Given
        with temp_fixture() as fixture:
            server.save_config({"library": str(fixture.library)})

            # When
            with running_server() as (_, address):
                response = post_json(address, "/api/settings", {"library": ""})

            # Then
            self.assertEqual(response.status, 400)
            self.assertEqual(server.library_dir().resolve(), fixture.library.resolve())


class StemRouteSecurityTest(unittest.TestCase):
    def test_valid_stem_streams_from_configured_stem_root(self) -> None:
        # Given
        with temp_fixture() as fixture:
            track = write_audio(fixture.library / "song.wav")
            tid = server.track_id(track)
            write_audio(server.stem_dir(tid) / "vocals.wav", b"vocals")
            for name in ("drums", "bass", "other"):
                write_audio(server.stem_dir(tid) / f"{name}.wav")

            # When
            with running_server() as (_, address):
                response = get(address, f"/stem?id={tid}&name=vocals")

            # Then
            self.assertEqual(response.status, 200)
            self.assertEqual(response.body, b"vocals")

    def test_invalid_stem_inputs_do_not_escape_stem_root(self) -> None:
        # Given
        with temp_fixture() as fixture:
            track = write_audio(fixture.library / "song.wav")
            tid = server.track_id(track)
            write_audio(server.stem_dir(tid) / "vocals.wav")
            outside = fixture.root / "outside.wav"
            write_audio(outside)
            escaped_stem = fixture.library / "outside" / "vocals.wav"
            write_audio(escaped_stem, b"escaped")

            # When
            with running_server() as (_, address):
                invalid_name = get(address, f"/stem?id={tid}&name=../outside")
                missing_id = get(address, "/stem?id=missing&name=vocals")
                traversal_id = get(address, "/stem?id=../outside&name=vocals")

            # Then
            self.assertEqual(invalid_name.status, 400)
            self.assertEqual(missing_id.status, 404)
            self.assertEqual(traversal_id.status, 404)
            self.assertNotEqual(traversal_id.body, b"escaped")


class JobLifecycleTest(unittest.TestCase):
    def test_same_second_stem_starts_get_different_job_ids(self) -> None:
        # Given
        with temp_fixture() as fixture:
            track = write_audio(fixture.library / "song.wav")
            tid = server.track_id(track)
            original_time = server.time.time
            original_worker = server.run_demucs_job
            server.time.time = lambda: 1000.0
            server.run_demucs_job = lambda job_id, track_id: None
            try:
                # When
                with running_server() as (_, address):
                    first = post_json(address, "/api/stems/start", {"id": tid}).json()
                    second = post_json(address, "/api/stems/start", {"id": tid}).json()
            finally:
                server.time.time = original_time
                server.run_demucs_job = original_worker

            # Then
            self.assertEqual(first["status"], "queued")
            self.assertEqual(second["status"], "queued")
            self.assertNotEqual(first["job"], second["job"])

    def test_purge_old_jobs_removes_terminal_and_errors_stale_active_jobs(self) -> None:
        # Given
        with temp_fixture():
            original_time = server.time.time
            server.time.time = lambda: 10_000.0
            try:
                server.JOBS.update(
                    {
                        "old-done": {"status": "done", "updated": 1.0},
                        "old-error": {"status": "error", "updated": 1.0},
                        "old-queued": {"status": "queued", "updated": 1.0},
                        "old-running": {"status": "running", "updated": 1.0},
                    }
                )

                # When
                server.purge_old_jobs()

                # Then
                self.assertNotIn("old-done", server.JOBS)
                self.assertNotIn("old-error", server.JOBS)
                self.assertEqual(server.JOBS["old-queued"]["status"], "error")
                self.assertEqual(server.JOBS["old-running"]["status"], "error")
            finally:
                server.time.time = original_time

    def test_job_status_read_triggers_stale_cleanup(self) -> None:
        # Given
        with temp_fixture():
            original_time = server.time.time
            server.time.time = lambda: 10_000.0
            try:
                server.JOBS["old-queued"] = {"status": "queued", "updated": 1.0}

                # When
                with running_server() as (_, address):
                    response = get(address, "/api/stems/job?job=old-queued")

                # Then
                self.assertEqual(response.status, 200)
                self.assertEqual(response.json()["status"], "error")
            finally:
                server.time.time = original_time


if __name__ == "__main__":
    unittest.main()
