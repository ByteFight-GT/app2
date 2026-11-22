from __future__ import annotations

from .board import Board

"""ASCII visualization for Connect-6 Mines. Used by main.py for local runs."""

def fmt_piece(piece: str, color_style: str) -> str:
    if color_style == "none":
        return f" {piece} "

    if color_style == "8color":
        match piece:
            case "B":
                return "\x1b[40m B \x1b[0m"
            case "W":
                return "\x1b[47m\x1b[30m W \x1b[0m"
            case "M":
                return "\x1b[41m M \x1b[0m"
            case ".":
                return "\x1b[42m . \x1b[0m"
            case _:
                return f"{piece:^3s}"

    match piece:
        case "B":
            return "\x1b[40m B \x1b[0m"
        case "W":
            return "\x1b[47m\x1b[30m W \x1b[0m"
        case "M":
            return "\x1b[41m M \x1b[0m"
        case ".":
            return "\x1b[48;5;137m . \x1b[0m"
        case _:
            return f"{piece:^3s}"

def render(board: Board, color_style: str = "256color") -> str:
    lines = [
        f"Turn {board.turn_index + 1}  |  next to play: {board.current_player()}",
        f"Stones - black: {board.stone_count('black')}  white: {board.stone_count('white')}  "
        f"|  revealed mines: {len(board.revealed_mines)}",
        "",
        "     " + "".join(f"{c:3d}" for c in range(board.size)),
    ]
    for r in range(board.size):
        row = "".join(fmt_piece(board.grid[r][c], color_style) for c in range(board.size))
        lines.append(f"{r:3d}  {row}")
    return "\n".join(lines) + "\n"
