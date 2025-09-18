"""
Data format configuration for dataset loading and conversion.

Environment variables:
  - DATA_FORMAT: preferred format to load (parquet | csv | feather). Default: parquet.
  - PARQUET_COMPRESSION: parquet compression (zstd | snappy). Default: zstd.

# QUESTION: Confirm definitive list of data directories beyond those listed.
# QUESTION: Do we store big data files in Git? If yes, enable Git LFS for .parquet.
"""

import os

# Preferred runtime data format to load
DATA_FORMAT = os.getenv("DATA_FORMAT", "parquet").lower()  # options: 'parquet','csv','feather'

# Directories to scan for datasets (conversion script will iterate these)
DATA_DIRS = [
    "backend/Data",
    "backend/data",
    "data/processed",
    "data/raw",
    "data/qa",
]

# Default parquet compression; script will fallback to 'snappy' if zstd unavailable
PARQUET_COMPRESSION = os.getenv("PARQUET_COMPRESSION", "zstd").lower()  # 'zstd' or 'snappy'

