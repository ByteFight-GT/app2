from __future__ import annotations

import random

from bytefight_core import PlayerController
from game.game_structs import Action, GameState

"""
Reference bot for Connect-6 Mines. Never attempts a defuse; just drops its
required number of stones (1 on black's very first turn, 2 otherwise) on
random empty cells. obs.board[row][col] is the cell at (row, col): 0 empty,
1 white, 2 black. See game/obs_codec.py for the full observation/action
shapes, including detector signals ("last_signals") and revealed mines.
"""


class SampleGomokuAgent(PlayerController[Action, GameState]):
    def play(self, obs: GameState) -> Action:
        board = obs.board
        size = len(board)
        required = 1 if obs.turn_number == 1 else 2

        empties = [(r, c) for r in range(size) for c in range(size) if board[r][c] == 0]
        random.shuffle(empties)
        moves = [list(loc) for loc in empties[:required]]

        return Action(defuse=None, moves=moves)
