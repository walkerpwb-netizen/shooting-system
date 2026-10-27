# Tryb serwisowy

Tryb obejmuje stronę, aplikację PWA uruchamianą z ekranu głównego oraz API.
Ekran jest statyczny i działa także przy wyłączonym frontendzie lub backendzie.
Zwykłe żądania od niedopuszczonych adresów zwracają HTTP 503 i `Cache-Control: no-store`.
API zwraca JSON z `maintenance: true`. W otwartej aplikacji stan jest sprawdzany co
15 sekund oraz po powrocie do okna. Ekran serwisowy sprawdza powrót dostępności co
10 sekund. Istniejące żądania, które już dotarły do aplikacji przed włączeniem
blokady, mogą się zakończyć; nie jest to narzędzie do przerywania transakcji w toku.

## Polecenia na serwerze

Polecenie `maintenance` instaluje skrypt wdrożenia. Można je uruchomić z dowolnego
katalogu jako `ubuntu`; w razie potrzeby samo używa `sudo`.

```bash
# Włącz prace, dopuszczając publiczny adres internetu, z którego testujesz.
maintenance on --allow 203.0.113.10

# Włącz prace, dopuszczając adres klienta bieżącej sesji SSH.
maintenance on --ssh

# Kilka adresów (IPv4 lub IPv6); każde "on" zastępuje dotychczasową listę.
maintenance on --allow 203.0.113.10 --allow 2001:db8::10

# Sprawdź stan i listę wyjątków.
maintenance status

# Zmień wyjątki bez wyłączania prac.
maintenance allow-add 203.0.113.20
maintenance allow-remove 203.0.113.10

# Zakończ prace i przywróć publiczny dostęp.
maintenance off
```

Adresy powyżej są przykładami: zastąp je swoimi rzeczywistymi publicznymi adresami.
`on` wymaga przynajmniej jednego IP; nie można usunąć ostatniego wyjątku w trakcie
prac. Zmiana sieci (np. Wi-Fi na internet komórkowy) może zmienić IP. Jeśli przeglądarka
łączy się po IPv6, trzeba dopuścić ten adres lub obydwa adresy. Wyjątek dotyczy wszystkich
osób korzystających z tego samego publicznego IP. Zwykłe logowanie i uprawnienia w
aplikacji nadal obowiązują także dla dopuszczonych adresów.

`--ssh` odczytuje `SSH_CONNECTION` **przed** uruchomieniem sudo. Korzystaj z
`maintenance on --ssh`, bez poprzedzania go `sudo`. Adres klienta SSH musi odpowiadać
adresowi, z którego przeglądarka dochodzi do strony; przy VPN, tunelu lub pośrednim
hoście może być inny. Brak tej zmiennej kończy polecenie błędem bez zmiany stanu.

## Polecenia w rozmowie z Codex

- „Włącz prace serwisowe, dostęp z IP …”.
- „Sprawdź stan prac serwisowych”.
- „Dodaj IP … do dostępu serwisowego”.
- „Wyłącz prace serwisowe”.

Codex powinien użyć zainstalowanego polecenia `maintenance`. Nie wolno zakładać,
że IP serwera lub adres połączenia agenta jest adresem przeglądarki użytkownika.
Jeśli użytkownik nie podał adresu i nie ma wiarygodnego adresu jego sesji SSH,
należy poprosić o publiczny adres, zanim zostanie włączona blokada.

## Stan i wdrożenie

- Stan znajduje się poza repozytorium: `/var/lib/shooting-system/maintenance/state.conf`.
  Plik zawiera zarówno metadane stanu, jak i wygenerowane zmienne nginx.
- Włączenie, wyłączenie i modyfikacja IP używają blokady, atomowej podmiany pliku,
  `nginx -t` i łagodnego przeładowania. Błąd powoduje próbę przywrócenia poprzedniej
  konfiguracji; niepowodzenie przywracania jest zgłaszane jako błąd wymagający kontroli nginx.
- Wdrożenia, restart nginx i restart serwera zachowują stan. Wdrożenie instaluje
  aktualne polecenie oraz pliki ekranu; inicjalizacja nie nadpisuje istniejącego stanu.
- Tryb jest początkowo **wyłączony**. Wyłącza się go wyłącznie poleceniem `off`.
- Lokalne kontrole wdrożenia przechodzą przez TLS i nginx z `--resolve
  system-strzelecki.pl:443:127.0.0.1`. Tylko dokładne adresy `127.0.0.1` i `::1` mają
  stały dostęp lokalny; nagłówki `X-Forwarded-For` nie służą do omijania blokady.
- Backend i frontend nadal nasłuchują tylko na loopback. Jeżeli w przyszłości przed
  nginx pojawi się CDN lub dodatkowy reverse proxy, należy skonfigurować zaufane
  źródła rzeczywistego IP przed poleganiem na wyjątkach adresowych.

## Wyjątki publiczne

Publicznie dostępne są tylko odczyt statusu `/maintenance/status`, skrypt powrotu
`/maintenance/recovery.js` oraz istniejące endpointy **POST**:

- `/api/premium/autopay/itn`
- `/api/premium/autopay/sandbox/itn`
- `/api/premium/autopay/production/itn`

Backend nadal weryfikuje podpisy Autopay i treść potwierdzeń. Nie ma wyjątku dla
rozpoczynania płatności, kont użytkowników ani panelu administracyjnego.
Status publiczny nie zawiera listy dozwolonych IP. Potwierdzenia wymagają działającego
backendu; statyczny ekran serwisowy go nie wymaga.

Nie powstaje dodatkowe środowisko ani baza danych. Testy wykonywane przez
dopuszczony adres w normalnej aplikacji dotyczą produkcyjnych danych.

## Weryfikacja reguł bez blokowania produkcji

```bash
python3 -m unittest discover -s deploy/tests -v
node --test deploy/tests/recovery.test.cjs
```

Testy uruchamiają osobną krótkotrwałą instancję nginx na losowym porcie lokalnym
z atrapą upstreamów. Nie zmieniają konfiguracji ani stanu działającej aplikacji.
GitHub Actions wymaga ich powodzenia przed wdrożeniem.
