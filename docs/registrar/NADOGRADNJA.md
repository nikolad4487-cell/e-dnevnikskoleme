# e-Matica i Školska referada — pregled nadogradnje

Implementacija je u postojećim aplikacijama: Referada u `e-dnevnikskoleme`, e-Matica u `eskolehr-ematica`. Obje koriste istu matičnu evidenciju i Supabase. Aktivacija baze i objava opisane su u [AKTIVACIJA.md](AKTIVACIJA.md).

## 1. e-Matica

- Devet kartica ustanove, povijest adresa, kontakti, infrastruktura, temeljna dokumentacija, postojeći programi i djelatnici, fakultativni predmeti i postavke svjedodžbi. Službeni identitet ustanove uređuje glavni administrator.
- Evidencija djelatnika po ustanovi: datirani ugovori i radna mjesta, poveznica ugovora, stručna sprema i zvanja, predmeti, napredovanja, stručni/pedagoški ispiti i županijsko vijeće. Čuva se povijest i provjerava imenovanje ravnatelja. Postojeći profil djelatnika može se povezati s drugom školom bez novog Auth računa.
- Dodjela i opoziv administratorskih prava ustanove kroz provjereni postupak. Imenovanje ovlaštenog administratora i daljnja dodjela odvojeni su od globalnih prava. Izbor aktivne ustanove prikazuje samo dopuštene škole.
- Stvarni upisi i obrazovna povijest, potvrda redovitog statusa i osnove provjere, prethodno obrazovanje, nastavak i izvannastavne aktivnosti. Promjena programa zatvara prethodno razdoblje i stvara novi upis iste osobe. Paralelni upis ograničen je na umjetničke programe; cilj može biti druga ustanova za koju korisnik ima ovlasti. Matični program unutar ustanove bira se zasebno.
- Kombinirani razredi, odgojno-obrazovne skupine, jezik/model nastave i skupine nastavka obrazovanja. Grupni upis koristi postojeću e-Matica/e-Dnevnik poveznicu. Prijelaz u viši razred provjerava stvarne predmete, pozitivne zaključne ocjene, novu kronološki kasniju godinu i završni status razreda.
- Predmetni, razredni, razlikovni, dopunski i popravni ispiti te dopunski rad imaju stvarni predmet, datum, ocjenu i potrebne prethodne uvjete. Postojeće zaključne ocjene i postupci kraja godine ostaju izvor podataka. PDF svjedodžbe koristi Noto za hrvatske znakove, ne dopunjuje nepoznati uspjeh/vladanje/izostanke niti pogađa spol iz imena; veliki popisi predmeta imaju prilog umjesto gubitka predmeta.
- Pojedinačna i grupna priprema zahtjeva za elektroničko pečatiranje, evidencija stvarnog statusa i zaštita od ponovljenog otvorenog zahtjeva. Kvalificirana vanjska usluga nije povezana i ne simulira se.
- Proširena nastavna/druga/praktična zaduženja sa satnicom, programom, grupama i brojem polaznika iz stvarnih upisa. Filtri godine, statusa i datuma te CSV/XLSX izvozi.
- Zajednička evidencija prijevoza: relacije, kilometraža u jednom smjeru, prijevoznici, cijena, subvencijska kategorija, dokaz posebnog prava, valjanost, praksa/dom/poseban prijevoz. Izdavanje obrazaca vodi Referada.
- Dva izvorna obrasca imenovanja administratora vrtića dostupna su samo za predškolske ustanove.

## 2. Školska referada

- Godina → razred iz baze → jedna od deset aktivnosti → osoba → priprema → pregled svih stranica → izdavanje → arhiva. Postavke, zahtjevi, zapisnik i arhiva dostupni su bez razreda.
- Potvrde redovitog školovanja s odabranom svrhom, pravilnim rodom i posebnim tekstom za visoko učilište. Potvrđeni status i podaci dolaze iz e-Matice.
- Sedam originalnih PDF predložaka: ZET redoviti i opći, HŽPP učenici i studenti, 75% te dvije različite 100% potvrde. Izvornici su byte-identični dostavljenim dokumentima; njihov SHA256 nalazi se u `public/document-templates/manifest.json`. Duplicirani ZET nije kopiran, a kvalitetniji digitalni HŽPP učenici koristi se umjesto lošijeg skena.
- Izvorna interaktivna ZET polja; precizni tekst, kućice i oznake na izvornim stranicama ostalih obrazaca. Pregled u canvasu prikazuje sve stranice i ne ovisi o PDF dodatku preglednika.
- Svaki obrazac ima zasebne dopuštene koordinate školske ovjere i zaštićena područja. Opći ZET nema školsku ovjeru. ZET grad/općina i vlastiti potpis, HŽPP službeni dio i vlastiti potpis te roditelj/prijevoznici/CZSS/županija na subvencijama ostaju neovjereni od škole. Posebno pravo na subvenciju ne odobrava se automatski.
- Studentski HŽPP koristi studentski profil i akademsku godinu vlastitog visokog učilišta uz potvrđen redoviti upis; srednja škola taj obrazac ne može ovjeriti.
- Prijepisi stvarnih tekućih/zaključnih ocjena više godina, uključujući zaključne ocjene po upisu, s odabranom svrhom. Bez ocjena nema izmišljenog prijepisa.
- Zaprimanje postojećeg završnog rada s ručnim službenim urudžbenim brojem, datumima, klasom, napomenom i statusom. Ažurira postojeći `final_thesis`; broj je jedinstven u ustanovi/godini i provjerava propisani prefiks. Administrativni predmeti i zajednički zapisnik.
- Privatna arhiva, pregled, pretraga, filtri godine/statusa i poništenje s razlogom. Snimak matičnih podataka, izdavatelj, osoba ovjere i SHA256 vezani su uz PDF. Izmjene matičnih podataka nakon pregleda zahtijevaju novu pripremu prije izdavanja.
- Odvojeni statusi nacrta, pripremljenog i izdanog dokumenta te grafičke ovjere. Vizualni pečat/potpis ne predstavlja kvalificirano elektroničko pečatiranje.

## 3. Promijenjene datoteke

Referada/e-Dnevnik:

- `src/pages/registrar/RegistrarPortal.tsx`, sačuvani `LegacyRegistrarPortal.tsx`, novi `PdfPreview.tsx`, `RegistrarSettings.tsx`, `RegistryLog.tsx`, `registrarClient.ts`.
- `api/registrar.ts`; `server/registrar/buildDocument.ts`, `templateCatalog.ts`, `monthCoordinates.ts`.
- `public/document-templates/` — sedam originalnih PDF-ova i provjerljivi manifest; `src/index.css`, `vercel.json`, `package.json`, `package-lock.json`.
- Dvanaest SQL migracija `20261020000003`–`20261020000014`, `scripts/build-registry-activation.mjs` i generirani `docs/AKTIVACIJA-EMATICA-REFERADA.sql`.
- Novi testovi `registrar-documents.test.cjs`, `registry-administration.test.cjs`, `registrar-api.test.ts`, `registrar-pdf.test.ts`, `browser-registrar.mjs` i SQL fixturei; dokumentacija u `docs/registrar/`.

U e-Matici:

- `src/App.jsx`, `src/styles.css`, `package.json`, `package-lock.json`.
- `src/components/registry/`: `RegistryEditors`, `StudentEducationEditor`, `ProgramChange`, `ClassDetailsEditor`, `SchoolPermissions`, `ActiveSchoolSwitcher`, `ControlledYearTransition`, `BulkEnrollment`, `CertificateSeals`, `AttestationAuthorization`, `DocumentArchive`.
- `src/lib/exportData.mjs`, `public/fonts/` (Noto i licenca), `public/administration-templates/` (dva originalna DOCX-a).
- `tests/export-data.test.mjs`, `certificate-pdf.test.mjs`, `browser-registry.mjs`, dokumentacija `docs/`.

## 4–7. Aktivacija, stanje funkcija i provjera

Kod, izolirani DB/API/PDF testovi i pregledničke provjere dostupni su za pregled. **To nije potvrda primjene migracije ili objave u produkciju.** Nadogradnja zahtijeva jednokratnu primjenu pripremljenog SQL-a, objavu obje aplikacije te stvarne podatke/upise i ovlasti. Grafička ovjera dodatno traži izvorni potpis i odobrenje škole; kvalificirana ovjera zasebnu vanjsku uslugu.

Detaljni koraci konfiguracije i preostale vanjske ovisnosti su u [AKTIVACIJA.md](AKTIVACIJA.md), a pokretanje testova i matrica svih 20 korisničkih provjera u [TESTIRANJE.md](TESTIRANJE.md). Popis pregledanih priručnika i odluke o njihovim pravilima nalaze se u [IZVORNICI.md](IZVORNICI.md) i `izvornici-manifest.json`.
