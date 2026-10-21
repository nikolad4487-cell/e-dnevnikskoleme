# Provjera nadogradnje

Automatske provjere koriste izmišljene osobe i izolirani PostgreSQL (PGlite), a ne upisuju u razvojnu ili produkcijsku bazu. Shema testova prati stvarni Supabase REST katalog iz pregleda projekta. To ne zamjenjuje završnu provjeru nakon primjene migracije na stvarnoj bazi s njezinim dodatnim ograničenjima i starim podacima.

## Pokretanje

U e-Dnevniku:

```sh
npm ci
npm run lint
npm run build
node --test tests/*.test.cjs
npx tsx --test tests/*.test.ts
```

PDF provjera koristi i Python s paketom PyMuPDF (`python -m pip install pymupdf`). U e-Matici: `npm ci`, `npm run build`, `node --test tests/*.test.mjs`.

`tests/registrar-documents.test.cjs` izvršava točnu zajedničku aktivacijsku SQL datoteku u jednoj transakciji i provjerava podudaranje s izvornim migracijama. Provjerava pogled `enrollment_final_grades` i kompatibilnost s varijantom tablice te povrat cijele transakcije kod pogreške okidača nad pogledom. Također provjerava da ista zaključna ocjena iz tablice i pogleda nije dvaput navedena. Učitava neizmijenjeni postojeći mehanizam povezivanja upisa iz e-Matice i provjerava grupni upis bez nove osobe/računa. `tests/registry-administration.test.cjs` provjerava ustanove, ugovore, povijest ravnatelja i granice ovlasti. `tests/registrar-api.test.ts` provjerava poslužiteljski pristup, potvrđenu sesiju, privatnost, školu i SHA256. `tests/registrar-pdf.test.ts` provjerava izvorne stranice, hrvatske znakove, profile i uspoređuje slike zaštićenih područja. Dopušta isključivo do 2/255 razlike po kanalu zbog kompozicije prozirnih PNG slika u PDF renderiranju.

Preglednički testovi koriste `playwright-core` i instalirani Chromium. Nakon izgradnje i PDF testa pokrenuti `CHROMIUM_PATH=/putanja/do/chromium npm run test:browser` u svakom repozitoriju (zadano `/usr/bin/chromium`). Snimke i izvješća pišu se u privremene direktorije `skolehr-browser-registrar` i `skolehr-browser-ematica`; ne koriste stvarne račune ni produkcijsku bazu.

## Korisničke provjere nakon aktivacije

Koristiti testne račune i provjerene testne upise dvije ustanove. Ne mijenjati stvarne ocjene samo radi testa.

| Zahtjev | Automatska provjera / koraci u aplikaciji |
|---|---|
| 1. Samo razredi aktivne škole | SQL: workspace vraća samo dodijeljenu školu; promijeniti godinu i provjeriti razrede iz baze. |
| 2. Točni osobni podaci | SQL: odabrani registry/upis/profil; usporediti prikaz s matičnim zapisom. |
| 3. ZET podaci | PDF: izvorna interaktivna polja, OIB i datum u kućicama; provjeriti duga imena u pregledu. |
| 4. Samo škola/fakultet | PDF: dopuštene koordinate pečata i potpisa po pojedinom predlošku. |
| 5. Grad/općina ostaje netaknut | PDF: usporedba zaštićenog područja s izvornikom. |
| 6. Podnositelj potpisuje sam | PDF: zaštićeno područje vlastitog potpisa. |
| 7. HŽPP učenički profil | PDF: profil prema vrsti ustanove; ručno usporediti oznaku osnovne/srednje škole. |
| 8. Studentski profil i godina | SQL: zabrana srednjoj školi; PDF: studentski predložak i godina bez oznake razreda. |
| 9. HŽPP službeni dio prazan | PDF: usporedba donjeg dijela druge stranice. |
| 10–13. Subvencije: škola samo svoj dio | PDF: tri zasebne mape; roditelj, prijevoznici i nadležno tijelo uspoređuju se s izvornikom. |
| 14. Evidencija izdanog dokumenta | SQL: priprema → PDF/hash/pregled → izdavanje → arhiva → poništenje s razlogom. |
| 15. Stvarne ocjene | SQL: zaključne i ocjene po upisu, zabrana praznog prijepisa; usporediti prikaz s izvornim ocjenama. |
| 16. Urudžbeni broj završnog rada | SQL: ažurira postojeći rad, ne stvara novi; ponavljanje/kolizija odbijeni. |
| 17. Druga ustanova nije dostupna | SQL/RLS i API: tuđi razred, škola i dokument odbijeni. |
| 18. Izvorni raspored i sve stranice | PDF: broj stranica; izvornici SHA256; pregledati sve stranice prije izdavanja. |
| 19. Privatno preuzimanje | API: bez prijave/provjere nema pristupa; storage nema javnog čitanja dokumenata. |
| 20. Promjena aktivne ustanove | SQL: ovlašteni odabir mijenja vidljive zapise; neovlaštena škola odbijena. |

Preglednik je dodatno provjeren na sintetičkim podacima: tok referade do izdavanja, prikaz svih stranica PDF-a u canvasu, postojeći završni rad i ručni urudžbeni broj, arhiva, čišćenje odabira pri promjeni godine te širine 1280, 1366, 1920 i 390 px. Ovo nije prijava u produkciju stvarnim korisničkim PIN-om/TOTP-om.

## Redoslijed prihvatne provjere

1. U e-Matici otvoriti ustanovu i provjeriti svih devet kartica, povijest adresa i djelatnika te korisnička prava.
2. Potvrditi redoviti status stvarno provjerenog testnog upisa i osnovu provjere. Provjeriti obrazovnu povijest, ispite, prijevoz i zaduženja.
3. U referadi zadržati uobičajenu PIN/TOTP prijavu, odabrati godinu, razred i učenika. Za svaki od sedam originalnih obrazaca pregledati obje stranice.
4. Najprije pripremiti dokument bez grafičke ovjere. Potom priložiti ovlašteni prozirni PNG potpis/pečat i odobriti njihovu primjenu u e-Matici; ponoviti pregled. Opći ZET ostaje bez školske ovjere.
5. Izdati testni dokument, otvoriti ga iz arhive, provjeriti filtar te ga poništiti s razlogom. Izmjena matičnih podataka nakon pregleda zahtijeva novu pripremu PDF-a.
6. Ponoviti s drugom školom i potvrditi da prvi dokument nije dostupan. Za studenta koristiti samo vlastito visoko učilište i njegov potvrđeni upis.
7. Provjeriti prijepis više godina, zaprimanje već postojećeg završnog rada te CSV/XLSX. Priprema za elektronički pečat ne smije prikazati uspješno kvalificirano pečatiranje bez povezane usluge.

## Znakovi u kućicama PDF-a

`tests/registrar-character-boxes.test.ts` izrađuje oba HŽPP i oba ZET obrasca te iz nastalog PDF-a provjerava položaj svakoga znaka prema stvarnim kućicama izvornika. Provjerava ime/prezime s hrvatskim znakovima i Unicode normalizacijom, OIB i broj iskaznice s vodećim nulama, adresu, mjesto, poštanski broj, državu, MojZET podatke, telefon gdje postoje kućice te datum i školsku/akademsku godinu. Razmak troši praznu kućicu; datum ima osam znamenaka DDMMYYYY i prati razmaknute skupine dana/mjeseca/godine na HŽPP-u. Predugi unos vraća jasnu pogrešku, bez odsijecanja podataka. Područja drugih potpisnika ostaju prazna.

Doradu primjenjuje poslužitelj pri novoj pripremi PDF-a. Ranije izdane i arhivirane datoteke ne prepravljaju se. Za pregled ispravljenog rasporeda ponovno pripremiti dokument u Referadi; nova SQL migracija nije potrebna.
