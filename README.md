# Runner Legends

Mobile-first online Runner prototype for Web, designed for later Android packaging with Capacitor.

## Stack

- Phaser 3
- TypeScript
- Vite
- Capacitor-ready

## Run

```bash
npm install
npm run dev
```

Build:

```bash
npm run build
```

Android preparation:

```bash
npm run android:sync
npx cap add android
npx cap open android
```

## Current prototype

- Six selectable characters
- Three-lane runner gameplay
- Touch controls
- Keyboard fallback
- Jump and lane switching
- Procedural obstacles
- Coins
- Increasing speed
- Mission HUD
- Game-over/restart flow

The current visuals are generated in Phaser so the prototype has no binary asset dependency. Character art, environment art, audio, shop, missions, cloud save and leaderboard are planned as the next production layers.
