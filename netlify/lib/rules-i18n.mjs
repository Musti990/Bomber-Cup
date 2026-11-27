// =========================================================
// 📜 Bomber-Cup-Regelwerk in 3 Sprachen: Deutsch (im Kanal), Englisch + Türkisch (per Knopf, nur für den Klickenden).
// Aufbau wie im Bot üblich: title, highlight (roter Kasten), sections: [[Überschrift, Text], …]
// Wird das deutsche Regelwerk im Discord bearbeitet, bleiben diese Übersetzungen der Standard-Stand.
// =========================================================

export const RULES_DE = {
  title: "💣 BOMBER CUP – TURNIERREGELN",
  highlight: {
    title: "🚫 CHEATS = SOFORTIGE DISQUALIFIKATION",
    text: "Das Ausnutzen von Cheats führt zur **sofortigen Disqualifikation** und zum **Bann aus der Community**.",
  },
  sections: [
    ["⏰ Turnierstart & Einladung",
      "💣 **Turnierstart: 21:00 Uhr**\n💣 **Einladezeit: 5 Minuten** – danach wird das Spiel **nicht mehr verlassen**\n💣 Die Freigabe erfolgt im Kanal **🗓️ Freigabe**"],
    ["⚽ Spielregeln",
      "💣 **11 Mann Pflicht**\n💣 **Any und TW Pflicht**\n💣 **Nachjoinen verboten**\n💣 Es gilt das **Regelwerk BC**\n💣 Bei Freistoß **auf die Torlinie stellen verboten**\n💣 **TW blockieren/behindern im 16er verboten**\n💣 **11 Meter lupfen erlaubt**\n💣 **Jedes Spielsystem erlaubt**\n💣 Playstyles, Perks und Verstärkungen: **alle erlaubt**"],
    ["📺 Stream",
      "💣 **Streampflicht beim Kommentieren**"],
    ["⏱️ Unentschieden nach 90 Minuten",
      "**1.** Verlängerung und Elfmeterschießen\n**2.** Verbindungsabbruch in der Verlängerung und **ein Team führt**: Die **restliche Zeit** wird nachgespielt – sonst gilt die **5-Shot-Regel**"],
    ["🎯 5-Shot-Regel – wann?",
      "Nur wenn das Spiel in der **90. Minute oder in der Verlängerung abstürzt** und es **unentschieden** steht.\nDann verlassen alle das Spiel, besetzen den **Any** und tragen es aus: **5 Schützen je Team**, von der **Mittellinie 1 gegen 1 gegen den Torwart**.\n\nFührt ein Team (z. B. **2:1 in der 105. Minute**) und das Spiel stürzt ab, gibt es **kein 5-Shot** – stattdessen wird die **Differenz bis zur 120. Minute** gespielt (hier 15 Minuten Ingame-Zeit).\n📢 Fällt dabei der Ausgleich, entscheidet sofort ein **Golden Goal**. Bleibt es unentschieden, geht es zurück zum **5-Shot**. So verliert das führende Team seinen Vorteil nicht."],
    ["🎯 5-Shot-Regel – Ablauf",
      "• Spieler dürfen **nicht in die eigene Hälfte** laufen – es gilt **Mittellinien- bzw. Stand-Pflicht**. Verstoß: Defwin oder Tor zählt nicht\n• **Keine Nachschüsse**\n• **Keeper dürfen nicht foulen** – führt eine Grätsche o. Ä. zum Elfmeter, wird dieser regulär geschossen und gewertet\n• **Zurückziehen verboten**: laufen, skillen o. Ä. und **innerhalb von 15 Sekunden** schießen – Zurückziehen = keine Wertung\n• Fliegt der Any aus dem Spiel: **Stand aufschreiben**, verlassen und ab diesem Stand weiterspielen\n• Alle Verstöße werden **sofort geahndet** – je nach Ausmaß und Einigung wird abgewogen"],
    ["📏 Größenregelung (CM) · 3er-Kette",
      "• TW: **max. 192 cm**\n• IVs: **max. 187 cm**\n• Alle anderen: **max. 182 cm**"],
    ["📏 Größenregelung (CM) · 4er-Kette",
      "• TW: **max. 192 cm**\n• 2 IVs und 1 ZDM **oder** AV: **max. 187 cm**\n• Alle anderen: **max. 182 cm**"],
    ["🎥 Größenkontrolle",
      "Die Kontrolle liegt bei den Teams: **Videobeweis im CM**, beide Teams müssen zu sehen sein. Ein Verstoß führt **sofort zum Defwin**.\nDas Größenvideo muss **bis zur Halbzeit** gefordert werden – nach der Halbzeitpause zählt eine Forderung nicht mehr."],
    ["🗓️ Zeitplan Gruppenphase",
      "**21:00 Uhr** – Spieltag 1\n**21:25 Uhr** – Spieltag 2\n**21:50 Uhr** – Spieltag 3\n**22:15 Uhr** – Spieltag 4\n**22:40 Uhr** – Spieltag 5\n**ca. 23:15 Uhr** – Start K.-o.-Phase"],
  ],
};

export const RULES_EN = {
  title: "💣 BOMBER CUP – TOURNAMENT RULES",
  highlight: {
    title: "🚫 CHEATING = IMMEDIATE DISQUALIFICATION",
    text: "Using cheats leads to **immediate disqualification** and a **ban from the community**.",
  },
  sections: [
    ["⏰ Start & invite",
      "💣 **Tournament start: 9:00 pm (21:00)**\n💣 **Invite time: 5 minutes** – after that, **nobody leaves the match**\n💣 Matches are released in the **🗓️ Freigabe** channel"],
    ["⚽ Match rules",
      "💣 **11 players required**\n💣 **Any and GK required**\n💣 **Joining late is not allowed**\n💣 The **BC rulebook** applies\n💣 **Standing on the goal line at free kicks is not allowed**\n💣 **Blocking/obstructing the GK in the box is not allowed**\n💣 **Chipped penalties are allowed**\n💣 **Any formation is allowed**\n💣 Playstyles, perks and boosts: **all allowed**"],
    ["📺 Stream",
      "💣 **Streaming is required when commentating**"],
    ["⏱️ Draw after 90 minutes",
      "**1.** Extra time and penalty shootout\n**2.** Disconnect during extra time and **one team is leading**: the **remaining time** is played – otherwise the **5-shot rule** applies"],
    ["🎯 5-shot rule – when?",
      "Only if the match **crashes in the 90th minute or in extra time** and the score is **level**.\nEveryone leaves the match, takes the **Any** and plays it out: **5 shooters per team**, from the **halfway line 1 vs 1 against the goalkeeper**.\n\nIf a team is leading (e.g. **2–1 in the 105th minute**) and the match crashes, there is **no 5-shot** – instead the **difference to 120 minutes** is played (here 15 minutes in-game time).\n📢 If the other team equalises, it is decided straight away by a **golden goal**. If it stays level, it goes back to the **5-shot**. This way the leading team never loses its advantage."],
    ["🎯 5-shot rule – procedure",
      "• Players may **not run into their own half** – **halfway line / stand-still rule**. Breaking it: default win or the goal doesn't count\n• **No rebounds**\n• **Goalkeepers may not foul** – if a tackle etc. leads to a penalty, it is taken and counted as normal\n• **No pulling back**: run, skill etc. and shoot **within 15 seconds** – pulling back = no score\n• If the Any drops out: **write down the score**, leave and continue from that score\n• All violations are **punished immediately** – depending on severity and agreement"],
    ["📏 Height rules (CM) · back three",
      "• GK: **max. 192 cm**\n• CBs: **max. 187 cm**\n• Everyone else: **max. 182 cm**"],
    ["📏 Height rules (CM) · back four",
      "• GK: **max. 192 cm**\n• 2 CBs and 1 CDM **or** fullback: **max. 187 cm**\n• Everyone else: **max. 182 cm**"],
    ["🎥 Height check",
      "Checking is up to the teams: **video proof in CM**, both teams must be visible. A violation means an **immediate default win**.\nThe height video must be requested **before half-time** – after the half-time break a request no longer counts."],
    ["🗓️ Group stage schedule",
      "**9:00 pm** – Matchday 1\n**9:25 pm** – Matchday 2\n**9:50 pm** – Matchday 3\n**10:15 pm** – Matchday 4\n**10:40 pm** – Matchday 5\n**approx. 11:15 pm** – Knockout stage starts"],
  ],
};

export const RULES_TR = {
  title: "💣 BOMBER CUP – TURNUVA KURALLARI",
  highlight: {
    title: "🚫 HİLE = ANINDA DİSKALİFİYE",
    text: "Hile kullanmak **anında diskalifiye** ve **topluluktan ban** ile sonuçlanır.",
  },
  sections: [
    ["⏰ Başlangıç & davet",
      "💣 **Turnuva başlangıcı: 21:00**\n💣 **Davet süresi: 5 dakika** – sonrasında **maçtan çıkılmaz**\n💣 Maçlar **🗓️ Freigabe** kanalında açılır"],
    ["⚽ Maç kuralları",
      "💣 **11 oyuncu zorunlu**\n💣 **Any ve kaleci zorunlu**\n💣 **Sonradan maça girmek yasak**\n💣 **BC kural kitabı** geçerlidir\n💣 Serbest vuruşta **kale çizgisine dizilmek yasak**\n💣 **Ceza sahasında kaleciyi bloklamak/engellemek yasak**\n💣 **Penaltıda aşırtma serbest**\n💣 **Her diziliş serbest**\n💣 Playstyle, perk ve güçlendirmeler: **hepsi serbest**"],
    ["📺 Yayın",
      "💣 **Yorum yaparken yayın açmak zorunlu**"],
    ["⏱️ 90 dakika sonunda beraberlik",
      "**1.** Uzatma ve penaltı atışları\n**2.** Uzatmada bağlantı koparsa ve **bir takım öndeyse**: **kalan süre** oynanır – aksi halde **5-Shot kuralı** uygulanır"],
    ["🎯 5-Shot kuralı – ne zaman?",
      "Sadece maç **90. dakikada veya uzatmada çökerse** ve skor **berabereyse**.\nHerkes maçtan çıkar, **Any**'ye geçer ve sonucu belirler: **takım başına 5 atıcı**, **orta çizgiden kaleciye karşı 1'e 1**.\n\nBir takım öndeyse (ör. **105. dakikada 2-1**) ve maç çökerse **5-Shot yok** – bunun yerine **120. dakikaya kadar kalan süre** oynanır (burada oyun içi 15 dakika).\n📢 Rakip eşitlerse hemen **altın gol** ile karar verilir. Beraberlik sürerse **5-Shot**'a dönülür. Böylece önde olan takım avantajını kaybetmez."],
    ["🎯 5-Shot kuralı – uygulama",
      "• Oyuncular **kendi yarı sahalarına koşamaz** – **orta çizgi / sabit durma zorunlu**. İhlal: hükmen galibiyet veya gol sayılmaz\n• **Dönen topa vuruş yok**\n• **Kaleciler faul yapamaz** – kayarak müdahale vb. penaltıya yol açarsa penaltı normal şekilde atılır ve sayılır\n• **Geri çekmek yasak**: koş, beceri yap vb. ve **15 saniye içinde** şut çek – geri çekmek = sayılmaz\n• Any oyundan düşerse: **skor not edilir**, çıkılır ve o skordan devam edilir\n• Tüm ihlaller **anında cezalandırılır** – ihlalin boyutuna ve uzlaşmaya göre karar verilir"],
    ["📏 Boy kuralı (CM) · 3'lü savunma",
      "• Kaleci: **en fazla 192 cm**\n• Stoperler: **en fazla 187 cm**\n• Diğer herkes: **en fazla 182 cm**"],
    ["📏 Boy kuralı (CM) · 4'lü savunma",
      "• Kaleci: **en fazla 192 cm**\n• 2 stoper ve 1 ön libero **veya** bek: **en fazla 187 cm**\n• Diğer herkes: **en fazla 182 cm**"],
    ["🎥 Boy kontrolü",
      "Kontrol takımların sorumluluğundadır: **CM'de video kanıtı**, iki takım da görünmelidir. İhlal **anında hükmen galibiyet** demektir.\nBoy videosu **devre arasına kadar** istenmelidir – devre arasından sonra istek geçersizdir."],
    ["🗓️ Grup aşaması programı",
      "**21:00** – 1. maç günü\n**21:25** – 2. maç günü\n**21:50** – 3. maç günü\n**22:15** – 4. maç günü\n**22:40** – 5. maç günü\n**yaklaşık 23:15** – Eleme aşaması başlar"],
  ],
};

export const RULES_BY_LANG = { de: RULES_DE, en: RULES_EN, tr: RULES_TR };
