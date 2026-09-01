# 3D-PCC (3D-PrintCostCalc)

Lokaler Kostenrechner für 3D-Drucke – lädt `*.gcode.3mf` Dateien (Bambu Studio /
OrcaSlicer Exporte inkl. Sliceinformationen) hoch, liest Material, Gewicht
(Modell / Stützen / Spülturm / Gesamt) und Mehrfarbigkeit aus und berechnet
daraus die Druckkosten – ähnlich wie druckpreis3d.com, aber komplett lokal.

## Funktionen

- Upload von `.gcode.3mf` Dateien per Drag & Drop (PC & Handy)
- Automatische Auswertung: Gesamtgewicht, Druckzeit, Gewicht nach Modell /
  Stützen / Spülturm, Filamentfarben & -typen, Objekte auf der Platte
- Alle Drucke werden lokal in einer SQLite-Datenbank (`data/3d-pcc.db`)
  gespeichert und bleiben abrufbar
- Vollständiger Kostenrechner: Material, Strom, Maschinenverschleiß,
  Arbeitszeit, Verpackung, Gewinnmarge, MwSt.
- Einstellungen für Materialpreise, Drucker- und Kostenprofile

## Nutzung

```bash
npm install
npm run dev
```

Danach im Browser [http://localhost:3000](http://localhost:3000) öffnen.

### Zugriff vom Handy (gleiches WLAN)

Der Dev-Server gibt beim Start auch eine Netzwerk-Adresse aus, z. B.
`http://192.168.x.x:3000`. Diese Adresse auf dem Handy-Browser öffnen, solange
PC und Handy im selben WLAN sind.

### Produktion (dauerhaft lokal laufen lassen)

```bash
npm run build
npm run start
```

## Daten

Alle Drucke und Einstellungen liegen standardmäßig ausschließlich lokal im
Ordner `data/` (SQLite-Datei) – es werden keine Daten an externe Server
gesendet.

## Datenbank-Backend wählen

Standardmäßig wird eine lokale SQLite-Datei verwendet (`data/3d-pcc.db`),
es ist aber auch möglich, eine PostgreSQL- oder MariaDB/MySQL-Datenbank
anzubinden. Dazu `.env.example` nach `.env.local` kopieren und anpassen:

```bash
# DB_DRIVER: sqlite (Standard) | postgres | mysql (auch für MariaDB)
DB_DRIVER=sqlite

# Nur für postgres/mysql nötig:
# DATABASE_URL=postgres://user:password@localhost:5432/3dpcc
# DATABASE_URL=mysql://user:password@localhost:3306/3dpcc
```

Die benötigten Tabellen werden beim ersten Start automatisch angelegt. Nach
Änderungen an `.env.local` muss der Dev-/Prod-Server neu gestartet werden.

Alternativ lässt sich die Datenbank auch direkt in **Einstellungen > Datenbank**
in der Weboberfläche konfigurieren (Treiber, Host, Port, Datenbankname,
Benutzer, Passwort) – ohne Server-Neustart. Vor dem Speichern wird die
Verbindung geprüft. Das Passwort wird verschlüsselt in `data/db-config.json`
abgelegt (Schlüssel in `data/.dbkey`, beides lokal und nicht Teil des Git-
Repos) und nach dem Speichern nie wieder im Klartext angezeigt oder
vorausgefüllt – auch nicht in der Weboberfläche selbst.

