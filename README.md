# PokeSpinner
Spin a Pokémon elimination wheel, pick two random contenders, and watch them battle with type advantages and base stats from `pokeLIST.csv`.

## Features
- 9:16 capture frame with animated spin/pointer and battle overlay
- Full Pokédex dataset (ID, name, sprite, types, base stats, ball type)
- Filters: All, by type (multi-select), by Pokéball type (Poké/Great/Ultra/Master/Beast)
- Wheel size limiter, auto-spin with countdown, pause/resume, mute toggle
- Battle simulator dropdowns, elimination export/reset

## Quick Start
1) Open `index.html` in a modern browser (no build needed; everything is client-side).
2) Wait for "Start" to enable (CSV loads), then click **Start** to spin.
3) Use the **Filters** panel below the frame to narrow the wheel pool, then **Apply Filters**.
4) **Simulator** dropdowns let you pick specific Pokémon for a test battle.

## Controls
- **Start / Spin Now**: Begin show and spin immediately
- **Pause / Resume**: Controls auto-spin cadence
- **Auto-spin**: Toggle automated spins (15s default)
- **Wheel size**: Limit how many entries appear (UI-only subset)
- **Export / Reset Eliminations**: CSV export and clearing
- **Filters**: Mode (All / Type / Ball) + type multi-select + ball-type checkboxes

## Data
- Source: `pokeLIST.csv` (columns: ID, Name, SpriteURL, BallType, TYPE, HP, ATK, DEF, SPATK, SPDEF, SPD)
- Sprites are fetched via URLs; ball icons are in `/images/{ball}.png` (lowercase keys)

## Notes
- Filters cannot be applied during an active tournament; reset first if needed.
- Ball-type matching is case-insensitive; CSV values are normalized to lowercase when filtering.
- Mobile: controls sit beneath the 9:16 frame; body scrolls if needed.

## Troubleshooting
- **Wheel doesn’t populate**: Verify `pokeLIST.csv` is present next to `index.html` and is accessible by the browser.
- **Ball filter seems empty**: Ensure at least one ball checkbox is selected, then Apply Filters.
- **Sprites missing**: Confirm network access to `raw.githubusercontent.com` sprite URLs.
