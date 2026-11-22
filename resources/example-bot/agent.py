from __future__ import annotations

import random

from bytefight_core import PlayerController
from game import Action, GameState


class SampleGomokuAgent(PlayerController[Action, GameState]):
    """
    You may add functions, however, __init__ and play are the entry points
    for your program and should not be renamed.
    """

    def __init__(self) -> None:
        # Controllers are constructed once and live for the whole match, so
        # this is where any state you want to carry between turns goes.
        return

    def play(self, obs: GameState) -> Action:
        """Called every turn. Return one Action (see game/game_structs.py)."""
        board = obs.board
        size = len(board)
        required = obs.moves_required

        empties = [(r, c) for r in range(size) for c in range(size) if board[r][c] == 0]
        random.shuffle(empties)

        return Action(defuse=None, moves=empties[:required])
