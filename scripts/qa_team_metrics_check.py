#!/usr/bin/env python3
"""
QA checks for team_metrics_dataset.csv vs enlarged_dataset.csv.

Outputs written to backend/Data/qa/:
  - coverage_by_year.csv            # per-year game counts: enlarged vs metrics (joined)
  - missing_games.csv               # games in enlarged with no matching team metrics rows
  - extra_games.csv                 # games in metrics not found in enlarged (by surrogate keys)
  - non_two_team_rows.csv           # games in metrics not having exactly 2 team rows
  - points_mismatch_rows.csv        # rows where TRAD_PTS != HOME/away points from enlarged
  - winner_disagreement_games.csv   # games where max(TRAD_PTS) team != WINNER in enlarged

Join strategy (no GAME_ID dependency):
  Surrogate keys = GAME_DATE + HOME_TEAM_ABBREVIATION + AWAY_TEAM_ABBREVIATION + SEASON_TYPE
  Team metrics SIDE field uses TEAM_ABBREVIATION to determine HOME/AWAY per game.
"""

from __future__ import annotations

import argparse
from pathlib import Path
import pandas as pd


DATA_DIR = Path("backend/Data")
QA_DIR = DATA_DIR / "qa"
TEAM_METRICS = DATA_DIR / "team_metrics_dataset.csv"
ENLARGED = DATA_DIR / "enlarged_dataset.csv"


def _season_type_norm(s: str) -> str:
    if not isinstance(s, str):
        return s
    s = s.strip().lower()
    if s in {"regular", "regular season", "reg", "rs"}:
        return "Regular Season"
    if s in {"playoff", "playoffs", "po"}:
        return "Playoffs"
    return s.title()


def _abbr_norm(s: str) -> str:
    if not isinstance(s, str):
        return s
    m = {
        # Common historical variants to current conventions
        "PHO": "PHX",
        "BRK": "BKN",
        "NOK": "NOH",  # 2005-07 split season designation
        # Keep historical distincts as-is; adjust here if needed to match enlarged
    }
    return m.get(s.upper(), s.upper())


def load_metrics() -> pd.DataFrame:
    df = pd.read_csv(TEAM_METRICS)
    # Ensure expected keys exist
    for c in [
        "GAME_ID","TEAM_ID","TEAM_ABBREVIATION","GAME_DATE","SEASON_TYPE","YEAR",
        "HOME_TEAM_ABBREVIATION","AWAY_TEAM_ABBREVIATION","SIDE"
    ]:
        if c not in df.columns:
            raise ValueError(f"Missing expected column in team metrics: {c}")
    # Normalize
    df["SEASON_TYPE"] = df["SEASON_TYPE"].apply(_season_type_norm)
    for c in ["TEAM_ABBREVIATION","HOME_TEAM_ABBREVIATION","AWAY_TEAM_ABBREVIATION"]:
        df[c] = df[c].apply(_abbr_norm)
    try:
        df["GAME_DATE"] = pd.to_datetime(df["GAME_DATE"], errors="coerce").dt.strftime("%Y-%m-%d")
    except Exception:
        pass
    # Numeric conversions
    for c in ["GAME_ID","TEAM_ID","YEAR","TRAD_PTS"]:
        if c in df.columns:
            df[c] = pd.to_numeric(df[c], errors="coerce")
    return df


def load_enlarged() -> pd.DataFrame:
    usecols = [
        "GAME_ID","GAME_DATE","SEASON_TYPE","YEAR",
        "HOME_TEAM_ID","AWAY_TEAM_ID",
        "HOME_TEAM_ABBREVIATION","AWAY_TEAM_ABBREVIATION",
        "HOME_PTS","AWAY_PTS","WINNER_TEAM_ID","WINNER_TEAM_ABBREVIATION"
    ]
    df = pd.read_csv(ENLARGED, usecols=[c for c in usecols if c is not None])
    df["SEASON_TYPE"] = df["SEASON_TYPE"].apply(_season_type_norm)
    for c in ["HOME_TEAM_ABBREVIATION","AWAY_TEAM_ABBREVIATION","WINNER_TEAM_ABBREVIATION"]:
        if c in df.columns:
            df[c] = df[c].apply(_abbr_norm)
    try:
        df["GAME_DATE"] = pd.to_datetime(df["GAME_DATE"], errors="coerce").dt.strftime("%Y-%m-%d")
    except Exception:
        pass
    for c in ["GAME_ID","YEAR","HOME_TEAM_ID","AWAY_TEAM_ID","HOME_PTS","AWAY_PTS","WINNER_TEAM_ID"]:
        if c in df.columns:
            df[c] = pd.to_numeric(df[c], errors="coerce")
    return df


def build_join_key(df_like_game: pd.DataFrame) -> pd.Series:
    return (
        df_like_game["GAME_DATE"].astype(str)
        + "|" + df_like_game["HOME_TEAM_ABBREVIATION"].astype(str)
        + "|" + df_like_game["AWAY_TEAM_ABBREVIATION"].astype(str)
        + "|" + df_like_game["SEASON_TYPE" ].astype(str)
    )


def build_join_key_ids(df_like_game: pd.DataFrame) -> pd.Series:
    return (
        df_like_game["GAME_DATE"].astype(str)
        + "|" + df_like_game["HOME_TEAM_ID"].astype("Int64").astype(str)
        + "|" + df_like_game["AWAY_TEAM_ID"].astype("Int64").astype(str)
        + "|" + df_like_game["SEASON_TYPE" ].astype(str)
    )


def main():
    parser = argparse.ArgumentParser(description="QA: compare team metrics vs enlarged dataset")
    parser.add_argument("--min-year", type=int, default=1996, help="Only consider games with YEAR >= this")
    args = parser.parse_args()

    QA_DIR.mkdir(parents=True, exist_ok=True)

    metrics = load_metrics()
    enlarged = load_enlarged()
    # Filter by year
    enlarged_f = enlarged[enlarged["YEAR"] >= args.min_year].copy()

    # Ensure two rows per game in metrics
    per_game_counts = metrics.groupby("GAME_ID", dropna=False)["TEAM_ID"].count().rename("rows").reset_index()
    non_two = per_game_counts[per_game_counts["rows"] != 2]
    non_two.to_csv(QA_DIR / "non_two_team_rows.csv", index=False)

    # Build game-level surrogate keys on both sides
    # From metrics, aggregate to game-level with home/away ABBR and IDs
    agg_dict = {
        "HOME_TEAM_ABBREVIATION": "first",
        "AWAY_TEAM_ABBREVIATION": "first",
        "HOME_TEAM_ID": "first",
        "AWAY_TEAM_ID": "first",
        "YEAR": "first",
    }
    m_keys = (
        metrics.groupby(["GAME_ID","GAME_DATE","SEASON_TYPE"], dropna=False)
        .agg({k: v for k, v in agg_dict.items() if k in metrics.columns})
        .reset_index()
    )
    m_keys["JOIN_KEY"] = build_join_key(m_keys.rename(columns={
        "HOME_TEAM_ABBREVIATION":"HOME_TEAM_ABBREVIATION",
        "AWAY_TEAM_ABBREVIATION":"AWAY_TEAM_ABBREVIATION"
    }))
    if {"HOME_TEAM_ID","AWAY_TEAM_ID"}.issubset(m_keys.columns):
        m_keys["JOIN_KEY_ID"] = build_join_key_ids(m_keys)
    e_keys = enlarged_f.copy()
    e_keys["JOIN_KEY"] = build_join_key(e_keys)
    if {"HOME_TEAM_ID","AWAY_TEAM_ID"}.issubset(e_keys.columns):
        e_keys["JOIN_KEY_ID"] = build_join_key_ids(e_keys)

    # Coverage comparison: prefer ID-based keys if available
    if "JOIN_KEY_ID" in m_keys.columns and "JOIN_KEY_ID" in e_keys.columns:
        m_games = set(m_keys["JOIN_KEY_ID"].dropna())
        e_games = set(e_keys["JOIN_KEY_ID"].dropna())
    else:
        m_games = set(m_keys["JOIN_KEY"].dropna())
        e_games = set(e_keys["JOIN_KEY"].dropna())
    missing_keys = sorted(e_games - m_games)
    extra_keys   = sorted(m_games - e_games)

    def _split_keys(keys):
        rows = []
        for k in keys:
            try:
                d, h, a, st = k.split("|")
            except ValueError:
                d = k; h=a=st=""
            rows.append({"GAME_DATE": d, "HOME_TEAM_ABBREVIATION": h, "AWAY_TEAM_ABBREVIATION": a, "SEASON_TYPE": st})
        return pd.DataFrame(rows)

    missing_df = _split_keys(missing_keys)
    extra_df   = _split_keys(extra_keys)
    missing_df.to_csv(QA_DIR / "missing_games.csv", index=False)
    extra_df.to_csv(QA_DIR / "extra_games.csv", index=False)

    # Points mismatch and winner agreement (on overlapping games only)
    # Overlap mapping (use the same key type chosen above)
    key_col = "JOIN_KEY_ID" if ("JOIN_KEY_ID" in e_keys.columns and "JOIN_KEY_ID" in m_keys.columns) else "JOIN_KEY"
    overlap = e_keys.merge(m_keys[[key_col,"GAME_ID"]].rename(columns={key_col:"J"}), left_on=key_col, right_on="J", how="inner", suffixes=("_E","_M"))
    # Map back to team rows in metrics and compare points
    met_rows = metrics.merge(overlap[["JOIN_KEY","GAME_ID_M","HOME_PTS","AWAY_PTS","WINNER_TEAM_ID","WINNER_TEAM_ABBREVIATION","YEAR"]],
                             left_on=["GAME_ID"], right_on=["GAME_ID_M"], how="inner")
    # Points mismatch (TRAD_PTS vs HOME/away PTS)
    if "TRAD_PTS" in met_rows.columns:
        pts_mis = met_rows[
            ((met_rows["SIDE"]=="HOME") & (met_rows["TRAD_PTS"].astype("Float64") != met_rows["HOME_PTS"].astype("Float64"))) |
            ((met_rows["SIDE"]=="AWAY") & (met_rows["TRAD_PTS"].astype("Float64") != met_rows["AWAY_PTS"].astype("Float64")))
        ]
    else:
        pts_mis = pd.DataFrame()
    pts_mis.to_csv(QA_DIR / "points_mismatch_rows.csv", index=False)

    # Winner agreement by JOIN_KEY: team with max TRAD_PTS equals WINNER_TEAM_ID/ABBR
    def _winner_ok(g: pd.DataFrame) -> bool:
        try:
            idx = g["TRAD_PTS"].astype("Float64").idxmax()
        except Exception:
            return False
        if pd.isna(idx):
            return False
        row = g.loc[idx]
        # Compare id if available, else abbreviation
        ok_id = ("TEAM_ID" in g.columns) and (row.get("TEAM_ID") == row.get("WINNER_TEAM_ID"))
        ok_ab = ("TEAM_ABBREVIATION" in g.columns) and (row.get("TEAM_ABBREVIATION") == row.get("WINNER_TEAM_ABBREVIATION"))
        return bool(ok_id or ok_ab)

    winner_grp = met_rows.groupby("JOIN_KEY", dropna=True)
    winner_ok = winner_grp.apply(_winner_ok)
    disagree_keys = list(winner_ok.index[~winner_ok.astype(bool)])
    disagree_df = _split_keys(disagree_keys)
    disagree_df.to_csv(QA_DIR / "winner_disagreement_games.csv", index=False)

    # Coverage by year
    cov = (
        e_keys.groupby("YEAR")["JOIN_KEY"].nunique().rename("games_in_enlarged").to_frame()
        .merge(
            overlap.groupby("YEAR")["JOIN_KEY"].nunique().rename("games_with_metrics"),
            left_index=True, right_index=True, how="left"
        )
        .fillna(0).astype(int).reset_index()
    )
    cov.to_csv(QA_DIR / "coverage_by_year.csv", index=False)

    # Console summary
    print("=== QA Summary ===")
    print(f"Enlarged games (YEAR>={args.min_year}): {e_keys['JOIN_KEY'].nunique():,}")
    print(f"Metrics games (unique JOIN_KEY):       {m_keys['JOIN_KEY'].nunique():,}")
    print(f"Overlap games:                         {len(overlap['JOIN_KEY'].unique()):,}")
    print(f"Non-2-row games in metrics:            {len(non_two):,} -> {QA_DIR/'non_two_team_rows.csv'}")
    print(f"Missing games:                         {len(missing_df):,} -> {QA_DIR/'missing_games.csv'}")
    print(f"Extra games:                           {len(extra_df):,} -> {QA_DIR/'extra_games.csv'}")
    print(f"Point mismatches:                      {len(pts_mis):,} -> {QA_DIR/'points_mismatch_rows.csv'}")
    print(f"Winner disagreements:                  {len(disagree_df):,} -> {QA_DIR/'winner_disagreement_games.csv'}")


if __name__ == "__main__":
    main()
