# 💥 Bomber Cup Bot

Turnier-Bot für **EA FC Pro Clubs**. Er kann:
- Anmeldung, Check-in, Gruppen und Turnierbaum
- Ergebnisse mit Bestätigung, Live-Spielplan, Hall of Fame, TOTT
- Tickets, Shop
- 🏅 Abzeichen, 💎 Premium, 🛡️ Moderation
- 👋 Willkommens- und Tschüss-Karten

Er läuft auf dem eigenen Server (Contabo + Coolify). Discord ruft den Bot über `https://bombercup.botifystore.eu/api/interactions` auf.

## Sicher-Modus (Standard: AN)
Der Bot fasst **nur seine eigenen Sachen** an. Alle seine Kanäle, Kategorien und Rollen beginnen mit **„1“**:
- Kanäle: `1・📝・ANMELDUNG`
- Kategorien: `1 ・ 🏟️ BOMBER CUP`
- Rollen: `1 Spieler`, `1 💎 Premium`

Was der Bot im Sicher-Modus nicht macht:
- fremde Kanäle verknüpfen, umbenennen, ihre Rechte ändern oder darin Nachrichten löschen
- @everyone ändern
- Spitznamen ändern

Diese Einstellungen schalten das ab:
- `SAFE_MODE=0`: ganzer Sicher-Modus aus (nur auf einem eigenen, leeren Server)
- `NICKNAMES=1`: Spitznamen „Name VM | Verein“ erlauben

## Coolify
- **Build Pack:** Dockerfile
- **Port:** 3000
- **Domain:** `https://bombercup.botifystore.eu`
- **Persistent Storage:** Volume → Destination `/data`
- **Environment Variables:**
  ```
  DISCORD_TOKEN=…          (Bot → Reset Token)
  DISCORD_PUBLIC_KEY=…     (General Information → Public Key)
  DISCORD_APP_ID=…         (General Information → Application ID)
  DISCORD_GUILD_ID=1069680093741461565
  SETUP_KEY=…              (eigenes Passwort, nur Buchstaben/Zahlen)
  PUBLIC_URL=https://bombercup.botifystore.eu
  ```

## Discord verbinden
1. Developer Portal → **Interactions Endpoint URL:** `https://bombercup.botifystore.eu/api/interactions`
2. Befehle eintragen: `https://bombercup.botifystore.eu/api/setup?key=SETUP_KEY`
3. Im Server: `/cup-einrichten alles` → legt die „1“-Kanäle und -Rollen an

## Befehle (neu)
- `/profil [spieler]`: Abzeichen, Titel, Statistik
- `/premium geben|entfernen|liste` (nur Turnierleitung)
- `/mod verwarnen|verwarnungen|verwarnungen-löschen|timeout|kick|bann|entbannen|automod`

## Bilder neu bauen
`node tools-bilder-erstellen.mjs "C:/Users/musti/Desktop/Bomber Cup"`

Das Skript braucht `logo-discord.png` und `einladung-hintergrund.png` in diesem Ordner.
