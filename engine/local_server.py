from __future__ import annotations

import argparse
import json
import os
import socket
import sys
import threading
import time
import traceback
from pathlib import Path
from typing import Any, Dict, List, Optional

from game import Action, Board, GomokuController
from player_process import SubprocessPlayerHandle, controller_files

"""
Local match server for the ByteFight client (Connect-6 Mines).

The client spawns this script, connects to --output_port on 127.0.0.1 and
receives newline-delimited JSON:

    {"type": "update", "index": i, "frame": {...}}
        One per frame in order, starting with the empty board. `frame` holds
        each per-frame GamePGN field at index i, so appending every frame
        rebuilds the GamePGN.
    {"type": "game_complete", "success": true}
        Sent once at the end. success is false if the engine crashed.

If the client sends {"type": "terminate"}, the server replies
{"type": "terminated", ...}, kills both bots and exits without a replay.

The full GamePGN is written to --output_dir, which is a file path. Player A
(--a_dir) plays black and moves first.

Built into the client by the games repo's create_client_engine.py, so edit it
there.
"""

ACCEPT_TIMEOUT = 60.0  # seconds to wait for the client to connect


class ClientStream:
    """Sends newline-delimited JSON to the client. Never raises, so the match
    still finishes and writes its replay if the client disconnects."""

    def __init__(self, conn: socket.socket):
        self._conn: Optional[socket.socket] = conn
        self._lock = threading.Lock()

    def send(self, message: Dict[str, Any]) -> None:
        data = (json.dumps(message) + "\n").encode("utf-8")
        with self._lock:
            if self._conn is None:
                return
            try:
                self._conn.sendall(data)
            except OSError as e:
                print(f"Lost connection to client: {e}", flush=True)
                self._conn = None

    def close(self) -> None:
        with self._lock:
            if self._conn is None:
                return
            try:
                self._conn.shutdown(socket.SHUT_RDWR)
            except OSError:
                pass
            self._conn.close()
            self._conn = None


def listen_for_terminate(conn: socket.socket, stream: ClientStream, handles: List[SubprocessPlayerHandle]) -> None:
    buffer = b""
    while True:
        try:
            data = conn.recv(1024)
        except OSError:
            return
        if not data:
            return
        buffer += data
        while b"\n" in buffer:
            line, buffer = buffer.split(b"\n", 1)
            try:
                message = json.loads(line)
            except json.JSONDecodeError:
                continue
            if isinstance(message, dict) and message.get("type") == "terminate":
                print("Terminate command received", flush=True)
                # Reply and hang up first. A killed bot looks like a forfeit,
                # so the match thread would otherwise report a result.
                stream.send({"type": "terminated", "reason": "User requested termination"})
                stream.close()
                for handle in handles:
                    handle.kill()
                os._exit(0)


def accept_client(port: int) -> socket.socket:
    server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    server.bind(("127.0.0.1", port))
    server.listen(1)
    server.settimeout(ACCEPT_TIMEOUT)
    print("waiting for connection", flush=True)
    try:
        conn, addr = server.accept()
    finally:
        server.close()
    conn.settimeout(None)
    print(f"Connected: {addr}", flush=True)
    return conn


def check_bot_dir(bot_dir: Path, name: str) -> None:
    if not controller_files(bot_dir):
        raise SystemExit(f"Error: {name} directory {bot_dir} has no .py file defining a PlayerController.")


def play_match(args: argparse.Namespace, stream: ClientStream, handles: List[SubprocessPlayerHandle]) -> None:
    black = SubprocessPlayerHandle(args.a_dir, "black", Action)
    handles.append(black)
    white = SubprocessPlayerHandle(args.b_dir, "white", Action)
    handles.append(white)

    controller = GomokuController(
        black,
        white,
        board=Board(),
        pgn_path=args.output_dir,
        on_frame=lambda index, frame: stream.send({"type": "update", "index": index, "frame": frame}),
    )

    sim_time = time.perf_counter()
    controller.play()
    sim_time = time.perf_counter() - sim_time

    pgn = controller.pgn
    print(f"{pgn.result} by {pgn.reason}", flush=True)
    print(f"{sim_time:.3f} seconds elapsed to simulate {pgn.turn_count} turns.", flush=True)
    print(args.output_dir, flush=True)
    stream.send({"type": "game_complete", "success": True})


def main() -> None:
    parser = argparse.ArgumentParser(description="Run a Connect-6 Mines match for the ByteFight client")
    parser.add_argument("--a_dir", "-a", type=Path, required=True, help="Player A's (black's) bot directory")
    parser.add_argument("--b_dir", "-b", type=Path, required=True, help="Player B's (white's) bot directory")
    parser.add_argument("--output_dir", "-o", type=Path, required=True, help="File to write the GamePGN replay to")
    parser.add_argument("--output_port", "-p", type=int, required=True, help="Port to stream the match on")
    args = parser.parse_args()
    args.a_dir = args.a_dir.resolve()
    args.b_dir = args.b_dir.resolve()

    check_bot_dir(args.a_dir, "Bot A")
    check_bot_dir(args.b_dir, "Bot B")

    conn = accept_client(args.output_port)
    stream = ClientStream(conn)
    handles: List[SubprocessPlayerHandle] = []
    threading.Thread(target=listen_for_terminate, args=(conn, stream, handles), daemon=True).start()

    try:
        play_match(args, stream, handles)
    except Exception:
        print(traceback.format_exc(), flush=True)
        print("Game crashed due to unknown reason.", flush=True)
        stream.send({"type": "game_complete", "success": False})
        sys.exit(1)
    finally:
        for handle in handles:
            handle.close()
        stream.close()


if __name__ == "__main__":
    main()
