// 必ず最初に `setupNextTrigger` を実行すること
function setupNextTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(t => {
    if (t.getHandlerFunction() === 'keepAlive') {
      ScriptApp.deleteTrigger(t);
    }
  });

  const minMinutes = 10;
  const maxMinutes = 14;

  const minMs = minMinutes * 60 * 1000;
  const maxMs = maxMinutes * 60 * 1000;

  const randomMs = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  const nextTime = new Date(Date.now() + randomMs);

  ScriptApp.newTrigger('keepAlive')
    .timeBased()
    .at(nextTime)
    .create();
}

function keepAlive() {
  const url = 'https://kaeru-log.onrender.com/'; // 任意のURL
  UrlFetchApp.fetch(url, { muteHttpExceptions: true });

  setupNextTrigger();
}
