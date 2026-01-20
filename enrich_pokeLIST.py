import csv
import json
import shutil
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Tuple

API_BASE = "https://pokeapi.co/api/v2"


@dataclass(frozen=True)
class Row:
    pid: int
    name: str
    sprite_url: str
    ball_type: str


def fetch_json(url: str, *, max_retries: int = 6, timeout_s: int = 20) -> dict:
    last_err: Exception | None = None
    for attempt in range(max_retries):
        try:
            req = urllib.request.Request(
                url,
                headers={
                    "User-Agent": "pokespin-enricher/1.0 (local script)",
                    "Accept": "application/json",
                },
            )
            with urllib.request.urlopen(req, timeout=timeout_s) as resp:
                data = resp.read().decode("utf-8")
                return json.loads(data)
        except urllib.error.HTTPError as e:
            last_err = e
            # Respect rate limiting
            if e.code == 429:
                retry_after = e.headers.get("Retry-After")
                try:
                    wait_s = int(retry_after) if retry_after else 2
                except ValueError:
                    wait_s = 2
                time.sleep(wait_s)
                continue
            # transient server issues
            if 500 <= e.code < 600:
                time.sleep(1.5 * (attempt + 1))
                continue
            raise
        except Exception as e:
            last_err = e
            time.sleep(1.0 * (attempt + 1))

    raise RuntimeError(f"Failed to fetch {url} after {max_retries} retries: {last_err}")


def parse_existing_rows(csv_path: Path) -> List[Row]:
    with csv_path.open("r", newline="", encoding="utf-8") as fh:
        reader = csv.DictReader(fh)
        required = {"ID", "Name", "SpriteURL", "BallType"}
        missing = required - set(reader.fieldnames or [])
        if missing:
            raise ValueError(f"Missing required columns in {csv_path.name}: {sorted(missing)}")

        rows: List[Row] = []
        for r in reader:
            pid = int(r["ID"])
            rows.append(
                Row(
                    pid=pid,
                    name=r["Name"],
                    sprite_url=r["SpriteURL"],
                    ball_type=r["BallType"],
                )
            )
        return rows


def extract_types(detail: dict) -> str:
    # Keep stable order (slot 1 then 2)
    types = sorted(detail.get("types", []), key=lambda t: t.get("slot", 999))
    names = [t.get("type", {}).get("name", "").strip() for t in types]
    names = [n for n in names if n]
    if not names:
        return "unknown"
    # Avoid commas since CSV parsing in the project is naive.
    return "/".join(names)


def extract_stats(detail: dict) -> Dict[str, int]:
    out = {
        "HP": 0,
        "ATK": 0,
        "DEF": 0,
        "SPATK": 0,
        "SPDEF": 0,
        "SPD": 0,
    }
    for s in detail.get("stats", []) or []:
        key = s.get("stat", {}).get("name")
        val = s.get("base_stat")
        if not isinstance(val, int):
            continue
        if key == "hp":
            out["HP"] = val
        elif key == "attack":
            out["ATK"] = val
        elif key == "defense":
            out["DEF"] = val
        elif key == "special-attack":
            out["SPATK"] = val
        elif key == "special-defense":
            out["SPDEF"] = val
        elif key == "speed":
            out["SPD"] = val
    return out


def load_cache(cache_path: Path) -> Dict[str, dict]:
    if not cache_path.exists():
        return {}
    try:
        return json.loads(cache_path.read_text(encoding="utf-8"))
    except Exception:
        return {}


def save_cache(cache_path: Path, cache: Dict[str, dict]) -> None:
    tmp = cache_path.with_suffix(cache_path.suffix + ".tmp")
    tmp.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")
    tmp.replace(cache_path)


def stream_enrich_to_file(rows: List[Row], out_csv: Path, *, cache_path: Path, delay_s: float = 0.03) -> None:
    """Write an enriched CSV, using a local cache so reruns resume quickly."""
    cache = load_cache(cache_path)
    fieldnames = ["ID", "Name", "SpriteURL", "BallType", "TYPE", "HP", "ATK", "DEF", "SPATK", "SPDEF", "SPD"]

    with out_csv.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=fieldnames)
        writer.writeheader()

        for idx, row in enumerate(rows, start=1):
            cached = cache.get(str(row.pid))
            if cached:
                typ = cached.get("TYPE", "unknown")
                stats = {k: int(cached.get(k, 0)) for k in ("HP", "ATK", "DEF", "SPATK", "SPDEF", "SPD")}
            else:
                detail = fetch_json(f"{API_BASE}/pokemon/{row.pid}", timeout_s=12)
                typ = extract_types(detail)
                stats = extract_stats(detail)
                cache[str(row.pid)] = {"TYPE": typ, **stats}

            writer.writerow(
                {
                    "ID": row.pid,
                    "Name": row.name,
                    "SpriteURL": row.sprite_url,
                    "BallType": row.ball_type,
                    "TYPE": typ,
                    **stats,
                }
            )

            if idx % 25 == 0:
                save_cache(cache_path, cache)
            if idx % 50 == 0 or idx == len(rows):
                print(f"Enriched {idx}/{len(rows)}")
            time.sleep(delay_s)

    save_cache(cache_path, cache)


def main() -> None:
    folder = Path(__file__).resolve().parent
    csv_path = folder / "pokeLIST.csv"
    if not csv_path.exists():
        raise FileNotFoundError(f"Not found: {csv_path}")

    rows = parse_existing_rows(csv_path)

    cache_path = folder / ".pokeapi_stats_cache.json"

    backup_path = folder / "pokeLIST.csv.bak"
    tmp_path = folder / "pokeLIST.csv.tmp"

    # Stream write to tmp (resumable via cache)
    stream_enrich_to_file(rows, tmp_path, cache_path=cache_path)

    # Backup original, then replace
    shutil.copyfile(csv_path, backup_path)
    tmp_path.replace(csv_path)
    print(f"Wrote enriched CSV: {csv_path}")
    print(f"Backup saved as: {backup_path}")


if __name__ == "__main__":
    main()
