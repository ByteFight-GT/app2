from __future__ import annotations

from typing import List, Optional

from .board import Board, TurnRecord
from .game_structs import GameState, Player, SignalReading, StoneCounts, opponent_of

"""
The ONLY place that knows how to translate the live Board (engine-side only)
into the GameState model that crosses the PlayerHandle boundary. See
bf2027/game/obs_codec.py for the same rule in this codebase. The reverse
direction needs no codec: Action is a Pydantic model, so shape validation
happens in the PlayerHandle and game-state legality in Board.apply_turn.
"""

_CELL_CODE = {".": 0, "W": 1, "B": 2}


def _encode_grid(board: Board) -> List[List[int]]:
    return [[_CELL_CODE[cell] for cell in row] for row in board.grid]


def _encode_signals(board: Board, record: Optional[TurnRecord]) -> List[SignalReading]:
    if record is None or not record.signals_data:
        return [SignalReading(loc=None, signal=None), SignalReading(loc=None, signal=None)]

    entries: List[SignalReading] = []
    for loc, exploded in record.signals_data:
        if exploded:
            entries.append(SignalReading(loc=loc, signal="none"))
        else:
            category = board.detector_category(loc, record.mines_snapshot)
            entries.append(SignalReading(loc=loc, signal=board.noisy_signal(category)))
    while len(entries) < 2:
        entries.append(SignalReading(loc=None, signal=None))
    return entries


def encode_obs(
    board: Board,
    player: Player,
    last_record: Optional[TurnRecord],
    time_left: float,
    opponent_time_left: float,
) -> GameState:
    opponent = opponent_of(player)
    return GameState(
        board=_encode_grid(board),
        you=player,
        opponent=opponent,
        turn_number=board.turn_index + 1,
        turns_remaining=board.turns_remaining(player),
        moves_required=board.required_move_count(player),
        opponent_moves_required=board.required_move_count(opponent),
        defuses_remaining=board.defuses_left[player],
        opponent_defuses_remaining=board.defuses_left[opponent],
        opponent_turns_remaining=board.turns_remaining(opponent),
        time_left=time_left,
        opponent_time_left=opponent_time_left,
        revealed_mines=sorted(board.revealed_mines),
        stone_counts=StoneCounts(black=board.stone_count("black"), white=board.stone_count("white")),
        last_signals=_encode_signals(board, last_record),
    )
