from __future__ import annotations


class GameConstants:
    """
    Static tunable parameters for Connect-6 Mines (CS 6601 tournament rules).
    Referenced directly as class attributes throughout board.py/controller.py,
    matching the convention in bf2027/game/game_constants.py.
    """

    # Board / win condition
    BOARD_SIZE: int = 16
    WIN_LENGTH: int = 6

    # Mines
    NUM_MINES: int = 10
    # Explosion is a 5x5 square centered on the triggered mine (offsets in
    # [-BLAST_RADIUS, BLAST_RADIUS] on both axes). A bigger blast makes each
    # detonation cost more, so reading the detector pays off.
    BLAST_RADIUS: int = 2

    # Detector: mines are counted within Euclidean distance <= sqrt(2) of the
    # placed stone, the 3x3 square around it (see Board._detector_cells).
    # Small and sharp so a strong bot can localise mines; with the old 13
    # cell window even exact inference rarely could.
    DETECTOR_RADIUS_SQ: int = 2

    # Nearby-mine-count -> signal category thresholds: 0 -> low, 1 -> medium,
    # 2+ -> high. A single mine must change the reading or it is invisible.
    LOW_MAX: int = 0
    MEDIUM_MAX: int = 1

    # Detector noise matrix: NOISE_MATRIX[actual][reported] -> percentage
    # weight. The "none" signal (unsuccessful placement) is never noisy and
    # has no row here (see Board.noisy_signal).
    NOISE_MATRIX = {
        "low": {"low": 95, "medium": 4, "high": 1},
        "medium": {"low": 2, "medium": 95, "high": 3},
        "high": {"low": 1, "medium": 4, "high": 95},
    }

    # Extra stones a successful defuse earns on that player's next turn. At 2
    # even a reckless defuser at 40% success comes out ahead, which flattens
    # skill; at 1 only a well calibrated read pays.
    DEFUSE_BONUS_STONES: int = 1

    # Defuse attempts each player starts with, and how many of their own
    # turns earn them one more. A failed defuse costs only the attempt: the
    # turn's stones are still placed.
    STARTING_DEFUSES: int = 1
    DEFUSE_RECHARGE_TURNS: int = 3

    # Turn flow
    MAX_TURNS_PER_PLAYER: int = 50

    # Time limits (wall-clock, per player)
    PLAY_TIME_LIMIT: float = 180.0
    VALIDATE_TIME_LIMIT: float = 10.0
