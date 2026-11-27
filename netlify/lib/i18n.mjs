// =========================================================
// 🌍 Sprache pro Spieler (Deutsch / Englisch / Türkisch).
// - Wer auf einen Sprachknopf (🇬🇧 / 🇹🇷 / 🇩🇪) drückt, dessen Sprache wird gemerkt.
// - Alles, was der Bot NUR diesem Spieler zeigt (private Fenster, Formulare, Antworten), wird übersetzt.
// - Öffentliche Nachrichten bleiben Deutsch (mit Sprachknöpfen).
// Übersetzt wird Satz für Satz über die Liste unten; was dort fehlt, bleibt Deutsch.
// =========================================================
import { get, mutate } from "./store.mjs";

export const LANGS = ["de", "en", "tr"];
export async function getLang(uid) {
  if (!uid) return "de";
  return ((await get("langs")) || {})[uid] || "de";
}
export async function setLang(uid, lang) {
  if (!uid || !LANGS.includes(lang)) return;
  await mutate("langs", (l) => { if (lang === "de") delete l[uid]; else l[uid] = lang; }, { initial: {} });
}

/** Sprachknöpfe für öffentliche Panels: custom_id "lang:<panel>:<sprache>" */
export function langButtons(panel) {
  const b = (label, lang, emoji) => ({ type: 2, style: 2, label, custom_id: `lang:${panel}:${lang}`, emoji: { name: emoji } });
  return { type: 1, components: [b("English", "en", "🇬🇧"), b("Türkçe", "tr", "🇹🇷"), b("Deutsch", "de", "🇩🇪")] };
}

// [Deutsch (Text oder RegExp), Englisch, Türkisch] – längere Sätze zuerst
const P = [
  // ---------- Rollenauswahl ----------
  ["Wähle hier deine Rolle für die Bomber Cup.", "Choose your role for the Bomber Cup here.", "Bomber Cup için rolünü burada seç."],
  ["🔓 **Erst mit einer Rolle siehst du alle Kanäle** des Servers.", "🔓 **You only see all channels** of the server **once you have a role**.", "🔓 Sunucunun **tüm kanallarını ancak bir rolün olduğunda görürsün**."],
  ["Du willst ein eigenes Team gründen und an den Cups teilnehmen? Die Rolle bekommst du sofort – danach registrierst du dein Team.", "Want to create your own team and play in the cups? You get the role instantly – then you register your team.", "Kendi takımını kurup kupalara katılmak mı istiyorsun? Rolü hemen alırsın – sonra takımını kaydedersin."],
  ["Du spielst in einer Mannschaft mit oder willst alles verfolgen? Die Rolle bekommst du sofort.", "You play in a team or want to follow everything? You get the role instantly.", "Bir takımda mı oynuyorsun ya da her şeyi takip etmek mi istiyorsun? Rolü hemen alırsın."],
  ["Wer Manager wird, verliert automatisch die Spieler-Rolle · Nochmal drücken entfernt die Rolle wieder.", "Becoming a manager automatically removes the player role · Pressing again removes the role.", "Menajer olan, oyuncu rolünü otomatik olarak kaybeder · Tekrar basmak rolü kaldırır."],
  ["🎭 ROLLENAUSWAHL", "🎭 ROLE SELECTION", "🎭 ROL SEÇİMİ"],
  ["Manager werden", "Become manager", "Menajer ol"],
  ["Spieler werden", "Become player", "Oyuncu ol"],
  ["✅ Du hast jetzt die Rolle **Spieler**. Viel Spaß bei der Bomber Cup!", "✅ You now have the **player** role. Have fun at the Bomber Cup!", "✅ Artık **oyuncu** rolün var. Bomber Cup'ta iyi eğlenceler!"],
  ["➖ Die Rolle **Spieler** wurde entfernt.", "➖ The **player** role was removed.", "➖ **Oyuncu** rolü kaldırıldı."],
  ["Ohne Rolle siehst du nur noch Willkommen, Regelwerk und Rollenauswahl. Ein Klick auf „Spieler werden“ gibt sie dir zurück.", "Without a role you only see welcome, rules and role selection. Clicking “Become player” gives it back.", "Rol olmadan sadece hoş geldin, kurallar ve rol seçimini görürsün. “Oyuncu ol”a tıklamak rolü geri verir."],
  ["Du bist Manager – die Spieler-Rolle brauchst du nicht zusätzlich.", "You are a manager – you don't need the player role as well.", "Menajersin – ayrıca oyuncu rolüne ihtiyacın yok."],
  [/✅ Du bist jetzt \*\*Manager\*\*! Die Spieler-Rolle wurde entfernt\.\nSuch dir jetzt deinen Verein aus/, "✅ You are now a **manager**! The player role was removed.\nNow register your team", "✅ Artık **menajersin**! Oyuncu rolü kaldırıldı.\nŞimdi takımını kaydet"],
  ["👍 Du bleibst Manager.", "👍 You stay manager.", "👍 Menajer olarak kalıyorsun."],
  ["Du bist kein Manager mehr.", "You are no longer a manager.", "Artık menajer değilsin."],
  ["**Manager-Rolle wirklich abgeben?**", "**Really give up the manager role?**", "**Menajer rolünü gerçekten bırakmak istiyor musun?**"],
  ["Du bekommst stattdessen die Rolle **Spieler**.", "You get the **player** role instead.", "Bunun yerine **oyuncu** rolünü alırsın."],

  // ---------- Regelwerk ----------
  ["✅ Du hast das Regelwerk bereits akzeptiert.", "✅ You have already accepted the rules.", "✅ Kuralları zaten kabul ettin."],
  ["✅ Danke! Du hast das Regelwerk akzeptiert und kannst dich jetzt zum Cup anmelden.", "✅ Thanks! You accepted the rules and can now sign up for the cup.", "✅ Teşekkürler! Kuralları kabul ettin, artık kupaya kaydolabilirsin."],
  ["Regeln akzeptieren", "Accept rules", "Kuralları kabul et"],

  // ---------- Meine Mannschaft ----------
  ["Hier verwaltest du deine Mannschaft: Co-VM, EA-Club, verlassen oder löschen.", "Manage your team here: co-managers, EA club, leave or delete.", "Takımını burada yönetirsin: yardımcı menajerler, EA kulübü, ayrılma veya silme."],
  ["Das Fenster kann nur der jeweilige Manager sehen.", "Only the respective manager can see this window.", "Bu pencereyi sadece ilgili menajer görebilir."],
  ["🛡️ Meine Mannschaft", "🛡️ My team", "🛡️ Takımım"],
  ["Meine Mannschaft öffnen", "Open my team", "Takımımı aç"],
  [/^Eigene Mannschaft/, "Own team", "Kendi takımı"],
  [" · Du bist **Co-VM**", " · You are a **co-manager**", " · **Yardımcı menajersin**"],
  ["Noch kein Logo – hochladen mit `/cup-logo bild:`", "No logo yet – upload with `/cup-logo bild:`", "Henüz logo yok – `/cup-logo bild:` ile yükle"],
  [/⚠️ kein EA-Club verknüpft/g, "⚠️ no EA club linked", "⚠️ EA kulübü bağlı değil"],
  [/⚠️ von EA nicht bestätigt/g, "⚠️ not confirmed by EA", "⚠️ EA tarafından onaylanmadı"],
  [/✅ verknüpft/g, "✅ linked", "✅ bağlı"],
  [/Noch kein Stream-Link/g, "No stream link yet", "Henüz yayın linki yok"],
  [/^Co-VMs \((\d+)\/(\d+)\)$/, "Co-managers ($1/$2)", "Yardımcı menajerler ($1/$2)"],
  ["✅ Siege", "✅ Wins", "✅ Galibiyet"],
  ["🤝 Unentschieden", "🤝 Draws", "🤝 Beraberlik"],
  ["❌ Niederlagen", "❌ Losses", "❌ Mağlubiyet"],
  ["⚽ Tore", "⚽ Goals", "⚽ Goller"],
  ["Co-VM hinzufügen", "Add co-manager", "Yardımcı menajer ekle"],
  ["Co-VM entfernen", "Remove co-manager", "Yardımcı menajeri çıkar"],
  ["EA-Club ändern", "Change EA club", "EA kulübünü değiştir"],
  ["Mannschaft verlassen", "Leave team", "Takımdan ayrıl"],
  ["Mannschaft löschen", "Delete team", "Takımı sil"],
  ["Als Co-VM austreten", "Leave as co-manager", "Yardımcı menajerlikten ayrıl"],
  [/^\*\*Wähle einen Co-VM\*\* \(bis zu (\d+) pro Mannschaft\)\. Er kann die Mannschaft anmelden, einchecken und Ergebnisse melden\. Er bekommt die Rolle Manager, die Rolle Spieler wird entfernt\.$/, "**Choose a co-manager** (up to $1 per team). They can sign up the team, check in and report results. They get the manager role, the player role is removed.", "**Bir yardımcı menajer seç** (takım başına en fazla $1). Takımı kaydedebilir, check-in yapabilir ve sonuç bildirebilir. Menajer rolünü alır, oyuncu rolü kaldırılır."],
  ["**Welchen Co-VM willst du entfernen?** Er bekommt die Rolle Spieler zurück.", "**Which co-manager do you want to remove?** They get the player role back.", "**Hangi yardımcı menajeri çıkarmak istiyorsun?** Oyuncu rolünü geri alır."],
  ["Mitglied auswählen", "Select member", "Üye seç"],
  ["Co-VM auswählen", "Select co-manager", "Yardımcı menajer seç"],
  ["Zurück", "Back", "Geri"],
  ["Abbrechen", "Cancel", "İptal"],
  ["Abgebrochen.", "Cancelled.", "İptal edildi."],
  ["Verlassen", "Leave", "Ayrıl"],
  ["Endgültig löschen", "Delete permanently", "Kalıcı olarak sil"],
  ["Du kannst dich nicht selbst als Co-VM eintragen.", "You can't add yourself as co-manager.", "Kendini yardımcı menajer olarak ekleyemezsin."],
  ["Bots können keine Co-VMs sein.", "Bots can't be co-managers.", "Botlar yardımcı menajer olamaz."],
  ["Dieses Mitglied gehört schon zu einer Mannschaft.", "This member already belongs to a team.", "Bu üye zaten bir takıma ait."],
  ["Das kann nur der Manager der Mannschaft.", "Only the team's manager can do that.", "Bunu sadece takımın menajeri yapabilir."],
  ["Während eure Mannschaft für einen Cup angemeldet ist, geht das nicht. Meldet euch zuerst ab oder wartet bis nach dem Cup.", "This isn't possible while your team is signed up for a cup. Sign out first or wait until after the cup.", "Takımınız bir kupaya kayıtlıyken bu mümkün değil. Önce kaydı silin veya kupa bitene kadar bekleyin."],
  ["Du hast noch keine Mannschaft – registriere dich in Team-registrieren.", "You don't have a team yet – register in Team-registrieren.", "Henüz takımın yok – Team-registrieren kanalında kaydol."],
  ["Das können nur Mitglieder mit der Rolle **Manager**.", "Only members with the **manager** role can do that.", "Bunu sadece **menajer** rolüne sahip üyeler yapabilir."],
  ["Du bist keiner Mannschaft zugeordnet.", "You are not assigned to any team.", "Hiçbir takıma atanmadın."],
  [/^Du bist als Co-VM von (.+) ausgetreten\.$/, "You left $1 as co-manager.", "$1 takımındaki yardımcı menajerlikten ayrıldın."],
  [/^Mannschaft gelöscht\. (.+) ist wieder frei\.$/, "Team deleted. $1 is free again.", "Takım silindi. $1 tekrar boşta."],
  [/^Du hast die Mannschaft verlassen\. (.+) ist jetzt Manager\.$/, "You left the team. $1 is now manager.", "Takımdan ayrıldın. Artık $1 menajer."],
  [/^Du hast die Mannschaft verlassen\. (.+) ist wieder frei\.$/, "You left the team. $1 is free again.", "Takımdan ayrıldın. $1 tekrar boşta."],
  [/^Mannschaft verlassen\? (.+) wird neuer Manager\.$/, "Leave the team? $1 becomes the new manager.", "Takımdan ayrılmak mı? $1 yeni menajer olur."],
  [/^Mannschaft verlassen\? (.+) wird für alle frei\.$/, "Leave the team? $1 becomes free for everyone.", "Takımdan ayrılmak mı? $1 herkes için boşa çıkar."],
  [/^Mannschaft wirklich löschen\? (.+) wird für alle frei, und eure Statistiken werden gelöscht\. Das kann nicht rückgängig gemacht werden\.$/, "Really delete the team? $1 becomes free for everyone and your statistics are deleted. This can't be undone.", "Takımı gerçekten silmek mi? $1 herkes için boşa çıkar ve istatistikleriniz silinir. Bu geri alınamaz."],

  // ---------- Stream-Link ----------
  ["Twitch, YouTube, Kick oder TikTok (leer = löschen)", "Twitch, YouTube, Kick or TikTok (empty = delete)", "Twitch, YouTube, Kick veya TikTok (boş = sil)"],
  ["z. B. twitch.tv/deinkanal", "e.g. twitch.tv/yourchannel", "ör. twitch.tv/kanalin"],
  [/^📺 Stream-Link für (.+) gespeichert: (.+)$/, "📺 Stream link for $1 saved: $2", "📺 $1 için yayın linki kaydedildi: $2"],
  [/^🗑️ Stream-Link von (.+) gelöscht\.$/, "🗑️ Stream link of $1 deleted.", "🗑️ $1 yayın linki silindi."],
  ["Erlaubt sind nur Links zu **Twitch**, **YouTube**, **Kick** oder **TikTok**.", "Only links to **Twitch**, **YouTube**, **Kick** or **TikTok** are allowed.", "Sadece **Twitch**, **YouTube**, **Kick** veya **TikTok** linklerine izin verilir."],
  ["Das ist kein gültiger Link.", "That is not a valid link.", "Bu geçerli bir link değil."],

  // ---------- Registrierung ----------
  ["Mannschaften registrieren können nur Mitglieder mit der Rolle **Manager**.", "Only members with the **manager** role can register teams.", "Takımları sadece **menajer** rolüne sahip üyeler kaydedebilir."],
  ["Nur Mitglieder mit der Rolle **Manager** können registrieren.", "Only members with the **manager** role can register.", "Sadece **menajer** rolüne sahip üyeler kayıt olabilir."],
  ["Der Teamname braucht mindestens 3 Zeichen.", "The team name needs at least 3 characters.", "Takım adı en az 3 karakter olmalı."],
  ["Dieser Teamname ist nicht erlaubt (keine Sonderzeichen wie @ # * < >).", "This team name is not allowed (no special characters like @ # * < >).", "Bu takım adına izin verilmiyor (@ # * < > gibi özel karakterler olmamalı)."],
  ["Bitte den **EA-Clubnamen** eintragen – genau wie in EA FC.", "Please enter the **EA club name** – exactly as in EA FC.", "Lütfen **EA kulüp adını** gir – EA FC'deki gibi birebir."],
  ["Bitte den **EA-Clubnamen** eintragen.", "Please enter the **EA club name**.", "Lütfen **EA kulüp adını** gir."],
  ["Du hast bereits eine Mannschaft.", "You already have a team.", "Zaten bir takımın var."],
  [/^Den Namen (.+) gibt es schon – bitte einen anderen wählen\.$/, "The name $1 already exists – please choose another one.", "$1 adı zaten var – lütfen başka bir ad seç."],
  ["Das Logo muss ein **PNG**, **JPG** oder **WEBP** sein.", "The logo must be a **PNG**, **JPG** or **WEBP**.", "Logo **PNG**, **JPG** veya **WEBP** olmalı."],
  ["Das Logo ist zu groß – maximal **2 MB**.", "The logo is too big – maximum **2 MB**.", "Logo çok büyük – en fazla **2 MB**."],
  [/^Du bist Co-VM von (.+) und kannst keine eigene Mannschaft registrieren\.$/, "You are co-manager of $1 and can't register your own team.", "$1 takımının yardımcı menajerisin ve kendi takımını kaydedemezsin."],
  [/^Du bist bereits Manager von (.+)\.$/, "You are already manager of $1.", "Zaten $1 takımının menajerisin."],
  [/^🛡️ \*\*Willkommen, Manager von (.+)!\*\*/, "🛡️ **Welcome, manager of $1!**", "🛡️ **Hoş geldin, $1 menajeri!**"],
  [/🔗 EA-Club: /g, "🔗 EA club: ", "🔗 EA kulübü: "],
  ["⚠️ EA war gerade nicht erreichbar – später unter *Meine Mannschaft → EA-Club ändern* verknüpfen", "⚠️ EA wasn't reachable – link it later under *My team → Change EA club*", "⚠️ EA'ya şu an ulaşılamadı – daha sonra *Takımım → EA kulübünü değiştir* altından bağla"],
  ["🖼️ Logo gespeichert", "🖼️ Logo saved", "🖼️ Logo kaydedildi"],
  ["🖼️ Kein Logo – nachholen mit `/cup-logo bild:`", "🖼️ No logo – add it later with `/cup-logo bild:`", "🖼️ Logo yok – sonra `/cup-logo bild:` ile ekle"],
  [/Deine Mannschaft findest du in /g, "You'll find your team in ", "Takımını şurada bulursun: "],
  [/^🔎 Mehrere Clubs zu „(.+)“ gefunden\. \*\*Welcher ist deiner\?\*\*$/, "🔎 Several clubs found for “$1”. **Which one is yours?**", "🔎 “$1” için birden fazla kulüp bulundu. **Hangisi seninki?**"],

  // ---------- Anmeldung ----------
  ["🟢 **Anmeldung offen**", "🟢 **Sign-up open**", "🟢 **Kayıt açık**"],
  ["🟡 **Check-in läuft** in den Gruppenkanälen", "🟡 **Check-in running** in the group channels", "🟡 **Check-in** grup kanallarında **devam ediyor**"],
  ["⚽ **Gruppenphase läuft**", "⚽ **Group stage running**", "⚽ **Grup aşaması devam ediyor**"],
  ["🔥 **K.-o.-Phase läuft**", "🔥 **Knockout stage running**", "🔥 **Eleme aşaması devam ediyor**"],
  ["🏆 **Turnier beendet**", "🏆 **Tournament finished**", "🏆 **Turnuva bitti**"],
  [/⏰ \*\*Anpfiff\*\* /g, "⏰ **Kick-off** ", "⏰ **Başlama** "],
  [/👥 \*\*(\d+)\/(\d+) Mannschaften\*\* · 20 Min pro Runde/, "👥 **$1/$2 teams** · 20 min per round", "👥 **$1/$2 takım** · tur başına 20 dk"],
  [/### 🏟️ Turnierplan: (\d+)er-Format/, "### 🏟️ Tournament plan: $1-team format", "### 🏟️ Turnuva planı: $1 takımlı format"],
  ["### ⚠️ Noch kein Format", "### ⚠️ No format yet", "### ⚠️ Henüz format yok"],
  [/\*\*Gruppen:\*\*/g, "**Groups:**", "**Gruplar:**"],
  [/\*\*Weiter:\*\* (\d+) von (\d+)/g, "**Advance:** $1 of $2", "**Tur atlayan:** $2 takımdan $1"],
  [/\*\*K\.-o\. ab:\*\* /g, "**Knockout from:** ", "**Eleme başlangıcı:** "],
  ["**Platz 1 + 2**", "**1st + 2nd place**", "**1. + 2. sıra**"],
  [/\*\*Gruppensieger\*\*/g, "**Group winners**", "**Grup birincileri**"],
  [/\*\*(\d+) beste Zweite\*\*/g, "**$1 best runners-up**", "**en iyi $1 ikinci**"],
  [/\*\*(\d+) beste Dritte\*\*/g, "**$1 best third-placed**", "**en iyi $1 üçüncü**"],
  [/\*\*raus\*\*/g, "**out**", "**elenir**"],
  [/noch \*\*(\d+) Mannschaften?\*\* bis zum \*\*(\d+)er\*\*/g, "**$1 more team(s)** to the **$2-team format**", "**$2 takımlı formata** **$1 takım** kaldı"],
  ["Mindestens **8 Mannschaften** nötig, damit der Cup stattfindet.", "At least **8 teams** are needed for the cup to take place.", "Kupanın yapılması için en az **8 takım** gerekli."],
  ["Maximales Format erreicht – weitere Mannschaften kommen auf die Warteliste.", "Maximum format reached – more teams go on the waiting list.", "Maksimum formata ulaşıldı – diğer takımlar bekleme listesine girer."],
  ["Bei unterschiedlich großen Gruppen zählt der Punkteschnitt pro Spiel.", "With groups of different sizes, the points average per match counts.", "Farklı büyüklükteki gruplarda maç başına puan ortalaması geçerlidir."],
  [/### ⏰ Ablauf/, "### ⏰ Schedule", "### ⏰ Program"],
  [/ Anmeldeschluss · /g, " sign-up closes · ", " kayıt kapanışı · "],
  [/ Auslosung · /g, " draw · ", " kura · "],
  [/ Check-in-Ende · /g, " check-in ends · ", " check-in sonu · "],
  [/ Anpfiff$/gm, " kick-off", " başlama"],
  [/### 👥 Mannschaften \(/, "### 👥 Teams (", "### 👥 Takımlar ("],
  [/ · davon (\d+) Freilos/g, " · incl. $1 bye(s)", " · $1 bay dahil"],
  ["_Noch keine Anmeldungen_", "_No sign-ups yet_", "_Henüz kayıt yok_"],
  ["**⏳ Warteliste**", "**⏳ Waiting list**", "**⏳ Bekleme listesi**"],
  ["Rückt nach, wenn eine Mannschaft nicht eincheckt.", "Moves up if a team doesn't check in.", "Bir takım check-in yapmazsa yerine geçer."],
  ["🎟️ Wer gegen ein Freilos spielt, gewinnt automatisch 3:0. Freilose kommen nie weiter.", "🎟️ Playing against a bye means an automatic 3–0 win. Byes never advance.", "🎟️ Bay'a karşı oynayan otomatik 3-0 kazanır. Bay'ler asla tur atlamaz."],
  ["💎 Premium-Teams haben bei der Anmeldung Vorrang.", "💎 Premium teams have priority when signing up.", "💎 Premium takımların kayıtta önceliği var."],
  [/🎟️ \*\*Freilos\*\*/g, "🎟️ **Bye**", "🎟️ **Bay**"],
  ["Anmelden", "Sign up", "Kaydol"],
  ["Abmelden", "Sign out", "Kaydı sil"],
  ["Warteliste: Einchecken", "Waiting list: check in", "Bekleme listesi: check-in"],
  ["Du brauchst zuerst eine Mannschaft – registriere dich in Team-registrieren.", "You need a team first – register in Team-registrieren.", "Önce bir takıma ihtiyacın var – Team-registrieren kanalında kaydol."],
  ["Anmelden können nur Manager mit einer Mannschaft.", "Only managers with a team can sign up.", "Sadece takımı olan menajerler kaydolabilir."],
  [/^📜 Bitte akzeptiere zuerst das Regelwerk(.*) – danach kannst du deine Mannschaft anmelden\.$/, "📜 Please accept the rules first$1 – then you can sign up your team.", "📜 Lütfen önce kuralları kabul et$1 – sonra takımını kaydedebilirsin."],
  [/^(.+) ist angemeldet – \*\*Warteliste Platz (\d+)\*\*\.$/, "$1 is signed up – **waiting list spot $2**.", "$1 kaydoldu – **bekleme listesi sırası $2**."],
  [/^(.+) ist angemeldet – Platz (\d+)\.$/, "$1 is signed up – spot $2.", "$1 kaydoldu – sıra $2."],
  ["Deine Mannschaft wurde abgemeldet.", "Your team was signed out.", "Takımının kaydı silindi."],
  ["✅ Auf der Warteliste eingecheckt – du rückst nach, falls eine Mannschaft nicht eincheckt.", "✅ Checked in on the waiting list – you move up if a team doesn't check in.", "✅ Bekleme listesinde check-in yapıldı – bir takım check-in yapmazsa yerine geçersin."],
  ["✅ Eingecheckt.", "✅ Checked in.", "✅ Check-in yapıldı."],
  [/^✅ (.+) ist eingecheckt\. Viel Erfolg!$/, "✅ $1 is checked in. Good luck!", "✅ $1 check-in yaptı. Bol şans!"],
  ["In diesem Kanal gibt es gerade keine Anmeldung.", "There is no sign-up in this channel right now.", "Bu kanalda şu an kayıt yok."],
  ["Die Anmeldung ist geschlossen.", "Sign-up is closed.", "Kayıt kapandı."],
  ["Die Anmeldung ist schon geschlossen.", "Sign-up is already closed.", "Kayıt zaten kapandı."],
  ["Deine Mannschaft ist bereits angemeldet.", "Your team is already signed up.", "Takımın zaten kayıtlı."],
  ["Abmelden geht nur, solange die Anmeldung offen ist.", "Signing out is only possible while sign-up is open.", "Kayıt silme sadece kayıt açıkken mümkün."],
  ["Deine Mannschaft ist nicht angemeldet.", "Your team is not signed up.", "Takımın kayıtlı değil."],
  ["Der Check-in ist gerade nicht offen.", "Check-in is not open right now.", "Check-in şu an açık değil."],
  ["Deine Mannschaft ist bereits eingecheckt.", "Your team is already checked in.", "Takımın zaten check-in yaptı."],
  ["Du bist auf der Warteliste bereits eingecheckt.", "You are already checked in on the waiting list.", "Bekleme listesinde zaten check-in yaptın."],
  ["Deine Mannschaft ist heute nicht dabei.", "Your team is not playing today.", "Takımın bugün oynamıyor."],
  ["Es läuft gerade kein Check-in.", "No check-in is running right now.", "Şu an check-in yok."],
  ["Gerade läuft kein Cup.", "No cup is running right now.", "Şu an kupa yok."],
  [/^⭐ Gruppe ([A-H]) · Check-in$/, "⭐ Group $1 · Check-in", "⭐ Grup $1 · Check-in"],
  [/^Bitte bis (.+) einchecken\. Wer nicht eincheckt, wird durch die Warteliste ersetzt\./m, "Please check in by $1. Teams that don't check in are replaced from the waiting list.", "Lütfen $1'e kadar check-in yap. Check-in yapmayanların yerine bekleme listesinden takım girer."],
  [/Eingecheckt: (\d+)\/(\d+)/g, "Checked in: $1/$2", "Check-in: $1/$2"],
  ["Einchecken", "Check in", "Check-in yap"],

  // ---------- Ergebnisse / Spiele ----------
  ["Für welches Spiel willst du das Ergebnis melden?", "Which match do you want to report the result for?", "Hangi maçın sonucunu bildirmek istiyorsun?"],
  ["Spiel auswählen", "Select match", "Maç seç"],
  [/^Tore (.+)$/, "Goals $1", "Goller $1"],
  ["Elfmeter, nur bei Unentschieden (z. B. 4:3)", "Penalties, only if drawn (e.g. 4:3)", "Penaltılar, sadece beraberlikte (ör. 4:3)"],
  ["leer lassen, wenn kein Remis", "leave empty if not a draw", "beraberlik yoksa boş bırak"],
  [/^Ergebnis · Spiel #(\d+)$/, "Result · Match #$1", "Sonuç · Maç #$1"],
  ["Deine Mannschaft hat gerade kein offenes Spiel.", "Your team has no open match right now.", "Takımının şu an açık maçı yok."],
  ["Deine Mannschaft hat gerade kein laufendes Spiel.", "Your team has no match in progress right now.", "Takımının şu an devam eden maçı yok."],
  ["Dieses Spiel ist nicht mehr offen.", "This match is no longer open.", "Bu maç artık açık değil."],
  ["Dieses Spiel ist bereits abgeschlossen.", "This match is already finished.", "Bu maç zaten bitti."],
  ["Deine Mannschaft spielt nicht in diesem Spiel.", "Your team is not playing in this match.", "Takımın bu maçta oynamıyor."],
  ["Bitte bei beiden Mannschaften die Tore als Zahl eintragen.", "Please enter the goals for both teams as numbers.", "Lütfen iki takımın gollerini sayı olarak gir."],
  ["Elfmeter bitte so angeben: `4:3`", "Please enter penalties like this: `4:3`", "Penaltıları şöyle gir: `4:3`"],
  ["K.-o.-Spiele brauchen einen Sieger: bei Unentschieden bitte das Elfmeterergebnis angeben (z. B. 4:3).", "Knockout matches need a winner: if drawn, please enter the penalty result (e.g. 4:3).", "Eleme maçlarında kazanan olmalı: beraberlikte lütfen penaltı sonucunu gir (ör. 4:3)."],
  ["Das Elfmeterschießen kann nicht unentschieden enden.", "A penalty shootout can't end in a draw.", "Penaltı atışları berabere bitemez."],
  ["Ungültiges Ergebnis.", "Invalid result.", "Geçersiz sonuç."],
  ["Bestätigen muss der Gegner.", "The opponent has to confirm.", "Rakip onaylamalı."],
  ["Für dieses Spiel wurde noch kein Ergebnis gemeldet.", "No result has been reported for this match yet.", "Bu maç için henüz sonuç bildirilmedi."],
  ["Für dieses Spiel gibt es einen Konflikt – die Turnierleitung entscheidet.", "There is a conflict for this match – the tournament staff decides.", "Bu maç için anlaşmazlık var – turnuva yönetimi karar verir."],
  ["Dieses Spiel kann nicht mehr geändert werden (die Runde ist schon vorbei).", "This match can no longer be changed (the round is already over).", "Bu maç artık değiştirilemez (tur zaten bitti)."],
  ["Ergebnis melden", "Report result", "Sonuç bildir"],
  ["Größenvideo anfordern", "Request height video", "Boy videosu iste"],
  ["Bestätigen", "Confirm", "Onayla"],
  ["Anderes Ergebnis", "Different result", "Farklı sonuç"],
  ["Bitte die aktuelle Spielminute als Zahl eintragen.", "Please enter the current match minute as a number.", "Lütfen mevcut maç dakikasını sayı olarak gir."],
  ["Ihr habt in diesem Spiel schon ein Größenvideo angefordert.", "You already requested a height video in this match.", "Bu maçta zaten boy videosu istediniz."],

  // ---------- Support / Bewerbung ----------
  ["Du hast eine Frage, ein Problem mit einem Spiel oder willst etwas melden?", "Do you have a question, a problem with a match or want to report something?", "Bir sorun, maçla ilgili bir problem mi var ya da bir şey mi bildirmek istiyorsun?"],
  ["Öffne ein Ticket – nur du und das Staff-Team sehen es.", "Open a ticket – only you and the staff team can see it.", "Bir ticket aç – sadece sen ve ekip görebilir."],
  ["Pro Person ist ein offenes Ticket möglich.", "One open ticket per person.", "Kişi başına bir açık ticket mümkün."],
  ["Ticket öffnen", "Open ticket", "Ticket aç"],
  ["Problem mit Spiel/Ergebnis", "Problem with match/result", "Maç/sonuç sorunu"],
  ["Spieler melden", "Report player", "Oyuncu bildir"],
  ["Einspruch gegen Sperre", "Appeal a ban", "Yasağa itiraz"],
  ["Sonstiges", "Other", "Diğer"],
  [/^Du hast schon ein offenes Ticket: /, "You already have an open ticket: ", "Zaten açık bir ticket'ın var: "],
  ["Schließen kann nur die Person selbst oder das Staff-Team.", "Only the person or the staff team can close it.", "Sadece kişinin kendisi veya ekip kapatabilir."],
  ["🔒 **Ticket wirklich schließen?** Der Kanal wird gelöscht, der Verlauf wird nicht gespeichert.", "🔒 **Really close the ticket?** The channel is deleted, the history is not saved.", "🔒 **Ticket'ı gerçekten kapatmak mı?** Kanal silinir, geçmiş kaydedilmez."],
  ["Du willst das Team von der Bomber Cup unterstützen? Wähle eine Position und füll das kurze Formular aus.", "Want to support the Bomber Cup team? Choose a position and fill out the short form.", "Bomber Cup ekibine destek olmak mı istiyorsun? Bir pozisyon seç ve kısa formu doldur."],
  ["Die Admins melden sich bei dir im Benachrichtigungs-Kanal.", "The admins will get back to you in the notifications channel.", "Yöneticiler bildirim kanalında sana dönecek."],
  ["🔒 **Bewerbungen sind gerade geschlossen.** Schau später nochmal vorbei.", "🔒 **Applications are closed right now.** Check back later.", "🔒 **Başvurular şu an kapalı.** Daha sonra tekrar bak."],
  ["Hilft bei Streit, Regelverstößen und Sperren.", "Helps with disputes, rule violations and bans.", "Anlaşmazlıklar, kural ihlalleri ve yasaklarda yardım eder."],
  ["Beantwortet Tickets und hilft Mitgliedern weiter.", "Answers tickets and helps members.", "Ticket'ları yanıtlar ve üyelere yardım eder."],
  [/^Neu bewerben geht frühestens nach (\d+) Tagen\.$/, "You can apply again after $1 days at the earliest.", "En erken $1 gün sonra tekrar başvurabilirsin."],
  ["Jetzt bewerben", "Apply now", "Şimdi başvur"],
  ["Bewerbungen geschlossen", "Applications closed", "Başvurular kapalı"],
  ["📋 STAFF-BEWERBUNG", "📋 STAFF APPLICATION", "📋 EKİP BAŞVURUSU"],

  // ---------- Profil / Premium ----------
  ["🏅 Spieler-Profil", "🏅 Player profile", "🏅 Oyuncu profili"],
  [/^\*\*Abzeichen \((\d+)\)\*\*$/m, "**Badges ($1)**", "**Rozetler ($1)**"],
  ["Noch keine Abzeichen – spiel deinen ersten Cup! 🎟️", "No badges yet – play your first cup! 🎟️", "Henüz rozet yok – ilk kupanı oyna! 🎟️"],
  ["**Als Nächstes**", "**Up next**", "**Sıradaki**"],
  ["🔥 Alle Abzeichen freigeschaltet!", "🔥 All badges unlocked!", "🔥 Tüm rozetler açıldı!"],
  ["🏟️ Cups", "🏟️ Cups", "🏟️ Kupalar"],
  ["🏆 Titel", "🏆 Titles", "🏆 Şampiyonluklar"],
  ["📊 Spiele", "📊 Matches", "📊 Maçlar"],
  [/(\d+) S · (\d+) U · (\d+) N/g, "$1 W · $2 D · $3 L", "$1 G · $2 B · $3 M"],
  ["(unbegrenzt)", "(unlimited)", "(süresiz)"],

  // ---------- Feldnamen ----------
  ["Manager", "Manager", "Menajer"],
  ["EA-Club", "EA club", "EA kulübü"],
  ["Cups", "Cups", "Kupalar"],
  ["Titel", "Titles", "Şampiyonluk"],
  ["👔 Manager", "👔 Manager", "👔 Menajer"],
  ["⚽ Spieler", "⚽ Player", "⚽ Oyuncu"],
  ["📺 Stream", "📺 Stream", "📺 Yayın"],
  ["Ticket", "Ticket", "Ticket"],
  ["Frage", "Question", "Soru"],
  ["🛟 SUPPORT", "🛟 SUPPORT", "🛟 DESTEK"],

  // ---------- Allgemein ----------
  ["Unbekannter Button.", "Unknown button.", "Bilinmeyen buton."],
  ["Unbekanntes Formular.", "Unknown form.", "Bilinmeyen form."],
  ["Unbekannte Aktion.", "Unknown action.", "Bilinmeyen işlem."],
];

// Reihenfolge: zuerst Muster (RegExp), dann Sätze – lange vor kurzen.
// Kurze Begriffe ohne Satzzeichen (Knopf-Texte wie „Anmelden“) werden nur übersetzt, wenn sie der ganze Text sind.
const REGEX = P.filter((e) => typeof e[0] !== "string");
const STR = P.filter((e) => typeof e[0] === "string").sort((a, b) => b[0].length - a[0].length);
const exactOnly = (de) => !/[.!?:–·*(),\n]/.test(de) && de.split(" ").length <= 4 && de.length <= 40;
const cache = new Map();
function translateString(s, lang) {
  if (!s || typeof s !== "string" || lang === "de") return s;
  const k = lang + "\u0000" + s;
  if (cache.has(k)) return cache.get(k);
  const col = lang === "en" ? 1 : 2;
  let out = s;
  for (const e of REGEX) out = out.replace(e[0], e[col]);
  for (const e of STR) {
    const de = e[0], to = e[col];
    if (exactOnly(de)) { if (out.trim() === de) out = to; }
    else if (out.includes(de)) out = out.split(de).join(to);
  }
  if (cache.size > 5000) cache.clear();
  cache.set(k, out);
  return out;
}

const KEYS = new Set(["content", "title", "description", "name", "value", "label", "placeholder", "text"]);
/** Ganze Antwort (Nachricht, Embed, Komponenten, Formular) übersetzen – nur Text-Felder, keine IDs oder Links */
export function localize(obj, lang) {
  if (!obj || lang === "de" || !LANGS.includes(lang)) return obj;
  const walk = (o) => {
    if (Array.isArray(o)) return o.map(walk);
    if (!o || typeof o !== "object") return o;
    const r = {};
    for (const [k, v] of Object.entries(o)) {
      if (typeof v === "string" && KEYS.has(k)) r[k] = translateString(v, lang);
      else if (typeof v === "object") r[k] = walk(v);
      else r[k] = v;
    }
    return r;
  };
  return walk(obj);
}
export const t = translateString;
