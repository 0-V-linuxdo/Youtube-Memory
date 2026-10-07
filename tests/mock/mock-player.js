/*
 * A small stand-in for YouTube's #movie_player that reproduces the behaviours the
 * progress engine depends on: SPA navigation (URL and player change at different
 * moments), slow player start-up, pre-roll ads, YouTube resetting the position
 * after load, start-time links and live streams.
 */
(() => {
  const cfg = Object.assign({
    durations: {},       // id -> seconds (default 300)
    ads: {},             // id -> pre-roll ad length in seconds
    resetAfterLoad: {},  // id -> true: player jumps back to 0 once, ~700ms after load
    live: {},            // id -> true
    loadDelay: 300,      // ms between "load requested" and the video being ready
    playerCreateDelay: 0,
    autoplay: true
  }, window.__mockConfig || {});

  const state = { loadedId: null, duration: 0, time: 0, playing: false, ad: 0, adTime: 0, clicks: 0, loadToken: 0 };
  const player = document.createElement('div');
  player.id = 'movie_player';
  player.className = 'html5-video-player';
  const video = document.createElement('video');
  const bottom = document.createElement('div');
  bottom.className = 'ytp-chrome-bottom';
  const left = document.createElement('div');
  left.className = 'ytp-left-controls';
  left.appendChild(Object.assign(document.createElement('span'), { className: 'ytp-time-display', textContent: '0:00' }));
  bottom.appendChild(left);
  player.append(video, bottom);
  // Clicking the player toggles playback, like YouTube.
  player.addEventListener('click', () => { state.clicks++; state.playing = !state.playing; });

  const fire = name => video.dispatchEvent(new Event(name));

  player.getCurrentTime = () => (state.ad > 0 ? state.adTime : state.time);
  player.getDuration = () => (state.ad > 0 ? 15 : state.duration);
  player.getVideoData = () => ({ video_id: state.loadedId || '', title: state.loadedId ? `Original ${state.loadedId}` : '', isLive: Boolean(cfg.live[state.loadedId]) });
  player.seekTo = seconds => {
    if (state.ad > 0) return; // ignored during ads, like the real player
    state.time = Math.max(0, Math.min(state.duration, Number(seconds) || 0));
    fire('seeked');
  };
  player.pauseVideo = () => { state.playing = false; fire('pause'); };
  player.playVideo = () => { state.playing = true; fire('playing'); };

  function parseStart() {
    const params = new URLSearchParams(location.search);
    const raw = params.get('t') || params.get('start');
    return raw ? parseFloat(raw) || 0 : 0;
  }

  function load(id) {
    const token = ++state.loadToken;
    state.loadedId = null;
    state.duration = 0;
    state.time = 0;
    state.ad = 0;
    player.classList.remove('ad-showing');
    setTimeout(() => {
      if (token !== state.loadToken) return;
      state.loadedId = id;
      state.time = parseStart();
      state.playing = cfg.autoplay;
      if (cfg.ads[id]) {
        state.ad = cfg.ads[id];
        state.adTime = 0;
        player.classList.add('ad-showing');
      } else {
        state.duration = cfg.durations[id] || 300;
      }
      fire('loadedmetadata');
      if (cfg.resetAfterLoad[id]) {
        setTimeout(() => { if (token === state.loadToken) { state.time = 0; fire('seeked'); } }, 700);
      }
    }, cfg.loadDelay);
  }

  setInterval(() => {
    if (!state.playing || !state.loadedId) return;
    if (state.ad > 0) {
      state.adTime += 0.1;
      state.ad -= 0.1;
      if (state.ad <= 0.001) {
        state.ad = 0;
        player.classList.remove('ad-showing');
        state.duration = cfg.durations[state.loadedId] || 300;
        state.time = parseStart();
      }
      return;
    }
    if (cfg.live[state.loadedId]) { state.time += 0.1; return; }
    state.time = Math.min(state.duration, state.time + 0.1);
  }, 100);

  const urlId = () => new URLSearchParams(location.search).get('v');

  window.__mock = {
    state,
    player,
    // Normal YouTube SPA navigation: URL first, then the player loads the new video.
    nav(id, extra) {
      window.dispatchEvent(new Event('yt-navigate-start'));
      history.pushState({}, '', `/watch?v=${id}${extra || ''}`);
      window.dispatchEvent(new Event('yt-navigate-finish'));
      load(id);
    },
    // Player switches video before the URL changes (URL catches up after `lag` ms).
    navPlayerFirst(id, lag) {
      load(id);
      setTimeout(() => {
        history.pushState({}, '', `/watch?v=${id}`);
        window.dispatchEvent(new Event('yt-navigate-finish'));
      }, lag);
    },
    // URL changes but the player keeps showing the old video for `lag` ms.
    navUrlFirst(id, lag) {
      history.pushState({}, '', `/watch?v=${id}`);
      window.dispatchEvent(new Event('yt-navigate-finish'));
      setTimeout(() => load(id), lag);
    },
    home() {
      window.dispatchEvent(new Event('yt-navigate-start'));
      history.pushState({}, '', '/');
      window.dispatchEvent(new Event('yt-navigate-finish'));
    },
    pause: () => player.pauseVideo(),
    play: () => player.playVideo()
  };

  window.addEventListener('popstate', () => { const id = urlId(); if (id) load(id); });

  const mount = () => {
    document.getElementById('player-host').appendChild(player);
    const id = urlId();
    if (id) load(id);
  };
  if (cfg.playerCreateDelay) setTimeout(mount, cfg.playerCreateDelay); else mount();
})();
