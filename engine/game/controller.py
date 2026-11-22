from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Dict, Optional

from bytefight_core import (ChessClock, GameController, GameResult,
                            GameResultFile, MatchStatus, PlayerHandle)

from .board import Board, TurnRecord
from .game_constants import GameConstants
from .game_structs import Action, GameState, Player, opponent_of
from .obs_codec import encode_obs
from .pgn import GamePGN, PGNRecorder

_STATUS_FOR: Dict[Player, MatchStatus] = {"black": MatchStatus.PLAYER_A_WIN, "white": MatchStatus.PLAYER_B_WIN}


@dataclass
class GomokuResult(GameResult):
    """GameResult plus why and when the game ended, like bf2027's MoleGameResult."""

    reason: str = ""
    turn_index: int = 0


class GomokuController(GameController[Action, GameState]):
    """
    bytefight_core.GameController implementation for Connect-6 Mines.

    Owns exactly one match: two PlayerHandles, a Board, and a ChessClock.
    play() runs the turn loop (prompt, apply, check win, check turn limit)
    until a result is reached. Follows the Connect4Controller pattern: the
    PlayerHandle validates the Action's *shape* (it's a Pydantic model), and
    Board.apply_turn its legality, so the same logic runs for
    LocalPlayerHandle, StdioPlayerHandle, or ContainerPlayerHandle alike.
    """

    def __init__(
        self,
        player_a: PlayerHandle[Action, GameState],
        player_b: PlayerHandle[Action, GameState],
        board: Optional[Board] = None,
        constants: Optional[GameConstants] = None,
        on_turn: Optional[Callable[[Board], None]] = None,
        pgn_path: Optional[Path] = None,
        on_frame: Optional[Callable[[int, Dict[str, Any]], None]] = None,
    ):
        self._players: Dict[Player, PlayerHandle[Action, GameState]] = {"black": player_a, "white": player_b}
        self.board = board if board is not None else Board()
        self.constants = constants or GameConstants()
        self._on_turn = on_turn
        self._pgn_path = pgn_path
        # Called with (index, GamePGN.frame(index)) for every frame, starting
        # with frame 0, so callers can stream the replay.
        self._on_frame = on_frame
        self._clock: ChessClock[Player] = ChessClock({
            "black": self.constants.PLAY_TIME_LIMIT,
            "white": self.constants.PLAY_TIME_LIMIT,
        })
        self._last_record: Dict[Player, Optional[TurnRecord]] = {"black": None, "white": None}
        self._recorder = PGNRecorder(self.board, self._clock)
        # Holds the forfeit reason. Agent stderr would be better, but the runner
        # spawns agents without a log_path and drops it.
        self._errlog: Dict[Player, str] = {"black": "", "white": ""}

    @property
    def pgn(self) -> GamePGN:
        """The replay record. Complete once play() returns."""
        return self._recorder.pgn

    @property
    def clock(self) -> ChessClock[Player]:
        return self._clock

    def _forfeit(self, loser: Player, reason: str) -> GomokuResult:
        self._errlog[loser] = reason
        return self._result(_STATUS_FOR[opponent_of(loser)], reason)

    def _win(self, player: Player) -> GomokuResult:
        return self._result(_STATUS_FOR[player], "connect6")

    def _tiebreak(self) -> GomokuResult:
        black_stones = self.board.stone_count("black")
        white_stones = self.board.stone_count("white")
        if black_stones > white_stones:
            status = MatchStatus.PLAYER_A_WIN
        elif white_stones > black_stones:
            status = MatchStatus.PLAYER_B_WIN
        else:
            status = MatchStatus.DRAW
        return self._result(status, "turn_limit")

    def _result(self, status: MatchStatus, reason: str) -> GomokuResult:
        self._recorder.finish(status.value, reason, self._errlog["black"], self._errlog["white"])
        files = []
        if self._pgn_path is not None:
            self._pgn_path.write_text(self.pgn.model_dump_json())
            files.append(GameResultFile(path=self._pgn_path, slug="pgn", visibility="public"))
        return GomokuResult(status=status, files=files, reason=reason, turn_index=self.board.turn_index)

    def get_game_state(self, player: Player) -> GameState:
        return encode_obs(
            self.board,
            player,
            self._last_record[player],
            self._clock.remaining(player),
            self._clock.remaining(opponent_of(player)),
        )

    def _emit_frame(self) -> None:
        if self._on_frame:
            index = self.pgn.turn_count
            self._on_frame(index, self.pgn.frame(index))

    def play(self) -> GameResult:
        self._emit_frame()
        while True:
            player = self.board.current_player()
            if self._clock.expired(player):
                return self._forfeit(player, "timeout")

            obs = self.get_game_state(player)
            with self._clock.turn(player) as remaining:
                action = self._players[player].exchange(obs, timeout=remaining)

            if self._clock.expired(player):
                return self._forfeit(player, "timeout")
            if action is None:
                return self._forfeit(player, "invalid_or_missing_action")

            record = self.board.apply_turn(player, action.defuse, action.moves)
            if record is None:
                return self._forfeit(player, "illegal_move")
            self._last_record[player] = record

            line = self.board.winning_line(player)
            self._recorder.record_turn(
                self.board, self._clock, player, action, record, obs.last_signals, line
            )
            self._emit_frame()

            if self._on_turn:
                self._on_turn(self.board)

            if line is not None:
                return self._win(player)

            if self.board.is_over():
                return self._tiebreak()

    def validate(self) -> GameResult:
        limit = self.constants.VALIDATE_TIME_LIMIT
        obs = encode_obs(self.board, "black", None, limit, limit)
        action = self._players["black"].exchange(obs, timeout=limit)
        valid = action is not None and len(action.moves) == self.board.required_move_count()
        status = MatchStatus.SUBMISSION_VALID if valid else MatchStatus.SUBMISSION_INVALID
        return GameResult(status=status)
