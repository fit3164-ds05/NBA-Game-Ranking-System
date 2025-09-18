import os
from pathlib import Path


def test_loader_detects_any_format(tmp_path, monkeypatch):
    import pandas as pd
    from utils.data_loader import load_table

    df = pd.DataFrame({"a": [1, 2], "b": [3, 4]})
    stem = tmp_path / "toy"
    csv_path = stem.with_suffix(".csv")
    pq_path = stem.with_suffix(".parquet")

    # Always create CSV fallback
    df.to_csv(csv_path, index=False)

    # Try to create Parquet; skip assertion if pyarrow missing
    try:
        df.to_parquet(pq_path, index=False)
    except Exception:
        # If parquet isn't available in CI, ensure CSV still loads
        monkeypatch.setenv("DATA_FORMAT", "csv")
        out = load_table(str(stem))
        assert out.equals(df)
        return

    # Prefer parquet when configured
    monkeypatch.setenv("DATA_FORMAT", "parquet")
    out = load_table(str(stem))
    assert out.equals(df)
