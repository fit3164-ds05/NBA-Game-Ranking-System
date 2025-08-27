from pathlib import Path
from datetime import date

import pandas as pd
from nba_api.stats.endpoints import leaguegamelog


def _current_season() -> str:
    """Return the current NBA season in ``YYYY-YY`` format."""
    today = date.today()
    start_year = today.year if today.month >= 7 else today.year - 1
    end_year = (start_year + 1) % 100
    return f"{start_year}-{end_year:02d}"


def fetch_games(season: str, season_type: str = "Regular Season") -> pd.DataFrame:
    """Fetch games for a given season and season type from ``nba_api``."""
    gamelog = leaguegamelog.LeagueGameLog(
        season=season, season_type_all_star=season_type
    )
    df = gamelog.get_data_frames()[0]
    cols = [
        "GAME_ID",
        "GAME_DATE",
        "TEAM_ID",
        "TEAM_NAME",
        "TEAM_ABBREVIATION",
        "MATCHUP",
        "WL",
        "PTS",
    ]
    df = df.loc[:, cols].copy()
    df["WL"] = df["WL"].map({"W": 1, "L": 0}).astype(int)
    return df


def load_games(
    data_dir: str | Path | None = None,
    seasons: list[str] | None = None,
    refresh: bool = False,
) -> pd.DataFrame:
    """Load and join regular season and playoff games into a single DataFrame.

    If the expected CSV files are missing or ``refresh`` is ``True``, data is
    scraped from ``nba_api`` for the provided ``seasons`` and cached locally.

    Parameters
    ----------
    data_dir:
        Optional override of the directory containing ``games.csv`` and
        ``playoffs.csv``. By default the repository's ``Data`` folder is used.
    seasons:
        Iterable of season strings in ``YYYY-YY`` format used when scraping via
        the API. Defaults to the current season.
    refresh:
        If ``True``, force re-download of data even if cached files exist.

    Returns
    -------
    pandas.DataFrame
        Joined games with an ``IS_PLAYOFF`` column and duplicate rows removed.

    This function is intentionally simple so contributors can extend the data
    sources or perform additional cleaning steps in a central location.
    """
    base_dir = Path(__file__).resolve().parent
    backend_dir = base_dir.parent
    data_path = Path(data_dir) if data_dir is not None else backend_dir / "Data"

    games_csv = data_path / "games.csv"
    playoffs_csv = data_path / "playoffs.csv"

    if refresh or not (games_csv.exists() and playoffs_csv.exists()):
        seasons = seasons or [_current_season()]
        reg_frames = [fetch_games(season, "Regular Season") for season in seasons]
        po_frames = [fetch_games(season, "Playoffs") for season in seasons]
        data_path.mkdir(parents=True, exist_ok=True)
        pd.concat(reg_frames).to_csv(games_csv, index=False)
        pd.concat(po_frames).to_csv(playoffs_csv, index=False)

    games_original = pd.read_csv(games_csv)
    playoff_games = pd.read_csv(playoffs_csv)

    common_cols = sorted(set(games_original.columns).intersection(playoff_games.columns))

    games_original["IS_PLAYOFF"] = 0
    playoff_games["IS_PLAYOFF"] = 1
    playoff_games["WL"] = [0 if x == "L" else 1 for x in playoff_games["WL"]]

    games = pd.concat(
        [
            games_original[common_cols + ["IS_PLAYOFF"]],
            playoff_games[common_cols + ["IS_PLAYOFF"]],
        ],
        ignore_index=True,
    )

    games = games.drop_duplicates()
    games = games.sort_values("IS_PLAYOFF", ascending=False)
    games = games.drop_duplicates(
        subset=[c for c in games.columns if c != "IS_PLAYOFF"], keep="first"
    )

    # Normalize historical team names
    name_map = {
        "Los Angeles Clippers": "LA Clippers",
        "New Jersey Nets": "Brooklyn Nets",
        "New Orleans Hornets": "New Orleans Pelicans",
    }
    games["TEAM_NAME"] = games["TEAM_NAME"].replace(name_map)
    return games


def build_results(games: pd.DataFrame) -> pd.DataFrame:
    """Create a tidy results DataFrame from the joined games table."""
    results: list[dict] = []

    for game_id, group in games.groupby("GAME_ID"):
        if len(group) != 2:
            continue
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

        results.append(
            {
                "GAME_ID": game_id,
                "GAME_DATE": row1["GAME_DATE"],
                "WIN_TEAM": win_team,
                "LOSE_TEAM": lose_team,
                "POINTS_W": points_w,
                "POINTS_L": points_l,
            }
        )

    results_df = pd.DataFrame(results)

    # Determine home team from MATCHUP pattern
    home_by_gid: dict[str, str | None] = {}
    for gid, grp in games.groupby("GAME_ID"):
        home_row = grp[grp["MATCHUP"].astype(str).str.contains(" vs. ")]
        if not home_row.empty:
            home_by_gid[gid] = home_row.iloc[0]["TEAM_NAME"]
        else:
            home_by_gid[gid] = None

    is_po_by_gid = (
        games.drop_duplicates("GAME_ID").set_index("GAME_ID")["IS_PLAYOFF"].to_dict()
    )

    results_df["HOME_TEAM"] = results_df["GAME_ID"].map(home_by_gid)
    results_df["IS_PLAYOFF"] = (
        results_df["GAME_ID"].map(is_po_by_gid).fillna(0).astype(int)
    )
    results_df["MARGIN"] = results_df["POINTS_W"] - results_df["POINTS_L"]
    return results_df
