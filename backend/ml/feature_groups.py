"""Helpers for grouping XGBoost feature columns into toggleable blocks."""

from __future__ import annotations

from typing import Dict, Iterable, List, Tuple

STATIC_FEATURES = {"rating_diff", "is_playoffs", "YEAR"}
ROLL_WINDOWS = [3, 5, 10]


def _assign(groups: Dict[str, List[str]], feature_to_group: Dict[str, str], feature: str, group: str) -> None:
    feature_to_group[feature] = group
    groups.setdefault(group, []).append(feature)


def build_feature_groups(features: List[str]) -> Tuple[Dict[str, List[str]], Dict[str, str]]:
    """Assign each feature to a single group based on naming conventions."""
    groups: Dict[str, List[str]] = {}
    feature_to_group: Dict[str, str] = {}

    for feat in features:
        group = None
        if feat in STATIC_FEATURES:
            group = "static"
        elif "rest_days" in feat:
            group = "rest"
        else:
            for window in ROLL_WINDOWS:
                if f"_roll{window}_mean" in feat:
                    group = f"roll{window}_mean"
                    break
                if f"_roll{window}_std" in feat:
                    group = f"roll{window}_std"
                    break
        if group is None:
            group = "other"
        _assign(groups, feature_to_group, feat, group)

    for values in groups.values():
        values.sort()
    return groups, feature_to_group


def select_features_by_groups(
    features: List[str],
    selected_groups: Iterable[str] | None,
) -> Tuple[List[str], Dict[str, List[str]], Dict[str, str], List[str]]:
    """Return features filtered by selected groups, ensuring mandatory blocks stay."""
    groups, feature_to_group = build_feature_groups(features)
    mandatory = {g for g in ("static", "other") if g in groups}

    chosen = set(selected_groups or [])
    chosen |= mandatory
    chosen &= set(groups.keys())

    selected = [feat for feat in features if feature_to_group.get(feat) in chosen]
    return selected, groups, feature_to_group, sorted(chosen)
