function setupNextTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(t => {
    if (t.getHandlerFunction() === 'keepAlive') {
      ScriptApp.deleteTrigger(t);
    }
  });

  const min = 10;
  const max = 14;
  const randomMinutes = Math.floor(Math.random() * (max - min + 1)) + min;
  const nextTime = new Date(Date.now() + randomMinutes * 60 * 1000);

  ScriptApp.newTrigger('keepAlive')
    .timeBased()
    .at(nextTime)
    .create();

  console.log(`next run in ${randomMinutes} min`);
}

function keepAlive() {
  const now = new Date();
  const hour = now.getHours(); // 0〜23

  // 🌙 夜間停止（23:00〜5:00）
  if (hour >= 23 || hour < 5) {
    console.log('night time → skip keepAlive');
    scheduleMorningRestart();
    return;
  }

  // 通常実行
  const url = 'https://kaeru-log.onrender.com/'; // 任意のURLに設定
  UrlFetchApp.fetch(url, { muteHttpExceptions: true });

  setupNextTrigger();
}

function scheduleMorningRestart() {
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(t => ScriptApp.deleteTrigger(t));

  const now = new Date();
  const morning = new Date(now);
  morning.setHours(5, 0, 0, 0); // AM 5:00

  if (now > morning) {
    morning.setDate(morning.getDate() + 1);
  }

  ScriptApp.newTrigger('keepAlive')
    .timeBased()
    .at(morning)
    .create();

  console.log('scheduled restart at 5:00');
}
