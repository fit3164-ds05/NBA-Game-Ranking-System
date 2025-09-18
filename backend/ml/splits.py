"""Time-aware train/validation/test split utilities."""

from __future__ import annotations

import pandas as pd


def time_split(df: pd.DataFrame, test_year_from: int = 2022, val_year_from: int = 2020):
    """
    Split by YEAR into train (< val_year_from),
    valid ([val_year_from, test_year_from)), and
    test (>= test_year_from).
    """
    train = df[df["YEAR"] < val_year_from].copy()
    valid = df[(df["YEAR"] >= val_year_from) & (df["YEAR"] < test_year_from)].copy()
    test = df[df["YEAR"] >= test_year_from].copy()
    return train, valid, test

