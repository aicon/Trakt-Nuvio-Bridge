# Trakt API alkalmazás beállítása

A Bridge Trakt bejelentkezéshez **OAuth alkalmazást** kell regisztrálni a Trakt.tv-n. Az új alkalmazás PKCE-vel lép be, és **nem ad Client Secretet**. A szerver csak a Client ID-t használja.

## 1. Alkalmazás létrehozása

1. Jelentkezz be: https://trakt.tv
2. Nyisd meg: https://trakt.tv/oauth/applications
3. **New Application** (új alkalmazás)

### Kitöltendő mezők

| Mező | Példa | Megjegyzés |
|------|-------|------------|
| **Name** | `Nuvio Trakt Bridge (NAS)` | Bármi felismerhető név |
| **Redirect uri** | Lásd lent | **Pontosan** egyezzen a `TRAKT_REDIRECT_URI` env-vel |
| **Permissions** | `/` (full) | Watched history lekéréshez |

### Redirect URI példák

A Trakt a sima `http://` címet csak loopbackre engedi. LAN-on a belépés eszközkód: a Connect Trakt egy kódot ad, azt a `https://trakt.tv/activate` oldalon kell beírni. Redirect cím ehhez nem kell.

**Domain nginx mögött (HTTPS):**

```text
https://trakt-nuvio.example.com/api/trakt/callback
```

> A path mindig: `/api/trakt/callback` – ez a Bridge beépített OAuth végpontja.

4. Mentsd el az alkalmazást.
5. Másold ki a **Client ID**-t úgy, ahogy a Credentials alatt látszik. Az új PKCE-alkalmazás azonosítója rövidebb, nem 64 hex karakter. Client Secret nincs.

---

## 2. Környezeti változók

Másold a `.env.example` fájlt `.env`-re, és töltsd ki:

```env
HOST_PORT=4173

TRAKT_CLIENT_ID=a Trakt Credentials alatti Client ID
TRAKT_REDIRECT_URI=http://<host>:<port>/api/trakt/callback
TRAKT_CALLBACK_ORIGIN=http://<host>:<port>
```

### Változók jelentése

| Változó | Kötelező | Leírás |
|---------|----------|--------|
| `TRAKT_CLIENT_ID` | Igen | Trakt app Client ID |
| `TRAKT_REDIRECT_URI` | Igen | OAuth redirect – **pontosan** egyezzen a Trakt app Redirect uri mezőjével és a böngésző címével. |
| `TRAKT_CALLBACK_ORIGIN` | Igen | A böngészőben megnyitott Bridge URL (scheme + host + port) |
| `HOST_PORT` | Nem | Host oldali port (alap: 4173) |

### HTTPS + nginx

Ha reverse proxy mögött fut:

```env
TRAKT_REDIRECT_URI=https://trakt-nuvio.example.com/api/trakt/callback
TRAKT_CALLBACK_ORIGIN=https://trakt-nuvio.example.com
```

Az nginx proxy_pass a konténerre mutasson (pl. `http://127.0.0.1:4173`).

A Trakt app Redirect uri mezőjét is frissítsd **https**-re.

---

## 3. Ellenőrzés

1. Indítsd a konténert: `docker compose pull && docker compose up -d`
2. Nyisd meg a Bridge URL-t böngészőben.
3. **Connect Trakt** – popup → engedélyezés → főoldal: **Trakt connected**
4. Logban ne legyen: `crypto is not defined`, `plan is not defined`

---

## 4. Gyakori Trakt OAuth hibák

| Hiba / tünet | Ok | Megoldás |
|--------------|-----|----------|
| Popup OK, főoldal disconnected | Redirect / origin eltérés | `TRAKT_CALLBACK_ORIGIN` = böngésző URL |
| `invalid redirect_uri` | Trakt app ≠ env | Pontos egyezés, http vs https |
| `invalid redirect uri` | A küldött cím nincs a Trakt alkalmazáson | A Redirect uri mező és a `TRAKT_REDIRECT_URI` legyen ugyanaz a böngészőcím + `/api/trakt/callback` |
| `Trakt sign-in is not configured` | Hiányzó Client ID | `.env` + konténer újraindítás |

---

## 5. Token élettartam

- Trakt access token lejár; a Bridge **refresh tokennel** automatikusan megújítja.
- Refresh token kb. **90 nap** (Trakt beállítás függvényében).
- A mentett session a böngésző `localStorage`-ában van – **Disconnect** törli.

---

## 6. Biztonság

- A `.env` fájl **ne kerüljön gitbe** (`.gitignore` kizárja).
- Self-hosted NAS esetén a Bridge URL-t ne tedd nyilvánosan elérhetővé feleslegesen.
- Aki hozzáfér a böngésző localStorage-hoz, eléri a mentett tokeneket is.
