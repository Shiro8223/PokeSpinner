import requests
import csv
import time
from tqdm import tqdm

API_BASE = "https://pokeapi.co/api/v2"
REGIONAL_SUFFIXES = {"alola", "galar", "hisui", "paldea"}

session = requests.Session()
session.headers.update({"User-Agent": "poke-fetcher/1.2"})

def fetch_master_list(limit=2000):
    url = f"{API_BASE}/pokemon?limit={limit}"
    resp = session.get(url); resp.raise_for_status()
    return resp.json()["results"]

# cache evolution chains
_chain_cache = {}
def get_chain(chain_url):
    cid = chain_url.rstrip("/").split("/")[-1]
    if cid not in _chain_cache:
        _chain_cache[cid] = session.get(chain_url).json()
    return _chain_cache[cid]

def build_depth_map(chain_json):
    depth_map = {}
    def recurse(node, depth):
        nm = node["species"]["name"]
        depth_map.setdefault(nm, depth)
        for evo in node["evolves_to"]:
            recurse(evo, depth + 1)
    recurse(chain_json["chain"], 0)
    max_depth = max(depth_map.values())
    return depth_map, max_depth

def classify_ball(sp_data, name, depth_map, max_depth):
    depth = depth_map.get(name, 0)
    # 1) Legendary or Mythical → Masterball
    if sp_data.get("is_legendary") or sp_data.get("is_mythical"):
        return "masterball"
    # 2) Baby or Basic (depth 0) → Pokeball
    if sp_data.get("is_baby") or depth == 0:
        return "pokeball"
    # 3) Final evolution → Ultraball
    if depth == max_depth:
        return "ultraball"
    # 4) Everything else → GreatBall
    return "GreatBall"

def is_wanted_form(name):
    parts = name.split("-", 1)
    # default form
    if len(parts) == 1:
        return True
    # regional form
    return parts[1] in REGIONAL_SUFFIXES

def main():
    all_entries = fetch_master_list()
    with open("all_pokemon_with_ball.csv", "w", newline="", encoding="utf-8") as fh:
        writer = csv.writer(fh)
        writer.writerow(["ID", "Name", "SpriteURL", "BallType"])

        # cache depth info per chain
        depth_cache = {}

        for entry in tqdm(all_entries, desc="Processing Pokémon"):
            name = entry["name"]
            if not is_wanted_form(name):
                continue

            # extract ID
            pid = entry["url"].rstrip("/").split("/")[-1]

            # fetch detail & sprite
            detail = session.get(entry["url"]).json()
            sprite = detail["sprites"]["front_default"] or ""

            # fetch species & evolution
            sp = session.get(detail["species"]["url"]).json()
            chain_url = sp["evolution_chain"]["url"]

            if chain_url not in depth_cache:
                chain_json = get_chain(chain_url)
                depth_cache[chain_url] = build_depth_map(chain_json)

            depth_map, max_depth = depth_cache[chain_url]
            ball = classify_ball(sp, name, depth_map, max_depth)

            writer.writerow([pid, name, sprite, ball])
            time.sleep(0.1)  # gentle rate-limit

    print("Written all_pokemon_with_ball.csv")

if __name__ == "__main__":
    main()
