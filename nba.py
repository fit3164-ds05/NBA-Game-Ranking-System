from nba_api.stats.endpoints import leaguegamelog
import pandas as pd

# Regular season example. Change to the season you want, format YYYY-YY
SEASON = "2023-24"            # eg "2024-25" when that season is available
SEASON_TYPE = "Regular Season"  # or "Playoffs"

# Pull the league wide game log
gamelog = leaguegamelog.LeagueGameLog(season=SEASON,
                                      season_type_all_star=SEASON_TYPE)
df = gamelog.get_data_frames()[0]

# Keep the essentials and compute points against from plus minus
out = df.loc[:, ["GAME_ID", "GAME_DATE", "TEAM_ID", "TEAM_NAME",
                 "TEAM_ABBREVIATION", "MATCHUP", "WL", "PTS", "PLUS_MINUS"]].copy()
out["OPP_PTS"] = out["PTS"] - out["PLUS_MINUS"]  # points against
out = out.rename(columns={"PTS": "PTS_FOR", "GAME_DATE": "DATE"})

# Optional filter to one team, for example Boston Celtics
team_out = out[out["TEAM_ABBREVIATION"] == "BOS"]

# Sort by date if desired
out = out.sort_values("DATE")
team_out = team_out.sort_values("DATE")

print(out.head())
print(team_out.head())