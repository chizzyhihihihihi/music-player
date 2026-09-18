/* AccordionGallery — vanilla JS port of the React Bits component.
 * Same props/behaviour: expandRatio, GSAP expand/collapse, parallax,
 * tilt, grayscale dimming, hover/click trigger, keyboard nav, labels.
 * The gallery owns its "expanded" state internally; the host app is
 * notified via onSelect(index, reason) where reason is 'expand' or 'play'.
 * Clicking (or Enter/Space on) the already-expanded panel = play request.
 * Works without GSAP too (falls back to instant flex-grow changes).
 */
(function (global) {
  'use strict';

  var DEFAULT_ITEMS = [
    { image: 'https://picsum.photos/id/1015/900/1200', label: 'Canyon' },
    { image: 'https://picsum.photos/id/1018/900/1200', label: 'Ridgeline' },
    { image: 'https://picsum.photos/id/1039/900/1200', label: 'Falls' },
    { image: 'https://picsum.photos/id/1043/900/1200', label: 'Harbour' },
    { image: 'https://picsum.photos/id/1044/900/1200', label: 'Skyline' }
  ];

  function clampRatio(r) {
    return Math.min(Math.max(r, 0.2), 0.9);
  }

  function createAccordionGallery(root, options) {
    var opts = Object.assign(
      {
        items: DEFAULT_ITEMS,
        defaultIndex: 2,
        accentColor: '#ffffff',
        overlayColor: '#060010',
        textColor: '#ffffff',
        height: 440,
        gap: 10,
        radius: 16,
        expandRatio: 0.52,
        orientation: 'horizontal',
        duration: 0.6,
        ease: 'power3.out',
        parallax: 0.5,
        tilt: 8,
        stagger: 0.06,
        trigger: 'hover',
        showLabels: true,
        grayscale: true,
        onSelect: null
      },
      options || {}
    );

    var vertical = opts.orientation === 'vertical';
    var items = [];
    var active = 0;
    var panels = [];
    var medias = [];
    var bars = [];
    var texts = [];
    var mediaSize = 320;
    var firstRun = true;
    var timeline = null;
    var ro = null;

    var prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function hasGsap() {
      return typeof global.gsap !== 'undefined';
    }

    function notify(i, reason) {
      if (typeof opts.onSelect === 'function') {
        try {
          opts.onSelect(i, reason);
        } catch (e) {
          /* host error shouldn't break gallery */
        }
      }
    }

    function applyStyles() {
      root.classList.add('accordion-gallery');
      root.classList.toggle('accordion-gallery--vertical', vertical);
      root.style.setProperty('--ag-accent', opts.accentColor);
      root.style.setProperty('--ag-overlay', opts.overlayColor);
      root.style.setProperty('--ag-text', opts.textColor);
      root.style.setProperty('--ag-gap', opts.gap + 'px');
      root.style.setProperty('--ag-radius', opts.radius + 'px');
      root.style.height = vertical
        ? Math.round(opts.height * 1.6) + 'px'
        : opts.height + 'px';
      root.setAttribute('role', 'list');
      root.setAttribute('aria-label', 'Song picker accordion gallery');
    }

    function buildPanels() {
      root.innerHTML = '';
      panels = [];
      medias = [];
      bars = [];
      texts = [];

      items.forEach(function (item, i) {
        var isActive = i === active;
        var panel = document.createElement('div');
        panel.className = 'ag-panel' + (isActive ? ' ag-panel--active' : '');
        if (item.isPlaying) panel.classList.add('ag-panel--playing');
        panel.style.borderRadius = opts.radius + 'px';
        panel.setAttribute('role', 'listitem');
        panel.setAttribute('tabindex', '0');
        if (isActive) panel.setAttribute('aria-current', 'true');
        panel.setAttribute('aria-label', item.label || '');
        panel.title =
          (item.label || '') + (item.subtitle ? ' — ' + item.subtitle : '');

        var frame = document.createElement('span');
        frame.className = 'ag-panel__frame';

        var media = document.createElement('span');
        media.className = 'ag-panel__media';
        var img = document.createElement('img');
        img.src = item.image;
        img.alt = item.alt || item.label || '';
        img.draggable = false;
        img.loading = 'lazy';
        media.appendChild(img);

        var overlay = document.createElement('span');
        overlay.className = 'ag-panel__overlay';
        overlay.setAttribute('aria-hidden', 'true');

        frame.appendChild(media);
        frame.appendChild(overlay);
        panel.appendChild(frame);

        var bar = null;
        var text = null;
        if (opts.showLabels) {
          var label = document.createElement('span');
          label.className = 'ag-panel__label';
          label.setAttribute('aria-hidden', 'true');
          bar = document.createElement('span');
          bar.className = 'ag-panel__bar';
          text = document.createElement('span');
          text.className = 'ag-panel__text';
          var title = document.createElement('span');
          title.className = 'ag-panel__title';
          title.textContent = item.label || '';
          text.appendChild(title);
          if (item.subtitle) {
            var sub = document.createElement('span');
            sub.className = 'ag-panel__subtitle';
            sub.textContent = item.subtitle;
            text.appendChild(sub);
          }
          if (item.isPlaying) {
            var eq = document.createElement('span');
            eq.className = 'ag-panel__eq';
            eq.appendChild(document.createElement('span'));
            eq.appendChild(document.createElement('span'));
            eq.appendChild(document.createElement('span'));
            text.appendChild(eq);
          }
          label.appendChild(bar);
          label.appendChild(text);
          panel.appendChild(label);
        }

        if (item.badge) {
          var badge = document.createElement('span');
          badge.className = 'ag-panel__badge';
          badge.textContent = item.badge;
          panel.appendChild(badge);
        }

        panel.addEventListener('click', function (e) {
          handleClick(i, e);
        });
        panel.addEventListener('mouseenter', function () {
          handleEnter(i);
        });
        panel.addEventListener('focus', function () {
          setActive(i, true, 'focus');
        });
        panel.addEventListener('keydown', function (e) {
          handleKeyDown(i, e);
        });

        root.appendChild(panel);
        panels.push(panel);
        medias.push(media);
        bars.push(bar);
        texts.push(text);
      });
    }

    function layout(animate) {
      if (!panels.length) return;
      var count = items.length;
      var r = clampRatio(opts.expandRatio);
      var grow = count > 1 ? (r * (count - 1)) / (1 - r) : 1;
      var dur = animate && !prefersReduced ? opts.duration : 0;

      panels.forEach(function (panel, i) {
        var isActive = i === active;
        panel.classList.toggle('ag-panel--active', isActive);
        if (isActive) panel.setAttribute('aria-current', 'true');
        else panel.removeAttribute('aria-current');
      });

      if (!hasGsap()) {
        // No-GSAP fallback: direct styles, no animation.
        panels.forEach(function (panel, i) {
          panel.style.flexGrow = i === active ? grow : 1;
          panel.style.transform = '';
        });
        medias.forEach(function (media, i) {
          if (!media) return;
          media.style.setProperty('--ag-gray', opts.grayscale && i !== active ? 1 : 0);
          media.style.setProperty('--ag-dim', i === active ? 0 : 0.35);
        });
        if (opts.showLabels) {
          bars.forEach(function (bar, i) {
            if (bar) {
              bar.style.opacity = i === active ? 1 : 0;
              bar.style.transform = '';
            }
          });
          texts.forEach(function (text, i) {
            if (text) {
              text.style.opacity = i === active ? 1 : 0;
              text.style.transform = '';
            }
          });
        }
        return;
      }

      if (timeline) timeline.kill();
      var tl = global.gsap.timeline();

      panels.forEach(function (panel, i) {
        var isActive = i === active;
        var media = medias[i];
        var bar = bars[i];
        var text = texts[i];
        var rot = isActive ? 0 : i < active ? opts.tilt : -opts.tilt;
        var rotProp = vertical ? { rotateX: -rot } : { rotateY: rot };

        tl.to(
          panel,
          Object.assign(
            { flexGrow: isActive ? grow : 1, duration: dur, ease: opts.ease },
            rotProp
          ),
          0
        );

        if (media) {
          var drift = Math.max(-1.5, Math.min(1.5, active - i));
          var shift = drift * opts.parallax * mediaSize * 0.06;
          var gray = opts.grayscale ? (isActive ? 0 : 1) : 0;
          tl.to(
            media,
            {
              xPercent: -50,
              yPercent: -50,
              x: vertical ? 0 : isActive ? 0 : shift,
              y: vertical ? (isActive ? 0 : shift) : 0,
              '--ag-gray': gray,
              '--ag-dim': isActive ? 0 : 0.35,
              duration: dur,
              ease: opts.ease
            },
            0
          );
        }

        if (opts.showLabels && bar && text) {
          if (isActive) {
            tl.to(
              [bar, text],
              {
                opacity: 1,
                x: 0,
                duration: dur,
                ease: opts.ease,
                stagger: prefersReduced ? 0 : opts.stagger
              },
              0
            );
          } else {
            tl.to(
              [bar, text],
              { opacity: 0, x: -14, duration: dur * 0.6, ease: opts.ease },
              0
            );
          }
        }
      });

      timeline = tl;
    }

    function measure() {
      var rect = root.getBoundingClientRect();
      var count = items.length;
      var total = vertical ? rect.height : rect.width;
      var usable = Math.max(total - opts.gap * (count - 1), 120);
      var size = Math.max(140, usable * clampRatio(opts.expandRatio) * 1.22);
      mediaSize = size;
      root.style.setProperty('--ag-media-size', size + 'px');
      layout(!firstRun);
    }

    function setActive(i, animate, reason) {
      if (i < 0 || i >= items.length) return;
      var changed = i !== active;
      active = i;
      layout(animate !== false);
      if (changed) notify(i, reason || 'expand');
    }

    function handleEnter(i) {
      if (opts.trigger === 'hover') setActive(i, true, 'expand');
    }

    function handleClick(i, e) {
      if (i !== active) {
        if (e) e.preventDefault();
        setActive(i, true, 'expand');
      } else {
        notify(i, 'play');
      }
    }

    function handleKeyDown(i, e) {
      var count = items.length;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        setActive((i + 1) % count, true, 'expand');
        if (panels[(i + 1) % count]) panels[(i + 1) % count].focus();
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        setActive((i - 1 + count) % count, true, 'expand');
        if (panels[(i - 1 + count) % count]) panels[(i - 1 + count) % count].focus();
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleClick(i, e);
      }
    }

    function setItems(next, keepActiveId) {
      items = (next && next.length ? next : []).slice();
      if (!items.length) {
        root.innerHTML = '';
        panels = [];
        medias = [];
        bars = [];
        texts = [];
        return;
      }
      if (keepActiveId !== undefined && keepActiveId !== null) {
        var found = -1;
        for (var k = 0; k < items.length; k++) {
          if (items[k].id === keepActiveId) {
            found = k;
            break;
          }
        }
        active = found >= 0 ? found : Math.min(active, items.length - 1);
      } else {
        active = Math.min(
          Math.max(opts.defaultIndex, 0),
          items.length - 1
        );
      }
      buildPanels();
      measure();
      layout(false);
      firstRun = false;
    }

    function refreshBadges() {
      // Rebuild labels/badges cheaply by re-rendering panels in place.
      var keep = items[active] && items[active].id;
      buildPanels();
      layout(false);
      return keep;
    }

    function setTrigger(mode) {
      opts.trigger = mode;
    }

    function destroy() {
      if (ro) ro.disconnect();
      if (timeline) timeline.kill();
      root.innerHTML = '';
    }

    // init
    applyStyles();
    items = (opts.items || []).slice();
    active = Math.min(Math.max(opts.defaultIndex, 0), Math.max(items.length - 1, 0));
    buildPanels();
    measure();
    layout(false);
    firstRun = false;

    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(measure);
      ro.observe(root);
    } else {
      window.addEventListener('resize', measure);
    }

    return {
      setItems: setItems,
      setActive: function (i, animate) {
        setActive(i, animate === undefined ? true : animate, 'expand');
      },
      getActive: function () {
        return active;
      },
      refresh: refreshBadges,
      setTrigger: setTrigger,
      setOnSelect: function (fn) {
        opts.onSelect = fn;
      },
      destroy: destroy
    };
  }

  global.createAccordionGallery = createAccordionGallery;
})(window);
