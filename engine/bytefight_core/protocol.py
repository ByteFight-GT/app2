import os
import select
import sys
from typing import IO, Any, get_args, get_origin

from bytefight_core.interface import (Action, Obs, PlayerController,
                                      PlayerHandle)
from pydantic import BaseModel


def model_args(
    controller: PlayerController[Action, Obs] | type[PlayerController[Action, Obs]],
) -> tuple[type[Any], type[Any]]:
    cls = controller if isinstance(controller, type) else type(controller)
    for klass in cls.__mro__:
        for base in getattr(klass, "__orig_bases__", ()):
            if get_origin(base) is PlayerController:
                args = get_args(base)
                if len(args) == 2 and all(
                    isinstance(a, type) and issubclass(a, BaseModel) for a in args
                ):
                    return args  # type: ignore[return-value]
    raise TypeError(
        f"{cls.__name__} must subclass "
        "PlayerController[YourAction, YourObs] with concrete pydantic models so the "
        "protocol knows how to parse observations"
    )


class StdioPlayerHandle(PlayerHandle[Action, Obs]):
    def __init__(
        self,
        stdin: IO[str],
        stdout: IO[str],
        action_type: type[Action],
    ):
        self._stdin = stdin
        self._stdout = stdout
        self._action_type = action_type

    def exchange(self, obs: Obs, *, timeout: float | None = None) -> Action | None:
        try:
            self._stdin.write(obs.model_dump_json() + "\n")
            self._stdin.flush()
            if timeout is not None:
                ready, _, _ = select.select([self._stdout], [], [], timeout)
                if not ready:
                    return None
            line = self._stdout.readline()
            if not line:
                return None
            return self._action_type.model_validate_json(line)
        except (OSError, ValueError):
            return None

    def close(self) -> None:
        self._stdin.close()
        self._stdout.close()


def serve_stdio(
    controller: PlayerController[Action, Obs],
    stdin: IO[str],
    stdout: IO[str],
    obs_type: type[Obs] | None = None,
) -> None:
    model = obs_type if obs_type is not None else model_args(controller)[1]
    for line in stdin:
        obs = model.model_validate_json(line)
        action = controller.play(obs)
        stdout.write(action.model_dump_json() + "\n")
        stdout.flush()


def isolate_protocol_stream() -> IO[str]:
    sys.stdout.flush()
    protocol_out = os.fdopen(os.dup(1), "w", buffering=1)
    os.dup2(2, 1)
    sys.stdout = sys.stderr
    return protocol_out


def run_agent(
    controller: PlayerController[Action, Obs],
    *,
    stdin: IO[str] | None = None,
    stdout: IO[str] | None = None,
    obs_type: type[Obs] | None = None,
) -> None:
    protocol_out = stdout if stdout is not None else isolate_protocol_stream()
    serve_stdio(controller, stdin or sys.stdin, protocol_out, obs_type)
