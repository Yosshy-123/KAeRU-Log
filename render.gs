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
  const url = 'https://kaeru-log.onrender.com/'; // 任意のURLに
  UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  setupNextTrigger();
}
