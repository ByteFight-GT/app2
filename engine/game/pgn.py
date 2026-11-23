from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional, Tuple

from pydantic import BaseModel, Field

from .game_structs import Location, Player, Signal

"""
Replay record for one match.

Parallel arrays indexed by frame. Frame 0 is the empty starting board, frame i
is the state after turn i, so every array has turn_count + 1 entries. The
action fields at frame i describe the turn that produced that frame; at frame 0
they are empty.

Field and value names match the client renderer's GamePGN in gamerenderer
competitions/cs6601_fa2026/types.ts. Keep the two in sync.
"""

MapLoc = Location

# placed: survived the turn. hit_mine: landed on a mine.
# removed_by_mine: cleared by the other stone's blast.
# ignored_defuse_failure: never emitted, since a failed defuse still places
# the stones. Kept for the renderer.
# illegal: never emitted, since an illegal turn forfeits before it is recorded.
MoveOutcome = Literal["placed", "hit_mine", "removed_by_mine", "ignored_defuse_failure", "illegal"]

# Maps Board.apply_turn's outcome names to the renderer's.
_OUTCOME = {
    "placed": "placed",
    "detonated": "hit_mine",
    "destroyed": "removed_by_mine",
}

DefuseOutcome = Literal["not_attempted", "success", "failure"]

GameWinner = Literal["BLACK_WIN", "WHITE_WIN", "DRAW", "INCOMPLETE"]
GameWinnerReason = Literal["CONNECT_SIX", "TURN_LIMIT", "TIME", "ILLEGAL_MOVE", "ERROR", "UNKNOWN"]

# Maps MatchStatus values and GomokuResult reasons to the renderer's.
# Player A is always black.
_WINNER = {"team_a_win": "BLACK_WIN", "team_b_win": "WHITE_WIN", "draw": "DRAW"}
_REASON = {
    "connect6": "CONNECT_SIX",
    "turn_limit": "TURN_LIMIT",
    "timeout": "TIME",
    "illegal_move": "ILLEGAL_MOVE",
    "invalid_or_missing_action": "ERROR",
}


class MoveResolution(BaseModel):
    loc: MapLoc
    outcome: MoveOutcome


class MineTrigger(BaseModel):
    loc: MapLoc
    # Every on-board cell in the blast square, including the mine's own.
    explosion_cells: List[MapLoc]


class RemovedStone(BaseModel):
    loc: MapLoc
    player: Player


class DetectorSignalRecord(BaseModel):
    loc: MapLoc
    signal: Signal


class GamePGN(BaseModel):
    turn_player: List[Optional[Player]] = Field(default_factory=list)
    moves: List[List[MapLoc]] = Field(default_factory=list)
    move_outcomes: List[List[MoveResolution]] = Field(default_factory=list)
    defuse_attempts: List[Optional[MapLoc]] = Field(default_factory=list)
    defuse_results: List[DefuseOutcome] = Field(default_factory=list)
    # Always empty since defuses no longer place stones. Kept for the renderer.
    random_stones: List[List[MapLoc]] = Field(default_factory=list)
    triggered_mines: List[List[MineTrigger]] = Field(default_factory=list)
    removed_stones: List[List[RemovedStone]] = Field(default_factory=list)
    detector_signals: List[List[DetectorSignalRecord]] = Field(default_factory=list)
    revealed_mines: List[List[MapLoc]] = Field(default_factory=list)
    # Every mine at the start of the game. Static, not indexed by frame.
    all_mines: List[MapLoc] = Field(default_factory=list)
    winning_lines: List[Optional[Tuple[MapLoc, MapLoc]]] = Field(default_factory=list)

    black_time_left: List[float] = Field(default_factory=list)
    white_time_left: List[float] = Field(default_factory=list)
    black_turns_remaining: List[int] = Field(default_factory=list)
    white_turns_remaining: List[int] = Field(default_factory=list)
    black_stone_count: List[int] = Field(default_factory=list)
    white_stone_count: List[int] = Field(default_factory=list)

    turn_count: int = 0
    result: GameWinner = "INCOMPLETE"
    reason: GameWinnerReason = "UNKNOWN"
    errlog_black: str = ""
    errlog_white: str = ""

    def frame(self, index: int) -> Dict[str, Any]:
        """Every per-frame field at `index`, as JSON-ready values."""
        return {name: value[index] for name, value in self.model_dump(mode="json", include=PER_FRAME_FIELDS).items()}


# The parallel arrays, i.e. every field with one entry per frame.
PER_FRAME_FIELDS = frozenset(
    name for name, f in GamePGN.model_fields.items() if f.default_factory is list and name != "all_mines"
)


class PGNRecorder:
    """Builds a GamePGN as the controller plays. Frame 0 is recorded on init."""

    def __init__(self, board, clock):
        self.pgn = GamePGN(all_mines=sorted(board.mines))
        self._append_state(board, clock)
        self.pgn.turn_player.append(None)
        self.pgn.moves.append([])
        self.pgn.move_outcomes.append([])
        self.pgn.defuse_attempts.append(None)
        self.pgn.defuse_results.append("not_attempted")
        self.pgn.random_stones.append([])
        self.pgn.triggered_mines.append([])
        self.pgn.removed_stones.append([])
        self.pgn.detector_signals.append([])
        self.pgn.revealed_mines.append([])
        self.pgn.winning_lines.append(None)

    def _append_state(self, board, clock) -> None:
        p = self.pgn
        p.black_time_left.append(clock.remaining("black"))
        p.white_time_left.append(clock.remaining("white"))
        p.black_turns_remaining.append(board.turns_remaining("black"))
        p.white_turns_remaining.append(board.turns_remaining("white"))
        p.black_stone_count.append(board.stone_count("black"))
        p.white_stone_count.append(board.stone_count("white"))

    def record_turn(self, board, clock, player, action, record, signals, winning_line) -> None:
        """Append the frame produced by `player`'s completed turn.

        `signals` is what the player was shown at the start of this turn, about
        the stones they placed on their previous one.
        """
        p = self.pgn
        self._append_state(board, clock)
        p.turn_player.append(player)
        p.moves.append(list(record.moves))
        p.move_outcomes.append(
            [MoveResolution(loc=loc, outcome=_OUTCOME[o]) for loc, o in zip(record.moves, record.move_outcomes)]
        )
        p.defuse_attempts.append(action.defuse)
        if not record.defuse_attempted:
            p.defuse_results.append("not_attempted")
        else:
            p.defuse_results.append("success" if record.defuse_success else "failure")
        p.random_stones.append([])
        p.triggered_mines.append(
            [MineTrigger(loc=loc, explosion_cells=board.blast_cells(loc)) for loc in record.triggered_mines]
        )
        p.removed_stones.append([RemovedStone(loc=loc, player=player) for loc in record.removed_stones])
        p.detector_signals.append(
            [DetectorSignalRecord(loc=s.loc, signal=s.signal) for s in signals if s.loc is not None and s.signal is not None]
        )
        p.revealed_mines.append([record.revealed_mine] if record.revealed_mine is not None else [])
        p.winning_lines.append(winning_line)
        p.turn_count = board.turn_index

    def finish(self, status, reason, errlog_black="", errlog_white="") -> GamePGN:
        """`status` is a MatchStatus value and `reason` a GomokuResult reason."""
        self.pgn.result = _WINNER.get(status, "INCOMPLETE")
        self.pgn.reason = _REASON.get(reason, "UNKNOWN")
        self.pgn.errlog_black = errlog_black
        self.pgn.errlog_white = errlog_white
        return self.pgn
