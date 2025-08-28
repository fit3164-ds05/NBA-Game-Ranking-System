# YIELDING NBA GAMES FROM 1946-47 TO 2023-24

from nba_api.stats.static import players
from nba_api.stats.endpoints import commonplayerinfo, playergamelog, scoreboardv2
import numpy as np
import time
import pandas as pd
from nba_api.stats.endpoints import leaguegamelog
from nba_api.stats.static import teams
from teamdictionary import normalize_team_abbrev, defunct, get_team_name

# --- Helpers for home/away + game-level merge ---
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

# Build season strings like "1996-97", "1997-98", ..., "2023-24"
start_year = 1946
end_year = 2023 # set to the season *start* year you want (2023 -> "2023-24")
seasons = [f"{y}-{str(y+1)[-2:]}" for y in range(start_year, end_year + 1)]

all_games = []

# Loop through each season and collect all games, aggregating to one row per GAME_ID
for s in seasons:
    try:
        season_types = ["Regular Season", "Playoffs"]  # add "Pre Season" / "All Star" if desired
        season_frames = []
        for st in season_types:
            res = leaguegamelog.LeagueGameLog(
                season=s,
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

                if st == 'Regular Season':
                    game_df["YEAR"] = game_df["SEASON_ID"].astype(int) - 20000
                else:
                    game_df["YEAR"] = game_df["SEASON_ID"].astype(int) - 40000
                
                game_df["SEASON_TYPE"] = st
                game_df['HOME_DEFUNCT'] = game_df['HOME_TEAM_ABBREVIATION'].apply(lambda x: x in defunct)
                game_df['AWAY_DEFUNCT'] = game_df['AWAY_TEAM_ABBREVIATION'].apply(lambda x: x in defunct)



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

            time.sleep(0.6)

        if season_frames:
            all_games.append(pd.concat(season_frames, ignore_index=True))
    except Exception as e:
        time.sleep(1.0)
        continue

# Concatenate all season dataframes into one
all_games_df = pd.concat(all_games, ignore_index=True)

# Export the combined dataframe to a CSV file (one row per game, with home/away and winner/loser)
all_games_df.to_csv("nbagames_finalised.csv", index=False)
