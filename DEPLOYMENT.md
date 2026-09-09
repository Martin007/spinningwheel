# GitHub Pages

## Aktivera en gång

Öppna **Settings → Pages → Build and deployment** i repot och välj
**Source: GitHub Actions**. Använd det befintliga arbetsflödet; skapa inte ett
extra Jekyll- eller Node-byggflöde.

Kör sedan **Actions → Test and deploy lunchhjulet → Run workflow → master**.
Om ett körningsförsök redan har godkända tester men misslyckad Pages-konfiguration
räcker **Re-run failed jobs** efter att inställningen har ändrats.

Normal publicering behöver inga egna tokens eller hemligheter. `GITHUB_TOKEN`
kan publicera till en aktiverad Pages-webbplats, men kan inte göra den första
aktiveringen. Se [GitHubs dokumentation](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

Efter en lyckad körning visar jobbets **github-pages**-miljö webbplatsadressen.
Utan egen domän är adressen `https://martin007.github.io/spinningwheel/`.
En grön testkontroll innebär inte att webbplatsen är publicerad: även **deploy**
ska vara godkänd.

## Fortsatta uppdateringar

Varje push till `master` kör syntaxkontroll och tester, paketerar `index.html`,
`favicon.svg`, `src/` och `data/`, och publicerar till Pages. Pull requests kör
bara tester. Pågående publicering avbryts inte av en ny push.

Deploy-jobbet har `contents: read` för utcheckning, `pages: write` för publicering
och `id-token: write` för GitHubs autentisering. Jobbens rättigheter anges explicit.
Testerna körs fortfarande före publicering; ett riktigt kod- eller schemafel
stoppar arbetsflödet.

## Restauranglistan är redigerbar

Ändra **data/restaurants.json**, inte testfilen i `tests/fixtures/`.
Antalet restauranger, lunchdagar, namn och egenskaper är inte låsta till importen.
Grundlistan kontrolleras med samma JSON-validering som webbplatsen.

Importens gamla 121-posterstest använder nu en fast testfil. Därmed kan listan
kortas, utökas eller redigeras utan att importens historiska antal stoppar
publicering. Ogiltiga datum, dubblett-ID:n och fler än 200 poster underkänns
fortfarande. Testdata paketeras inte i Pages-artifakten.

```sh
npm run check
npm test
```

Det separata Chromium-testet `python3 tests/tripadvisor_browser.py` använder
också den fasta importfilen och mockad hämtning, lagring, animation och ljud.
Det verifierar inte verklig Pages-publicering eller ljuduppspelning.
