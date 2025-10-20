"""Lightweight metric helpers to avoid scikit-learn dependency for training scripts."""

from __future__ import annotations

import numpy as np


def accuracy_score(y_true, y_pred) -> float:
    y_true = np.asarray(y_true)
    y_pred = np.asarray(y_pred)
    if y_true.shape[0] == 0:
        return 0.0
    return float(np.mean(y_true == y_pred))


def log_loss(y_true, prob, eps: float = 1e-15) -> float:
    y_true = np.asarray(y_true).astype(float)
    prob = np.clip(np.asarray(prob).astype(float), eps, 1.0 - eps)
    if y_true.shape[0] == 0:
        return 0.0
    loss = -(y_true * np.log(prob) + (1.0 - y_true) * np.log(1.0 - prob))
    return float(np.mean(loss))


def roc_auc_score(y_true, prob) -> float:
    y_true = np.asarray(y_true).astype(int)
    prob = np.asarray(prob).astype(float)
    n_pos = np.sum(y_true == 1)
    n_neg = np.sum(y_true == 0)
    if n_pos == 0 or n_neg == 0:
        raise ValueError("ROC AUC is undefined when only one class is present.")
    order = np.argsort(prob)
    ranks = np.empty_like(order, dtype=float)
    ranks[order] = np.arange(len(prob)) + 1  # 1-based ranks
    sum_ranks_pos = np.sum(ranks[y_true == 1])
    auc = (sum_ranks_pos - n_pos * (n_pos + 1) / 2.0) / (n_pos * n_neg)
    return float(auc)


def mean_absolute_error(y_true, y_pred) -> float:
    y_true = np.asarray(y_true, dtype=float)
    y_pred = np.asarray(y_pred, dtype=float)
    if y_true.shape[0] == 0:
        return 0.0
    return float(np.mean(np.abs(y_true - y_pred)))


def mean_squared_error(y_true, y_pred) -> float:
    y_true = np.asarray(y_true, dtype=float)
    y_pred = np.asarray(y_pred, dtype=float)
    if y_true.shape[0] == 0:
        return 0.0
    return float(np.mean((y_true - y_pred) ** 2))
