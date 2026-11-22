from importlib.metadata import version

from bytefight_core.clock import ChessClock
from bytefight_core.interface import (Action, GameController, GameResult,
                                      GameResultFile, MatchStatus, Obs,
                                      PlayerController, PlayerHandle)
from bytefight_core.local import LocalPlayerHandle
from bytefight_core.protocol import (StdioPlayerHandle,
                                     isolate_protocol_stream, model_args,
                                     run_agent, serve_stdio)

__all__ = [
    "Action",
    "ChessClock",
    "Obs",
    "MatchStatus",
    "GameResult",
    "GameResultFile",
    "PlayerController",
    "PlayerHandle",
    "GameController",
    "LocalPlayerHandle",
    "StdioPlayerHandle",
    "serve_stdio",
    "run_agent",
    "isolate_protocol_stream",
    "model_args",
]

__version__ = "0.1.1"
