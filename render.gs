function keepAlive() {
  const url = 'https://kaeru-log.onrender.com/';
  UrlFetchApp.fetch(url, { muteHttpExceptions: true });
}

function setupTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(t => {
    if (t.getHandlerFunction() === 'keepAlive') {
      ScriptApp.deleteTrigger(t);
    }
  });

  ScriptApp.newTrigger('keepAlive')
    .timeBased()
    .everyMinutes(10)
    .create();
}
