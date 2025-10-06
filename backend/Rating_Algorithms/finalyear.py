# JUST THE FINAL 2024-25 SEASON, INCLUDING MANUAL FIXES

from nba_api.stats.endpoints import leaguegamelog
from nba_api.stats.static import teams
from teamdictionary import normalize_team_abbrev, defunct, get_team_name
import pandas as pd
import numpy as np

import re

def _is_home(matchup: str) -> bool:
    if not isinstance(matchup, str):
        return False
    # NBA API sometimes uses "vs." (with a dot) or "vs" (without).
    return bool(re.search(r"\svs\.?\s", matchup))

def _prep_side(df: pd.DataFrame, home: bool) -> pd.DataFrame:
    side = df[df["IS_HOME"] == home].copy()
    prefix = "HOME_" if home else "AWAY_"
    keep_cols = [
        "GAME_ID", "GAME_DATE", "SEASON_ID", "TEAM_ID", "TEAM_ABBREVIATION", "PTS", "WL"
    ]
    side = side[keep_cols]
    side = side.rename(columns={
        "TEAM_ID": prefix + "TEAM_ID",
        "TEAM_ABBREVIATION": prefix + "TEAM_ABBREVIATION",
        "PTS": prefix + "PTS",
        "WL": prefix + "WL",
    })
    return side


season_types = ["Regular Season", "Playoffs"]  # add "Pre Season" / "All Star" if desired
season_frames = []
for st in season_types:
    res = leaguegamelog.LeagueGameLog(
    season='2024-25',
    season_type_all_star=st,
    player_or_team_abbreviation='T'
    )
    df = res.get_data_frames()[0]
    if not df.empty:
    # Normalize/skip defunct teams if helper exists; otherwise just normalize
        try:
            df["TEAM_ABBREVIATION_NORM"] = df["TEAM_ABBREVIATION"].apply(normalize_team_abbrev)
            df = df[df["TEAM_ABBREVIATION_NORM"].notna()].copy()
            df["TEAM_ABBREVIATION"] = df.pop("TEAM_ABBREVIATION_NORM")
        except NameError:
            df["TEAM_ABBREVIATION"] = df["TEAM_ABBREVIATION"].apply(normalize_team_abbrev)

    # Determine home/away from MATCHUP
    df["IS_HOME"] = df["MATCHUP"].apply(_is_home)

    # Build home and away sides
    home_df = _prep_side(df, home=True)
    away_df = _prep_side(df, home=False)

    # Check for duplicates in home/away dataframes
    
    dupes = away_df[away_df.duplicated(subset=["GAME_ID", "GAME_DATE", "SEASON_ID"], keep=False)]
    ids = dupes['GAME_ID'].unique()
    # Merge separately after
    home_df = home_df[~home_df["GAME_ID"].isin(ids)]
    away_df = away_df[~away_df["GAME_ID"].isin(ids)]

    # Append to home_df/away_df as needed depending on your merge format
    # If you merge on GAME_ID, GAME_DATE, SEASON_ID with split home/away dfs,
    # you could instead just keep manual_df as a "resolved" dataset and concat later


    # Merge into single row per game
    game_df = pd.merge(
        home_df,
        away_df,
        on=["GAME_ID", "GAME_DATE", "SEASON_ID"],
        how="inner",
        validate="one_to_one",
    )

    # Compute winner/loser by points
    game_df["WINNER_TEAM_ABBREVIATION"] = np.where(
        game_df["HOME_PTS"] > game_df["AWAY_PTS"],
        game_df["HOME_TEAM_ABBREVIATION"],
        game_df["AWAY_TEAM_ABBREVIATION"],
    )
    game_df["LOSER_TEAM_ABBREVIATION"] = np.where(
        game_df["HOME_PTS"] > game_df["AWAY_PTS"],
        game_df["AWAY_TEAM_ABBREVIATION"],
        game_df["HOME_TEAM_ABBREVIATION"],
    )
    game_df["WINNER_TEAM_ID"] = np.where(
        game_df["HOME_PTS"] > game_df["AWAY_PTS"],
        game_df["HOME_TEAM_ID"],
        game_df["AWAY_TEAM_ID"],
    )
    game_df["LOSER_TEAM_ID"] = np.where(
        game_df["HOME_PTS"] > game_df["AWAY_PTS"],
        game_df["AWAY_TEAM_ID"],
        game_df["HOME_TEAM_ID"],
    )

    # Human-readable team names via teamdictionary.get_team_name
    game_df["HOME_TEAM_NAME"] = game_df["HOME_TEAM_ABBREVIATION"].apply(get_team_name)
    game_df["AWAY_TEAM_NAME"] = game_df["AWAY_TEAM_ABBREVIATION"].apply(get_team_name)
    game_df["WINNER_TEAM_NAME"] = game_df["WINNER_TEAM_ABBREVIATION"].apply(get_team_name)
    game_df["LOSER_TEAM_NAME"] = game_df["LOSER_TEAM_ABBREVIATION"].apply(get_team_name)
    game_df["YEAR"] = int(2024)
    game_df["HOME_DEFUNCT"] = False
    game_df["AWAY_DEFUNCT"] = False


    game_df["SEASON_TYPE"] = st

    # Optional: sort columns for readability
    ordered_cols = [
        "SEASON_ID", "YEAR", "SEASON_TYPE", "GAME_ID", "GAME_DATE",
        "HOME_TEAM_ID", "HOME_TEAM_ABBREVIATION", "HOME_TEAM_NAME", "HOME_PTS", "HOME_WL",
        "AWAY_TEAM_ID", "AWAY_TEAM_ABBREVIATION", "AWAY_TEAM_NAME", "AWAY_PTS", "AWAY_WL",
        "WINNER_TEAM_ID", "WINNER_TEAM_ABBREVIATION", "WINNER_TEAM_NAME",
        "LOSER_TEAM_ID", "LOSER_TEAM_ABBREVIATION", "LOSER_TEAM_NAME", "HOME_DEFUNCT", "AWAY_DEFUNCT"
    ]
    ordered_cols = [c for c in ordered_cols if c in game_df.columns]
    game_df = game_df[ordered_cols]
    season_frames.append(game_df)

# --- Manual injections for known games ---
manual_games = [
    # GAME_ID, GAME_DATE, SEASON_ID, HOME/ AWAY fields
    {
        "SEASON_ID": 22024,
        "YEAR": 2024,
        "SEASON_TYPE": "Regular Season",
        "GAME_ID": "0022401230",
        "GAME_DATE": "2024-12-14",
        "HOME_TEAM_ID": 1610612760,
        "HOME_TEAM_ABBREVIATION": "OKC",
        "HOME_PTS": 111,
        "HOME_WL": "W",
        "AWAY_TEAM_ID": 1610612745,
        "AWAY_TEAM_ABBREVIATION": "HOU",
        "AWAY_PTS": 96,
        "AWAY_WL": "L",
        "WINNER_TEAM_ID": 1610612760,
        "WINNER_TEAM_ABBREVIATION": "OKC",
        "LOSER_TEAM_ID": 1610612745,
        "LOSER_TEAM_ABBREVIATION": "HOU",
        "HOME_DEFUNCT": False,
        "AWAY_DEFUNCT": False,
    },
    {
        "SEASON_ID": 22024,
        "YEAR": 2024,
        "SEASON_TYPE": "Regular Season",
        "GAME_ID": "0022401229",
        "GAME_DATE": "2024-12-14",
        "HOME_TEAM_ID": 1610612749,
        "HOME_TEAM_ABBREVIATION": "MIL",
        "HOME_PTS": 110,
        "HOME_WL": "W",
        "AWAY_TEAM_ID": 1610612737,
        "AWAY_TEAM_ABBREVIATION": "ATL",
        "AWAY_PTS": 102,
        "AWAY_WL": "L",
        "WINNER_TEAM_ID": 1610612749,
        "WINNER_TEAM_ABBREVIATION": "MIL",
        "LOSER_TEAM_ID": 1610612737,
        "LOSER_TEAM_ABBREVIATION": "ATL",
        "HOME_DEFUNCT": False,
        "AWAY_DEFUNCT": False,
    },
    {
        "SEASON_ID": 22024,
        "YEAR": 2024,
        "SEASON_TYPE": "Regular Season",
        "GAME_ID": "0022400621",
        "GAME_DATE": "2025-01-23",
        "HOME_TEAM_ID": 1610612754,
        "HOME_TEAM_ABBREVIATION": "IND",
        "HOME_PTS": 110,
        "HOME_WL": "L",
        "AWAY_TEAM_ID": 1610612759,
        "AWAY_TEAM_ABBREVIATION": "SAS",
        "AWAY_PTS": 140,
        "AWAY_WL": "W",
        "WINNER_TEAM_ID": 1610612759,
        "WINNER_TEAM_ABBREVIATION": "SAS",
        "LOSER_TEAM_ID": 1610612754,
        "LOSER_TEAM_ABBREVIATION": "IND",
        "HOME_DEFUNCT": False,
        "AWAY_DEFUNCT": False,
    },
    {
        "SEASON_ID": 22024,
        "YEAR": 2024,
        "SEASON_TYPE": "Regular Season",
        "GAME_ID": "0022400633",
        "GAME_DATE": "2025-01-25",
        "HOME_TEAM_ID": 1610612759,
        "HOME_TEAM_ABBREVIATION": "SAS",
        "HOME_PTS": 98,
        "HOME_WL": "L",
        "AWAY_TEAM_ID": 1610612754,
        "AWAY_TEAM_ABBREVIATION": "IND",
        "AWAY_PTS": 136,
        "AWAY_WL": "W",
        "WINNER_TEAM_ID": 1610612754,
        "WINNER_TEAM_ABBREVIATION": "IND",
        "LOSER_TEAM_ID": 1610612759,
        "LOSER_TEAM_ABBREVIATION": "SAS",
        "HOME_DEFUNCT": False,
        "AWAY_DEFUNCT": False,
    },
    {
        "SEASON_ID": 22024,
        "YEAR": 2024,
        "SEASON_TYPE": "Regular Season",
        "GAME_ID": "0022400147",
        "GAME_DATE": "2024-11-02",
        "HOME_TEAM_ID": 1610612748,
        "HOME_TEAM_ABBREVIATION": "MIA",
        "HOME_PTS": 118,
        "HOME_WL": "W",
        "AWAY_TEAM_ID": 1610612764,
        "AWAY_TEAM_ABBREVIATION": "WAS",
        "AWAY_PTS": 98,
        "AWAY_WL": "L",
        "WINNER_TEAM_ID": 1610612748,
        "WINNER_TEAM_ABBREVIATION": "MIA",
        "LOSER_TEAM_ID": 1610612764,
        "LOSER_TEAM_ABBREVIATION": "WAS",
        "HOME_DEFUNCT": False,
        "AWAY_DEFUNCT": False,
    },
]
manual_df = pd.DataFrame(manual_games)

# Add human-readable team names for manual injections
manual_df["HOME_TEAM_NAME"] = manual_df["HOME_TEAM_ABBREVIATION"].apply(get_team_name)
manual_df["AWAY_TEAM_NAME"] = manual_df["AWAY_TEAM_ABBREVIATION"].apply(get_team_name)
manual_df["WINNER_TEAM_NAME"] = manual_df["WINNER_TEAM_ABBREVIATION"].apply(get_team_name)
manual_df["LOSER_TEAM_NAME"] = manual_df["LOSER_TEAM_ABBREVIATION"].apply(get_team_name)
# Combine all season DataFrames into one


final_df = pd.concat(season_frames, ignore_index=True)

# Concatenate manual_df as well
combined_df = pd.concat([final_df, manual_df], ignore_index=True)
# Sort by GAME_DATE, then GAME_ID for stability
combined_df = combined_df.sort_values(by=["GAME_DATE", "GAME_ID"]).reset_index(drop=True)
# combined_df["YEAR"] = combined_df["YEAR"].astype("int64")
combined_df.to_csv("2024-25.csv", index=False)

# Save to CSV
existing_df = pd.read_csv("nbagames_finalised.csv")
final_combined = pd.concat([existing_df, combined_df], ignore_index=True)
final_combined.to_csv("nba_game_outcomes.csv", index=False)
