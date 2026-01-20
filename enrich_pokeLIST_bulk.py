import csv
import shutil
import urllib.request
from pathlib import Path
from typing import Dict, List, Tuple

# Bulk CSV sources from the official PokeAPI data repo
BASE = "https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv"
URLS = {
    "pokemon_stats.csv": f"{BASE}/pokemon_stats.csv",
    "pokemon_types.csv": f"{BASE}/pokemon_types.csv",
    "types.csv": f"{BASE}/types.csv",
    "stats.csv": f"{BASE}/stats.csv",
}

STAT_TO_COL = {
    "hp": "HP",
    "attack": "ATK",
    "defense": "DEF",
    "special-attack": "SPATK",
    "special-defense": "SPDEF",
    "speed": "SPD",
}


def download_if_missing(url: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and dest.stat().st_size > 0:
        return
    req = urllib.request.Request(url, headers={"User-Agent": "pokespin-bulk-enricher/1.0"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        dest.write_bytes(resp.read())


def read_csv(path: Path) -> List[dict]:
    with path.open("r", newline="", encoding="utf-8") as fh:
        return list(csv.DictReader(fh))


def build_type_maps(types_csv: Path) -> Dict[int, str]:
    # types.csv: id,identifier,generation_id,damage_class_id
    out: Dict[int, str] = {}
    for r in read_csv(types_csv):
        try:
            out[int(r["id"])] = r["identifier"].strip()
        except Exception:
            continue
    return out


def build_stat_maps(stats_csv: Path) -> Dict[int, str]:
    # stats.csv: id,damage_class_id,identifier,is_battle_only,game_index
    out: Dict[int, str] = {}
    for r in read_csv(stats_csv):
        try:
            out[int(r["id"])] = r["identifier"].strip()
        except Exception:
            continue
    return out


def build_pokemon_stats(pokemon_stats_csv: Path, stat_id_to_ident: Dict[int, str]) -> Dict[int, Dict[str, int]]:
    # pokemon_stats.csv: pokemon_id,stat_id,base_stat,effort
    out: Dict[int, Dict[str, int]] = {}
    for r in read_csv(pokemon_stats_csv):
        try:
            pid = int(r["pokemon_id"])
            stat_id = int(r["stat_id"])
            base = int(r["base_stat"])
        except Exception:
            continue
        ident = stat_id_to_ident.get(stat_id)
        col = STAT_TO_COL.get(ident or "")
        if not col:
            continue
        out.setdefault(pid, {})[col] = base
    return out


def build_pokemon_types(pokemon_types_csv: Path, type_id_to_ident: Dict[int, str]) -> Dict[int, List[str]]:
    # pokemon_types.csv: pokemon_id,type_id,slot
    tmp: Dict[int, List[Tuple[int, str]]] = {}
    for r in read_csv(pokemon_types_csv):
        try:
            pid = int(r["pokemon_id"])
            tid = int(r["type_id"])
            slot = int(r["slot"])
        except Exception:
            continue
        tname = type_id_to_ident.get(tid)
        if not tname:
            continue
        tmp.setdefault(pid, []).append((slot, tname))

    out: Dict[int, List[str]] = {}
    for pid, entries in tmp.items():
        entries.sort(key=lambda x: x[0])
        out[pid] = [t for _, t in entries]
    return out


def parse_existing_pokelist(poke_csv: Path) -> List[dict]:
    with poke_csv.open("r", newline="", encoding="utf-8") as fh:
        reader = csv.DictReader(fh)
        required = {"ID", "Name", "SpriteURL", "BallType"}
        missing = required - set(reader.fieldnames or [])
        if missing:
            raise ValueError(f"pokeLIST.csv missing columns: {sorted(missing)}")
        return list(reader)


def main() -> None:
    folder = Path(__file__).resolve().parent
    poke_csv = folder / "pokeLIST.csv"
    if not poke_csv.exists():
        raise FileNotFoundError(poke_csv)

    cache_dir = folder / ".pokeapi_csv_cache"
    for name, url in URLS.items():
        download_if_missing(url, cache_dir / name)

    type_id_to_ident = build_type_maps(cache_dir / "types.csv")
    stat_id_to_ident = build_stat_maps(cache_dir / "stats.csv")
    pokemon_stats = build_pokemon_stats(cache_dir / "pokemon_stats.csv", stat_id_to_ident)
    pokemon_types = build_pokemon_types(cache_dir / "pokemon_types.csv", type_id_to_ident)

    rows = parse_existing_pokelist(poke_csv)

    out_fields = ["ID", "Name", "SpriteURL", "BallType", "TYPE", "HP", "ATK", "DEF", "SPATK", "SPDEF", "SPD"]
    tmp_path = folder / "pokeLIST.csv.tmp"
    bak_path = folder / "pokeLIST.csv.bak"

    with tmp_path.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=out_fields)
        writer.writeheader()

        for r in rows:
            pid = int(r["ID"])
            types = pokemon_types.get(pid, [])
            type_str = "/".join(types) if types else "unknown"

            stats = pokemon_stats.get(pid, {})
            out_row = {
                "ID": pid,
                "Name": r["Name"],
                "SpriteURL": r["SpriteURL"],
                "BallType": r["BallType"],
                "TYPE": type_str,
                "HP": stats.get("HP", 0),
                "ATK": stats.get("ATK", 0),
                "DEF": stats.get("DEF", 0),
                "SPATK": stats.get("SPATK", 0),
                "SPDEF": stats.get("SPDEF", 0),
                "SPD": stats.get("SPD", 0),
            }
            writer.writerow(out_row)

    shutil.copyfile(poke_csv, bak_path)
    tmp_path.replace(poke_csv)

    print("Wrote enriched pokeLIST.csv")
    print(f"Backup: {bak_path}")


if __name__ == "__main__":
    main()
