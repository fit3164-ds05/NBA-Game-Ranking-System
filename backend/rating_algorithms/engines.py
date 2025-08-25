from abc import ABC, abstractmethod
import math
from typing import Optional

from glicko2 import Player
import trueskill as ts


class RatingEngine(ABC):
    """Abstract base class for rating engines."""

    @abstractmethod
    def record_game(self, winner: str, loser: str, game_date):
        raise NotImplementedError

    @abstractmethod
    def get_rating(self, team: str) -> float:
        raise NotImplementedError

    def get_uncertainty(self, team: str) -> Optional[float]:
        return None

    def expected_score(self, rating_a: float, rating_b: float,
                       rd_a: Optional[float] = None,
                       rd_b: Optional[float] = None) -> float:
        return 1.0 / (1.0 + 10 ** (-(rating_a - rating_b) / 400.0))

    def win_prob(self, rating_a: float, rating_b: float,
                 rd_a: Optional[float] = None,
                 rd_b: Optional[float] = None) -> float:
        return self.expected_score(rating_a, rating_b, rd_a, rd_b)

    def record_game_ctx(self, winner: str, loser: str, game_date, **ctx) -> None:
        return self.record_game(winner, loser, game_date)

    @property
    def history(self) -> list[dict]:
        if not hasattr(self, "_history"):
            self._history = []
        return self._history


def glicko_expected_score(rating_a: float, rating_b: float, rd_b: float) -> float:
    q = math.log(10) / 400.0
    g = 1.0 / math.sqrt(1.0 + 3.0 * (q ** 2) * (rd_b ** 2) / (math.pi ** 2))
    return 1.0 / (1.0 + 10.0 ** (-g * (rating_a - rating_b) / 400.0))


class GlickoEngine(RatingEngine):
    """Glicko-2 rating engine implementation using the `glicko2` library."""

    def __init__(self):
        self.players: dict[str, Player] = {}
        self._history: list[dict] = []

    def _get_player(self, name: str) -> Player:
        if name not in self.players:
            self.players[name] = Player()
        return self.players[name]

    def record_game(self, winner: str, loser: str, game_date) -> None:
        w = self._get_player(winner)
        l = self._get_player(loser)
        w.update_player([l.getRating()], [l.getRd()], [1])
        l.update_player([w.getRating()], [w.getRd()], [0])
        self._history.append({"GAME_DATE": game_date, "TEAM": winner, "RATING": w.getRating()})
        self._history.append({"GAME_DATE": game_date, "TEAM": loser, "RATING": l.getRating()})

    def get_rating(self, team: str) -> float:
        return self._get_player(team).getRating()

    def get_uncertainty(self, team: str) -> float:
        return self._get_player(team).getRd()

    def win_prob(self, rating_a: float, rating_b: float,
                 rd_a: Optional[float] = None,
                 rd_b: Optional[float] = None) -> float:
        if rd_b is None:
            rd_b = 50.0
        return glicko_expected_score(rating_a, rating_b, rd_b)


class EloEngine(RatingEngine):
    """Classic Elo rating engine."""

    def __init__(self, k_factor: float = 32.0, init_rating: float = 1500.0):
        self.k = k_factor
        self.init = init_rating
        self.ratings: dict[str, float] = {}
        self._history: list[dict] = []

    def _get_rating(self, name: str) -> float:
        return self.ratings.get(name, self.init)

    def get_rating(self, team: str) -> float:
        return self._get_rating(team)

    def record_game(self, winner: str, loser: str, game_date) -> None:
        Ra = self._get_rating(winner)
        Rb = self._get_rating(loser)
        Ea = 1.0 / (1.0 + 10 ** ((Rb - Ra) / 400.0))
        Eb = 1.0 / (1.0 + 10 ** ((Ra - Rb) / 400.0))
        Ra_new = Ra + self.k * (1 - Ea)
        Rb_new = Rb + self.k * (0 - Eb)
        self.ratings[winner] = Ra_new
        self.ratings[loser] = Rb_new
        self._history.append({"GAME_DATE": game_date, "TEAM": winner, "RATING": Ra_new})
        self._history.append({"GAME_DATE": game_date, "TEAM": loser, "RATING": Rb_new})


class MarginHomeElo(RatingEngine):
    """Elo with margin-of-victory, home advantage, and playoff K boost."""

    def __init__(self, k_base: float = 20.0, init_rating: float = 1500.0,
                 home_adv: float = 60.0, playoff_k_boost: float = 1.25):
        self.k_base = k_base
        self.init = init_rating
        self.home_adv = home_adv
        self.playoff_k_boost = playoff_k_boost
        self.ratings: dict[str, float] = {}
        self._history: list[dict] = []

    def _get(self, name: str) -> float:
        return self.ratings.get(name, self.init)

    def get_rating(self, team: str) -> float:
        return self._get(team)

    def record_game(self, winner: str, loser: str, game_date) -> None:
        Ra = self._get(winner)
        Rb = self._get(loser)
        Ea = 1.0 / (1.0 + 10 ** ((Rb - Ra) / 400.0))
        Ra_new = Ra + self.k_base * (1 - Ea)
        Rb_new = Rb + self.k_base * (0 - (1 - Ea))
        self.ratings[winner] = Ra_new
        self.ratings[loser] = Rb_new
        self._history.append({"GAME_DATE": game_date, "TEAM": winner, "RATING": Ra_new})
        self._history.append({"GAME_DATE": game_date, "TEAM": loser, "RATING": Rb_new})

    def record_game_ctx(self, winner: str, loser: str, game_date, **ctx) -> None:
        margin = ctx.get("margin")
        home_team = ctx.get("home_team")
        is_playoff = int(ctx.get("is_playoff", 0))

        Ra = self._get(winner)
        Rb = self._get(loser)

        gap = Ra - Rb
        if home_team is not None:
            if home_team == winner:
                gap += self.home_adv
            elif home_team == loser:
                gap -= self.home_adv

        Ea = 1.0 / (1.0 + 10 ** (-gap / 400.0))

        if margin is None or margin <= 0:
            mult = 1.0
        else:
            mult = math.log(1.0 + float(margin))

        k = self.k_base * (self.playoff_k_boost if is_playoff else 1.0)

        Ra_new = Ra + k * mult * (1 - Ea)
        Rb_new = Rb + k * mult * (0 - (1 - Ea))

        self.ratings[winner] = Ra_new
        self.ratings[loser] = Rb_new
        self._history.append({"GAME_DATE": game_date, "TEAM": winner, "RATING": Ra_new})
        self._history.append({"GAME_DATE": game_date, "TEAM": loser, "RATING": Rb_new})


class TrueSkillEngine(RatingEngine):
    """TrueSkill rating engine (mu used as scalar rating; sigma as uncertainty)."""

    def __init__(self, mu: float = 25.0, sigma: float = 25.0/3.0,
                 beta: float = 25.0/6.0, tau: float = 25.0/300.0,
                 draw_probability: float = 0.0):
        self.env = ts.TrueSkill(mu=mu, sigma=sigma, beta=beta,
                                tau=tau, draw_probability=draw_probability)
        self.players: dict[str, ts.Rating] = {}
        self._history: list[dict] = []

    def _get_player(self, name: str) -> ts.Rating:
        if name not in self.players:
            self.players[name] = self.env.create_rating()
        return self.players[name]

    def record_game(self, winner: str, loser: str, game_date) -> None:
        w = self._get_player(winner)
        l = self._get_player(loser)
        w_new, l_new = self.env.rate_1vs1(w, l)
        self.players[winner] = w_new
        self.players[loser] = l_new
        self._history.append({"GAME_DATE": game_date, "TEAM": winner, "RATING": w_new.mu})
        self._history.append({"GAME_DATE": game_date, "TEAM": loser, "RATING": l_new.mu})

    def get_rating(self, team: str) -> float:
        return float(self._get_player(team).mu)

    def get_uncertainty(self, team: str) -> float:
        return float(self._get_player(team).sigma)

    def expected_score(self, rating_a: float, rating_b: float,
                       rd_a: Optional[float] = None,
                       rd_b: Optional[float] = None) -> float:
        sigma_a = rd_a
        sigma_b = rd_b
        if sigma_a is None or sigma_b is None:
            if sigma_a is None:
                sigma_a = self.env.sigma
            if sigma_b is None:
                sigma_b = self.env.sigma
        denom = math.sqrt(2 * (self.env.beta ** 2) + (sigma_a ** 2) + (sigma_b ** 2))
        z = (rating_a - rating_b) / denom
        return 0.5 * (1.0 + math.erf(z / math.sqrt(2.0)))
