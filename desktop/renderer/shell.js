// Titlebar, splash and offline screen. All state comes from the main process;
// this file only renders it and forwards button presses.
(() => {
  const { kessoku } = window;
  const body = document.body;
  const $ = (id) => document.getElementById(id);

  body.dataset.platform = kessoku.platform;

  const COPY = {
    offline: {
      heading: 'The stage went quiet.',
      body: "kessoku moe can't reach its server right now. Check your connection; we'll keep trying on our own.",
    },
    crashed: {
      heading: 'That page tripped over a cable.',
      body: 'Something on the page stopped responding. Give it another go.',
    },
  };

  // Auto-retry while offline: 5s, 10s, 20s, then every 30s. Coming back
  // online retries straight away.
  const BACKOFF = [5, 10, 20, 30];
  let attempt = 0;
  let countdown = null;
  let current = {};

  const stopCountdown = () => {
    clearInterval(countdown);
    countdown = null;
    $('offline-hint').textContent = '';
  };

  const scheduleRetry = () => {
    stopCountdown();
    let left = BACKOFF[Math.min(attempt, BACKOFF.length - 1)];
    const tick = () => {
      $('offline-hint').textContent = `Retrying in ${left}s`;
      if (left-- <= 0) {
        stopCountdown();
        retry();
      }
    };
    tick();
    countdown = setInterval(tick, 1000);
  };

  const retry = () => {
    attempt += 1;
    stopCountdown();
    $('offline-hint').textContent = 'Reconnecting…';
    kessoku.action('retry');
  };

  const render = (state) => {
    const was = current;
    current = state;
    body.dataset.status = state.status;
    body.dataset.loading = String(state.loading);
    body.dataset.focused = String(state.focused);
    body.dataset.fullscreen = String(state.fullscreen);
    body.dataset.retrying = String(state.retrying);

    $('title').textContent = state.status === 'ready' ? state.title : '';
    document.querySelector('[data-action="back"]').disabled = !state.canGoBack;
    document.querySelector('[data-action="forward"]').disabled = !state.canGoForward;

    const update = $('update');
    update.hidden = !(state.update && state.update.state === 'ready');
    if (!update.hidden) {
      $('update-label').textContent = `v${state.update.version} is ready`;
      update.title = 'Restart kessoku moe to update';
    }

    if (state.status === 'offline') {
      const copy = COPY[state.reason] || COPY.offline;
      $('offline-heading').textContent = copy.heading;
      $('offline-copy').textContent = copy.body;
      // A failed retry lands here again with retrying=false: queue the next.
      if (!state.retrying && (was.status !== 'offline' || was.retrying)) scheduleRetry();
    } else {
      attempt = 0;
      stopCountdown();
    }
  };

  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action]');
    if (!button || button.disabled) return;
    if (button.dataset.action === 'retry') {
      retry();
    } else {
      kessoku.action(button.dataset.action);
    }
  });

  window.addEventListener('online', () => {
    if (current.status === 'offline' && !current.retrying) retry();
  });

  kessoku.onState(render);
})();
