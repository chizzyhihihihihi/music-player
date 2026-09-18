/* Accordion Music — main app controller (vanilla JS, zero build step).
 * Expects: window.createAccordionGallery (js/gallery.js),
 *          window.MusicLib (js/library.js),
 *          optionally window.gsap + window.jsmediatags from CDN.
 */
(function () {
  'use strict';

  var CDN = {
    gsap: [
      'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js',
      'https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js'
    ],
    tags: [
      'https://cdnjs.cloudflare.com/ajax/libs/jsmediatags/3.9.5/jsmediatags.min.js',
      'https://cdn.jsdelivr.net/npm/jsmediatags@3.9.5/build2/jsmediatags.min.js'
    ]
  };

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.crossOrigin = 'anonymous';
      s.onload = function () {
        resolve(true);
      };
      s.onerror = function () {
        reject(new Error('failed: ' + src));
      };
      document.head.appendChild(s);
    });
  }

  function ensureGlobal(name, urls) {
    if (window[name]) return Promise.resolve(true);
    var chain = Promise.reject(new Error('start'));
    urls.forEach(function (u) {
      chain = chain.catch(function () {
        return loadScript(u);
      });
    });
    return chain
      .then(function () {
        return !!window[name];
      })
      .catch(function () {
        return !!window[name];
      });
  }

  function ensureLibs() {
    return Promise.all([ensureGlobal('gsap', CDN.gsap), ensureGlobal('jsmediatags', CDN.tags)]);
  }

  // ---------- state ----------
  var state = {
    tracks: [],
    folderName: '',
    loading: false,
    progress: { done: 0, total: 0 },
    query: '',
    sortBy: 'name',
    currentId: null,
    isPlaying: false,
    volume: 0.9,
    muted: false,
    shuffle: false,
    repeat: 'all', // off | all | one
    triggerMode: 'hover',
    savedHandle: null,
    dirHandle: null
  };

  var supportsFS = typeof window.showDirectoryPicker === 'function';

  // ---------- dom ----------
  function $(id) {
    return document.getElementById(id);
  }

  var el = {};
  var gallery = null;
  var audio = null;

  function cacheDom() {
    [
      'hero', 'library', 'install-bar', 'btn-install',
      'btn-open', 'btn-open-2', 'btn-demo', 'btn-change', 'btn-reconnect',
      'btn-trigger', 'search', 'btn-clear-search', 'sort', 'count',
      'gallery', 'queue', 'progress', 'error', 'drop-hint',
      'fallback-input', 'audio',
      'p-cover', 'p-title', 'p-artist',
      'btn-shuffle', 'btn-prev', 'btn-play', 'btn-next', 'btn-repeat',
      'time-cur', 'time-dur', 'seek', 'btn-mute', 'vol', 'viz', 'foot-fs'
    ].forEach(function (id) {
      el[id] = $(id);
    });
  }

  // ---------- helpers ----------
  function filteredTracks() {
    var q = state.query.trim().toLowerCase();
    var list = state.tracks;
    if (q) {
      list = list.filter(function (t) {
        return (t.title + ' ' + t.artist + ' ' + (t.album || '') + ' ' + t.fileName)
          .toLowerCase()
          .includes(q);
      });
    }
    var sorted = list.slice();
    if (state.sortBy === 'name') {
      sorted.sort(function (a, b) {
        return a.title.localeCompare(b.title, undefined, { numeric: true });
      });
    } else if (state.sortBy === 'artist') {
      sorted.sort(function (a, b) {
        return (a.artist + a.title).localeCompare(b.artist + b.title);
      });
    } else if (state.sortBy === 'duration') {
      sorted.sort(function (a, b) {
        return (a.duration || 0) - (b.duration || 0);
      });
    }
    return sorted;
  }

  function currentTrack() {
    if (!state.currentId) return null;
    for (var i = 0; i < state.tracks.length; i++) {
      if (state.tracks[i].id === state.currentId) return state.tracks[i];
    }
    return null;
  }

  function galleryWindow(list, currentId) {
    if (list.length <= 7) return { items: list, offset: 0 };
    var idx = -1;
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === currentId) {
        idx = i;
        break;
      }
    }
    var start = 0;
    if (idx >= 0) start = Math.min(Math.max(idx - 3, 0), list.length - 7);
    return { items: list.slice(start, start + 7), offset: start };
  }

  // ---------- rendering ----------
  function showError(msg) {
    if (!msg) {
      el.error.hidden = true;
      el.error.textContent = '';
    } else {
      el.error.hidden = false;
      el.error.textContent = msg;
    }
  }

  function renderCounts(list) {
    el.count.textContent = list.length + ' / ' + state.tracks.length + ' · ' + (state.folderName || '');
    var w = galleryWindow(list, state.currentId);
    var note = $('gallery-note');
    if (list.length > 7 && note) {
      note.hidden = false;
      note.textContent =
        'Showing ' + (w.offset + 1) + '–' + (w.offset + w.items.length) +
        ' of ' + list.length + ' — search or play from the list below to move the window.';
    } else if (note) {
      note.hidden = true;
    }
  }

  function renderGallery(list) {
    if (!gallery) return;
    var w = galleryWindow(list, state.currentId);
    var keepId = null;
    var cur = currentTrack();
    if (cur) {
      for (var i = 0; i < w.items.length; i++) {
        if (w.items[i].id === cur.id) {
          keepId = cur.id;
          break;
        }
      }
    }
    var items = w.items.map(function (t) {
      var isCur = t.id === state.currentId;
      return {
        id: t.id,
        image: t.image,
        label: t.title,
        subtitle: t.artist,
        alt: t.title + ' by ' + t.artist,
        isPlaying: isCur && state.isPlaying,
        badge: isCur
          ? state.isPlaying
            ? 'Playing'
            : 'Paused'
          : t.duration
            ? MusicLib.formatTime(t.duration)
            : undefined
      };
    });
    gallery.setItems(items, keepId);
    renderCounts(list);
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function renderQueue(list) {
    var html = '';
    for (var i = 0; i < list.length; i++) {
      (function (t) {
        var isCur = t.id === state.currentId;
        html +=
          '<button class="queue__item' + (isCur ? ' is-current' : '') + '" data-id="' + esc(t.id) + '"' +
          ' title="' + esc(t.title) + ' — ' + esc(t.artist) + '">' +
          '<img src="' + esc(t.image) + '" alt="" loading="lazy">' +
          '<span class="queue__meta">' +
          '<span class="queue__title">' + (isCur && state.isPlaying ? '▶ ' : '') + esc(t.title) + '</span>' +
          '<span class="queue__sub">' + esc(t.artist) + (t.album ? ' · ' + esc(t.album) : '') + '</span>' +
          '</span>' +
          '<span class="queue__dur">' + (t.duration ? esc(MusicLib.formatTime(t.duration)) : '') + '</span>' +
          '</button>';
      })(list[i]);
    }
    el.queue.innerHTML = html;
  }

  function renderAll() {
    var list = filteredTracks();
    var has = state.tracks.length > 0;
    el.hero.hidden = has;
    el.library.hidden = !has;
    if (!has) return;
    renderGallery(list);
    renderQueue(list);
    renderPlayerChrome();
    if (state.loading) {
      el.progress.hidden = false;
      el.progress.textContent =
        'Reading metadata… ' + state.progress.done + '/' + state.progress.total;
    } else {
      el.progress.hidden = true;
    }
  }

  function renderPlayerChrome() {
    var t = currentTrack();
    if (t) {
      el['p-cover'].src = t.image;
      el['p-cover'].style.display = '';
      el['p-title'].textContent = t.title;
      el['p-artist'].textContent = t.artist || 'Unknown Artist';
    } else {
      el['p-cover'].removeAttribute('src');
      el['p-cover'].style.display = 'none';
      el['p-title'].textContent = 'No song selected';
      el['p-artist'].textContent = 'Open a music folder to begin';
    }
    el['btn-play'].textContent = state.isPlaying ? '❚❚' : '▶';
    el['btn-shuffle'].classList.toggle('is-on', state.shuffle);
    el['btn-repeat'].classList.toggle('is-on', state.repeat !== 'off');
    el['btn-repeat'].textContent = state.repeat === 'one' ? '🔂' : '🔁';
    el['btn-mute'].textContent =
      state.muted || state.volume === 0 ? '🔇' : state.volume < 0.5 ? '🔈' : '🔊';
    el.vol.value = state.muted ? 0 : state.volume;
  }

  // ---------- playback ----------
  function playTrack(track, autoplay) {
    if (!track) return Promise.resolve();
    if (autoplay === undefined) autoplay = true;
    if (state.currentId !== track.id) {
      audio.src = track.objectUrl;
      state.currentId = track.id;
    }
    updateMediaSession();
    renderAll();
    if (!autoplay) return Promise.resolve();
    return resumeCtx()
      .then(function () {
        return audio.play();
      })
      .then(function () {
        state.isPlaying = true;
        renderAll();
      })
      .catch(function () {
        state.isPlaying = false;
        renderAll();
      });
  }

  function toggle() {
    var t = currentTrack();
    if (!t) {
      var list = filteredTracks();
      if (list[0]) return playTrack(list[0]);
      return Promise.resolve();
    }
    if (audio.paused) {
      return resumeCtx()
        .then(function () {
          return audio.play();
        })
        .catch(function () {});
    } else {
      audio.pause();
      return Promise.resolve();
    }
  }

  function pickRandom(excludeId, list) {
    if (list.length < 2) return list[0];
    var n;
    do {
      n = Math.floor(Math.random() * list.length);
    } while (list[n].id === excludeId);
    return list[n];
  }

  function indexIn(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return i;
    return -1;
  }

  function next() {
    var list = filteredTracks();
    if (!list.length) return Promise.resolve();
    if (state.shuffle) {
      var n = pickRandom(state.currentId, list);
      if (n) return playTrack(n);
      return Promise.resolve();
    }
    var i = indexIn(list, state.currentId);
    return playTrack(list[(i + 1 + list.length) % list.length]);
  }

  function prev() {
    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0;
      return Promise.resolve();
    }
    var list = filteredTracks();
    if (!list.length) return Promise.resolve();
    var i = indexIn(list, state.currentId);
    if (i < 0) i = 1;
    return playTrack(list[(i - 1 + list.length) % list.length]);
  }

  function onEnded() {
    var list = filteredTracks();
    if (state.repeat === 'one') {
      audio.currentTime = 0;
      audio.play().catch(function () {});
      return;
    }
    if (state.repeat === 'off' && indexIn(list, state.currentId) === list.length - 1) {
      state.isPlaying = false;
      renderAll();
      return;
    }
    next();
  }

  // ---------- media session ----------
  function updateMediaSession() {
    if (!('mediaSession' in navigator)) return;
    var t = currentTrack();
    if (!t) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: t.title,
        artist: t.artist,
        album: t.album || state.folderName || ''
      });
      navigator.mediaSession.setActionHandler('play', function () {
        audio.play().catch(function () {});
      });
      navigator.mediaSession.setActionHandler('pause', function () {
        audio.pause();
      });
      navigator.mediaSession.setActionHandler('previoustrack', function () {
        prev();
      });
      navigator.mediaSession.setActionHandler('nexttrack', function () {
        next();
      });
    } catch (e) {}
  }

  // ---------- visualizer ----------
  function resumeCtx() {
    try {
      if (audio._ac && audio._ac.state === 'suspended') return audio._ac.resume();
    } catch (e) {}
    return Promise.resolve();
  }

  function initVisualizer() {
    var canvas = el.viz;
    if (!canvas || !audio) return;
    var analyser = null;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!audio._ac) {
        var ctx = new AC();
        var src = ctx.createMediaElementSource(audio);
        analyser = ctx.createAnalyser();
        analyser.fftSize = 64;
        src.connect(analyser);
        analyser.connect(ctx.destination);
        audio._ac = ctx;
        audio._analyser = analyser;
      } else {
        analyser = audio._analyser;
      }
    } catch (e) {
      return; // e.g. cross-origin demo stream — skip visualizer
    }
    if (!analyser) return;
    var c2d = canvas.getContext('2d');
    var data = new Uint8Array(analyser.frequencyBinCount);
    function draw() {
      requestAnimationFrame(draw);
      try {
        analyser.getByteFrequencyData(data);
        var w = canvas.width;
        var h = canvas.height;
        c2d.clearRect(0, 0, w, h);
        var n = 28;
        var bw = w / n;
        for (var i = 0; i < n; i++) {
          var v = data[Math.floor((i / n) * data.length)] / 255;
          var bh = Math.max(2, v * h);
          c2d.fillStyle = 'rgba(255,255,255,' + (0.25 + v * 0.65).toFixed(2) + ')';
          var x = i * bw + bw * 0.22;
          c2d.beginPath();
          if (c2d.roundRect) c2d.roundRect(x, h - bh, bw * 0.56, bh, 3);
          else c2d.rect(x, h - bh, bw * 0.56, bh);
          c2d.fill();
        }
      } catch (e) {}
    }
    draw();
  }

  // ---------- library ingest ----------
  function revokeOld() {
    state.tracks.forEach(function (t) {
      if (t.objectUrl && !t.remote && !t.hasEmbeddedArt) {
        try {
          URL.revokeObjectURL(t.objectUrl);
        } catch (e) {}
      }
    });
  }

  function ingestFiles(files, label) {
    showError('');
    var audioFiles = files.filter(function (f) {
      return MusicLib.isAudioFile(f.name || '');
    });
    if (!audioFiles.length) {
      showError('No audio files found in that folder. Try MP3 / WAV / OGG / M4A / FLAC / OPUS.');
      return Promise.resolve();
    }
    revokeOld();
    audioFiles.sort(function (a, b) {
      return String(a.name || '').localeCompare(String(b.name || ''), undefined, { numeric: true });
    });
    state.loading = true;
    state.folderName = label || '';
    state.progress = { done: 0, total: audioFiles.length };
    state.currentId = null;
    state.isPlaying = false;
    try {
      audio.removeAttribute('src');
      audio.load();
    } catch (e) {}

    var initial = audioFiles.map(function (f) {
      return MusicLib.fileToTrack(f, f.webkitRelativePath || f.name);
    });
    state.tracks = initial;
    renderAll();

    var BATCH = 3;
    var chain = Promise.resolve();
    for (var i = 0; i < initial.length; i += BATCH) {
      (function (slice, start) {
        chain = chain.then(function () {
          return Promise.all(
            slice.map(function (t) {
              return MusicLib.enrichTrack(t).catch(function () {
                return t;
              });
            })
          ).then(function () {
            state.progress.done = Math.min(start + slice.length, initial.length);
            renderAll();
          });
        });
      })(initial.slice(i, i + BATCH), i);
    }
    return chain.then(function () {
      state.loading = false;
      renderAll();
    });
  }

  function walkDir(handle, path, out) {
    var iter = handle.values();
    function step() {
      return iter.next().then(function (res) {
        if (res.done) return out;
        var entry = res.value;
        if (entry.kind === 'file') {
          return entry.getFile().then(function (f) {
            if (MusicLib.isAudioFile(f.name)) {
              try {
                Object.defineProperty(f, 'webkitRelativePath', {
                  value: path + '/' + f.name
                });
              } catch (e) {}
              out.push(f);
            }
            return step();
          });
        } else if (entry.kind === 'directory') {
          return walkDir(entry, path + '/' + entry.name, out).then(step);
        }
        return step();
      });
    }
    return step();
  }

  function openFolderPicker() {
    showError('');
    if (supportsFS) {
      var p;
      try {
        p = window.showDirectoryPicker({ mode: 'read' });
      } catch (e) {
        showError(e && e.message ? e.message : 'Could not open folder.');
        return;
      }
      Promise.resolve(p)
        .then(function (handle) {
          state.dirHandle = handle;
          MusicLib.saveDirHandle(handle).then(function (ok) {
            state.savedHandle = ok ? handle : null;
            el['btn-reconnect'].hidden = !state.savedHandle;
          });
          return walkDir(handle, handle.name || 'Music', []).then(function (files) {
            return ingestFiles(files, handle.name || 'Local folder');
          });
        })
        .catch(function (e) {
          if (e && e.name === 'AbortError') return;
          showError((e && e.message) || 'Could not open folder.');
        });
    } else {
      el['fallback-input'].click();
    }
  }

  function onFallbackInput(e) {
    var list = Array.prototype.slice.call(e.target.files || []);
    var label = 'Local folder';
    if (list[0] && list[0].webkitRelativePath) {
      label = String(list[0].webkitRelativePath).split('/')[0] || label;
    }
    ingestFiles(list, label);
    e.target.value = '';
  }

  function reconnectSaved() {
    MusicLib.loadDirHandle().then(function (h) {
      if (!h) {
        showError('No saved folder.');
        return;
      }
      var req = h.requestPermission ? h.requestPermission({ mode: 'read' }) : Promise.resolve('granted');
      Promise.resolve(req).then(function (perm) {
        if (perm !== 'granted') {
          showError('Permission denied for saved folder.');
          return;
        }
        state.dirHandle = h;
        state.savedHandle = h;
        walkDir(h, h.name || 'Music', []).then(function (files) {
          ingestFiles(files, h.name || 'Local folder');
        });
      });
    });
  }

  function loadDemo() {
    revokeOld();
    showError('');
    state.folderName = 'Demo playlist';
    state.tracks = MusicLib.demoPlaylist();
    state.currentId = null;
    state.isPlaying = false;
    state.loading = false;
    renderAll();
    // Probe durations lazily so badges fill in.
    state.tracks.forEach(function (t) {
      MusicLib.probeDuration(t.objectUrl).then(function (d) {
        t.duration = d || 0;
        renderAll();
      });
    });
  }

  // ---------- install prompt ----------
  function initInstall() {
    var deferred = null;
    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();
      deferred = e;
      el['install-bar'].hidden = false;
    });
    window.addEventListener('appinstalled', function () {
      deferred = null;
      el['install-bar'].hidden = true;
    });
    if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) {
      el['install-bar'].hidden = true;
    }
    el['btn-install'].addEventListener('click', function () {
      if (!deferred) return;
      deferred.prompt();
      if (deferred.userChoice) {
        deferred.userChoice.catch(function () {}).then(function () {
          deferred = null;
          el['install-bar'].hidden = true;
        });
      }
    });
  }

  // ---------- events ----------
  function bindEvents() {
    el['btn-open'].addEventListener('click', openFolderPicker);
    el['btn-open-2'].addEventListener('click', openFolderPicker);
    el['btn-change'].addEventListener('click', openFolderPicker);
    el['btn-demo'].addEventListener('click', loadDemo);
    el['btn-reconnect'].addEventListener('click', reconnectSaved);
    el['btn-trigger'].addEventListener('click', function () {
      state.triggerMode = state.triggerMode === 'hover' ? 'click' : 'hover';
      el['btn-trigger'].textContent = 'Expand: ' + state.triggerMode;
      if (gallery) gallery.setTrigger(state.triggerMode);
    });

    el.search.addEventListener('input', function () {
      state.query = el.search.value;
      renderAll();
    });
    el['btn-clear-search'].addEventListener('click', function () {
      el.search.value = '';
      state.query = '';
      renderAll();
    });
    el.sort.addEventListener('change', function () {
      state.sortBy = el.sort.value;
      renderAll();
    });

    el.queue.addEventListener('click', function (e) {
      var btn = e.target.closest('.queue__item');
      if (!btn) return;
      var id = btn.getAttribute('data-id');
      for (var i = 0; i < state.tracks.length; i++) {
        if (state.tracks[i].id === id) {
          playTrack(state.tracks[i]);
          break;
        }
      }
    });

    // player
    el['btn-play'].addEventListener('click', toggle);
    el['btn-next'].addEventListener('click', next);
    el['btn-prev'].addEventListener('click', prev);
    el['btn-shuffle'].addEventListener('click', function () {
      state.shuffle = !state.shuffle;
      renderPlayerChrome();
    });
    el['btn-repeat'].addEventListener('click', function () {
      state.repeat = state.repeat === 'off' ? 'all' : state.repeat === 'all' ? 'one' : 'off';
      el['btn-repeat'].title = 'Repeat: ' + state.repeat;
      renderPlayerChrome();
    });
    el.seek.addEventListener('input', function () {
      var v = Number(el.seek.value);
      if (audio && isFinite(v)) {
        try {
          audio.currentTime = v;
        } catch (e) {}
      }
    });
    el.vol.addEventListener('input', function () {
      state.volume = Number(el.vol.value);
      if (state.volume > 0) state.muted = false;
      audio.volume = state.muted ? 0 : state.volume;
      renderPlayerChrome();
    });
    el['btn-mute'].addEventListener('click', function () {
      state.muted = !state.muted;
      audio.volume = state.muted ? 0 : state.volume;
      renderPlayerChrome();
    });

    // audio element
    audio.addEventListener('timeupdate', function () {
      el['time-cur'].textContent = MusicLib.formatTime(audio.currentTime || 0);
      var d = audio.duration || 0;
      if (isFinite(d) && d > 0) el.seek.max = d;
      if (!el.seek.matches(':active')) {
        try {
          el.seek.value = audio.currentTime || 0;
        } catch (e) {}
      }
    });
    function syncDur() {
      var d = audio.duration || 0;
      el['time-dur'].textContent = MusicLib.formatTime(d);
      if (isFinite(d) && d > 0) el.seek.max = d;
    }
    audio.addEventListener('loadedmetadata', syncDur);
    audio.addEventListener('durationchange', syncDur);
    audio.addEventListener('play', function () {
      state.isPlaying = true;
      renderAll();
    });
    audio.addEventListener('pause', function () {
      state.isPlaying = false;
      renderAll();
    });
    audio.addEventListener('ended', onEnded);
    audio.volume = state.volume;

    el['fallback-input'].addEventListener('change', onFallbackInput);

    // drag & drop
    var app = $('app');
    var dragDepth = 0;
    document.addEventListener('dragenter', function (e) {
      if (!e.dataTransfer) return;
      e.preventDefault();
      dragDepth++;
      el['drop-hint'].classList.add('dragging');
    });
    document.addEventListener('dragover', function (e) {
      if (!e.dataTransfer) return;
      e.preventDefault();
    });
    document.addEventListener('dragleave', function (e) {
      if (!e.dataTransfer) return;
      dragDepth = Math.max(0, dragDepth - 1);
      if (dragDepth === 0) el['drop-hint'].classList.remove('dragging');
    });
    document.addEventListener('drop', function (e) {
      if (!e.dataTransfer) return;
      e.preventDefault();
      dragDepth = 0;
      el['drop-hint'].classList.remove('dragging');
      if (e.dataTransfer.files && e.dataTransfer.files.length) {
        var files = Array.prototype.slice.call(e.dataTransfer.files);
        var aud = files.filter(function (f) {
          return MusicLib.isAudioFile(f.name || '');
        });
        if (aud.length) ingestFiles(aud, state.folderName || 'Dropped files');
        else showError('Drop audio files or use “Open music folder”.');
      }
    });
    void app;

    // keyboard shortcuts
    window.addEventListener('keydown', function (e) {
      var tag = (e.target && e.target.tagName) || '';
      if (/INPUT|SELECT|TEXTAREA/.test(tag)) return;
      if (e.code === 'Space') {
        e.preventDefault();
        toggle();
      } else if (e.key === 'ArrowRight' && e.shiftKey) {
        next();
      } else if (e.key === 'ArrowLeft' && e.shiftKey) {
        prev();
      }
    });
  }

  // ---------- gallery ----------
  function initGallery() {
    gallery = window.createAccordionGallery(el.gallery, {
      items: [],
      defaultIndex: 0,
      height: 440,
      expandRatio: 0.52,
      radius: 18,
      gap: 10,
      trigger: state.triggerMode,
      accentColor: '#ffffff',
      overlayColor: '#060010',
      onSelect: function (index, reason) {
        if (reason !== 'play') return;
        var list = filteredTracks();
        var w = galleryWindow(list, state.currentId);
        var track = w.items[index];
        if (!track) return;
        if (track.id === state.currentId) toggle();
        else playTrack(track);
      }
    });
  }

  // ---------- boot ----------
  function boot() {
    cacheDom();
    audio = el.audio;
    el['foot-fs'].textContent = supportsFS
      ? 'File System Access ready'
      : 'fallback folder input mode';
    el['btn-reconnect'].hidden = true;
    el['btn-trigger'].textContent = 'Expand: ' + state.triggerMode;

    ensureLibs().then(function () {
      initGallery();
      bindEvents();
      initInstall();
      initVisualizer();
      renderAll();
      // Offer one-tap reconnect if a folder was saved before.
      if (supportsFS) {
        MusicLib.loadDirHandle().then(function (h) {
          if (h && h.queryPermission) {
            h.queryPermission({ mode: 'read' }).then(function (perm) {
              if (perm === 'granted') {
                state.savedHandle = h;
                state.dirHandle = h;
                el['btn-reconnect'].hidden = false;
              } else {
                state.savedHandle = h;
                el['btn-reconnect'].hidden = false;
              }
            }).catch(function () {});
          } else if (h) {
            state.savedHandle = h;
            el['btn-reconnect'].hidden = false;
          }
        });
      }
      // PWA service worker (same-directory scope: works on project subpaths).
      if ('serviceWorker' in navigator && window.isSecureContext !== false) {
        navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(function () {});
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
