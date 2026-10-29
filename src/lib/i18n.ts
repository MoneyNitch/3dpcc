import type { Currency, Language, LanguagePack } from "./types";
import { getCurrencySymbol } from "./currency";

export type { Currency, Language };

const strings: Record<string, Record<Language, string>> = {
  "filamentDb.title": { de: "Externe Filamentdatenbanken", en: "External filament databases" },
  "filamentDb.description": { de: "Spoolman und FilaMan verbinden und Spulen direkt im Kostenrechner auswählen. Es werden nur Daten gelesen; Bestände werden nicht verändert.", en: "Connect Spoolman and FilaMan and select spools directly in the calculator. Read-only access; inventory is not changed." },
  "filamentDb.url": { de: "Server-Adresse (leer = deaktiviert)", en: "Server URL (empty = disabled)" },
  "filamentDb.apiKey": { de: "API-Schlüssel", en: "API key" },
  "filamentDb.keepKey": { de: "Leer lassen, um den Schlüssel zu behalten", en: "Leave empty to keep the saved key" },
  "filamentDb.keyPlaceholder": { de: "Optional bei Spoolman, erforderlich bei FilaMan", en: "Optional for Spoolman, required for FilaMan" },
  "filamentDb.clearKey": { de: "Gespeicherten Schlüssel entfernen", en: "Remove saved key" },
  "filamentDb.spoolmanHelp": { de: "Spoolman-Basisadresse, z. B. http://192.168.1.10:7912. Optionaler Schlüssel wird als Bearer-Token gesendet.", en: "Spoolman base URL, e.g. http://192.168.1.10:7912. An optional key is sent as a Bearer token." },
  "filamentDb.filamanHelp": { de: "FilaMan-System-Basisadresse, z. B. http://192.168.1.10:8083. Benutzer-API-Schlüssel in FilaMan erstellen; kein Geräte-Token verwenden.", en: "FilaMan System base URL, e.g. http://192.168.1.10:8083. Create a user API key in FilaMan; do not use a device token." },
  "filamentDb.keyHelp": { de: "Schlüssel werden verschlüsselt gespeichert und nicht zurück an den Browser gesendet. Bei einer anderen Server-Adresse muss der Schlüssel neu eingegeben werden. Nur vertrauenswürdige Server im privaten Netzwerk verwenden; für entfernte Server HTTPS nutzen.", en: "Keys are encrypted at rest and never returned to the browser. Re-enter the key when changing servers. Only use trusted servers on your private network; use HTTPS for remote servers." },
  "filamentDb.saved": { de: "Verbindung gespeichert.", en: "Connection saved." },
  "filamentDb.testing": { de: "Verbindung wird geprüft …", en: "Testing connection …" },
  "filamentDb.save": { de: "Prüfen und speichern", en: "Test and save" },
  "filamentDb.error.input": { de: "Bitte gültige Verbindungsdaten eingeben.", en: "Enter valid connection settings." },
  "filamentDb.error.url": { de: "Bitte eine HTTP- oder HTTPS-Adresse ohne Zugangsdaten, Suchparameter oder Fragment eingeben.", en: "Enter an HTTP or HTTPS URL without embedded credentials, query parameters, or fragments." },
  "filamentDb.error.auth": { de: "Zugriff verweigert. API-Schlüssel und Leseberechtigungen prüfen.", en: "Access denied. Check the API key and read permissions." },
  "filamentDb.error.connection": { de: "Filamentdatenbank nicht erreichbar. Adresse, Netzwerk und Server prüfen.", en: "Cannot reach the filament database. Check its URL, network, and server." },
  "filamentDb.error.response": { de: "Die Filamentdatenbank hat ein nicht unterstütztes Datenformat geliefert. API-Version und Adresse prüfen.", en: "The filament database returned an unsupported response. Check the API version and URL." },
  "filamentDb.error.limit": { de: "Die Filamentdatenbank liefert zu viele Daten (maximal 10.000 Spulen bzw. 5 MB pro Antwort).", en: "The filament database returned too much data (maximum 10,000 spools or 5 MB per response)." },
  "filamentDb.error.config": { de: "Die Verbindungskonfiguration konnte nicht gelesen oder gespeichert werden. Serverprotokoll und Schreibrechte prüfen.", en: "Could not read or save the connection configuration. Check server logs and write permissions." },
  "filamentDb.loading": { de: "Spulen werden geladen …", en: "Loading spools …" },
  "filamentDb.loadSpools": { de: "Spulen laden / aktualisieren", en: "Load / refresh spools" },
  "filamentDb.useCurrentPrice": { de: "Aktuellen Spulenpreis übernehmen", en: "Use current spool price" },
  "filamentDb.configure": { de: "Spoolman oder FilaMan in den Einstellungen verbinden.", en: "Connect Spoolman or FilaMan in Settings." },
  "filamentDb.empty": { de: "Keine aktiven Spulen gefunden.", en: "No active spools found." },
  "filamentDb.spoolFor": { de: "Spule für {material} (Filament {id})", en: "Spool for {material} (filament {id})" },
  "filamentDb.noSpool": { de: "Keine externe Spule (lokaler / manueller Preis)", en: "No external spool (local / manual price)" },
  "filamentDb.noPrice": { de: "Kein Kilopreis verfügbar", en: "Price per kg unavailable" },
  "filamentDb.manualPrice": { de: "Preis oder ursprüngliches Nettogewicht fehlt. Bitte den Kilopreis oben manuell eingeben; bis dahin gilt der bisherige / lokale Preis.", en: "Price or original net weight is missing. Enter the price per kg above; until then the existing / local price is used." },
  "filamentDb.snapshotNote": { de: "Spule und Kilopreis werden mit den Kosten gespeichert. Erneute Auswahl übernimmt den aktuellen externen Preis; kein Bestandsabzug.", en: "Spool and price per kg are saved with the costs. Select again to use the current external price; no inventory is deducted." },
  "filamentDb.currencyNote": { de: "Externe Preise müssen in der hier eingestellten Währung vorliegen. Keine automatische Währungsumrechnung.", en: "External prices must use the currency configured here. No automatic currency conversion." },
  "cost.saveError": { de: "Kosten konnten nicht gespeichert werden. Bitte erneut versuchen.", en: "Could not save costs. Please try again." },
  "nav.prints": { de: "Drucke", en: "Prints" },
  "nav.settings": { de: "Einstellungen", en: "Settings" },
  "nav.invoices": { de: "Rechnungen", en: "Invoices" },
  "nav.quotes": { de: "Angebote", en: "Quotes" },
  "dashboard.title": { de: "Meine 3D-Drucke", en: "My 3D prints" },
  "dashboard.subtitle": { de: "Lade eine geslicte 3MF-Datei hoch oder lege einen Druck manuell an.", en: "Upload a sliced 3MF file or create a print manually." },
  "dashboard.empty": { de: "Noch keine Drucke gespeichert.", en: "No prints saved yet." },
  "upload.dropText": { de: "3MF-Datei hier ablegen oder klicken", en: "Drop a 3MF file here or click" },
  "upload.hint": { de: "Geslicte Dateien aus Bambu Studio oder OrcaSlicer", en: "Sliced files from Bambu Studio or OrcaSlicer" },
  "upload.processing": { de: "Wird verarbeitet...", en: "Processing..." },
  "upload.genericError": { de: "Upload fehlgeschlagen.", en: "Upload failed." },
  "manual.add": { de: "+ Druck manuell anlegen", en: "+ Add print manually" },
  "manual.name": { de: "Name des Drucks", en: "Print name" },
  "manual.material": { de: "Material", en: "Material" },
  "manual.filaments": { de: "Filamente", en: "Filaments" },
  "manual.addFilament": { de: "+ Filament hinzufügen", en: "+ Add filament" },
  "manual.removeFilament": { de: "Filament entfernen", en: "Remove filament" },
  "manual.color": { de: "Farbe", en: "Color" },
  "manual.image": { de: "Bild (optional)", en: "Image (optional)" },
  "manual.imageHint": { de: "PNG, JPEG oder WebP, max. 5 MB", en: "PNG, JPEG or WebP, max. 5 MB" },
  "manual.removeImage": { de: "Bild entfernen", en: "Remove image" },
  "manual.createdAt": { de: "Erstellt am", en: "Created on" },
  "manual.create": { de: "Druck anlegen", en: "Create print" },
  "manual.error": { de: "Druck konnte nicht gespeichert werden.", en: "Could not save print." },
  "printCard.filaments": { de: "Filament(e)", en: "filament(s)" },
  "print.uploadedAt": { de: "Hochgeladen am", en: "Uploaded on" },
  "print.delete": { de: "Löschen", en: "Delete" },
  "print.deleteConfirm": { de: "Diesen Druck wirklich löschen?", en: "Really delete this print?" },
  "print.totalWeight": { de: "Gesamtgewicht", en: "Total weight" },
  "print.printTime": { de: "Druckzeit", en: "Print time" },
  "print.gcodeMissingNote": { de: "Hinweis: Diese 3MF-Datei enthält keinen G-Code. Preis, Filamentverbrauch und Druckzeit basieren auf den Slicing-Metadaten. Die Aufschlüsselung nach Objekt und Druckbereich ist daher nicht verfügbar.", en: "Note: This 3MF file contains no G-code. Price, filament usage, and print time are based on slicer metadata. Breakdown by object and print feature is unavailable." },
  "print.layers": { de: "Layer", en: "Layers" },
  "print.plates": { de: "Druckplatten", en: "Print plates" },
  "print.allPlates": { de: "Alle (Gesamtkosten)", en: "All (total costs)" },
  "print.allPlatesCostHint": { de: "Die Kosten umfassen alle Druckplatten. Vorschau und Details zeigen weiterhin die zuletzt gewählte Platte.", en: "Costs include all plates. The preview and details still show the last selected plate." },
  "print.allPlateGcodeMissing": { de: "Für mindestens eine Druckplatte fehlt der G-Code. „Gewicht nach Teil“ und „Objekte auf Druckplatte“ zeigen daher nur die Platten mit G-Code.", en: "At least one plate has no G-code. “Weight by part” and “Objects on the plate” therefore include only plates with G-code." },
  "print.plateNumber": { de: "Platte {number}", en: "Plate {number}" },
  "print.plateCount": { de: "{count} Druckplatten", en: "{count} print plates" },
  "print.createPlatePrints": { de: "Alle als einzelne Drucke anlegen", en: "Create individual prints" },
  "print.createPlatePrintsConfirm": { de: "Möchtest du wirklich {count} einzelne Drucke für alle Druckplatten anlegen?", en: "Do you want to create {count} individual prints for all print plates?" },
  "print.creatingPlatePrints": { de: "Drucke werden angelegt …", en: "Creating prints …" },
  "print.createPlatePrintsSuccess": { de: "{count} einzelne Drucke wurden angelegt.", en: "{count} individual prints were created." },
  "print.createPlatePrintsError": { de: "Die einzelnen Druckplatten konnten nicht angelegt werden.", en: "Could not create individual prints for the plates." },
  "print.weightByPart": { de: "Gewicht nach Teil", en: "Weight by part" },
  "print.category": { de: "Kategorie", en: "Category" },
  "category.model": { de: "Modell", en: "Model" },
  "category.support": { de: "Stützstruktur", en: "Support" },
  "category.tower": { de: "Reinigungsturm", en: "Wipe tower" },
  "category.other": { de: "Sonstiges", en: "Other" },
  "print.total": { de: "Gesamt", en: "Total" },
  "print.weightEstimateNote": { de: "Anteilige Schätzung auf Basis der extrudierten Filamentlänge.", en: "Proportional estimate based on extruded filament length." },
  "print.objectsOnPlate": { de: "Objekte auf der Druckplatte", en: "Objects on the plate" },
  "print.objectsOnAllPlates": { de: "Objekte auf allen Druckplatten", en: "Objects on all plates" },
  "print.height": { de: "Höhe", en: "Height" },
  "print.filamentsColors": { de: "Filament / Farben", en: "Filament / Colors" },
  "print.customName": { de: "Eigener Name", en: "Custom name" },
  "queue.title": { de: "Warteschlange", en: "Queue" },
  "queue.help": { de: "3D-Hintergrundaufträge werden automatisch aktualisiert. Verschieben ändert die Reihenfolge wartender Aufträge sofort und dauerhaft. Entfernen oder Abbrechen löscht nur den Auftrag und seine temporären Dateien, nicht den Druck.", en: "3D background jobs update automatically. Moving changes the waiting order immediately and persistently. Removing or cancelling deletes only the job and its temporary files, not the print." },
  "queue.removeConfirm": { de: "Diesen 3D-Auftrag entfernen bzw. abbrechen? Der Druck bleibt erhalten. Für eine neue Berechnung ist ein erneuter Upload erforderlich.", en: "Remove or cancel this 3D job? The print is retained. A new calculation requires uploading the file again." },
  "queue.refresh": { de: "Aktualisieren", en: "Refresh" },
  "queue.paused": { de: "Die 3D-Vorschau ist deaktiviert. Die Warteschlange ist pausiert.", en: "3D preview is disabled. The queue is paused." },
  "queue.error": { de: "Die Warteschlange konnte nicht geladen oder geändert werden. Bitte aktualisieren und erneut versuchen.", en: "The queue could not be loaded or changed. Please refresh and try again." },
  "queue.loading": { de: "Warteschlange wird geladen …", en: "Loading queue …" },
  "queue.empty": { de: "Keine 3D-Aufträge vorhanden.", en: "No 3D jobs." },
  "queue.queued": { de: "Wartend", en: "Waiting" },
  "queue.running": { de: "In Bearbeitung", en: "Processing" },
  "queue.errorStatus": { de: "Fehlgeschlagen", en: "Failed" },
  "queue.unavailable": { de: "Keine darstellbaren 3D-Daten", en: "No displayable 3D data" },
  "queue.up": { de: "Nach oben", en: "Move up" },
  "queue.down": { de: "Nach unten", en: "Move down" },
  "queue.remove": { de: "Entfernen", en: "Remove" },
  "queue.cancel": { de: "Abbrechen", en: "Cancel" },
  "print.view2d": { de: "2D", en: "2D" },
  "print.view3d": { de: "3D", en: "3D" },
  "print.thumbnailUnavailable": { de: "Für diese Druckplatte ist keine 2D-Vorschau verfügbar.", en: "No 2D preview is available for this plate." },
  "print.toolpathPreviewNote": { de: "Vollständige Druckbahnen aus G-Code mit räumlichen Filamentbahnen. Kein originales Oberflächenmodell.", en: "Complete G-code toolpaths rendered as spatial filament strands. Not the original surface model." },
  "print.layerSliderLabel": { de: "Schicht {current} / {total} · Z {height} mm", en: "Layer {current} / {total} · Z {height} mm" },
  "print.layerSliderAria": { de: "Sichtbare Druckschicht auswählen", en: "Select visible print layer" },
  "print.modelUnavailable": { de: "Für diesen Druck sind keine darstellbaren 3D-Daten verfügbar.", en: "No displayable 3D data is available for this print." },
  "print.modelLoading": { de: "3D-Modell wird geladen …", en: "Loading 3D model …" },
  "print.modelComputing": { de: "Die 3D-Vorschau wird im Hintergrund vorbereitet. Du kannst den Druck bereits bearbeiten; die Ansicht aktualisiert sich automatisch.", en: "The 3D preview is being prepared in the background. You can already edit the print; this view updates automatically." },
  "print.modelComputeError": { de: "Die Hintergrundberechnung ist fehlgeschlagen. Du kannst sie erneut starten. Bei Speichermangel erhöhe das Docker-RAM-Limit oder deaktiviere die 3D-Vorschau.", en: "Background calculation failed. You can retry it. If memory ran out, increase the Docker memory limit or disable the 3D preview." },
  "print.modelRetry": { de: "Berechnung erneut starten", en: "Retry calculation" },
  "print.modelLoadError": { de: "Das 3D-Modell konnte nicht geladen werden.", en: "The 3D model could not be loaded." },
  "print.resetView": { de: "Ansicht zurücksetzen", en: "Reset view" },
  "print.modelCanvas": { de: "Interaktive 3D-Modellansicht", en: "Interactive 3D model view" },
  "print.editValues": { de: "Werte bearbeiten", en: "Edit values" },
  "print.saveValues": { de: "Werte speichern", en: "Save values" },
  "print.printTimeMinutes": { de: "Druckzeit (Minuten)", en: "Print time (minutes)" },
  "print.filamentWeights": { de: "Filamentgewichte", en: "Filament weights" },
  "print.invalidValues": { de: "Bitte gültige Werte eingeben.", en: "Enter valid values." },
  "print.nameSaved": { de: "Name gespeichert", en: "Name saved" },
  "extra.title": { de: "Zusätzliche Materialkosten", en: "Additional material costs" },
  "extra.add": { de: "+ Hinzufügen", en: "+ Add" },
  "extra.empty": { de: "Noch keine zusätzlichen Kosten erfasst.", en: "No additional costs recorded." },
  "extra.remove": { de: "Entfernen", en: "Remove" },
  "extra.total": { de: "Gesamt", en: "Total" },
  "extra.save": { de: "Speichern", en: "Save" },
  "extra.saved": { de: "Gespeichert", en: "Saved" },
  "modal.close": { de: "Schließen", en: "Close" },
  "cost.title": { de: "Kostenrechner", en: "Cost calculator" },
  "cost.printer": { de: "Drucker", en: "Printer" },
  "cost.default": { de: "(Standard)", en: "(default)" },
  "cost.materialPrices": { de: "Materialpreise für diesen Druck", en: "Material prices for this print" },
  "cost.energy": { de: "Stromverbrauch", en: "Power consumption" },
  "cost.energyEstimated": { de: "Geschätzt aus Druckzeit ({kwh} kWh)", en: "Estimated from print time ({kwh} kWh)" },
  "cost.energyMeasured": { de: "Gemessen", en: "Measured" },
  "cost.kwhTotal": { de: "kWh gesamt", en: "kWh total" },
  "cost.quantity": { de: "Menge (Stück)", en: "Quantity (units)" },
  "cost.laborMinutes": { de: "Arbeitszeit (Minuten)", en: "Labor time (minutes)" },
  "cost.packaging": { de: "Verpackung", en: "Packaging" },
  "cost.margin": { de: "Gewinnmarge", en: "Profit margin" },
  "cost.quantityDiscountThreshold": { de: "Rabatt ab Stück", en: "Discount from qty." },
  "cost.quantityDiscountPercent": { de: "Mengenrabatt", en: "Quantity discount" },
  "cost.quantityDiscount": { de: "Mengenrabatt", en: "Quantity discount" },
  "cost.tax": { de: "MwSt.", en: "Tax" },
  "cost.save": { de: "Kalkulation speichern", en: "Save calculation" },
  "invoice.export": { de: "Rechnung exportieren", en: "Export invoice" },
  "invoice.positionItem": { de: "Position", en: "Item" },
  "invoice.positionQuantity": { de: "Menge", en: "Quantity" },
  "invoice.positionUnitPrice": { de: "Einzelpreis", en: "Unit price" },
  "invoice.positionTotal": { de: "Gesamt", en: "Total" },
  "invoice.template": { de: "Vorlage", en: "Template" },
  "invoice.number": { de: "Rechnungsnummer", en: "Invoice number" },
  "invoice.customer": { de: "Rechnungsempfänger", en: "Bill to" },
  "invoice.customerPlaceholder": { de: "Name und Anschrift", en: "Name and address" },
  "invoice.showQuantityDiscount": { de: "Mengenrabatt in Rechnung / Angebot aufführen", en: "List quantity discount on invoice / quote" },
  "invoice.date": { de: "Rechnungsdatum", en: "Invoice date" },
  "invoice.dueDate": { de: "Fälligkeitsdatum", en: "Due date" },
  "invoice.generate": { de: "Druckansicht öffnen", en: "Open print view" },
  "invoice.download": { de: "HTML herunterladen", en: "Download HTML" },
  "quote.export": { de: "Angebot exportieren", en: "Export quote" },
  "quote.number": { de: "Angebotsnummer", en: "Quote number" },
  "quote.date": { de: "Angebotsdatum", en: "Quote date" },
  "quote.dueDate": { de: "Gültig bis", en: "Valid until" },
  "quote.documentTitle": { de: "Angebot", en: "Quote" },
  "quote.builderTitle": { de: "Angebotsdesigner", en: "Quote designer" },
  "quote.builderSubtitle": { de: "Gestalte dein Angebot frei auf einem Blatt: Text, Bilder, QR-Codes und mehr.", en: "Freely design your quote on a sheet: text, images, QR codes and more." },
  "settings.title": { de: "Einstellungen", en: "Settings" },
  "settings.subtitle": { de: "Standardwerte für neue Drucke.", en: "Defaults for new prints." },
  "settings.welcomeTitle": { de: "Willkommen bei 3D-PCC!", en: "Welcome to 3D-PCC!" },
  "settings.welcomeBody": { de: "Richte zuerst Materialien, Drucker und Kosten ein.", en: "Set up your materials, printer and costs first." },
  "settings.finishSetup": { de: "Einrichtung abschließen", en: "Finish setup" },
  "settings.general": { de: "Allgemein", en: "General" },
  "settings.version": { de: "Version", en: "Version" },
  "settings.language": { de: "Sprache", en: "Language" },
  "settings.languagePacks": { de: "Sprachpakete", en: "Language packs" },
  "settings.languagePackHelp": {
    de: "Lade eine JSON-Datei mit Sprachcode, Anzeigename und Übersetzungen hoch. Lade zuerst die Vorlage herunter und übersetze die Werte. Fehlende Übersetzungen erscheinen auf Englisch.",
    en: "Upload a JSON file containing a language code, display name, and translations. Download the template first and translate its values. Missing translations fall back to English.",
  },
  "settings.downloadLanguageTemplate": { de: "Übersetzungsvorlage herunterladen", en: "Download translation template" },
  "settings.uploadLanguagePack": { de: "JSON-Sprachpaket hochladen", en: "Upload JSON language pack" },
  "settings.removeLanguagePack": { de: "Entfernen", en: "Remove" },
  "settings.languagePackImported": { de: "Sprachpaket „{language}“ hinzugefügt. Speichere die Einstellungen, um es zu übernehmen.", en: "Language pack “{language}” added. Save settings to apply it." },
  "settings.languagePackInvalid": { de: "Das Sprachpaket ist ungültig:", en: "The language pack is invalid:" },
  "settings.languagePackTooLarge": { de: "Die Sprachpaket-Datei darf höchstens 1 MB groß sein.", en: "The language pack file must be no larger than 1 MB." },
  "support.title": { de: "Support-Export", en: "Support export" },
  "support.description": {
    de: "Erstelle ein ZIP mit Diagnosebericht und optionalen Browserfehlern sowie deiner Fehlerbeschreibung und den Reproduktionsschritten.",
    en: "Create a ZIP with diagnostics, optional browser errors, your issue description, and reproduction steps.",
  },
  "support.privacy": {
    de: "Das ZIP wird von deiner App erstellt und heruntergeladen, nicht an einen Supportdienst übertragen. Es enthält keine Passwörter, API-Schlüssel, Serveradressen, Druckdateien oder gespeicherten Drucknamen. Fehlerprotokolle sind optional und können persönliche Daten enthalten: prüfe sie vor dem Export.",
    en: "The ZIP is created by your app and downloaded; it is not sent to a support service. It excludes passwords, API keys, server addresses, print files, and saved print names. Error logs are optional and may contain personal data; review them before exporting.",
  },
  "support.includeErrors": {
    de: "Browserfehler und unbehandelte Promise-Fehler einschließen, die seit dem Öffnen der Einstellungsseite erfasst wurden ({count})",
    en: "Include browser errors and unhandled promise rejections captured since opening Settings ({count})",
  },
  "support.reviewErrors": { de: "Erfasste Fehler vor dem Export ansehen", en: "Review captured errors before exporting" },
  "support.noErrors": { de: "Bisher wurden keine Browserfehler erfasst.", en: "No browser errors have been captured so far." },
  "support.issueTitle": { de: "Kurzer Fehler-Titel", en: "Short issue title" },
  "support.issueDescription": { de: "Was ist passiert? Was hast du erwartet?", en: "What happened? What did you expect?" },
  "support.reproductionSteps": { de: "Schritte zum Reproduzieren", en: "Steps to reproduce" },
  "support.export": { de: "Support-ZIP herunterladen", en: "Download support ZIP" },
  "support.exporting": { de: "ZIP wird erstellt …", en: "Creating ZIP …" },
  "support.exported": { de: "Support-ZIP heruntergeladen. Bitte prüfe die Dateien vor dem Weitergeben.", en: "Support ZIP downloaded. Review its files before sharing." },
  "support.exportFailed": { de: "Support-ZIP konnte nicht erstellt werden. Bitte erneut versuchen.", en: "Could not create the support ZIP. Please try again." },
  "settings.currency": { de: "Währung", en: "Currency" },
  "settings.invoiceSender": { de: "Absenderdaten für Rechnungen und Angebote", en: "Sender details for invoices and quotes" },
  "settings.invoiceSenderHelp": { de: "Diese Angaben stehen als Variablen in beiden Dokumentvorlagen zur Verfügung.", en: "These details are available as variables in both document templates." },
  "settings.companyName": { de: "Firmenname", en: "Company name" },
  "settings.companyAddress": { de: "Firmenanschrift", en: "Company address" },
  "settings.companyEmail": { de: "Firmen-E-Mail", en: "Company email" },
  "settings.companyPhone": { de: "Firmentelefon", en: "Company phone" },
  "settings.companyTaxId": { de: "USt-ID / Steuernummer", en: "Tax ID" },
  "settings.companyIban": { de: "IBAN", en: "IBAN" },
  "settings.enable3dPreview": { de: "3D-Vorschau aktivieren", en: "Enable 3D preview" },
  "settings.previewComputePercent": { de: "Arbeitsanteil der 3D-Hintergrundberechnung", en: "3D background calculation duty cycle" },
  "settings.saveFailed": { de: "Die Einstellungen konnten nicht gespeichert werden. Bitte erneut versuchen.", en: "Settings could not be saved. Please try again." },
  "settings.previewComputeHelp": { de: "Standard: 25%. Ein Worker verarbeitet die Warteschlange nacheinander und legt bei der Druckbahnberechnung Pausen ein. Weniger bedeutet längere Wartezeit, nicht weniger Details. Kein hartes CPU- oder RAM-Limit: Entpacken, Modellnetze und Komprimieren können kurzzeitig mehr Leistung benötigen. Feste Limits sind über Docker möglich. Deaktivieren der 3D-Vorschau pausiert die Warteschlange.", en: "Default: 25%. One worker processes jobs sequentially and pauses between toolpath calculation steps. Lower values mean longer waits, not fewer details. This is not a hard CPU or memory cap: unpacking, mesh processing and compression may temporarily use more resources. Use Docker for hard limits. Disabling 3D preview pauses the queue." },
  "settings.enable3dPreviewHelp": { de: "Deaktivieren spart Rechenleistung und Speicher: Es werden nur 2D-Bilder angezeigt und bei neuen Uploads keine 3D-Daten erzeugt. Bereits gespeicherte 3D-Daten bleiben erhalten. Nach erneutem Aktivieren müssen in der Zwischenzeit hochgeladene Dateien für die 3D-Vorschau erneut hochgeladen werden.", en: "Disable to save processing power and memory: only 2D images are shown and no 3D data is generated for new uploads. Existing 3D data is retained. After re-enabling, files uploaded while disabled must be uploaded again for a 3D preview." },
  "settings.materials": { de: "Materialien & Preise", en: "Materials & prices" },
  "settings.accessoryMaterials": { de: "Zubehördatenbank", en: "Accessory catalog" },
  "settings.printers": { de: "Drucker", en: "Printers" },
  "settings.numbering": { de: "Nummerierung", en: "Numbering" },
  "settings.numberingHint": { de: "Legt fest, wie die nächste Rechnungs- bzw. Angebotsnummer vorgeschlagen wird.", en: "Controls how the next invoice or quote number is suggested." },
  "settings.numberPrefix": { de: "Präfix", en: "Prefix" },
  "settings.nextNumber": { de: "Nächste Nummer", en: "Next number" },
  "settings.numberDigits": { de: "Stellen", en: "Digits" },
  "settings.costsTitle": { de: "Kosten & Standardwerte", en: "Costs & defaults" },
  "settings.save": { de: "Einstellungen speichern", en: "Save settings" },
  "db.title": { de: "Datenbank", en: "Database" },
  "db.description": { de: "Datenbankverbindung konfigurieren.", en: "Configure the database connection." },
  "db.driver": { de: "Treiber", en: "Driver" },
  "db.driverSqlite": { de: "SQLite (lokal)", en: "SQLite (local)" },
  "db.driverPostgres": { de: "PostgreSQL", en: "PostgreSQL" },
  "db.driverMysql": { de: "MySQL / MariaDB", en: "MySQL / MariaDB" },
  "db.host": { de: "Host", en: "Host" },
  "db.port": { de: "Port", en: "Port" },
  "db.database": { de: "Datenbank", en: "Database" },
  "db.user": { de: "Benutzer", en: "User" },
  "db.password": { de: "Passwort", en: "Password" },
  "db.passwordKeepPlaceholder": { de: "Aktuelles Passwort beibehalten", en: "Keep current password" },
  "db.passwordPlaceholder": { de: "Passwort eingeben", en: "Enter password" },
  "db.passwordNote": { de: "Das Passwort wird nur für die Verbindung verwendet und nicht gespeichert.", en: "The password is used only for the connection and is not stored." },
  "db.testing": { de: "Verbindung testen…", en: "Testing connection…" },
  "db.save": { de: "Speichern", en: "Save" },
  "db.saved": { de: "Gespeichert", en: "Saved" },
  "db.connectionFailed": { de: "Verbindung fehlgeschlagen", en: "Connection failed" },
  "db.saveFailed": { de: "Speichern fehlgeschlagen", en: "Save failed" },
  "db.transferConfirm": { de: "Datenbank wechseln?", en: "Switch database?" },
  "theme.toLight": { de: "Helles Design aktivieren", en: "Switch to light mode" },
  "theme.toDark": { de: "Dunkles Design aktivieren", en: "Switch to dark mode" },
  "settings.materialName": { de: "Materialname", en: "Material name" },
  "settings.materialType": { de: "Typ", en: "Type" },
  "settings.addMaterial": { de: "+ Material hinzufügen", en: "+ Add material" },
  "settings.accessoryName": { de: "Zubehörname", en: "Accessory name" },
  "settings.unitsPerPack": { de: "Einheiten/Pack", en: "Units/pack" },
  "settings.costPerUnit": { de: "Preis pro Einheit", en: "Price per unit" },
  "settings.addAccessoryMaterial": { de: "+ Zubehör hinzufügen", en: "+ Add accessory" },
  "settings.selectPrinter": { de: "Drucker auswählen", en: "Select printer" },
  "settings.addPrinter": { de: "+ Drucker hinzufügen", en: "+ Add printer" },
  "settings.exportPrinterProfiles": { de: "Profile exportieren", en: "Export profiles" },
  "settings.importPrinterProfiles": { de: "Profile importieren", en: "Import profiles" },
  "settings.printerProfilesImported": { de: "{count} Druckerprofil(e) importiert. Zum Speichern beim ausgewählten Drucker auf „Drucker speichern“ klicken.", en: "{count} printer profile(s) imported. Click “Save printer” for the selected printer to save your changes." },
  "settings.printerProfilesInvalid": { de: "Die Datei ist ungültig oder hat nicht das erwartete 3D-PCC-Format für Druckerprofile.", en: "The file is invalid or does not use the expected 3D-PCC printer-profile format." },
  "settings.printerProfilesTooLarge": { de: "Die Datei ist zu groß. Erlaubt sind maximal 1 MB.", en: "The file is too large. The maximum size is 1 MB." },
  "settings.useAsDefault": { de: "Als Standard verwenden", en: "Use as default" },
  "settings.printerName": { de: "Druckername", en: "Printer name" },
  "settings.powerConsumption": { de: "Leistung (W)", en: "Power consumption (W)" },
  "settings.purchasePrice": { de: "Kaufpreis", en: "Purchase price" },
  "settings.lifetimeHours": { de: "Lebensdauer (h)", en: "Lifetime (h)" },
  "settings.maintenanceCost": { de: "Wartungskosten", en: "Maintenance cost" },
  "settings.electricityPrice": { de: "Strompreis", en: "Electricity price" },
  "settings.wearAndTear": { de: "Verschleiß", en: "Wear and tear" },
  "settings.laborRate": { de: "Arbeitskosten", en: "Labor rate" },
  "settings.defaultLaborMinutes": { de: "Standard-Arbeitszeit (Minuten)", en: "Default labor time (minutes)" },
  "settings.defaultPackaging": { de: "Standard-Verpackung", en: "Default packaging" },
  "settings.defaultMargin": { de: "Standard-Gewinnmarge (%)", en: "Default margin (%)" },
  "settings.tax": { de: "Standard-MwSt. (%)", en: "Default tax (%)" },
  "settings.savePrinter": { de: "Drucker speichern", en: "Save printer" },
  "settings.saved": { de: "Gespeichert", en: "Saved" },
  "settings.newMaterial": { de: "Neues Material", en: "New material" },
  "settings.newAccessory": { de: "Neue Schraube", en: "New screw" },
  "settings.newPrinter": { de: "Neuer Drucker", en: "New printer" },
  "cost.material": { de: "Material", en: "Material" },
  "cost.electricity": { de: "Strom", en: "Electricity" },
  "cost.machine": { de: "Maschine", en: "Machine" },
  "cost.labor": { de: "Arbeitszeit", en: "Labor" },
  "cost.subtotal": { de: "Zwischensumme", en: "Subtotal" },
  "cost.totalPrice": { de: "Gesamtpreis", en: "Total price" },
  "cost.perGram": { de: "Preis pro Gramm: {price}", en: "Price per gram: {price}" },
  "cost.saved": { de: "Gespeichert", en: "Saved" },
  "extra.modalTitle": { de: "Zusätzliche Kosten hinzufügen", en: "Add additional cost" },
  "extra.selectAccessory": { de: "Zubehör auswählen", en: "Select accessory" },
  "extra.manualEntry": { de: "Manuelle Eingabe", en: "Manual entry" },
  "extra.unit": { de: "Stk.", en: "unit" },
  "extra.name": { de: "Name", en: "Name" },
  "extra.namePlaceholder": { de: "z. B. Versandkosten", en: "e.g. shipping cost" },
  "extra.costPerUnit": { de: "Kosten pro Einheit", en: "Cost per unit" },
  "extra.addAction": { de: "Hinzufügen", en: "Add" },
  "invoice.tab": { de: "Rechnungsvorlagen", en: "Invoice templates" },
  "invoice.builderTitle": { de: "Rechnungsdesigner", en: "Invoice designer" },
  "invoice.builderSubtitle": { de: "Gestalte deine Rechnung frei auf einem Blatt: Text, Bilder, QR-Codes und mehr.", en: "Freely design your invoice on a sheet: text, images, QR codes and more." },
  "invoice.documentTitle": { de: "Rechnung", en: "Invoice" },
  "invoice.addTemplate": { de: "+ Vorlage hinzufügen", en: "+ Add template" },
  "invoice.templateName": { de: "Vorlagenname", en: "Template name" },
  "invoice.blockType": { de: "Feldtyp", en: "Field type" },
  "invoice.blockText": { de: "Text", en: "Text" },
  "invoice.blockVariables": { de: "Variablen", en: "Variables" },
  "invoice.blockImage": { de: "Bild", en: "Image" },
  "invoice.blockQrcode": { de: "QR-Code", en: "QR code" },
  "invoice.blockLineItems": { de: "Positionen", en: "Line items" },
  "invoice.blockTotals": { de: "Summen", en: "Totals" },
  "invoice.blockQrCode": { de: "QR-Code", en: "QR code" },
  "invoice.preview": { de: "Vorschau", en: "Preview" },
  "invoice.loading": { de: "Vorschau wird geladen…", en: "Loading preview…" },
  "invoice.deleteTemplate": { de: "Vorlage löschen", en: "Delete template" },
  "invoice.deleteBlock": { de: "Löschen", en: "Delete" },
  "invoice.addText": { de: "+ Text", en: "+ Text" },
  "invoice.addImage": { de: "+ Bild", en: "+ Image" },
  "invoice.addQrCode": { de: "+ QR-Code", en: "+ QR code" },
  "invoice.newFieldText": { de: "Neues Textfeld", en: "New text field" },
  "invoice.portrait": { de: "Hochformat", en: "Portrait" },
  "invoice.landscape": { de: "Querformat", en: "Landscape" },
  "invoice.loadSamplePreview": { de: "Beispiel laden & Vorschau", en: "Load sample & preview" },
  "invoice.backToEditor": { de: "Zurück zum Editor", en: "Back to editor" },
  "invoice.imagePlaceholder": { de: "Bild", en: "Image" },
  "invoice.imageUrl": { de: "Bild-URL", en: "Image URL" },
  "invoice.imageUpload": { de: "Bild hochladen", en: "Upload image" },
  "invoice.qrValue": { de: "QR-Code-Inhalt", en: "QR code value" },
  "invoice.qrSize": { de: "Größe", en: "Size" },
  "invoice.fontSize": { de: "Schriftgröße", en: "Font size" },
  "invoice.align": { de: "Ausrichtung", en: "Alignment" },
  "invoice.alignLeft": { de: "Links", en: "Left" },
  "invoice.alignCenter": { de: "Mittig", en: "Center" },
  "invoice.alignRight": { de: "Rechts", en: "Right" },
  "invoice.hiddenLines": { de: "Sichtbare Positionen", en: "Visible lines" },
  "invoice.distribute": { de: "Auf andere Positionen verteilen", en: "Distribute onto other lines" },
  "invoice.showInTotals": { de: "In der Summe anzeigen", en: "Show in totals" },
  "invoice.width": { de: "Breite", en: "Width" },
  "invoice.height": { de: "Höhe", en: "Height" },
  "invoice.variables": { de: "Verfügbare Variablen", en: "Available variables" },
  "invoice.variablesHint": { de: "Anklicken fügt die Variable in das ausgewählte Textfeld ein, sonst wird sie kopiert.", en: "Click to insert into the selected text field, otherwise it is copied." },
  "invoice.variableCopied": { de: "In Zwischenablage kopiert", en: "Copied to clipboard" },
  "invoice.var.companyName": { de: "Firmenname", en: "Company name" },
  "invoice.var.companyAddress": { de: "Firmenanschrift", en: "Company address" },
  "invoice.var.companyEmail": { de: "Firmen-E-Mail", en: "Company email" },
  "invoice.var.companyPhone": { de: "Firmentelefon", en: "Company phone" },
  "invoice.var.companyTaxId": { de: "USt-ID / Steuernummer", en: "Tax ID" },
  "invoice.var.companyIban": { de: "IBAN", en: "IBAN" },
  "invoice.var.customerName": { de: "Kundenname", en: "Customer name" },
  "invoice.var.customerAddress": { de: "Kundenanschrift", en: "Customer address" },
  "invoice.var.invoiceNumber": { de: "Rechnungs-/Angebotsnummer", en: "Invoice/quote number" },
  "invoice.var.invoiceDate": { de: "Rechnungs-/Angebotsdatum", en: "Invoice/quote date" },
  "invoice.var.dueDate": { de: "Fälligkeitsdatum / gültig bis", en: "Due date / valid until" },
  "invoice.var.paymentTerms": { de: "Zahlungsbedingungen", en: "Payment terms" },
  "invoice.var.printName": { de: "Name des Drucks", en: "Print name" },
  "invoice.var.printWeight": { de: "Gewicht des Drucks", en: "Print weight" },
  "invoice.var.printTime": { de: "Druckzeit", en: "Print time" },
  "invoice.var.quantity": { de: "Menge", en: "Quantity" },
  "invoice.var.subtotal": { de: "Zwischensumme", en: "Subtotal" },
  "invoice.var.margin": { de: "Gewinnmarge", en: "Margin" },
  "invoice.var.tax": { de: "Steuerbetrag", en: "Tax amount" },
  "invoice.var.vatPercent": { de: "Steuersatz (%)", en: "Tax rate (%)" },
  "invoice.var.total": { de: "Gesamtbetrag", en: "Total amount" },

  "print.deleting": { de: "Wird gelöscht...", en: "Deleting..." },
};

export function translate(
  language: Language,
  key: string,
  vars?: Record<string, string | number>,
  languagePacks: LanguagePack[] = [],
): string {
  const packTranslation = languagePacks.find((pack) => pack.code === language)?.translations[key];
  const fallbackLanguage = language === "de" ? "de" : "en";
  let value = packTranslation ?? strings[key]?.[fallbackLanguage] ?? key;
  for (const [name, replacement] of Object.entries(vars ?? {})) value = value.replace(`{${name}}`, String(replacement));
  return value;
}

export function getIntlLocale(language: Language): string {
  return language === "de" ? "de-DE" : language === "en" ? "en-US" : language;
}

export function createLanguagePackTemplate(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(strings).map(([key, translations]) => [key, translations.en]),
  );
}

export function parseLocalizedNumber(value: string, language: Language): number {
  const locale = getIntlLocale(language);
  const numberFormat = new Intl.NumberFormat(locale);
  const digitFormat = new Intl.NumberFormat(locale, { useGrouping: false });
  const parts = numberFormat.formatToParts(12345.6);
  const decimal = parts.find((part) => part.type === "decimal")?.value ?? ".";
  const group = parts.find((part) => part.type === "group")?.value;
  let normalized = value.trim();

  for (let digit = 0; digit <= 9; digit += 1) {
    normalized = normalized.split(digitFormat.format(digit)).join(String(digit));
  }
  const minusSign = numberFormat.formatToParts(-1).find((part) => part.type === "minusSign")?.value;
  if (minusSign) normalized = normalized.split(minusSign).join("-");

  if (normalized.includes(decimal)) {
    if (group) normalized = normalized.split(group).join("");
    if (group && /\s/u.test(group)) normalized = normalized.replace(/[\s\u00a0\u202f]/gu, "");
    normalized = normalized.replace(decimal, ".");
  } else if (group && /\s/u.test(group)) {
    normalized = normalized.replace(/[\s\u00a0\u202f]/gu, "");
  }

  return Number.parseFloat(normalized);
}

export function parseLanguagePack(value: unknown): LanguagePack {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("The file must contain a JSON object.");
  }

  const candidate = value as Record<string, unknown>;
  if (typeof candidate.code !== "string" || typeof candidate.name !== "string") {
    throw new Error('The language pack must have "code" and "name" strings.');
  }

  let code: string;
  try {
    code = Intl.getCanonicalLocales(candidate.code.trim())[0] ?? "";
  } catch {
    throw new Error('"code" must be a valid BCP 47 language tag, such as "fr" or "pt-BR".');
  }
  if (!code || code === "de" || code === "en") {
    throw new Error('The code must be a language not already built in ("de" and "en" are reserved).');
  }

  const name = candidate.name.trim();
  if (!name || name.length > 80) {
    throw new Error('"name" must contain between 1 and 80 characters.');
  }
  if (!candidate.translations || typeof candidate.translations !== "object" || Array.isArray(candidate.translations)) {
    throw new Error('"translations" must be an object containing translation keys and text.');
  }

  const entries = Object.entries(candidate.translations);
  if (entries.length === 0 || entries.length > 2000) {
    throw new Error('"translations" must contain between 1 and 2000 entries.');
  }
  const validatedEntries: [string, string][] = [];
  for (const [key, translation] of entries) {
    if (!key.trim() || typeof translation !== "string" || translation.length > 10000) {
      throw new Error("Each translation must have a non-empty key and a text value of at most 10000 characters.");
    }
    validatedEntries.push([key, translation]);
  }
  return { code, name, translations: Object.fromEntries(validatedEntries) };
}

export function currencySymbol(currency: Currency, language: Language = "de"): string {
  return getCurrencySymbol(currency, language);
}
