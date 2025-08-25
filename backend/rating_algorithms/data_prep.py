from pathlib import Path
import pandas as pd


def load_joined_games(data_dir: Path) -> pd.DataFrame:
    """Load regular season and playoff data, normalize schema, and de-duplicate."""
    games_csv = data_dir / "games.csv"
    playoffs_csv = data_dir / "playoffs.csv"

    print(f"Using data files from: {games_csv} and {playoffs_csv}")

    games_original = pd.read_csv(games_csv)
    playoff_games = pd.read_csv(playoffs_csv)

    common_cols = sorted(set(games_original.columns).intersection(set(playoff_games.columns)))
    only_in_games = sorted(set(games_original.columns) - set(playoff_games.columns))
    only_in_playoffs = sorted(set(playoff_games.columns) - set(games_original.columns))

    print(f"Common columns ({len(common_cols)}):")
    print("\n".join(common_cols))
    print(f"\nColumns only in games ({len(only_in_games)}):")
    print("\n".join(only_in_games))
    print(f"\nColumns only in playoffs ({len(only_in_playoffs)}):")
    print("\n".join(only_in_playoffs))

    games_original["IS_PLAYOFF"] = 0
    playoff_games["IS_PLAYOFF"] = 1
    playoff_games["WL"] = [0 if x == "L" else 1 for x in playoff_games["WL"]]

    games = pd.concat([
        games_original[common_cols + ["IS_PLAYOFF"]],
        playoff_games[common_cols + ["IS_PLAYOFF"]]
    ], ignore_index=True)

    print(f"Joined regular season and playoffs on {len(common_cols)} common columns: {common_cols}")
    print(f"Combined shape: {games.shape}")

    games = games.drop_duplicates()
    games = games.sort_values("IS_PLAYOFF", ascending=False)
    games = games.drop_duplicates(subset=[c for c in games.columns if c != "IS_PLAYOFF"], keep="first")

    name_map = {
        "Los Angeles Clippers": "LA Clippers",
        "New Jersey Nets": "Brooklyn Nets",
        "New Orleans Hornets": "New Orleans Pelicans",
        "Charlotte Bobcats": "Charlotte Hornets"
    }
    games["TEAM_NAME"] = games["TEAM_NAME"].replace(name_map)

    game_id_counts = games['GAME_ID'].value_counts()
    exceptions = game_id_counts[game_id_counts != 2]
    if exceptions.empty:
        print("All GAME_IDs appear exactly twice.")
    else:
        print("Exceptions found:")
        print(exceptions)
        print(f"{len(exceptions)} exceptions found")

    return games


def explore_dataframe(df: pd.DataFrame, num_rows: int = 5) -> None:
    """Print basic information about a DataFrame."""
    pd.set_option('display.max_columns', None)
    pd.set_option('display.max_colwidth', None)
    pd.set_option('display.width', None)
    print("First few rows:")
    print(df.head(num_rows))
    print("\nDimensions (rows, columns):")
    print(df.shape)
    print("\nColumn names:")
    print(list(df.columns))


def summarize_games(df: pd.DataFrame, topk: int = 20) -> None:
    """Print a concise profile of the joined games DataFrame."""
    print("\n=== Schema summary ===")
    print("Dtypes (alphabetical):")
    print(df.dtypes.sort_index())

    print(f"\nMissingness top {topk} (percent):")
    miss = (df.isna().mean() * 100).round(2).sort_values(ascending=False)
    print(miss.head(topk).to_string())

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

    print("\n=== Venue / Home indicators (examples) ===")
    for c in ["MATCHUP", "HOME_TEAM_ID", "VISITOR_TEAM_ID"]:
        if c in df.columns:
            ex = df[c].dropna().astype(str).head(10).to_list()
            print(f"{c}: {ex}")

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


def build_results(games: pd.DataFrame) -> pd.DataFrame:
    """Create a results DataFrame with winner/loser information and context signals."""
    results = []
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
        results.append({
            "GAME_ID": game_id,
            "GAME_DATE": row1["GAME_DATE"],
            "WIN_TEAM": win_team,
            "LOSE_TEAM": lose_team,
            "POINTS_W": points_w,
            "POINTS_L": points_l
        })

    results_df = pd.DataFrame(results)

    _home_by_gid = {}
    for gid, grp in games.groupby("GAME_ID"):
        home_row = grp[grp["MATCHUP"].astype(str).str.contains(" vs. ")]
        if not home_row.empty:
            _home_by_gid[gid] = home_row.iloc[0]["TEAM_NAME"]
        else:
            _home_by_gid[gid] = None

    _is_po_by_gid = games.drop_duplicates("GAME_ID").set_index("GAME_ID")["IS_PLAYOFF"].to_dict()

    results_df["HOME_TEAM"] = results_df["GAME_ID"].map(_home_by_gid)
    results_df["IS_PLAYOFF"] = results_df["GAME_ID"].map(_is_po_by_gid).fillna(0).astype(int)
    results_df["MARGIN"] = results_df["POINTS_W"] - results_df["POINTS_L"]

    return results_df
