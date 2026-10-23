# Komunikacija i školske usluge

Korisnik je 23.10.2026. odobrio svih sedam predloženih nadogradnji. Postojeće poruke, pedagoške aktivnosti, zamjene, ispitne rezultate i PDF generator sustav i dalje koristi kao izvor podataka.

## Gdje se otvara

- Roditelj ili učenik: odabrati dijete/razred → **Školske usluge** u navigaciji.
- Djelatnik: razred → Dnevnik rada → **Školske usluge**. Ovlasti određuje baza; predmetni nastavnik nema razredničke ili stručne ovlasti samo zato što vidi poveznicu.
- Referada: **Administrativni zahtjevi** → Zahtjevi učenika i roditelja. Postojeći urudžbeni zapisnik ostaje ispod. PIN/TOTP i verificirana sesija su obvezni.
- e-Matica: postojeći ispitni rezultati ostaju u obrazovnoj evidenciji. Provjera zaključivanja sada posebno prikazuje ispite bez rezultata.

## Aktivacija

Jednom pokrenuti cijelu **AKTIVACIJA-KOMUNIKACIJA-I-USLUGE.sql** u Supabase SQL Editoru. Uključuje prethodnu ponovljivu aktivaciju radnih tijekova i Ravnatelja, pa ih ne treba zasebno ponavljati. Potrebna je već postojeća e-Matica/Referada i Stručni suradnik osnova. Datoteka se generira naredbom `node scripts/build-school-services-activation.mjs --write`; test provjerava identičnost i dva uzastopna izvršavanja. Migracija ne šalje stvarne poruke, ne stvara učenike i ne unosi ocjene.

## Sedam nadogradnji

1. **Poruke i informacije.** Razgovor vezan uz učenika, roditelja i razred koristi postojeće `chat_groups`, `messages` i `message_attachments`. Čitaju ga povezani roditelj i aktualni razrednik/zamjenik odnosno školski administrator. Roditelji ne vide druge roditeljske razgovore. Privitci su privatni PDF/PNG/JPG do 10 MB. Potvrde čitanja bilježe samo otvorene poruke, bez automatskog označavanja cijele povijesti. Stranice razgovora imaju po 100 poruka. Roditelj može rezervirati slobodan objavljeni termin informacija; preklapanje i dvostruka rezervacija odbijaju se u bazi. Termine i rezervacije moguće je otkazati.
2. **Suglasnosti.** Razrednik objavljuje opis i rok. Svaki povezani roditelj odgovara za svoje dijete, uz napomenu. Odgovor se može promijeniti do roka; sve promjene ostaju u postojećoj povijesti. Prikazuju se odgovoreni i neodgovoreni pozivi. Povučeni i istekli pozivi ne prihvaćaju odgovore. Evidencija odgovora nije kvalificirani elektronički potpis.
3. **Podrška učenicima.** Signal za pregled čine izostali sati u posljednjih 30 kalendarskih dana (korisnički prag, zadano 15), najmanje dvije najnovije negativne godišnje zaključne ocjene ili pad prosjeka za najmanje 1 u odnosu na prethodnih 30 dana. Nedostajuće ocjene ostaju prazne; signali nisu dijagnoza ni automatska mjera. Razrednik i stručna služba unose stvarnu aktivnost, zaključak i preporuku u postojeće `expert_service_activities`. Ravnatelj pregledava signale bez uređivanja; detaljne bilješke ovog prikaza nisu dostupne učenicima, roditeljima ni predmetnom nastavniku.
4. **Zamjene i raspored.** Administrator bira razred, dodijeljeni predmet, odsutnog i zamjenskog nastavnika, datum, sat i učionicu. Koristi se postojeća tablica `teacher_substitutions`; ako stara migracija nije bila aktivirana, ista tablica se instalira. Dvostruka zamjena nastavnika ili razreda u istom terminu odbija se. Objavu i otkaz prate obavijesti. Trajne predmetne dodjele i postojeće ovlasti unosa nastave ne prepisuju se ovom objavom.
5. **Zahtjevi referadi.** Roditelj/učenik predaje vrstu dokumenta i svrhu, vidi obradu i obrazloženje. Referada može odbiti uz razlog ili povezati već izdani PDF istog učenika, razreda i škole. Postojeći pregled/izdavanje i ovjera PDF-a ostaju obvezni. Roditelj ili učenik preuzima privatni dokument uz provjeru SHA-256. Poništeni dokument nije dostupan za obiteljsko preuzimanje. Nije moguće odobriti dokument druge ustanove.
6. **Dopunski rad i ispiti.** Razrednik/administrator objavljuje rok, predmet, mjesto i povjerenstvo iz svoje škole. Učenik/roditelj prijavljuje svoj aktivno upisani predmet; razrednik može prijaviti učenika razreda. Mogući su odjava i otkaz budućeg roka. Administrator unosi stvaran rezultat preko postojećeg `registry_record_exam`, uz njegova postojeća pravila za dopunski rad, popravni i ostale ispite. Rezultat ne stvara automatsku zaključnu ocjenu. PDF zapisnika prikazuje stvarne prijave i rezultate, hrvatske znakove i prazne ocjene kao „Nije unesena”. Ne izmišlja se službeni urudžbeni broj ili ovjera. Ispiti s prijavama bez rezultata blokiraju zaključivanje godine; zaključena godina ne prihvaća nove ispitne rezultate ni kroz stare registry funkcije.
7. **Pristupačnost i manji ekrani.** Novi postupci imaju imenovana polja, vidljiv fokus, povratne poruke, onemogućavanje dvostrukog slanja, prelamanje sadržaja i prikaz bez vodoravnog prelijevanja na laptopu/mobitelu. Pogreška učitavanja uklanja stare rezultate; zakašnjeli odgovori prethodnog razreda/razgovora se odbacuju. Pregled PDF-a zadržava mogućnost otvaranja u zasebnom prozoru.

## Popravak zadataka referade

„Dokumenti čekaju izdavanje” otvara pripadajući filtrirani popis, bez ponovnog učitavanja početne stranice. Poveznica radi i iz drugog dijela sustava preko `?task=documents`. Popis nije ograničen na zadnjih 1000 izdanih dokumenata, nego dohvaća sve pripreme škole uz straničenje na poslužitelju. SPREMNO se može nastaviti pregledom i izdavanjem; NACRT se ponovno priprema pod istim ID-jem, bez stvaranja nove pripreme. Nema automatskog izdavanja bez pregleda PDF-a. Ovaj popravak navigacije ne zahtijeva novu SQL funkciju.

## Provjere i granice

`npm test`, `npm run lint`, `npm run build`, `npm run test:services`, `npm run test:browser`; u e-Matici `npm test`, `npm run test:browser`, `npm run test:layout`, `npm run build`. Preglednik koristi ogledne podatke, SQL test stvarne PostgreSQL funkcije u izoliranoj bazi. Ne provode se stvarne roditeljske odluke, poruke, izdavanja ili zaključivanje godine tijekom provjere. Dostupnost funkcija u aktivnom Supabase projektu zahtijeva SQL aktivaciju; nije izvršena iz ovog okruženja. Obavijesti su unutar sustava; nisu konfigurirani SMS ni e-mail slanje.
