# Grafiki płatności Autopay

Baner `components/AutopayMethodsBanner.tsx` prezentuje wyłącznie BLIK i przelew tradycyjny, zgodnie z informacją właściciela o przyznanych metodach (6 listopada 2026 r.). Układ jest responsywnym HTML/CSS; nie przycina ani nie modyfikuje logotypów.

Oryginalne materiały operatora, pobrane 6 listopada 2026 r.:

- `autopay-logo.svg`: https://developers.autopay.pl/storage/loga/Logotyp/logo-standard.svg
- `blik-logo.png`: plik `PBL/Transparent/PNG_t/530_t_BLIK.png` z https://developers.autopay.pl/storage/pobierz/paybylink.zip
- Strona materiałów: https://developers.autopay.pl/online/grafiki

Przelew tradycyjny jest oznaczony napisem i neutralną ikoną banku. Baner nie zawiera logotypów kart, portfeli elektronicznych ani poszczególnych banków. Gotowe zestawy „BLIK + przelew” z witryny operatora zawierają logotypy wielu banków, dlatego do prezentacji wyłącznie dwóch metod zastosowano osobne materiały.

Wspólny komponent jest używany na stronie Premium, w podsumowaniu zakupu, Regulaminie Premium oraz w przygotowywanej sekcji wsparcia. Na stronie Premium baner ma do 800 px szerokości na komputerze, w pozostałych miejscach do 485 px; na małym ekranie logo operatora znajduje się nad dwiema metodami. Stare banery z kartami i portfelami zostały usunięte, a nowe ścieżki plików zapobiegają wyświetlaniu starej grafiki z pamięci podręcznej.
