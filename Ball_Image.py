import requests
from PIL import Image
from io import BytesIO
import os

# 1) List of the four ball item slugs in the API
items = ["luxury-ball"]
items2 = ["beast-ball"]
items1 = ["poke-ball", "great-ball", "ultra-ball", "master-ball"]

# 2) Make sure output dir exists
os.makedirs("ball_sprites_96", exist_ok=True)

for name in items:
    # Fetch item JSON
    r = requests.get(f"https://pokeapi.co/api/v2/item/{name}")
    r.raise_for_status()
    data = r.json()
    
    # Get the default sprite URL (30×30 or 24×24)
    url = data["sprites"]["default"]
    if not url:
        print(f"⚠️ No sprite for {name}")
        continue
    
    # Download the PNG
    img_data = requests.get(url).content
    img = Image.open(BytesIO(img_data)).convert("RGBA")
    
    # Resize to 96×96 px (preserves sharp edges)
    img96 = img.resize((96, 96), Image.NEAREST)
    
    # Save locally
    out_path = os.path.join("ball_sprites_96", f"{name}.png")
    img96.save(out_path)
    print(f"Saved {out_path}")
