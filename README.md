# grn

A browser survival game where instruments are weapons and effects shape your build. Survive 15 minutes and the final drop. Vanilla JavaScript, Canvas 2D, and Web Audio; no dependencies or build step.

## Play

Serve the checkout with `python3 -m http.server 8000`, then open it in a browser. GitHub Pages serves the same files directly from the repository root.

- Choose an unlocked starting instrument and press **Start your set**.
- Move with **WASD / arrow keys**, or drag the arena on touch screens. Weapons fire automatically.
- **Space / Shift**, or the dash button: a short invulnerable dash, with a three-second cooldown.
- **Escape**, or the pause button: pause/resume. Changing tabs automatically pauses the game.
- Collect diamonds for XP; choose upgrades with **1 / 2 / 3** or by clicking a card. **R** rerolls (one free reroll per run, plus shop bonuses).
- Effect cards name their target channel. They change only that instrument's sound and attacks. A rank-five voice plus its matching effect on the same channel unlocks an evolution.
- Warm-colored enemies show their attack direction before charging or firing. Elites arrive every other cycle, starting with set three.
- Every twelfth defeated enemy drops a supply pickup. Elites drop health and a magnet. Obstacles are currently disabled.
- Vinyl buys permanent upgrades after a run. Opening Track adds a second starting voice. Saves remain local to your browser; master volume is saved separately.

## Development

Use Node 24:

```sh
npm test
npm run test:browser
```

The browser suite needs Chromium (`chromium` on PATH, or set `CHROMIUM` to its executable). It uses a temporary server/profile and Node's built-in WebSocket client; no npm installation is needed. Test-only hooks are injected by that server, never shipped by the game. It covers startup, movement, touch controls, dash, pause, upgrades, evolved audio channels, enemy kills, run reset, and responsive layouts. Screenshots go to the system temporary directory.
