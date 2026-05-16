# Soccer Stats

A mobile-first web app for tracking soccer game stats live from the sideline.
Built as an installable PWA — no build step, no server, no accounts. All data
is stored locally on your device.

## Features

- **Live game tracking** — pick the opponent, run a timer for two 25-minute
  halves (counts up, with stoppage time past 25:00).
- **One-tap stat logging** with the exact time of every event:
  - **Shot on Goal** → choose who took it from a roster modal.
  - **Goal** → choose the scorer, then the assist (or "unassisted").
  - **Save** → choose which keeper made it.
  - **Opponent Goal** → one tap, keeps the scoreline accurate.
- **Live scoreboard** on the game screen and the current score on the Home screen.
- **Game feed** with every event; tap the × to undo a mis-tap.
- **Final stats** at the end of each game — team totals (goals, assists, shots,
  saves, shot conversion, goals conceded), a per-player table, and a half-by-half
  timeline.
- **Games history** — every past game with opponent, date, score and a W/L/D
  result chip; tap any game to reopen its full stats.
- **Edit or delete games** — fix a finished game's opponent, date or tournament,
  or remove it entirely, from its stats screen.
- **Opponent memory** — the New Game opponent box is a dropdown of teams you've
  played before (type a new one and it's remembered). Deleting a game keeps the
  team in the list.
- **Tournament games** — tick a box to mark a game as a tournament game and name
  the tournament; it's labelled on the game, history and stats screens.
- **Roster management** — add players with names and numbers; each player shows
  running season totals.
- **Season record** — W/D/L and goals for/against across all games.
- **Works offline** and survives reloads — everything persists in the browser.

## Running it

It's plain HTML/CSS/JS. Serve the folder over HTTP (a service worker needs
`http://` or `https://`, not `file://`):

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000` on your phone or browser. On a phone, use
"Add to Home Screen" to install it as a standalone app.

To use it on the field, host the folder on any static host (GitHub Pages,
Netlify, etc.).

## How to use

1. **Roster** tab — add your players (name + optional jersey number).
2. **Home** → **Start New Game** — enter the opponent and date.
3. On the game screen, tap **Start** to run the half timer and use the four
   action buttons to log events as they happen.
4. Tap **End 1st Half** at the break, then **Start** again for the 2nd half.
5. Tap **End Game** to finish and see the full stats.
6. Find past games and season stats under the **Games** tab.

## Files

| File | Purpose |
|---|---|
| `index.html` | App shell |
| `styles.css` | Mobile-first styling |
| `app.js` | All app logic, state and views |
| `manifest.webmanifest` | PWA metadata |
| `service-worker.js` | Offline caching |
| `icon.svg` | App icon |

## Data & privacy

All data lives in your browser's `localStorage` on the device you use. Nothing
is uploaded anywhere. Clearing site data (or the browser) removes your games.
