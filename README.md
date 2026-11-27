# ⚡ Bomber Cup Bot – auf eigenem Server (Contabo, Docker)

Gleicher Bot wie auf Netlify – nur auf deinem Server. Vorteile: **keine Zeitlimits** (keine abgeschnittenen Posts),
Daten liegen bei dir im Ordner `data/`.

## 1. Server vorbereiten (einmalig)
Per SSH einloggen (Windows: PowerShell → `ssh root@DEINE-IP`, Passwort aus der Contabo-Mail), dann:
```bash
curl -fsSL https://get.docker.com | sh
```

## 2. Adresse für HTTPS
Discord braucht **https://**. Zwei Möglichkeiten:
- **Ohne Domain (einfach):** `DEINE-IP` mit Bindestrichen + `.sslip.io`, z. B. IP `85.215.10.20` → `85-215-10-20.sslip.io`
- **Mit eigener Domain:** A-Eintrag `bot.deine-domain.de` → Server-IP

## 3. Bot hochladen & starten
```bash
mkdir -p /opt/apex && cd /opt/apex
# ZIP hierher kopieren (z. B. mit WinSCP) und entpacken:
apt-get install -y unzip && unzip Apex-Bot-Server.zip
cp .env.example .env && nano .env     # Werte eintragen (Speichern: Strg+O, Enter, Strg+X)
nano Caddyfile                        # DEINE-ADRESSE ersetzen
docker compose up -d --build
docker compose logs -f apex           # „Bomber Cup Bot läuft …“ → Strg+C zum Verlassen
```
Test im Browser: `https://DEINE-ADRESSE` zeigt das Logo und „Bomber Cup Bot läuft ✅“.

## 4. Daten von Netlify übernehmen (Teams, Logos, Cups, Statistik, Kanäle)
Vorher auf Netlify die **neueste Version** deployen (sie hat den Export). Dann auf dem Server:
```bash
cd /opt/apex
docker compose run --rm bot node import-netlify.mjs https://statuesque-cupcake-4c791e.netlify.app DEIN_SETUP_KEY
docker compose restart apex
```

## 5. Discord umstellen
1. Developer Portal → **Interactions Endpoint URL:** `https://DEINE-ADRESSE/api/interactions` → Speichern
2. Befehle registrieren: `https://DEINE-ADRESSE/api/setup?key=DEIN_SETUP_KEY`
3. Fertig – Netlify-Seite danach löschen oder pausieren (sonst laufen die Timer doppelt!)

## Wartung
```bash
cd /opt/apex
docker compose logs -f apex          # Protokoll
docker compose restart apex          # Neustart
docker compose up -d --build         # nach einem Update (neue Dateien hochgeladen)
tar czf backup-$(date +%F).tgz data  # Sicherung aller Daten
```
