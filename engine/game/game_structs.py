"""
These are the shared types for the Gomoku game, used by both the game engine
and your bot.

Each turn your bot receives a GameState describing what the bot can see (the
board, but not the mines that haven't been found yet) and returns an Action
with an optional defuse and the stones to place. GameState and Action are
Pydantic models, which reject a malformed Action. A malformed or illegal
Action forfeits the game. Coordinates are (row, col) with (0, 0) in the
upper-left corner of the board, and board cells are 0 (empty), 1 (white) or
2 (black). Rule values such as board size, mine count, detector noise and
defuse attempts are in game_constants.py.
"""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, Field, field_validator

from .game_constants import GameConstants

Player = Literal["black", "white"]
Signal = Literal["low", "medium", "high", "none"]

Coordinate = Annotated[int, Field(ge=0, lt=GameConstants.BOARD_SIZE)]
# (row, col), with (0, 0) the upper-left corner.
Location = tuple[Coordinate, Coordinate]

# board[row][col] is the cell at (row, col): 0 empty, 1 white stone, 2 black stone.
Cell = Literal[0, 1, 2]
Row = Annotated[list[Cell], Field(min_length=GameConstants.BOARD_SIZE, max_length=GameConstants.BOARD_SIZE)]
Grid = Annotated[list[Row], Field(min_length=GameConstants.BOARD_SIZE, max_length=GameConstants.BOARD_SIZE)]


def _MAX_STONES() -> int:
    """
    Returns the most stones any turn can place: 2 normally, plus
    DEFUSE_BONUS_STONES on the turn after a successful defuse. With the
    default rules that is 3 (2 + 1). An Action with more moves than this is
    rejected straight away. This is only an upper limit, as each turn your
    bot must place exactly GameState.moves_required stones. With the default
    rules that is 1 on black's first turn, 3 on the turn after a successful
    defuse, and 2 otherwise. The limit is recalculated each time an Action
    is checked, so it stays correct if DEFUSE_BONUS_STONES in
    game_constants.py is changed.

    Returns:
        2 + DEFUSE_BONUS_STONES.
    """
    return 2 + GameConstants.DEFUSE_BONUS_STONES


def opponent_of(player: Player) -> Player:
    """
    Returns the opponent of the given player. For example, opponent_of("black")
    returns "white". For the current turn, GameState.opponent already holds the opponent's colour. The function is useful when your bot simulates future turns and
    needs to switch sides.

    Args:
        player: "black" or "white".

    Returns:
        The other player: "white" for "black", and "black" for "white".
    """
    return "white" if player == "black" else "black"


class SignalReading(BaseModel):
    """
    This is the detector reading for one of the stones you placed on your
    previous turn. GameState.last_signals holds one of these per stone, so
    there could be 1 to 3 of them.

    The reading counts the hidden mines in the 3x3 square around the stone
    you placed, using the mines as they were at the start of that turn,
    before any defuse or stones were placed: "low" means 0 mines, "medium"
    1, and "high" 2 or more. Readings are noisy. Each reading is reported
    correctly 95% of the time with the default rules (see NOISE_MATRIX in
    game_constants.py). The other 5% of the time it reports a different
    level, usually the neighbouring one in the order low, medium, high: a
    true low can only read higher, a true high only lower, and a true
    medium either way. The exception is a 1% chance of a true low reading
    high, or a true high reading low. "none" means that stone did not
    survive the turn, either because it landed on a mine or because a blast
    from another stone you placed that turn removed it. "none" is never
    noisy.

    GameState.last_signals always has at least 2 entries, so when there
    are fewer than 2 real readings, the rest are blank entries, with loc
    and signal both None. Both entries are blank on your first turn, and the second entry is
    blank on black's second turn, after its one-stone opening. Skip any
    entry whose loc is None.

    Attributes:
        loc: Where the stone was placed, as (row, col), or None.
        signal: "low", "medium", "high", "none", or None.
    """

    loc: Location | None
    signal: Signal | None


class StoneCounts(BaseModel):
    """
    Number of stones each player has on the board.

    Attributes:
        black: Black's stone count.
        white: White's stone count.
    """

    black: int
    white: int


class GameState(BaseModel):
    """
    Everything your bot can see at the start of its turn. The engine passes
    it to your bot's play(obs) function each turn. The hidden mines are not
    included, apart from the ones that have been defused and revealed
    (revealed_mines).

    This is the GameState that you get. This has a lot of helper functions.

    Single-move helper coordinates are (x, y), with x increasing right and
    y increasing down. The grid remains board[y][x]; Action coordinates are
    (row, column).
    Use forecast_move()/forecast_turn() for searching, for example for mini max. 
    apply_move() places one stone immediately on the current state 
    (not on the actual Board, for that you still have to return the moves); 
    apply_turn(action) places all the stones for the turn immediately on the current state, 
    it ignores defuse. 
    Completing a turn switches you/opponent to the next
    side to move. Mines and defusing are not simulated.

    The best way to simulate any algorithm is to either use forecast_turn or move, or
    copy the GameState and apply_move/apply_turn on the copy. 
    This keeps the original GameState intact for any processing.

    Attributes:
        board: The 16x16 board, indexed as board[row][col]. Each cell is
            0 (empty), 1 (white stone) or 2 (black stone).
        you: Your colour, "black" or "white".
        opponent: Your opponent's colour.
        turn_number: Which turn is about to be played, counting both
            players' turns from 1. Black plays the odd turns (1, 3, 5, ...)
            and white the even ones.
        turns_remaining: How many turns you have left, including this one.
            Each player gets MAX_TURNS_PER_PLAYER turns (50 by default).
        opponent_turns_remaining: How many turns your opponent has left.
        moves_required: Exactly how many stones you must place this turn:
            1 on black's first turn, 3 on the turn after a successful
            defuse, and 2 otherwise. Placing any other number forfeits.
        opponent_moves_required: How many stones your opponent must place
            on their next turn (3 if their last defuse succeeded).
        defuses_remaining: Your defuse attempts left. You start with 1 and
            gain 1 after every 3 of your own turns. Unused attempts carry
            over, with no limit on how many you can save up.
        opponent_defuses_remaining: Your opponent's defuse attempts left.
        time_left: Seconds left on your clock for the whole game. It only
            runs during your turns, and reaching 0 loses the game.
        opponent_time_left: Seconds left on your opponent's clock.
        revealed_mines: (row, col) of every mine either player has
            successfully defused. Mines that exploded are not listed.
        stone_counts: How many stones each player has on the board, as
            stone_counts.black and stone_counts.white. If nobody gets six
            in a row before the turn limit, the player with more stones
            wins.
        last_signals: Detector readings for the stones you placed on your
            previous turn, with at least 2 entries (see SignalReading).
    """

    board: Grid
    you: Player
    opponent: Player
    # 1-indexed turn about to be played (global count).
    turn_number: int
    # Your own turns left, out of MAX_TURNS_PER_PLAYER, including this one.
    turns_remaining: int
    opponent_turns_remaining: int
    # Stones still to place this turn.
    moves_required: int
    # Stones the opponent places next turn (more after their successful defuse).
    opponent_moves_required: int
    # Defuse attempts left: 1 at the start, plus one after
    # every 3 of that player's turns.
    defuses_remaining: int
    opponent_defuses_remaining: int
    # Remaining wall-clock seconds.
    time_left: float
    opponent_time_left: float
    # Publicly known (successfully defused) mine locations.
    revealed_mines: list[Location]
    stone_counts: StoneCounts
    # One reading per stone you placed last turn, padded to at least 2.
    last_signals: Annotated[list[SignalReading], Field(min_length=2)]

    def get_dim_x(self) -> int:
        "get the x dimension, this is the number of columns in the board - 16"
        return len(self.board[0])

    def get_dim_y(self) -> int:
        "get the y dimension, this is the number of rows in the board - 16"
        return len(self.board)

    @property
    def player_cells(self) -> list[Location]:
        """Current player's occupied cells as (x, y) coordinates."""
        return self._cells_for(self.you)

    @property
    def enemy_cells(self) -> list[Location]:
        """Opponent's occupied cells as (x, y) coordinates."""
        return self._cells_for(self.opponent)

    def _cells_for(self, player: Player) -> list[Location]:
        value = 1 if player == "white" else 2
        return [(x, y) for y, row in enumerate(self.board) for x, cell in enumerate(row) if cell == value]

    def is_game_over(self) -> bool:
        """Return whether a player has won or both players have no turns left."""
        if self.turns_remaining <= 0 and self.opponent_turns_remaining <= 0:
            return True
        from .board import Board

        board = Board(size=self.get_dim_x(), mines=set())
        pieces = {0: ".", 1: "W", 2: "B"}
        board.grid = [[pieces[cell] for cell in row] for row in self.board]
        return board.check_win(self.you) or board.check_win(self.opponent)

    def you_win(self) -> bool:
        """Return whether the current player has won."""
        from .board import Board

        board = Board(size=self.get_dim_x(), mines=set())
        pieces = {0: ".", 1: "W", 2: "B"}
        board.grid = [[pieces[cell] for cell in row] for row in self.board]
        return board.check_win(self.you)

    def opponent_wins(self) -> bool:
        """Return whether the opponent has won."""
        from .board import Board

        board = Board(size=self.get_dim_x(), mines=set())
        pieces = {0: ".", 1: "W", 2: "B"}
        board.grid = [[pieces[cell] for cell in row] for row in self.board]
        return board.check_win(self.opponent)

    def _validate_target(self, x: int, y: int) -> Location:
        if self.is_game_over() or self.turns_remaining <= 0:
            raise ValueError("cannot play after the game or player's turns have ended")
        if type(x) is not int or type(y) is not int:
            raise ValueError("coordinates must be integers")
        if not (0 <= x < self.get_dim_x() and 0 <= y < self.get_dim_y()):
            raise ValueError("target is outside the board")
        if self.board[y][x] != 0:
            raise ValueError("target must be an empty cell")
        return y, x

    def _place_stone(self, target: Location) -> None:
        y, x = target
        if self.you == "white":
            self.board[y][x] = 1
            self.stone_counts.white += 1
        else:
            self.board[y][x] = 2
            self.stone_counts.black += 1

    def _finish_turn(self) -> None:
        turns_left = self.turns_remaining - 1
        defuses_left = self.defuses_remaining
        if (GameConstants.MAX_TURNS_PER_PLAYER - turns_left) % GameConstants.DEFUSE_RECHARGE_TURNS == 0:
            defuses_left += 1
        self.you, self.opponent = self.opponent, self.you
        self.turns_remaining, self.opponent_turns_remaining = self.opponent_turns_remaining, turns_left
        self.moves_required, self.opponent_moves_required = self.opponent_moves_required, 2
        self.defuses_remaining, self.opponent_defuses_remaining = self.opponent_defuses_remaining, defuses_left
        self.time_left, self.opponent_time_left = self.opponent_time_left, self.time_left
        self.turn_number += 1
        self.last_signals = [SignalReading(loc=None, signal=None), SignalReading(loc=None, signal=None)]

    def apply_move(self, x: int, y: int) -> None:
        """Place one stone at (x, y), ignoring mines; raise ValueError if invalid.

        Updates the grid and stone count immediately and decrements
        moves_required. After the last required placement, advances the turn
        and switches sides. Copy the state first to keep a search parent intact.
        """
        target = self._validate_target(x, y)
        self._place_stone(target)
        self.moves_required -= 1
        if self.moves_required == 0:
            self._finish_turn()

    def apply_turn(self, action: Action) -> None:
        """Place all the stones in the action immediately, ignoring mines and defuse.

        Validates the complete turn before changing anything. Requires exactly
        moves_required number of moves, then places every stone and
        switches sides. Returns None.
        """
        if self.is_game_over() or self.turns_remaining <= 0:
            raise ValueError("cannot play after the game or player's turns have ended")
        if len(action.moves) != self.moves_required:
            raise ValueError(f"this turn requires exactly {self.moves_required} placements")
        targets = [self._validate_target(x, y) for y, x in action.moves]
        if len(set(targets)) != len(targets):
            raise ValueError("placement targets must be distinct")
        for target in targets:
            self._place_stone(target)
        self._finish_turn()

    def forecast_move(self, x: int, y: int) -> GameState:
        """Return a deep copy with one mine-free placement at (x, y).
        """
        state = self.model_copy(deep=True)
        state.apply_move(x, y)
        return state

    def forecast_turn(self, action: Action) -> GameState:
        """Return a deep copy after action.moves are played, ignoring defuse.
        """
        state = self.model_copy(deep=True)
        state.apply_turn(action)
        return state

    @field_validator("last_signals")
    @classmethod
    def _cap_signals(cls, value):
        """
        Checks that GameState.last_signals has no more readings than one
        turn can place stones (3 with the default rules), since there is one
        reading per stone. Pydantic runs this automatically whenever a
        GameState is created; your bot never needs to call it.

        Args:
            value: The GameState.last_signals list being checked.

        Returns:
            The same list, unchanged, if it passes.

        Raises:
            ValueError: If there are more readings than _MAX_STONES()
                allows.
        """
        if len(value) > _MAX_STONES():
            raise ValueError(f"at most {_MAX_STONES()} signal readings")
        return value


class Action(BaseModel):
    """
    What your bot returns from play(obs): one full turn. The engine handles
    the optional defuse first, then places your stones. For example:

        Action(defuse=(3, 4), moves=[(3, 4), (5, 5)])

    Attributes:
        defuse: (row, col) of an empty cell to try defusing, or None to
            skip. It must be on the board and on an empty cell, and you need at
            least 1 attempt left (GameState.defuses_remaining). It uses
            up 1 attempt whether or not there was a mine there, and your
            stones are placed either way.
        moves: (row, col) of each stone to place. There must be exactly
            GameState.moves_required of them, each on a different, empty
            cell on the board. One of them may be the defuse cell, which
            is safe after the defuse whatever the result.

    A badly formatted or illegal Action forfeits the game.
    """

    defuse: Location | None = None
    moves: Annotated[list[Location], Field(min_length=1)]

    @field_validator("moves")
    @classmethod
    def _cap_moves(cls, value):
        """
        Check that Action.moves has no more stones than one turn can place
        (3 with the default rules). Pydantic runs this automatically
        whenever an Action is created, including inside your bot, so
        building an Action with too many moves raises an error straight
        away; your bot never needs to call it. This is only an upper limit:
        the engine separately checks that you placed exactly
        GameState.moves_required stones.

        Args:
            value: The Action.moves list being checked.

        Returns:
            The same list, unchanged, if it passes.

        Raises:
            ValueError: If there are more moves than _MAX_STONES() allows.
        """
        if len(value) > _MAX_STONES():
            raise ValueError(f"at most {_MAX_STONES()} moves")
        return value
