# Premium i Autopay

Oferta: https://system-strzelecki.pl/premium. Regulamin: `/premium/regulamin`.
Konfiguracja administratora: `/admin?tab=autopay`; wpłaty i raporty: `/admin?tab=payments`.

## Sprzedaż od 26.10.2026

Na polecenie właściciela aplikacja obsługuje produkcyjny zakup dla aktywnych użytkowników. Nie zmienia istniejących okresów Premium. Konta tworzone w 2026 roku (rejestracja, utworzenie przez administratora i rejestracja klubu PZSS) otrzymują automatyczne darmowe Premium do 31.12.2026, 23:59:59 czasu polskiego. Promocja nie odnawia się automatycznie dla kont zakładanych w 2027 roku. Zakupy pozostają dostępne i przedłużają bieżący dostęp. Celowo utworzone konto testowe autopay@autopay.pl zachowuje 0 dni Premium, zgodnie z osobnym poleceniem właściciela.

Zakup przed końcem obecnego okresu przedłuża dostęp. Podsumowanie wyjaśnia zachowanie bieżącego okresu i pokazuje kupowane daty; 31.12.2026 nie jest datą uruchomienia sklepu. Ceny i funkcje pochodzą z `/settings/premium`, bez zapasowych cen we frontendzie. `organizer.monthly_price` to historyczna nazwa ceny jednej dodatkowej publikacji zawodów/szkolenia, a nie miesięcznej usługi. Publikacja jest przypisana do własnego szkicu wydarzenia. Roczny pakiet Organizatora zawiera Premium Strzelca na ten sam okres, bez skracania dłuższego dostępu.

Profil i lista administratora prezentują łączny ciągły okres dostępu, obejmujący opłacone przyszłe przedłużenia (`premium_coverage_until` i `premium_organizer_coverage_until`). Pola `premium_until` i `premium_organizer_until` nadal opisują aktywowany dostęp i służą dotychczasowym kontrolom uprawnień. Sam odczyt nie aktywuje kolejnego okresu ani nie przesuwa podstawy jego naliczania. Przyszły zakup po przerwie w dostępie nie przedłuża licznika przez tę przerwę; daty opłaconego okresu są prezentowane osobno. Anulowane, nieopłacone i w pełni zwrócone zamówienia nie przedłużają licznika. Lista administratora pobiera oczekujące opłacone okresy jednym wspólnym zapytaniem.

Finalny przycisk „Kupuję i płacę” potwierdza obowiązek zapłaty. Podpisana oferta ważna 15 minut wiąże użytkownika, środowisko, cenę, pakiet, wydarzenie i zgodę na wcześniejsze rozpoczęcie. Ta sama oferta nie tworzy drugiego zamówienia. Zachowywane są pełny regulamin, dane sprzedawcy, oferta, daty i zgody. Oferta jest przypisana do płatności produkcyjnej. Regulamin i potwierdzenie korzystają ze wspólnej treści `backend/premium_terms.json`.

Bez osobnego, niezaznaczonego domyślnie żądania wcześniejszego rozpoczęcia usługa zaczyna się najwcześniej 14 dni po wpłacie. Istniejący dłuższy dostęp jest zachowywany. Potwierdzenie e-mail z pełnymi warunkami i wzorem odstąpienia jest kolejkowane dopiero po zweryfikowanej wpłacie. Produkcyjna aktywacja czeka na skuteczne wysłanie potwierdzenia oraz datę rozpoczęcia; opóźnione aktywacje są sprawdzane przy uwierzytelnieniu użytkownika. Samo rozpoczęcie usługi nie pozbawia prawa odstąpienia.

## Konfiguracja

Tryby: `disabled` i `production`. Sam zapis klucza nie zmienia trybu. Produkcja wymaga kompletnych danych, modelu Merchant, skonfigurowanej poczty i potwierdzenia produkcyjnych adresów. Weryfikacją serwisu oraz dostępnością metod płatności zarządza Autopay. Sprawdzenie połączenia w panelu wywołuje odczytowe gatewayList/v3 i nie rozpoczyna transakcji.

Konfiguracja prywatna: `backend/.private/autopay.json`, katalog 0700, plik 0600, wyłączone z Git. Klucze są jawne na dysku jak `.env` i wymagają ochrony dostępu oraz kopii zapasowych. API nigdy nie zwraca klucza ani jego fragmentu; puste pole zachowuje zapisany klucz. Zapis jest atomowy, ma blokadę plikową i kontrolę rewizji. Dane zapisane w panelu są nadrzędne wobec `.env`; uszkodzony magazyn wyłącza gotowość. Zmiana klucza/ID/algorytmu jest blokowana przy otwartych zamówieniach. Nie umieszczaj sekretów w zgłoszeniach, repozytorium ani rozmowie.

Adresy operatora:

- ITN: `https://system-strzelecki.pl/api/premium/autopay/production/itn`
- powrót: `https://system-strzelecki.pl/premium/zakup`
- bramka: `https://pay.autopay.eu/payment`
- portal: `https://portal.autopay.eu/panel`

U operatora: Ustawienia serwisu → Konfiguracja techniczna → Edytuj → Inny/dedykowany. Zapis naszego panelu nie zmienia adresów u operatora. Pomoc: platnosci@autopay.pl.

CSP dopuszcza formularze wyłącznie do pay.autopay.eu i własnej domeny. Domyślny czas komunikatów to stałe CET według dokumentacji; Europe/Warsaw wymaga jawnego uzgodnienia. Ważność linku/transakcji wynosi domyślnie 15 minut (konfiguracja 5–60).

Po zakupie `/premium/zakup?OrderID=...` pokazuje wynik płatności: podziękowanie dopiero dla potwierdzonego `paid`, daty opłaconego okresu i informację o przyszłym przedłużeniu albo już przyznanym dostępie. Oczekująca płatność jest odczytywana z serwera co 5 sekund. Nieudana próba, anulowanie i zakończony zwrot mają osobne komunikaty. Sam powrót lub jego podpis nie potwierdzają wpłaty.

Przed przejściem do Autopay wpis historii przeglądarki otrzymuje adres wyniku zamówienia. Wskazówka w `sessionStorage` pozwala rozpoznać powrót bez `OrderID`, także po użyciu „Wstecz”; jest związana z adresem e-mail zalogowanego kupującego, ważna 24 godziny i usuwana po odczycie zamówienia. Nie jest dowodem zakupu: API zawsze sprawdza właściciela i stan płatności. Niepełny podpis powrotu nadal podlega weryfikacji. Ekran wyniku nie wymaga dostępności aktualnego cennika.

## Potwierdzenia, limit i zwroty

ITN zawiera jedną transakcję, `transactionStatus` do 50 transakcji danego zamówienia. Weryfikujemy podpis SHA256/SHA512, serwis, środowisko, kwotę i walutę. Błędny podpis poprawnego XML ma HTTP 200 i podpisane NOTCONFIRMED bez zmiany danych. XML jest ograniczony rozmiarem i chroniony przed DTD. Nie zapisujemy surowych komunikatów ani bankowych danych klienta. Rejestr administratora pokazuje zweryfikowane metadane i liczbę identycznych doręczeń.

Podpis powrotu jest weryfikowany, a samo przekierowanie nigdy nie oznacza zapłaty. Status i zamówienie odczytuje właściciel. Wyłączenie nowych zakupów nie wyłącza odbioru wyników wcześniej rozpoczętych płatności.

Nowe produkcyjne zamówienie atomowo rezerwuje kwotę w kwartalnym limicie 95%, z globalną blokadą PostgreSQL. Wpłata zastępuje rezerwację. Prowizja nie pomniejsza limitu przychodu; raport pokazuje ją osobno jako szacunek 1,19% + 0,34 zł, wymagający uzgodnienia z dokumentami operatora. Dla roku bez skonfigurowanego limitu checkout jest blokowany. Rzeczywiste wpłaty są zawsze rejestrowane, także przy przekroczeniu progu.

Status operatora można odpytać raz na 15 sekund. Anulowanie zachowuje MessageID; tylko podpisane CANCELED_FULLY zwalnia rezerwację. Sam lokalny termin lub błąd sieci jej nie zwalnia. Zwrot zachowuje MessageID, kwotę i oryginalny zapis wpłaty. Przyjęcie zlecenia nie oznacza wykonania — potwierdza je signed outDetails/v2 DONE. Opcjonalny ISTN nie jest aktywowany. Zlecenie pełnego zwrotu cofa uprawnienie zamówienia od razu, zachowując inne zakupy; wykonanie przelewu jest potwierdzane osobno. Zgłoszenia odstąpienia obsługuje sprzedawca; administrator może zarządzać rzeczywistymi zwrotami również w portalu Autopay. Raport podatkowy wymaga osobnego uzgodnienia zwrotów z dokumentami operatora.

SMTP działa w tle z trwałej kolejki; błędną wysyłkę można ponowić. Identyczne ITN nie tworzy drugiej wiadomości. Awaria między akceptacją SMTP a zapisem może spowodować ponowne wysłanie.

## Odbiór

Testy automatyczne obejmują zachowanie darmowego dostępu, zakup przez zwykłego Strzelca, konto bez Premium, ochronę zgód i środowisk, powtórzenia ITN/zamówienia, limity, status, anulowanie, refund DONE, kolejkę poczty i aktywację rocznego Organizatora ze Strzelcem. Testy używają osobnej bazy, syntetycznych kluczy i atrap operatora/SMTP.

Dalsze próby integracji z operatorem dotyczą produkcji i wymagają uzgodnienia z Autopay. Mogą obejmować rzeczywiste wpłaty, aktywacje i zwroty. Nie są uruchamiane automatycznie przy zapisie konfiguracji ani przy sprawdzeniu połączenia.

Wersja z 28.10.2026 usuwa poprzednie opcje dodatkowego środowiska, jego klucze, endpointy, widoki raportów oraz podgląd pozorowanej realizacji. Migracja e6a2c4f8b153 usuwa rekordy płatności spoza produkcji i nie zmienia rekordów produkcyjnych ani przyznanego Premium. Migracje historyczne pozostają w łańcuchu, żeby można było prawidłowo aktualizować istniejące bazy i tworzyć nowe instalacje.

Źródła: https://developers.autopay.pl/online/dokumentacja oraz https://developers.autopay.pl/online/portal-autopay.

## Odstąpienie i zwrot z panelu administratora

Przy opłaconej transakcji w `/admin?tab=payments` znajduje się przycisk „Zleć zwrot do Autopay” oraz licznik zwykłego 14-dniowego terminu odstąpienia od zawarcia umowy (potwierdzona wpłata). Termin obejmuje cały ostatni dzień w Europe/Warsaw; sobota lub święto przesuwa koniec na najbliższy dzień roboczy. Termin wylicza i egzekwuje backend. Po jego upływie przycisk znika; reklamacje i oświadczenia wysłane w terminie, a obsługiwane później, wymagają indywidualnej obsługi sprzedawcy. Licznik nie opisuje technicznego limitu zwrotów operatora.

Administrator potwierdza pełny zwrot. System atomowo zapisuje `refund_requested_at`, identyfikator administratora i MessageID wszystkich niezwróconych wpłat zamówienia oraz wycofuje uprawnienia tego zakupu, PRZED połączeniem z Autopay. Darmowy dostęp i inne zakupy zostają. Wycofany przyszły okres nie jest aktywowany przy kolejnym logowaniu, nie wydłuża licznika ani następnej oferty. Jednorazowa publikacja nie zmienia czasowego Premium. Cofnięcie rocznego Organizatora wycofuje również wynikający z niego bonus Strzelca.

Status „W trakcie zwrotu” obejmuje także timeout lub błąd operatora; panel pokazuje wtedy ostrzeżenie i możliwość ponowienia. Błąd nie przywraca Premium. Niejednoznaczne żądanie jest ponawiane z TYM SAMYM MessageID. Nowy identyfikator powstaje dopiero po podpisanym statusie anulowania poprzedniej operacji. Raport oryginalnych wpłat nie jest modyfikowany.

Proces w tle przy starcie backendu i co minutę odpytuje `outDetails/v2` dla już zleconych zwrotów, również bez otwartego panelu. Nie inicjuje nowych zwrotów ani ponowień przelewów. Ręczne sprawdzenie jest dostępne obok statusu; odczyty pojedynczego zwrotu mają co najmniej 15 sekund odstępu. Dopiero podpisane `DONE` dla sumy wszystkich wpłat zmienia stan na „Zwrot zrealizowany” i ustawia `refunded_at`. Status DONE oznacza potwierdzenie wykonania przelewu przez operatora; sesja powrotu klienta nie jest takim potwierdzeniem. Ekran zamówienia klienta odróżnia trwający zwrot od zakończonego.
