# Nuvio Trakt Bridge

[🇺🇸 English description (README in English)](README.md)

Önálló webes eszköz, amely a Trakt megnézett előzményeit, a lejátszási folyamatot, valamint a figyelőlistát és a gyűjteményt viszi át a Nuvio Syncbe.

[![Verzió](https://img.shields.io/badge/verzió-1.0.6-blue.svg)](https://github.com/aicon/Trakt-Nuvio-Bridge)
[![Licenc: MIT](https://img.shields.io/badge/Licenc-MIT-green.svg)](LICENSE)
[![Docker Image](https://img.shields.io/badge/docker-ghcr.io%2Faicon%2Ftrakt--nuvio--bridge-blue?logo=docker)](https://github.com/aicon/Trakt-Nuvio-Bridge/pkgs/container/trakt-nuvio-bridge)
[![Dokumentáció](https://img.shields.io/badge/docs-magyar-brightgreen.svg)](docs/README.md)
[![Támogatás Ko-fi-n](https://img.shields.io/badge/Ko--fi-Támogatás-ff5e5b?logo=ko-fi)](https://ko-fi.com/aiconwg)

---

A Nuvio Trakt Bridge a böngészőben futtatja a szinkront. A szerver a Trakt belépést intézi, és a lapot kiszolgálja. Az adat a Traktból a Nuvio felé megy, visszafelé nem.

---

## Főbb funkciók

- **Megnézett filmek és epizódok:** A Trakt watched listája a Nuvio `sync_push_watched_items` végpontjára kerül. Egy film egy tétel marad.
- **Lejátszás folytatása:** A Trakt playback progress a Nuvio `sync_push_watch_progress` végpontjára mehet. A kapcsoló a lapon állítható.
- **Figyelőlista és gyűjtemény:** A Trakt watchlist és collection tételei a Nuvio könyvtárba tehetők. Ez a két lista külön kapcsolható.
- **Epizódok igazítása:** Ha a Trakt és a Nuvio metaadat-bővítményének évad- vagy epizódszáma eltér, a híd a bővítmény katalógusához igazítja a tételt.
- **Összefésülés:** A megnézett lista és a folyamat hozzáíródik a meglévőhöz. A Nuvio könyvtár cseréje előtt a híd lehúzza a jelenlegi listát, összefésüli, és `content_id` szerint szűri az ismétlődést.
- **Egyirányú import:** A teljes Trakt-napló, benne minden újranézés külön eseménye, nem kerül át. Watched tételek mennek.

---

## Trakt belépés

Az új Trakt-alkalmazás nem ad Client Secretet. A **Connect Trakt** eszközkóddal lép be, ezért sima HTTP-n, másik gépről is működik. Átirányítási cím ehhez nem kell.

1. Hozz létre alkalmazást a <https://trakt.tv/oauth/applications> oldalon.
2. Másold ki a Client ID-t a Credentials alól, idézőjel nélkül.
3. Tedd a `TRAKT_CLIENT_ID` változóba.
4. Nyisd meg a hidat, és nyomd meg a **Connect Trakt** gombot.
5. A <https://trakt.tv/activate> oldalon írd be a lapon látható kódot. A kód a lejártáig kint marad, és másolható.

Az ingyenes Trakt-fiók csak két alkalmazást enged az API-ra kötni. Ha a Trakt azt írja, hogy elérted a csatlakozási limitet, egy nem használt alkalmazást le kell választani a csatlakoztatott alkalmazások közül, és utána újra lehet próbálni.

A `TRAKT_REDIRECT_URI` és a `TRAKT_CALLBACK_ORIGIN` a HTTPS-es visszahíváshoz maradt a környezetben. Ezen az úton a cím legyen HTTPS, vagy loopback (`127.0.0.1`, `localhost`, `::1`), és betűre egyezzen a Trakt alkalmazás Redirect uri mezőjével. A két változó ugyanarra a nyilvános címre mutasson.

---

## Adatvédelem

- A szinkron a böngészőben fut, és a lap közvetlenül a Nuvióhoz beszél.
- A szerver őrzi az eszközkódot, és az cseréli tokenre. A lapon csak a rövid, beírandó kód látszik.
- A Nuvio jelszava csak a belépési kéréshez kell, és nem kerül mentésre.
- A Trakt és a Nuvio munkamenet ebben a böngészőben, a `localStorage`-ban marad, amíg le nem választod, vagy a refresh token le nem jár.
- A szinkron kapcsolói is a `localStorage`-ba kerülnek.
- Nincs analitika, saját adatbázis, naplófeltöltés vagy telemetria.

Ha a hidat nyilvánosan éred el, HTTPS-en szolgáld ki, és ne tegyél bele idegen szkriptet. Aki a kiszolgált JavaScriptet cserélheti, az változtathat azon, mit küld a böngésző.

---

## Gyors indítás

A híd kész Docker-képként fut: `ghcr.io/aicon/trakt-nuvio-bridge`.

### Docker Compose

A tároló `docker-compose.yml` fájlja:

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

Töltsd le, másold a mintát, és írd be a Client ID-t:

```bash
git clone https://github.com/aicon/Trakt-Nuvio-Bridge.git
cd Trakt-Nuvio-Bridge
cp .env.example .env
```

A `.env` fájlban a `TRAKT_CLIENT_ID` a Trakt Credentials alatti azonosító. Client Secret nincs.

```bash
docker compose pull
docker compose up -d
```

A böngésző ugyanazon a gépen a `http://127.0.0.1:4173/` címet nyitja. Másik gépről a kiszolgáló címe és a `HOST_PORT` portja kell. A `127.0.0.1` csak arról a gépről nyílik meg, ahol a konténer fut.

Új képnél a régi konténert előbb el kell távolítani, mert a neve foglalt:

```bash
docker compose pull
docker rm -f trakt-nuvio-bridge
docker compose up -d
```

Napló és leállítás:

```bash
docker compose logs -f trakt-nuvio-bridge
docker compose down
```

### Helyben, Docker nélkül

```powershell
$env:TRAKT_CLIENT_ID="your_trakt_client_id"
$env:TRAKT_REDIRECT_URI="http://127.0.0.1:4173/api/trakt/callback"
$env:TRAKT_CALLBACK_ORIGIN="http://127.0.0.1:4173"
node .\server.js
```

Ezt a címet ugyanazon a gépen nyisd meg.

---

## Azonosítók

A Nuvio példái `tmdb:550` alakúak. A híd először az IMDb-azonosítót használja, ha a Trakt ad ilyet, utána a `tmdb:<id>` értéket, majd a numerikus `trakt:<id>` értéket. A TVDB-azonosító és a Trakt slug csak az egyedi átirányítások egyeztetésére való, elsődleges tartalomazonosítóként nem megy ki.

```json
{
  "tvdb:12345": "tmdb:67890",
  "trakt:show:123": "tt0903747"
}
```

---

## Dokumentáció

A telepítés, a Trakt-alkalmazás és a változások magyar leírása a tárolóban van:

- [docs/README.md](docs/README.md)
- [Trakt API beállítás](docs/trakt-api-beallitas.md)
- [Telepítés és használat](docs/telepites-es-hasznalat.md)

---

## Támogatás

Ha a híd hasznos, és szeretnéd támogatni a karbantartását:

[![Ko-fi támogatás](https://img.shields.io/badge/Ko--fi-Támogatás-ff5e5b?style=for-the-badge&logo=ko-fi)](https://ko-fi.com/aiconwg)

---

## Licenc

A projekt az [MIT](LICENSE) licenc alatt áll. A fájlban lévő szerzői jogi jelzés az eredeti szerzőé.

<small>Az ötletet a <a href="https://github.com/haaihond/Trakt-Nuvio-Bridge">haaihond/Trakt-Nuvio-Bridge</a> adta. Az ottani Trakt-belépés már nem működik.</small>
