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
- Interfejs apki i komentarze w kodzie po angielsku (`<html lang="en">`). Dokumentacja projektu po polsku.
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
3. **Narastanie chóru.** Zaczyna się od jednej postaci. Co 6 s dołącza kolejna, aż do 12. Kolejność dołączania jest losowa przy każdej sesji (przetasowane 12 plików), ale pierwsza postać powinna być dorosła, nie dziecko.
4. **Pełny chór.** Po dołączeniu dwunastej postaci wszyscy śmieją się razem jeszcze przez 18 s.
5. **Wyciszenie.** Dźwięk łagodnie wycisza się, postacie uspokajają się i zatrzymują.
6. **Ekran końcowy.** Przycisk „Play again”. Kolejna sesja używa już zdekodowanych buforów i obwiedni (bez ponownego ładowania), z nowym tasowaniem kolejności, nowymi offsetami startu i nowym losowaniem wyglądu postaci.

Przez całą sesję (kroki 3–5) widoczny jest dyskretny przycisk „Stop”. Kliknięcie od razu przechodzi do wyciszenia (krok 5), a potem do ekranu końcowego.

Wszystkie czasy jako stałe na górze pliku, do łatwego strojenia. Wartości startowe:

- odstęp między dołączaniem kolejnych postaci: 6 s,
- czas pełnego chóru po dołączeniu ostatniej: 18 s,
- czas wyciszenia: 6 s.

Przy tych wartościach sesja trwa ok. 90 s (11 × 6 s + 18 s + 6 s).

**Harmonogram na zegarze audio.** Dołączanie postaci, pełny chór i wyciszenie są planowane względem `audioContext.currentTime` (`source.start(when)`, automatyka `GainNode`), a nie przez `setTimeout`/`setInterval`. Na karcie w tle przeglądarka dławi timery i wstrzymuje `requestAnimationFrame`, a dźwięk gra dalej, więc tylko zegar audio daje spójny przebieg. Stan wizualny (które postacie są widoczne) jest w każdej klatce wyliczany z bieżącego czasu audio, a nie z licznika zdarzeń, żeby po powrocie na kartę obraz od razu zgadzał się z dźwiękiem.

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

- Po kliknięciu startu śmieje się jedna postać, potem co ok. 6 s dołącza kolejna, aż do 12. Cała sesja trwa ok. 90 s.
- Każda postać ma inny plik audio, a jej usta ruszają się tylko wtedy, gdy w jej nagraniu słychać śmiech, i podążają za rytmem „ha-ha”, także na słuchawkach Bluetooth.
- Przy 12 postaciach dźwięk nie przesterowuje.
- W miejscu zapętlenia nagrania nie słychać przerwy ani trzasku.
- Po przełączeniu na inną kartę i powrocie przebieg sesji zgadza się z dźwiękiem.
- Przycisk „Stop” w trakcie sesji przechodzi do łagodnego wyciszenia.
- Działa w desktopowych przeglądarkach (Chrome, Firefox, Safari, Edge) oraz na telefonach (Chrome na Androidzie, Safari na iOS). Na iOS 16.4+ dźwięk gra także w trybie cichym.
- Sesja kończy się łagodnym wyciszeniem i można ją powtórzyć bez ponownego ładowania plików.

## Poza zakresem (na później)

- Instalowalna PWA z trybem offline.
- Suwak nastroju przed i po sesji.
- Wykrywanie uśmiechu użytkownika przez przednią kamerę.
- Większa biblioteka nagrań i ich losowanie.
