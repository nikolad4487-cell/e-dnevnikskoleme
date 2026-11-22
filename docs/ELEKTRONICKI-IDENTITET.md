# Podaci o elektroničkom identitetu

Nadogradnja koristi postojeće kreiranje korisnika (`/api/admin/create-user`) i postojeću provjeru administratorske ustanove. Za učenika ili nastavnika `electronicIdentity:true` zamjenjuje ručno unesenu lozinku kriptografski generiranom lozinkom od točno 8 alfanumeričkih znakova (veliko slovo, malo slovo, znamenka). Nakon stvaranja računa vraća dokument samo kad WebmailHR potvrdi dodjelu i aktivaciju. Ako je račun stvoren, ali povezivanje nije završeno, odgovor sadrži `createdProfileId`, objašnjenje i **ne sadrži lozinku ni uspjeh izdavanja**. Ne stvarati taj račun ponovno; dovršiti postojeću sinkronizaciju imenika i izdati novu lozinku postojećem računu.

`POST /api/admin/electronic-identity` prima `profileId`, `schoolId`, opcionalni `schoolYearId` i `operation:issue` (ili `preview` bez promjene). Koristi isti administratorski session guard i `userManagementScope` kao kreiranje korisnika: školski administrator ne može promijeniti račun druge škole ili zajednički račun više ustanova. Dokument se izdaje za matičnu ustanovu profila. Postojeći `/api/admin/reset-student-password` preusmjeren je u isti postupak; nema statične zadane lozinke niti `Math.random`.

- **Učenik:** lozinka se mijenja u izvornom Supabase Auth-u. WebmailHR ponovno provjerava isti izvorni Auth ID i lozinku kroz postojeći učenički adapter. Bez potvrde nema PDF-a ni uspjeha.
- **Nastavnik:** nova lozinka namijenjena je samo WebmailHR-u. WebmailHR sprema salted hash s postojećim serverskim pepperom. PIN, autentifikator i Auth lozinka postojećeg nastavnika u e-Dnevniku ne mijenjaju se. Prijava u e-Dnevnik ostaje postojeći PIN + autentifikator.

## Aktivacija

1. U zajedničkoj Supabase bazi primijeniti `migrations/20261120190240_electronic_identity_memberships.sql` **jednom** (isti SQL postoji u e-Matica repozitoriju; ne primjenjuju se dvije različite nadogradnje). Tablica sadrži samo rok, školsku godinu, status i kratki lease izdavanja; čitljiva lozinka nije stupac. RPC izdavanja dostupan je samo service_role; administrator ima ograničeni read-only pregled za svoju školu.
2. U WebmailHR PostgreSQL-u primijeniti `server/migrations/20261120-electronic-identity.sql` prije objave WebmailHR aplikacije. Nova instalacija koristi ažurirani `server/schema.sql`.
3. WebmailHR Production: postaviti `EDNEVNIK_IDENTITY_ISSUANCE_TOKEN` na zasebnu nasumičnu serversku tajnu (ne učenički login token). Potrebni su postojeći `EDNEVNIK_SUPABASE_PROJECT_ID`, učenički login URL/token i `STAFF_PIN_PEPPER`.
4. e-Dnevnik Production: `WEBMAILHR_IDENTITY_ISSUANCE_URL=https://www.webmailhr.com/api/integrations/ednevnik/electronic-identity` i `WEBMAILHR_IDENTITY_ISSUANCE_TOKEN` s istom tajnom kao u 3. Oba projekta ponovno objaviti nakon postavljanja konfiguracije.
5. Postojeći WebmailHR imenik mora imati `directory_identities(project,subject=Auth UUID)`, vezu škole preko `directory_schools`/`directory_school_memberships`, spreman osobni sandučić i dodjelu korisniku. Ne povezuje se samo po imenu ili proizvoljnoj e-mail adresi. Nedostaje li račun ili sandučić, pokrenuti postojeću sinkronizaciju imenika uz njezin zaseban ograničeni serverski ključ izvora i stvarni mail backend. Bridge ne stvara naslijepo sandučiće niti zaobilazi postojeću dodjelu.
6. Objaviti e-Maticu. U „Novi korisnik” za učenika/nastavnika uključeno je izdavanje identiteta; izvornik bez elektroničkog identiteta ostaje dostupan izričitim isključivanjem te opcije. Na postojećem korisniku/učeniku dostupno je novo izdavanje.

## Rok i privatnost

Rok je 31.10. završne godine dodijeljene školske godine. Trigger za aktivni učenički upis računa datum iz **nove godine upisa**, uključujući ponavljanje istog razreda. Isti upis ne produljuje rok ponovno; zakašnjela sinkronizacija stare godine ga ne skraćuje. Nova lozinka čuva postojeći rok. Nepovezani registry zapisi bez Auth korisnika ne dobivaju izmišljeni identitet.

Lease u bazi odbija paralelno izdavanje za isti profil/školu/ulogu. Završetak odbija promjenu upisa ili istek leasea. Ako mreža zakaže nakon promjene lozinke, prikazuje se moguća djelomična aktivacija, bez lažnog uspjeha ili PDF-a. Ponovno izdavanje generira novu lozinku; stara se ne čita ni rekonstruira.

Lozinka se vraća samo ovlaštenom administratoru u `no-store` odgovoru nakon potvrde WebmailHR-a. Frontend je drži samo u memoriji do pet minuta, čisti je pri skrivanju kartice i ne piše je u localStorage/sessionStorage. A4 PDF nastaje u administratorovu pregledniku; nema poslužiteljske arhive PDF-a s lozinkom. Povijest sadrži samo ID izdavanja, ulogu, rok, aktera i status. Preuzeti PDF namjerno sadrži lozinku i predaje se korisniku sigurnim putem.

Izgled slijedi priložene primjere. Cijela CARNET napomena zadržana je bez izmjena. Nastavnikov opis lozinke po korisnikovoj korekciji izričito navodi WebmailHR i odvojeni e-Dnevnik PIN/autentifikator. Koristi se stvarna dodijeljena oznaka s nastavkom; nedostajući datum rođenja, spol, OIB ili poštanska adresa zaustavljaju izdavanje, umjesto izmišljanja podataka.

## Provjere

e-Dnevnik: `npm test`, `npm run lint`, `npm run build`. PostgreSQL test uključuje ponavljača, ponovnu sinkronizaciju, zastarjeli upis, nepromijenjeni rok kod nove lozinke, lease, read-only ovlasti i sadržaj audita bez lozinke.

e-Matica: `npm test`, `npm run build`, `node tests/browser-electronic-identity.mjs`. Preglednik provjerava stvaranje nastavnika, izdavanje nove učeničke lozinke, pravi A4 download, privremeni prikaz bez browser storagea i izostanak PDF-a pri neuspjeloj aktivaciji. PDF je dodatno otvoren i vizualno pregledan; hrvatski tekst i cijela napomena provjereni su iz generiranog PDF-a.

WebmailHR: `npm run build`, `npm run test:identity` te `npm run test:native` uz izolirani `TEST_DATABASE_URL`. Svih devet native integracijskih provjera prošlo je na privremenom PostgreSQL 17: stvarna Webmail prijava učenika i nastavnika, otvaranje dodijeljenog sandučića i odbijanje tuđeg sandučića. Samo izvorni učenički Auth u tom testu zamijenjen je oglednim HTTP servisom. Provjeravaju se serverski token, ograničenja lozinke, hash umjesto čitljive nastavničke lozinke, izvorni učenički Auth i odbijanje nespremnog sandučića. Ovo su provjere s oglednim računima i servisima, ne tvrdnja o uspješnoj prijavi stvarnog korisnika u produkciji. Za takav prolaz potrebni su aktivirane migracije, serverska konfiguracija, dodijeljeni probni sandučići i pristupni podaci predani sigurnim putem.
