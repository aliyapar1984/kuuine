(() => {
  const qs = (sel, ctx = document) => ctx.querySelector(sel);
  const qsa = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

  const whenIdle = (fn, timeout = 1800) => {
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(() => fn(), { timeout });
    } else {
      window.setTimeout(fn, 1);
    }
  };

  const loadScript = (src) =>
    new Promise((resolve, reject) => {
      if (!src) {
        reject(new Error("missing script src"));
        return;
      }
      const existing = document.querySelector(`script[data-kuuine-src="${src}"]`);
      if (existing) {
        if (existing.dataset.loaded === "1") resolve();
        else existing.addEventListener("load", () => resolve(), { once: true });
        return;
      }
      const s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.dataset.kuuineSrc = src;
      s.addEventListener("load", () => {
        s.dataset.loaded = "1";
        resolve();
      });
      s.addEventListener("error", () => reject(new Error(`script fail: ${src}`)));
      document.head.appendChild(s);
    });

  const ensureLottie = () => {
    if (typeof window.lottie !== "undefined") return Promise.resolve();
    const src =
      document.body?.dataset?.lottieSrc ||
      (document.querySelector("[data-lottie-src]")?.getAttribute("data-lottie-src") ?? "");
    if (!src) return Promise.reject(new Error("lottie src missing"));
    return loadScript(src);
  };

  /* ——— Viewport video: görünürken yükle/oynat, çıkınca durdur/unload ——— */
  const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const prepareLazyVideo = (video) => {
    if (!video || video.dataset.kuuineVideoReady === "1") return video;
    video.muted = true;
    video.playsInline = true;
    video.setAttribute("playsinline", "");
    video.setAttribute("muted", "");
    video.removeAttribute("autoplay");
    video.preload = "none";
    video.setAttribute("preload", "none");

    const sources = qsa("source", video);
    if (sources.length) {
      sources.forEach((s) => {
        const url = s.getAttribute("src") || s.dataset.src;
        if (url) {
          s.dataset.src = url;
          s.removeAttribute("src");
        }
      });
    } else {
      const url = video.getAttribute("src") || video.dataset.src || "";
      if (url) {
        video.dataset.src = url;
        video.removeAttribute("src");
        try {
          video.removeAttribute("src");
          video.src = "";
        } catch (_) {}
      }
    }
    video.dataset.kuuineLoaded = "0";
    video.dataset.kuuineVideoReady = "1";
    return video;
  };

  const loadLazyVideo = (video) => {
    if (!video) return Promise.resolve();
    prepareLazyVideo(video);
    if (video.dataset.kuuineLoaded === "1" && video.readyState >= 2) {
      return Promise.resolve(video);
    }

    const sources = qsa("source", video);
    if (sources.length) {
      sources.forEach((s) => {
        if (s.dataset.src) s.setAttribute("src", s.dataset.src);
      });
    } else if (video.dataset.src) {
      video.setAttribute("src", video.dataset.src);
    }

    video.dataset.kuuineLoaded = "1";
    try {
      video.load();
    } catch (_) {}

    return new Promise((resolve) => {
      if (video.readyState >= 2) {
        resolve(video);
        return;
      }
      const done = () => resolve(video);
      video.addEventListener("loadeddata", done, { once: true });
      video.addEventListener("error", done, { once: true });
      window.setTimeout(done, 8000);
    });
  };

  const unloadLazyVideo = (video) => {
    if (!video || video.dataset.kuuineLoaded !== "1") {
      if (video) prepareLazyVideo(video);
      return;
    }
    try {
      video.pause();
    } catch (_) {}
    const sources = qsa("source", video);
    if (sources.length) {
      sources.forEach((s) => {
        if (!s.dataset.src) {
          const url = s.getAttribute("src");
          if (url) s.dataset.src = url;
        }
        s.removeAttribute("src");
      });
    } else {
      if (!video.dataset.src) {
        const url = video.getAttribute("src") || video.currentSrc;
        if (url) video.dataset.src = url;
      }
      video.removeAttribute("src");
      try {
        video.src = "";
      } catch (_) {}
    }
    try {
      video.load();
    } catch (_) {}
    video.dataset.kuuineLoaded = "0";
  };

  const playLazyVideo = (video) => {
    if (!video || reduceMotion()) return;
    const run = () => {
      const p = video.play();
      if (p && typeof p.catch === "function") p.catch(() => {});
    };
    loadLazyVideo(video).then(() => {
      if (video.readyState >= 2) run();
      else video.addEventListener("loadeddata", run, { once: true });
    });
  };

  const pauseLazyVideo = (video) => {
    if (!video) return;
    try {
      video.pause();
    } catch (_) {}
  };

  const initViewportVideos = () => {
    if (!("IntersectionObserver" in window)) {
      qsa("video.js-kuuine-video, video[data-kuuine-video]").forEach((v) => {
        prepareLazyVideo(v);
        if (v.dataset.kuuineVideo !== "hover") playLazyVideo(v);
      });
      return;
    }

    const ambientSel = [
      "video.js-kuuine-video",
      "video[data-kuuine-video]",
      ".thematic-duo__figure video",
      ".our-story__media-slide video",
      ".product-card__hover video",
    ].join(", ");

    qsa(ambientSel).forEach((video) => {
      if (video.hasAttribute("data-hero-video")) return;
      prepareLazyVideo(video);

      const isHover =
        video.dataset.kuuineVideo === "hover" || !!video.closest(".product-card__hover");
      const storySlide = video.closest("[data-story-media]");
      const observeTarget =
        video.closest(".thematic-duo__figure") ||
        video.closest(".product-card") ||
        storySlide ||
        video.closest("section") ||
        video;

      if (isHover) {
        const card = video.closest(".product-card") || observeTarget;
        let near = false;
        const io = new IntersectionObserver(
          ([entry]) => {
            near = entry.isIntersecting;
            if (near) loadLazyVideo(video);
            else {
              pauseLazyVideo(video);
              unloadLazyVideo(video);
            }
          },
          { root: null, rootMargin: "20% 0px", threshold: 0.01 }
        );
        io.observe(card);
        const onEnter = () => {
          if (near) playLazyVideo(video);
        };
        const onLeave = () => pauseLazyVideo(video);
        card.addEventListener("mouseenter", onEnter);
        card.addEventListener("mouseleave", onLeave);
        card.addEventListener("focusin", onEnter);
        card.addEventListener("focusout", onLeave);
        return;
      }

      if (storySlide) {
        const root = video.closest("[data-our-story]") || observeTarget;
        let sectionInView = false;
        const sync = () => {
          const active = storySlide.classList.contains("is-active");
          if (sectionInView && active) playLazyVideo(video);
          else {
            pauseLazyVideo(video);
            if (!active) unloadLazyVideo(video);
          }
        };
        const io = new IntersectionObserver(
          ([entry]) => {
            sectionInView = entry.isIntersecting && entry.intersectionRatio > 0.15;
            if (!sectionInView) {
              pauseLazyVideo(video);
              unloadLazyVideo(video);
            } else sync();
          },
          { threshold: [0, 0.15, 0.4] }
        );
        io.observe(root);
        video._kuuineStorySync = sync;
        return;
      }

      /* Ambient loop (thematic-duo vb.): çıkınca pause, girince kaldığı yerden devam — unload yok */
      video.loop = true;
      let wasInView = false;
      const io = new IntersectionObserver(
        ([entry]) => {
          const on = entry.isIntersecting && entry.intersectionRatio > 0.2;
          if (on) {
            if (!wasInView) playLazyVideo(video);
            wasInView = true;
          } else if (wasInView) {
            pauseLazyVideo(video);
            wasInView = false;
          }
        },
        { threshold: [0, 0.2, 0.5] }
      );
      io.observe(observeTarget);
    });
  };

  /* Page preloader — Prava-style, GSAP yok (WAAPI) */
  const initPreloader = () => {
    const root = qs("#kuuine-preloader");
    if (!root) return;

    const SESSION_KEY = "kuuine-preloader-seen";
    const EASE = "cubic-bezier(0.65, 0, 0.35, 1)";
    const DUR = 560;
    const STAGGER = 20;
    const DUR_BRAND = 900;
    const STAGGER_BRAND = 62;
    const HOLD = 240;

    const isReload = () => {
      const nav = performance.getEntriesByType?.("navigation")?.[0];
      if (nav) return nav.type === "reload";
      return !!(performance.navigation && performance.navigation.type === 1);
    };

    const hasSeen = () => {
      try {
        return sessionStorage.getItem(SESSION_KEY) === "1";
      } catch (_) {
        return false;
      }
    };

    const markSeen = () => {
      try {
        sessionStorage.setItem(SESSION_KEY, "1");
      } catch (_) {}
    };

    const finish = () => {
      document.documentElement.classList.remove("kuuine-preloader-pending");
      document.body.classList.remove("kuuine-preloader-active");
      root.remove();
      window.dispatchEvent(new CustomEvent("kuuine:preloader-complete"));
      window.dispatchEvent(new CustomEvent("kuuine:hero-resume"));
    };

    if (window.__KUUINE_SKIP_PRELOADER || (hasSeen() && !isReload())) {
      finish();
      return;
    }

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      markSeen();
      finish();
      return;
    }

    let steps = null;
    try {
      steps = JSON.parse(qs("#kuuine-preloader-data", root)?.textContent || "{}").steps;
    } catch (_) {}
    if (!steps?.length) {
      finish();
      return;
    }

    const topTrack = qs('[data-track="top"]', root);
    const botTrack = qs('[data-track="bot"]', root);
    if (!topTrack || !botTrack) {
      finish();
      return;
    }

    const buildWord = (text) => {
      const wrap = document.createElement("div");
      wrap.className = "kuuine-preloader__word";
      const chars = [];
      for (let i = 0; i < text.length; i++) {
        const ch = text.charAt(i);
        const clip = document.createElement("div");
        clip.className = "kuuine-preloader__char-clip";
        const span = document.createElement("span");
        span.className = "kuuine-preloader__char";
        span.textContent = ch === " " ? "\u00a0" : ch;
        if (ch === " ") span.style.width = "0.28em";
        clip.appendChild(span);
        wrap.appendChild(clip);
        chars.push(span);
      }
      return { wrap, chars };
    };

    const fitWord = (wrap, track) => {
      wrap.style.transform = "";
      const trackW = track.clientWidth;
      const wordW = wrap.scrollWidth;
      if (trackW > 0 && wordW > trackW) {
        wrap.style.transform = `scale(${(trackW / wordW).toFixed(4)})`;
      }
    };

    const setCharsY = (chars, y) => {
      chars.forEach((el) => {
        el.style.transform = `translate3d(0, ${y}%, 0)`;
      });
    };

    const animateCharsFrom = (chars, fromY, toY, duration, staggerMs) => {
      const animations = chars.map((el, i) =>
        el.animate(
          [
            { transform: `translate3d(0, ${fromY}%, 0)` },
            { transform: `translate3d(0, ${toY}%, 0)` },
          ],
          {
            duration,
            delay: i * staggerMs,
            easing: EASE,
            fill: "forwards",
          }
        )
      );
      return Promise.all(animations.map((a) => a.finished.catch(() => {})));
    };

    const wait = (ms) => new Promise((r) => setTimeout(r, ms));

    const built = steps.map((s) => {
      const track = s.track === "top" ? topTrack : botTrack;
      const word = buildWord(s.text);
      track.appendChild(word.wrap);
      fitWord(word.wrap, track);
      setCharsY(word.chars, s.inY);
      return { ...s, chars: word.chars, trackEl: track };
    });

    document.body.classList.add("kuuine-preloader-active");

    const run = async () => {
      await wait(120);
      /* İlk satır girişi */
      await animateCharsFrom(built[0].chars, built[0].inY, 0, DUR, STAGGER);

      for (let i = 1; i < built.length; i++) {
        await wait(HOLD);
        const prev = built[i - 1];
        const curr = built[i];
        const inDur = curr.brand ? DUR_BRAND : DUR;
        const inStagger = curr.brand ? STAGGER_BRAND : STAGGER;

        /* Önceki çıkış + yenisi giriş (eşzamanlı) */
        await Promise.all([
          prev.outY != null
            ? animateCharsFrom(prev.chars, 0, prev.outY, DUR, STAGGER)
            : Promise.resolve(),
          animateCharsFrom(curr.chars, curr.inY, 0, inDur, inStagger),
        ]);
      }

      await wait(HOLD);

      const last = built[built.length - 1];
      const exitStagger = Math.max(0, (last.chars.length - 1) * STAGGER_BRAND);
      const exitDur = DUR_BRAND + exitStagger;

      const panelAnim = root.animate(
        [
          { transform: "translate3d(0, 0%, 0)" },
          { transform: "translate3d(0, -100%, 0)" },
        ],
        { duration: exitDur, easing: EASE, fill: "forwards" }
      );

      await Promise.all([
        last.outY != null
          ? animateCharsFrom(last.chars, 0, last.outY, DUR_BRAND, STAGGER_BRAND)
          : Promise.resolve(),
        panelAnim.finished.catch(() => {}),
      ]);

      markSeen();
      finish();
    };

    requestAnimationFrame(() => requestAnimationFrame(() => {
      run().catch(() => {
        markSeen();
        finish();
      });
    }));
  };

  initPreloader();

  /* Minas-style sticky stack: hero pin + page-over + footer reveal */
  const initStickyStack = () => {
    const main = qs("#MainContent") || qs("main");
    const footer = qs(".site-footer");
    if (!main) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const desktop = window.matchMedia("(min-width: 900px)");

    let hero =
      main.querySelector(":scope > .section-hero") ||
      main.querySelector(":scope > .hero") ||
      main.querySelector(".hero");

    /* Wrap everything after hero so it can slide over the pinned hero */
    if (hero && !main.querySelector(".page-over")) {
      const wrap = document.createElement("div");
      wrap.className = "page-over";
      let node = hero.nextElementSibling;
      while (node) {
        const next = node.nextElementSibling;
        wrap.appendChild(node);
        node = next;
      }
      if (wrap.childNodes.length) main.appendChild(wrap);
    }

    const pageOver = main.querySelector(".page-over");
    let spacer = main.querySelector(".hero-pin-spacer");

    const teardownHeroPin = () => {
      document.body.classList.remove("has-hero-pin");
      if (hero) {
        hero.classList.remove("hero--pinned", "is-pin-complete");
      }
      if (spacer) {
        spacer.remove();
        spacer = null;
      }
    };

    const setupHeroPin = () => {
      if (!hero || !pageOver || reduced || !desktop.matches) {
        teardownHeroPin();
        return;
      }

      if (!spacer) {
        spacer = document.createElement("div");
        spacer.className = "hero-pin-spacer";
        spacer.setAttribute("aria-hidden", "true");
        hero.parentNode.insertBefore(spacer, hero);
      }

      document.body.classList.add("has-hero-pin");
      hero.classList.add("hero--pinned");
    };

    const updateHeroPin = () => {
      if (!hero || !desktop.matches || reduced) return;
      const vh = window.innerHeight || 1;
      /* Hero sadece ilk ekran geçilince kapanır; footer z-index ile üstte kalır */
      const done = window.scrollY >= vh - 1;
      const wasDone = hero.classList.contains("is-pin-complete");
      hero.classList.toggle("is-pin-complete", done);
      if (done) {
        /* Pin sonrası sadece duraklat — kaldığı yerden devam için unload yok */
        qsa("[data-hero-video]", hero).forEach((v) => pauseLazyVideo(v));
      } else if (wasDone) {
        hero.dispatchEvent(new CustomEvent("kuuine:hero-resume"));
      }
    };

    const panel = footer ? footer.querySelector(".footer-panel") : null;

    const setFooterSpace = () => {
      if (!footer) return;
      if (!desktop.matches || reduced) {
        document.body.classList.remove("has-footer-reveal");
        document.body.style.removeProperty("--footer-reveal-height");
        if (panel) {
          panel.style.transform = "";
          panel.style.opacity = "";
          panel.classList.remove("is-revealed");
        }
        return;
      }

      document.body.classList.add("has-footer-reveal");
      const prevPos = footer.style.position;
      const prevBottom = footer.style.bottom;
      const prevVisibility = footer.style.visibility;
      footer.style.position = "relative";
      footer.style.bottom = "auto";
      footer.style.visibility = "hidden";
      const h = Math.ceil(footer.getBoundingClientRect().height) || footer.offsetHeight;
      footer.style.position = prevPos;
      footer.style.bottom = prevBottom;
      footer.style.visibility = prevVisibility;
      document.body.style.setProperty("--footer-reveal-height", `${h}px`);
    };

    const updateFooterReveal = () => {
      if (!footer || !panel || !desktop.matches || reduced) return;
      const mainEl = qs("#MainContent") || qs("main");
      const revealH =
        (mainEl && parseFloat(getComputedStyle(mainEl).marginBottom)) ||
        Math.max(
          parseFloat(getComputedStyle(document.body).getPropertyValue("--footer-reveal-height")) || 0,
          window.innerHeight || 0
        ) ||
        1;
      const scrollMax = Math.max(document.documentElement.scrollHeight - window.innerHeight, 0);
      const distanceFromEnd = scrollMax - window.scrollY;
      const progress = 1 - Math.min(1, Math.max(0, distanceFromEnd / revealH));
      const y = (1 - progress) * 28;
      const opacity = 0.4 + progress * 0.6;
      panel.style.transform = `translate3d(0, ${y}%, 0)`;
      panel.style.opacity = String(opacity);
      panel.classList.toggle("is-revealed", progress > 0.92);
    };

    setupHeroPin();
    setFooterSpace();
    updateHeroPin();
    updateFooterReveal();

    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        updateHeroPin();
        updateFooterReveal();
        ticking = false;
      });
    };

    const onResize = () => {
      setupHeroPin();
      setFooterSpace();
      updateHeroPin();
      updateFooterReveal();
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    desktop.addEventListener?.("change", onResize);
    window.matchMedia("(prefers-reduced-motion: reduce)").addEventListener?.("change", onResize);

    if (footer && typeof ResizeObserver !== "undefined") {
      new ResizeObserver(() => {
        setFooterSpace();
        updateFooterReveal();
      }).observe(footer);
    }
  };

  initStickyStack();

  /* Announcement close */
  qsa("[data-announcement-close]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const bar = btn.closest("[data-announcement]");
      if (bar) bar.classList.add("is-hidden");
      document.body.classList.add("announcement-hidden");
      try {
        sessionStorage.setItem("kuuine_announcement_hidden", "1");
      } catch (_) {}
    });
  });

  if (sessionStorage.getItem("kuuine_announcement_hidden") === "1") {
    qsa("[data-announcement]").forEach((el) => el.classList.add("is-hidden"));
    document.body.classList.add("announcement-hidden");
  }

  /* Generic tab groups: [data-tabs] + [data-tab] + [data-panel] */
  qsa("[data-tabs]").forEach((root) => {
    if (root.matches("[data-our-story]")) return;
    const tabs = qsa("[data-tab]", root);
    const panels = qsa("[data-panel]", root);
    const images = qsa("[data-tab-image]", root);

    const activate = (id) => {
      tabs.forEach((t) => t.classList.toggle("is-active", t.dataset.tab === id));
      panels.forEach((p) => p.classList.toggle("is-active", p.dataset.panel === id));
      images.forEach((img) => img.classList.toggle("is-active", img.dataset.tabImage === id));
    };

    tabs.forEach((tab) => {
      tab.addEventListener("click", () => activate(tab.dataset.tab));
    });
  });

  /* Product row filters */
  qsa("[data-product-filters]").forEach((root) => {
    const buttons = qsa("button", root);
    buttons.forEach((btn) => {
      btn.addEventListener("click", () => {
        buttons.forEach((b) => b.classList.remove("is-active"));
        btn.classList.add("is-active");
      });
    });
  });

  /* Hero slideshow — video: ended → next; image: 3s → next */
  qsa("[data-hero-slideshow]").forEach((root) => {
    const slides = qsa("[data-hero-slide]", root);
    if (slides.length < 2) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const IMAGE_MS = 5000;
    const pipsRoot = qs("[data-hero-pips]", root);
    const prevBtn = qs("[data-hero-prev]", root);
    const nextBtn = qs("[data-hero-next]", root);

    let index = Math.max(0, slides.findIndex((s) => s.classList.contains("is-active")));
    if (index < 0) index = 0;
    let timer = null;
    let inView = true;
    let touchX = null;
    let navLock = false;

    const slideVideo = (i) => qs("[data-hero-video]", slides[i]);
    const canRun = () =>
      !reduced && inView && !root.classList.contains("is-pin-complete");

    const pips = slides.map((_, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "hero__pip";
      btn.setAttribute("role", "tab");
      btn.setAttribute("aria-label", `Slayt ${i + 1}`);
      const fill = document.createElement("span");
      fill.className = "hero__pip-fill";
      fill.setAttribute("aria-hidden", "true");
      btn.appendChild(fill);
      btn.addEventListener("click", () => goTo(i, true));
      pipsRoot?.appendChild(btn);
      return btn;
    });

    const clearTimer = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };

    const setPipDuration = (ms) => {
      root.style.setProperty("--hero-interval", `${Math.max(ms, 500)}ms`);
    };

    const restartPip = (i) => {
      pips.forEach((pip, idx) => {
        const on = idx === i;
        pip.classList.toggle("is-active", on);
        pip.classList.toggle("is-paused", on && (!inView || reduced));
        pip.setAttribute("aria-selected", on ? "true" : "false");
        const fill = qs(".hero__pip-fill", pip);
        if (!fill) return;
        if (on && !reduced) {
          fill.style.animation = "none";
          void fill.offsetWidth;
          fill.style.animation = "";
        } else {
          fill.style.animation = "none";
        }
      });
    };

    const syncVideos = (active, restart = false) => {
      const allowPlay = canRun();
      slides.forEach((slide, i) => {
        const video = qs("[data-hero-video]", slide);
        if (!video) return;
        prepareLazyVideo(video);
        video.loop = false;

        if (i === active && allowPlay) {
          loadLazyVideo(video).then(() => {
            if (restart) {
              try {
                video.currentTime = 0;
              } catch (_) {}
            }
            playLazyVideo(video);
          });
        } else if (i === active) {
          /* Viewport / pin dışı: pause — currentTime korunur, tekrar girince devam */
          pauseLazyVideo(video);
        } else {
          pauseLazyVideo(video);
          unloadLazyVideo(video);
        }
      });
    };

    const scheduleAdvance = () => {
      clearTimer();
      if (!canRun()) return;

      const video = slideVideo(index);
      if (video) {
        const syncDuration = () => {
          const d = video.duration;
          if (Number.isFinite(d) && d > 0) setPipDuration(d * 1000);
        };
        if (video.readyState >= 1) syncDuration();
        else video.addEventListener("loadedmetadata", syncDuration, { once: true });
        /* Geçiş video 'ended' ile — timer yok */
        return;
      }

      setPipDuration(IMAGE_MS);
      timer = setTimeout(() => goTo(index + 1, false), IMAGE_MS);
    };

    const goTo = (next, user = false) => {
      const i = ((next % slides.length) + slides.length) % slides.length;
      if (i === index && !user) return;
      if (user) {
        if (navLock) return;
        navLock = true;
        window.setTimeout(() => {
          navLock = false;
        }, 400);
      }
      clearTimer();
      slides.forEach((slide, idx) => {
        const on = idx === i;
        slide.classList.toggle("is-active", on);
        slide.setAttribute("aria-hidden", on ? "false" : "true");
      });
      index = i;
      syncVideos(i, true);
      scheduleAdvance();
      restartPip(i);
    };

    /* ended → sonraki slayt (bir kez bağla) */
    slides.forEach((slide, i) => {
      const video = qs("[data-hero-video]", slide);
      if (!video) return;
      prepareLazyVideo(video);
      video.loop = false;
      video.addEventListener("ended", () => {
        if (i !== index || !canRun()) return;
        goTo(index + 1, false);
      });
    });

    prevBtn?.addEventListener("click", () => goTo(index - 1, true));
    nextBtn?.addEventListener("click", () => goTo(index + 1, true));

    /* Hover/focus’ta durmaz — oynatma devam eder */
    root.addEventListener("kuuine:hero-resume", () => {
      syncVideos(index, false);
      scheduleAdvance();
      if (slideVideo(index)) pips[index]?.classList.remove("is-paused");
      else restartPip(index);
    });

    root.addEventListener(
      "touchstart",
      (e) => {
        touchX = e.changedTouches[0]?.clientX ?? null;
      },
      { passive: true }
    );
    root.addEventListener(
      "touchend",
      (e) => {
        if (touchX == null) return;
        const dx = (e.changedTouches[0]?.clientX ?? touchX) - touchX;
        touchX = null;
        if (Math.abs(dx) < 48) return;
        goTo(index + (dx < 0 ? 1 : -1), true);
      },
      { passive: true }
    );

    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver(
        ([entry]) => {
          inView = entry.isIntersecting && entry.intersectionRatio > 0.2;
          if (inView) {
            syncVideos(index, false);
            scheduleAdvance();
            if (slideVideo(index)) pips[index]?.classList.remove("is-paused");
            else restartPip(index);
          } else {
            clearTimer();
            syncVideos(index, false);
            pips[index]?.classList.add("is-paused");
          }
        },
        { threshold: [0, 0.2, 0.5] }
      );
      io.observe(root);
    }

    const startHero = () => goTo(index, true);
    if (document.documentElement.classList.contains("kuuine-preloader-pending")) {
      window.addEventListener("kuuine:preloader-complete", startHero, { once: true });
    } else {
      startHero();
    }
  });

  /* Feature banner auto-rotate — sadece viewport’tayken */
  qsa("[data-feature-slideshow]").forEach((root) => {
    const slides = qsa("[data-feature-slide]", root);
    if (slides.length < 2) return;
    let i = 0;
    let timer = null;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    slides.forEach((s, idx) => {
      s.hidden = idx !== 0;
    });
    const stop = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };
    const start = () => {
      if (reduced || timer) return;
      timer = setInterval(() => {
        slides[i].hidden = true;
        i = (i + 1) % slides.length;
        slides[i].hidden = false;
      }, 6000);
    };
    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting && entry.intersectionRatio > 0.2) start();
          else stop();
        },
        { threshold: [0, 0.2, 0.5] }
      );
      io.observe(root);
    } else {
      start();
    }
  });

  initViewportVideos();

  /* Our Story: sticky media + scroll spy */
  qsa("[data-our-story]").forEach((root) => {
    const tabs = qsa("[data-story-tab]", root);
    const slides = qsa("[data-story-slide]", root);
    const medias = qsa("[data-story-media]", root);

    const syncStoryMediaVideos = () => {
      medias.forEach((m) => {
        const video = qs("video", m);
        if (!video || typeof video._kuuineStorySync !== "function") return;
        video._kuuineStorySync();
      });
    };

    const activate = (id, scrollTo) => {
      tabs.forEach((t) => t.classList.toggle("is-active", t.dataset.storyTab === id));
      medias.forEach((m) => m.classList.toggle("is-active", m.dataset.storyMedia === id));
      syncStoryMediaVideos();
      if (scrollTo) {
        const target = slides.find((s) => s.dataset.storySlide === id);
        if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    };

    tabs.forEach((tab) => {
      tab.addEventListener("click", (e) => {
        e.preventDefault();
        activate(tab.dataset.storyTab, true);
      });
    });

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible) activate(visible.target.dataset.storySlide, false);
      },
      { root: null, threshold: [0.35, 0.55, 0.7], rootMargin: "-20% 0px -35% 0px" }
    );

    slides.forEach((slide) => observer.observe(slide));
  });

  /* Footer accordion (mobile) */
  qsa("[data-footer-accordion]").forEach((root) => {
    qsa(".footer-col__head", root).forEach((btn) => {
      btn.addEventListener("click", () => {
        if (window.matchMedia("(min-width: 981px)").matches) return;
        const col = btn.closest(".footer-col");
        if (!col) return;
        const open = col.classList.toggle("is-open");
        btn.setAttribute("aria-expanded", open ? "true" : "false");
      });
    });
  });

  /* Header: sadece görünüm değişir (fixed kalır → layout kayması olmaz) */
  const header = qs("[data-site-header]");
  if (header && header.classList.contains("site-header--over-hero")) {
    const onScroll = () => {
      const solid = window.scrollY > window.innerHeight * 0.7;
      header.classList.toggle("site-header--solid", solid);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  /* Minas-style info Lottie — lib + JSON yalnızca section yaklaşınca */
  const initInfoLottie = () => {
    const nodes = qsa("[data-lottie]");
    if (!nodes.length) return;

    const mount = () => {
      ensureLottie()
        .then(() => {
          if (typeof window.lottie === "undefined") return;
          nodes.forEach((el) => {
            const src = el.getAttribute("data-lottie-src");
            if (!src || el.dataset.lottieReady === "1") return;

            const idle = el.getAttribute("data-lottie-idle") || "end";
            const anim = window.lottie.loadAnimation({
              container: el,
              renderer: "svg",
              loop: false,
              autoplay: false,
              path: src,
              rendererSettings: {
                preserveAspectRatio: "xMidYMid meet",
              },
            });

            const goIdle = () => {
              const last = Math.max(0, anim.totalFrames - 1);
              anim.goToAndStop(idle === "start" ? 0 : last, true);
            };

            anim.addEventListener("DOMLoaded", goIdle);
            anim.addEventListener("complete", goIdle);

            const play = () => {
              anim.stop();
              anim.goToAndPlay(0, true);
            };

            const item = el.closest(".testimonials__info-item") || el;
            item.addEventListener("mouseenter", play);
            item.addEventListener("focusin", play);
            el.dataset.lottieReady = "1";
          });
        })
        .catch(() => {});
    };

    const section =
      qs(".testimonials") || nodes[0].closest("section") || nodes[0];
    if (!("IntersectionObserver" in window)) {
      whenIdle(mount);
      return;
    }
    const io = new IntersectionObserver(
      ([entry], obs) => {
        if (!entry.isIntersecting) return;
        obs.disconnect();
        whenIdle(mount, 1200);
      },
      { root: null, rootMargin: "30% 0px", threshold: 0.01 }
    );
    io.observe(section);
  };

  initInfoLottie();
})();
