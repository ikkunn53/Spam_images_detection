"""Linux foreground supervisor. Read dotenv as data, never shell code."""
import argparse
import fcntl
import json
import os
from pathlib import Path
import signal
import socket
import subprocess
import sys
import time
from urllib.parse import urlparse
from urllib.request import ProxyHandler, build_opener

from dotenv import dotenv_values

ROOT = Path(__file__).resolve().parent.parent
RUNTIME = ROOT / 'data' / 'linux-runtime'
STATE = RUNTIME / 'supervisor.json'


def process_identity(pid):
    try:
        # Linux starttime distinguishes a recycled PID from the original process.
        return Path(f'/proc/{pid}/stat').read_text().rsplit(')', 1)[1].split()[19]
    except (FileNotFoundError, ProcessLookupError, IndexError):
        return None


def service_env(service):
    config = dotenv_values(ROOT / service / '.env')
    return {**{key: value for key, value in config.items() if value is not None}, **os.environ}


def stop():
    if not STATE.exists():
        print('No managed Linux instance is running.')
        return 0
    state = json.loads(STATE.read_text())
    pid = state['pid']
    if process_identity(pid) != state['starttime']:
        print('The saved instance has already stopped; no signal sent.')
        return 0
    command = Path(f'/proc/{pid}/cmdline').read_bytes().split(b'\0')
    if os.fsencode(str(Path(__file__).resolve())) not in command or b'start' not in command:
        raise RuntimeError('Saved PID is not this supervisor; refusing to stop it.')
    os.kill(pid, signal.SIGTERM)
    for _ in range(150):
        if not STATE.exists() or process_identity(pid) != state['starttime']:
            print('AI service and Bot stopped.')
            return 0
        time.sleep(0.1)
    raise RuntimeError('Shutdown did not complete; check data/logs and the startup terminal.')


def start(ai_only=False):
    os.umask(0o077)
    RUNTIME.mkdir(parents=True, exist_ok=True)
    lock = (RUNTIME / 'supervisor.lock').open('a')
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        lock.close()
        raise RuntimeError('Already running. Use bash startup/stop-bot.sh first.')
    children = []
    logfiles = []
    stopping = False

    def request_stop(_signal, _frame):
        nonlocal stopping
        stopping = True

    signal.signal(signal.SIGTERM, request_stop)
    signal.signal(signal.SIGINT, request_stop)
    signal.signal(signal.SIGHUP, request_stop)

    def launch(service, command, env):
        log_path = ROOT / 'data' / 'logs' / f'{service}.log'
        log_path.parent.mkdir(parents=True, exist_ok=True)
        output = log_path.open('ab', buffering=0)
        logfiles.append(output)
        child = subprocess.Popen(command, cwd=ROOT / service, env=env,
                                 stdout=output, stderr=subprocess.STDOUT,
                                 start_new_session=True)
        children.append(child)
        print(f'{service} started; log: {log_path}', flush=True)
        return child

    try:
        for service in ['ai-service'] + ([] if ai_only else ['discord-bot']):
            if not (ROOT / service / '.env').is_file():
                raise RuntimeError(f'{service}/.env is missing. Run bash startup/setup.sh first.')
        ai_env = service_env('ai-service')
        port = int(ai_env.get('AI_SERVICE_PORT', '8000'))
        if not 1 <= port <= 65535:
            raise RuntimeError('AI_SERVICE_PORT must be between 1 and 65535.')
        if not ai_only:
            bot_env = service_env('discord-bot')
            if not bot_env.get('DISCORD_TOKEN'):
                raise RuntimeError('Set DISCORD_TOKEN in discord-bot/.env before starting the Bot.')
            if ai_env.get('ADMIN_WEB_TOKEN', '') != bot_env.get('ADMIN_WEB_TOKEN', ''):
                raise RuntimeError('ADMIN_WEB_TOKEN must match in ai-service/.env and discord-bot/.env.')
            bot_env.setdefault('AI_SERVICE_URL', f'http://127.0.0.1:{port}')
            target = urlparse(bot_env['AI_SERVICE_URL'])
            if target.hostname not in ('localhost', '127.0.0.1') or target.scheme != 'http' or (target.port or 80) != port or target.path not in ('', '/'):
                raise RuntimeError('AI_SERVICE_URL must point to the local AI_SERVICE_PORT (for example http://127.0.0.1:8000).')
        with socket.socket() as probe:
            try:
                probe.bind(('127.0.0.1', port))
            except OSError as error:
                raise RuntimeError(f'AI port {port} is unavailable. Stop the existing service or change both AI_SERVICE_PORT and AI_SERVICE_URL.') from error
        state = {'pid': os.getpid(), 'starttime': process_identity(os.getpid())}
        temporary = STATE.with_suffix('.tmp')
        temporary.write_text(json.dumps(state))
        temporary.replace(STATE)
        ai = launch('ai-service', [sys.executable, '-m', 'uvicorn', 'app.main:app',
                                  '--host', '127.0.0.1', '--port', str(port)], ai_env)
        opener = build_opener(ProxyHandler({}))
        deadline = time.monotonic() + 60
        while True:
            if stopping:
                return 0
            if ai.poll() is not None:
                raise RuntimeError('AI service exited before readiness. See data/logs/ai-service.log.')
            try:
                with opener.open(f'http://127.0.0.1:{port}/health', timeout=2) as response:
                    if response.status == 200 and json.loads(response.read(4096)).get('status') == 'ok':
                        break
            except (OSError, ValueError):
                pass
            if time.monotonic() >= deadline:
                raise RuntimeError('AI health check timed out. See data/logs/ai-service.log.')
            time.sleep(0.25)
        print('AI service health check passed. Model inference was checked during setup unless skipped.', flush=True)
        if not ai_only:
            launch('discord-bot', ['node', 'dist/index.js'], bot_env)
        print('Running in foreground. Press Ctrl+C or run bash startup/stop-bot.sh to stop both services.', flush=True)
        while not stopping:
            for child in children:
                if child.poll() is not None:
                    raise RuntimeError(f'A managed service exited (status {child.returncode}); stopping the other service. See data/logs.')
            time.sleep(0.25)
        return 0
    finally:
        for child in reversed(children):
            if child.poll() is None:
                try:
                    os.killpg(child.pid, signal.SIGTERM)
                except ProcessLookupError:
                    pass
        deadline = time.monotonic() + 10
        for child in reversed(children):
            try:
                child.wait(timeout=max(0.1, deadline - time.monotonic()))
            except subprocess.TimeoutExpired:
                try:
                    os.killpg(child.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                child.wait()
        for output in logfiles:
            output.close()
        # Only the supervisor holding the lock owns this state file.
        STATE.unlink(missing_ok=True)
        lock.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['start', 'stop'])
    parser.add_argument('--ai-only', action='store_true')
    args = parser.parse_args()
    try:
        return start(args.ai_only) if args.command == 'start' else stop()
    except (OSError, RuntimeError, ValueError) as error:
        print(f'ERROR: {error}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
