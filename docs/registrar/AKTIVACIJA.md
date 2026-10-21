# e-Matica i Školska referada — aktivacija

Nadogradnja koristi postojeće aplikacije i isti Supabase projekt. Referada ostaje dio repozitorija e-Dnevnika; e-Matica koristi postojeći zasebni repozitorij. Nisu promijenjeni četveroznamenkasti PIN, TOTP, postavke autentifikatora ni način provjere referadske sesije.

## Baza — jedan korak

Otvoriti **postojeći Supabase projekt → SQL Editor → New query**. Kopirati cijeli sadržaj datoteke [AKTIVACIJA-EMATICA-REFERADA.sql](../AKTIVACIJA-EMATICA-REFERADA.sql) i odabrati **Run**. Pokrenuti jednom. Datoteka obuhvaća migracije `20261020000003`–`20261020000014` u jednoj transakciji: greška poništava primjenu cijele nadogradnje.

Preduvjet su već postojeće e-Matica tablice/RPC-ovi te ranije aktivirana roditeljska/referadska shema (`AKTIVACIJA-RODITELJI-REFERADA.sql`). Nova datoteka ne instalira ponovno stari sustav, ne briše podatke i ne stvara nove učenike ili Auth račune. Ako je dio migracija već ručno primijenjen, ne pokretati ponovno cijelu datoteku; tada primijeniti samo preostale migracije redom. Greška zbog starih podataka/ograničenja zahtijeva provjeru tih podataka, ne brisanje zapisa.

Provjera u SQL Editoru:

```sql
SELECT public.registry_release();
```

Očekivana verzija: `2026.10.20.registry.1`, `qualified_sealing_connected: false`.

## Objavljivanje aplikacija

Najprije aktivirati zajednički SQL, zatim objaviti obje pripremljene grane kroz postojeće Vercel projekte. Nova Referada ima privremeni povratak na raniji ekran potvrda kada novi RPC `registrar_workspace` još nije dostupan. To ne znači da su nove funkcije aktivirane.

e-Dnevnik/Referada treba poslužiteljsku funkciju `api/registrar.ts` i rutu `/api/registrar/documents` iz `vercel.json`. Funkcija uključuje originalne PDF predloške, Noto font i postojeći školski pečat u svoj paket. Za oba frontend projekta potrebni su postojeći `VITE_SUPABASE_URL` i `VITE_SUPABASE_ANON_KEY`. **Samo na poslužitelju e-Dnevnika/Referade** potrebni su `SUPABASE_URL` i `SUPABASE_SERVICE_ROLE_KEY`. Administratorski ključ nikada ne smije imati prefiks `VITE_`.

Domena `referada.skolehr.xyz` ostaje na postojećem Vercel projektu Referade/e-Dnevnika. Nema školskih podputanja: školu određuje postojeća potvrđena korisnička sesija i dodjela referenta. e-Matica ostaje na svom projektu i domeni.

## Konfiguracija škole

1. U e-Matici provjeriti ustanovu, upise, predmete i razrede. Referada prikazuje stvarne razrede vezane uz školsku godinu; stari redci bez `school_year_id` prvo trebaju ispravnu poveznicu.
2. Ovlašteni administrator potvrđuje redoviti status upisa i upisuje osnovu provjere. Sustav ne zaključuje status samo iz pripadnosti razredu.
3. U Referadi → Postavke učitati izvorni prozirni PNG potpisa ovlaštene osobe i, po potrebi, pečata (do 2 MB). Potpis se ne preuzima s javne fotografije primjera. Izvorni plavi potpis poslan kao ugrađena slika nije dostupan kao datoteka u radnom okruženju; ne zamjenjuje se drugim potpisom istog imena. Za Srednju školu Glina već postoji školski pečat.
4. Administrator škole u e-Matici → ustanova → Svjedodžbe odobrava primjenu vizualnog pečata/potpisa. Promjena slike ili potpisnika opoziva prethodno odobrenje.
5. Unijeti pravila i obvezni prefiks urudžbenih brojeva ako su propisani. Brojevi se unose iz postupka škole, ne generiraju se izmišljeni službeni brojevi.
6. Posebno provjeriti vrstu ustanove (`ELEMENTARY`, `SECONDARY`, `HIGHER`), stvarni program i školsku/akademsku godinu. Studentski HŽPP ovjerava samo pripadajuće visoko učilište.

## Granice vanjskih usluga

- Kvalificirana usluga elektroničkog pečatiranja i e-Registar nisu povezani. Priprema pojedinačnih i grupnih zahtjeva radi; konačna pravno valjana ovjera i slanje u registar zahtijevaju stvarnu uslugu i dokaz izvršenja. Slikovni pečat nikad ne dobiva taj status.
- Izvornici ZET i subvencija izričito za 2026./2027. odbijaju drugu školsku godinu. Za novu godinu treba dodati novi službeni izvornik i njegovu mapu koordinata.
- Dva priručnika nastavka obrazovanja navode različite rokove (365 dana / dvije godine). Novi sustav čuva prethodno obrazovanje, nastavak i osnove odluke; ne uvodi automatsko odobravanje na temelju proizvoljnog zakonskog roka. Postojeći postupak plaćenog nastavka ostaje dostupan.
- OIB pretraga djelatnika je lokalna pretraga postojećih SkoleHR profila, nije pristup državnom registru.
- Izdani PDF-ovi su privatni. Ranije referadske potvrde ulaze u isti arhiv; njihov PDF može se rekonstruirati iz tada spremljenog snimka podataka i tako je označen. Učeničke samostalno generirane potvrde i njihovi verifikacijski kodovi ostaju u postojećem postupku.

Automatske i korisničke provjere opisane su u [TESTIRANJE.md](TESTIRANJE.md). Pregled funkcija i datoteka nalazi se u [NADOGRADNJA.md](NADOGRADNJA.md).
