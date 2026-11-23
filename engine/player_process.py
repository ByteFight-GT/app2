from __future__ import annotations

import importlib
import inspect
import os
import queue
import subprocess
import sys
import threading
from pathlib import Path
from typing import List, Optional

from bytefight_core import (PlayerController, PlayerHandle,
                            isolate_protocol_stream, run_agent)

"""
Runs each bot in its own process so a hung or crashing bot can't stall the
match, and the time limit is enforced.

Parent: SubprocessPlayerHandle sends one JSON GameState per line and reads one
JSON Action per line. Replies are read on a thread because select() only works
on sockets on Windows.

Child: `python player_process.py <bot_dir>` imports the top-level .py files in
<bot_dir> that mention PlayerController, and serves the one PlayerController
subclass they define over stdio. The file can have any name. Bot prints go to
stderr, which the parent forwards to the client console tagged with the
player's colour.
"""

_HERE = Path(__file__).resolve().parent
CONTROLLER_MARKER = "PlayerController"


def controller_files(bot_dir: Path) -> List[Path]:
    """Top-level .py files in bot_dir that mention PlayerController.

    A text check, so the server can validate a bot folder without importing it
    and the child only imports files that might hold the controller.
    """
    files = []
    for path in sorted(bot_dir.glob("*.py")):
        try:
            if CONTROLLER_MARKER in path.read_text(encoding="utf-8", errors="replace"):
                files.append(path)
        except OSError:
            continue
    return files


class SubprocessPlayerHandle(PlayerHandle):
    """A PlayerHandle backed by a child process running one bot."""

    def __init__(self, bot_dir: Path, label: str, action_type):
        self._label = label
        self._action_type = action_type
        env = {**os.environ, "PYTHONIOENCODING": "utf-8", "PYTHONUNBUFFERED": "1"}
        self._proc = subprocess.Popen(
            [sys.executable, str(_HERE / "player_process.py"), str(bot_dir)],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            bufsize=1,
            cwd=str(bot_dir),
            env=env,
        )
        self._replies: "queue.Queue[Optional[str]]" = queue.Queue()
        threading.Thread(target=self._read_replies, daemon=True).start()
        threading.Thread(target=self._forward_output, daemon=True).start()

    def _read_replies(self) -> None:
        for line in self._proc.stdout:
            self._replies.put(line)
        self._replies.put(None)  # EOF: the bot exited

    def _forward_output(self) -> None:
        for line in self._proc.stderr:
            print(f"[{self._label}] {line}", end="", flush=True)

    def exchange(self, obs, *, timeout: Optional[float] = None):
        try:
            self._proc.stdin.write(obs.model_dump_json() + "\n")
            self._proc.stdin.flush()
        except (OSError, ValueError):
            return None
        try:
            line = self._replies.get(timeout=timeout)
        except queue.Empty:
            return None
        if line is None:
            return None
        try:
            return self._action_type.model_validate_json(line)
        except ValueError:
            return None

    def kill(self) -> None:
        """Kill the bot without waiting for it to exit."""
        if self._proc.poll() is None:
            self._proc.kill()

    def close(self) -> None:
        self.kill()
        self._proc.wait()


def _find_controller(modules) -> type:
    # Only classes defined in the bot's own files count, so a controller one
    # file imports from another isn't found twice.
    chosen: List[type] = [
        obj
        for module in modules
        for obj in vars(module).values()
        if inspect.isclass(obj)
        and issubclass(obj, PlayerController)
        and obj is not PlayerController
        and not inspect.isabstract(obj)
        and obj.__module__ == module.__name__
    ]
    if len(chosen) != 1:
        names = ", ".join(f"{c.__module__}.{c.__name__}" for c in chosen) or "none"
        raise SystemExit(f"bot must define exactly one PlayerController subclass (found: {names})")
    return chosen[0]


def _serve(bot_dir: Path) -> None:
    # Done before the import so import time prints also go to stderr.
    protocol_out = isolate_protocol_stream()

    # Bots are imported as packages like the old engine did, so relative imports
    # work. The bot directory is also added for files imported by name. The
    # engine directory stays first, so the copy of game/ that ships in the
    # student zip can't shadow the engine's own.
    sys.path[1:1] = [str(bot_dir.parent), str(bot_dir)]
    modules = [
        importlib.import_module(bot_dir.name if path.stem == "__init__" else f"{bot_dir.name}.{path.stem}")
        for path in controller_files(bot_dir)
    ]

    run_agent(_find_controller(modules)(), stdout=protocol_out)


if __name__ == "__main__":
    _serve(Path(sys.argv[1]).resolve())
