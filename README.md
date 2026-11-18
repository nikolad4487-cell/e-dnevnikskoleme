# e-Dnevnik

## Učenička prijava iz WebmailHR-a

WebmailHR provjerava učeničke pristupne podatke preko rute
`POST https://e-ocjene.skolehr.xyz/api/auth/webmail/student`.

Postavite serversku tajnu `WEBMAILHR_STUDENT_LOGIN_TOKEN` u e-Dnevniku i istu
vrijednost u WebmailHR-u kao `EDNEVNIK_USERNAME_LOGIN_TOKEN`. U WebmailHR-u
postavite `EDNEVNIK_USERNAME_LOGIN_URL` na puni URL rute.

[Konfiguracija, ugovor rute i provjere](docs/WEBMAILHR-UCENICKA-PRIJAVA.md)
