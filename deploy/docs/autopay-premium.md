# Premium — przygotowanie Autopay

Publiczna oferta: https://system-strzelecki.pl/premium

Regulamin i dane sprzedawcy: https://system-strzelecki.pl/premium/regulamin

Dane sprzedawcy i forma działalności są również widoczne w ogólnym regulaminie `/regulamin`; obie strony korzystają z tych samych danych API. Oficjalny baner metod płatności z materiałów Autopay jest wyświetlany na ofercie, podsumowaniu i w obu regulaminach. Towarzyszy mu informacja o wyłączonych rzeczywistych płatnościach i dostępności metod dopiero po zatwierdzeniu.

Ceny i funkcje są pobierane z istniejących ustawień `/settings/premium`, zarządzanych w panelu administratora. Frontend nie ma zapasowych cen. W razie braku API pokazuje błąd. Logowanie, rejestracja i aktywacja zachowują wybór pakietu przez istniejący parametr `next`.

`shooter.monthly_price` oznacza miesięczny dostęp Strzelca, natomiast istniejące pole `organizer.monthly_price` oznacza **jednorazową cenę za jedną dodatkową publikację zawodów lub szkolenia**. Nazwa pola organizatora jest historyczna i nie wyznacza czasu dostępu. `organizer.yearly_price` jest ceną rocznego pakietu publikacji bez limitu. Publiczna ścieżka zakupu dodatkowej publikacji używa `okres=publication`; stare linki `pakiet=organizer&okres=monthly` pozostają obsługiwane jako ta sama jednorazowa publikacja. Istniejące testowe API i rekordy zamówień zachowują historyczne oznaczenie `period=monthly`, które przy wyświetlaniu jest interpretowane łącznie z typem pakietu.

Roczny pakiet Organizatora obejmuje automatycznie Premium Strzelca na tym samym koncie i co najmniej do tej samej daty, bez dodatkowej opłaty. Dłuższy, niezależnie wykupiony dostęp Strzelca jest zachowany. Jednorazowa dodatkowa publikacja nie daje bonusu; sam zakup Strzelca nie nadaje rocznego pakietu Organizatora. Reguła jest zwracana przez API ustawień jako `yearly_included_packages` i zapisywana w ofercie zamówienia jako `included_packages`.

Model użytkownika zachowuje dotychczasowe wspólne `premium_until` i dodaje niezależne `premium_shooter_paid_until` oraz `premium_organizer_paid_until`. Efektywny termin Strzelca to najpóźniejszy z trzech terminów, Organizatora — późniejszy z dawnego wspólnego terminu i opłaconego terminu Organizatora. Istniejące okresy i ręczne blokady administratora pozostają zachowane. Profil i panel administratora pokazują właściwy termin dla każdego pakietu.

`premium_access.apply_paid_premium_order` obsługuje nadanie i przedłużenie pakietów w transakcji wywołującego, z blokadą zamówienia i użytkownika oraz trwałym znacznikiem jednorazowej realizacji. Aktywuje wyłącznie opłacone zamówienie **produkcyjne**, po uprzedniej weryfikacji przez adapter płatności. Wywołanie z obecnego ITN sandbox jest bezskuteczne dla uprawnień. Przygotowany adapter sprawdza autentyczność, serwis, środowisko, walutę i kwotę; produkcyjny endpoint pozostaje zablokowany stałą PRODUCTION_RELEASE_ENABLED=False. Samo istnienie funkcji nie włącza sprzedaży. Odnowienie przed wygaśnięciem przedłuża dostęp od dotychczasowej daty końca. Powtórzenie tego samego zamówienia nie nalicza kolejnego okresu.

## Stan tej wersji

Rzeczywista sprzedaż jest wyłączona. API zawsze zwraca `sales_enabled: false`. Adapter nie obsługuje produkcyjnego checkoutu i nie przyjmuje trybu `production`; adres i klucz produkcyjny można jedynie zapisać do późniejszego uruchomienia. Samo wpisanie produkcyjnych kluczy nie uruchomi płatności. Nie zmieniaj tego przed pozytywną weryfikacją Autopay i osobnym wdrożeniem uruchamiającym sprzedaż.

Sandbox jest dostępny wyłącznie aktywnemu administratorowi. Zamówienia testowe mają `environment=sandbox`, zapisują cenę i ofertę z chwili testu oraz wersję i datę akceptacji regulaminu. Zweryfikowany ITN aktualizuje tylko zamówienie testowe; **nigdy nie nadaje ani nie przedłuża praw Premium**. Powrót przeglądarki nie zmienia statusu zamówienia.

## Konfiguracja w panelu administratora

Karta **Konfiguracja Autopay**: `/admin?tab=autopay`, dostępna w nawigacji administratora na komputerze i w menu mobilnym. API: GET/PUT `/admin/settings/autopay`, wyłącznie z uwierzytelnieniem i rolą administratora. Organizator nie ma dostępu do odczytu ani zapisu.

Formularz zawiera osobne dane sandbox i produkcji: ID serwisu, adres startu transakcji, SHA256/SHA512 i klucz konfiguracji. Adresy ITN i powrotu są generowane i wyświetlane do skopiowania do portalu Autopay. Tryb ma wyłącznie opcje `disabled` i `sandbox`. Zapis kompletu produkcyjnego nie uruchamia prawdziwych płatności i nie zmienia wyniku weryfikacji. Tryb sandbox wymaga pełnych danych testowych i działa tylko dla aktywnego administratora, z zachowaniem blokady kwartalnej 95%.

Zapis trafia atomowo do `backend/.private/autopay.json` (katalog 0700, plik 0600, właściciel procesu backendu); katalog jest wyłączony z Git i nie jest katalogiem statycznym serwera WWW. Plik zawiera klucze w jawnej postaci, tak jak lokalny `.env`, i wymaga takiej samej ochrony oraz ograniczenia dostępu do kopii zapasowych. API nigdy nie zwraca zapisanego klucza ani jego fragmentu: tylko `key_configured`. Puste pole zachowuje poprzedni klucz, nowa wartość go zastępuje, zaznaczenie „Usuń zapisany klucz” usuwa. Zmiana ID serwisu lub algorytmu wymaga ponownego podania klucza albo jego jawnego usunięcia. Nie dodano odszyfrowania/podglądu klucza w przeglądarce. Walidacja nie odbija danych wejściowych w błędach. Dane nie trafiają do localStorage ani logów. Samo pole password chroni widok formularza, a przesyłanie danych do backendu odbywa się przez HTTPS.

Zapis ma blokadę plikową, kontrolę rewizji dla równoczesnej edycji, zapis przez plik tymczasowy i atomic replace. W razie konfliktu konfiguracja nie jest nadpisywana; trzeba wczytać ją ponownie. Odczyt odrzuca uszkodzony plik, symlink i zbyt szerokie prawa pliku. Uszkodzony magazyn wyłącza gotowość sandboxa zamiast przywracać potencjalnie nieaktualne dane środowiskowe.

Backend odczytuje konfigurację przy obsłudze żądania, więc zapis działa bez restartu. Dane formularza stają się nadrzędne wobec `AUTOPAY_*` z `.env`, również gdy klucz usunięto lub wybrano wyłączenie integracji. Ustawienia `.env` są używane wyłącznie przed pierwszym zapisem w panelu. Wdrożenia zachowują prywatny plik. Polityka CSP pozwala formularzowi testowemu wysłać POST wyłącznie do własnej domeny lub `https://testpay.autopay.eu`; host produkcyjny nadal nie jest dopuszczony do startu płatności.

Przed aktywacją pełnej sprzedaży trzeba osobno wdrożyć produkcyjną integrację i jej wymagania opisane poniżej. Dane ze zrzutu produkcyjnego nie są automatycznie przepisywane do formularza ani zapisywane w repozytorium.

## Konfiguracja testowa

Preferowany jest formularz powyżej. Alternatywnie, przed pierwszym zapisem w panelu, w `backend/.env` ustaw dane **testowe otrzymane od Autopay**. Nie umieszczaj sekretów w Git. Po zmianie konfiguracji zrestartuj backend.

```dotenv
AUTOPAY_MODE=disabled
AUTOPAY_SANDBOX_SERVICE_ID=
AUTOPAY_SANDBOX_SHARED_KEY=
# Pełny adres ze ścieżką przekazany przez Autopay; host musi być testpay.autopay.eu.
AUTOPAY_SANDBOX_GATEWAY_URL=
AUTOPAY_SANDBOX_HASH_ALGORITHM=sha256
```

Po uzyskaniu kompletu danych ustaw `AUTOPAY_MODE=sandbox`. Brak danych, nieznany algorytm, inny host, HTTP lub tryb produkcyjny pozostawia bramkę zablokowaną. Danych produkcyjnych używaj w sandboxie wyłącznie po wyraźnym potwierdzeniu Autopay. Właściciel potwierdził 26.10.2026, że operator dopuścił ten sam ID i klucz w obu środowiskach; w panelu należy zapisać to potwierdzenie. Hosty i skutki transakcji pozostają rozdzielone. Ta wersja obsługuje podstawowy ITN i domyślne rozszerzenie `customerData`, a także `addressIP`, `customerNumber` i `title`. Nie włączaj dodatkowych rozszerzeń ITN (np. płatności cyklicznych, koszyka, preautoryzacji, cardData, opłaty doliczanej klientowi) bez implementacji i testów. SHA256 i SHA512 są obsługiwane; ustaw algorytm uzgodniony z operatorem.

Adresy do konfiguracji po stronie Autopay:

- ITN sandbox (portal testowy; POST formularza `transactions` z XML w Base64): `https://system-strzelecki.pl/api/premium/autopay/sandbox/itn`
- ITN production (portal główny; przygotowany endpoint pozostaje zablokowany do osobnego uruchomienia): `https://system-strzelecki.pl/api/premium/autopay/production/itn`
- Starszy `/api/premium/autopay/itn` to wyłącznie alias sandbox; nie wpisuj go jako produkcyjnego ITN.
- Powrót przeglądarki (bez parametrów): `https://system-strzelecki.pl/premium/zakup`

Autopay dopisuje `ServiceID`, `OrderID` i `Hash` do adresu powrotu. Backend weryfikuje podpis powrotu i właściciela zamówienia. Sam powrót nie oznacza zapłaty; stan pochodzi ze zweryfikowanego ITN albo podpisanej odpowiedzi API statusu.

Dane sprzedawcy przekazane przez właściciela są domyślnie publikowane w regulaminie. Można je nadpisać przez `PREMIUM_SELLER_NAME`, `PREMIUM_SELLER_ADDRESS`, `PREMIUM_SELLER_EMAIL`, `PREMIUM_SELLER_PHONE`, `PREMIUM_SELLER_NIP`. Nie publikuj PESEL. Brak NIP nie jest uzupełniany fikcyjną wartością. Potwierdzenie, że Autopay zaakceptuje konkretną działalność nierejestrowaną, pozostaje po stronie operatora.

## Sprawdzenie sandboxa

1. Zaloguj się jako administrator i wybierz pakiet na `/premium`.
2. Na podsumowaniu zaakceptuj regulamin na potrzeby testu i wybierz „Przejdź do testowego Autopay”.
3. Przeprowadź scenariusze testowe z Autopay: sukces, niepowodzenie, przerwanie i ponowienie. Nie wykonuj rzeczywistych przelewów.
4. Sprawdź powrót i odśwież status. Sukces musi pochodzić z poprawnie podpisanego ITN.
5. Powtórz ITN SUCCESS; status powinien pozostać opłacony. Późniejsze FAILURE lub PENDING nie cofają SUCCESS. Nieznane zamówienie, błędna kwota i waluta mają odpowiedź NOTCONFIRMED. Błędny podpis lub serwis są odrzucane bez zmiany zamówienia.
6. Sprawdź, że uprawnienia i termin prawdziwego Premium pozostały bez zmian. Zwykły użytkownik nie może rozpocząć testu, nawet przez bezpośrednie wywołanie API.

Testy automatyczne: `cd backend && venv/bin/python3 -m unittest discover -s tests -v`. Nie zastępują pełnego testu z operatorem i jego danymi sandbox.

## Wznowienie weryfikacji według e-maila Autopay

E-mail przekazany przez właściciela wskazuje na brak dostępnych produktów/usług i brak możliwości sprawdzenia procesu zakupowego. Prosi także o formę działalności nierejestrowanej, imię i nazwisko w regulaminie oraz oficjalny baner metod płatności. Publiczna oferta zawiera miesięczny i roczny pakiet Strzelca oraz jednorazową dodatkową publikację i roczny pakiet Organizatora bez limitu, z opisami i aktualnymi cenami. Wybór, logowanie/rejestrację i podsumowanie można sprawdzić bez uruchamiania płatności. Pełny test z bramką nadal wymaga konfiguracji sandbox i uzgodnienia z operatorem dostępu testowego; nie deklaruj pełnego procesu jako zweryfikowanego wyłącznie na podstawie obecności oferty i regulaminu.

Po zakończeniu prac właściciel musi poinformować Autopay, aby operator wznowił weryfikację. Samo wdrożenie nie wznawia procesu po stronie Autopay. Wiadomość określa ważność przelewu weryfikacyjnego na 30 dni; po tym czasie proces trzeba rozpocząć ponownie. Ostateczny wynik weryfikacji zależy od operatora.

## Osobne uruchomienie po zatwierdzeniu operatora

Wymaga potwierdzonej zgody Autopay, danych produkcyjnych i osobnego wdrożenia. Konfiguracje środowisk, podpisane oferty z datami i zgodami, e-mail z pełnym regulaminem, aktywacja oraz mechanizm zwrotów są przygotowane i testowane. Nadal wymagane są osobne uruchomienie produkcyjnego checkoutu, finalny przycisk z obowiązkiem zapłaty, dopuszczenie bramki produkcyjnej w CSP, weryfikacja ustawień i test produkcyjny uzgodniony z operatorem. Obsługa zgłoszeń odstąpienia pozostaje po stronie sprzedawcy. Nie podłączaj testowego SUCCESS do uprawnień użytkownika.

Regulamin przewiduje 14 dni na odstąpienie i ustawowe rozliczenie proporcjonalne wyłącznie po wyraźnym żądaniu wcześniejszego rozpoczęcia usługi oraz przekazaniu wymaganych informacji; nie stosuje domyślnego zrzeczenia się praw konsumenta. Wersja obowiązująca przy zamówieniu powinna być zachowana w całości przy uruchomieniu sprzedaży, razem z ceną, zakresem usługi i zgodami.

Jednorazowa publikacja organizatora wymaga osobnego uprawnienia przypisanego do konkretnego wydarzenia. Nie może przedłużać `premium_until` ani nadawać miesięcznego dostępu lub nieograniczonej liczby publikacji. Powiązanie zamówienia z własnym szkicem wydarzenia oraz uprawnienie do tej jednej publikacji są wdrożone i sprawdzone w testach. Sandbox pokazuje planowany efekt bez nadawania uprawnień.

Źródła integracji i wymagań:

- https://developers.autopay.pl/online/dokumentacja
- https://developers.autopay.pl/online/faq/weryfikacja
- https://biznes.gov.pl/pl/portal/00146
- https://prawakonsumenta.uokik.gov.pl/pytania-i-odpowiedzi/odstapienie-od-umowy/
- https://biznes.gov.pl/pl/firma/zakladanie-firmy/chce-wiedziec-jak-zalozyc-wlasna-firme/dzialalnosc-nierejestrowa-oraz-inne-sytuacje-w-ktorych-nie-trzeba-rejestrowac-firmy


## Uzupełnienia protokołu i scenariusze odbioru (26.10.2026)

ITN dopuszcza dokładnie jedną transakcję. Podpisana odpowiedź `transactionStatus` może zawierać do 50 wpłat tego samego zamówienia. Dla poprawnego XML z niezgodnym podpisem lub serwisem zwracane jest HTTP 200 z podpisanym NOTCONFIRMED, bez zmian w bazie. Błędny XML i przekroczenie rozmiaru są odrzucane. Rejestr diagnostyczny przechowuje tylko zweryfikowane metadane i skrót komunikatu, bez surowego XML i danych bankowych; powtórzenia mają licznik.

Nowe adresy ITN: `/api/premium/autopay/sandbox/itn` i przygotowany, nadal zablokowany `/api/premium/autopay/production/itn`. Dotychczasowy `/api/premium/autopay/itn` pozostaje aliasem sandbox. Powiadomienia rozpoczętej transakcji są przyjmowane również po wyłączeniu nowych zakupów, jeżeli zachowano dane środowiska. Zmiana klucza, ID lub algorytmu jest blokowana przy niezakończonych zamówieniach.

Model prowizji: Merchant, potwierdzony przez właściciela; klient płaci cenę pakietu. Domyślna interpretacja paymentDate to stałe CET według dokumentacji operatora. Europe/Warsaw jest dostępne wyłącznie jako jawna opcja uzgodniona z operatorem. Zapisana surowa data wpłaty pozostaje dostępna do kontroli; historyczne rekordy nie są przeliczane.

Podsumowanie ma podpisaną ofertę ważną 15 minut. Powtórne wysłanie tej samej oferty nie tworzy drugiego zamówienia. Snapshot obejmuje pełny regulamin z `backend/premium_terms.json` (to samo źródło co publiczna strona), sprzedawcę, cenę, zakres, wydarzenie, daty i jawne zgody. Wcześniejsze rozpoczęcie jest niezaznaczone. Bez żądania usługa rozpoczyna się najwcześniej 14 dni po potwierdzonej wpłacie. Odnowienie nie skraca istniejącego dostępu. Opóźniona płatność koryguje daty od faktycznej wpłaty.

Potwierdzenie ma trwałą kolejkę i pełną treść regulaminu, warunki oraz wzór odstąpienia. W sandboxie wysyłka wymaga osobnego zaznaczenia przez administratora; test nie jest umową odpłatną. SMTP nie opóźnia potwierdzenia ITN. Błąd wysyłki można ponowić z podsumowania; aktywacja przygotowanego produkcyjnego zamówienia czeka na skuteczne wysłanie i datę początku. Rzadki przypadek przyjęcia przez SMTP i awarii zapisu może spowodować ponowne wysłanie wiadomości.

Bramka otrzymuje podpisane `ValidityTime` i `LinkValidityTime` (domyślnie 15 minut, konfiguracja 5–60). Sprawdzenie statusu jest ograniczone do jednego wywołania na 15 sekund. Anulowanie używa trwale zapisanego MessageID; dopiero podpisane `CANCELED_FULLY` zwalnia rezerwację limitu. Sam upływ czasu lokalnego ani błąd sieci nie zwalniają rezerwacji.

Zwrot używa trwałego MessageID i kwoty istniejącej wpłaty. Przyjęcie zlecenia nie oznacza zwrotu pieniędzy: dopiero podpisane `outDetails/v2` ze statusem DONE potwierdza wykonanie. Po pełnym zwrocie wszystkich wpłat zamówienia przygotowana obsługa produkcyjna cofa jego uprawnienia, zachowując inne zakupy. Pierwotne wpłaty nie są usuwane; sandbox nie wpływa na realne prawa ani raport produkcyjny. Opcjonalne ISTN nie jest aktywowane — status zwrotu sprawdza administrator. Przed produkcją należy uzgodnić obsługę zwrotów w raportowaniu podatkowym.

Karta konfiguracji zawiera test SMTP do zalogowanego administratora oraz odczytowy test `gatewayList/v3` z sandboxem. Test połączenia nie inicjuje płatności i nie dowodzi odbioru ITN. Pełny odbiór wymaga przejścia bramki testowej, prawidłowego ITN i podpisanego powrotu, ponowienia ITN, negatywnego scenariusza, anulowania i zwrotu. Testy sandbox nie nadają rzeczywistych uprawnień.

Ustawienia u operatora: testportal.autopay.eu/panel → Ustawienia serwisu → Konfiguracja techniczna → Edytuj → Inny/dedykowany. Tam trzeba ustawić adres ITN i powrotu. Jeżeli pól lub dostępu brakuje, właściciel prosi platnosci@autopay.pl o konfigurację; nie przesyła klucza w wiadomości. Zapis naszego panelu nie zmienia ustawień operatora.

Kontrola z operatorem 26.10.2026: odczytowe gatewayList/v3 na testpay.autopay.eu zwróciło SERVICE_NOT_FOUND dla zapisanego ID. Właściciel potwierdził brak dostępu do testowego portalu oraz zapisanie adresów tylko w portalu głównym; weryfikacja nadal trwa. Do pełnego testu sandbox operator musi aktywować serwis oraz właściwy ITN na środowisku testowym. Ten wynik nie potwierdza niepoprawności klucza — serwisu nie znaleziono. Nie przełączamy testów na rzeczywiste wpłaty.

Odczytowe gatewayList/v3 w produkcji zwróciło OK, zgodność serviceID i messageID oraz pustą listę kanałów. Nie utworzono transakcji. To potwierdza komunikację z produkcją, ale nie zatwierdzenie sprzedaży ani gotowość metod płatności.
