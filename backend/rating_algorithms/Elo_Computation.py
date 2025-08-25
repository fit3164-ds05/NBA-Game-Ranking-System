from pathlib import Path
import pandas as pd
import matplotlib.pyplot as plt

from data_prep import (
    load_joined_games,
    explore_dataframe,
    summarize_games,
    build_results,
)
from engines import (
    RatingEngine,
    GlickoEngine,
    EloEngine,
    MarginHomeElo,
    TrueSkillEngine,
)

# Resolve directories relative to this file
_base_dir = Path(__file__).resolve().parent
_backend_dir = _base_dir.parent
_data_dir = _backend_dir / "data"

# Output directories for exports
_out_data_dir = _backend_dir / "data"
_out_visuals_dir = _out_data_dir / "visuals"
_out_data_dir.mkdir(parents=True, exist_ok=True)
_out_visuals_dir.mkdir(parents=True, exist_ok=True)

# Load and explore data
games = load_joined_games(_data_dir)
explore_dataframe(games)
summarize_games(games)
results_df = build_results(games)

# Engine-driven rating computation for multiple engines
results_df["GAME_DATE"] = pd.to_datetime(results_df["GAME_DATE"])
results_df = results_df.sort_values(by="GAME_DATE").reset_index(drop=True)

ENGINES_TO_RUN = [
    ("elo",       lambda: EloEngine(k_factor=32.0, init_rating=1500.0)),
    ("glicko",    lambda: GlickoEngine()),
    ("trueskill", lambda: TrueSkillEngine()),
    ("margin_home_elo", lambda: MarginHomeElo()),
]


def run_engine(engine_name: str, factory) -> pd.DataFrame:
    """Run an engine through all matches, save CSV and plot, and return the ratings DataFrame."""
    engine: RatingEngine = factory()
    pred_correct_flags = []
    for _, row in results_df.iterrows():
        win = row["WIN_TEAM"]
        lose = row["LOSE_TEAM"]
        gdate = row["GAME_DATE"]

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

        p_win = engine.win_prob(r_win, r_lose, rd_win, rd_lose)
        pred_correct_flags.append(1 if p_win >= 0.5 else 0)

        ctx = {
            "home_team": row.get("HOME_TEAM", None),
            "margin": row.get("MARGIN", None),
            "is_playoff": row.get("IS_PLAYOFF", 0),
        }
        if hasattr(engine, "record_game_ctx"):
            engine.record_game_ctx(win, lose, gdate, **ctx)
        else:
            engine.record_game(win, lose, gdate)

    results_df[f"PRED_CORRECT_{engine_name}"] = pred_correct_flags
    ratings_df = pd.DataFrame(engine.history)

    all_dates = pd.date_range(start=ratings_df["GAME_DATE"].min(),
                              end=ratings_df["GAME_DATE"].max(),
                              freq="D")
    all_teams = ratings_df["TEAM"].unique()

    full_index = pd.MultiIndex.from_product([all_dates, all_teams], names=["GAME_DATE", "TEAM"])
    full_ratings = ratings_df.set_index(["GAME_DATE", "TEAM"]).reindex(full_index)
    full_ratings = full_ratings.groupby("TEAM").ffill().reset_index()

    csv_path = _out_data_dir / f"ratings_{engine_name}.csv"
    full_ratings.to_csv(str(csv_path), index=False)
    print(f"✅ {engine_name} full_ratings exported to {csv_path}")

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


for _name, _factory in ENGINES_TO_RUN:
    full_ratings = run_engine(_name, _factory)

_results_path = _out_data_dir / "results_with_predictions.csv"
results_df.to_csv(str(_results_path), index=False)
print("✅ results_with_predictions.csv saved with per-engine correctness columns")

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


def compute_win_probability(team_A_name, date_A, team_B_name, date_B, engine: RatingEngine):
    """Compute win probability of team A vs team B using the latest full_ratings."""
    date_A = pd.to_datetime(date_A)
    date_B = pd.to_datetime(date_B)

    rating_row_A = full_ratings[(full_ratings["TEAM"] == team_A_name) & (full_ratings["GAME_DATE"] == date_A)]
    rating_row_B = full_ratings[(full_ratings["TEAM"] == team_B_name) & (full_ratings["GAME_DATE"] == date_B)]

    if rating_row_A.empty or rating_row_B.empty:
        print("Rating not found for one or both teams on the specified dates.")
        return None

    rating_A = float(rating_row_A["RATING"].values[0])
    rating_B = float(rating_row_B["RATING"].values[0])

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

    prob_A_wins = engine.win_prob(rating_A, rating_B, rd_A, rd_B)
    print(
        f"Win probability of {team_A_name} (on {date_A.date()}) vs {team_B_name} (on {date_B.date()}): {prob_A_wins:.3f}"
    )
    return prob_A_wins
