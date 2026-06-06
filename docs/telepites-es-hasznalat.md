# Telepítés és használat (NAS / Docker)

## Előfeltételek

- Debian (vagy más Linux) NAS / szerver
- Docker + Docker Compose plugin
- Trakt OAuth alkalmazás – lásd [trakt-api-beallitas.md](./trakt-api-beallitas.md)
- Nuvio Sync fiók

---

## Telepítés lépései

```bash
git clone https://github.com/aicon/Trakt-Nuvio-Bridge.git
cd Trakt-Nuvio-Bridge
cp .env.example .env
nano .env   # Trakt kulcsok + URL-ek
docker compose up -d --build
```

Nyisd meg: `http://<host>:4173/` (vagy a `HOST_PORT` értékét).

---

## Első használat

1. **Connect Trakt** – OAuth popup, engedélyezés
2. **Connect Nuvio** – email + jelszó (csak memóriában / session; jelszó nem mentődik)
3. Válaszd ki a **Nuvio profilt**
4. Kapcsolók: **Sync history** (ajánlott), progress / watchlist / collection opcionális
5. **Preview sync** – ellenőrzés számokban
6. **Run sync** – tényleges push

### Sikeres sync log (példa)

```text
Pulled 1383 watched movies from /users/me/watched/movies.
Pulled 58 watched shows from /users/me/watched/shows.
Mapped 4175 watched items for Nuvio.
Verified 4175/4175 watched keys in Nuvio Sync profile 1.
Sync complete.
```

---

## Frissítés

```bash
cd /path/to/Trakt-Nuvio-Bridge
git pull
docker compose up -d --build
```

### Git pull ütközés (helyi módosítás)

Deploy klónban, ha csak a GitHub verzió kell:

```bash
git fetch origin
git reset --hard origin/main
docker compose up -d --build
```

A `.env` fájl általában nincs verziókezelve – megmarad.

---

## Docker Compose felépítés

```yaml
services:
  trakt-nuvio-bridge:
    build: .
    ports:
      - "${HOST_PORT:-4173}:4173"
    environment:
      TRAKT_CLIENT_ID: ...
      TRAKT_CLIENT_SECRET: ...
      TRAKT_REDIRECT_URI: ...
      TRAKT_CALLBACK_ORIGIN: ...
```

Logok:

```bash
docker compose logs -f trakt-nuvio-bridge
```

Leállítás:

```bash
docker compose down
```

---

## nginx reverse proxy (opcionális)

Példa snippet:

```nginx
location / {
    proxy_pass http://127.0.0.1:4173;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

Compose-ban bindeld a portot localhostra:

```yaml
ports:
  - "127.0.0.1:4173:4173"
```

Env-ben használd a publikus **https** URL-t a Trakt változóknál.

---

## Session megőrzés

- Trakt + Nuvio kapcsolat **megmarad** oldalfrissítés / böngésző újraindítás után.
- Log: `Restored saved Trakt connection.` / `Restored saved Nuvio connection.`
- **Disconnect** gomb törli a mentést.
- Másik gépen / böngészőben újra be kell jelentkezni.

---

## Szinkron logika (rövid összefoglaló)

### Filmek

- Forrás: `/users/me/watched/movies`
- Egy film = egy tétel (deduplikálva TMDB/Trakt ID alapján)
- Várható szám: ~1383 (egyedi megnézett film)

### Sorozat epizódok

- Forrás: `/users/me/watched/shows`
- Remapping: **AIOMetadata | Local** addon
- `content_id`: sorozat **TMDB ID** preferált
- 300 s globális budget nagy könyvtárra

### Yamtrack összehasonlítás

Ne várj azonos számokat. Yamtrack history / ratings / watchlist forrásokból számol; a Bridge **csak watched** listát visz.

---

## Hibakeresés

| Tünet | Teendő |
|-------|--------|
| `plan is not defined` | Frissítsd a legújabb `app.js`-re (javítva) |
| Epizódok nem watched Nuvióban | Nézd a remapping fallback summary-t; speciális S00 epizódok katalógus limit |
| Trakt disconnected popup után | Ellenőrizd `TRAKT_CALLBACK_ORIGIN` + Redirect URI |
| `Skipped N items` | Hiányzó ID a Trakt adatban – log + preview |
| Token lejárt | Connect újra, vagy Disconnect + Connect |

---

## Következő lépések (opcionális, nincs implementálva)

- Headless / cron sync (szerver oldali API)
- GHCR előre buildelt imázs
- HTTPS Let's Encrypt automatizálás
- CrossWatch integráció (kétirányú sync más rendszerekkel)

---

## Kapcsolódó dokumentumok

- [Projekt és változások](./projekt-es-valtozasok.md)
- [Trakt API beállítás](./trakt-api-beallitas.md)
- Angol README a repo gyökerében: [../README.md](../README.md)
