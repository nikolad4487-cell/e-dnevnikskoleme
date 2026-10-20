# Roditeljski portal i Školska referada

## Pripremljeno u ovoj verziji

- Razrednik i zamjenik povezuju postojeći roditeljski račun s učenikom. Roditelj bira samo povezanu djecu. Ocjene i zaključne ocjene roditelju postaju vidljive nakon 48 sati.
- Roditelj podnosi, uređuje ili povlači neobrađen zahtjev za opravdavanje postojećih izostanaka. Može odabrati više dana i zajednički ili pojedinačni razlog. Za više od tri uzastopna nastavna radna dana potreban je prilog. Prilozi su privatni.
- Razrednik ili zamjenik obrađuje zahtjev; prihvaćeni statusi izostanaka i povijest zahtjeva mijenjaju se u jednoj transakciji. Obrađeni zahtjev nije moguće naknadno prepisati. Roditelj vidi napomenu nastavnika.
- Obavijesti se spremaju u bazu i otvaraju odgovarajuće dijete i razred.
- Evidentiraju se izdane potvrde. Učenik i roditelj dobivaju potvrdu s provjerljivim kodovima. Referada i ovlašteni školski administrator izdaju potvrdu s pečatom i potpisom, bez tablice kodova. Provjera kodova ne otkriva osobne podatke učenika.
- Tekst potvrde razlikuje učenika i učenicu. Unicode fontovi isporučuju se uz aplikaciju. Pečat na potvrdi širok je 34 mm; potpis se prilagođava okviru do 52 × 13 mm.
- Pečat je dodan i u PDF izvještaja te izvatka matične knjige. To ne predstavlja potpun katalog svih službenih obrazaca iz priručnika.
- Školska referada ima zasebno sučelje na korijenskoj adresi domene. Namjenski račun pripada jednoj školi. Ne bira se škola ni adresa škole. Upiti i izdavanje potvrda provjeravaju školu u bazi; ukidanje dodjele vrijedi odmah.
- Prijava referade koristi PIN i stvarni kod autentifikatora. Provjera drugog faktora bilježi se na poslužitelju za prijavljenu sesiju; izravna Supabase prijava lozinkom ne otvara podatke referade.

## Redoslijed aktivacije

1. Prije objave koda u Supabase SQL Editoru pokrenuti cijelu datoteku `AKTIVACIJA-RODITELJI-REFERADA.sql` jednom. Sadržaj je jedna transakcija: u slučaju pogreške ne nastavljati s objavom. Skripta stvara strukturu i pravila pristupa; ne povezuje stvarne roditelje niti stvara račune. Ne pokretati ponovno nakon uspješne primjene. Sačuvati uobičajenu sigurnosnu kopiju baze prije promjene strukture.
2. Objaviti novu verziju postojećeg e-Dnevnika. U Vercelu napraviti drugi projekt povezan s istim GitHub repozitorijem i postaviti `VITE_APP_PORTAL=registrar`. Povezati domenu `referada.skolehr.xyz`. Koristiti isti Supabase projekt i iste postojeće poslužiteljske postavke. Administratorski ključ nikada ne smije imati prefiks `VITE_`.
3. U Upravljanju korisnicima napraviti zaseban račun s jedinom aktivnom ulogom **Školska referada** i odgovarajućom školom. U administratorskoj kartici **Školska referada** uključiti dodjelu škole. Ne koristiti postojeći administratorski ili nastavnički račun za tu ulogu.
4. Korisnik pri prvom pristupu postavlja autentifikator. Zatim se prijavljuje PIN-om i kodom. U kartici **Potpis referade** unijeti ime potpisnika i izvorni prozirni PNG. Priloženi plavi potpis nije ponovno nacrtan niti zamijenjen drugim potpisom; njegov izvorni PNG još treba spremiti u privatnu pohranu škole. Do tada potvrda ostavlja mjesto za vlastoručni potpis.
5. Razrednik povezuje roditeljske račune. Provjeriti prvi stvarni zahtjev i izdavanje potvrde na dogovorenim računima prije šireg korištenja.

SQL Editor projekta: https://supabase.com/dashboard/project/hkqlbeetlvrplaeubncc/sql/new

## Provjera

`npm run lint`, `npm run build` i `TZ=Europe/Zagreb npx tsx --test tests/*.test.ts tests/family-portal-db.test.cjs`.

Test baze koristi lokalni PostgreSQL preko PGlitea, reprezentativnu shemu i izmišljene podatke. Izvodi upravo objedinjenu aktivacijsku datoteku. Pokriva pristup roditelja, odgodu ocjena, obradu izostanaka, provjeru potvrda, izolaciju dvije škole, nedodijeljenu referadu, potvrdu drugog faktora i opoziv pristupa. Ne predstavlja provjeru svih postojećih funkcija baze ili postojećih sigurnosnih pravila aplikacije.

Preglednik je zasebno provjeren s izmišljenim podacima na 1366 × 768, 1280 × 600 i 390 × 740. Provjereni su predaja/obrada zahtjeva, sučelje referade i PDF za oba spola i oba načina izdavanja. Produkcijski poslužitelj nije pokretan radi testiranja jer postojeći startup izvršava popravke podataka.

## Nastavak izvornog plana

Ova verzija pokriva roditeljske zahtjeve, povezivanje računa, obavijesti i potvrde te osnovni rad nove referade. Još slijede:

1. Dopuna učeničkog pregleda: funkcionalni izvozi vremenika i rasporeda, grafički pregledi ocjena i izostanaka, završna provjera mobilnih prikaza.
2. Nastavnički i razrednički dio: usporedba preostalih radnji s priručnicima, bilješke i kontrole rokova, skupne radnje, evidencije sastanaka i izvještaji.
3. Dopuna službenih obrazaca i posebnih modula prema priručnicima, uz provjeru stvarnih školskih pravila.
4. Vanjske integracije tek po dobivanju službenog pristupa; API pristup trenutačno nije dostupan.

Aktivacija u stvarnoj bazi i povezivanje novog Vercel projekta još nisu izvršeni. Servisni Supabase API ključ ne omogućuje izvođenje DDL SQL-a, a dostupna sesija nema pristup upravljanju Vercel projektima.
