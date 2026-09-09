# lunch. — Linköpings lunchhjul

En statisk, svenskspråkig lunchväljare för mobil och dator. Ingen serverkod, inget byggsteg och ingen installation behövs för själva webbplatsen.

## Starta lokalt

```sh
python3 -m http.server 4173
```

Öppna `http://localhost:4173`. `npm start` gör samma sak. Använd HTTP, inte `file://`, eftersom sidan läser ES-moduler och JSON.

## Publicera på GitHub Pages

Välj **Settings → Pages → Build and deployment → GitHub Actions** och slå ihop ändringarna till `master`. Det medföljande arbetsflödet testar koden och publicerar endast `index.html`, `favicon.svg`, `src/` och `data/`. En öppen pull request publicerar inte webbplatsen.

Resursadresserna är relativa och fungerar under `/spinningwheel/`, på en egen domän och på andra statiska webbhotell.

## 121 matställen

Grundlistan finns i [`data/restaurants.json`](data/restaurants.json). Den ersätter de åtta exemplen med 121 poster från den angivna Tripadvisor-lunchlistan. Källor, listpositioner och ursprungliga namn finns i [`data/tripadvisor-source.json`](data/tripadvisor-source.json). Läs [uppdateringens datanoter](TRIPADVISOR-UPDATE.md) för detaljer.

Listan är en statisk ögonblicksbild från 9 september 2026, inte en löpande koppling till Tripadvisor. 24 poster matchade kategorin för stora sällskap och 30 kategorin för uteservering; 14 matchade båda. Kategoriuppgifterna har inte verifierats direkt med verksamheterna. Övriga värden är **okända**, inte verifierade nej.

**Lunchdagar är inte verifierade.** `openDays: null` låter matstället delta alla dagar, men sidan visar **Lunchdagar ej bekräftade** och påstår inte att det är öppet idag. Ange scheman och undantagsdatum när de är kända.

## Redigera listan

**Matställen → Lista** har sökning, namn, lunchdagar, medverkan i hjulet, egenskaper, webbadress och datumundantag. Egenskaper väljs som **Ja / Nej / Okänt**. **JSON** visar samma uppgifter som redigerbar JSON. **Importera** läser en fil; **Exportera** hämtar aktuell lista, även osparade ändringar. Importer sparas först när **Spara ändringar** väljs.

Ändringar på sidan sparas bara i webbläsaren, inte på GitHub. För en ny gemensam lista: exportera JSON-filen, ersätt `data/restaurants.json` och publicera igen.

**En äldre lokalt sparad lista har företräde.** Välj **Matställen → Återställ från fil** för att läsa in de 121 posterna. Exportera egna restaurangändringar först om de ska sparas. Historiken behålls.

### JSON-format

```json
{
  "version": 1,
  "exampleData": false,
  "restaurants": [
    {
      "id": "mitt-lunchstalle",
      "name": "Mitt lunchställe",
      "enabled": true,
      "largeGroups": null,
      "outdoor": null,
      "openDays": null,
      "closedDates": [],
      "extraOpenDates": [],
      "url": ""
    }
  ]
}
```

`largeGroups` och `outdoor`: `true` = ja, `false` = nej, `null` = okänt. Aktiverade huvudfilter tar endast med `true`. `largeGroups` avser stort sällskap, inte kroppsstorlek eller verifierad fysisk tillgänglighet. `outdoor` garanterar inte ett ledigt utebord.

`openDays`: `null` = okänt; `[1, 2, 3, 4, 5]` = måndag–fredag; `[]` = inga ordinarie lunchdagar. Veckodagar använder 1 = måndag till 7 = söndag. `closedDates` och `extraOpenDates` innehåller datum i formatet `ÅÅÅÅ-MM-DD`.

Datum räknas alltid i **Europe/Stockholm**. `enabled: false` utesluter alltid matstället. En explicit stängning vinner över ordinarie dagar, okända dagar och extra öppet. Annars tillåts extra öppet, följt av veckoschemat. Urvalet kontrolleras vid ny dag, när fliken blir synlig och före varje snurr.

Detta är ett dagsschema för lunch, inte en realtidskontroll av öppettider eller bordsbokningar. Lägg själv in helgdagar och semesterstängningar.

Behåll ett matställes `id` vid namnbyte så att tidigare vinster fortfarande räknas. De gamla ID-värdena för Storan, von Dufva, Yogi och Överste Mörner är bevarade. Kedjornas olika adresser är separata val. `url` är en valfri http-/https-adress; utan den används en kartlänk med namn och Linköping.

Högst **200 matställen**, namn på 1–50 tecken, unika id:n, 366 datum per undantagslista och 256 kB per importerad fil stöds. Okända JSON-fält sparas inte.

## Historik, animation och ljud

De tre huvudreglagen är **Stort sällskap**, **Uteservering** och **Uteslut tidigare vinnare**. Filter kombineras med OCH. Varje kvarvarande matställe har lika stor chans. Ljudet har en separat knapp.

Vinnare, filter, ljudval och lokala matställen sparas i `localStorage` under `lunchhjulet:v1`. **Historik** kan rensa en enskild vinst eller hela historiken. Flera vinster för samma matställe måste alla tas bort för att det ska kunna väljas igen när vinnare utesluts. Historiken raderas aldrig automatiskt. JSON-exporten innehåller matställen, inte personlig historik.

Lagringen gäller webbläsaren och webbplatsens origin, inte ett konto. Rensad webbplatsdata, privat läge eller byte av domän kan påverka historiken. Ett meddelande visas om lagring misslyckas. Inga analysverktyg eller konton används.

Motion **12.23.24** laddas via jsDelivr med en lokal `requestAnimationFrame`-/Web Animations-reserv. Vinnaren väljs med `crypto.getRandomValues` och rejection sampling. Hjulet gör 5–7 varv, bromsar och zoomar vid **2,75 kvarvarande segmentbredder**. Stora urval använder radiella etiketter; fullständiga namn finns i redigeraren, den aktiva etiketten, den tillgängliga beskrivningen och vinnardialogen.

Tickljud och vinstackord syntetiseras med Web Audio efter användarinteraktion. Ingen extern font eller ljudfil hämtas. Ett ensamt alternativ väljs utan lång animation. `prefers-reduced-motion` hoppar över rotation, zoom och konfetti. Dialogerna stöder tangentbord och Escape.

## Tester

```sh
npm run check
npm test
```

Node 20+ räcker; ingen `npm install` behövs. De **44 logiktesterna** omfattar datum, filter, lagring, de 121 posterna, okända fält, källförteckningen, 200-postersgränsen och alla vinnarpositioner för 1–200 alternativ.

Det reproducerbara interaktionstestet för den importerade listan:

```sh
python3 -m pip install playwright
python3 -m playwright install chromium
python3 tests/tripadvisor_browser.py
```

Det använder Chromium med minimal DOM och mockad hämtning, lagring, animation och ljud. Det testar bland annat 121 segment, filter, sökning, redigering, JSON, vinnare och återställning. Det är **inte** ett test av full mobil-/desktoplayout, verklig HTTP/localStorage, Motion-CDN, ljuduppspelning eller livepublicering. Både detta test och de 44 Node-testerna passerade inför uppdateringens incheckning.

## Projektstruktur

`index.html` och `src/style.css` innehåller gränssnittet. `src/app.js` hanterar hjul, dialoger och lagring. `src/core.js` innehåller testbar data- och urvalslogik. `src/motion.js` och `src/audio.js` sköter animation och ljud. `data/` innehåller grundlista och källförteckning, `tests/` testfallen och `.github/workflows/site.yml` test/publicering.

Repots befintliga `LICENSE` är oförändrad. Motion har sin egen licens; se paketets licens vid eventuell självhosting.
