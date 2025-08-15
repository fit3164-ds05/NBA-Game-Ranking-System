# %% importing dataset and libraries
from pathlib import Path
import os

import pandas as pd
import numpy as np
from glicko2 import Player
from abc import ABC, abstractmethod
import trueskill as ts
import math
import matplotlib.pyplot as plt


# Resolve key directories relative to this file location
# Elo_Computation.py lives in backend/Rating_Algorithms/, so:
#   _base_dir            -> backend/Rating_Algorithms
#   _backend_dir         -> backend
#   _project_root        -> repo root (one level above backend)
_base_dir = Path(__file__).resolve().parent
_backend_dir = _base_dir.parent
_project_root = _backend_dir.parent
_data_dir = _project_root / "backend" / "Data"

# Output directories for exports
_out_data_dir = _backend_dir / "data"
_out_visuals_dir = _out_data_dir / "visuals"
_out_data_dir.mkdir(parents=True, exist_ok=True)
_out_visuals_dir.mkdir(parents=True, exist_ok=True)

games_csv = _data_dir / "games.csv"
playoffs_csv = _data_dir / "playoffs.csv"

print(f"Using data files from: {games_csv} and {playoffs_csv}")

games_original = pd.read_csv(games_csv)
playoff_games = pd.read_csv(playoffs_csv)

# %% inspecting the columns in each
common_cols = sorted(set(games_original.columns).intersection(set(playoff_games.columns)))
only_in_games = sorted(set(games_original.columns) - set(playoff_games.columns))
only_in_playoffs = sorted(set(playoff_games.columns) - set(games_original.columns))

print(f"Common columns ({len(common_cols)}):")
print("\n".join(common_cols))

print(f"\nColumns only in games ({len(only_in_games)}):")
print("\n".join(only_in_games))

print(f"\nColumns only in playoffs ({len(only_in_playoffs)}):")
print("\n".join(only_in_playoffs))


# %% Joining the two datasets
# Keep only the columns common to both datasets, then vertically stack them
common_cols = sorted(set(games_original.columns).intersection(set(playoff_games.columns)))

# Add IS_PLAYOFF column to distinguish regular season and playoff games
games_original["IS_PLAYOFF"] = 0
playoff_games["IS_PLAYOFF"] = 1

playoff_games["WL"] = [0 if x == "L" else 1 for x in playoff_games["WL"]]
# Restrict each frame to the common columns plus IS_PLAYOFF and concatenate
games = pd.concat([
    games_original[common_cols + ["IS_PLAYOFF"]],
    playoff_games[common_cols + ["IS_PLAYOFF"]]
], ignore_index=True)

print(f"Joined regular season and playoffs on {len(common_cols)} common columns: {common_cols}")
print(f"Combined shape: {games.shape}")

# Drop any duplicate rows except for columns that might legitimately differ between duplicates
# (Adjust the excluded columns list as needed)
games = games.drop_duplicates()

# %% Ran into duplicates between playoff and normal
# Sort so that playoff rows come first
games = games.sort_values("IS_PLAYOFF", ascending=False)

# Drop duplicates ignoring the IS_PLAYOFF column
games = games.drop_duplicates(subset=[c for c in games.columns if c != "IS_PLAYOFF"], keep="first")

# %% Inspecting the data
def explore_dataframe(df, num_rows=5):
    """Print the first few rows, dimensions, and all column names of a DataFrame."""
    pd.set_option('display.max_columns', None)
    pd.set_option('display.max_colwidth', None)
    pd.set_option('display.width', None)
    print("First few rows:")
    print(df.head(num_rows))
    print("\nDimensions (rows, columns):")
    print(df.shape)
    print("\nColumn names:")
    print(list(df.columns))
explore_dataframe(games)

# Consolidated schema and signal summary for modelling
def summarize_games(df: pd.DataFrame, topk: int = 20) -> None:
    """Print a concise, structured profile of the joined games DataFrame.
    Includes dtypes, missingness, presence of candidate modelling columns,
    quick examples for venue/home hints, and margin-of-victory stats.
    """
    print("\n=== Schema summary ===")
    print("Dtypes (alphabetical):")
    print(df.dtypes.sort_index())

    print(f"\nMissingness top {topk} (percent):")
    miss = (df.isna().mean() * 100).round(2).sort_values(ascending=False)
    print(miss.head(topk).to_string())

    # Candidate signals that are commonly useful for Elo-style models
    cand_cols = [
        "TEAM_NAME", "WL", "PTS", "GAME_ID", "GAME_DATE",
        "IS_PLAYOFF", "MATCHUP", "HOME_TEAM_ID", "VISITOR_TEAM_ID",
        "TEAM_ID", "PLUS_MINUS", "SEASON"
    ]
    present = [c for c in cand_cols if c in df.columns]
    missing = [c for c in cand_cols if c not in df.columns]
    print("\nPresent candidate columns:", present)
    if missing:
        print("Missing candidate columns:", missing)

    # Venue/home hints
    print("\n=== Venue / Home indicators (examples) ===")
    for c in ["MATCHUP", "HOME_TEAM_ID", "VISITOR_TEAM_ID"]:
        if c in df.columns:
            ex = df[c].dropna().astype(str).head(10).to_list()
            print(f"{c}: {ex}")

    # Margin-of-victory summary, if derivable
    if set(["PTS", "GAME_ID", "TEAM_NAME", "WL"]).issubset(df.columns):
        tmp = df[["GAME_ID", "TEAM_NAME", "PTS", "WL"]].copy()
        margins = (
            tmp.pivot_table(index="GAME_ID", columns="WL", values="PTS")
               .rename(columns={1: "WIN_PTS", 0: "LOSE_PTS"})
        )
        margins["MARGIN"] = margins["WIN_PTS"] - margins["LOSE_PTS"]
        print("\n=== Margin-of-victory stats ===")
        print(margins["MARGIN"].describe())
    else:
        print("\nMargin-of-victory not derivable from available columns.")

summarize_games(games)

# %% Ensuring every game ID appears twice
game_id_counts = games['GAME_ID'].value_counts()
exceptions = game_id_counts[game_id_counts != 2]

if exceptions.empty:
    print("All GAME_IDs appear exactly twice.")
else:
    print("Exceptions found:")
    print(exceptions)
    print(f"{len(exceptions)} exceptions found")



# %% getting rid of unecessary teams
name_map = {
    "Los Angeles Clippers": "LA Clippers",
    "New Jersey Nets": "Brooklyn Nets",
    "New Orleans Hornets": "New Orleans Pelicans",
    "Charlotte Bobcats": "Charlotte Hornets"
}

games["TEAM_NAME"] = games["TEAM_NAME"].replace(name_map)

# %% Creating a results DF
results = []

for game_id, group in games.groupby("GAME_ID"):
    if len(group) != 2:
        continue  # skip malformed entries

    # Extract the two rows
    row1, row2 = group.iloc[0], group.iloc[1]

    if row1["WL"]:
        win_team = row1["TEAM_NAME"]
        lose_team = row2["TEAM_NAME"]
        points_w = row1["PTS"]
        points_l = row2["PTS"]
    else:
        win_team = row2["TEAM_NAME"]
        lose_team = row1["TEAM_NAME"]
        points_w = row2["PTS"]
        points_l = row1["PTS"]

    results.append({
        "GAME_ID": game_id,
        "GAME_DATE": row1["GAME_DATE"],  # same for both rows
        "WIN_TEAM": win_team,
        "LOSE_TEAM": lose_team,
        "POINTS_W": points_w,
        "POINTS_L": points_l
    })

# Convert to DataFrame
results_df = pd.DataFrame(results)

print(results_df.head())

# --- Enrich results with context signals for modelling ---
# Derive HOME_TEAM from MATCHUP pattern "TEAM vs. OPP" (home is the row containing " vs. ")
_home_by_gid = {}
for gid, grp in games.groupby("GAME_ID"):
    # Prefer explicit " vs. " marker
    home_row = grp[grp["MATCHUP"].astype(str).str.contains(" vs. ")]
    if not home_row.empty:
        _home_by_gid[gid] = home_row.iloc[0]["TEAM_NAME"]
    else:
        # Fallback: if no explicit marker, leave as None (some historical rows)
        _home_by_gid[gid] = None

# Map IS_PLAYOFF per GAME_ID from the joined table (consistent within a game)
_is_po_by_gid = games.drop_duplicates("GAME_ID").set_index("GAME_ID")["IS_PLAYOFF"].to_dict()

results_df["HOME_TEAM"] = results_df["GAME_ID"].map(_home_by_gid)
results_df["IS_PLAYOFF"] = results_df["GAME_ID"].map(_is_po_by_gid).fillna(0).astype(int)
results_df["MARGIN"] = results_df["POINTS_W"] - results_df["POINTS_L"]

# %% Rating engine abstraction
class RatingEngine(ABC):
    """Abstract base class for rating engines."""

    @abstractmethod
    def record_game(self, winner: str, loser: str, game_date: pd.Timestamp) -> None:
        """Update internal ratings given a game outcome on a specific date."""
        raise NotImplementedError

    @abstractmethod
    def get_rating(self, team: str) -> float:
        """Return the current rating for a team."""
        raise NotImplementedError

    def get_uncertainty(self, team: str) -> float | None:
        """Optionally return an uncertainty measure (e.g., RD in Glicko)."""
        return None

    def expected_score(self, rating_a: float, rating_b: float, rd_a: float | None = None, rd_b: float | None = None) -> float:
        """Return P(A beats B) using the engine's model. Default: Elo-style logistic."""
        # Elo logistic with scale 400
        return 1.0 / (1.0 + 10 ** (-(rating_a - rating_b) / 400.0))

    def win_prob(self, rating_a: float, rating_b: float, rd_a: float | None = None, rd_b: float | None = None) -> float:
        """Convenience wrapper: P(A beats B). Engines may override for custom formulas."""
        return self.expected_score(rating_a, rating_b, rd_a, rd_b)

    def record_game_ctx(self, winner: str, loser: str, game_date: pd.Timestamp, **ctx) -> None:
        """Optional context-aware update. Defaults to classic record_game for compatibility."""
        return self.record_game(winner, loser, game_date)

    @property
    def history(self) -> list[dict]:
        """Time-stamped rating snapshots appended by concrete engines."""
        if not hasattr(self, "_history"):
            self._history = []
        return self._history


#
# Helper: Glicko expected score (A vs B) using opponent RD
def glicko_expected_score(rating_a: float, rating_b: float, rd_b: float) -> float:
    """Calculate expected score of player A against player B using Glicko formula."""
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

    def record_game(self, winner: str, loser: str, game_date: pd.Timestamp) -> None:
        w = self._get_player(winner)
        l = self._get_player(loser)
        # Winner beats loser
        w.update_player([l.getRating()], [l.getRd()], [1])
        l.update_player([w.getRating()], [w.getRd()], [0])
        # Snapshot after the game
        self._history.append({
            "GAME_DATE": game_date,
            "TEAM": winner,
            "RATING": w.getRating(),
        })
        self._history.append({
            "GAME_DATE": game_date,
            "TEAM": loser,
            "RATING": l.getRating(),
        })

    def get_rating(self, team: str) -> float:
        return self._get_player(team).getRating()

    def get_uncertainty(self, team: str) -> float:
        return self._get_player(team).getRd()

    def win_prob(self, rating_a: float, rating_b: float, rd_a: float | None = None, rd_b: float | None = None) -> float:
        # Use opponent RD; fall back to a conservative default if None
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

    def record_game(self, winner: str, loser: str, game_date: pd.Timestamp) -> None:
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

    # expected_score uses default Elo logistic from base class


# --- MarginHomeElo implementation ---
class MarginHomeElo(RatingEngine):
    """Elo with margin-of-victory, home advantage, and playoff K boost.
    Uses context passed via record_game_ctx; falls back gracefully when missing.
    """
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

    def record_game(self, winner: str, loser: str, game_date: pd.Timestamp) -> None:
        # Backward-compat path with no context: classic Elo update
        Ra = self._get(winner)
        Rb = self._get(loser)
        Ea = 1.0 / (1.0 + 10 ** ((Rb - Ra) / 400.0))
        Ra_new = Ra + self.k_base * (1 - Ea)
        Rb_new = Rb + self.k_base * (0 - (1 - Ea))
        self.ratings[winner] = Ra_new
        self.ratings[loser] = Rb_new
        self._history.append({"GAME_DATE": game_date, "TEAM": winner, "RATING": Ra_new})
        self._history.append({"GAME_DATE": game_date, "TEAM": loser, "RATING": Rb_new})

    def record_game_ctx(self, winner: str, loser: str, game_date: pd.Timestamp, **ctx) -> None:
        # Context-aware update using margin, home team and playoff flag when available
        margin = ctx.get("margin")
        home_team = ctx.get("home_team")
        is_playoff = int(ctx.get("is_playoff", 0))

        Ra = self._get(winner)
        Rb = self._get(loser)

        # Apply home advantage to pregame rating gap
        gap = Ra - Rb
        if home_team is not None:
            if home_team == winner:
                gap += self.home_adv
            elif home_team == loser:
                gap -= self.home_adv

        # Expected score based on adjusted gap
        Ea = 1.0 / (1.0 + 10 ** (-gap / 400.0))

        # Margin multiplier: log form used in many Elo variants
        if margin is None or margin <= 0:
            mult = 1.0
        else:
            mult = math.log(1.0 + float(margin))

        # Playoff boost to K
        k = self.k_base * (self.playoff_k_boost if is_playoff else 1.0)

        Ra_new = Ra + k * mult * (1 - Ea)
        Rb_new = Rb + k * mult * (0 - (1 - Ea))

        self.ratings[winner] = Ra_new
        self.ratings[loser] = Rb_new
        self._history.append({"GAME_DATE": game_date, "TEAM": winner, "RATING": Ra_new})
        self._history.append({"GAME_DATE": game_date, "TEAM": loser, "RATING": Rb_new})


class TrueSkillEngine(RatingEngine):
    """TrueSkill rating engine (mu used as scalar rating; sigma as uncertainty)."""

    def __init__(self, mu: float = 25.0, sigma: float = 25.0/3.0, beta: float = 25.0/6.0, tau: float = 25.0/300.0, draw_probability: float = 0.0):
        # Configure a private environment so we don't mutate globals elsewhere
        self.env = ts.TrueSkill(mu=mu, sigma=sigma, beta=beta, tau=tau, draw_probability=draw_probability)
        self.players: dict[str, ts.Rating] = {}
        self._history: list[dict] = []

    def _get_player(self, name: str) -> ts.Rating:
        if name not in self.players:
            self.players[name] = self.env.create_rating()
        return self.players[name]

    def record_game(self, winner: str, loser: str, game_date: pd.Timestamp) -> None:
        w = self._get_player(winner)
        l = self._get_player(loser)
        w_new, l_new = self.env.rate_1vs1(w, l)
        self.players[winner] = w_new
        self.players[loser] = l_new
        # Store mu as scalar rating for plotting/exports
        self._history.append({"GAME_DATE": game_date, "TEAM": winner, "RATING": w_new.mu})
        self._history.append({"GAME_DATE": game_date, "TEAM": loser, "RATING": l_new.mu})

    def get_rating(self, team: str) -> float:
        return float(self._get_player(team).mu)

    def get_uncertainty(self, team: str) -> float:
        return float(self._get_player(team).sigma)

    def expected_score(self, rating_a: float, rating_b: float, rd_a: float | None = None, rd_b: float | None = None) -> float:
        """Approximate win probability using normal CDF on (muA-muB) with both sigmas and beta."""
        # Use provided rd as sigma if present; else fetch from players if we can
        # Fallback to environment defaults when unknown
        sigma_a = rd_a
        sigma_b = rd_b
        if sigma_a is None or sigma_b is None:
            # If we can't infer sigmas from args, use env default
            if sigma_a is None:
                sigma_a = self.env.sigma
            if sigma_b is None:
                sigma_b = self.env.sigma
        # Denominator per TrueSkill model (no draws): sqrt(2*beta^2 + sigma_a^2 + sigma_b^2)
        denom = math.sqrt(2 * (self.env.beta ** 2) + (sigma_a ** 2) + (sigma_b ** 2))
        z = (rating_a - rating_b) / denom
        # Standard normal CDF via erf
        return 0.5 * (1.0 + math.erf(z / math.sqrt(2.0)))

# %% Engine-driven rating computation for multiple engines
# Ensure proper date format and sort
results_df["GAME_DATE"] = pd.to_datetime(results_df["GAME_DATE"])
results_df = results_df.sort_values(by="GAME_DATE").reset_index(drop=True)

ENGINES_TO_RUN = [
    ("elo",       lambda: EloEngine(k_factor=32.0, init_rating=1500.0)),
    ("glicko",    lambda: GlickoEngine()),
    ("trueskill", lambda: TrueSkillEngine()),
    ("margin_home_elo", lambda: MarginHomeElo()),
]


def run_engine(engine_name: str, factory) -> pd.DataFrame:
    """Run an engine through all matches, save CSV and plot, and return the full_ratings DataFrame."""
    engine: RatingEngine = factory()

    # Process each game in chronological order via the engine
    # Also compute pre-game prediction correctness for this engine
    pred_correct_flags = []
    for _, row in results_df.iterrows():
        win = row["WIN_TEAM"]
        lose = row["LOSE_TEAM"]
        gdate = row["GAME_DATE"]

        # Get current ratings (before updating) and uncertainties (if available)
        r_win = float(engine.get_rating(win))
        r_lose = float(engine.get_rating(lose))
        try:
            rd_win = engine.get_uncertainty(win)
        except Exception:
            rd_win = None
        try:
            rd_lose = engine.get_uncertainty(lose)
        except Exception:
            rd_lose = None

        # Predict probability that the actual winner beats the loser BEFORE the update
        p_win = engine.win_prob(r_win, r_lose, rd_win, rd_lose)
        pred_correct_flags.append(1 if p_win >= 0.5 else 0)

        # Now update the engine with the actual result, passing context when supported
        ctx = {
            "home_team": row.get("HOME_TEAM", None),
            "margin": row.get("MARGIN", None),
            "is_playoff": row.get("IS_PLAYOFF", 0),
        }
        if hasattr(engine, "record_game_ctx"):
            engine.record_game_ctx(win, lose, gdate, **ctx)
        else:
            engine.record_game(win, lose, gdate)

    # Attach a correctness column to results_df for this engine
    results_df[f"PRED_CORRECT_{engine_name}"] = pred_correct_flags

    # Create DataFrame of recorded ratings from the engine
    ratings_df = pd.DataFrame(engine.history)

    # Get full date range and teams
    all_dates = pd.date_range(start=ratings_df["GAME_DATE"].min(),
                              end=ratings_df["GAME_DATE"].max(),
                              freq="D")
    all_teams = ratings_df["TEAM"].unique()

    # Build full ratings panel and forward fill
    full_index = pd.MultiIndex.from_product([all_dates, all_teams], names=["GAME_DATE", "TEAM"])
    full_ratings = ratings_df.set_index(["GAME_DATE", "TEAM"]).reindex(full_index)
    full_ratings = full_ratings.groupby("TEAM").ffill().reset_index()

    # Save CSV per engine
    csv_path = _out_data_dir / f"ratings_{engine_name}.csv"
    full_ratings.to_csv(str(csv_path), index=False)
    print(f"✅ {engine_name} full_ratings exported to {csv_path}")

    # Plot and save per engine
    plt.figure(figsize=(14, 8))
    for team in all_teams:
        team_data = full_ratings[full_ratings["TEAM"] == team]
        plt.plot(team_data["GAME_DATE"], team_data["RATING"], label=team)
    plt.title(f"{engine_name.capitalize()} Ratings Over Time for All Teams")
    plt.xlabel("Date")
    plt.ylabel("Rating")
    plt.legend(bbox_to_anchor=(1.05, 1), loc='upper left', fontsize='small')
    plt.tight_layout()
    img_path = _out_visuals_dir / f"{engine_name}_ratings_over_time.png"
    plt.savefig(str(img_path), dpi=300)
    plt.close()
    print(f"✅ {engine_name} plot saved as {img_path}")

    return full_ratings

# Run all engines and keep the last full_ratings in memory for downstream helpers
for _name, _factory in ENGINES_TO_RUN:
    full_ratings = run_engine(_name, _factory)

_results_path = _out_data_dir / "results_with_predictions.csv"
results_df.to_csv(str(_results_path), index=False)
print("✅ results_with_predictions.csv saved with per-engine correctness columns")

# Quick accuracy summary
try:
    _df_acc = pd.read_csv(str(_results_path))
    _acc_cols = [c for c in _df_acc.columns if c.startswith("PRED_CORRECT_")]
    if _acc_cols:
        _means = _df_acc[_acc_cols].mean().sort_values(ascending=False)
        print("Mean correctness by engine:")
        for k, v in _means.items():
            print(f"  {k}: {v:.3f}")
except Exception as e:
    print(f"Could not compute mean correctness summary: {e}")

# %% (Removed old export and plot block; handled per engine in run_engine above)

# %%

# Note: full_ratings here refers to the ratings from the last engine executed in the loop above.
# Function to compute win probability between two teams at specified dates using the active engine

def compute_win_probability(team_A_name, date_A, team_B_name, date_B, engine: RatingEngine):
    """
    Compute win probability of team_A (at date_A) vs team_B (at date_B) using ratings from `full_ratings`
    and uncertainty (if available) from the provided `engine`.
    """
    date_A = pd.to_datetime(date_A)
    date_B = pd.to_datetime(date_B)

    rating_row_A = full_ratings[(full_ratings["TEAM"] == team_A_name) & (full_ratings["GAME_DATE"] == date_A)]
    rating_row_B = full_ratings[(full_ratings["TEAM"] == team_B_name) & (full_ratings["GAME_DATE"] == date_B)]

    if rating_row_A.empty or rating_row_B.empty:
        print("Rating not found for one or both teams on the specified dates.")
        return None

    rating_A = float(rating_row_A["RATING"].values[0])
    rating_B = float(rating_row_B["RATING"].values[0])

    # Try to fetch per-team uncertainties from the engine, if defined
    rd_A = None
    rd_B = None
    try:
        rd_A = engine.get_uncertainty(team_A_name)
    except Exception:
        pass
    try:
        rd_B = engine.get_uncertainty(team_B_name)
    except Exception:
        pass

    # Engine-specific implementation via polymorphic win_prob
    prob_A_wins = engine.win_prob(rating_A, rating_B, rd_A, rd_B)

    print(f"Win probability of {team_A_name} (on {date_A.date()}) vs {team_B_name} (on {date_B.date()}): {prob_A_wins:.3f}")
    return prob_A_wins

# Example usage
# To switch engines, set ENGINE_NAME above to one of: "glicko", "elo", "trueskill".
# Example:
# ENGINE_NAME = "elo"
# prob = compute_win_probability("Boston Celtics", "2021-12-15", "LA Lakers", "2021-12-15", engine)