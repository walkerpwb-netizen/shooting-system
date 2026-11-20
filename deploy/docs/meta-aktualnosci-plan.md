# Integracja aktualności Meta — plan prac

## Ustalenia

- Źródłem są wyłącznie posty własnej strony Facebook i powiązanego konta Instagram z samodzielnym hashtagiem `#news`, niezależnie od wielkości liter; uwzględniamy starsze dostępne wpisy.
- Synchronizacja odbywa się co 30 minut po stronie serwera. Klucze dostępowe nie trafiają do kodu, repozytorium, odpowiedzi API, logów ani przeglądarki.
- W obecnej sekcji pokazujemy 30 najnowszych wpisów; dalsze wpisy są osiągalne poprzez stronicowane archiwum, w kolejności od najnowszych. Treść jest dostępna w HTML bez uruchamiania JavaScriptu, także w archiwum.
- Pokazujemy źródło, datę, tekst, media i link do oryginału. Posty z obu serwisów są oddzielnymi wpisami. Filmy mają miniaturę i link do oryginału. Galerię wielu zdjęć trzeba sprawdzić na rzeczywistych postach.
- Ręczne wpisy i przypisane im pliki mają zostać trwale usunięte przy wdrożeniu. Operacja wymaga ochrony innych plików i sprawdzenia wyniku.
- Osobna karta Meta w panelu administratora umożliwia konfigurację, zapis tokenu bez jego późniejszego ujawniania, kontrolę stanu i powiadomień. Powiadomienia trafiają na istniejący adres administracyjny. Messenger nie jest wymagany.

## Kolejność

1. Zweryfikować możliwości Graph API dla mediów, paginacji, edycji, usunięć oraz trwałości dostępu i ustalić bezpieczne przekazanie tokenu na serwer.
2. Zaimplementować synchronizację obu źródeł, trwały zapis danych oraz oddzielną obsługę błędów. Nie usuwać postów na podstawie błędu lub niepełnej odpowiedzi; zachować ostatnie poprawne dane. Zaplanować monitorowanie tokenu i wygaśnięcia dostępu do danych z powiadomieniami.
3. Przygotować publiczny interfejs z renderowaniem serwerowym, archiwum ze zwykłymi linkami, mapę strony i panel stanu. Sprawdzić, że brak tokenu i awarie Meta nie ujawniają danych dostępowych i nie blokują strony głównej.
4. Zastąpić obsługę ręcznych wpisów i bezpiecznie usunąć ich dane oraz powiązane pliki w trakcie wdrożenia.
5. Przetestować filtrowanie, paginację, edycje, usunięcia, błędy, obrazy i filmy, powiadomienia, indeksowalny HTML i uprawnienia. Wielozdjęciowe posty wymagają osobnych testowych publikacji.
6. Uruchomić wymagane kontrole, utworzyć commit i push, obserwować właściwy przebieg CI and Production Deploy oraz zweryfikować działanie po wdrożeniu. Pozostawić tryb konserwacji włączony do zakończenia testów użytkownika.
