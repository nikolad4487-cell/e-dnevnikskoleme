# Ravnatelj

Uloga `PRINCIPAL` prikazuje se kao **Ravnatelj** u e-Dnevniku i e-Matici. Dodjeljuje se samostalno, prema aktivnoj ustanovi, bez dodavanja administratorske uloge.

Jednom pokrenuti `docs/AKTIVACIJA-RAVNATELJ.sql` u SQL Editoru zajedničkog Supabase projekta. Nadogradnja zahtijeva već aktiviranu nadogradnju Stručni suradnik i koristi njezine školske RLS zaštite, bez novih tablica ili promjene podataka. Ne ponavljati staru aktivaciju. Dodjela uloge i PIN prijava blokirani su dok nova SQL zaštita nije aktivna.

Administrator u jednoj od aplikacija odabire Ravnatelj i pripadajuću školu. PIN i autentifikator ostaju dio postojeće prijave. Ravnatelj pregledava razrede, učenike, predmete, ocjene, izostanke i izvješća vlastite škole. U e-Dnevniku u korisničkom izborniku odabire **Upravljačka ploča ravnatelja** (`/ravnatelj`). U e-Matici ima **Pregled ravnatelja** s odabirom godine, razreda i učenika, pregledom stvarnih ocjena/izostanaka i poveznicom na upravljačku ploču.

Ravnatelj nema pristup administraciji korisnika, ne mijenja ocjene, predmete, izostanke, nastavu ili pedagoške kartone. Može promijeniti vlastite kontaktne podatke i koristiti postojeće postupke za vlastiti PIN/autentifikator. Promjena vlastitih ovlasti zabranjena je u bazi. Pripadnost školi provjerava se prema aktivnoj ulozi, a ne imenu korisnika ili URL-u.

Testirati račun s jedinom ulogom Ravnatelj: vlastiti razredi i učenici su vidljivi; ocjene i izostanci imaju podatke iz baze; nema gumba za njihovo uređivanje ni za dodavanje korisnika; `/admin-skole/korisnici` je nedostupan. Pristup razredu druge škole i izravni pokušaji izmjene moraju biti odbijeni. Opoziv uloge ukida pregled škole. SQL testovi provjeravaju i očuvanje prava stručnih suradnika/nastavnika, zabranu izmjene kroz SECURITY DEFINER i različite postojeće sheme pedagoških tablica.

`npm run test:principal` provjerava stvarnu komponentu upravljačke ploče i zaštitu rute u pregledniku s oglednom bazom: bez ocjena prikazuje se „Nema ocjena”, vladanje bez evidencije ima nule, a zabilježene ocjene daju stvarni prosjek. Ploča više ne koristi ogledne prosjeke, nasumično vladanje ili izmišljeni broj prilagodbi.
