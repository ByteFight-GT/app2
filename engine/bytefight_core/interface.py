from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Generic, TypeVar

from pydantic import BaseModel

Action = TypeVar("Action", bound=BaseModel)
Obs = TypeVar("Obs", bound=BaseModel)


class MatchStatus(Enum):
    CREATED = "created"
    SCHEDULING = "scheduling"
    WAITING = "waiting"
    IN_PROGRESS = "in_progress"
    FAILED = "failed"
    PLAYER_A_WIN = "team_a_win"
    PLAYER_B_WIN = "team_b_win"
    DRAW = "draw"
    SUBMISSION_VALID = "submission_valid"
    SUBMISSION_INVALID = "submission_invalid"


@dataclass(frozen=True)
class GameResultFile:
    path: str | Path
    slug: str
    visibility: str
    team_uuid: str | None = None


@dataclass
class GameResult:
    status: MatchStatus
    files: list[GameResultFile] = field(default_factory=list)

    
class GameController(ABC, Generic[Action, Obs]):
    @abstractmethod
    def play(self) -> GameResult: ...

    @abstractmethod
    def validate(self) -> GameResult: ...


class PlayerHandle(ABC, Generic[Action, Obs]):
    @abstractmethod
    def exchange(self, obs: Obs, *, timeout: float | None = None) -> Action | None: ...

    def close(self) -> None: ...


class PlayerController(ABC, Generic[Action, Obs]):
    @abstractmethod
    def play(self, obs: Obs) -> Action: ...
