/**
 * RefTrack - 7/24 Google Drive & Telegram Bulut Otomasyonu
 * 
 * Bu script Google Apps Script (script.google.com) üzerinde bağımsız çalışır.
 * Bilgisayarınız veya telefonunuz kapalı olsa dahi her gün belirlediğiniz saatlerde
 * (Örn: Sabah 08:00 ve Akşam 20:00) Drive klasöründeki maç tablolarını otomatik tarar,
 * Şemsettin Kemal Atak adına maç bulduğunda doğrudan telefonunuza Telegram mesajı gönderir.
 * 
 * KURULUM (2 Dakika):
 * 1. https://script.google.com adresine gidin ve "Yeni Proje" butonuna tıklayın.
 * 2. Bu dosyadaki tüm kodları yapıştırın.
 * 3. Aşağıdaki TELEGRAM_BOT_TOKEN ve TELEGRAM_CHAT_ID alanlarını doldurun.
 * 4. Fonksiyon listesinden "testTelegramGonder()" seçip "Çalıştır"a basın (Telegram testi için).
 * 5. "kurulumuYap()" fonksiyonunu seçip "Çalıştır" butonuna basın. (Gerekli izinleri onaylayın)
 * 6. Tebrikler! Artık Google bulutu her gün otomatik olarak maçlarınızı kontrol edip Telegram'dan bildirecek.
 */

// ─── AYARLAR ─────────────────────────────────────────────────────────────
const TELEGRAM_BOT_TOKEN = "BURAYA_BOT_TOKEN_GIRIN"; // Telegram BotFather tokeni
const TELEGRAM_CHAT_ID   = "BURAYA_CHAT_ID_GIRIN";   // Telegram @userinfobot chat ID
const DRIVE_FOLDER_ID    = "0ByPao_qBUjN-YXJZSG5Fancybmc";

// ─── TARİH AYRIŞTIRICI (TÜRKÇE DESTEKLİ) ──────────────────────────────────
function parseDateGas(val) {
  if (!val) return "";
  if (Object.prototype.toString.call(val) === '[object Date]' || val instanceof Date) {
    return Utilities.formatDate(val, "GMT+3", "yyyy-MM-dd");
  }
  const s = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10);
  
  // DD.MM.YYYY veya DD/MM/YYYY
  const m2 = s.match(/(\d{1,2})[./](\d{1,2})[./](\d{4})/);
  if (m2) {
    const day = m2[1].length === 1 ? "0" + m2[1] : m2[1];
    const mon = m2[2].length === 1 ? "0" + m2[2] : m2[2];
    return `${m2[3]}-${mon}-${day}`;
  }

  // "3 Ekim 2026", "11 Şubat 2026 Çarşamba" vb.
  const ayMap = {
    'ocak':'01','subat':'02','şubat':'02','mart':'03','nisan':'04','mayis':'05','mayıs':'05','haziran':'06',
    'temmuz':'07','agustos':'08','ağustos':'08','eylul':'09','eylül':'09','ekim':'10','kasim':'11','kasım':'11','aralik':'12','aralık':'12'
  };
  const m1 = s.match(/(\d{1,2})\s+([a-zA-ZçğıöşüÇĞİÖŞÜ]+)\s+(\d{4})/);
  if (m1) {
    const normAy = m1[2].toLowerCase()
      .replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c');
    const ay = ayMap[normAy] || ayMap[m1[2].toLowerCase()] || '01';
    const day = m1[1].length === 1 ? "0" + m1[1] : m1[1];
    return `${m1[3]}-${ay}-${day}`;
  }
  return "";
}

// ─── HAKEM İSİM KONTROLÜ ──────────────────────────────────────────────────
function isMyReferee(str) {
  if (!str) return false;
  const n = String(str).toUpperCase()
    .replace(/İ/g, 'I').replace(/ı/g, 'I').replace(/Ş/g, 'S').replace(/ş/g, 'S').replace(/Ğ/g, 'G').replace(/ğ/g, 'G');
  return n.includes("KEMAL") && n.includes("ATAK");
}

// ─── TABLODAN MAÇLARI AYIKLAMA ────────────────────────────────────────────
function scanSheetForMatches(sheet, fileName, results) {
  const data = sheet.getDataRange().getValues();
  if (!data || data.length === 0) return;

  let currentDate = "";

  for (let r = 0; r < data.length; r++) {
    const row = data[r];
    const rowStr = row.join(" ");

    // Satırda veya ilk hücrelerde tarih var mı?
    for (let c = 0; c < Math.min(row.length, 4); c++) {
      const d = parseDateGas(row[c]);
      if (d) {
        currentDate = d;
        break;
      }
    }

    if (isMyReferee(rowStr)) {
      let time = "";
      let role = "2. Hakem";
      let loc = "";
      let home = "";
      let away = "";

      for (let c = 0; c < row.length; c++) {
        const val = row[c];
        const cell = String(val || "").trim();
        if (!cell) continue;

        // Saat tespiti
        if (!time && /^\d{1,2}[:.]\d{2}$/.test(cell)) {
          time = cell.replace(".", ":");
        }

        // Hücre hakem hücresi mi?
        if (isMyReferee(cell)) {
          if (c === 7 || c === 8 || cell.includes("1") || cell.includes("Baş") || cell.includes("BAS")) {
            role = "Başhakem";
          }
        }
      }

      // Ev ve deplasman tespiti (klasik bölge sütunları 3 ve 4)
      if (row[3] && row[4] && !isMyReferee(row[3]) && !isMyReferee(row[4])) {
        home = String(row[3]).trim();
        away = String(row[4]).trim();
      } else {
        home = "Takım A";
        away = "Takım B";
      }

      // Salon tespiti (genellikle sütun 1)
      if (row[1] && typeof row[1] === 'string' && row[1].length > 3) {
        loc = String(row[1]).trim();
      }

      const matchDate = currentDate || parseDateGas(rowStr) || Utilities.formatDate(new Date(), "GMT+3", "yyyy-MM-dd");

      results.push({
        fileName: fileName,
        date: matchDate,
        time: time,
        role: role,
        home: home,
        away: away,
        location: loc,
        raw: row.filter(Boolean).slice(0, 8).join(" | ")
      });
    }
  }
}

// ─── GÜNLÜK OTOMATİK KONTROL (Tetikleyici ile çalışır) ────────────────────
function gunlukMacKontrolu() {
  Logger.log("RefTrack: Günlük maç kontrolü başlatıldı...");
  const folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
  const files = folder.getFiles();
  
  let matchesFound = [];
  const today = Utilities.formatDate(new Date(), "GMT+3", "yyyy-MM-dd");
  const tomorrow = Utilities.formatDate(new Date(Date.now() + 86400000), "GMT+3", "yyyy-MM-dd");

  while (files.hasNext()) {
    const file = files.next();
    const fileName = file.getName();
    const lowerName = fileName.toLowerCase();
    if (!lowerName.includes("hafta") && !lowerName.includes("okul") && !lowerName.includes("özel") && !lowerName.includes("ozel") && !lowerName.includes("üni") && !lowerName.includes("uni")) {
      continue;
    }

    try {
      if (file.getMimeType() === MimeType.GOOGLE_SHEETS) {
        const ss = SpreadsheetApp.openById(file.getId());
        const sheets = ss.getSheets();
        for (const sheet of sheets) {
          scanSheetForMatches(sheet, fileName, matchesFound);
        }
      }
    } catch(e) {
      Logger.log("Dosya inceleme hatası (" + fileName + "): " + e.message);
    }
  }

  Logger.log("Toplam Kemal Atak maçı bulundu: " + matchesFound.length);
  if (matchesFound.length === 0) return;

  const props = PropertiesService.getScriptProperties();

  // 1. Bugünün maçları
  const todayMatches = matchesFound.filter(m => m.date === today);
  for (const m of todayMatches) {
    const sentKey = `sent_today_${m.date}_${m.time}_${m.home}`;
    if (!props.getProperty(sentKey)) {
      telegramBildir(m, "🏀 BUGÜN MAÇIN VAR!");
      props.setProperty(sentKey, "true");
    }
  }

  // 2. Yarının maçları (Akşam saatlerinde hatırlat)
  const currentHour = new Date().getHours();
  if (currentHour >= 18) {
    const tomorrowMatches = matchesFound.filter(m => m.date === tomorrow);
    for (const m of tomorrowMatches) {
      const sentKey = `sent_tom_${m.date}_${m.time}_${m.home}`;
      if (!props.getProperty(sentKey)) {
        telegramBildir(m, "📅 YARIN MAÇIN VAR!");
        props.setProperty(sentKey, "true");
      }
    }
  }
}

// ─── TÜM GELECEK MAÇLARI ŞİMDİ TELEGRAM'A LİSTELE ───────────────────────
function tumGelecekMaclariListele() {
  Logger.log("Tüm gelecek maçlar taranıyor...");
  const folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
  const files = folder.getFiles();
  let matchesFound = [];
  const today = Utilities.formatDate(new Date(), "GMT+3", "yyyy-MM-dd");

  while (files.hasNext()) {
    const file = files.next();
    const lowerName = file.getName().toLowerCase();
    if (!lowerName.includes("hafta") && !lowerName.includes("okul") && !lowerName.includes("özel") && !lowerName.includes("ozel") && !lowerName.includes("üni") && !lowerName.includes("uni")) continue;
    try {
      if (file.getMimeType() === MimeType.GOOGLE_SHEETS) {
        const ss = SpreadsheetApp.openById(file.getId());
        for (const sheet of ss.getSheets()) {
          scanSheetForMatches(sheet, file.getName(), matchesFound);
        }
      }
    } catch(e) {}
  }

  const futureMatches = matchesFound.filter(m => m.date >= today);
  if (futureMatches.length === 0) {
    sendRawTelegram("ℹ️ <b>RefTrack:</b> Şu an Drive üzerinde ileri tarihli yeni maçınız bulunmuyor.");
    return;
  }

  let text = `🏀 <b>RefTrack Gelecek Maç Listeniz (${futureMatches.length} Maç)</b>\n\n`;
  futureMatches.forEach((m, idx) => {
    text += `<b>${idx + 1}. ${m.home} — ${m.away}</b>\n` +
            `📅 Tarih: <code>${m.date} ${m.time || ''}</code>\n` +
            `📍 Salon: <i>${m.location || '—'}</i>\n` +
            `👤 Görev: <b>${m.role}</b>\n` +
            `📁 Dosya: ${m.fileName}\n\n`;
  });

  sendRawTelegram(text);
}

// ─── TELEGRAM İLETİŞİM MOTORU ────────────────────────────────────────────
function telegramBildir(m, baslik) {
  const text = `${baslik}\n\n` +
               `⚔️ <b>${m.home} — ${m.away}</b>\n` +
               `📅 Tarih: <b>${m.date}</b>\n` +
               `⏰ Saat: <b>${m.time || '—'}</b>\n` +
               `📍 Salon: <b>${m.location || '—'}</b>\n` +
               `👤 Görev: <b>${m.role}</b>\n` +
               `📁 Dosya: <i>${m.fileName}</i>\n\n` +
               `🏀 <i>RefTrack 7/24 Bulut Sistemi</i>`;
  sendRawTelegram(text);
}

function sendRawTelegram(text) {
  if (TELEGRAM_BOT_TOKEN === "BURAYA_BOT_TOKEN_GIRIN" || TELEGRAM_CHAT_ID === "BURAYA_CHAT_ID_GIRIN") {
    Logger.log("Telegram tokeni veya Chat ID eksik.");
    return;
  }
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  try {
    UrlFetchApp.fetch(url, {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: text, parse_mode: "HTML" })
    });
  } catch(e) {
    Logger.log("Telegram gönderim hatası: " + e.message);
  }
}

function testTelegramGonder() {
  sendRawTelegram("🏀 <b>RefTrack Bulut Sistemi Test Mesajı!</b>\n\nGoogle Apps Script bot entegrasyonu başarıyla çalışıyor! 7/24 otomatik kontroller aktif.");
  Logger.log("Test mesajı tetiklendi.");
}

// ─── OTOMATİK KURULUM TETİKLEYİCİSİ ──────────────────────────────────────
function kurulumuYap() {
  const triggers = ScriptApp.getProjectTriggers();
  for (const t of triggers) {
    ScriptApp.deleteTrigger(t);
  }

  // Sabah 08:00
  ScriptApp.newTrigger("gunlukMacKontrolu")
    .timeBased()
    .atHour(8)
    .everyDays(1)
    .create();

  // Akşam 20:00
  ScriptApp.newTrigger("gunlukMacKontrolu")
    .timeBased()
    .atHour(20)
    .everyDays(1)
    .create();

  Logger.log("✅ Başarılı! Her gün saat 08:00 ve 20:00 için otomatik zamanlayıcılar kuruldu.");
}
