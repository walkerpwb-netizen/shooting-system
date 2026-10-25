# Wpłaty Autopay i raport roczny

Panel administratora: `/admin?tab=payments`. Zakres uzgodniony z właścicielem: **wyłącznie wpłaty klientów przez Autopay**, bez ręcznych wpłat i ogólnej ewidencji kosztów. Rozszerzenie: szacunek prowizji operatora według wskazanego przez właściciela planu Standard oraz pomocnicza kwartalna kontrola wpłat. Nie są wliczane opłaty startowe rozliczane poza Autopay przez organizatorów, przelewy weryfikacyjne sprzedawcy ani zbiorcze wypłaty operatora na konto bankowe.

## Rejestracja

Odbiornik `/premium/autopay/itn` zapisuje pojedynczą wpłatę dopiero po zweryfikowaniu podpisu ITN, serwisu, zamówienia, kwoty, waluty i statusu SUCCESS. Rejestracja wpłaty i aktualizacja zamówienia są jedną transakcją bazy. PENDING i FAILURE nie trafiają do sum.

Klucz unikalności to środowisko + ServiceID + RemoteID. Ponowione powiadomienie o tej samej transakcji nie zawyża przychodu. Dwie różne skuteczne transakcje Autopay dla jednego zamówienia są dwiema wpłatami, nawet jeśli Premium można aktywować tylko raz. Zmiana danych pod istniejącym identyfikatorem jest odrzucana.

Kwota przechowywana jest jako całkowita liczba groszy. Płatnik, opis usługi i numer zamówienia są zachowane niezależnie od późniejszego usunięcia konta. Data wpłaty pochodzi z `paymentDate` operatora, w czasie polskim, a nie z daty odbioru ITN. Oryginalny znacznik operatora i data rejestracji w systemie są zachowane do uzgodnienia.

W chwili wdrożenia nie było wcześniejszych zamówień Premium w bazie produkcyjnej, zatem nie ma historycznych wpłat do migracji. Moduł nie pobiera innych ani dawnych transakcji z portalu operatora. Rejestracja obejmuje komunikaty ITN obsługiwane przez ten system. Przyszły produkcyjny adapter ITN musi korzystać z tej samej funkcji `record_autopay_receipt` po weryfikacji produkcyjnej transakcji. Sprzedaż rzeczywista nadal jest zablokowana do zatwierdzenia i osobnego wdrożenia produkcyjnej integracji.

## Widok i eksport

- Lista: data wpłaty, płatnik, e-mail konta, usługa, kwota, RemoteID, ServiceID i numer zamówienia.
- Filtry: rok, miesiąc, środowisko, wyszukiwanie; stronicowanie po 50 wpłat.
- Sumy wpłat, szacunkowych prowizji i kwot po prowizjach: cały rok, wynik filtrów, wszystkie lata i 12 miesięcy. Cztery kwartały są niezależne od filtrów miesiąca, wyszukiwania i stronicowania.
- Roczny Excel: arkusze Podsumowanie, Miesiące, Wpłaty i Kwartały. Prowizje i kwoty po prowizjach są oznaczone jako szacunek.
- Roczny CSV: UTF-8 z BOM, separator średnik, kwoty z przecinkiem, suma roczna oraz osobne kolumny prowizji, kwot po prowizjach i taryfy szacunku.
- Eksport obejmuje cały wybrany rok niezależnie od filtra miesiąca, wyszukiwania i strony listy.
- Eksport rozliczeniowy jest dostępny **wyłącznie dla rzeczywistych wpłat**. Sandbox ma osobny widok, a próba eksportu testów jest odrzucana przez API.
- Lista i eksport wymagają autoryzacji administratora i są zwracane z `Cache-Control: no-store`. Brak interfejsu do ręcznego dodawania, zmieniania i usuwania wpłat.

## Zakres podatkowy

Wpłaty pozostają wykazane w pełnej kwocie **przed prowizjami**. Osobno wykazujemy szacunek prowizji Standard: **1,19% + 0,34 zł za każdą skuteczną transakcję**. Obliczenia są całkowitoliczbowe w groszach, zaokrąglane half-up osobno dla każdej transakcji, a następnie sumowane. Kwota po prowizji to wpłata minus ten szacunek, a nie potwierdzenie wypłaty na bank. Przy zapisie wpłaty zachowujemy niezmienny szacunek i nazwę taryfy; duplikat ITN nie przelicza historii według późniejszego cennika. Migracja uzupełnia wcześniejsze wpłaty tym samym **szacunkiem**, bez tworzenia fikcyjnych dokumentów kosztowych.

Szacunek prowizji nie pochodzi z dokumentu operatora. Przed PIT-36 trzeba uzgodnić go z rzeczywiście poniesionymi i udokumentowanymi opłatami Autopay. Raport nie zawiera innych kosztów ani zwrotów, nie oblicza podatku i nie jest deklaracją PIT.

### Kontrola kwartalna

W 2026 r. limit wynosi **10 813,50 zł na kwartał kalendarzowy** (225% minimalnego wynagrodzenia 4 806 zł). Dotyczy **przychodu należnego**, także jeszcze nieotrzymanego. Prowizje i inne koszty nie zmniejszają jego wykorzystania.

Panel i arkusz Kwartały zestawiają pełne wpłaty z tym limitem, prezentują margines według wpłat oraz szacunkowe prowizje i kwoty po prowizjach. Ostrzeżenie pojawia się przy co najmniej 80%, osiągnięciu i przekroczeniu limitu. Dokładnie 100% oznacza osiągnięcie, a nie przekroczenie. Sumy wykorzystują polską datę płatności operatora; sandbox jest odseparowany i nie jest eksportowany do rozliczeń. Dla lat bez zweryfikowanej reguły limitu nie przenosimy wartości z 2026 r.; przed 2026 r. obowiązywał limit miesięczny.

**To pomocniczy licznik wpłat, nie pełna ewidencja przychodu należnego.** Nie uwzględnia niezapłaconych należności, sprzedaży poza systemem ani korekt i zwrotów. Różnica daty powstania należności i zapłaty może zmienić przypisanie do kwartału. Dodatni margines na ekranie nie gwarantuje zachowania limitu całej działalności. Nie dodano ręcznych należności. Nowe próby płatności są dodatkowo chronione serwerową blokadą opisaną poniżej.

### Blokada nowych płatności przy 95%

`payment_limits.py` sprawdza rzeczywiste pełne wpłaty bieżącego kwartału w strefie Europe/Warsaw. Prowizje i sandbox nie pomniejszają ani nie zwiększają tego licznika. Do sumy dodaje kwoty rzeczywistych zamówień bez zarejestrowanej wpłaty, aby już wydane linki nie pozwalały równoległym zakupom wykorzystać tego samego marginesu. Rezerwowane są także niepotwierdzone zamówienia z wcześniejszych kwartałów i z nieudaną próbą płatności: nie zwalniamy miejsca na podstawie czasu lub pojedynczej próby FAILURE, ponieważ nie jest to potwierdzone anulowanie linku u operatora. Rezerwacja znika, gdy zostanie zastąpiona zapisaną wpłatą. Rezygnacja z zakupu może zatem wymagać przyszłej funkcji potwierdzającej anulowanie w Autopay przed bezpiecznym zwolnieniem miejsca.

W 2026 r. próg wynosi 10 272,825 zł. Pierwsza kwota w pełnych groszach osiągająca 95% to **10 272,83 zł**. Nowy zakup musi pozostawić sumę wpłat i rezerwacji **poniżej** tej kwoty, czyli maksymalnie 10 272,82 zł. Blokujemy również zakup, który dopiero osiągnąłby lub przekroczył próg, oraz nowe próby, gdy nie ma miejsca nawet na kolejny grosz. Dla roku bez zweryfikowanego limitu nowe próby są zablokowane.

Zabezpieczenie działa w API `/premium/checkout`, niezależnie od stanu wcześniej otwartej strony. Kontrola następuje ponownie z rzeczywistą ceną pobraną z ustawień administratora. PostgreSQL używa wspólnej transakcyjnej blokady doradczej dla kontroli zamówień i zapisu wpłat. **Przyszły produkcyjny adapter musi wywołać `ensure_payment_capacity` z pełną kwotą zamówienia w tej samej transakcji co zapis produkcyjnego PremiumOrder, przed wydaniem linku do bramki, bez wcześniejszego commit/rollback.** Obecny endpoint pozostaje wyłącznie sandboxem i również respektuje blokadę opartą na rzeczywistym wykorzystaniu limitu. Zmiana nie włącza rzeczywistych płatności.

Publiczne `/premium/commerce` udostępnia wyłącznie flagę niedostępności i komunikat, bez kwot, limitów i szczegółów sprzedaży. Odpowiedź i błędy blokady są `no-store`. Strona Premium wyłącza przyciski zakupu, a podsumowanie nie pozwala rozpocząć nowej próby i pokazuje: **„Trwają prace serwisowe. Wpłata jest w tym momencie niedostępna.”** Przy braku informacji o dostępności interfejs również nie pozwala rozpocząć nowej próby. Szczegóły wykorzystania progu i rezerwacji widzi administrator w zakładce Wpłaty (zawsze bieżący kwartał, niezależnie od filtrów raportu).

Nie odrzucamy ITN ani nie ukrywamy statusów wcześniej rozpoczętych płatności po zamknięciu nowych zakupów. Już przekazanego operatorowi linku ta zmiana nie anuluje. Opóźnione i ponowione płatności są nadal prawidłowo księgowane. Pomocniczy licznik nie obejmuje należności lub sprzedaży poza systemem; sama blokada nie gwarantuje zgodności całej działalności z limitem ustawowym.

Źródła (zweryfikowano 25.10.2026):

- Ministerstwo Finansów, przychody i koszty PIT-36: https://podatki.gov.pl/podatki-osobiste/pit/informacje-podstawowe/co-jest-opodatkowane/dochody-z-dzialalnosci-nierejestrowanej
- Ministerstwo Finansów, przychód należny i limit kwartalny 2026: https://podatki.gov.pl/poradniki-i-informatory/dzialalnosc-nierejestrowana
- Autopay, taryfa (informacja o limicie miesięcznym na tej stronie jest nieaktualna dla 2026 r.): https://developers.autopay.pl/online/dzialalnosc-nierejestrowana
