"""Linux supervisor integration tests; never authenticate with Discord."""
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import time

import pytest


@pytest.fixture
def project(tmp_path):
    root = tmp_path / 'project with spaces'
    (root / 'startup').mkdir(parents=True)
    shutil.copy(Path(__file__).with_name('runtime.py'), root / 'startup/runtime.py')
    (root / 'ai-service/app').mkdir(parents=True)
    (root / 'discord-bot').mkdir()
    (root / 'bin').mkdir()
    (root / 'ai-service/app/main.py').write_text('from fastapi import FastAPI\napp=FastAPI()\n@app.get("/health")\ndef health(): return {"status":"ok"}\n')
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    (root / 'ai-service/.env').write_text(f'AI_SERVICE_PORT={port}\n')
    (root / 'discord-bot/.env').write_text(f'DISCORD_TOKEN=test-only\nAI_SERVICE_URL=http://127.0.0.1:{port}\n')
    # A fake Bot exercises child supervision without any Discord side effects.
    node = root / 'bin/node'
    node.write_text(f'#!{sys.executable}\nimport os,time,sys\nsys.exit(7) if os.getenv("BOT_EXIT") else None\nwhile True: time.sleep(1)\n')
    node.chmod(0o755)
    env = {**os.environ, 'PATH': f'{root / "bin"}:{os.environ["PATH"]}'}
    for key in ['DISCORD_TOKEN', 'AI_SERVICE_URL', 'AI_SERVICE_PORT', 'ADMIN_WEB_TOKEN', 'BOT_EXIT']:
        env.pop(key, None)
    return root, env


def run(root, env, *args):
    return subprocess.run([sys.executable, str(root / 'startup/runtime.py'), *args], env=env,
                          capture_output=True, text=True, timeout=20)


def wait_running(child):
    # stdout is flushed when the supervisor reaches its monitoring loop.
    import select
    deadline = time.monotonic() + 15
    output = ''
    while time.monotonic() < deadline:
        ready, _, _ = select.select([child.stdout], [], [], 0.2)
        if ready:
            chunk = os.read(child.stdout.fileno(), 4096).decode()
            output += chunk
            if 'Running in foreground' in output:
                return
            if not chunk and child.poll() is not None:
                break
    raise AssertionError('Supervisor did not become ready')


def test_start_duplicate_and_stop_from_other_directory(project):
    root, env = project
    child = subprocess.Popen([sys.executable, str(root / 'startup/runtime.py'), 'start'], env=env,
                             stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, cwd='/tmp')
    try:
        wait_running(child)
        duplicate = run(root, env, 'start')
        assert duplicate.returncode == 1
        assert 'Already running' in duplicate.stderr
        assert run(root, env, 'stop').returncode == 0
        assert child.wait(timeout=10) == 0
        assert not (root / 'data/linux-runtime/supervisor.json').exists()
        assert run(root, env, 'stop').returncode == 0
    finally:
        if child.poll() is None:
            child.terminate()
            child.wait(timeout=15)


def test_bot_failure_stops_ai(project):
    root, env = project
    result = run(root, {**env, 'BOT_EXIT': '1'}, 'start')
    assert result.returncode == 1
    assert 'managed service exited' in result.stderr
    assert not (root / 'data/linux-runtime/supervisor.json').exists()
    port = int((root / 'ai-service/.env').read_text().split('=')[1])
    with socket.socket() as probe:
        assert probe.connect_ex(('127.0.0.1', port)) != 0


def test_missing_credentials_and_mismatched_token_fail_before_start(project):
    root, env = project
    (root / 'discord-bot/.env').write_text('DISCORD_TOKEN=\n')
    result = run(root, env, 'start')
    assert result.returncode == 1 and 'Set DISCORD_TOKEN' in result.stderr
    (root / 'discord-bot/.env').write_text('DISCORD_TOKEN=test\nADMIN_WEB_TOKEN=different\n')
    result = run(root, env, 'start')
    assert result.returncode == 1 and 'must match' in result.stderr


def test_stop_refuses_unrelated_process(project):
    root, env = project
    state = root / 'data/linux-runtime/supervisor.json'
    state.parent.mkdir(parents=True)
    starttime = Path(f'/proc/{os.getpid()}/stat').read_text().rsplit(')', 1)[1].split()[19]
    state.write_text(json.dumps({'pid': os.getpid(), 'starttime': starttime}))
    result = run(root, env, 'stop')
    assert result.returncode == 1
    assert 'refusing to stop' in result.stderr


def test_background_survives_launcher_exit_and_sighup(project):
    import signal
    from urllib.request import ProxyHandler, build_opener
    root, env = project
    try:
        result = run(root, env, 'start-background')
        assert result.returncode == 0, result.stderr
        assert 'SSH may be disconnected' in result.stdout
        state = json.loads((root / 'data/linux-runtime/supervisor.json').read_text())
        pid = state['pid']
        assert os.getsid(pid) == pid  # detached from the launcher's SSH session
        os.kill(pid, signal.SIGHUP)
        time.sleep(0.4)
        assert Path(f'/proc/{pid}').exists()
        port = int((root / 'ai-service/.env').read_text().split('=')[1])
        with build_opener(ProxyHandler({})).open(f'http://127.0.0.1:{port}/health', timeout=2) as response:
            assert response.status == 200
        duplicate = run(root, env, 'start-background')
        assert duplicate.returncode == 1
        assert json.loads((root / 'data/linux-runtime/supervisor.json').read_text())['pid'] == pid
    finally:
        assert run(root, env, 'stop').returncode == 0


def test_background_reports_bot_startup_failure(project):
    root, env = project
    result = run(root, {**env, 'BOT_EXIT': '1'}, 'start-background')
    assert result.returncode == 1
    assert 'Background startup failed' in result.stderr
    assert not (root / 'data/linux-runtime/supervisor.json').exists()
