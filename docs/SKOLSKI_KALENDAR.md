# Školski kalendar

Kalendar prikazuje zasebnu školsku godinu (1. rujna – 31. kolovoza), blagdane RH i događaje odabrane škole. Izračun Uskrsa, Uskrsnog ponedjeljka i Tijelova radi se za odgovarajuću godinu. Popis zakonskih blagdana treba ažurirati ako se promijeni zakon.

## Izvor za 2026./2027.

Priloženi PDF čuva se u `public/calendars/skolski-kalendar-2026-2027-prijedlog.pdf`. Podaci su u `src/lib/schoolCalendar.ts`, uz oznaku **prijedlog**. Korisnik je potvrdio ispravak drugog zimskog odmora na **20.–28. veljače 2027.**; izvorni PDF nije mijenjan. Ljetni odmor prikazan je samo unutar odabrane školske godine. Maturanti, praksa i ispiti imaju vlastite iznimke; kalendar ih automatski ne pretvara u nenastavne dane za cijelu školu.

## Nove godine i ponovno dohvaćanje

Nakon stvaranja ili aktivacije godine u administraciji poziva se siguran uvoz. Ponovno se pokušava pri otvaranju školskog kalendara; administrator može odabrati i **Osvježi izvor i praznike**. Imena godina moraju imati uzastopne pune godine, npr. `2027/2028` ili `2027./2028.`.

Za nove godine poslužitelj pretražuje `ucenici.com` kroz WordPress pretragu, uz HTML pretragu kao rezervni način, te čita pripadajući članak i/ili PDF. Naslov i sadržaj moraju potvrditi traženu godinu. Ne koristi se prošlogodišnji raspored praznika. Izvor s nejasnim, proturječnim ili nepotpunim datumima označava se za provjeru. Ako izvor nije objavljen, prikazuju se blagdani i status čekanja; ako nije dostupan, zadržavaju se prethodno spremljeni podaci. To nije jamstvo dostupnosti ili budućeg formata tuđeg portala.

Status **PUBLISHED** znači objavljen izvor na portalu, ne službenu potvrdu Ministarstva. Oznake prijedloga čuvaju se. Izvor je povezan u sučelju.

Vanjski zahtjevi ograničeni su na HTTPS domene `ucenici.com` i `www.ucenici.com`, uključujući provjeru svakog preusmjeravanja. Ukupan dohvat ima rok 20 sekundi. Pozitivni izvori predmemoriraju se 6 sati, neuspjeli pokušaji 15 minuta; istodobni zahtjevi za istu godinu dijele dohvat.

## Pohrana i prava

Koristi se postojeća tablica `school_events`, bez nove SQL migracije. Metapodaci izvora/autorstva pohranjuju se u `description` s oznakom `EDNEVNIK_CALENDAR_V1:`; sučelje ih pretvara u čitljive bilješke. Stabilni UUID-jevi ovise o školi, godini i događaju. Ponovljeni uvoz ne stvara duplikate i ne prepisuje školske događaje. Uspješan novi uvoz uklanja isključivo zastarjele automatske zapise.

API `/api/school-calendar` provjerava Supabase sesiju i aktivno članstvo u odabranoj školi. Administrator škole osvježava izvor i uređuje školske događaje. Zaposlenik dodaje i uređuje vlastite događaje; učenici i roditelji čitaju. Automatski zapisi uređuju se osvježavanjem izvora, a škola dodaje zasebne događaje. Stare HTTP rute za školske događaje također imaju provjeru pristupa. Postojeće izravne RLS politike projekta nisu promijenjene ni potvrđene ovom nadogradnjom.

Škola može unijeti višednevni izlet, dan škole, planirane nenastavne dane i druge događaje te označiti održava li se nastava. Prikaz se filtrira po školi i rasponu datuma školske godine.

## Provjera

```
TZ=Europe/Zagreb ./node_modules/.bin/tsx --test tests/schoolCalendar.test.ts tests/schoolCalendarApi.test.ts
npm run lint
npm run build
```

Testovi obuhvaćaju PDF, pomične blagdane, ispravak zimskog odmora, buduće izvore, nedostupnost izvora, URL ograničenja, izolaciju škola, ponovljeni uvoz i zaštitu vlastitih događaja. Provjera preglednika pokriva status prijedloga, školske raspone, nenastavne dane, čuvanje školskih događaja i status čekanja nove godine. Dohvat stvarnog portala iz Codex okruženja zahtijeva objavu nacrta mrežnih postavki s dvije domene izvora; lokalni testovi koriste kontrolirane izvore. Za PDF izdvajanje potreban je Node.js 22 ili noviji.
