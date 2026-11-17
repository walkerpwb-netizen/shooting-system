# Monitoring publicznej dostępności

Workflow `Public availability record` uruchamia sondę na runnerze GitHub, poza
serwerem produkcyjnym. Harmonogram: minuty 7, 17, 27, 37, 47 i 57 każdej godziny
(UTC); ręczne uruchomienie: Actions → Public availability record → Run workflow.
Sonda używa publicznego DNS, HTTPS z weryfikacją certyfikatu i zwykłego GET bez
przekierowań, proxy, wyjątków IP ani `--resolve`.

Sprawdza `/`, `/robots.txt`, `/sitemap.xml`, `/competitions`, `/trainings`,
`/shooting-ranges/map`, `/kontakt` i pierwszy istniejący URL szczegółów wydarzenia
z sitemap (jeśli jest dostępny). Nie utrwala ID usuwalnych wydarzeń w konfiguracji.
Waliduje HTTP 200, HTML, podstawową strukturę robots i niepusty XML sitemap.
Nie zmienia polityki robots, dat sitemap ani zachowania stron (osobne tematy).

## Maintenance i awarie

Przed sondami i po nich odczytuje `/maintenance/status`. Tylko zgodne statusy
`enabled=1, restricted=1` oraz odpowiedź 503 z `X-Maintenance-Mode: 1`, poprawnym
`Retry-After` i `Cache-Control: no-store` oznaczają `maintenance`. Inne błędy,
także DNS/TLS/timeout/502 w trakcie prac, to `outage`. Zmiana statusu w trakcie
pomiaru oznacza `transition`; brak publicznego statusu jest błędem obserwacji.
Sonda nigdy nie wywołuje polecenia `maintenance` ani nie modyfikuje produkcji.

## Historia i czas problemu

Każde uruchomienie publikuje podsumowanie i artefakt `availability-main`:

- `record.json`: czas rozpoczęcia i zakończenia każdego GET (UTC), HTTP,
  czas odpowiedzi, IP docelowe, błąd curl, wybrane nagłówki i klasyfikacja;
- `state.json`: bieżąca faza, pierwsza/ostatnia obserwacja, poprzednia obserwacja,
  ostatnie 100 zamkniętych faz i 100 przerw obserwacji dłuższych niż 30 minut;
- `summary.md`: tabela wyniku pomiaru.

Artefakty są przechowywane przez 90 dni; workflow przenosi stan z najnowszego
artefaktu tej samej gałęzi. Wyniki z `env-config` służą odbiorowi po pushu;
ciągłą historię prowadzi `main`. Brak wcześniejszego artefaktu rozpoczyna nową
historię. Błąd pobrania istniejącego stanu zatrzymuje pomiar, zamiast cicho go zerować.
Pobieranie artefaktów wymaga konta z dostępem do Actions. Eksport:

```bash
gh run list --workflow availability.yml --branch main --limit 20
gh run download RUN_ID --name availability-main --dir ./availability-RUN_ID
```

Pierwsza błędna próbka i ostatnia dobra ograniczają czas początku problemu;
ostatnia błędna i następna dobra ograniczają czas końca. `observed_span_seconds`
to rozpiętość zaobserwowanych próbek, nie dokładny czas niedostępności.
Nie liczyć przerw pomiarów jako uptime ani downtime. Przebieg statusów poszczególnych
URL-i znajduje się w kolejnych `record.json`; faza zbiorcza ma pierwszeństwo:
outage → transition → maintenance → healthy.

## Obsługa i alerty

Decyzja użytkownika z 17.11.2026: **alerty nieaktywne, tylko zapis wyników**.
HTTP/transport/content failures są zapisane w wynikach i nie powodują błędu joba,
aby nie aktywować powiadomień GitHub o awarii strony. Błędy samego workflow
(np. brak runnera lub problem z artefaktem) mogą podlegać istniejącym ustawieniom
powiadomień GitHub użytkownika; skrypt nie konfiguruje ani nie wysyła wiadomości.

Operator przegląda Actions i pobiera artefakty. Dla `outage` porównuje URL-e,
nagłówki oraz `/maintenance/status`, następnie sprawdza `maintenance status`,
`deploy/scripts/diagnose.sh`, nginx i logi usług. Dla `maintenance` kontroluje
długość okna; tylko użytkownik decyduje o `maintenance off`. Po naprawie uruchamia
ponowny pomiar i sprawdza powrót wszystkich URL-i. Przed aktywacją alertów trzeba
uzgodnić odbiorcę, kanał, próg (np. dwa kolejne błędy), powiadomienie o powrocie
i wykonać zatwierdzony test dostarczenia. Nie skonfigurowano webhooka ani sekretu.

## Utrzymanie i ograniczenia

GitHub uruchamia harmonogram wyłącznie z domyślnej gałęzi `main`; pliki sondy,
testu, dokumentacji i workflow są tam publikowane osobnym commitem, bez scalania
aplikacji z `env-config`. Przy kolejnej zmianie monitoringu aktualizować obie gałęzie.
Na `env-config` testy sondy wykonuje także job maintenance w CI produkcyjnym.

Harmonogram GitHub może się opóźnić lub pominąć uruchomienie; w publicznym repo
po 60 dniach braku aktywności może zostać automatycznie wyłączony. Operator
sprawdza świeżość ostatniej próbki i stan workflow; stale monitorowana gwarantowana
częstotliwość wymaga niezależnej usługi. Jeden punkt pomiarowy nie wykrywa wszystkich
awarii regionalnych. Bez działającego GitHub nie powstają nowe próbki; ten mechanizm
nie jest usługą z SLA. Zasady: https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule

Testy bez zmiany produkcji:

```bash
python3 -m unittest discover -s deploy/tests -p test_availability.py -v
python3 deploy/scripts/check-availability.py --output /tmp/availability-sample
```
