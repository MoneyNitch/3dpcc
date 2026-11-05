# REST-API v1

Die versionierte Schnittstelle unter `/api/v1` stellt die vorhandenen
Anwendungsfunktionen für Automatisierung bereit. Bei aktiviertem Login
(Standard) sind Keys an Benutzer und deren Rollenrechte gebunden.
Änderungen sind sofort in der Oberfläche sichtbar.

## Aktivierung und API-Keys

### Mit Login (Standard)

Zuerst mit `admin/admin` anmelden und Benutzername sowie Passwort verpflichtend
ändern. Das Startkonto ist Superadmin. Unter **Einstellungen → Benutzerverwaltung** Benutzer,
Custom-Rollen und API-Schlüssel verwalten. Schlüssel können nur für aktive
Benutzer mit `API verwenden`-Recht erstellt werden, nachdem diese ihr
vorgegebenes Passwort geändert haben. Sie werden nur einmal angezeigt;
gespeichert wird ausschließlich ihr SHA-256-Hash.

Bei einem vergessenen Schlüssel kann ein Superadmin **Neu generieren** wählen.
Nach Bestätigung wird der alte Schlüssel sofort ungültig und der neue einmalig
angezeigt. Bezeichnung und Benutzer bleiben erhalten; verbundene Anwendungen
müssen auf den neuen Schlüssel umgestellt werden. Dies funktioniert auch beim
Limit von 10 Schlüsseln. Dokumentations-Sitzungen dieses Benutzers werden
beendet; normale Browser-Sitzungen und andere API-Schlüssel bleiben gültig.

Jeder Aufruf prüft die aktuelle Rolle: Viewer dürfen lesen und
`POST /prints/{id}/calculate` verwenden, aber keine Drucke oder Einstellungen
ändern. Dokumenterzeugung benötigt Dokument-Schreibrechte und Druck-Leserechte.
Custom-Rollen steuern Drucke, Dokumente und Einstellungen getrennt.
Änderungen an Vorlagen und Nummerierung erfordern Dokument-Schreibrechte,
auch über `PUT/PATCH /settings`. Fehlende Rechte ergeben **403**, fehlende
oder ungültige Schlüssel **401**.

Benutzeränderungen, Passwortänderungen/-resets, Deaktivieren/Löschen und
Änderungen der zugewiesenen Custom-Rolle widerrufen die vorhandenen Schlüssel.
Einzelne Schlüssel können separat widerrufen werden. Ein Browser-Login oder
Dokumentations-Cookie ersetzt keinen API-Schlüssel. Schlüssel ermöglichen
keine Benutzerverwaltung. Umgebungs-`API_KEYS` werden in diesem Modus ignoriert.

### Ohne Login (AUTH_ENABLED=false)

Nur in diesem Modus werden Keys über die Server-Umgebung verwaltet.
Diese Legacy-Keys haben vollständigen Lese- und Schreibzugriff auf `/api/v1`.
Einen kryptografisch zufälligen Key lokal erzeugen:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Den ausgegebenen Wert in `.env.local` eintragen:

```dotenv
AUTH_ENABLED=false
API_KEYS=<erster-key>,<zweiter-key>
```

Jeder Key muss 32–256 Zeichen lang sein und darf nur `A-Z`, `a-z`, `0-9`, `_`
und `-` enthalten. Leerzeichen um kommagetrennte Werte werden entfernt;
leere Einträge oder ungültige Keys deaktivieren die API. Ohne konfigurierte
Keys antwortet die gesamte versionierte Schnittstelle mit **503**.
Nach Änderungen den Server neu starten. Zur Rotation einen neuen Key hinzufügen,
Clients umstellen und den alten Key entfernen. Nie echte Keys committen oder
als `NEXT_PUBLIC_*` konfigurieren.

Bei Docker Compose `API_KEYS` in der Compose-`.env` setzen. Die Compose-Datei
reicht den Wert an den Container weiter. Bei anderen Deployments die Variable
direkt an den Node-Prozess/Container übergeben.

Jeder API-Aufruf benötigt:

```http
Authorization: Bearer <key>
```

Keys in URLs oder Query-Parametern werden nicht unterstützt. Es gibt keine
Browser-CORS-Freigabe für fremde Origins. Über nicht vertrauenswürdige Netze
HTTPS verwenden.

**Wichtig:** Mit `AUTH_ENABLED=false` sind Oberfläche und interne `/api/*`-
Endpunkte ungeschützt; nur `/api/v1` verlangt Legacy-Keys. Diesen Modus
ausschließlich im vertrauenswürdigen privaten Netzwerk verwenden.
Mit aktiviertem Login sind auch Oberfläche und interne APIs durch Anmeldung
und Rollenprüfung geschützt. Bei HTTPS hinter einem Reverse Proxy
`AUTH_ORIGIN` (öffentliche Origin inklusive Port) und `AUTH_COOKIE_SECURE=true`
setzen. Siehe [Login-Dokumentation](../README.md#login-and-roles).

## Geschützte OpenAPI-Ansicht

`/api/v1/docs` öffnet eine Anmeldung; ohne Key werden keine Dokumentation,
Schemas oder Swagger-Assets ausgeliefert. Nach Anmeldung erscheint die lokal
ausgelieferte **Swagger UI** mit OpenAPI 3.1 und „Try it out“.
Es werden keine CDN-Ressourcen oder externen Spec-Validatoren verwendet.
Die Ansicht bietet eine Endpunkt-Suche, breite Operationskarten und vergrößerte
Eingabefelder. Helles bzw. dunkles Farbschema folgt der Browser-/Systemeinstellung;
auf kleinen Bildschirmen werden Operationsbeschreibungen unter dem Pfad angezeigt.

Die Anmeldung setzt eine `HttpOnly`-Sitzung mit einer Stunde Gültigkeit
(`SameSite=Strict`, bei HTTPS zusätzlich `Secure`), die ausschließlich für
Dokumentationsressourcen gilt. Bei aktiviertem Login wird sie serverseitig
gespeichert, ohne Login wie bisher signiert. Das Widerrufen eines Benutzer-
Keys widerruft alle Dokumentationssitzungen dieses Benutzers; das Entfernen
eines Legacy-Keys widerruft dessen Sitzung. Diese Sitzungen erlauben keinen
Browser-Login. **Authorize** benötigt für echte API-Aufrufe nochmals den
Key, ohne `Bearer`-Präfix. Swagger hält ihn nur im Tab-Arbeitsspeicher, nicht in
Local Storage. Abmelden oder Neuladen entfernt diese Autorisierung.

Die maschinenlesbare Spezifikation:

```http
GET /api/v1/docs/openapi.json
Authorization: Bearer <key>
```

Sie ist auch über eine gültige Dokumentationssitzung erreichbar. Die
Spezifikation wird aus den tatsächlichen Operationsdefinitionen und
Zod-Validierungsschemas erzeugt. Die Ansicht bearbeitet **echte Daten**:
„Try it out“ ist keine Sandbox.

## Endpunkte

| Methode | Pfad relativ zu `/api/v1` | Funktion |
|---|---|---|
| GET | `/prints?limit=50&offset=0` | Drucke auflisten; `prints`, `total`, `limit`, `offset` |
| POST | `/prints` | Manuellen Druck als JSON anlegen |
| POST | `/prints/upload` | `.3mf` als Multipart hochladen |
| GET | `/prints/{id}` | Druck und effektive Kalkulationseingaben lesen |
| PATCH | `/prints/{id}` | Anzeigenamen ändern |
| DELETE | `/prints/{id}` | Druck löschen und dessen Vorschauauftrag abbrechen |
| GET | `/prints/{id}/download` | Aufbewahrtes Originalarchiv herunterladen |
| PUT | `/prints/{id}/manual` | Messwerte eines manuellen Drucks ersetzen |
| GET | `/prints/{id}/plates` | Alle Druckplatten lesen |
| PATCH | `/prints/{id}/plates` | Plattennamen ändern: `{"plateIndex":1,"plateName":"Gehäuse"}` |
| POST | `/prints/{id}/plates` | Mehrplattenprojekt in einzelne gespeicherte Drucke aufteilen |
| GET | `/prints/{id}/model?plateIndex=1` | Gzip-kodierte JSON-3D-Vorschau; bei laufender Berechnung 202 |
| POST | `/prints/{id}/model` | Fehlgeschlagene 3D-Berechnung erneut starten |
| PUT | `/prints/{id}/cost-inputs` | Kalkulationseingaben ändern und speichern |
| POST | `/prints/{id}/calculate` | Kalkulieren, ohne Änderungen zu speichern |
| GET / PUT / PATCH | `/settings` | Einstellungen lesen / vollständig ersetzen / teilweise ändern |
| POST | `/invoices` | Druckbare Rechnung als HTML erzeugen |
| POST | `/quotes` | Druckbares Angebot als HTML erzeugen |

Für diese Sammlungen gibt es jeweils `GET` und `POST` am Sammlungspfad sowie
`GET`, `PUT` und `DELETE` am Pfad `/{id}`:

- `/materials`
- `/accessory-materials`
- `/printers`
- `/invoices/templates`
- `/quotes/templates`

Beim Anlegen von Sammlungselementen eine eindeutige `id` mitgeben. Beim Ersetzen
muss sie mit der Pfad-ID übereinstimmen. Den Standarddrucker erst umstellen,
bevor er gelöscht wird. Einstellungen enthalten **keine** Datenbankpasswörter,
externen Verbindungsschlüssel oder API-Keys. Datenbankadministration,
Verbindungskonfiguration und Support-Exporte sind bewusst keine v1-Endpunkte.

### Daten und Grenzen

Plattennamen werden pro Druck gespeichert (1–200 Zeichen, äußere Leerzeichen
werden entfernt). Bestehende separat gespeicherte Plattendrucke behalten ihren
eigenen Namen; Originalarchive und Messwerte bleiben unverändert.

**Originaldownload:** `general.retainOriginalArchives` ist standardmäßig `false`.
Mit `PATCH /settings` und `{"general":{"retainOriginalArchives":true}}` aktivieren.
Nur danach hochgeladene Archive werden dauerhaft aufbewahrt. Der Download liefert
die unveränderten Uploadbytes als `application/octet-stream` mit
`Content-Disposition: attachment` und dem ursprünglichen Dateinamen.
Deaktivierung sperrt Downloads (403), löscht bestehende Archive aber nicht.
Fehlende Originale und manuelle Drucke liefern 404. Einzelne verknüpfte Plattendrucke
liefern das vollständige Originalprojekt, keine neu erzeugte Einzelplatten-Datei.
Beim Löschen des Quelldrucks wird dessen Original gelöscht.
Originale liegen unabhängig von der Vorschau und dem Datenbanktreiber lokal in
`data/original-archives/`; dieses Verzeichnis zusammen mit der Datenbank sichern.

- JSON-Anfragen: `Content-Type: application/json`, höchstens **3 MiB**.
- Uploads: `multipart/form-data`, höchstens **100 MiB** inklusive Multipart-
  Overhead; genau eine nicht leere `.3mf`-Datei im Feld `file`.
  Optional `displayName` mit maximal 200 Zeichen. Vorschauen nutzen die
  bestehende Hintergrundwarteschlange.
- Drucklisten: `limit` 1–100 (Standard 50), `offset` ab 0.
- Druck-IDs sind UUIDs. Fehlende Ressourcen liefern 404.
- Ungültige/unerwartete JSON-Felder und Query-Parameter werden abgelehnt.
- `GET /prints/{id}` ergänzt fehlende Felder älterer gespeicherter
  Kalkulationseingaben aus den bestehenden Standardwerten.
- Bei Kalkulation und Dokumenten bedeutet fehlender `plateIndex` die erste
  Platte; eine Nummer wählt eine einzelne Platte, `"all"` das gesamte Projekt.
- Kalkulationseingaben werden mit gespeicherten Werten und Standardwerten
  zusammengeführt. Enthaltene Maps und Arrays ersetzen jeweils das gesamte
  Feld. `inputs` in Berechnungs-/Dokumentenanfragen wird **nicht** gespeichert.
- Teiländerungen an Einstellungen mergen `general`, `costs` und die Felder
  beider Nummerierungsarten. Sammlungen werden ersetzt. Gleichzeitige
  v1-Einstellungsänderungen werden pro Prozess serialisiert; gegenüber
  UI-Speicherungen gilt „letztes Speichern gewinnt“. Eine App-Instanz pro
  Datenverzeichnis verwenden.
- Geldbeträge verwenden die konfigurierte Währung, ohne Währungsumrechnung.
  Die API liefert ungerundete numerische Kalkulationsergebnisse.
- Alle Antworten sind `private, no-store`.

## Beispiele (PowerShell)

Ein bestehender Key aus der Prozessumgebung, nicht aus einer URL:

```powershell
$base = "http://localhost:3000/api/v1"
$headers = @{ Authorization = "Bearer $env:PCC_CLIENT_KEY" }

$body = @{
  name = "Testdruck"
  minutes = 60
  filaments = @(@{
    filamentId = "1"
    type = "PLA"
    color = "#CCCCCC"
    usedGramsTotal = 100
  })
} | ConvertTo-Json -Depth 10

$created = Invoke-RestMethod "$base/prints" -Method Post `
  -Headers $headers -ContentType "application/json" -Body $body
$id = $created.print.id

Invoke-RestMethod "$base/prints/$id/calculate" -Method Post `
  -Headers $headers -ContentType "application/json" `
  -Body '{"plateIndex":"all","inputs":{"quantity":2}}'

Invoke-RestMethod "$base/prints/$id/cost-inputs" -Method Put `
  -Headers $headers -ContentType "application/json" `
  -Body '{"quantity":2,"laborMinutes":15}'
```

Upload mit PowerShell 7:

```powershell
Invoke-RestMethod "$base/prints/upload" -Method Post -Headers $headers `
  -Form @{ file = Get-Item ".\projekt.gcode.3mf"; displayName = "Projekt" }
```

Rechnung erzeugen:

```powershell
$settings = (Invoke-RestMethod "$base/settings" -Headers $headers).settings
$invoice = @{
  printId = $id
  templateId = $settings.invoiceTemplates[0].id
  documentNumber = "R-2026-0001"
  date = "2026-10-31"
  customerName = "Beispielkunde"
  customerAddress = "Beispielkunde`nBeispielweg 1"
  plateIndex = "all"
} | ConvertTo-Json -Depth 10

Invoke-WebRequest "$base/invoices" -Method Post -Headers $headers `
  -ContentType "application/json" -Body $invoice -OutFile ".\rechnung.html"
```

Dokumente werden wie in der bestehenden Anwendung als **HTML**, nicht als PDF,
erzeugt und nicht archiviert. Im Browser lassen sie sich drucken bzw. als PDF
speichern. `documentNumber` ist obligatorisch: Die API verbraucht keine
Nummerierungszähler und garantiert keine eindeutigen Rechnungsnummern.
Die aufrufende Integration verwaltet die tatsächlichen Dokumentnummern.
Vorlagen und Nummerierungseinstellungen bleiben über die API verwaltbar.

## Fehlerformat

```json
{
  "error": {
    "code": "validation_error",
    "message": "Invalid request data.",
    "details": [
      { "path": "quantity", "message": "..." }
    ]
  }
}
```

`details` ist optional. Clients sollten Status und `code` auswerten, nicht den
menschenlesbaren Text. Wichtige Statuscodes: **400** ungültige Daten/JSON,
**401** fehlender/falscher Key, **403** deaktivierte Vorschau, **404** nicht
gefunden, **405** falsche Methode, **409** Konflikt, **413** zu große Anfrage,
**415** falscher Content-Type, **422** nicht verarbeitbares Archiv, **500**
Serverfehler, **503** fehlende/ungültige Key-Konfiguration.

`202` beim Lesen einer Vorschau ist kein Fehler; `Retry-After: 3` beachten.
Interne Datei-/Datenbankfehler werden nur serverseitig protokolliert, nicht an
API-Clients ausgegeben. Unbekannte versionierte Endpunkte und nicht unterstützte
Methoden sind ebenfalls Key-geschützt.
