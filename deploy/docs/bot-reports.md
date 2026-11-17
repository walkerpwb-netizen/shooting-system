# Logi hostów i raporty robotów

Temat 03, 17.11.2026. Dotychczasowy `/var/log/nginx/access.log` (combined)
pozostaje zgodny z wcześniejszymi narzędziami. Backend czyta `error.log`,
a fail2ban ma obecnie tylko jail `sshd`; nie znaleziono innych aktywnych odbiorców
logu dostępu. Nowy `/var/log/nginx/shooting-bots.log` zawiera JSON dla wszystkich
sześciu vhostów projektu: HTTP/HTTPS, domena główna, www i przekierowania z IP.
Domyślny vhost HTTP dystrybucji pozostaje poza zakresem projektu.

JSON ma wersję schematu, czas ze strefą, host, nagłówek Host, nazwę vhosta,
schemat, adres połączenia, metodę, oryginalną ścieżkę bez query, status, rozmiar,
czas obsługi, status upstream, UA i stan maintenance. Oryginalna ścieżka i
klasyfikacja blokady pozostają poprawne po wewnętrznym przekierowaniu maintenance.
Nie zapisuje cookies, Authorization, treści ani referera. Istniejący combined
może nadal zawierać query i referer: to prywatny log operacyjny, nie materiał do publikacji.
Weryfikacja używa `$remote_addr`, nigdy podanego przez klienta X-Forwarded-For.
Przed wprowadzeniem CDN/proxy trzeba osobno skonfigurować zaufane real IP.

## Tworzenie i odczyt

`shooting-bot-report.timer` codziennie około 03:25 UTC uruchamia raport za
poprzedni dzień UTC; `Persistent=true` nadrabia opuszczone uruchomienie timera.
Nie nadrabia automatycznie wszystkich opuszczonych dni — można je wskazać ręcznie.
Proces pracuje jako ubuntu z grupą adm, z ograniczonym zapisem do katalogu raportów.

```bash
systemctl status shooting-bot-report.timer
journalctl -u shooting-bot-report.service --since yesterday
python3 deploy/scripts/report-bots.py --date 2026-11-17
python3 deploy/scripts/report-bots.py --log '/var/log/nginx/shooting-bots.log*' --date 2026-11-17
```

Pliki `bots-RRRR-MM-DD.json` trafiają do
`/var/lib/shooting-system/bot-reports` (katalog 0750, pliki 0600). Zapis jest atomowy;
ponowienie zastępuje raport danej daty i ponownie sprawdza bieżące listy IP.
Data bieżąca daje jawnie niepełny dzień. Logi zwykłe i `.gz` są czytane strumieniowo.
Brak plików wejściowych kończy polecenie błędem. Pusty okres daje jawne zero
obserwacji, a nie dowód braku crawlowania; raport zawiera zakres wejścia i liczbę
błędnych wierszy. Raportowanie obejmuje wyłącznie nowy strumień JSON; dawnemu
combined nie można wiarygodnie dopisać hostów ani rozpoznać wszystkich starych prób UA.

Wiersze są pogrupowane według hosta, HTTP/HTTPS, robota i roli, wyniku weryfikacji,
powodu, flagi testu, godziny UTC, szablonu ścieżki, statusu HTTP i blokady maintenance.
Nie sumować nakładających się okresów. `count` oznacza żądania, nie sesje ani ludzi.
`unclassified` nie oznacza człowieka; wybrany zestaw nie obejmuje wszystkich robotów.
Ścieżki publiczne mają zamkniętą listę; ID są zastąpione `:id`, API/zasoby i pozostałe
ścieżki grupowane bez danych klienta. Hosty spoza domen projektu są `:other`.
Raport nie zawiera surowych IP, UA, query ani dowolnych ścieżek.

## Tożsamość i interpretacja

- `verified`: zgodny token UA i IP w aktualnej oficjalnej liście właściwego robota
  (dla Google lista wspólnych crawlerów; dla Anthropic wspólna lista dostawcy).
- `declared`: rozpoznany UA bez zgodności IP albo jawny test. Brak zgodności z bieżącą
  listą nie dowodzi podszywania się w historycznym momencie żądania.
- `unresolved`: lista niedostępna/niepoprawna lub sprzeczne tokeny kilku robotów.
- `not_assessed`: żądanie spoza wybranego zestawu.

Listy są pobierane przy każdym uruchomieniu po HTTPS, równolegle, z limitem czasu
15 sekund i kontrolą CIDR. Raport zawiera URL, czas sprawdzenia, status, datę
publikacji, liczbę zakresów i SHA-256 odpowiedzi. Nie używa starego cache ani ogólnej
listy chmury zamiast listy robota. Weryfikuje zgodność z listą w czasie raportowania;
nie jest kryptograficznym uwierzytelnieniem ani dowodem dawnego właściciela IP.
Rola pochodzi z UA; wspólne zakresy dostawcy nie uwierzytelniają konkretnej roli.
Oficjalny serwer może zwrócić np. HTTP 403: wynik pozostaje nierozstrzygnięty,
bez omijania blokady i bez zastępowania listy wpisem z bloga.

Wybrany zakres:

| Rola | Roboty |
|---|---|
| wyszukiwanie | Googlebot, bingbot, OAI-SearchBot, Claude-SearchBot |
| pobranie na polecenie użytkownika | ChatGPT-User, Claude-User |
| potencjalny trening | GPTBot, ClaudeBot |

Oficjalne zasady i źródła sprawdzone 17.11.2026:

- [Google: weryfikacja](https://developers.google.com/crawling/docs/crawlers-fetchers/verify-google-requests),
  [bieżąca lista wspólnych crawlerów](https://developers.google.com/static/crawling/ipranges/common-crawlers.json).
- [Bing: weryfikacja](https://www.bing.com/webmasters/help/how-to-verify-bingbot-3905dc26),
  [lista IP](https://www.bing.com/toolbox/bingbot.json); Bing zaleca codzienne odświeżenie.
- [OpenAI: role i listy IP](https://developers.openai.com/api/docs/bots):
  [search](https://openai.com/searchbot.json), [training](https://openai.com/gptbot.json),
  [user](https://openai.com/chatgpt-user.json).
- [Anthropic: role i weryfikacja](https://support.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler),
  [lista IP](https://claude.com/crawling/bots.json).
- [nginx: JSON i dziedziczenie logów](https://nginx.org/en/docs/http/ngx_http_log_module.html).

Próby należy wysyłać z dodatkowym tokenem `ShootingBotAuditTest/1.0` w UA.
Takie żądania oraz lokalne połączenia loopback mają `test=true`; nigdy nie zyskują
statusu verified. Przy analizie ruchu robotów zawsze wykluczyć `test=true`.
Niemarkowane dawne próby spoza loopback mogą być niemożliwe do rozpoznania.

Crawlowanie, także zweryfikowane, nie potwierdza indeksacji, wizyty użytkownika,
kliknięcia z AI, wykorzystania do treningu ani cytowania w odpowiedzi AI.
Raport nie zmienia robots.txt ani zasad dostępu (temat 06); pomiar wejść to temat 01.
503 z `maintenance_blocked=true` jest obserwacją blokady serwisowej; pozostałe
503 należy badać osobno. Okna błędów pokazują godziny obserwacji, nie gwarantowany
czas początku/końca awarii pomiędzy żądaniami (sonda dostępności: temat 02).

## Retencja uzgodniona z użytkownikiem

- Surowe logi: dotychczasowe `/etc/logrotate.d/nginx` obejmuje `*.log`, codziennie,
  `rotate 14`, `compress`, `delaycompress`, `create 0640 www-data adm`, reopen nginx.
  Nowy plik korzysta z tej samej polityki; nie dodajemy nakładającej się reguły.
  14 archiwów oznacza 14 rotacji niepustego pliku, a nie ścisły limit 14 dni.
- Raporty: do 90 dat UTC. Codzienne wykonanie usuwa własne raporty starsze niż
  bieżąca data minus 89 dni; zachowuje pozostałe pliki. Wyłączony/uszkodzony timer
  zatrzymuje także czyszczenie — sprawdzać jednostkę i dziennik. Nie dodajemy
  zewnętrznej wysyłki ani alertów bez odrębnego uzgodnienia.
- Brak endpointu publicznego, surowych danych w git i eksportów logów do audytu.
  Kopie raportów w dowodach audytu też należy usuwać po 90 dniach; karta i opis
  testów bez surowych danych mogą pozostać jako dokumentacja wdrożenia.
