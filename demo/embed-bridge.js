(() => {
  'use strict';
  if (window.parent === window) return;
  const channel = 'epitown-demo-v1';
  let ready = false;
  let failed = false;
  // Local files have an opaque messaging origin even where Location reports file://.
  const origin = location.protocol === 'file:' ? 'null' : location.origin;
  const targetOrigin = origin === 'null' ? '*' : origin;
  function send(type) { window.parent.postMessage({channel, type}, targetOrigin); }
  function pause() {
    const play = document.getElementById('play');
    const tour = document.getElementById('case-auto');
    // These labels are set by the unchanged civic-v1 playback state machine.
    if (play && play.textContent.trim() === '暂停') play.click();
    if (tour && tour.textContent.trim() === '暂停演示') tour.click();
  }
  function check() {
    if (ready || failed) return;
    const loading = document.getElementById('loading');
    const play = document.getElementById('play');
    if (loading && loading.hidden && play && !play.disabled) {
      ready = true;
      observer.disconnect();
      send('ready');
      if (document.hidden) pause();
    } else if (loading && loading.textContent.includes('失败')) {
      failed = true;
      observer.disconnect();
      send('error');
    }
  }
  const observer = new MutationObserver(check);
  observer.observe(document.body, {subtree:true,attributes:true,childList:true,characterData:true});
  window.addEventListener('message', event => {
    if (event.source !== window.parent || event.origin !== origin) return;
    const message = event.data;
    if (!message || message.channel !== channel) return;
    if (message.type === 'pause') pause();
    if (message.type === 'hello') { if (ready) send('ready'); else if (failed) send('error'); else check(); }
  });
  window.addEventListener('error', () => {if (!ready && !failed) {failed = true;observer.disconnect();send('error');}});
  document.addEventListener('visibilitychange', () => {if (document.hidden) pause();});
  check();
})();
