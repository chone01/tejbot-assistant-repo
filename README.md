# Tejbot Assistent

Aplikace do počítače k [TejBotu](https://tejbot.eu). Propojí TejBota s OBS a s hudbou, kterou streamer poslouchá.

- klipy z OBS (Replay Buffer) do složky, kterou si uživatel vybere
- ovládání OBS klávesovou zkratkou (mikrofon, scény, nahrávání)
- widget „Co poslouchám“ (Spotify, Apple Music, YouTube, SoundCloud)
- hlasové povely: připravují se

Aplikace je jen pomocník: potřebuje kanál s Premium a Premium se v ní koupit nedá (jen na webu).

## Jak vzniká instalátor

Po každém `git push` do větve `main` GitHub sám sestaví instalátor pro Windows a Linux
(záložka **Actions**) a vystaví ho v **Releases**. Stránka https://tejbot.eu/stahnout odkazuje vždy na nejnovější.

## Spuštění při vývoji

    npm install
    npm start
