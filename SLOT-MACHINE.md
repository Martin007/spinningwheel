# Lunchbanditen

Välj **Enarmad bandit** i **Välj sätt**. Lunchhjulet finns kvar och är standard för nya besökare. Valet sparas tillsammans med övriga inställningar i webbläsaren. Äldre sparad historik och restauranglistor fungerar utan återställning.

## Spela

Klicka på spaken, dra den nedåt med mus eller finger, eller använd **Dra i spaken**. Spaken är även en vanlig tangentbordsstyrd knapp: Tab, sedan Enter eller mellanslag. Ett kort, avbrutet drag startar inte en snurr.

Tre rullar startar tillsammans och stannar från vänster till höger. Den markerade mittraden är vinstraden. **Tre identiska restaurang-ID:n krävs** för en vinst. En miss visar **Ingen träff. Dra igen.** och förändrar inte historiken. Ingen automatisk omsnurr görs. En vinst använder samma resultatdialog och historik som hjulet.

Filtren **Stort sällskap**, **Uteservering** och **Uteslut tidigare vinnare**, lunchdagar i Stockholmstid, datumundantag och lokala redigeringar gäller i båda lägena. Ett ensamt alternativ vinner direkt efter en kort övergång. Ett tomt eller uttömt urval kan inte snurras.

## Slumpning och träffchans

Banditen har **lunchanpassad träffchans: 1 på 4 per drag** när minst två matställen deltar. Det visas i informationsrutan vid maskinen. Det är alltså inte tre oberoende likformiga dragningar från hela restauranglistan. Sådana dragningar skulle ge endast 1 på 1 156 i träffchans med 34 alternativ.

Vid vinst väljs varje berättigat matställe med lika stor sannolikhet. Vid miss väljs likformigt bland alla kombinationer som inte är tre lika. Inga konstgjorda nästan-vinster, dolda omsnurrar eller garanterade vinster efter ett visst antal försök används. Varje drag är oberoende av tidigare försök. Ingen insats, valuta eller betalning finns.

`SLOT_MATCH_DENOMINATOR` i `src/slot-core.js` styr träffchansen. Informationsrutan läser samma konstant. Utfallet använder befintlig kryptografisk slumpning med rejection sampling. Slutpositionerna i animationen kommer från samma plan som matchningskontrollen; restaurangnamnens initialer och färger är endast dekoration.

## Form, ljud och tillgänglighet

Maskinen är byggd av HTML och CSS: mörkgrön lack, mässingsram, belysta lampor, gräddfärgade symboler, markerad vinstrad och röd spak. Inga nya bilder, typsnitt, ljudfiler eller beroenden laddas ned. Fullständiga restaurangnamn finns i rullarnas tillgängliga namn, verktygstips, redigeraren och resultatdialogen. Mycket långa namn kan förkortas visuellt till tre rader på smala skärmar.

De rullande remsorna använder den befintliga Motion-integrationen och dess lokala animationsreserv. Procentbaserade förflyttningar behåller vinstradens centrering även om fönstret ändrar storlek under en snurr. Den tredje rullen stannar sist, utan att utfallet ändras för att skapa en nästan-vinst.

Spakljud, mekaniska tick, låg motor, rullstopp, missljud och vinstackord syntetiseras med Web Audio efter användarinteraktion. Den gemensamma ljudknappen fungerar även under snurren. Motorn stoppas efter snurren, när sidan döljs och med en separat säkerhetstid. Blockerat ljud ska inte hindra ett resultat.

`prefers-reduced-motion` tar bort rullning, spakrörelse, pulserande lampor och konfetti. Lägesväljare, filter, redigerare och båda startknapparna låses under en snurr. Ett dubbelklick skapar inte en andra samtidig omgång.

## Fler beslutssätt

Lägg till metadata i `DECISION_MODES` i `src/core.js`, registrera motsvarande startfunktion i `modeRunners` i `src/app.js` och anslut en separat vy. Dropdownen byggs från registret. Behåll gemensam filtrering och använd `presentWinner` för faktiska vinnare. Okända sparade lägen faller tillbaka till hjulet.

## Tester

```sh
npm run check
npm test

# Kör med en HTTP-server i en annan terminal:
python3 -m http.server 4173
python3 tests/decision_browser.py
python3 tests/slot_state_browser.py

# Begränsad miljö: uttryckliga testdubblar för hämtning och lagring:
LUNCH_IN_MEMORY=1 python3 tests/decision_browser.py
LUNCH_IN_MEMORY=1 python3 tests/slot_state_browser.py

# Den frysta 121-posterslistan, oberoende av den redigerbara grundlistan:
python3 tests/tripadvisor_browser.py
```

Webbläsartesterna kräver Playwright och Chromium. `CHROMIUM_PATH`, `LUNCH_URL` och `LUNCH_SCREENSHOTS` kan anpassas. `tests/browser_smoke.py` är en kompatibilitetsstart för den nya gränssnittssviten.

De 60 Node-testerna omfattar bland annat exakta matchningar, likformiga misskombinationer, alla möjliga vinnare, 1–200 alternativ, felaktiga indata, sparade lägen, scheman och befintlig hjullogik. Gränssnittssviterna kontrollerar fem skärmbredder, vinstradens geometri, dragspak, träff/miss, låsning, ljudknapp, gemensam historik, tangentbord, singleton, reducerad rörelse, återläsning och tomt urval. Hjul-/historikintegrationen i den stora gränssnittssviten körs med reducerad rörelse.

**Verifieringsgräns:** nätverksnavigering är blockerad i utvecklingsmiljön. Här används därför `LUNCH_IN_MEMORY=1`, riktiga HTML/CSS-vyer och den riktiga lokala animationsreserven, men mockad hämtning/lagring och sammanfogad JavaScript i stället för HTTP/ES-moduler. Web Audio kunde startas i Chromium; akustisk ljudkvalitet är inte lyssningstestad. Riktig HTTP-omladdning/localStorage, Motion via CDN, Safari/Firefox och en publicerad Pages-sajt är inte verifierade av dessa körningar.

Den befintliga `data/restaurants.json` och publiceringskonfigurationen ändras inte av den här funktionen.
