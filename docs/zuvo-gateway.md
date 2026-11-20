# Zuvo api-games gateway

Money/API runs as a **separate git repo**:  
[`/Users/macbook/projects/games/api-games-gateway`](../../api-games-gateway) (sibling of this Next.js UI).

Vercel keeps Phaser/Next **UI only**. Browser calls:

```bash
NEXT_PUBLIC_GAME_API_BASE=https://games.app.zuvodev.com/api/v1
```

Ludo tenant gateway:

```bash
API_GAMES_BASE_URL=https://games.app.zuvodev.com
```

Live hosting app: Zuvo project `games` → https://games.app.zuvodev.com  
Source: https://github.com/mohsinasif765-dotcom/api-games-gateway

Next `/api/v1/*` on Vercel is temporary fallback — remove or 410 after gateway is stable.
