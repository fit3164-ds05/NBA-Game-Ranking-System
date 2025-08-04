# %% importing dataset and libraries
import pandas as pd
games = pd.read_csv("Datasets/games.csv")

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
# dropping identical rows (besides win_streak, rolling_point since they were stuffed by the duplicate games
games = games.drop_duplicates(subset=games.columns[:-3])

game_id_counts = games['GAME_ID'].value_counts()
exceptions = game_id_counts[game_id_counts != 2]

if exceptions.empty:
    print("✅ All GAME_IDs appear exactly twice.")
else:
    print("❌ Exceptions found:")
    print(exceptions)


##
# Creating a table
# Game ID, Date, Win Team, Lose Team, Draw, Point Diff
#
#
# %% Creating a results DF
# Create results table
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
        "DRAW": 0,
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

from glicko2 import Player
import pandas as pd

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

# %% Plotting
