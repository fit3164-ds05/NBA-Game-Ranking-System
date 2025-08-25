"""services/team_stats.py

Generate aggregated team statistics from the raw games dataset.
The resulting summaries are saved under ``backend/data`` and can be
used by the frontend to power richer dashboards.
"""

from __future__ import annotations

from pathlib import Path
import pandas as pd

# Default location of games.csv relative to this file
ROOT = Path(__file__).resolve().parents[1]
DEFAULT_GAMES_CSV = ROOT / "data" / "games.csv"
TEAM_STATS_CSV = ROOT / "data" / "team_stats.csv"
TEAM_SEASON_STATS_CSV = ROOT / "data" / "team_season_stats.csv"


def load_data(csv_path: Path = DEFAULT_GAMES_CSV) -> pd.DataFrame:
    """Load the games dataset from ``csv_path``."""
    return pd.read_csv(csv_path)


def load_team_stats_csv(csv_path: Path = TEAM_STATS_CSV) -> pd.DataFrame:
    """Load precomputed overall team statistics."""
    return pd.read_csv(csv_path)


def load_team_season_stats_csv(csv_path: Path = TEAM_SEASON_STATS_CSV) -> pd.DataFrame:
    """Load precomputed per-season team statistics."""
    return pd.read_csv(csv_path)


def _add_opponent_points(df: pd.DataFrame) -> pd.DataFrame:
    """Compute opponent points for each game.

    ``PLUS_MINUS`` represents the margin by which a team outscored its
    opponent.  Subtracting this from the team's points yields the
    points allowed in that game.
    """
    df = df.copy()
    df["OPP_PTS"] = df["PTS"] - df["PLUS_MINUS"]
    return df


def compute_metrics(df: pd.DataFrame) -> pd.DataFrame:
    """Compute aggregate statistics for each team across all seasons."""
    df_opponent = _add_opponent_points(df)
    grouped = df_opponent.groupby("TEAM_ID")

    team_stats = grouped.agg(
        team_name=("TEAM_NAME", "first"),
        games_played=("GAME_ID", "count"),
        wins=("WL", "sum"),
        losses=("WL", lambda x: (1 - x).sum()),
        win_rate=("WL", "mean"),
        avg_points=("PTS", "mean"),
        avg_opp_points=("OPP_PTS", "mean"),
        avg_point_diff=("PLUS_MINUS", "mean"),
        avg_FG_pct=("FG_PCT", "mean"),
        avg_3pt_pct=("FG3_PCT", "mean"),
        avg_FT_pct=("FT_PCT", "mean"),
        avg_reb=("REB", "mean"),
        avg_oreb=("OREB", "mean"),
        avg_dreb=("DREB", "mean"),
        avg_assists=("AST", "mean"),
        avg_turnovers=("TOV", "mean"),
        avg_steals=("STL", "mean"),
        avg_blocks=("BLK", "mean"),
        avg_fouls=("PF", "mean"),
        avg_points_rolling=("PTS_ROLLING_AVG_5", "mean"),
    ).reset_index()
    return team_stats


def compute_season_metrics(df: pd.DataFrame) -> pd.DataFrame:
    """Compute per-season aggregate statistics for each team."""
    df_opponent = _add_opponent_points(df)
    grouped = df_opponent.groupby(["SEASON_YEAR", "TEAM_ID"])

    per_season = grouped.agg(
        team_name=("TEAM_NAME", "first"),
        games_played=("GAME_ID", "count"),
        wins=("WL", "sum"),
        losses=("WL", lambda x: (1 - x).sum()),
        win_rate=("WL", "mean"),
        avg_points=("PTS", "mean"),
        avg_opp_points=("OPP_PTS", "mean"),
        avg_point_diff=("PLUS_MINUS", "mean"),
        avg_FG_pct=("FG_PCT", "mean"),
        avg_3pt_pct=("FG3_PCT", "mean"),
        avg_FT_pct=("FT_PCT", "mean"),
        avg_reb=("REB", "mean"),
        avg_oreb=("OREB", "mean"),
        avg_dreb=("DREB", "mean"),
        avg_assists=("AST", "mean"),
        avg_turnovers=("TOV", "mean"),
        avg_steals=("STL", "mean"),
        avg_blocks=("BLK", "mean"),
        avg_fouls=("PF", "mean"),
        avg_points_rolling=("PTS_ROLLING_AVG_5", "mean"),
    ).reset_index()

    return per_season


def get_top_teams(team_stats: pd.DataFrame, metric: str, n: int = 5, ascending: bool = False) -> pd.DataFrame:
    """Return the top ``n`` teams for a given metric."""
    if metric not in team_stats.columns:
        raise ValueError(f"Metric '{metric}' not found in team_stats")
    return team_stats.sort_values(metric, ascending=ascending).head(n)


def get_top_teams_by_season(per_season_stats: pd.DataFrame, metric: str, n: int = 3, ascending: bool = False) -> pd.DataFrame:
    """Return the top ``n`` teams in each season for a given metric."""
    if metric not in per_season_stats.columns:
        raise ValueError(f"Metric '{metric}' not found in per_season_stats")
    sorted_df = per_season_stats.sort_values(["SEASON_YEAR", metric], ascending=[True, ascending])
    return sorted_df.groupby("SEASON_YEAR").head(n)


def run_analysis(output_dir: Path = DEFAULT_GAMES_CSV.parent) -> None:
    """Run metrics computation and save CSVs under ``output_dir``."""
    df = load_data()
    team_stats = compute_metrics(df)
    per_season = compute_season_metrics(df)

    team_stats.to_csv(output_dir / "team_stats.csv", index=False)
    per_season.to_csv(output_dir / "team_season_stats.csv", index=False)


if __name__ == "__main__":
    run_analysis()
