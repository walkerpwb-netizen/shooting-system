# Premium i Autopay

Oferta: https://system-strzelecki.pl/premium. Regulamin: `/premium/regulamin`.
Konfiguracja administratora: `/admin?tab=autopay`; wpłaty i raporty: `/admin?tab=payments`.

## Sprzedaż od 26.10.2026

Na polecenie właściciela aplikacja obsługuje produkcyjny zakup dla aktywnych użytkowników. Nie zmienia istniejących okresów Premium. Nowe zwykłe konta (rejestracja lub utworzenie przez administratora) nie otrzymują już automatycznego Premium do końca roku. Oddzielna rejestracja klubu PZSS pozostaje bez zmian.

Zakup przed końcem obecnego okresu przedłuża dostęp. Podsumowanie wyjaśnia zachowanie bieżącego okresu i pokazuje kupowane daty; 31.12.2026 nie jest datą uruchomienia sklepu. Ceny i funkcje pochodzą z `/settings/premium`, bez zapasowych cen we frontendzie. `organizer.monthly_price` to historyczna nazwa ceny jednej dodatkowej publikacji zawodów/szkolenia, a nie miesięcznej usługi. Publikacja jest przypisana do własnego szkicu wydarzenia. Roczny pakiet Organizatora zawiera Premium Strzelca na ten sam okres, bez skracania dłuższego dostępu.

Finalny przycisk „Kupuję i płacę” potwierdza obowiązek zapłaty. Podpisana oferta ważna 15 minut wiąże użytkownika, środowisko, cenę, pakiet, wydarzenie i zgodę na wcześniejsze rozpoczęcie. Ta sama oferta nie tworzy drugiego zamówienia. Zachowywane są pełny regulamin, dane sprzedawcy, oferta, daty i zgody. Sandboxowej oferty nie można użyć do rzeczywistego zakupu. Regulamin i potwierdzenie korzystają ze wspólnej treści `backend/premium_terms.json`.

Bez osobnego, niezaznaczonego domyślnie żądania wcześniejszego rozpoczęcia usługa zaczyna się najwcześniej 14 dni po wpłacie. Istniejący dłuższy dostęp jest zachowywany. Potwierdzenie e-mail z pełnymi warunkami i wzorem odstąpienia jest kolejkowane dopiero po zweryfikowanej wpłacie. Produkcyjna aktywacja czeka na skuteczne wysłanie potwierdzenia oraz datę rozpoczęcia; opóźnione aktywacje są sprawdzane przy uwierzytelnieniu użytkownika. Samo rozpoczęcie usługi nie pozbawia prawa odstąpienia.

## Konfiguracja

Tryby: `disabled`, `sandbox` (wyłącznie administrator, bez opłat i rzeczywistych uprawnień) oraz `production` (rzeczywiste zakupy). Sam zapis klucza nie zmienia trybu. Produkcja wymaga kompletnych danych, modelu Merchant, skonfigurowanej poczty i potwierdzenia produkcyjnych adresów. Właściciel potwierdził 26.10.2026 poprawny ITN `/production/itn`, ponoszenie prowizji przez sprzedawcę oraz zgodę operatora na wspólne dane środowisk. Aplikacja nie nadaje statusu pozytywnej weryfikacji Autopay — dostępnością metod zarządza operator.

Konfiguracja prywatna: `backend/.private/autopay.json`, katalog 0700, plik 0600, wyłączone z Git. Klucze są jawne na dysku jak `.env` i wymagają ochrony dostępu oraz kopii zapasowych. API nigdy nie zwraca klucza ani jego fragmentu; puste pole zachowuje zapisany klucz. Zapis jest atomowy, ma blokadę plikową i kontrolę rewizji. Dane zapisane w panelu są nadrzędne wobec `.env`; uszkodzony magazyn wyłącza gotowość. Zmiana klucza/ID/algorytmu jest blokowana przy otwartych zamówieniach. Nie umieszczaj sekretów w zgłoszeniach, repozytorium ani rozmowie.

Adresy operatora:

- sandbox ITN: `https://system-strzelecki.pl/api/premium/autopay/sandbox/itn`
- produkcyjny ITN: `https://system-strzelecki.pl/api/premium/autopay/production/itn`
- starszy `/api/premium/autopay/itn` jest wyłącznie aliasem sandbox
- powrót: `https://system-strzelecki.pl/premium/zakup`

U operatora: Ustawienia serwisu → Konfiguracja techniczna → Edytuj → Inny/dedykowany. Portal testowy: testportal.autopay.eu/panel; produkcyjny: portal.autopay.eu/panel. Zapis naszego panelu nie zmienia adresów u operatora. Pomoc: platnosci@autopay.pl.

Hosty są stałe: testpay.autopay.eu i pay.autopay.eu; CSP dopuszcza formularze tylko do nich i własnej domeny. Domyślny czas komunikatów to stałe CET według dokumentacji; Europe/Warsaw wymaga jawnego uzgodnienia. Ważność linku/transakcji wynosi domyślnie 15 minut (konfiguracja 5–60).

## Potwierdzenia, limit i zwroty

ITN zawiera jedną transakcję, `transactionStatus` do 50 transakcji danego zamówienia. Weryfikujemy podpis SHA256/SHA512, serwis, środowisko, kwotę i walutę. Błędny podpis poprawnego XML ma HTTP 200 i podpisane NOTCONFIRMED bez zmiany danych. XML jest ograniczony rozmiarem i chroniony przed DTD. Nie zapisujemy surowych komunikatów ani bankowych danych klienta. Rejestr administratora pokazuje zweryfikowane metadane i liczbę identycznych doręczeń.

Podpis powrotu jest weryfikowany, a samo przekierowanie nigdy nie oznacza zapłaty. Status i zamówienie odczytuje właściciel. Wyłączenie nowych zakupów nie wyłącza odbioru wyników wcześniej rozpoczętych płatności.

Nowe produkcyjne zamówienie atomowo rezerwuje kwotę w kwartalnym limicie 95%, z globalną blokadą PostgreSQL. Wpłata zastępuje rezerwację. Prowizja nie pomniejsza limitu przychodu; raport pokazuje ją osobno jako szacunek 1,19% + 0,34 zł, wymagający uzgodnienia z dokumentami operatora. Dla roku bez skonfigurowanego limitu checkout jest blokowany. Rzeczywiste wpłaty są zawsze rejestrowane, także przy przekroczeniu progu.

Status operatora można odpytać raz na 15 sekund. Anulowanie zachowuje MessageID; tylko podpisane CANCELED_FULLY zwalnia rezerwację. Sam lokalny termin lub błąd sieci jej nie zwalnia. Zwrot zachowuje MessageID, kwotę i oryginalny zapis wpłaty. Przyjęcie zlecenia nie oznacza wykonania — potwierdza je signed outDetails/v2 DONE. Opcjonalny ISTN nie jest aktywowany. Pełny zwrot cofa uprawnienie zamówienia, zachowując inne zakupy. Zgłoszenia odstąpienia obsługuje sprzedawca; administrator może zarządzać rzeczywistymi zwrotami również w portalu Autopay. Raport podatkowy wymaga osobnego uzgodnienia zwrotów z dokumentami operatora.

SMTP działa w tle z trwałej kolejki; błędną wysyłkę można ponowić. Identyczne ITN nie tworzy drugiej wiadomości. Awaria między akceptacją SMTP a zapisem może spowodować ponowne wysłanie.

## Odbiór

Testy automatyczne obejmują zachowanie darmowego dostępu, zakup przez zwykłego Strzelca, konto bez Premium, ochronę zgód i środowisk, powtórzenia ITN/zamówienia, limity, status, anulowanie, refund DONE, kolejkę poczty i aktywację rocznego Organizatora ze Strzelcem. Testy używają osobnej bazy, syntetycznych kluczy i atrap operatora/SMTP.

Odczytowy gatewayList/v3 26.10.2026 zwrócił w produkcji OK, prawidłowe identyfikatory odpowiedzi i pustą listę kanałów; sandbox zwrócił SERVICE_NOT_FOUND. Nie wykonano rzeczywistej wpłaty. Włączenie ścieżki zakupu w aplikacji nie udostępnia metod płatności u operatora i nie potwierdza pełnego testu rozliczenia. Pełny odbiór wymaga działającego kanału, płatności uzgodnionej z operatorem, poprawnego ITN, potwierdzenia e-mail i prawidłowych uprawnień.

Źródła: https://developers.autopay.pl/online/dokumentacja oraz https://developers.autopay.pl/online/portal-autopay.
