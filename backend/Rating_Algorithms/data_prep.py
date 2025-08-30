from pathlib import Path

import pandas as pd


def load_games(data_dir: str | Path | None = None) -> pd.DataFrame:
    """Load games from the enlarged combined dataset.

    Parameters
    ----------
    data_dir:
        Optional override of the directory containing ``enlarged_dataset.csv``.
        By default the repository's ``Data`` folder is used.

    Returns
    -------
    pandas.DataFrame
        Games with an ``IS_PLAYOFF`` column derived from ``SEASON_TYPE``.

    This function is intentionally simple so contributors can extend the data
    sources or perform additional cleaning steps in a central location.
    """
    base_dir = Path(__file__).resolve().parent
    backend_dir = base_dir.parent
    data_path = Path(data_dir) if data_dir is not None else backend_dir / "Data"

    games_csv = data_path / "enlarged_dataset.csv"
    games = pd.read_csv(games_csv)

    games = games.drop_duplicates(subset="GAME_ID")


    if "SEASON_TYPE" in games.columns:
        games["IS_PLAYOFF"] = (
            games["SEASON_TYPE"].astype(str).str.contains("Playoff", case=False).astype(int)
        )
    else:
        games["IS_PLAYOFF"] = 0

    # Normalize historical team names
    name_map = {
        "Los Angeles Clippers": "LA Clippers",
        "New Jersey Nets": "Brooklyn Nets",
        "New Orleans Hornets": "New Orleans Pelicans",
    }
    for col in [
        "HOME_TEAM_NAME",
        "AWAY_TEAM_NAME",
        "WINNER_TEAM_NAME",
        "LOSER_TEAM_NAME",
    ]:
        if col in games.columns:
            games[col] = games[col].replace(name_map)
    return games


def build_results(games: pd.DataFrame) -> pd.DataFrame:
    """Create a tidy results DataFrame from the enlarged games table."""
    results: list[dict] = []

    for _, row in games.iterrows():
        win_team = row["WINNER_TEAM_NAME"]
        lose_team = row["LOSER_TEAM_NAME"]

        if win_team == row.get("HOME_TEAM_NAME"):
            points_w = row.get("HOME_PTS")
            points_l = row.get("AWAY_PTS")
        else:
            points_w = row.get("AWAY_PTS")
            points_l = row.get("HOME_PTS")

        results.append(
            {
                "GAME_ID": row.get("GAME_ID"),
                "GAME_DATE": row.get("GAME_DATE"),
                "WIN_TEAM": win_team,
                "LOSE_TEAM": lose_team,
                "POINTS_W": points_w,
                "POINTS_L": points_l,
                "HOME_TEAM": row.get("HOME_TEAM_NAME"),
                "IS_PLAYOFF": row.get("IS_PLAYOFF", 0),
            }
        )

    results_df = pd.DataFrame(results)
    results_df["MARGIN"] = results_df["POINTS_W"] - results_df["POINTS_L"]
    return results_df
