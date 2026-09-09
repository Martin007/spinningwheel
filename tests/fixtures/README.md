# Testdata, inte webbplatsens restauranglista

`tripadvisor-restaurants.json` är den ursprungliga importen av 121 poster från
9 september 2026, hämtad från commit `91010f41d07bd129edc76b395faa561d30d1d237`.
Filen använder samma Git-blob som den importen:
`a4c8fc6ea5e2d078d7d91184efe5433539b7fd7f`.

`tests/tripadvisor.test.js` och `tests/tripadvisor_browser.py` använder denna
fasta ögonblicksbild för importens antal, kategoriuppgifter och historiska ID:n.
Källförteckningen finns i `data/tripadvisor-source.json`.

Ändra **data/restaurants.json** för den publicerade webbplatsen. Den listan får
ha andra matställen, antal, namn, egenskaper och lunchdagar. `core.test.js`
validerar dess format utan att kräva den ursprungliga importen. Behåll unika
stabila ID:n; ordinarie schemavalidering och gränsen på 200 gäller fortfarande.

Testdata följer inte med i GitHub Pages-artifakten.
