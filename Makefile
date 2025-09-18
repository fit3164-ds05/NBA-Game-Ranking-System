SHELL := /bin/bash

.PHONY: convert
convert:
	python scripts/convert_datasets.py

.PHONY: train-cls
train-cls:
	python scripts/train_xgb_classification.py

.PHONY: train-reg
train-reg:
	python scripts/train_xgb_regression.py

.PHONY: tune
tune:
	python scripts/tune_xgb.py

.PHONY: cv-cls
cv-cls:
	python scripts/walk_forward_eval.py cls

.PHONY: cv-reg
cv-reg:
	python scripts/walk_forward_eval.py reg
