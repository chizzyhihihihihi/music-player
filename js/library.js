/* Music library: folder scanning, metadata, generative cover art.
 * Zero dependencies at build time. Optionally uses the jsmediatags
 * UMD global (loaded from CDN) for embedded ID3 art — gracefully
 * degrades to filename parsing + generated covers when unavailable.
 */
(function (global) {
  'use strict';

  var AUDIO_EXTS = ['mp3', 'wav', 'ogg', 'oga', 'm4a', 'aac', 'flac', 'opus', 'webm', 'mp4'];
  var trackSeq = 0;

  function isAudioFile(name) {
    var ext = String(name || '').split('.').pop().toLowerCase();
    return AUDIO_EXTS.indexOf(ext) !== -1;
  }

  function hashString(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function hueFromName(name) {
    return hashString(name) % 360;
  }

  function generateCover(title, artist) {
    var seed = (artist || '?') + '—' + (title || '?');
    var h1 = hueFromName(seed);
    var h2 = (h1 + 40 + (hashString(seed + 'b') % 60)) % 360;
    var h3 = (h1 + 180 + (hashString(seed + 'c') % 40)) % 360;

    var c = document.createElement('canvas');
    c.width = 480;
    c.height = 720;
    var ctx = c.getContext('2d');

    var g = ctx.createLinearGradient(0, 0, 480, 720);
    g.addColorStop(0, 'hsl(' + h1 + ' 55% 16%)');
    g.addColorStop(0.45, 'hsl(' + h2 + ' 60% 26%)');
    g.addColorStop(1, 'hsl(' + h3 + ' 65% 10%)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 480, 720);

    for (var i = 0; i < 5; i++) {
      var r = 90 + (hashString(seed + i) % 140);
      var x = hashString(seed + 'x' + i) % 480;
      var y = hashString(seed + 'y' + i) % 720;
      var hue = (h1 + i * 28) % 360;
      var rg = ctx.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, 'hsla(' + hue + ' 80% 60% / 0.5)');
      rg.addColorStop(1, 'transparent');
      ctx.fillStyle = rg;
      ctx.fillRect(0, 0, 480, 720);
    }

    var img = ctx.getImageData(0, 0, 480, 720);
    var d = img.data;
    var amt = 14;
    for (var p = 0; p < d.length; p += 4) {
      var n = (Math.random() - 0.5) * amt;
      d[p] += n;
      d[p + 1] += n;
      d[p + 2] += n;
    }
    ctx.putImageData(img, 0, 0);

    var v = ctx.createRadialGradient(240, 340, 120, 240, 360, 560);
    v.addColorStop(0, 'transparent');
    v.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, 480, 720);

    var letter = ((title || '?').trim().charAt(0) || '?').toUpperCase();
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.font = '600 180px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 30;
    ctx.fillText(letter, 240, 320);

    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,0.72)';
    ctx.font = '500 26px system-ui, sans-serif';
    ctx.fillText((artist || 'Unknown Artist').slice(0, 28), 240, 480, 400);

    return c.toDataURL('image/jpeg', 0.82);
  }

  function parseFileName(fileName) {
    var base = String(fileName || '')
      .replace(/\.[a-z0-9]+$/i, '')
      .replace(/[_]+/g, ' ')
      .trim();
    var artist = 'Unknown Artist';
    var title = base;
    var dashParts = base.split(/\s*-\s*/);
    if (dashParts.length >= 2) {
      var parts = dashParts.slice();
      if (/^\d{1,3}$/.test(parts[0].trim())) parts = parts.slice(1);
      if (parts.length >= 2) {
        artist = parts[0].trim() || artist;
        title = parts.slice(1).join(' - ').trim() || base;
      } else {
        title = parts[0];
      }
    } else {
      var m = base.match(/^(\d{1,3})[\s.]+(.+)$/);
      if (m) title = m[2];
    }
    title = title.replace(/^\d{1,3}[\s.\-]+/, '').trim() || base;
    return { artist: artist, title: title };
  }

  function formatTime(sec) {
    if (!isFinite(sec) || sec < 0) return '0:00';
    sec = Math.floor(sec);
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    return m + ':' + String(s).padStart(2, '0');
  }

  function probeDuration(objectUrl) {
    return new Promise(function (resolve) {
      var a = new Audio();
      a.preload = 'metadata';
      var done = false;
      function finish(v) {
        if (done) return;
        done = true;
        resolve(v);
      }
      a.onloadedmetadata = function () {
        finish(isFinite(a.duration) ? a.duration : 0);
      };
      a.onerror = function () {
        finish(0);
      };
      a.src = objectUrl;
      setTimeout(function () {
        finish(isFinite(a.duration) ? a.duration : 0);
      }, 8000);
    });
  }

  // Embedded tags via jsmediatags CDN (optional). Resolves {} on any failure.
  function readTags(file) {
    return new Promise(function (resolve) {
      if (!global.jsmediatags) {
        resolve({});
        return;
      }
      var settled = false;
      function done(v) {
        if (settled) return;
        settled = true;
        resolve(v);
      }
      try {
        global.jsmediatags.read(file, {
          onSuccess: function (tag) {
            try {
              var t = (tag && tag.tags) || {};
              var out = {};
              if (t.title) out.title = String(t.title).slice(0, 120);
              if (t.artist) out.artist = String(t.artist).slice(0, 120);
              if (t.album) out.album = String(t.album).slice(0, 120);
              if (t.picture && t.picture.data) {
                var bytes = new Uint8Array(t.picture.data);
                // Copy into a fresh buffer (picture.data may be a plain array).
                var buf = new Uint8Array(bytes.length);
                buf.set(bytes);
                var blob = new Blob([buf], { type: t.picture.format || 'image/jpeg' });
                out.imageUrl = URL.createObjectURL(blob);
              }
              done(out);
            } catch (e) {
              done({});
            }
          },
          onError: function () {
            done({});
          }
        });
        setTimeout(function () {
          done({});
        }, 9000);
      } catch (e) {
        done({});
      }
    });
  }

  function fileToTrack(file, relativePath) {
    var parsed = parseFileName(file.name);
    var url;
    try {
      url = URL.createObjectURL(file);
    } catch (e) {
      url = '';
    }
    var album = '';
    if (relativePath) {
      var segs = String(relativePath).split('/');
      if (segs.length > 1) album = segs[segs.length - 2] || '';
    }
    return {
      id: 't-' + Date.now() + '-' + trackSeq++,
      fileName: file.name,
      file: file,
      objectUrl: url,
      title: parsed.title,
      artist: parsed.artist,
      album: album,
      duration: 0,
      image: generateCover(parsed.title, parsed.artist),
      hasEmbeddedArt: false
    };
  }

  function enrichTrack(track) {
    return readTags(track.file).then(function (found) {
      if (found.title) track.title = found.title;
      if (found.artist) track.artist = found.artist;
      if (found.album) track.album = found.album;
      if (found.imageUrl) {
        track.image = found.imageUrl;
        track.hasEmbeddedArt = true;
      } else if (found.title || found.artist) {
        track.image = generateCover(track.title, track.artist);
      }
      return probeDuration(track.objectUrl).then(function (dur) {
        track.duration = dur || 0;
        return track;
      });
    });
  }

  // ---- IndexedDB: persist the File System Access directory handle ----
  var DB = 'accordion-music-pwa';
  var STORE = 'handles';

  function openDb() {
    return new Promise(function (resolve, reject) {
      try {
        var req = indexedDB.open(DB, 1);
        req.onupgradeneeded = function () {
          req.result.createObjectStore(STORE);
        };
        req.onsuccess = function () {
          resolve(req.result);
        };
        req.onerror = function () {
          reject(req.error);
        };
      } catch (e) {
        reject(e);
      }
    });
  }

  function saveDirHandle(handle) {
    return openDb().then(function (db) {
      return new Promise(function (resolve) {
        try {
          var tx = db.transaction(STORE, 'readwrite');
          tx.objectStore(STORE).put(handle, 'dir');
          tx.oncomplete = function () {
            db.close();
            resolve(true);
          };
          tx.onerror = function () {
            db.close();
            resolve(false);
          };
        } catch (e) {
          try {
            db.close();
          } catch (_) {}
          resolve(false);
        }
      });
    }).catch(function () {
      return false;
    });
  }

  function loadDirHandle() {
    return openDb().then(function (db) {
      return new Promise(function (resolve) {
        try {
          var tx = db.transaction(STORE, 'readonly');
          var rq = tx.objectStore(STORE).get('dir');
          rq.onsuccess = function () {
            db.close();
            resolve(rq.result || null);
          };
          rq.onerror = function () {
            db.close();
            resolve(null);
          };
        } catch (e) {
          try {
            db.close();
          } catch (_) {}
          resolve(null);
        }
      });
    }).catch(function () {
      return null;
    });
  }

  function clearDirHandle() {
    return openDb().then(function (db) {
      return new Promise(function (resolve) {
        try {
          var tx = db.transaction(STORE, 'readwrite');
          tx.objectStore(STORE).delete('dir');
          tx.oncomplete = function () {
            db.close();
            resolve(true);
          };
          tx.onerror = function () {
            db.close();
            resolve(true);
          };
        } catch (e) {
          resolve(true);
        }
      });
    }).catch(function () {
      return true;
    });
  }

  function demoPlaylist() {
    var demo = [
      { title: 'SoundHelix Song 1', artist: 'SoundHelix', seed: 1015, url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3' },
      { title: 'SoundHelix Song 2', artist: 'SoundHelix', seed: 1018, url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3' },
      { title: 'SoundHelix Song 3', artist: 'SoundHelix', seed: 1039, url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3' },
      { title: 'SoundHelix Song 4', artist: 'SoundHelix', seed: 1043, url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3' },
      { title: 'SoundHelix Song 5', artist: 'SoundHelix', seed: 1044, url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3' }
    ];
    return demo.map(function (d, i) {
      return {
        id: 'demo-' + i,
        fileName: d.title,
        file: null,
        objectUrl: d.url,
        title: d.title,
        artist: d.artist,
        album: 'Demo',
        duration: 0,
        image: 'https://picsum.photos/id/' + d.seed + '/900/1200',
        hasEmbeddedArt: false,
        remote: true
      };
    });
  }

  global.MusicLib = {
    AUDIO_EXTS: AUDIO_EXTS,
    isAudioFile: isAudioFile,
    parseFileName: parseFileName,
    formatTime: formatTime,
    generateCover: generateCover,
    probeDuration: probeDuration,
    readTags: readTags,
    fileToTrack: fileToTrack,
    enrichTrack: enrichTrack,
    saveDirHandle: saveDirHandle,
    loadDirHandle: loadDirHandle,
    clearDirHandle: clearDirHandle,
    demoPlaylist: demoPlaylist
  };
})(window);
