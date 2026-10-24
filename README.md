# Moodboost

Prosta apka webowa poprawiająca nastrój, oparta na tym, że śmiech jest zaraźliwy.

Na ekranie pojawia się jedna śmiejąca się buzia, potem dołączają kolejne, aż śmieje się cały tłum. Każda postać rusza ustami, oczami i całym ciałem w rytm prawdziwego nagrania śmiechu. Wystarczy kliknąć Start i dać się zarazić.

Moodboost to „poprawiacz nastroju”, a nie narzędzie terapeutyczne.

## Jak to działa

- Pierwsze 12 postaci dołącza co 6 s. Każda ma własne nagranie śmiechu (mężczyźni, kobiety, dzieci).
- Potem tłum rośnie dalej, coraz szybciej, do 120 postaci (na telefonie mniej, tyle, ile się zmieści). Nowe postacie nie dokładają dźwięku, bo przy 12 głosach i tak brzmi to jak tłum, ale śmieją się w rytmie jednego z nagrań.
- Śmiech trwa, dopóki nie klikniesz **Stop**. Jeśli karta jest ukryta dłużej niż 3 minuty, dźwięk łagodnie się wycisza.
- Postacie są rysowane proceduralnie w SVG: losowe fryzury, kolory skóry i drobne cechy (broda, okulary, kolczyki, piegi). Przy każdej sesji tłum wygląda inaczej.
- Ruch postaci wynika z głośności nagrania, wyliczonej z góry po wczytaniu plików, więc usta łapią rytm każdego „ha-ha”.

## Uruchomienie lokalnie

Apka to statyczna strona bez kroku budowania, ale potrzebuje serwera HTTP (przeglądarka nie wczyta nagrań ani modułów JS z `file://`).

```sh
python -m http.server
```

Potem otwórz http://localhost:8000.

## Publikacja na GitHub Pages

1. Wypchnij repozytorium na GitHuba.
2. W **Settings → Pages** wybierz **Deploy from a branch**, gałąź `main` i folder `/ (root)`.
3. Po chwili apka będzie dostępna pod `https://<użytkownik>.github.io/<repozytorium>/`.

GitHub Pages serwuje stronę przez HTTPS, a tego wymaga m.in. blokada wygaszania ekranu (Screen Wake Lock).

## Wymagania

- Aktualne przeglądarki desktopowe: Chrome, Firefox, Safari, Edge.
- Telefony: Chrome na Androidzie, Safari na iOS 16.4 lub nowszym (na iPhonie dźwięk gra także w trybie cichym).
- Apka szanuje systemowe ustawienia: jasny i ciemny motyw oraz ograniczenie animacji (`prefers-reduced-motion`).

## Prywatność

Apka nie zbiera żadnych danych i nie łączy się z niczym poza własnymi plikami. Czcionka jest hostowana razem z apką, bez Google Fonts.

## Struktura projektu

```
index.html        strona i ekrany
style.css         wygląd, motywy, animacje
js/
  main.js         przebieg sesji, ekrany, wszystkie stałe do strojenia
  audio.js        ładowanie, pętle, odtwarzanie i miks dźwięku
  envelope.js     obwiednia głośności i „intensywność śmiechu”
  faces.js        proceduralne postacie SVG i ich mimika
  layout.js       siatka postaci
audio/            12 nagrań śmiechu (mp3, mono, wyrównana głośność)
fonts/            czcionka Fredoka (woff2) i jej licencja
dev/faces.html    podgląd postaci do strojenia wyglądu
docs/moodboost.md pełna specyfikacja
```

## Strojenie

- Czasy, limity tłumu, poziomy miksu i progi animacji są stałymi na górze `js/main.js`.
- `dev/faces.html` pokazuje losowe postacie z suwakiem intensywności i symulacją śmiechu. Parametr `?n=120` pokazuje więcej postaci, np. do sprawdzenia wydajności.
- Kolory tła są zmiennymi CSS (`--blob-1` … `--blob-4`) na górze `style.css`, osobno dla każdego motywu.

## Licencja

Kod i nagrania: [MIT](LICENSE), © 2026 Jakub W. Adamczyk.

Nagrania śmiechu zostały wygenerowane w [ElevenLabs](https://elevenlabs.io) na płatnym planie.

Czcionka [Fredoka](https://fonts.google.com/specimen/Fredoka) w `fonts/` jest objęta osobną licencją [SIL Open Font License 1.1](fonts/OFL.txt).
