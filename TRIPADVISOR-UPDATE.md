# 121 lunchställen från Tripadvisor

Uppdatering för `feat/swedish-lunch-wheel` i `Martin007/spinningwheel`, baserad på commit `23ccfb5e5abff09699a30a2692c69f8af3e6e699`.

## Innehåll

`data/restaurants.json` ersätter de åtta exempelposterna med samtliga 121 poster från den angivna lunchlistans fem sidor. `data/tripadvisor-source.json` dokumenterar källsidor, listpositioner, ursprungliga namn och datum för hämtningen. Uppgifterna är en statisk ögonblicksbild, inte en löpande koppling till Tripadvisor.

Bland lunchposterna matchade 24 Tripadvisors kategori för stora sällskap och 30 kategorin för uteservering. 14 matchade båda. Dessa har `true` för respektive egenskap. Övriga har `null`: okänt, inte ett verifierat nej. Kategoriuppgifterna har inte verifierats direkt med verksamheterna. Huvudfiltren tar endast med `true`.

Lunchdagar är inte verifierade och är därför `null`, inte påhittade veckoscheman. Ett matställe med okända dagar får delta alla dagar, och sidan visar **Lunchdagar ej bekräftade**. Detta innebär inte att restaurangen faktiskt är öppen idag eller serverar lunch varje dag. Redigera dagarna i gränssnittet eller JSON-filen när de är kända. Ett tomt fält `[]` betyder däremot inga ordinarie lunchdagar. Datum i `closedDates` har alltid företräde, även när dagarna är okända.

Tre kedjor förekommer med två separata restauranger vardera. Max Burgers, Burger King och Subway behålls som sex separata poster och särskiljs med adresser från deras respektive Tripadvisor-sidor. Inga omdömen, betyg eller bilder har kopierats.

Gränsen har höjts från 48 till 200 matställen. Hjulet använder radiella etiketter för större urval. Fullständiga namn finns i den aktiva etiketten under snurren, vinnardialogen, den tillgängliga beskrivningen och den sökbara redigeraren. De befintliga ljud- och zoomfunktionerna är kvar. Texten på smala segment blir med nödvändighet liten när samtliga 121 alternativ visas samtidigt.

## Använd uppdateringen

Listan och kodstödet ingår i samma ändring på `feat/swedish-lunch-wheel`. Ingen manuell patch behövs. Körning och publicering beskrivs i [README](README.md).

**Byt inte enbart JSON-filen i en äldre version:** originalkoden har en 48-postersgräns och accepterar inte `null` för okända uppgifter. Listan kräver de uppdaterade filerna `src/app.js` och `src/core.js`.

## Lokalt sparade matställen och historik

En tidigare sparad lokal restauranglista fortsätter att ha företräde framför filen i repot. För att byta till den nya listan: **Matställen → Återställ**. Detta ersätter den lokala restauranglistan men behåller historiken. Exportera egna restaurangändringar före återställningen om de ska sparas.

De gamla ID-värdena för Storan, von Dufva, Yogi och Överste Mörner är bevarade. Deras tidigare vinster fortsätter därför att räknas vid filtrering, även när visningsnamnet har ändrats. Historikposter för borttagna restauranger raderas inte.

## JSON-format

```json
{
  "id": "mitt-matstalle",
  "name": "Mitt matställe",
  "enabled": true,
  "largeGroups": null,
  "outdoor": null,
  "openDays": null,
  "closedDates": [],
  "extraOpenDates": [],
  "url": ""
}
```

`largeGroups` och `outdoor`: `true` = ja, `false` = nej, `null` = okänt. Ändra i redigerarens val **Ja / Nej / Okänt**.

`openDays`: `null` = okända dagar; en lista med ISO-veckodagar, exempelvis `[1, 2, 3, 4, 5]`, betyder måndag–fredag. `[]` betyder inga ordinarie dagar. Redigeraren kan både välja veckodagar och återställa till okända dagar.

`closedDates` och `extraOpenDates`: datumsträngar i formatet `ÅÅÅÅ-MM-DD`. Alla datumval använder `Europe/Stockholm`. Schemat gäller dagar, inte öppettider eller tillgängliga bord.

## Verifiering

44 Node-tester passerade, inklusive de ursprungliga regressionsfallen och nya fall för 121 poster, 200-postersgränsen, kategorifilter, okända uppgifter, källförteckningen, kedjeadresser och bibehållen historik. Vinnarpositioner testades för alla urvalsstorlekar 1–200 med flera startrotationer och landningsvariationer.

Chromium-kontroller passerade för rendering av 121 segment, filter, sökning, veckodagar, redigering, JSON-export, att lägga till fler poster, vinnarlagring och återställning utan raderad historik. De använde en minimal DOM-fixtur samt testdubblar för nätverk, lagring, animation och ljud. Detta var inte ett visuellt mobil-/desktoptest eller ett test av verklig HTTP, localStorage, Motion-CDN eller ljuduppspelning.

Ändrade originalfiler jämfördes byte för byte mot GitHubs Git-blobhashar. Patchen kontrollerades och applicerades på rena kopior av dessa filer, varefter testerna kördes igen. Samma 44 Node-tester och de mockade Chromium-kontrollerna kördes på nytt inför incheckningen. Det reproducerbara interaktionstestet finns i `tests/tripadvisor_browser.py`. Dessa kontroller verifierar inte en faktisk Pages-publicering.

## Källor

Lunchlistan (hämtad 9 september 2026):

- https://www.tripadvisor.se/Restaurants-g189864-zfp30-Linkoping_Ostergotland_County.html
- https://www.tripadvisor.se/Restaurants-g189864-oa30-zfp30-Linkoping_Ostergotland_County.html
- https://www.tripadvisor.se/Restaurants-g189864-oa60-zfp30-Linkoping_Ostergotland_County.html
- https://www.tripadvisor.se/Restaurants-g189864-oa90-zfp30-Linkoping_Ostergotland_County.html
- https://www.tripadvisor.se/Restaurants-g189864-oa120-zfp30-Linkoping_Ostergotland_County.html

Kategorier:

- https://www.tripadvisor.se/Restaurants-g189864-zfp9-Linkoping_Ostergotland_County.html
- https://www.tripadvisor.se/Restaurants-g189864-zfp6-Linkoping_Ostergotland_County.html
- https://www.tripadvisor.se/Restaurants-g189864-oa30-zfp6-Linkoping_Ostergotland_County.html

Länkarna till de sex restauranger som särskiljs med kedjeadress finns i respektive JSON-post. Övriga poster använder webbplatsens befintliga kartlänk baserad på restaurangnamn och Linköping.
