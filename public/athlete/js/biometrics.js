var Biometrics = (function () {
  var currentBpm = 120;

  function getStatus(bpm) {
    if (bpm >= 190) return 'emergency';
    if (bpm >= 170) return 'warning';
    return 'ok';
  }

  function send(bpm) {
    currentBpm = Math.min(220, Math.max(40, bpm));
    SocketClient.emit('update_heart_rate', currentBpm);
  }

  function setHeartRate(bpm) {
    currentBpm = Math.min(220, Math.max(40, bpm));
    UI.updateHeartRate(currentBpm, getStatus(currentBpm));
  }

  function changeBy(delta) {
    send(currentBpm + delta);
  }

  function setCritical() {
    send(195);
  }

  return {
    setHeartRate: setHeartRate,
    changeBy:     changeBy,
    setCritical:  setCritical,
  };

})();