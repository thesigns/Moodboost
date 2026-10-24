# Moodboost — specyfikacja

## Idea

Moodboost to prosta apka webowa poprawiająca nastrój, oparta na tym, że śmiech jest zaraźliwy. Na ekranie pojawia się jedna śmiejąca się buzia w SVG, potem dołączają kolejne, jedna po drugiej, aż śmieje się 12 postaci naraz. Każda postać ma własne nagranie śmiechu, a jej usta, oczy i ciało ruszają się w rytm tego nagrania.

Apka nie jest narzędziem terapeutycznym i nie powinna się tak przedstawiać. To „poprawiacz nastroju”.

## Technologia

- Vanilla HTML, CSS i JavaScript. Bez frameworków, bez bundlera, bez kroku budowania.
- Statyczna strona, możliwa do hostowania na GitHub Pages.
- Dźwięk wyłącznie przez Web Audio API (nie przez tagi `<audio>`).
- Grafika wyłącznie w SVG generowanym z JS.
- Czcionka tytułu i przycisków: Fredoka (Google Fonts, licencja SIL OFL), hostowana lokalnie jako woff2 w `fonts/` (podzbiór latin, grubości 400–700). Bez łączenia z serwerami Google. Litery tytułu i dużych przycisków bujają się falą, jakby tekst się śmiał (wyłączone przy `prefers-reduced-motion` i na nieaktywnym przycisku).
- Interfejs apki, komentarze w kodzie i `README.md` po angielsku (`<html lang="en">`). Po polsku jest tylko dokumentacja w `docs/`.
- Główny cel to laptop i komputer stacjonarny (ekran poziomy, przeglądarka desktopowa). Apka ma też w pełni działać na telefonach, w pionie i poziomie, ale nie jest projektowana mobile-first.
- Wspierane są aktualne wersje przeglądarek. Na iOS minimum to 16.4 (od tej wersji Safari ma `navigator.audioSession` i Screen Wake Lock API). Starszymi iPhone'ami się nie przejmujemy.

## Zasoby audio

12 plików mp3, każdy 30 sekund, wygenerowanych w ElevenLabs. Śmiech z przerwami. Pliki znajdują się w podfolderze `audio`.

Pliki dostarczam sam. Nazwy mają postać `laugh_<typ>_<numer>.mp3`, gdzie `<typ>` to `man`, `woman` lub `child`, a `<numer>` to 0–3 (po 4 pliki na typ). Typ postaci wynika z nazwy pliku.

Format plików: mono, 48 kHz, 96 kb/s CBR (ok. 350 KB na plik, ok. 4,2 MB razem). Pliki zostały przekonwertowane z oryginałów stereo 192 kb/s przez uśrednienie kanałów (L+R)/2; kanały oryginałów były praktycznie identyczne.

Głośność plików jest wyrównana do ok. -26 LUFS (rozrzut ok. 0,3 dB; w oryginałach od -21 do -37 LUFS). Wyrównanie to stałe wzmocnienie na plik, a w kilku plikach łagodny limiter z kompensacją opóźnienia przycina najgłośniejsze wybuchy (najwyżej ok. 3 dB). Szczyty są poniżej -1,7 dBTP, a czas i długość nagrań się nie zmieniły. Poziom -26 LUFS na pojedynczy głos jest celowo ostrożny i zostawia zapas na miks 12 głosów. Ogólną głośność apki ustawia master gain (stała do strojenia), a kompresor pilnuje szczytów. Zdekodowane 12 plików mono zajmuje ok. 69 MB pamięci. Gdyby w przyszłości trafiły tu pliki stereo, kod i tak miksuje każdy bufor do mono po zdekodowaniu (nowy jednokanałowy `AudioBuffer`). Pliki dekodujemy po kolei, nie wszystkie równolegle, żeby ograniczyć szczyt zużycia pamięci.

Na darmowym planie ElevenLabs wymaga atrybucji, ale pliki były wygenerowane na płatnym planie, więc atrybucji nie umieszczamy.

## Przebieg sesji

1. **Ekran startowy.** Nazwa „Moodboost”, jeden duży przycisk „Start” i krótka, nienachalna wskazówka, żeby ustawić wygodną głośność („Set a comfortable volume.”). Kliknięcie wywołuje `resume()` na `AudioContext` (wymagane przez Safari na iOS i polityki autoplay).
2. **Ładowanie.** `AudioContext` jest tworzony od razu przy otwarciu strony (w stanie wstrzymanym, `suspended`) i od razu zaczyna się pobieranie i dekodowanie (`decodeAudioData`) wszystkich 12 plików oraz liczenie obwiedni. Przycisk start jest nieaktywny, dopóki wszystko nie jest gotowe, a w tym czasie widać prosty wskaźnik ładowania.
3. **Narastanie chóru.** Zaczyna się od jednej postaci. Co 6 s dołącza kolejna, aż do 12, każda z własnym nagraniem. Kolejność dołączania jest losowa przy każdej sesji (przetasowane 12 plików), ale pierwsza postać powinna być dorosła, nie dziecko.
4. **Rosnący tłum.** Po dwunastej postaci dołączają kolejne, już bez nowych dźwięków (przy 12 głosach i tak nie da się rozróżnić, ile osób się śmieje). Odstęp skraca się stopniowo z 6 s do 2,5 s. Tłum rośnie do 120 postaci albo mniej, jeśli komórki siatki byłyby mniejsze niż 72 px. Na laptopie wychodzi 120, na telefonie ok. 50–55. Pierwsze 12 postaci jest zawsze widocznych, nawet na bardzo małym ekranie.
5. **Śmiech bez końca.** Sesja nie kończy się sama: wszyscy śmieją się, dopóki użytkownik nie kliknie „Stop”. Sam wie najlepiej, kiedy skończyć.
6. **Wyciszenie.** Po „Stop” nikt już nie dołącza, dźwięk łagodnie wycisza się przez 6 s, a postacie uspokajają się i zatrzymują.
7. **Ekran końcowy.** Przycisk „Play again”. Kolejna sesja używa już zdekodowanych buforów i obwiedni (bez ponownego ładowania), z nowym tasowaniem kolejności, nowymi offsetami startu i nowym losowaniem wyglądu postaci.

Przez całą sesję widoczny jest przycisk „Stop”. Jako jedyne wyjście z sesji jest łatwy do znalezienia (czytelny kontrast, cień), ale nie konkuruje z postaciami.

**Postacie bez głosu.** Każda postać ponad 12 dostaje obwiednię losowego z 12 nagrań, z losowym punktem startu, i typ postaci zgodny z tym nagraniem. Śmieje się więc w wiarygodnym rytmie, choć jej nie słychać. Te postacie są tworzone dopiero w chwili dołączenia.

**Ukryta karta.** Jeśli karta jest ukryta dłużej niż 3 minuty, śmiech łagodnie wycisza się i sesja kończy (ekran końcowy czeka po powrocie). Powrót wcześniej anuluje wyciszenie i sesja trwa dalej. Chroni to przed śmiechem grającym godzinami w zapomnianej karcie. Wyciszenie jest zaplanowane na zegarze audio (timery w ukrytych kartach są dławione), a samo zatrzymanie źródeł dźwięku robi zwykły timer, który może się spóźnić, ale dźwięk jest wtedy już wyciszony.

Wszystkie czasy i limity jako stałe na górze `js/main.js`, do łatwego strojenia. Wartości startowe:

- odstęp między dołączaniem postaci z głosem (pierwsze 12): 6 s,
- odstęp dla kolejnych postaci: od 6 s w dół do 2,5 s (`CROWD_INTERVAL_MIN`), przy czym większość skrócenia następuje w ciągu ok. 8 postaci (`CROWD_ACCELERATION`),
- maksymalna liczba postaci: 120, minimalny rozmiar komórki: 72 px,
- czas wyciszenia: 6 s,
- wyciszenie w ukrytej karcie po: 180 s.

Przy tych wartościach 12. postać dołącza po 66 s, 50. po ok. 3 min, a 120. po ok. 6 min.

**Wydajność dużego tłumu.** Najdroższe jest przerysowywanie SVG, nie JavaScript (aktualizacja 120 buzi to ok. 3 ms). Dlatego:

- atrybut SVG jest zapisywany tylko wtedy, gdy jego wartość się zmieniła, więc buzia, która uspokoiła się w przerwie śmiechu, nie jest przerysowywana,
- powyżej 40 postaci każda buzia jest aktualizowana co drugą klatkę, na zmianę z sąsiednimi (30 klatek/s na buzię wystarcza przy 4–5 „ha” na sekundę, a praca na klatkę spada o połowę).

Zmierzone w Chrome na laptopie: 120 postaci, ok. 57 klatek/s.

**Harmonogram na zegarze audio.** Dołączanie postaci i wyciszenie są planowane względem `audioContext.currentTime` (`source.start(when)`, automatyka `GainNode`), a nie przez `setTimeout`/`setInterval`. Na karcie w tle przeglądarka dławi timery i wstrzymuje `requestAnimationFrame`, a dźwięk gra dalej, więc tylko zegar audio daje spójny przebieg. Stan wizualny (które postacie są widoczne) jest w każdej klatce wyliczany z bieżącego czasu audio, a nie z licznika zdarzeń, żeby po powrocie na kartę obraz od razu zgadzał się z dźwiękiem.

## Odtwarzanie dźwięku

- Każda postać to osobny `AudioBufferSourceNode` z własnym `GainNode`.
- Każde nagranie gra w pętli (`loop = true`) i startuje od losowego miejsca w pliku, żeby nie zaczynało się zawsze tak samo.
- **Szew pętli:** mp3 ma na początku i końcu pliku ciszę dodaną przez enkoder, przez co w miejscu zapętlenia może być słyszalna przerwa lub trzask. Po zdekodowaniu wykryj tę ciszę na brzegach bufora i ustaw `loopStart`/`loopEnd` tak, żeby ją pominąć. Jeśli nagranie nie zaczyna się i nie kończy ciszą, zrób w buforze krótki (ok. 20–50 ms) crossfade końca z początkiem. Odczyt obwiedni (patrz niżej) musi zapętlać się w tym samym zakresie `loopStart`–`loopEnd`.
- Nowa postać nie wchodzi skokowo: jej głośność narasta od zera w ciągu ok. 1 s.
- **Ochrona przed przesterowaniem:** gdy gra `n` postaci, głośność każdej jest skalowana jak `n^(-k)`, płynnie przy każdej zmianie liczby głosów. Wykładnik `k` jest stałą do strojenia, startowo 0,5 (czyli `1 / sqrt(n)`). Niższa wartość (np. 0,35) daje wyraźniej słyszalne narastanie chóru, bo dotychczasowe głosy mniej cichną, a szczyty łapie kompresor. Wartość dobieramy na słuch. Na wyjściu master `DynamicsCompressorNode` jako zabezpieczenie.
- Łańcuch: źródła → gain postaci → master gain → kompresor → wyjście.
- **iOS i tryb cichy:** na iPhonie Web Audio domyślnie milknie, gdy przełącznik wyciszenia jest włączony. Ustaw `navigator.audioSession.type = "playback"` przed odblokowaniem kontekstu, żeby dźwięk grał mimo trybu cichego. Starszych wersji iOS bez tego API nie wspieramy, więc bez obejść i bez komunikatów.

## Analiza głośności (obwiednia)

Ruch postaci jest sterowany głośnością jej nagrania. Obwiednia jest liczona **z góry**, po zdekodowaniu, a nie analizatorem na żywo.

- Dla każdego bufora: weź kanał mono, podziel na okna ok. 20 ms, policz RMS w każdym oknie.
- Znormalizuj obwiednię każdego pliku osobno do zakresu 0–1 (np. względem 95. percentyla, żeby pojedyncze szczyty nie spłaszczyły reszty).
- W czasie odtwarzania odczytuj wartość dla bieżącej pozycji w nagraniu, uwzględniając losowy offset startu i zapętlenie w zakresie `loopStart`–`loopEnd`.
- **Opóźnienie wyjścia:** pozycję liczy się z `audioContext.currentTime` pomniejszonego o opóźnienie wyjścia (`outputLatency`, a gdy niedostępne, `baseLatency`), czyli dla dźwięku, który użytkownik faktycznie słyszy w tej chwili. Na słuchawkach Bluetooth opóźnienie sięga ok. 200 ms i bez tej korekty usta wyraźnie rozjadą się z „ha-ha”.

## Mapowanie dźwięku na ruch

Z surowej wartości obwiedni wylicz płynny sygnał „intensywności śmiechu” dla każdej postaci:

- **Bramka:** poniżej progu (startowo ok. 0,15) traktuj jako ciszę.
- **Histereza:** otwieranie przy wyższym progu niż zamykanie, żeby usta nie migotały na granicy.
- **Wygładzanie:** szybkie narastanie (attack ok. 30 ms), wolniejsze opadanie (release ok. 120 ms).
- Okno analizy i release mają być na tyle krótkie, żeby usta łapały rytm pojedynczych „ha-ha-ha” (ok. 4–5 impulsów na sekundę).

Ten sam sygnał steruje kilkoma elementami, każdy z własnym wygładzaniem, żeby ruch nie był sztywno identyczny:

- **usta:** płynny stopień otwarcia, nie przełącznik otwarte/zamknięte,
- **oczy:** przy intensywnym śmiechu mrużą się lub zamykają w łuki,
- **głowa / ciało:** drganie i lekkie odchylanie do tyłu przy wybuchach,
- **policzki:** lekkie unoszenie.

Gdy postać milknie w przerwie nagrania, ma wyglądać na uśmiechniętą i rozbawioną, a nie neutralną.

## Postacie SVG

- Styl prosty i ciepły, kształty bez nadmiaru szczegółów. Siła ma tkwić w ruchu, nie w detalach.
- Trzy typy: mężczyzna, kobieta, dziecko. Różnią się proporcjami (dziecko: większa głowa względem twarzy, większe oczy), fryzurą i drobnymi cechami.
- Każda z 12 postaci ma lekkie indywidualne różnice: kolor skóry, kolor i kształt włosów, kolor tła komórki. Losowane przy starcie sesji z ograniczonej, harmonijnej palety.
- Postacie generowane proceduralnie w JS, bez zewnętrznych plików graficznych.
- Wejście nowej postaci: krótka animacja pojawienia się (np. wyskoczenie ze skalowaniem).

Zrealizowane warianty:

- **Fryzury:** mężczyzna: krótka, z przedziałkiem, kręcona, łysina z bokami; kobieta: długie, bob, kok, kucyk, burza loków; dziecko: czub, kucyki, „grzybek”, loczki.
- **Drobne cechy (losowo):** broda z wąsami u części mężczyzn, okulary u części dorosłych, kolczyki u części kobiet, piegi u części dzieci. Siwe włosy tylko u mężczyzn.
- **Mimika:** usta z zębami i językiem przy otwarciu, oczy mrużące się w łuki (błysk w oku znika przy mocnym śmiechu), brwi unoszące się (wewnętrzne końce wyżej), unoszące się policzki, odchylanie i drżenie głowy, podskakujące ramiona.
- **Losowanie bez powtórzeń:** fryzury (osobno dla każdego typu), kolor skóry i kolor tła komórki są losowane z „worka”, który opróżnia się, zanim jakaś wartość się powtórzy. Dzięki temu w jednej sesji jest jak najwięcej różnorodności.
- **Podgląd:** `dev/faces.html` pokazuje 18 losowych postaci, z suwakiem intensywności i symulacją śmiechu. Służy do strojenia wyglądu, nie jest częścią apki.

## Układ ekranu

- Ekran dzieli się na siatkę komórek, po jednej na postać.
- Siatka przelicza się przy każdym dołączeniu: dla `n` postaci wybierz liczbę kolumn i wierszy tak, żeby komórki były jak największe przy aktualnych proporcjach ekranu (pion i poziom). Puste miejsca w ostatnim wierszu mają być wyśrodkowane.
- Zmiana układu jest animowana: istniejące postacie płynnie przesuwają się i zmniejszają na nowe miejsca.
- Reaguje na zmianę rozmiaru i orientacji ekranu.

## Pozostałe wymagania

- Podczas sesji ekran nie powinien się wygaszać (Screen Wake Lock API, jeśli dostępne). Blokadę trzeba ponowić po powrocie na kartę (`visibilitychange`), bo przeglądarka zwalnia ją przy ukryciu strony.
- Respektuj `prefers-reduced-motion`: ogranicz drganie i przesuwanie, zostaw ruch ust. Ruch głowy i ciała jest wtedy zmniejszony do 20%, a mimika (usta, oczy, brwi, policzki) zostaje pełna. Komórki przeskakują na nowe miejsca bez animacji, a nowe postacie pojawiają się przez wygaszenie zamiast wyskoczenia.
- Obsługa jasnego i ciemnego motywu systemowego. Tło w obu motywach jest wesołe, nigdy czarne: powoli płynący gradient z kolorowych plam (jasny: brzoskwinia, róż, żółty, mięta; ciemny: śliwka, malina, bursztyn, morski). Animacja tła tylko przez `transform` (bez przemalowywania), a przy `prefers-reduced-motion` tło stoi.
- Brak zbierania jakichkolwiek danych, brak sieci poza wczytaniem własnych plików.
- Kod czytelny, podzielony na logiczne moduły (audio, analiza, postacie, układ, przebieg sesji), z komentarzami.

## Struktura plików (propozycja)

```
index.html
style.css
js/
  main.js        // przebieg sesji, ekrany
  audio.js       // ładowanie, odtwarzanie, miks
  envelope.js    // liczenie i odczyt obwiedni
  faces.js       // generowanie i animacja postaci SVG
  layout.js      // siatka i animacja układu
audio/           // 12 plików mp3
fonts/           // fredoka-latin.woff2 + OFL.txt
dev/faces.html   // podgląd postaci do strojenia
```

## Kryteria akceptacji

- Po kliknięciu startu śmieje się jedna postać, potem co ok. 6 s dołącza kolejna, aż do 12. Potem dołączają kolejne, bez nowych dźwięków i coraz szybciej, aż do 120 postaci albo do zapełnienia ekranu (komórki nie mniejsze niż 72 px).
- Sesja trwa, dopóki użytkownik nie kliknie „Stop”, chyba że karta jest ukryta dłużej niż 3 minuty.
- Przy pełnym tłumie animacja jest płynna (na laptopie ok. 60 klatek/s).
- Podczas sesji ekran nie gaśnie (Wake Lock), także po powrocie z innej karty.
- Każda postać ma inny plik audio, a jej usta ruszają się tylko wtedy, gdy w jej nagraniu słychać śmiech, i podążają za rytmem „ha-ha”, także na słuchawkach Bluetooth.
- Przy 12 postaciach dźwięk nie przesterowuje.
- W miejscu zapętlenia nagrania nie słychać przerwy ani trzasku.
- Po przełączeniu na inną kartę i powrocie przebieg sesji zgadza się z dźwiękiem.
- Przycisk „Stop” w trakcie sesji przechodzi do łagodnego wyciszenia.
- Działa w desktopowych przeglądarkach (Chrome, Firefox, Safari, Edge) oraz na telefonach (Chrome na Androidzie, Safari na iOS). Na iOS 16.4+ dźwięk gra także w trybie cichym.
- Po „Stop” sesja kończy się łagodnym wyciszeniem i można ją powtórzyć bez ponownego ładowania plików.

## Poza zakresem (na później)

- Instalowalna PWA z trybem offline.
- Suwak nastroju przed i po sesji.
- Wykrywanie uśmiechu użytkownika przez przednią kamerę.
- Większa biblioteka nagrań i ich losowanie.
