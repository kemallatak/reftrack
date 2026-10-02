/**
 * RefTrack - 7/24 Google Drive & Telegram Otomasyonu
 * 
 * Bu script Google Apps Script (script.google.com) üzerinde çalışır.
 * Bilgisayarınız veya telefonunuz kapalı olsa dahi her gün belirlediğiniz saatlerde
 * (Örn: Sabah 08:00 ve Akşam 20:00) Drive klasöründeki maç tablolarını otomatik tarar,
 * Şemsettin Kemal Atak adına maç bulduğunda doğrudan telefonunuza Telegram mesajı atar.
 * 
 * KURULUM (2 Dakika):
 * 1. https://script.google.com adresine gidin ve "Yeni Proje" butonuna tıklayın.
 * 2. Bu dosyadaki tüm kodları yapıştırın.
 * 3. Aşağıdaki TELEGRAM_BOT_TOKEN ve TELEGRAM_CHAT_ID alanlarını doldurun.
 * 4. "kurulumuYap()" fonksiyonunu seçip "Çalıştır" butonuna basın. (Gerekli izinleri onaylayın)
 * 5. Tebrikler! Artık Google her gün otomatik olarak maçlarınızı kontrol edip Telegram'dan bildirecek.
 */

// ─── AYARLAR ─────────────────────────────────────────────────────────────
const TELEGRAM_BOT_TOKEN = "BURAYA_BOT_TOKEN_GIRIN"; // Örn: 7123456789:AAH...
const TELEGRAM_CHAT_ID   = "BURAYA_CHAT_ID_GIRIN";   // Örn: 123456789
const DRIVE_FOLDER_ID    = "0ByPao_qBUjN-YXJZSG5Fancybmc";
const REFEREE_NAME       = "KEMAL ATAK";

// ─── GÜNLÜK OTOMATİK KONTROL ─────────────────────────────────────────────
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
    const mimeType = file.getMimeType();

    // Sadece Bölge, Okul ve Özel Lig/Üniversite dosyalarını incele
    const lowerName = fileName.toLowerCase();
    if (!lowerName.includes("hafta") && !lowerName.includes("okul") && !lowerName.includes("özel") && !lowerName.includes("ozel") && !lowerName.includes("üni") && !lowerName.includes("uni")) {
      continue;
    }

    try {
      if (mimeType === MimeType.GOOGLE_SHEETS) {
        const ss = SpreadsheetApp.openById(file.getId());
        const sheets = ss.getSheets();
        for (const sheet of sheets) {
          scanSheetForMatches(sheet, fileName, matchesFound);
        }
      }
    } catch(e) {
      Logger.log("Dosya okuma hatası (" + fileName + "): " + e.message);
    }
  }

  Logger.log("Toplam bulunan maç sayısı: " + matchesFound.length);

  if (matchesFound.length === 0) {
    Logger.log("Aktif maç bulunamadı.");
    return;
  }

  // Maçları tarihe göre filtrele ve bildir
  const todayMatches = matchesFound.filter(m => m.date === today);
  const tomorrowMatches = matchesFound.filter(m => m.date === tomorrow);

  if (todayMatches.length > 0) {
    for (const m of todayMatches) {
      telegramBildir(m, "🏀 BUGÜN MAÇIN VAR!");
    }
  }

  const currentHour = new Date().getHours();
  // Akşam saatlerinde yarınki maçları da hatırlat
  if (tomorrowMatches.length > 0 && currentHour >= 18) {
    for (const m of tomorrowMatches) {
      telegramBildir(m, "📅 YARIN MAÇIN VAR!");
    }
  }
}

// ─── TABLODA KEMAL ATAK ARAMA ────────────────────────────────────────────
function isMyReferee(str) {
  if (!str) return false;
  const s = String(str).toUpperCase();
  // "ŞEMSETTİN KEMAL ATAK", "Ş. KEMAL ATAK", "KEMAL ATAK", "ATAK KEMAL" hepsini yakalar
  return s.includes("KEMAL ATAK") || (s.includes("KEMAL") && s.includes("ATAK"));
}

function scanSheetForMatches(sheet, fileName, results) {
  const data = sheet.getDataRange().getValues();
  for (let r = 0; r < data.length; r++) {
    const row = data[r];
    const rowStr = row.join(" ").toUpperCase();
    if (isMyReferee(rowStr)) {
      // Satırdan maç bilgilerini çıkar
      const match = parseMatchRow(row, fileName);
      if (match) results.push(match);
    }
  }
}

function parseMatchRow(row, fileName) {
  let date = "", time = "", role = "Hakem";
  
  for (let c = 0; c < row.length; c++) {
    const cell = String(row[c]).trim();
    if (!cell) continue;

    // Tarih tespiti
    if (!date && (/\d{1,2}[./]\d{1,2}[./]\d{4}/.test(cell) || /\d{4}-\d{2}-\d{2}/.test(cell))) {
      date = cell;
    }
    // Saat tespiti
    if (!time && /^\d{1,2}[:.]\d{2}$/.test(cell)) {
      time = cell.replace(".", ":");
    }
    // Rol tespiti
    if (cell.toUpperCase().includes(REFEREE_NAME)) {
      role = (c === 7 || c === 8 || cell.includes("1") || cell.includes("Baş")) ? "Başhakem" : "2. Hakem";
    }
  }

  return {
    fileName: fileName,
    date: date,
    time: time,
    role: role,
    raw: row.filter(Boolean).slice(0, 8).join(" | ")
  };
}

// ─── TELEGRAM GÖNDERİCİ ──────────────────────────────────────────────────
function telegramBildir(m, baslik) {
  if (TELEGRAM_BOT_TOKEN === "BURAYA_BOT_TOKEN_GIRIN" || TELEGRAM_CHAT_ID === "BURAYA_CHAT_ID_GIRIN") {
    Logger.log("Telegram ayarları yapılmamış.");
    return;
  }

  const text = `${baslik}\n\n` +
               `👤 Görev: <b>${m.role}</b>\n` +
               `📅 Tarih: <b>${m.date}</b>\n` +
               `⏰ Saat: <b>${m.time || '—'}</b>\n` +
               `📁 Dosya: <i>${m.fileName}</i>\n` +
               `📋 Detay: <code>${m.raw}</code>\n\n` +
               `🏀 <i>RefTrack 7/24 Bulut Sistemi</i>`;

  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  const payload = {
    chat_id: TELEGRAM_CHAT_ID,
    text: text,
    parse_mode: "HTML"
  };

  try {
    UrlFetchApp.fetch(url, {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload)
    });
    Logger.log("Telegram bildirimi gönderildi: " + m.date);
  } catch(e) {
    Logger.log("Telegram gönderim hatası: " + e.message);
  }
}

// ─── TEST VE OTOMATİK KURULUM ────────────────────────────────────────────
function testTelegramGonder() {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  const payload = {
    chat_id: TELEGRAM_CHAT_ID,
    text: "🏀 <b>RefTrack Bulut Sistemi Test Mesajı!</b>\n\nGoogle Apps Script bot entegrasyonu başarıyla çalışıyor! 7/24 kontroller aktif.",
    parse_mode: "HTML"
  };
  const res = UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload)
  });
  Logger.log("Test sonucu: " + res.getContentText());
}

/**
 * Bu fonksiyonu 1 kez çalıştırmanız yeterlidir.
 * Her sabah 08:00 ve her akşam 20:00 için otomatik zamanlayıcı (Trigger) kurar.
 */
function kurulumuYap() {
  // Eski tetikleyicileri temizle
  const triggers = ScriptApp.getProjectTriggers();
  for (const t of triggers) {
    ScriptApp.deleteTrigger(t);
  }

  // Sabah 08:00 tetikleyicisi
  ScriptApp.newTrigger("gunlukMacKontrolu")
    .timeBased()
    .atHour(8)
    .everyDays(1)
    .create();

  // Akşam 20:00 tetikleyicisi
  ScriptApp.newTrigger("gunlukMacKontrolu")
    .timeBased()
    .atHour(20)
    .everyDays(1)
    .create();

  Logger.log("✅ Başarılı! Her gün saat 08:00 ve 20:00 için otomatik kontrol tetikleyicileri kuruldu.");
}
