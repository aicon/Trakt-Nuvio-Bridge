# Nuvio Trakt Bridge

[🇭🇺 Magyar nyelvű leírás (README in Hungarian)](README_HU.md)

Standalone web tool that imports Trakt watched history, playback progress, and optional watchlist or collection data into Nuvio Sync.

[![Release](https://img.shields.io/badge/version-1.0.6-blue.svg)](https://github.com/aicon/Trakt-Nuvio-Bridge)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Docker Image](https://img.shields.io/badge/docker-ghcr.io%2Faicon%2Ftrakt--nuvio--bridge-blue?logo=docker)](https://github.com/aicon/Trakt-Nuvio-Bridge/pkgs/container/trakt-nuvio-bridge)
[![Documentation](https://img.shields.io/badge/docs-magyar-brightgreen.svg)](docs/README.md)
[![Support on Ko-fi](https://img.shields.io/badge/Ko--fi-Support-ff5e5b?logo=ko-fi)](https://ko-fi.com/aiconwg)

---

Nuvio Trakt Bridge runs the sync in the browser. The server handles Trakt sign-in and serves the page. Data moves from Trakt into Nuvio, and not back.

---

## Features

- **Watched movies and episodes:** Trakt's watched list is pushed to Nuvio `sync_push_watched_items`. One movie stays one item.
- **Continue watching:** Trakt playback progress can go to Nuvio `sync_push_watch_progress`. The switch is on the page.
- **Watchlist and collection:** Trakt watchlist and collection items can be added to the Nuvio library. Each list has its own switch.
- **Episode mapping:** When Trakt and a Nuvio metadata addon disagree on season or episode numbers, the bridge remaps the item through that addon.
- **Merge:** Watched history and progress are added to what is already there. Before replacing the Nuvio library, the bridge pulls the current list, merges it, and dedupes by `content_id`.
- **One-way import:** The full Trakt history log, with every rewatch as its own event, is not imported. Watched items are.

---

## Trakt sign-in

A new Trakt app does not issue a client secret. **Connect Trakt** uses a device code, so it works over plain HTTP and from another machine. No redirect address is required for this sign-in.

1. Create an app at <https://trakt.tv/oauth/applications>.
2. Copy the Client ID from Credentials, without quotes.
3. Put it in `TRAKT_CLIENT_ID`.
4. Open the bridge and press **Connect Trakt**.
5. Enter the code shown on the page at <https://trakt.tv/activate>. The code stays visible until it expires, and it can be copied.

A free Trakt account can connect only two applications to the API. If Trakt says the connection limit is reached, disconnect an unused app under connected applications, then try again.

`TRAKT_REDIRECT_URI` and `TRAKT_CALLBACK_ORIGIN` stay in the environment for the HTTPS callback path. On that path the address must be HTTPS, or a loopback address (`127.0.0.1`, `localhost`, `::1`), and it must match the Trakt app Redirect URI exactly. Point both variables at the same public origin.

---

## Privacy

- The sync runs in the browser, and the page calls Nuvio directly.
- The server keeps the device code and exchanges it for a token. The page shows only the short code you type.
- The Nuvio password is used only for the sign-in request and is never stored.
- The Trakt and Nuvio session stays in this browser's `localStorage` until you disconnect or the refresh token expires.
- Sync switches are saved in `localStorage` as well.
- There is no analytics, bridge database, log upload, or telemetry.

If you host the bridge publicly, serve it over HTTPS and do not add third-party scripts. Whoever can change the hosted JavaScript can change what the browser sends.

---

## Quick Start

The bridge is published as `ghcr.io/aicon/trakt-nuvio-bridge`.

### Docker Compose

The repository `docker-compose.yml`:

```yaml
services:
  trakt-nuvio-bridge:
    image: ghcr.io/aicon/trakt-nuvio-bridge:latest
    container_name: trakt-nuvio-bridge
    restart: unless-stopped
    ports:
      - "${HOST_PORT:-4173}:4173"
    environment:
      HOST: 0.0.0.0
      PORT: 4173
      TRAKT_CLIENT_ID: ${TRAKT_CLIENT_ID:?set TRAKT_CLIENT_ID in .env}
      TRAKT_REDIRECT_URI: ${TRAKT_REDIRECT_URI:?set TRAKT_REDIRECT_URI in .env}
      TRAKT_CALLBACK_ORIGIN: ${TRAKT_CALLBACK_ORIGIN:?set TRAKT_CALLBACK_ORIGIN in .env}
```

Clone the repository, copy the sample, and set the Client ID:

```bash
git clone https://github.com/aicon/Trakt-Nuvio-Bridge.git
cd Trakt-Nuvio-Bridge
cp .env.example .env
```

In `.env`, `TRAKT_CLIENT_ID` is the identifier under Trakt Credentials. There is no client secret.

```bash
docker compose pull
docker compose up -d
```

On the same machine, open `http://127.0.0.1:4173/`. From another machine, use the server address and the `HOST_PORT` port. `127.0.0.1` opens only on the machine that runs the container.

A new image needs the old container removed first, because the name is already taken:

```bash
docker compose pull
docker rm -f trakt-nuvio-bridge
docker compose up -d
```

Logs and stop:

```bash
docker compose logs -f trakt-nuvio-bridge
docker compose down
```

### Run without Docker

```powershell
$env:TRAKT_CLIENT_ID="your_trakt_client_id"
$env:TRAKT_REDIRECT_URI="http://127.0.0.1:4173/api/trakt/callback"
$env:TRAKT_CALLBACK_ORIGIN="http://127.0.0.1:4173"
node .\server.js
```

Open that address in a browser on the same machine.

---

## IDs

Nuvio examples look like `tmdb:550`. The bridge prefers an IMDb ID when Trakt provides one, then `tmdb:<id>`, then a numeric `trakt:<id>`. A TVDB ID or a Trakt slug is only used to match an optional remap. It is not pushed as the primary content ID.

```json
{
  "tvdb:12345": "tmdb:67890",
  "trakt:show:123": "tt0903747"
}
```

---

## Documentation

Hungarian setup, Trakt app, and change notes live in the repository:

- [docs/README.md](docs/README.md)
- [Trakt API setup](docs/trakt-api-beallitas.md)
- [Install and use](docs/telepites-es-hasznalat.md)

---

## Support

If this bridge is useful and you want to support its maintenance:

[![Buy Me a Coffee](https://img.shields.io/badge/Ko--fi-Buy%20me%20a%20coffee-ff5e5b?style=for-the-badge&logo=ko-fi)](https://ko-fi.com/aiconwg)

---

## License

This project is licensed under the [MIT License](LICENSE). The copyright notice in that file stays with the original author.

<small>Inspired by <a href="https://github.com/haaihond/Trakt-Nuvio-Bridge">haaihond/Trakt-Nuvio-Bridge</a>. That project gave the idea. Trakt sign-in there no longer works.</small>
