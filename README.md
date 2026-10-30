# BallIdentifier

Identify any countryball from a spawn image in a second.

- **Website:** [ballidentifier.xyz](https://ballidentifier.xyz): Identify, Spawn Arts, Catch Trainer, Collectors and Ballsdex stats
- **Discord bot:** [BallIdentifier-bot](https://github.com/Meff1u/BallIdentifier-bot): right-click a spawn, *Apps → Identify*

Supported dexes: Ballsdex, HistoryDex, JoJoDex, Empireballs Reboot, MapsDex, FlagsDex.

The website and the bot both read the dex data from this repository, so **a merged pull request here updates both** (the bot reloads the data every hour).

---

## Contributing dex data

New spawn art out? A rarity changed? A ball got renamed? You can fix it yourself with a pull request.

### What's where

For every dex (`<Dex>` is the exact name from [`assets/jsons/dexes.json`](assets/jsons/dexes.json), e.g. `Ballsdex` or `Empireballs Reboot`):

| File | What it is | Who edits it |
|---|---|---|
| `assets/dexes/<Dex>/<Name>.png` | The full spawn art | **you** |
| `assets/jsons/<Dex>.json` | Details of every ball | **you** |
| `assets/dexes/<Dex>/compressed/<Name>.webp` | Small preview for the website | built by the script |
| `assets/jsons/<Dex>Hashes.json` | Image fingerprint used to identify spawns | built by the script |
| `assets/jsons/previous-arts.json` + `assets/dexes/Ballsdex/previous/<Name>/<n>.webp` | Older Ballsdex arts | **you** (Ballsdex only) |

`<Name>` must be **exactly** the ball's name as the dex bot shows it (same capitals, spaces, accents and emoji), and it must be the same in the file name and in the JSON.

### Ball details (`assets/jsons/<Dex>.json`)

```json
"Poland": {
    "rarity": 12,
    "artist": "SomeArtist",
    "id": 42
}
```

| Field | Required | Format | Notes |
|---|---|---|---|
| `rarity` | **yes** | number | The dex's rarity (tier for Ballsdex, e.g. `12`; can be decimal in some dexes) |
| `artist` | **yes** | text | Spawn art artist |
| `id` | **yes** | whole number | The ball's ID in the dex; must be unique |
| `wave` | no | number | e.g. `5` or `5.1` |
| `common_value` | no | text | e.g. `"150"` |
| `demand` | no | text | e.g. `"A"` |
| `cc` | no | text | Balls needed for the collector card, e.g. `"2,800"` |

Leave out optional fields you don't know. Don't add or edit `collectors`: collectors are managed on the website ([Collectors tab](https://ballidentifier.xyz/#/collectors)), where people add themselves.

### Common changes

**New spawn art for an existing ball**
1. Replace `assets/dexes/<Dex>/<Name>.png` with the new art (PNG, the original size, no extra borders).
2. Update `artist` in `<Dex>.json` if it changed.
3. *(Ballsdex)* Keep the old art: save it as the next number in `assets/dexes/Ballsdex/previous/<Name>/` (`1.webp`, `2.webp`, …, oldest first) and add `{ "artist": "...", "until": "Month Year" }` to `previous-arts.json`.

**New ball**
1. Add `assets/dexes/<Dex>/<Name>.png`.
2. Add its entry to `<Dex>.json` with at least `rarity`, `artist` and `id`.

**Renamed ball**
Rename the PNG **and** the key in `<Dex>.json` (and in `previous-arts.json` / the `previous` folder for Ballsdex). The script moves the preview and hash.

**Only details changed** (rarity, value, demand, …)
Just edit `<Dex>.json`. No script needed.

### Build and check

You need [Node.js](https://nodejs.org) 18 or newer.

```bash
npm install
npm run dex:build -- "Ballsdex"   # the dex you changed (or leave it out for all dexes)
```

`dex:build` turns other image formats into PNG, makes the previews and hashes for new or changed arts, removes leftovers of deleted arts, and then checks everything. To only check:

```bash
npm run dex:check
```

Fix every `error` it prints (usually a typo in a name or a missing field). Pull requests that touch `assets/` are checked automatically too.

Can't run the script? Open the pull request anyway and say so: a maintainer will build it.

### Pull request checklist

- [ ] File names and JSON keys match exactly
- [ ] Arts are `.png` in `assets/dexes/<Dex>/`
- [ ] `npm run dex:check` passes (or you said you couldn't run it)
- [ ] One topic per pull request (e.g. "Ballsdex: new arts for Poland and Peru")

### Spotted something but don't want to make a pull request?

[Open an issue](https://github.com/Meff1u/BallIdentifier/issues/new) with the dex, the ball and what's wrong (a screenshot of the spawn helps), or message `@meffiu` on Discord. Spawns the bot can't identify are also reported automatically.

---

BallIdentifier is a fan project and is not affiliated with The Ballsdex Team or any dex.
