"""A chess clock for game controllers.
"""

import math
import time
from collections.abc import Callable, Generator, Hashable, Mapping
from contextlib import contextmanager
from typing import Generic, TypeVar

Player = TypeVar("Player", bound=Hashable)


class ChessClock(Generic[Player]):
    def __init__(
        self,
        budgets: Mapping[Player, float],
        *,
        increment: float = 0.0,
        now: Callable[[], float] = time.monotonic,
    ):
        """Budgets are seconds per player; math.inf means untimed.

        `increment` is Fischer-style: added after each completed move, so a
        player who moves quickly banks time. A player who flags gets nothing.
        """
        if not budgets:
            raise ValueError("a clock needs at least one player")
        for player, budget in budgets.items():
            if budget <= 0 or math.isnan(budget):
                raise ValueError(f"budget for {player!r} must be positive, got {budget!r}")
        if increment < 0 or math.isnan(increment):
            raise ValueError(f"increment must be non-negative, got {increment!r}")
        self._remaining: dict[Player, float] = dict(budgets)
        self._elapsed: dict[Player, float] = dict.fromkeys(budgets, 0.0)
        self._moves: dict[Player, int] = dict.fromkeys(budgets, 0)
        self._increment = increment
        self._now = now

    def remaining(self, player: Player) -> float:
        """Seconds left on the clock, 0.0 once flagged."""
        return self._require(player)

    def elapsed(self, player: Player) -> float:
        """Total wall time this player has held the turn, across all moves."""
        self._require(player)
        return self._elapsed[player]

    def moves(self, player: Player) -> int:
        self._require(player)
        return self._moves[player]

    def expired(self, player: Player) -> bool:
        return self._require(player) <= 0.0

    def flagged(self) -> Player | None:
        """The first player who has run out of time, if any."""
        return next((p for p, left in self._remaining.items() if left <= 0.0), None)

    @contextmanager
    def turn(self, player: Player) -> Generator[float | None, None, None]:
        """Run the clock for one turn, yielding the timeout to hand `exchange`.

        Time is charged in a finally, so a controller that raises mid-turn is
        still billed for the thinking it did before it blew up.
        """
        left = self._require(player)
        if left <= 0.0:
            yield 0.0
            return

        started = self._now()
        try:
            yield None if left == math.inf else left
        finally:
            spent = max(0.0, self._now() - started)
            self._elapsed[player] += spent
            self._moves[player] += 1
            if left != math.inf:
                self._remaining[player] = max(0.0, left - spent)
                if self._remaining[player] > 0.0:
                    self._remaining[player] += self._increment

    def _require(self, player: Player) -> float:
        try:
            return self._remaining[player]
        except KeyError:
            known = ", ".join(repr(p) for p in self._remaining)
            raise KeyError(f"{player!r} is not on this clock; players are: {known}") from None

    def __repr__(self) -> str:
        state = ", ".join(f"{p!r}={left:.3f}s" for p, left in self._remaining.items())
        return f"ChessClock({state})"
