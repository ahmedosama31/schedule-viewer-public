#!/usr/bin/env python3
import argparse
import json
import os
import shutil
import tempfile
from datetime import datetime
from pathlib import Path


def parse_args():
    parser = argparse.ArgumentParser(
        description="Repair search_logs.jsonl source values by normalizing comparer/missing to viewer."
    )
    parser.add_argument(
        "path",
        nargs="?",
        default="search_logs.jsonl",
        help="Path to JSONL log file (default: search_logs.jsonl)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Analyze and print summary without changing the file.",
    )
    return parser.parse_args()


def build_backup_path(path: Path) -> Path:
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    return path.with_name(f"{path.name}.bak.{stamp}")


def normalize_source(entry: dict) -> bool:
    source = entry.get("source")
    if isinstance(source, str):
        normalized = source.strip().lower()
        if normalized and normalized != "comparer":
            return False
    entry["source"] = "viewer"
    return True


def write_raw_line(out_file, raw_line: str):
    if raw_line.endswith("\n"):
        out_file.write(raw_line)
    else:
        out_file.write(raw_line + "\n")


def repair_file(path: Path, dry_run: bool):
    total_lines = 0
    parsed_lines = 0
    changed_lines = 0
    invalid_json_lines = 0

    tmp_fd, tmp_name = tempfile.mkstemp(prefix=f".{path.name}.tmp.", dir=str(path.parent))
    os.close(tmp_fd)
    tmp_path = Path(tmp_name)

    try:
        with path.open("r", encoding="utf-8", errors="replace") as src, tmp_path.open(
            "w", encoding="utf-8"
        ) as dst:
            for raw_line in src:
                total_lines += 1
                line = raw_line.rstrip("\n")

                try:
                    entry = json.loads(line)
                except Exception:
                    invalid_json_lines += 1
                    write_raw_line(dst, raw_line)
                    continue

                if not isinstance(entry, dict):
                    invalid_json_lines += 1
                    write_raw_line(dst, raw_line)
                    continue

                parsed_lines += 1
                if normalize_source(entry):
                    changed_lines += 1

                dst.write(json.dumps(entry, ensure_ascii=False) + "\n")

        stats = {
            "total_lines": total_lines,
            "parsed_lines": parsed_lines,
            "changed_lines": changed_lines,
            "invalid_json_lines": invalid_json_lines,
        }

        if dry_run:
            tmp_path.unlink(missing_ok=True)
            return stats, None

        backup_path = build_backup_path(path)
        shutil.copy2(path, backup_path)
        os.replace(tmp_path, path)
        return stats, backup_path
    finally:
        if tmp_path.exists():
            tmp_path.unlink()


def main():
    args = parse_args()
    path = Path(args.path)

    if not path.exists():
        raise SystemExit(f"File not found: {path}")
    if not path.is_file():
        raise SystemExit(f"Not a file: {path}")

    stats, backup_path = repair_file(path, dry_run=args.dry_run)

    print(f"file: {path}")
    print(f"total_lines: {stats['total_lines']}")
    print(f"parsed_lines: {stats['parsed_lines']}")
    print(f"changed_lines: {stats['changed_lines']}")
    print(f"invalid_json_lines: {stats['invalid_json_lines']}")
    if args.dry_run:
        print("dry_run: true")
    else:
        print(f"backup: {backup_path}")


if __name__ == "__main__":
    main()
