# Aktualności Meta — obsługa

W panelu administratora wybierz „Aktualności Meta”. W osobnych polach można zapisać Page Access Token i App Secret aplikacji. App Secret jest potrzebny do zapytania `debug_token` o termin dostępu do danych; Meta wymaga w tym celu tokenu aplikacji lub tokenu użytkownika będącego deweloperem aplikacji. Nie wklejaj żadnego sekretu do rozmowy, repozytorium, logów ani adresu URL. Panel nie odczytuje zapisanych wartości z powrotem. Pliki sekretów znajdują się w `backend/.private/` z prawami 600 i są wykluczone z Git.

Synchronizacja wykorzystuje własne posty strony Facebook i media powiązanego konta Instagram. Wybiera tylko wpisy z samodzielnym `#news`, bez rozróżniania wielkości liter. Odbywa się po uruchomieniu backendu i co 30 minut; można ją też wywołać w panelu. Wynik i termin ostatniej udanej próby są podawane osobno dla każdego źródła. Błędy są zgłaszane po dwóch nieudanych próbach na skonfigurowany adres e-mail administratora; po odzyskaniu połączenia wysyłany jest komunikat o powrocie. Jeśli nie skonfigurowano App Secret, termin Data Access Expires nie może być automatycznie sprawdzany i panel pokazuje stosowny komunikat.

Po kompletnej synchronizacji zmienione wpisy są aktualizowane, a wpis zwrócony bez `#news` przestaje być wyświetlany. Wpis nieobecny w wynikach jest usuwany z lokalnej kopii dopiero po dwóch kompletnych, następujących po sobie odczytach. Jest to przybliżenie: dwa poprawne, lecz niepełne w sensie zmiany widoczności odpowiedzi Meta mogą również ukryć wpis. Przy błędzie lub przerwanym stronicowaniu poprzednie dane zostają zachowane i licznik nieobecności jest zerowany. Rzeczywiste usuwanie postów i wielozdjęciowe publikacje trzeba jeszcze przetestować na kontach.

Adresy mediów pochodzą z Meta i mogą wygasać; następna udana synchronizacja odświeża je. Podczas dłuższej awarii dostępu tekst może być nadal dostępny, podczas gdy obrazki nie będą się ładować. Jeśli Meta zwróci niepełny album, synchronizacja danego źródła zgłasza błąd i zachowuje poprzednią kopię.

Publiczna strona główna zawiera maksymalnie 30 najnowszych wpisów w HTML. Kolejne strony archiwum mają normalne linki i osobne adresy kanoniczne. Brak możliwości pobrania katalogu aktualności powoduje błąd mapy witryny zamiast cichego usunięcia z niej archiwum.

## Ręczne wpisy

Po wdrożeniu i sprawdzeniu nowej integracji jednorazowy skrypt `backend/scripts/remove_legacy_home_posts.py` usuwa dawne wpisy i przypisane im pliki w katalogu `backend/uploads/home-posts`. Przed usunięciem sprawdza ścieżki, a w razie przerwania można go ponowić. Istniejące kopie zapasowe mają osobny cykl przechowywania i nie są usuwane tym skryptem.

## Ograniczenia dostępu

`Expires: Never` nie oznacza, że dostęp do danych nie wygaśnie. W razie błędu sprawdź role i uprawnienia aplikacji w Meta, stan Data Use Checkup i Data Access Expires, a następnie przeprowadź ponowną autoryzację i zapisz nowy token w panelu. Konieczność przejścia aplikacji do trybu produkcyjnego, App Review i weryfikacji firmy zależy od jej typu, uprawnień i sposobu korzystania z danych; trzeba ją potwierdzić dla tej aplikacji przed publicznym uruchomieniem. Komunikat Unified Login sam w sobie nie rozstrzyga działania już przetestowanego odczytu przez Facebook Login.
