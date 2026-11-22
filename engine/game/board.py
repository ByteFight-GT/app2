from __future__ import annotations

import math
import random
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Set, Tuple

from .game_constants import GameConstants
from .game_structs import Location, Player

"""
Game world state for Connect-6 Mines: a 16x16 stone grid plus 20 hidden
mines. Only the engine uses it. Players see the GameState snapshot built by
obs_codec.py, the same boundary as bf2027/game/board.py.
"""

# (row, col) steps: across, down, down-right, up-right.
_DIRECTIONS = [(0, 1), (1, 0), (1, 1), (-1, 1)]
_CHAR: Dict[Player, str] = {"black": "B", "white": "W"}


@dataclass
class TurnRecord:
    """
    What the acting player needs, next time it's their turn, to generate
    detector signals for their *previous* turn's chosen-move stones.

    mines_snapshot is the hidden-mine layout as it stood immediately before
    this turn's own placements: signal strength is computed against that
    snapshot even if the mine it reflects was triggered later in the same
    turn (per the spec, this is not a bug).
    """

    signals_data: List[Tuple[Location, bool]] = field(default_factory=list)  # (loc, exploded)
    defuse_attempted: bool = False
    defuse_success: Optional[bool] = None
    mines_snapshot: frozenset = frozenset()

    # Replay data, consumed by pgn.py.
    moves: List[Location] = field(default_factory=list)
    move_outcomes: List[str] = field(default_factory=list)  # one MoveResolution per move
    triggered_mines: List[Location] = field(default_factory=list)
    removed_stones: List[Location] = field(default_factory=list)  # cleared by a blast
    revealed_mine: Optional[Location] = None


class Board:
    def __init__(
        self,
        size: int = GameConstants.BOARD_SIZE,
        num_mines: int = GameConstants.NUM_MINES,
        mines: Optional[Set[Location]] = None,
        rng: Optional[random.Random] = None,
    ):
        self.size = size
        self._rng = rng if rng is not None else random.Random()
        self.grid: List[List[str]] = [["." for _ in range(size)] for _ in range(size)]
        self.mines: Set[Location] = set(mines) if mines is not None else self._random_mines(num_mines)
        self.revealed_mines: Set[Location] = set()
        self.turn_index: int = 0  # total completed turns, 0..MAX_TURNS_PER_PLAYER * 2
        self.turns_taken: Dict[Player, int] = {"black": 0, "white": 0}
        # A successful defuse gives that player DEFUSE_BONUS_STONES extra
        # stones next turn.
        self.extra_move: Dict[Player, bool] = {"black": False, "white": False}

    # --- setup ---

    def _random_mines(self, num_mines: int) -> Set[Location]:
        cells = [(r, c) for r in range(self.size) for c in range(self.size)]
        return set(self._rng.sample(cells, num_mines))

    # --- geometry ---

    def in_bounds(self, loc: Location) -> bool:
        r, c = loc
        return 0 <= r < self.size and 0 <= c < self.size

    def is_empty(self, loc: Location) -> bool:
        r, c = loc
        return self.grid[r][c] == "."

    def blast_cells(self, mine: Location) -> List[Location]:
        mr, mc = mine
        radius = GameConstants.BLAST_RADIUS
        return [
            (r, c)
            for r in range(mr - radius, mr + radius + 1)
            for c in range(mc - radius, mc + radius + 1)
            if self.in_bounds((r, c))
        ]

    def _detector_cells(self, loc: Location) -> List[Location]:
        lr, lc = loc
        thresh = GameConstants.DETECTOR_RADIUS_SQ
        reach = math.isqrt(thresh)
        return [
            (r, c)
            for r in range(lr - reach, lr + reach + 1)
            for c in range(lc - reach, lc + reach + 1)
            if (r - lr) ** 2 + (c - lc) ** 2 <= thresh
        ]

    # --- turn bookkeeping ---

    def current_player(self) -> Player:
        return "black" if self.turn_index % 2 == 0 else "white"

    def required_move_count(self, player: Optional[Player] = None) -> int:
        """Stones `player` (default: the side to move) must place on their next turn."""
        player = player or self.current_player()
        if player == "black" and self.turns_taken["black"] == 0:
            return 1
        return 2 + GameConstants.DEFUSE_BONUS_STONES if self.extra_move[player] else 2

    def is_over(self) -> bool:
        return self.turn_index >= GameConstants.MAX_TURNS_PER_PLAYER * 2

    def turns_remaining(self, player: Player) -> int:
        return GameConstants.MAX_TURNS_PER_PLAYER - self.turns_taken[player]

    def stone_count(self, player: Player) -> int:
        target = _CHAR[player]
        return sum(row.count(target) for row in self.grid)

    # --- turn application ---

    def _validate_moves(self, moves: List[Location]) -> bool:
        if len(moves) != self.required_move_count():
            return False
        if len(set(moves)) != len(moves):
            return False
        return all(self.in_bounds(m) and self.is_empty(m) for m in moves)

    def _place_and_resolve(
        self, player: Player, moves: List[Location]
    ) -> Tuple[List[str], List[Location], List[Location]]:
        """Place `moves` for `player`, then resolve any mines they triggered.

        Returns (outcome per move, mines triggered, stones cleared by the
        blasts). A move outcome is "detonated" if it landed on a mine,
        "destroyed" if the other move's blast took it, else "placed".
        """
        char = _CHAR[player]
        for r, c in moves:
            self.grid[r][c] = char

        triggered = [m for m in moves if m in self.mines]
        if not triggered:
            return ["placed"] * len(moves), [], []

        blast_cells: Set[Location] = set()
        for mine in triggered:
            blast_cells.update(self.blast_cells(mine))
            self.mines.discard(mine)

        removed = sorted(loc for loc in blast_cells if self.grid[loc[0]][loc[1]] == char)
        for r, c in removed:
            self.grid[r][c] = "."

        outcomes = [
            "detonated" if m in triggered else "destroyed" if m in blast_cells else "placed"
            for m in moves
        ]
        return outcomes, triggered, removed

    def apply_turn(
        self, player: Player, defuse: Optional[Location], moves: List[Location]
    ) -> Optional[TurnRecord]:
        """
        Apply one full turn (optional defuse attempt, then the resulting
        placements) and end it. Returns a TurnRecord on success, or None if
        the turn was illegal (a defuse/move target was off-board or already
        occupied, or move targets weren't distinct). The caller treats that as
        an instant forfeit, per the "empty cells or forfeit" rule.
        """
        mines_snapshot = frozenset(self.mines)

        if defuse is not None:
            if not self.in_bounds(defuse) or not self.is_empty(defuse):
                return None

            if defuse in self.mines:
                self.mines.discard(defuse)
                self.revealed_mines.add(defuse)

                if not self._validate_moves(moves):
                    return None
                outcomes, triggered, removed = self._place_and_resolve(player, moves)
                record = TurnRecord(
                    signals_data=[(m, o != "placed") for m, o in zip(moves, outcomes)],
                    defuse_attempted=True,
                    defuse_success=True,
                    mines_snapshot=mines_snapshot,
                    moves=list(moves),
                    move_outcomes=outcomes,
                    triggered_mines=triggered,
                    removed_stones=removed,
                    revealed_mine=defuse,
                )
            else:
                # Failed defuse: the turn ends immediately, moves are ignored
                # (even if they would have been illegal), no signals result.
                record = TurnRecord(
                    defuse_attempted=True,
                    defuse_success=False,
                    mines_snapshot=mines_snapshot,
                    moves=list(moves),
                    move_outcomes=["skipped"] * len(moves),
                )
        else:
            if not self._validate_moves(moves):
                return None
            outcomes, triggered, removed = self._place_and_resolve(player, moves)
            record = TurnRecord(
                signals_data=[(m, o != "placed") for m, o in zip(moves, outcomes)],
                mines_snapshot=mines_snapshot,
                moves=list(moves),
                move_outcomes=outcomes,
                triggered_mines=triggered,
                removed_stones=removed,
            )

        # The extra move lasts one turn, so only a successful defuse sets it.
        self.extra_move[player] = bool(record.defuse_success)
        self.turn_index += 1
        self.turns_taken[player] += 1
        return record

    # --- win / signal helpers ---

    def winning_line(self, player: Player) -> Optional[Tuple[Location, Location]]:
        """Endpoints of `player`'s first run of WIN_LENGTH or more, else None."""
        char = _CHAR[player]
        n = self.size
        for r in range(n):
            for c in range(n):
                if self.grid[r][c] != char:
                    continue
                for dr, dc in _DIRECTIONS:
                    pr, pc = r - dr, c - dc
                    if self.in_bounds((pr, pc)) and self.grid[pr][pc] == char:
                        continue  # not the start of a run in this direction
                    length = 0
                    cr, cc = r, c
                    while self.in_bounds((cr, cc)) and self.grid[cr][cc] == char:
                        length += 1
                        cr += dr
                        cc += dc
                    if length >= GameConstants.WIN_LENGTH:
                        return ((r, c), (r + dr * (length - 1), c + dc * (length - 1)))
        return None

    def check_win(self, player: Player) -> bool:
        return self.winning_line(player) is not None

    def detector_category(self, loc: Location, mines_snapshot: frozenset) -> str:
        count = sum(1 for c in self._detector_cells(loc) if c in mines_snapshot)
        if count <= GameConstants.LOW_MAX:
            return "low"
        if count <= GameConstants.MEDIUM_MAX:
            return "medium"
        return "high"

    def noisy_signal(self, true_category: str) -> str:
        weights = GameConstants.NOISE_MATRIX[true_category]
        categories = list(weights.keys())
        return self._rng.choices(categories, weights=list(weights.values()), k=1)[0]
