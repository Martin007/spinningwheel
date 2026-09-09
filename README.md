# lunch. — Linköpings lunchhjul

En statisk, svenskspråkig lunchväljare för mobil och dator. Ingen serverkod, inget byggsteg och ingen installation behövs för själva webbplatsen.

## Starta lokalt

```sh
python3 -m http.server 4173
```

Öppna `http://localhost:4173`. Öppna inte `index.html` direkt som `file://`: ES-moduler och JSON-filen ska levereras över HTTP. `npm start` gör samma sak.

## Publicera på GitHub Pages

I **Settings → Pages → Build and deployment**, välj **GitHub Actions**. Slå sedan ihop ändringarna till `master`, eller kör arbetsflödet **Test and deploy lunchhjulet** manuellt. Arbetsflödet testar koden och publicerar endast `index.html`, `favicon.svg`, `src/` och `data/`.

Alla lokala resursadresser är relativa, så både en projektadress som `/spinningwheel/` och en egen domän fungerar. Det går också att publicera samma filer på valfritt statiskt webbhotell. Publicering aktiveras inte automatiskt genom att bara öppna en pull request.

## Matställen: redigera JSON

Grundlistan finns i [`data/restaurants.json`](data/restaurants.json).

**Den medföljande startlistan är exempeldata.** Namn, lunchdagar, uteservering och lämplighet för stora sällskap är inte verifierade som aktuella verksamhetsuppgifter. Kontrollera uppgifterna hos respektive restaurang innan användning. Därför visar sidan **Exempeldata** och redigeraren en tydlig varning. Sätt `exampleData` till `false` först efter att listan har kontrollerats.

```json
{
  "version": 1,
  "exampleData": false,
  "restaurants": [
    {
      "id": "mitt-lunchstalle",
      "name": "Mitt lunchställe",
      "enabled": true,
      "largeGroups": true,
      "outdoor": false,
      "openDays": [1, 2, 3, 4, 5],
      "closedDates": ["2026-12-24", "2026-12-25"],
      "extraOpenDates": ["2026-12-26"],
      "url": ""
    }
  ]
}
```

`openDays` använder **1 = måndag … 7 = söndag**. Datum räknas alltid i **Europe/Stockholm**, oavsett besökarens tidszon och med automatisk sommar-/vintertid. Urvalet uppdateras vid en ny dag, när fliken blir synlig och precis före varje snurr.

Reglerna är, i prioritetsordning:

1. `enabled: false` utesluter alltid matstället.
2. Ett datum i `closedDates` är alltid stängt, även om det också står i `extraOpenDates`.
3. `extraOpenDates` öppnar en enskild dag utanför ordinarie schema.
4. Annars avgör `openDays` om matstället är med den dagen.

Detta är ett **dagsschema för lunch**, inte en realtidskontroll av öppettider, bordsbokningar eller automatiska svenska helgdagar. Lägg själv in helgdagar och semesterstängning i `closedDates`.

Behåll ett matställes `id` när du byter namn; tidigare vinnare matchas på detta stabila id. `largeGroups` betyder **stort sällskap**, inte kroppsstorlek eller verifierad fysisk tillgänglighet. `outdoor` betyder att matstället kan väljas när uteservering efterfrågas, inte att lediga utebord garanteras. `url` är en valfri http-/https-adress till matstället; utan den visas en kartlänk med namn och Linköping som sökning.

Valideringen kräver unika id:n, namn på 1–50 tecken, riktiga booleska värden, giltiga veckodagar och riktiga datum. Högst 48 matställen, högst 366 datum per undantagslista och högst 256 kB per importerad fil stöds. Okända JSON-fält sparas inte.

## Redigera direkt på sidan

**Matställen → Lista** har namn, lunchdagar, kryssrutor, webbadress, datumundantag, tillägg och borttagning. **JSON** visar samma uppgifter som redigerbar JSON. **Importera** läser en fil; **Exportera** hämtar aktuell lista, även osparade ändringar, som `restaurants.json`. En import skrivs inte till lagring förrän **Spara ändringar** väljs.

Ändringar på sidan är lokala överlagringar och skriver **inte** till GitHub. För att dela en ny grundlista: exportera filen, ersätt `data/restaurants.json` i repot och publicera igen. En befintlig lokal överlagring prioriteras framför den publicerade filen tills användaren väljer **Återställ från fil**. Historiken påverkas inte av den återställningen.

## Historik och inställningar

De tre huvudreglagen är **Stort sällskap**, **Uteservering** och **Uteslut tidigare vinnare**. Ljudet har en separat knapp, inte ett fjärde filter. Filter kombineras med OCH. Varje kvarvarande matställe har lika stor chans.

Vinnare, filter, ljudval och lokala matställen sparas i `localStorage` under `lunchhjulet:v1`. **Historik** kan rensa en enskild vinst eller hela historiken. Finns flera vinster för ett matställe behöver alla tas bort för att det åter ska vara med när vinnare utesluts. När alla har vunnit ber sidan användaren inkludera tidigare vinnare; den raderar aldrig historiken automatiskt.

Lagringen gäller den aktuella webbläsaren och webbplatsens origin, inte ett användarkonto. Privat läge, rensad webbplatsdata eller byte av domän kan ta bort historiken. Ett synligt meddelande visas om lagring misslyckas. JSON-exporten innehåller **matställen, inte personlig historik**. Inga analysverktyg eller konton används.

## Animation och ljud

[Motion](https://motion.dev/docs/animate) **12.23.24** laddas som ES-modul via jsDelivr. Animationen startar utan att vänta på CDN:et; en lokal `requestAnimationFrame`-/Web Animations-reserv håller sidan användbar om biblioteket blockeras. Vill du undvika tredjepartsanrop helt kan samma version av Motion självhostas och importadressen i `src/motion.js` bytas till en lokal fil. Ingen extern font eller ljudfil hämtas.

Vinnaren väljs med `crypto.getRandomValues` och rejection sampling. Hjulet gör 5–7 varv, bromsar med en fjärdegradskurva och zoomar in vid **2,75 kvarvarande segmentbredder**. Zoomtröskeln följer alltså geometrin, inte en godtycklig tidsfördröjning. Pekarens slutposition och sparad vinnare beräknas från samma plan. Matställen och filter låses under snurren.

Tickljud och vinstackord syntetiseras med Web Audio efter en användarinteraktion. Ljudknappen fungerar även under snurren. Ett enda alternativ väljs snabbt utan falsk spänning. `prefers-reduced-motion` hoppar över rotation, zoom och konfetti. Dialoger har tangentbordsfokus, Escape-stängning och tillgängliga namn.

## Tester

```sh
npm run check
npm test
```

Node 20+ räcker. Ingen `npm install` behövs. De 30 logiktesterna omfattar veckodagar, sommar-/vintertid, datumundantag, filter, vinnare, validering, lagring och pekarens slutposition för samtliga vinnare på hjul med 1–48 alternativ.

Valfria Chromium-tester (kör lokal webbserver i en annan terminal):

```sh
python3 -m pip install playwright
python3 -m playwright install chromium
python3 tests/browser_smoke.py
```

`CHROMIUM_PATH` kan peka på en installerad Chromium. `LUNCH_URL` ändrar serveradressen och `LUNCH_SCREENSHOTS` anger bildmapp. Testerna kontrollerar bland annat bredder på 320–1440 px, filter, zoom, slutposition, redigering, JSON-fel, historik och reducerad rörelse.

**Validering vid skapandet:** `npm run check` och alla 30 Node-tester godkändes. Chromium-testet godkändes med `LUNCH_IN_MEMORY=1`: den begränsade miljön blockerade nätverksnavigering, så JSON-hämtning och lagring ersattes uttryckligen av testdubblar och den lokala animationsreserven kördes. Detta testar gränssnittet och återläsning av serialiserad data, men verifierar inte riktig `localStorage` över en HTTP-omladdning, Motion via CDN, andra webbläsarmotorer eller en faktisk Pages-publicering. Kör normalläget ovan inför produktion.

## Projektstruktur

- `index.html` och `src/style.css`: svenskt gränssnitt och responsiv form.
- `src/app.js`: hjul, dialoger, redigering och lagring.
- `src/core.js`: testbar JSON-, datum-, filter- och slumpningslogik.
- `src/motion.js` och `src/audio.js`: animation och syntetiskt ljud.
- `data/restaurants.json`: redigerbar grundlista.
- `tests/`: logik- och webbläsartester.
- `.github/workflows/site.yml`: test och GitHub Pages-publicering.

Repots befintliga `LICENSE` är oförändrad. Motion har sin egen licens; se paketets licens vid eventuell självhosting. Dokumentation för publicering: [GitHub Pages – anpassade arbetsflöden](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).
