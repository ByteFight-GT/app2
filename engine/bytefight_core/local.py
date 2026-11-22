from bytefight_core.interface import (Action, Obs, PlayerController,
                                      PlayerHandle)


class LocalPlayerHandle(PlayerHandle[Action, Obs]):
    def __init__(
        self,
        controller: PlayerController[Action, Obs],
        *,
        raise_errors: bool = False,
    ):
        self._controller = controller
        self._raise_errors = raise_errors

    def exchange(self, obs: Obs, *, timeout: float | None = None) -> Action | None:
        try:
            return self._controller.play(obs)
        except Exception:
            if self._raise_errors:
                raise
            return None
