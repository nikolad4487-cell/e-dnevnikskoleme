# Sigurnosne kopije i oporavak

Pripremljen je GitHub Actions postupak **Encrypted database and document backup**. Kopira PostgreSQL bazu putem `pg_dump` i sadržaj svih Storage spremišta (uključujući privatne ispričnice i izdane dokumente). Popis datoteka, SHA-256 i izvornik baze arhiviraju se zajedno. Pohranjuje se samo AES-256-GCM šifriran artefakt; ključ nije u repozitoriju niti u kopiji.

## Jednokratna konfiguracija vlasnika projekta

U GitHub repozitoriju e-Dnevnika → Settings → Secrets and variables → Actions dodati tajne:

- `BACKUP_DATABASE_URL`: stvarna PostgreSQL veza za `pg_dump`, ne Supabase HTTP URL. Koristiti odgovarajući direct/session pooler priključak, ne transaction pooler.
- `BACKUP_SUPABASE_URL`: URL istog Supabase projekta.
- `BACKUP_SUPABASE_SERVICE_ROLE_KEY`: poslužiteljski ključ tog projekta; nikada ga ne unositi u frontend ili chat.
- `BACKUP_ENCRYPTION_KEY`: 32 nasumična bajta zapisana kao 64 heksadecimalna znaka. Može se generirati s `openssl rand -hex 32`. Zasebnu kopiju ključa čuvati u sigurnom spremištu zaporki; bez njega nema oporavka.

Actions → Encrypted database and document backup → Run workflow. Tek nakon uspješne prve kopije dodati Repository variable `BACKUP_ENABLED=true`. Tada se pokreće dnevno u 01:15 UTC. Zadano čuvanje je 14 dana; GitHub plan može ograničiti čuvanje i prostor. Čuvati i dodatnu zasebnu arhivu prema politici škole. Promjena ključa ne otključava starije kopije.

Bez te konfiguracije automatsko kopiranje nije uključeno. U ovom radnom okruženju nisu dostupni PostgreSQL pristup ni upravljanje Supabase planom/backup postavkama. Status Supabase dnevnih kopija i PITR-a zato nije potvrđen; vlasnik treba provjeriti Dashboard → Database → Backups. Ovaj dodatni postupak ne zamjenjuje potvrdu oporavka kod pružatelja.

## Što provjerava postupak

Pogreška pri čitanju baze, popisu ili preuzimanju dokumenta prekida kopiranje. Nema tihog preskakanja datoteka. Provjerava se format SQL kopije, SHA-256 privatnih datoteka i identičnost arhive nakon dešifriranja. Storage postupak podržava do 64 MiB po datoteci i 1 GiB ukupno; prekoračenje zaustavlja kopiju i zahtijeva prilagodbu postupka. PostgreSQL alat je verzije 17; projekt novije glavne verzije zahtijeva usklađeni alat.

## Stvarno provedena lokalna provjera

`node --test tests/backup-restore.test.cjs` napravio je PostgreSQL kopiju ogledne baze, šifrirao je, dešifrirao i otvorio kao novu izoliranu bazu te usporedio sadržaj i hrvatske znakove. Privatni ogledni PDF prošao je kopiranje i usporedbu bajtova. Provjereno je odbijanje pogrešnog ključa, promijenjene kopije i oštećenog/nedostupnog dokumenta. To nije provjera vraćanja žive Supabase baze.

## Proba oporavka cjelovitog sustava

Koristiti zaseban, prazan Supabase projekt istih verzija i ekstenzija. Ne koristiti postojeći školski projekt kao odredište. Preuzeti šifrirani artefakt iz Actionsa i ključ učitati samo u lokalnu varijablu `BACKUP_ENCRYPTION_KEY`.

1. `node scripts/backup/archive.mjs decrypt skolehr-backup.enc snapshot.tar`
2. Raspakirati vlastitu arhivu u novi prazan direktorij: `mkdir restore-test` pa `tar -xf snapshot.tar -C restore-test`.
3. `node scripts/backup/verify.mjs restore-test` mora završiti uspješno.
4. U izoliranom Supabaseu pripremiti popis obnove: `pg_restore --list restore-test/database.dump > restore-test/restore.list`. U tom popisu retke **TABLE DATA storage buckets** i **TABLE DATA storage objects** označiti kao komentar početnim znakom `;`. Izvorna kopija i dalje sadrži te metapodatke; pri ovoj probi API za Storage ponovno stvara metapodatke za stvarno prenesene datoteke i njihove nove verzije. U suprotnom bi sama obnova metapodataka prikazivala datoteke čiji bajtovi nisu preneseni.
5. Isključivo u prazan izolirani projekt vratiti bazu s `pg_restore --clean --if-exists --exit-on-error --no-owner --use-list=restore-test/restore.list --dbname="$RESTORE_TARGET_DATABASE_URL" restore-test/database.dump`. Ovaj korak uklanja/ponovno stvara zapise u odredištu. `RESTORE_TARGET_DATABASE_URL` mora biti zasebni projekt za probu, nikada aktivna školska baza. Supabase sheme, uloge i ekstenzije moraju odgovarati izvorniku; pogreške ne ignorirati. ACL/grantovi ostaju u kopiji radi očuvanja ovlasti.
6. Za zasebni projekt postaviti `RESTORE_SUPABASE_URL`, njegov `RESTORE_SUPABASE_SERVICE_ROLE_KEY` i `RESTORE_CONFIRM_PROJECT` na točan hostname odredišnog projekta. Pokrenuti `node scripts/backup/restore-storage.mjs restore-test`. Alat odbija izvorni projekt, neprazna odredišna spremišta, prepisivanje i neispravne hash vrijednosti. Privatnost, dopuštene vrste i ograničenja veličine spremišta čuvaju se. Putanje i sadržaj dokumenata ostaju isti; Storage ID-jevi/verzije i tehnički vlasnik nastaju novim API prijenosom. Posebne prilagođene politike koje ovise o `storage.objects.owner` zahtijevaju zasebnu provjeru vlasništva u probnom projektu.
7. Provjeriti broj upisa/ocjena/dokumenata, povezanost učenika i škole, probnu prijavu zasebnim testnim računom i preuzimanje privatnog dokumenta. Ne slati obavijesti ni izdavati stvarne dokumente iz probnog projekta. Evidentirati datum, artefakt, trajanje i rezultat probe.

Nakon provjere ukloniti lokalne dešifrirane datoteke i izolirano probno okruženje prema politici čuvanja. Postupak nikada sam ne vraća kopiju preko aktivnog sustava.
