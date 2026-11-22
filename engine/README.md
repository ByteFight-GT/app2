# Connect-6 Mines client engine

**Generated, so do not edit it in the client repo.** It is built from the
ByteFight-GT/games repo with:

```
python create_client_engine.py gomoku -o <client>/engine
```

Edit `gomoku/client_engine/` (the server) or `gomoku/game/` (the rules) there,
then rebuild. `ENGINE_VERSION.json` records the source commit.

## Running a match

```
python local_server.py --a_dir <bot A> --b_dir <bot B> --output_dir <replay.json> --output_port <port>
```

- Bot A plays black and moves first.
- Each bot directory is a package (`__init__.py`) whose `controller.py`
  defines one `PlayerController[Action, GameState]` subclass.
- Each bot runs in its own process under the 180 s match clock.
- The match streams over TCP on `--output_port`. The protocol is described at
  the top of `local_server.py`.

Needs Python 3.12+ with `pydantic` installed.
`bytefight_core` is bundled here because it is not published.
