"""
Unified data loader that prefers Parquet, then Feather, then CSV.

Usage:
    from backend.utils.data_loader import load_table
    df = load_table("backend/data/full_ratings")  # no extension needed

Respects DATA_FORMAT preference from environment via backend.config.data_format.
Keeps CSV as a fallback and preserves caller-supplied CSV kwargs.

Optional: Feather/Arrow IPC is supported transparently if files exist.
"""

from __future__ import annotations

from pathlib import Path
from typing import List, Optional

import pandas as pd

# Support both running with backend/ on sys.path (tests) and package-style imports
try:  # tests and scripts run from backend/ working dir
    from config.data_format import DATA_FORMAT  # type: ignore
except Exception:  # package-style import fallback
    from backend.config.data_format import DATA_FORMAT  # type: ignore


PROJECT_ROOT = Path(__file__).resolve().parents[2]


def _candidate_paths(base_path: str, prefer: Optional[str] = None) -> List[Path]:
    p = Path(base_path)
    if not p.is_absolute():
        p = (PROJECT_ROOT / p).resolve()
    stem = p.with_suffix("")  # remove any existing suffix
    prefer = (prefer or DATA_FORMAT).lower()
    priority = {
        "parquet": [".parquet", ".feather", ".csv"],
        "feather": [".feather", ".parquet", ".csv"],
        "csv": [".csv", ".parquet", ".feather"],
    }.get(prefer, [".parquet", ".feather", ".csv"])  # safe default
    return [Path(f"{stem}{ext}") for ext in priority]


def load_table(base_path: str, prefer: Optional[str] = None, **read_csv_kwargs) -> pd.DataFrame:
    """
    Load a table, preferring the configured DATA_FORMAT, then falling back.

    - base_path may include a suffix; loader tries preferred and fallbacks.
    - CSV kwargs are forwarded only if a CSV is used.
    """
    candidates = _candidate_paths(base_path, prefer=prefer)

    for path in candidates:
        if path.exists():
            suffix = path.suffix.lower()
            if suffix == ".parquet":
                try:
                    return pd.read_parquet(path)
                except ImportError:
                    # Fall back to the next candidate (feather/csv) when parquet engine
                    # is unavailable instead of failing outright.
                    continue
            if suffix == ".feather":
                try:
                    return pd.read_feather(path)
                except ImportError:
                    continue
            # CSV; allow caller overrides (dtype, parse_dates, etc.)
            return pd.read_csv(path, **read_csv_kwargs)

    raise FileNotFoundError(f"No available file for {base_path} (tried {[str(p) for p in candidates]})")
