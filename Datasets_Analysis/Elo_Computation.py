# %% importing dataset and libraries
from pathlib import Path
import os

import pandas as pd
import numpy as np
from glicko2 import Player

# Resolve paths dynamically so this works no matter the working directory
try:
    _base_dir = Path(__file__).resolve().parent
except NameError:
    # Fallback for environments that do not define __file__
    _base_dir = Path.cwd()


def _find_root(start: Path, marker: str = "Datasets_Analysis", max_up: int = 5) -> Path:
    """Walk up the directory tree to find the project root that contains `marker`."""
    p = start
    for _ in range(max_up):
        if (p / marker).exists():
            return p
        p = p.parent
    return start


_project_root = _find_root(_base_dir)
_data_dir = _project_root / "Datasets_Analysis" / "Datasets"

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

# %% Glicko
# Install package if needed
# pip install glicko2

# Ensure proper date format and sort
results_df["GAME_DATE"] = pd.to_datetime(results_df["GAME_DATE"])
results_df = results_df.sort_values(by="GAME_DATE").reset_index(drop=True)

# Create a dictionary to store players
players = {}
history = []  # to store ratings over time

# Helper to get or create a player
def get_player(name):
    if name not in players:
        players[name] = Player()
    return players[name]

# Process each game in chronological order
for _, row in results_df.iterrows():
    winner = get_player(row["WIN_TEAM"])
    loser = get_player(row["LOSE_TEAM"])

    # Winner beats loser
    winner.update_player([loser.getRating()], [loser.getRd()], [1])
    loser.update_player([winner.getRating()], [winner.getRd()], [0])

    # Store snapshot for both teams after the game
    history.append({
        "GAME_DATE": row["GAME_DATE"],
        "TEAM": row["WIN_TEAM"],
        "RATING": winner.getRating()
    })
    history.append({
        "GAME_DATE": row["GAME_DATE"],
        "TEAM": row["LOSE_TEAM"],
        "RATING": loser.getRating()
    })

# Create DataFrame of recorded ratings
ratings_df = pd.DataFrame(history)

# Get full date range
all_dates = pd.date_range(start=ratings_df["GAME_DATE"].min(),
                          end=ratings_df["GAME_DATE"].max(),
                          freq="D")

# Get all teams
all_teams = ratings_df["TEAM"].unique()

# Create complete index of all dates for all teams
full_index = pd.MultiIndex.from_product([all_dates, all_teams], names=["GAME_DATE", "TEAM"])
full_ratings = ratings_df.set_index(["GAME_DATE", "TEAM"]).reindex(full_index)

# Forward-fill ratings so teams keep their last known rating when not playing
full_ratings = full_ratings.groupby("TEAM").ffill()

# Reset index for easier use
full_ratings = full_ratings.reset_index()

print(full_ratings.head(20))

# %% Plot ratings over time for all teams
import matplotlib.pyplot as plt

# Plot ratings over time for all teams
plt.figure(figsize=(14, 8))
for team in all_teams:
    team_data = full_ratings[full_ratings["TEAM"] == team]
    plt.plot(team_data["GAME_DATE"], team_data["RATING"], label=team)

plt.title("Glicko Ratings Over Time for All Teams")
plt.xlabel("Date")
plt.ylabel("Rating")
plt.legend(bbox_to_anchor=(1.05, 1), loc='upper left', fontsize='small')
plt.tight_layout()
plt.show()

# %% Export ratings data and plot
# Export full_ratings DataFrame to CSV
full_ratings.to_csv("full_ratings.csv", index=False)
print("✅ full_ratings exported to full_ratings.csv")

# Save the plot as an image
plt.figure(figsize=(14, 8))
for team in all_teams:
    team_data = full_ratings[full_ratings["TEAM"] == team]
    plt.plot(team_data["GAME_DATE"], team_data["RATING"], label=team)

plt.title("Glicko Ratings Over Time for All Teams")
plt.xlabel("Date")
plt.ylabel("Rating")
plt.legend(bbox_to_anchor=(1.05, 1), loc='upper left', fontsize='small')
plt.tight_layout()
plt.savefig("glicko_ratings_over_time.png", dpi=300)
print("✅ Plot saved as glicko_ratings_over_time.png")

# %%
def glicko_expected_score(rating_A, rating_B, rd_B):
    """
    Compute expected win probability of player A against player B using the Glicko expected score formula.
    """
    q = np.log(10) / 400
    g = 1 / np.sqrt(1 + (3 * q ** 2 * rd_B ** 2) / (np.pi ** 2))
    E = 1 / (1 + 10 ** (-g * (rating_A - rating_B) / 400))
    return E


# Function to compute win probability between two teams at specified dates
def compute_win_probability(team_A_name, date_A, team_B_name, date_B):
    """
    Compute win probability of team_A (at date_A) vs team_B (at date_B)
    """
    date_A = pd.to_datetime(date_A)
    date_B = pd.to_datetime(date_B)

    rating_row_A = full_ratings[(full_ratings["TEAM"] == team_A_name) & (full_ratings["GAME_DATE"] == date_A)]
    rating_row_B = full_ratings[(full_ratings["TEAM"] == team_B_name) & (full_ratings["GAME_DATE"] == date_B)]

    if rating_row_A.empty or rating_row_B.empty:
        print("Rating not found for one or both teams on the specified dates.")
        return None

    rating_A = rating_row_A["RATING"].values[0]
    rating_B = rating_row_B["RATING"].values[0]

    player_A = players[team_A_name]
    player_B = players[team_B_name]

    prob_A_wins = glicko_expected_score(rating_A, rating_B, player_B.getRd())
    print(f"Win probability of {team_A_name} (on {date_A.date()}) vs {team_B_name} (on {date_B.date()}): {prob_A_wins:.3f}")
    return prob_A_wins

# Example usage




