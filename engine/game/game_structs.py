from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, Field

from .game_constants import GameConstants

"""
Shared types for the gomoku (Connect-6 Mines) game, including the Pydantic
models that cross the PlayerHandle boundary (GameState in, Action out). It
has no bytefight_core imports so board.py stays usable on its own, as in
bf2027/game/outcome.py.
"""

Player = Literal["black", "white"]
Signal = Literal["low", "medium", "high", "none"]

Coordinate = Annotated[int, Field(ge=0, lt=GameConstants.BOARD_SIZE)]
# (row, col), with (0, 0) the upper-left corner.
Location = tuple[Coordinate, Coordinate]

# board[row][col] is the cell at (row, col): 0 empty, 1 white stone, 2 black stone.
Cell = Literal[0, 1, 2]
Row = Annotated[list[Cell], Field(min_length=GameConstants.BOARD_SIZE, max_length=GameConstants.BOARD_SIZE)]
Grid = Annotated[list[Row], Field(min_length=GameConstants.BOARD_SIZE, max_length=GameConstants.BOARD_SIZE)]


def opponent_of(player: Player) -> Player:
    return "white" if player == "black" else "black"


class SignalReading(BaseModel):
    """
    Detector reading for one chosen-move stone from your *previous* turn.
    loc/signal are both None when there's nothing to report (no previous
    turn, or your last turn was a failed defuse). signal "none" means that
    specific placement did not survive the turn.
    """

    loc: Location | None
    signal: Signal | None


class StoneCounts(BaseModel):
    black: int
    white: int


class GameState(BaseModel):
    """Observation sent to the player about to move."""

    board: Grid
    you: Player
    opponent: Player
    # 1-indexed turn about to be played (global count).
    turn_number: int
    # Your own turns left, out of MAX_TURNS_PER_PLAYER, including this one.
    turns_remaining: int
    opponent_turns_remaining: int
    # Remaining wall-clock seconds.
    time_left: float
    opponent_time_left: float
    # Publicly known (successfully defused) mine locations.
    revealed_mines: list[Location]
    stone_counts: StoneCounts
    # Always length 2: the chosen-move stones from your previous turn, not
    # bonus stones from a defuse.
    last_signals: Annotated[list[SignalReading], Field(min_length=2, max_length=2)]


class Action(BaseModel):
    """
    One full turn: an optional defuse attempt, then the stones to place.
    moves has length 1 on black's very first turn, else length 2.
    """

    defuse: Location | None = None
    moves: Annotated[list[Location], Field(min_length=1, max_length=2)]
