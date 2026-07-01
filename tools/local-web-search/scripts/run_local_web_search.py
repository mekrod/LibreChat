from __future__ import annotations

import os
import secrets
import shutil
import stat
import subprocess
import sys
import time
from pathlib import Path
from urllib.request import urlopen


ROOT = Path(__file__).resolve().parents[1]
RUNTIME = ROOT / ".runtime"
HELPER_VENV = ROOT / ".venv"
SEARXNG_DIR = RUNTIME / "searxng"
SEARXNG_VENV = RUNTIME / "searxng-venv"
SEARXNG_SETTINGS_DIR = RUNTIME / "searxng-settings"
SEARXNG_SETTINGS = SEARXNG_SETTINGS_DIR / "settings.yml"
SEARXNG_URL = "http://127.0.0.1:8080"
HELPER_URL = "http://127.0.0.1:8765"
MIN_PYTHON = (3, 10)
MAX_PYTHON_EXCLUSIVE = (3, 14)
SEARXNG_CHECKOUT_PATHS = [
    "LICENSE",
    "README.rst",
    "babel.cfg",
    "requirements.txt",
    "requirements-dev.txt",
    "requirements-server.txt",
    "setup.py",
    "searx",
    "searxng_extra",
]


def is_supported_version(version: tuple[int, int]) -> bool:
    return MIN_PYTHON <= version < MAX_PYTHON_EXCLUSIVE


def current_version() -> tuple[int, int]:
    return sys.version_info.major, sys.version_info.minor


def require_supported_python() -> None:
    if is_supported_version(current_version()):
        return
    raise RuntimeError(
        "This launcher needs Python 3.10, 3.11, 3.12, or 3.13. "
        "Python 3.14 does not currently have reliable Windows wheels for dependencies "
        "such as lxml. Install Python 3.12 and run this file again."
    )


def venv_python(venv: Path) -> Path:
    return venv / "Scripts" / "python.exe" if os.name == "nt" else venv / "bin" / "python"


def run(command: list[str | os.PathLike[str]], cwd: Path | None = None, env: dict[str, str] | None = None) -> None:
    printable = " ".join(str(part) for part in command)
    print(f"\n> {printable}", flush=True)
    subprocess.check_call([str(part) for part in command], cwd=str(cwd) if cwd else None, env=env)


def remove_tree(path: Path) -> None:
    def clear_readonly(function, target, exc_info):
        try:
            os.chmod(target, stat.S_IWRITE)
            function(target)
        except Exception:
            raise exc_info[1]

    shutil.rmtree(path, onerror=clear_readonly)


def get_python_version(python: Path) -> tuple[int, int] | None:
    try:
        output = subprocess.check_output(
            [
                str(python),
                "-c",
                "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')",
            ],
            text=True,
        ).strip()
        major, minor = output.split(".", maxsplit=1)
        return int(major), int(minor)
    except Exception:
        return None


def ensure_venv(venv: Path) -> Path:
    python = venv_python(venv)
    if python.exists():
        version = get_python_version(python)
        if version is None or not is_supported_version(version):
            print(f"Removing unsupported Python virtual environment: {venv}", flush=True)
            remove_tree(venv)

    if not python.exists():
        run([sys.executable, "-m", "venv", venv])
    run([python, "-m", "pip", "install", "--upgrade", "pip", "setuptools", "wheel"])
    return python


def wait_for_url(url: str, timeout: int = 60) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urlopen(url, timeout=5) as response:
                if response.status < 500:
                    return True
        except Exception:
            time.sleep(2)
    return False


def ensure_searxng_source() -> None:
    RUNTIME.mkdir(parents=True, exist_ok=True)
    if (SEARXNG_DIR / "searx" / "webapp.py").exists():
        missing = [
            path
            for path in SEARXNG_CHECKOUT_PATHS
            if not (SEARXNG_DIR / path).exists()
        ]
        if missing:
            run(["git", "checkout", "HEAD", "--", *missing], cwd=SEARXNG_DIR)
        patch_searxng_for_windows()
        return
    if SEARXNG_DIR.exists():
        print(f"Removing incomplete SearXNG checkout: {SEARXNG_DIR}", flush=True)
        remove_tree(SEARXNG_DIR)
    if not shutil.which("git"):
        raise RuntimeError("Git is required to download SearXNG. Install Git for Windows and run this file again.")
    run(["git", "clone", "--depth", "1", "--no-checkout", "https://github.com/searxng/searxng.git", SEARXNG_DIR])
    run(
        [
            "git",
            "checkout",
            "HEAD",
            "--",
            *SEARXNG_CHECKOUT_PATHS,
        ],
        cwd=SEARXNG_DIR,
    )
    patch_searxng_for_windows()


def patch_searxng_for_windows() -> None:
    if os.name != "nt":
        return
    valkeydb = SEARXNG_DIR / "searx" / "valkeydb.py"
    if not valkeydb.exists():
        return
    source = valkeydb.read_text(encoding="utf-8")
    source = source.replace("import pwd\n", "")
    source = source.replace(
        "        _pw = pwd.getpwuid(os.getuid())\n"
        "        logger.exception(\"[%s (%s)] can't connect valkey DB ...\", _pw.pw_name, _pw.pw_uid)\n",
        "        logger.exception(\"can't connect valkey DB ...\")\n",
    )
    valkeydb.write_text(source, encoding="utf-8")


def ensure_searxng_settings() -> None:
    SEARXNG_SETTINGS_DIR.mkdir(parents=True, exist_ok=True)
    if SEARXNG_SETTINGS.exists():
        return
    secret = secrets.token_urlsafe(48)
    SEARXNG_SETTINGS.write_text(
        "\n".join(
            [
                "use_default_settings: true",
                "",
                "server:",
                f'  secret_key: "{secret}"',
                "  bind_address: 127.0.0.1",
                "  port: 8080",
                "  limiter: false",
                "  public_instance: false",
                "",
                "search:",
                "  formats:",
                "    - html",
                "    - json",
                "",
                "redis:",
                "  url: false",
                "",
            ]
        ),
        encoding="utf-8",
    )


def install_helper() -> Path:
    python = ensure_venv(HELPER_VENV)
    run([python, "-m", "pip", "install", "-e", ROOT])
    try:
        run([python, "-m", "playwright", "install", "chromium"])
    except subprocess.CalledProcessError:
        print("Playwright browser install failed. The helper will still run with HTTP scraping fallback.", flush=True)
    return python


def install_searxng() -> Path:
    ensure_searxng_source()
    ensure_searxng_settings()
    python = ensure_venv(SEARXNG_VENV)
    run([python, "-m", "pip", "install", "-r", SEARXNG_DIR / "requirements.txt"])
    run([python, "-m", "pip", "install", "-r", SEARXNG_DIR / "requirements-server.txt"])
    if os.name == "nt":
        run([python, "-m", "pip", "install", "tzdata"])
    run([python, "-m", "pip", "install", "--no-build-isolation", "-e", SEARXNG_DIR])
    return python


def start_searxng(python: Path) -> subprocess.Popen:
    env = os.environ.copy()
    env["SEARXNG_SETTINGS_PATH"] = str(SEARXNG_SETTINGS)
    env["SEARXNG_BIND_ADDRESS"] = "127.0.0.1"
    env["SEARXNG_PORT"] = "8080"
    print(f"\nStarting SearXNG on {SEARXNG_URL}", flush=True)
    return subprocess.Popen([str(python), "searx/webapp.py"], cwd=str(SEARXNG_DIR), env=env)


def start_helper(python: Path) -> subprocess.Popen:
    env = os.environ.copy()
    env["HOST"] = "127.0.0.1"
    env["PORT"] = "8765"
    env["SEARXNG_INSTANCE_URL"] = SEARXNG_URL
    env.setdefault("LOCAL_WEB_SEARCH_TOKEN", "")
    print(f"\nStarting LibreChat local web search helper on {HELPER_URL}", flush=True)
    return subprocess.Popen([str(python), "-m", "local_web_search.app"], cwd=str(ROOT), env=env)


def main() -> int:
    require_supported_python()
    print("LibreChat local web search setup", flush=True)
    print("This window installs/starts SearXNG and the Crawl4AI helper locally.", flush=True)
    helper_python = install_helper()
    searxng_python = install_searxng()

    searxng = start_searxng(searxng_python)
    if not wait_for_url(SEARXNG_URL, timeout=90):
        searxng.terminate()
        raise RuntimeError("SearXNG did not become ready on http://127.0.0.1:8080")

    helper = start_helper(helper_python)
    if not wait_for_url(f"{HELPER_URL}/health", timeout=60):
        helper.terminate()
        searxng.terminate()
        raise RuntimeError("Local web search helper did not become ready on http://127.0.0.1:8765")

    print("\nReady.", flush=True)
    print(f"SearXNG: {SEARXNG_URL}", flush=True)
    print(f"LibreChat helper: {HELPER_URL}", flush=True)
    print("Keep this window open while using LibreChat web search.", flush=True)
    print("Press Ctrl+C in this window to stop both services.", flush=True)

    try:
        while True:
            if searxng.poll() is not None:
                return searxng.returncode or 1
            if helper.poll() is not None:
                return helper.returncode or 1
            time.sleep(2)
    except KeyboardInterrupt:
        print("\nStopping local web search services...", flush=True)
        helper.terminate()
        searxng.terminate()
        helper.wait(timeout=20)
        searxng.wait(timeout=20)
        return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"\nERROR: {exc}", flush=True)
        raise SystemExit(1)
