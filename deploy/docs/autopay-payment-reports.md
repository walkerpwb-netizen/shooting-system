# Wpłaty Autopay i raport roczny

Panel administratora: `/admin?tab=payments`. Zakres uzgodniony z właścicielem: **wyłącznie wpłaty klientów przez Autopay**, bez ręcznych wpłat i kosztów. Nie są wliczane opłaty startowe rozliczane poza Autopay przez organizatorów, przelewy weryfikacyjne sprzedawcy ani zbiorcze wypłaty operatora na konto bankowe.

## Rejestracja

Odbiornik `/premium/autopay/itn` zapisuje pojedynczą wpłatę dopiero po zweryfikowaniu podpisu ITN, serwisu, zamówienia, kwoty, waluty i statusu SUCCESS. Rejestracja wpłaty i aktualizacja zamówienia są jedną transakcją bazy. PENDING i FAILURE nie trafiają do sum.

Klucz unikalności to środowisko + ServiceID + RemoteID. Ponowione powiadomienie o tej samej transakcji nie zawyża przychodu. Dwie różne skuteczne transakcje Autopay dla jednego zamówienia są dwiema wpłatami, nawet jeśli Premium można aktywować tylko raz. Zmiana danych pod istniejącym identyfikatorem jest odrzucana.

Kwota przechowywana jest jako całkowita liczba groszy. Płatnik, opis usługi i numer zamówienia są zachowane niezależnie od późniejszego usunięcia konta. Data wpłaty pochodzi z `paymentDate` operatora, w czasie polskim, a nie z daty odbioru ITN. Oryginalny znacznik operatora i data rejestracji w systemie są zachowane do uzgodnienia.

W chwili wdrożenia nie było wcześniejszych zamówień Premium w bazie produkcyjnej, zatem nie ma historycznych wpłat do migracji. Moduł nie pobiera innych ani dawnych transakcji z portalu operatora. Rejestracja obejmuje komunikaty ITN obsługiwane przez ten system. Przyszły produkcyjny adapter ITN musi korzystać z tej samej funkcji `record_autopay_receipt` po weryfikacji produkcyjnej transakcji. Sprzedaż rzeczywista nadal jest zablokowana do zatwierdzenia i osobnego wdrożenia produkcyjnej integracji.

## Widok i eksport

- Lista: data wpłaty, płatnik, e-mail konta, usługa, kwota, RemoteID, ServiceID i numer zamówienia.
- Filtry: rok, miesiąc, środowisko, wyszukiwanie; stronicowanie po 50 wpłat.
- Sumy: cały rok, liczba wpłat w roku, wynik filtrów, wszystkie lata i 12 miesięcy.
- Roczny Excel: arkusze Podsumowanie, Miesiące i Wpłaty.
- Roczny CSV: UTF-8 z BOM, separator średnik, kwoty z przecinkiem i suma roczna.
- Eksport obejmuje cały wybrany rok niezależnie od filtra miesiąca, wyszukiwania i strony listy.
- Eksport rozliczeniowy jest dostępny **wyłącznie dla rzeczywistych wpłat**. Sandbox ma osobny widok, a próba eksportu testów jest odrzucana przez API.
- Lista i eksport wymagają autoryzacji administratora i są zwracane z `Cache-Control: no-store`. Brak interfejsu do ręcznego dodawania, zmieniania i usuwania wpłat.

## Zakres podatkowy

To zestawienie otrzymanych kwot klientów **przed potrąceniem prowizji**, pomocniczo do PIT-36. Nie zawiera kosztów ani zwrotów klientom. Nie wylicza dochodu lub podatku i nie tworzy deklaracji PIT. Przed rozliczeniem trzeba uzgodnić wpłaty z dokumentami Autopay oraz uwzględnić zwroty, prowizje i inne udokumentowane koszty poza tym zestawieniem. Weryfikacja limitu działalności nierejestrowanej opiera się na przychodzie należnym, więc ten raport wpłat nie zastępuje jej ewidencji.

Źródła zasad ujęcia przychodów i kosztów:

- Ministerstwo Finansów, aktualizacja 30.09.2026: https://podatki.gov.pl/podatki-osobiste/pit/informacje-podstawowe/co-jest-opodatkowane/dochody-z-dzialalnosci-nierejestrowanej
- https://podatki.gov.pl/poradniki-i-informatory/dzialalnosc-nierejestrowana
