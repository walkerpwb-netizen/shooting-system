# Premium — przygotowanie Autopay

Publiczna oferta: https://system-strzelecki.pl/premium

Regulamin i dane sprzedawcy: https://system-strzelecki.pl/premium/regulamin

Ceny i funkcje są pobierane z istniejących ustawień `/settings/premium`, zarządzanych w panelu administratora. Frontend nie ma zapasowych cen. W razie braku API pokazuje błąd. Logowanie, rejestracja i aktywacja zachowują wybór pakietu przez istniejący parametr `next`.

## Stan tej wersji

Rzeczywista sprzedaż jest wyłączona. API zawsze zwraca `sales_enabled: false`. Kod nie ma produkcyjnej bramki i nie przyjmuje trybu `production`. Samo wpisanie produkcyjnych kluczy nie uruchomi płatności. Nie zmieniaj tego przed pozytywną weryfikacją Autopay i osobnym wdrożeniem uruchamiającym sprzedaż.

Sandbox jest dostępny wyłącznie aktywnemu administratorowi. Zamówienia testowe mają `environment=sandbox`, zapisują cenę i ofertę z chwili testu oraz wersję i datę akceptacji regulaminu. Zweryfikowany ITN aktualizuje tylko zamówienie testowe; **nigdy nie nadaje ani nie przedłuża praw Premium**. Powrót przeglądarki nie zmienia statusu zamówienia.

## Konfiguracja testowa

W `backend/.env` ustaw dane **testowe otrzymane od Autopay**. Nie umieszczaj sekretów w Git. Po zmianie konfiguracji zrestartuj backend.

```dotenv
AUTOPAY_MODE=disabled
AUTOPAY_SANDBOX_SERVICE_ID=
AUTOPAY_SANDBOX_SHARED_KEY=
# Pełny adres ze ścieżką przekazany przez Autopay; host musi być testpay.autopay.eu.
AUTOPAY_SANDBOX_GATEWAY_URL=
AUTOPAY_SANDBOX_HASH_ALGORITHM=sha256
```

Po uzyskaniu kompletu danych ustaw `AUTOPAY_MODE=sandbox`. Brak danych, nieznany algorytm, inny host, HTTP lub tryb produkcyjny pozostawia bramkę zablokowaną. Nie używaj kluczy produkcyjnych do testów. Ta wersja obsługuje podstawowy ITN i domyślne rozszerzenie `customerData`, a także `addressIP`, `customerNumber` i `title`. Nie włączaj dodatkowych rozszerzeń ITN (np. płatności cyklicznych, koszyka, preautoryzacji, cardData, opłaty doliczanej klientowi) bez implementacji i testów. SHA256 i SHA512 są obsługiwane; ustaw algorytm uzgodniony z operatorem.

Adresy do konfiguracji po stronie Autopay:

- ITN (POST, formularz `transactions` zawierający XML w Base64): `https://system-strzelecki.pl/api/premium/autopay/itn`
- Powrót przeglądarki (bez parametrów): `https://system-strzelecki.pl/premium/zakup`

Autopay dopisuje `OrderID` do adresu powrotu. Strona pobiera zapisany status przez uwierzytelnione API; nie ufa parametrom `Hash` ani rzekomemu statusowi w URL. Zamówienie odczyta wyłącznie jego właściciel.

Dane sprzedawcy przekazane przez właściciela są domyślnie publikowane w regulaminie. Można je nadpisać przez `PREMIUM_SELLER_NAME`, `PREMIUM_SELLER_ADDRESS`, `PREMIUM_SELLER_EMAIL`, `PREMIUM_SELLER_PHONE`, `PREMIUM_SELLER_NIP`. Nie publikuj PESEL. Brak NIP nie jest uzupełniany fikcyjną wartością. Potwierdzenie, że Autopay zaakceptuje konkretną działalność nierejestrowaną, pozostaje po stronie operatora.

## Sprawdzenie sandboxa

1. Zaloguj się jako administrator i wybierz pakiet na `/premium`.
2. Na podsumowaniu zaakceptuj regulamin na potrzeby testu i wybierz „Przejdź do testowego Autopay”.
3. Przeprowadź scenariusze testowe z Autopay: sukces, niepowodzenie, przerwanie i ponowienie. Nie wykonuj rzeczywistych przelewów.
4. Sprawdź powrót i odśwież status. Sukces musi pochodzić z poprawnie podpisanego ITN.
5. Powtórz ITN SUCCESS; status powinien pozostać opłacony. Późniejsze FAILURE lub PENDING nie cofają SUCCESS. Nieznane zamówienie, błędna kwota i waluta mają odpowiedź NOTCONFIRMED. Błędny podpis lub serwis są odrzucane bez zmiany zamówienia.
6. Sprawdź, że uprawnienia i termin prawdziwego Premium pozostały bez zmian. Zwykły użytkownik nie może rozpocząć testu, nawet przez bezpośrednie wywołanie API.

Testy automatyczne: `cd backend && venv/bin/python3 -m unittest discover -s tests -v`. Nie zastępują pełnego testu z operatorem i jego danymi sandbox.

## Osobne uruchomienie po zatwierdzeniu operatora

Wymaga potwierdzonej zgody Autopay, danych produkcyjnych i osobnego wdrożenia. Należy wtedy wdrożyć rozdzielone konfiguracje i uprawnienia dla obu środowisk, rozdzielone okresy uprawnień Strzelca i Organizatora (obecny model użytkownika dzieli jedno `premium_until`), atomową i idempotentną aktywację wyłącznie z podpisanego produkcyjnego ITN, wyraźną datę rozpoczęcia i zakończenia przed zamówieniem, opcjonalne żądanie wcześniejszego rozpoczęcia usługi, finalny przycisk z obowiązkiem zapłaty, potwierdzenie umowy i regulamin w e-mailu na trwałym nośniku oraz obsługę zwrotów i odstąpień. Nie podłączaj testowego SUCCESS do istniejącego wspólnego `premium_until`.

Regulamin przewiduje 14 dni na odstąpienie i ustawowe rozliczenie proporcjonalne wyłącznie po wyraźnym żądaniu wcześniejszego rozpoczęcia usługi oraz przekazaniu wymaganych informacji; nie stosuje domyślnego zrzeczenia się praw konsumenta. Wersja obowiązująca przy zamówieniu powinna być zachowana w całości przy uruchomieniu sprzedaży, razem z ceną, zakresem usługi i zgodami.

Źródła integracji i wymagań:

- https://developers.autopay.pl/online/dokumentacja
- https://developers.autopay.pl/online/faq/weryfikacja
- https://biznes.gov.pl/pl/portal/00146
- https://prawakonsumenta.uokik.gov.pl/pytania-i-odpowiedzi/odstapienie-od-umowy/
- https://biznes.gov.pl/pl/firma/zakladanie-firmy/chce-wiedziec-jak-zalozyc-wlasna-firme/dzialalnosc-nierejestrowa-oraz-inne-sytuacje-w-ktorych-nie-trzeba-rejestrowac-firmy
