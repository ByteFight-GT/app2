from __future__ import annotations

import importlib
import importlib.machinery
import importlib.util
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

Child: `python player_process.py <bot_path>` loads the bot and serves the one
PlayerController subclass it defines over stdio. A bot is either a folder
(its top-level .py files that mention PlayerController are imported; they can
have any name) or a single .py file that mentions it. Bot prints go to
stderr, which the parent forwards to the client console tagged with the
player's colour.
"""

_HERE = Path(__file__).resolve().parent
CONTROLLER_MARKER = "PlayerController"


def _mentions_controller(path: Path) -> bool:
    try:
        return CONTROLLER_MARKER in path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return False


def controller_files(bot_path: Path) -> List[Path]:
    """The .py files of a bot that mention PlayerController.

    For a folder bot, its top-level .py files; for a single-file bot, the file
    itself. A text check, so the server can validate a bot without importing it
    and the child only imports files that might hold the controller.
    """
    if bot_path.is_file():
        return [bot_path] if bot_path.suffix == ".py" and _mentions_controller(bot_path) else []
    return [path for path in sorted(bot_path.glob("*.py")) if _mentions_controller(path)]


class SubprocessPlayerHandle(PlayerHandle):
    """A PlayerHandle backed by a child process running one bot."""

    def __init__(self, bot_path: Path, label: str, action_type):
        self._label = label
        self._action_type = action_type
        env = {**os.environ, "PYTHONIOENCODING": "utf-8", "PYTHONUNBUFFERED": "1"}
        self._proc = subprocess.Popen(
            [sys.executable, str(_HERE / "player_process.py"), str(bot_path)],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            bufsize=1,
            # a single-file bot has no folder of its own, so it runs in the bots folder
            cwd=str(bot_path if bot_path.is_dir() else bot_path.parent),
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


def _exec_module(name: str, spec) -> object:
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module  # before exec, so dataclasses/typing can find it
    spec.loader.exec_module(module)
    return module


def _load_bot(bot_path: Path) -> list:
    """Imports the bot's controller files and returns their modules.

    The bots folder is never put on sys.path: a bot file there named e.g.
    random.py would otherwise shadow the stdlib for every other bot.
    """
    files = controller_files(bot_path)
    if not files:
        raise SystemExit(f"no .py file mentioning {CONTROLLER_MARKER} found at {bot_path}")

    if bot_path.is_file():
        # fixed prefix so a file named e.g. random.py doesn't register itself as `random`
        name = f"bytefight_bot_{bot_path.stem}"
        return [_exec_module(name, importlib.util.spec_from_file_location(name, bot_path))]

    # Folder bots are loaded as a package named after the folder, like the old
    # engine did, so relative imports work. The folder itself goes on sys.path
    # for files imported by name. The engine directory stays first, so the copy
    # of game/ that ships in the student zip can't shadow the engine's own.
    name = bot_path.name
    sys.path.insert(1, str(bot_path))
    init = bot_path / "__init__.py"
    if init.exists():
        spec = importlib.util.spec_from_file_location(name, init, submodule_search_locations=[str(bot_path)])
        package = _exec_module(name, spec)
    else:
        spec = importlib.machinery.ModuleSpec(name, None, is_package=True)
        spec.submodule_search_locations = [str(bot_path)]
        package = importlib.util.module_from_spec(spec)
        sys.modules[name] = package

    return [package if path == init else importlib.import_module(f"{name}.{path.stem}") for path in files]


def _serve(bot_path: Path) -> None:
    # Done before the import so import time prints also go to stderr.
    protocol_out = isolate_protocol_stream()
    run_agent(_find_controller(_load_bot(bot_path))(), stdout=protocol_out)


if __name__ == "__main__":
    _serve(Path(sys.argv[1]).resolve())
