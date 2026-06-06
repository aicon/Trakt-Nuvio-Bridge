# Projekt leírás és változások

## Mi ez?

A **Nuvio Trakt Bridge** egy önálló webes eszköz, amely a **Trakt.tv** „megnézett” (watched) adatait átviszi a **Nuvio Sync** felhőbe. A szinkronizáció **a böngészőben** fut; a szerver csak statikus fájlokat szolgál ki és a Trakt OAuth proxy-t kezeli.

### Mit szinkronizál?

| Forrás (Trakt) | Cél (Nuvio) | Megjegyzés |
|----------------|-------------|------------|
| Megnézett filmek | `sync_push_watched_items` | Watched-only, deduplikálva |
| Megnézett epizódok | `sync_push_watched_items` | AIOMetadata addon alapján remappelve |
| Lejátszási progress | `sync_push_watch_progress` | Opcionális (UI kapcsoló) |
| Watchlist / collection | Nuvio library | Opcionális |

### Mit **nem** csinál?

- Nem importál Trakt **history** naplót (minden újranézés külön esemény) – ez szándékos.
- Nem egyezik 1:1 a Yamtrack Statistics számokkal (az más forrásokból és definícióból számol).
- Nem küld vissza adatot Trakt felé (egyirányú import).

---

## Eredeti projekt vs. saját fork

**Eredeti:** [haaihond/Trakt-Nuvio-Bridge](https://github.com/haaihond/Trakt-Nuvio-Bridge)

**Saját fork:** [aicon/Trakt-Nuvio-Bridge](https://github.com/aicon/Trakt-Nuvio-Bridge)

A fork célja: saját NAS-on (Debian + Docker) futtatás, epizód-remapping megbízhatóság nagy könyvtáraknál, és hosszú távú bejelentkezés megőrzése.

---

## Elvégzett módosítások (fejlesztési napló)

### 1. Epizód remapping időkorlátok

**Probléma:** Nagy könyvtárnál (több ezer epizód) a remapping 30 másodperces globális guard miatt leállt. A Nuvio nyers Trakt ID-kat kapott, az epizódok nem jelentek meg „megnézettként”.

**Javítás (`app.js`):**

| Konstans | Régi | Új |
|----------|------|-----|
| Addon meta timeout | 3 s | **10 s** |
| Trakt lookup timeout | 4,5 s | **15 s** |
| Globális remapping budget | 30 s | **300 s (5 perc)** |

---

### 2. Trakt OAuth NAS IP / port alatt

**Probléma:** `http://NAS_IP:4173` használatánál a Trakt popup lefutott, de a főoldal „Trakt disconnected” maradt (`crypto is not defined`, majd postMessage origin mismatch).

**Javítások (`server.js`, `app.js`):**

- `import crypto from "node:crypto"` – Node 18 alatt a `crypto` nem globális.
- OAuth callback a böngésző `return_origin` értékét menti login-nál.
- Callback origin: `return_origin` → `TRAKT_CALLBACK_ORIGIN` → HTTP `Host` header (nem `0.0.0.0`).
- Lazább origin ellenőrzés OAuth state egyezésnél.
- Popup bezárás után 2,5 s türelmi idő a token feldolgozására.

---

### 3. Film deduplikáció

**Cél:** A Trakt watched filmek száma (~1383) az etalon – egy film = egy Nuvio tétel (Stremio-val megegyező logika).

**Javítás:**

- `dedupeTraktMovies()` – TMDB / Trakt / IMDb kulcs alapján, legfrissebb `watched_at` marad.
- `mapWatchedMovies()` – második pass `content_id` szerint.
- Yamtrack magasabb film száma **nem** hiba: history + rewatch + ratings forrás, más definíció.

---

### 4. Epizód remapping és Nuvio-kompatibilis fallback

**Probléma:** AIOMetadata és Trakt epizódszámozás eltér; timeout vagy bizonytalan remap esetén a Nuvio nem ismerte fel az epizódokat.

**Javítások:**

- Sorozat `content_id`: **`tmdb:{show_id}` prioritás** (Nuvio / addon kompatibilitás).
- Közvetlen addon SxxExx egyezés remapping előtt.
- Cache-ből addon match budget lejárta után is.
- Fallback: TMDB content_id + normalizált season/episode (nem vakon nyers Trakt slug).
- Eredmény (referencia sync): **4175/4175 verified**, fallback epizódok száma **71 → 4** (maradék: speciális S00 / katalógus hiány).

---

### 5. Session megőrzés (localStorage)

**Probléma:** Minden oldalfrissítés után újra Connect Trakt + Connect Nuvio kellett.

**Eredeti viselkedés:** Szándékos memória-only (privacy); `loadState()` törölte a storage-t.

**Javítás:**

- Trakt refresh token + Nuvio session mentése `localStorage`-ba.
- Oldal betöltéskor automatikus restore + token refresh.
- Disconnect gomb törli a mentést.
- Jelszó **soha** nem kerül mentésre.

**Megjegyzés:** Headless cron automatizáláshoz később szerver oldali megoldás kellhet; a localStorage csak ugyanabban a böngészőben érvényes.

---

### 6. Docker és Compose telepítés

**Új fájlok:**

- `Dockerfile` – Node 18 Alpine, `node server.js`, port 4173
- `docker-compose.yml` – build + env változók
- `.env.example` – Trakt OAuth sablon
- `.dockerignore`

---

## Ismert korlátok

| Téma | Magyarázat |
|------|------------|
| Yamtrack számok | Más import modell; összevetés félrevezető |
| 4 speciális epizód fallback | Pl. Knight Rider S00 – katalógus / addon hiány |
| Adult / hidden Trakt | A Trakt API nem adja a watched listában – Bridge sem látja |
| Cron | Böngészős eszköz; automatizálás = külön tervezés |

---

## Fő forráskód fájlok

| Fájl | Szerep |
|------|--------|
| `app.js` | UI, Trakt/Nuvio API, mapping, remapping, sync |
| `server.js` | HTTP szerver, OAuth proxy, `/config.js` |
| `index.html`, `styles.css` | Felület |
| `config.js` | OAuth endpoint fallback (env nélkül) |
