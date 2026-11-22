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
    NUM_MINES: int = 20
    # Explosion is a 3x3 square centered on the triggered mine (offsets in
    # [-BLAST_RADIUS, BLAST_RADIUS] on both axes).
    BLAST_RADIUS: int = 1

    # Detector: mines are counted within Euclidean distance <= 2 of the
    # placed stone, a 13 cell rounded diamond (see Board._detector_cells).
    DETECTOR_RADIUS_SQ: int = 4

    # Nearby-mine-count -> signal category thresholds: 0-1 -> low,
    # 2-3 -> medium, 4+ -> high.
    LOW_MAX: int = 1
    MEDIUM_MAX: int = 3

    # Detector noise matrix: NOISE_MATRIX[actual][reported] -> percentage
    # weight. The "none" signal (unsuccessful placement) is never noisy and
    # has no row here (see Board.noisy_signal).
    NOISE_MATRIX = {
        "low": {"low": 75, "medium": 20, "high": 5},
        "medium": {"low": 15, "medium": 70, "high": 15},
        "high": {"low": 5, "medium": 20, "high": 75},
    }

    # Turn flow
    MAX_TURNS_PER_PLAYER: int = 50

    # Time limits (wall-clock, per player)
    PLAY_TIME_LIMIT: float = 180.0
    VALIDATE_TIME_LIMIT: float = 10.0
