"""
CSV → Parquet conversion utility.

Inventory (discovered in repo at authoring time):
  CSV files:
    - backend/data/results_with_predictions.csv
    - backend/data/ratings_margin_home_elo.csv
    - backend/data/full_ratings.csv
    - backend/data/ratings_glicko.csv
    - backend/data/enlarged_dataset.csv
    - backend/data/ratings_elo.csv
    - backend/data/team_metrics_dataset.csv
    - backend/data/ratings_trueskill.csv
    - backend/data/legacy/playoffs.csv
    - backend/data/legacy/team_scoring.csv
    - backend/data/legacy/ratings_trueskill.csv
    - backend/data/legacy/team_traditional.csv
    - backend/data/legacy/full_nba_data.csv
    - backend/data/legacy/results_with_predictions.csv
    - backend/data/legacy/team_fourfactors.csv
    - backend/data/legacy/ratings_margin_home_elo.csv
    - backend/data/legacy/ratings_glicko.csv
    - backend/data/legacy/ratings_elo.csv
    - backend/data/legacy/games.csv
    - backend/data/legacy/team_misc.csv
    - backend/data/legacy/team_advanced.csv
    - backend/data/legacy/totals.csv

  read_csv call sites:
    - data_exploration.py:41
    - data_exploration.py:76
    - scripts/qa_team_metrics_check.py:58
    - scripts/qa_team_metrics_check.py:91
    - scripts/merge_kaggle_team_boxscores.py:40
    - scripts/merge_kaggle_team_boxscores.py:221
    - scripts/merge_kaggle_team_boxscores.py:263
    - scripts/merge_kaggle_team_boxscores.py:276
    - backend/services/ratings.py:42 (refactored to unified loader)
    - backend/Rating_Algorithms/finalyear.py:255
    - backend/Rating_Algorithms/elo_computation.py:124
    - backend/Rating_Algorithms/data_prep.py:28

# QUESTION: Any columns besides GAME_DATE that must be parsed as dates?
# QUESTION: Should we also emit a compact sample CSV (first 10k rows) for debugging?
# QUESTION: Do we also convert root-level CSVs (e.g., full_nba_data.csv)?
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import List, Tuple

import pandas as pd

# Ensure repo root is on sys.path when running as a script (python scripts/convert_datasets.py)
_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

try:
    # Package-style import (works when repo root is on sys.path)
    from backend.config.data_format import DATA_DIRS, PARQUET_COMPRESSION
except Exception:
    # Fallback for cases where backend/ is cwd (e.g., some test runners)
    from config.data_format import DATA_DIRS, PARQUET_COMPRESSION  # type: ignore


def _choose_compression() -> str:
    """Return 'zstd' if available and requested, else 'snappy'."""
    try:
        import pyarrow
        # Prefer explicit codec availability over version checks
        try:
            from pyarrow import Codec  # type: ignore
            if PARQUET_COMPRESSION == "zstd" and Codec.is_available("zstd"):
                return "zstd"
        except Exception:
            # Fallback to version heuristic
            ver = getattr(pyarrow, "__version__", "0.0.0")
            if PARQUET_COMPRESSION == "zstd" and ver.split(".")[0].isdigit() and int(ver.split(".")[0]) >= 12:
                return "zstd"
        return "snappy"
    except Exception:
        return "snappy"


def discover_csvs() -> List[Path]:
    csvs: List[Path] = []
    for d in DATA_DIRS:
        p = Path(d)
        if not p.exists():
            continue
        for f in p.rglob("*.csv"):
            csvs.append(f)
    # De-duplicate and sort
    return sorted({c.resolve() for c in csvs})


def _parse_csv(csv_path: Path) -> pd.DataFrame:
    """Heuristics: parse dates, preserve bools/ints where possible."""
    # Extendable date column list
    date_candidates = [
        "GAME_DATE",
        "DATE",
        "game_date",
    ]
    parse_dates = [c for c in date_candidates if any(c in part for part in [csv_path.name, str(csv_path.parent)])]

    # Nullable ints for common id/year columns
    dtype_overrides = {
        "GAME_ID": "Int64",
        "TEAM_ID": "Int64",
        "SEASON_ID": "Int64",
        "YEAR": "Int64",
    }
    try:
        return pd.read_csv(csv_path, dtype=dtype_overrides, parse_dates=parse_dates)
    except Exception:
        return pd.read_csv(csv_path)


def convert_csv_to_parquet(csv_path: Path, compression: str) -> Tuple[Path, int]:
    df = _parse_csv(csv_path)
    out_path = csv_path.with_suffix(".parquet")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    df.to_parquet(out_path, compression=compression, index=False)
    return out_path, len(df)


def main() -> int:
    compression = _choose_compression()
    csvs = discover_csvs()
    report = []

    if not csvs:
        print("No CSV files discovered in configured DATA_DIRS.")
    else:
        for csv_path in csvs:
            try:
                out_path, n = convert_csv_to_parquet(csv_path, compression=compression)
                report.append({
                    "csv": str(csv_path),
                    "parquet": str(out_path),
                    "rows": n,
                    "compression": compression,
                })
                print(f"[OK] {csv_path} -> {out_path} ({n} rows, {compression})")
            except Exception as e:
                print(f"[WARN] Failed to convert {csv_path}: {e}", file=sys.stderr)

    # Write conversion report (kept out of version control)
    report_path = Path("backend/data/qa/conversion_report.json")
    report_path.parent.mkdir(parents=True, exist_ok=True)
    with open(report_path, "w") as f:
        json.dump(report, f, indent=2)
    print(f"\nWrote conversion report to {report_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
