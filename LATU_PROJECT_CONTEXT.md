# Online Latu — projectcontext

Laatste controle: 24 september 2026

Dit bestand is het werkgeheugen voor wijzigingen aan deze site. Werk het bij
wanneer de architectuur, Firebase-regels, gebruikersfuncties of vaste afspraken
veranderen.

## 1. Wat is de site?

Online Latu is een statische browsergamesite: bezoekers openen een HTML-game en
kunnen meteen spelen zonder installatie. De site heeft een donkere, mobiele
vriendelijke stijl en is beschikbaar in Nederlands, Engels en Frans.

Belangrijke onderdelen:

- `index.html`: homepage, gamecatalogus, zoeken, categorieën, taalkeuze en
  Firebase-kaartstatistieken.
- `about.html`: uitleg over Online Latu.
- `legal.html` en `legal.css`: privacybeleid, gebruiksvoorwaarden en infromatie
  over cookies/lokale opslag.
- `page-i18n.js`: vertalingen voor `about.html` en `legal.html`.
- `firebase.js`: Firebase-initialisatie, Google-authenticatie, Firestore-statistieken.
- `firebase-ui.js`: login/logout, likes, plays en navigatie vanaf de homepage.
- `firebase-play.js`: play-telling op gamepagina's en overdracht via
  `sessionStorage`.
- `flappy-multiplayer.js`: realtime multiplayer voor Flappy Bird.
- `database.rules.json`: Firebase Realtime Database-regels voor Flappy-rooms.
- `firestore.rules`: Firestore-regels voor game-statistieken en likes.
- Alle echte HTML-pagina's bevatten vóór `</head>` de officiële Vercel Web
  Analytics-snippet voor statische HTML/JavaScript:
  `/_vercel/insights/script.js`. Gebruik geen Next.js-imports of npm-package.
- `save`: huidige handmatige publiceerworkflow:
  `git add .`, `git commit -m "Update"`, `git push`.

Er is geen package manager, buildproces of testframework in deze repository.
De site wordt als losse statische bestanden uitgevoerd/gehost.

## 2. Games in de catalogus

De gamebestanden en bijbehorende afbeeldingen staan in de root:

- 3D Shooter — `3d-shooter.html`
- Basketball Clicker — `BasketballClicker.html`
- Blackjack — `Blackjack.html`
- Chess — `chess.html`
- Crossy Road — `crossyroad.html`
- Drift — `drift.html`
- Flappy Bird — `FlappyBird.html`
- Geometry Dash — `geometrydash.html`
- Klik — `klik.html`
- Latu Dino — `LatuDino.html`
- Maze — `maze.html`
- Police Runner — `policeRunner.html` en `Police_runner.html` bestaan allebei;
  controleer vóór wijzigingen welke link bedoeld is.
- Pulse Runner — `Pulse-Runner.html`
- Shooter Game — `shootergame.html`
- Snake — `snake.html`
- Stack — `stack.html`
- Stickman Hook — `Stickmanhook.html`
- Sunny Meadow Adventure — `Sunny_Meadow_Adventure.html`
- Tetris — `Tetris.html`
- Tower Defense — `towerdefense.html`
- Voxelcraft — `voxelcraft.html`

De bestandsnamen zijn niet overal consequent qua hoofdletters, koppeltekens en
onderstreping. Links en Firebase-game-ID's moeten daarom exact blijven werken.

## 3. Firebase en gegevensmodel

Firebase-project: `latu-55675`, regio voor Realtime Database:
`europe-west1`. De webconfiguratie staat in `firebase.js`; een Firebase web API
key is op zichzelf geen geheim, maar de database- en Firestore-regels zijn wel
veiligheidskritisch.

Authenticatie:

- Google-login via Firebase Auth.
- Auth-persistentie is `browserLocalPersistence`.
- Likes en plays werken alleen voor ingelogde gebruikers.
- Publieke bezoekers mogen statistieken lezen, maar niet schrijven.

Firestore-documenten:

- `gameStats/{gameId}` met `likesCount` en `playsCount`.
- `gameLikes/{gameId}/users/{uid}` met `createdAt`.
- Een like maakt ook de counter transactioneel hoger; verwijderen verlaagt hem
  met minimaal nul.
- Een play wordt transactioneel met één verhoogd.

Play-flow:

1. Op de homepage wacht de klikhandler op `recordPlay()`.
2. Bij succes zet de homepage een tijdelijke sleutel in `sessionStorage`.
3. De gamepagina consumeert die sleutel zodat dezelfde opening niet dubbel telt.
4. Rechtstreeks openen of een echte nieuwe sessie kan op de gamepagina alsnog
   tellen.
5. Niet-ingelogde gebruikers leveren geen play-statistiek op.

Realtime Database voor Flappy multiplayer:

- Pad: `flappyRooms/{roomId}`.
- Een room heeft minstens `status` en `players`.
- Een speler heeft onder andere `connected`, `alive`, `y` en `score`; daarnaast
  worden `ready`, `live`, `angle` en tijdstempels gebruikt.
- Roomstatussen: `waiting`, `countdown`, `playing`, `finished`.
- Presence wordt bijgewerkt met `onDisconnect`.
- Roomcodes zijn zes tekens lang en gebruiken geen verwarrende tekens.
- De status `playing` is de betrouwbare starttrigger; server timestamps kunnen
  in de eerste snapshot nog `null` zijn.

## 4. Regels die altijd gevolgd moeten worden

- Behoud de bestaande statische aanpak; voeg geen framework of buildstap toe
  zonder dat dit expliciet wordt afgesproken.
- Wijzig Firebase-regels alleen bewust en controleer daarna login, stats, likes,
  multiplayer-room aanmaken, joinen, verlaten en disconnectgedrag.
- Maak counters niet client-side vrij schrijfbaar. Firestore-mutaties moeten
  transactioneel blijven en beperkt zijn tot de bedoelde velden.
- Gebruik voor een game-ID de HTML-bestandsnaam zonder `.html`, lowercase. Let op
  dubbele of historisch afwijkende bestandsnamen.
- Houd interactieve elementen toegankelijk: echte knoppen voor acties,
  `aria-label`/focus states en bruikbare mobiele layout.
- Houd NL/EN/FR bij wanneer zichtbare site- of legalteksten veranderen.
- Gebruik `localStorage` alleen voor lokale voorkeuren/scores/progressie en
  `sessionStorage` alleen voor tijdelijke navigatie-overdracht.
- Voeg geen tracking, advertenties, analytics, sociale plugins of andere
  niet-noodzakelijke externe diensten toe zonder het privacybeleid, toestemming
  en de technische implementatie tegelijk bij te werken. Vercel Web Analytics is
  nu toegevoegd; controleer bij wijzigingen de Vercel-privacydocumentatie en de
  tekst op de legalpagina.
- Controleer rechten/licenties van gamecode, afbeeldingen, muziek, fonts en CDN's
  vóór publicatie.
- Bewaar geen echte wachtwoorden, tokens of andere geheime servercredentials in
  de repository.
- Beperk wijzigingen tot de gevraagde scope. Controleer vóór commit altijd
  `git status` en bekijk de diff.
- Publiceer pas na een korte handmatige browsercheck; gebruik daarna de commando's
  uit `save` alleen als de wijziging klaar is.

## 5. Bekende problemen en huidige oplossingen

### Encoding van speciale tekens

In meerdere bestanden verschijnt tekst als `â€”`, `âœ¦`, `â™¥` of `Â©` in plaats
van het bedoelde Unicode-teken. Dit is zichtbaar in delen van de huidige bron,
waaronder Firebase UI, gameberichten en legal/footer-teksten. Oplossing:
controleer dat bestanden als UTF-8 worden opgeslagen en dat de webserver een
correcte UTF-8 charset levert. Herstel dit gecontroleerd per bestand; verander
niet blind alle teksten omdat sommige bronweergaven door de terminalencoding
vertekend kunnen zijn.

### Legaltekst en implementatie

De legalpagina is op 24 september 2026 aangepast aan de huidige werking: Google-
login via Firebase Auth, Firestore voor likes/plays en Realtime Database voor
Flappy multiplayer. Bij nieuwe Firebase-functies moet deze tekst opnieuw worden
gecontroleerd, inclusief de verwerkingsdoeleinden en bewaartermijnen.

### Multiplayer-status en reconnects

Eerdere problemen zaten rond joinen, wachten op de tweede speler en starten
terwijl `startedAt` nog niet beschikbaar was. De huidige oplossing gebruikt de
roomstatus als betrouwbare trigger, `onDisconnect` voor presence, `live` om een
beginwaarde van `alive: false` niet als verlies te interpreteren, en transacties
voor het publiceren van het eindresultaat. Test beide spelers in aparte
browserprofielen en test ook refresh, verlaten en opnieuw joinen.

### Dubbel tellen van plays

De homepage en gamepagina kunnen allebei een play zien. De huidige oplossing is
een korte `sessionStorage`-handoff (`latu-play-counted:{gameId}`) plus een
per-activatie vlag op de gamepagina. Test normale klik, Ctrl/Cmd-klik, directe
URL, back/forward-cache en een echte nieuwe ronde.

### Verschillende bestandsnaamstijlen

De games gebruiken gemengde casing en naamgeving; er zijn ook twee Police Runner
bestanden. Niet hernoemen zonder alle links, hostinggedrag en Firebase-ID's te
controleren. Op sommige hostingplatformen zijn hoofdletters in URL's relevant.

## 6. Handmatige controle vóór een wijziging wordt afgerond

- Homepage opent zonder console-errors.
- Zoeken, categorieën, taalkeuze en mobiele header werken.
- About en Legal laden in NL, EN en FR; taalvoorkeur blijft bewaard.
- Google inloggen/uitloggen werkt.
- Een ingelogde gebruiker ziet stats, kan één like toevoegen en weer verwijderen.
- Een game-opening telt niet dubbel.
- Flappy multiplayer werkt met twee aparte sessies: create, join, ready,
  countdown, spelen, winnen/verliezen, verlaten en reconnect.
- Geen onbedoelde wijziging in Firebase-regels of juridische teksten.
- Iedere echte HTML-pagina heeft precies één Vercel Web Analytics-integratie
  direct vóór `</head>`.
- `git diff` en `git status` zijn gecontroleerd vóór `save`/commit/push.

## 7. Openstaande beslissingen

- Controleren of de aangepaste legal/privacytekst juridisch volledig is voor de
  concrete hosting-, Firebase-, Google- en Vercel-configuratie, inclusief de
  inmiddels toegevoegde Vercel Web Analytics.
- Unicode/UTF-8-problemen definitief nalopen in browser én bronbestanden.
- Beslissen of beide Police Runner-HTML-bestanden nodig zijn.
- Bepalen of game-statistieken ook voor anonieme bezoekers moeten tellen.
- Realtime Database-regels aanscherpen: momenteel zijn lezen en schrijven voor
  Flappy-rooms zeer ruim toegestaan; dat is functioneel maar verdient een
  security review voordat multiplayer breed wordt gebruikt.
