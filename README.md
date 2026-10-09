# Oche · Darts

A darts scoring app that runs fully in the browser. No server is needed. The running game is saved in `localStorage`, so a page refresh resumes it.

Live: https://simon725.github.io/DartsBot/

## Structure

- `apps/client`: Angular app (UI and game state)
- `packages/shared`: types, checkout tables and the game engine (x01, cricket, shanghai, killer, around the clock, 121, bot)

## Commands

```bash
npm start
```

Starts the dev server at http://localhost:4200.

```bash
npm test
```

```bash
npm run build
```

## Deploy

Every push to `main` runs `.github/workflows/deploy.yml`, which tests, builds and publishes the app to GitHub Pages.
