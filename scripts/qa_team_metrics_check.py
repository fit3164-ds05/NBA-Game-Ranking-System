#!/usr/bin/env python3
"""
QA checks for team_metrics_dataset.csv vs nba_game_outcomes.csv.

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
import sys
import pandas as pd


DATA_DIR = Path("backend/Data")
QA_DIR = DATA_DIR / "qa"
TEAM_METRICS = DATA_DIR / "team_metrics_dataset.csv"
ENLARGED = DATA_DIR / "nba_game_outcomes.csv"


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
    # Prefer your project mapping if available
    try:
        sys.path.append(str(Path("backend/Rating_Algorithms").resolve()))
        import teamdictionary as _td  # type: ignore
        return _td.normalize_team_abbrev(s)
    except Exception:
        pass
    return s.upper()


def load_metrics() -> pd.DataFrame:
    # Read with low_memory=False to avoid dtype fragmentation
    df = pd.read_csv(TEAM_METRICS, low_memory=False)
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
    # Numeric conversions (coerce only; avoid failing casts)
    for c in ["GAME_ID","TEAM_ID","YEAR","TRAD_PTS"]:
        if c in df.columns:
            try:
                df[c] = pd.to_numeric(df[c], errors="coerce")
            except Exception:
                pass
    return df


def load_enlarged() -> pd.DataFrame:
    usecols = [
        "GAME_ID","GAME_DATE","SEASON_TYPE","YEAR",
        "HOME_TEAM_ID","AWAY_TEAM_ID",
        "HOME_TEAM_ABBREVIATION","AWAY_TEAM_ABBREVIATION",
        "HOME_PTS","AWAY_PTS","WINNER_TEAM_ID","WINNER_TEAM_ABBREVIATION"
    ]
    df = pd.read_csv(ENLARGED, usecols=[c for c in usecols if c is not None], low_memory=False)
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
            try:
                df[c] = pd.to_numeric(df[c], errors="coerce")
            except Exception:
                pass
    return df


def build_join_key(df_like_game: pd.DataFrame) -> pd.Series:
    return (
        df_like_game["GAME_DATE"].astype(str)
        + "|" + df_like_game["HOME_TEAM_ABBREVIATION"].astype(str)
        + "|" + df_like_game["AWAY_TEAM_ABBREVIATION"].astype(str)
        + "|" + df_like_game["SEASON_TYPE" ].astype(str)
    )


def build_join_key_ids(df_like_game: pd.DataFrame) -> pd.Series:
    # Build only where both IDs are present and numeric
    home = pd.to_numeric(df_like_game.get("HOME_TEAM_ID"), errors="coerce")
    away = pd.to_numeric(df_like_game.get("AWAY_TEAM_ID"), errors="coerce")
    mask = home.notna() & away.notna()
    parts = pd.Series([None] * len(df_like_game), dtype=object, index=df_like_game.index)
    if mask.any():
        hs = home.loc[mask].astype("int64").astype(str)
        as_ = away.loc[mask].astype("int64").astype(str)
        parts.loc[mask] = (
            df_like_game.loc[mask, "GAME_DATE"].astype(str)
            + "|" + hs
            + "|" + as_
            + "|" + df_like_game.loc[mask, "SEASON_TYPE"].astype(str)
        )
    return parts


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

    # Detailed diagnosis: does TRAD_PTS match either home or away if SIDE were flipped?
    if not pts_mis.empty:
        diag = pts_mis.copy()
        try:
            tp = diag["TRAD_PTS"].astype("Float64")
            hp = diag["HOME_PTS"].astype("Float64") if "HOME_PTS" in diag.columns else pd.NA
            ap = diag["AWAY_PTS"].astype("Float64") if "AWAY_PTS" in diag.columns else pd.NA
            expected = []
            for i in range(len(diag)):
                side = diag.iloc[i].get("SIDE")
                e = None
                if pd.notna(hp.iloc[i]) and tp.iloc[i] == hp.iloc[i]:
                    e = "HOME"
                elif pd.notna(ap.iloc[i]) and tp.iloc[i] == ap.iloc[i]:
                    e = "AWAY"
                expected.append(e)
            diag["EXPECTED_SIDE_FROM_POINTS"] = expected
            diag["SWAP_NEEDED"] = (diag["EXPECTED_SIDE_FROM_POINTS"].notna() & (diag["EXPECTED_SIDE_FROM_POINTS"] != diag["SIDE"]))
        except Exception:
            pass
        keep_cols = [c for c in [
            "GAME_ID","GAME_DATE","SEASON_TYPE","TEAM_ID","TEAM_ABBREVIATION","SIDE",
            "TRAD_PTS","HOME_PTS","AWAY_PTS","EXPECTED_SIDE_FROM_POINTS","SWAP_NEEDED"
        ] if c in diag.columns]
        diag[keep_cols].to_csv(QA_DIR / "points_mismatch_diagnosis.csv", index=False)

        # Also prepare a points_overrides CSV to align TRAD_PTS to canonical HOME/away points
        try:
            overrides = []
            for _, row in diag.iterrows():
                gid = str(row.get("GAME_ID"))
                tid = row.get("TEAM_ID")
                side = row.get("SIDE")
                if side == "HOME" and pd.notna(row.get("HOME_PTS")):
                    new_pts = float(row.get("HOME_PTS"))
                elif side == "AWAY" and pd.notna(row.get("AWAY_PTS")):
                    new_pts = float(row.get("AWAY_PTS"))
                else:
                    continue
                overrides.append({"GAME_ID": gid, "TEAM_ID": tid, "TRAD_PTS": new_pts})
            if overrides:
                pd.DataFrame(overrides).to_csv(QA_DIR / "points_overrides.csv", index=False)
        except Exception:
            pass

    # Winner agreement by JOIN_KEY: check row with max TRAD_PTS
    disagree_keys = []
    if "TRAD_PTS" in met_rows.columns:
        try:
            idxs = met_rows.groupby("JOIN_KEY", dropna=True)["TRAD_PTS"].idxmax()
            winners = met_rows.loc[idxs]
            ok_id = (winners.get("TEAM_ID") == winners.get("WINNER_TEAM_ID")) if "WINNER_TEAM_ID" in winners.columns else False
            ok_ab = (winners.get("TEAM_ABBREVIATION") == winners.get("WINNER_TEAM_ABBREVIATION")) if "WINNER_TEAM_ABBREVIATION" in winners.columns else False
            ok = (ok_id | ok_ab).fillna(False)
            disagree_keys = list(winners.loc[~ok, "JOIN_KEY"].astype(str).values)
        except Exception:
            disagree_keys = []
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

    # Additional diagnostics: missing/extra by year and season type
    def _by_year(df: pd.DataFrame) -> pd.DataFrame:
        if df.empty:
            return df
        try:
            df2 = df.copy()
            df2["YEAR"] = pd.to_datetime(df2["GAME_DATE"], errors="coerce").dt.year
            return df2.groupby(["YEAR","SEASON_TYPE"]).size().rename("count").reset_index()
        except Exception:
            return df
    _by_year(missing_df).to_csv(QA_DIR / "missing_by_year.csv", index=False)
    _by_year(extra_df).to_csv(QA_DIR / "extra_by_year.csv", index=False)

    # Swap home/away probe: would swapping teams fix some missing games?
    if not missing_df.empty:
        swap = missing_df.copy()
        swap = swap.rename(columns={
            "HOME_TEAM_ABBREVIATION":"AWAY_TEAM_ABBREVIATION",
            "AWAY_TEAM_ABBREVIATION":"HOME_TEAM_ABBREVIATION",
        })
        swap_key = build_join_key(swap)
        swap_hits = set(swap_key) & (m_games if isinstance(next(iter(m_games), None), str) else set())
        # Compose report for those that would match after swap
        swap_rows = missing_df.loc[missing_df.index[missing_df.apply(lambda r: (f"{r['GAME_DATE']}|{r['AWAY_TEAM_ABBREVIATION']}|{r['HOME_TEAM_ABBREVIATION']}|{r['SEASON_TYPE']}") in (m_games if isinstance(next(iter(m_games), None), str) else set()), axis=1)]]
        swap_rows.to_csv(QA_DIR / "swap_home_away_candidates.csv", index=False)

    # Date shift probe: try +/- 1 day for missing games
    if not missing_df.empty:
        from datetime import timedelta
        miss = missing_df.copy()
        try:
            miss_dt = pd.to_datetime(miss["GAME_DATE"], errors="coerce")
            for delta, name in [(timedelta(days=-1), "minus1"), (timedelta(days=1), "plus1")]:
                shifted = miss.copy()
                shifted["GAME_DATE"] = (miss_dt + delta).dt.strftime("%Y-%m-%d")
                shifted_key = build_join_key(shifted)
                # Find which shifted keys exist in metrics
                hits = shifted_key[shifted_key.isin(m_keys["JOIN_KEY"])].index
                shifted.loc[hits][["GAME_DATE","HOME_TEAM_ABBREVIATION","AWAY_TEAM_ABBREVIATION","SEASON_TYPE"]].to_csv(QA_DIR / f"date_shift_candidates_{name}.csv", index=False)
        except Exception:
            pass

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
