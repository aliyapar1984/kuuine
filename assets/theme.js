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
            /* Tab değişiminde unload yok — kısa scroll salınımında poster/flash olmasın */
            pauseLazyVideo(video);
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
    const DUR = 360;
    const STAGGER = 14;
    const DUR_BRAND = 560;
    const STAGGER_BRAND = 38;
    const HOLD = 110;

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
      /* Tek sinyal: hero startHero dinler. hero-resume burada yok —
         aksi halde IO/resume ile çift start → video ~1–2sn sonra başa sarar */
      window.dispatchEvent(new CustomEvent("kuuine:preloader-complete"));
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
      await wait(50);
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
    let started = false;

    const slideVideo = (i) => qs("[data-hero-video]", slides[i]);
    const canRun = () =>
      started &&
      !reduced &&
      inView &&
      !root.classList.contains("is-pin-complete") &&
      !document.documentElement.classList.contains("kuuine-preloader-pending");

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

    const setPipScale = (i, ratio) => {
      const fill = qs(".hero__pip-fill", pips[i]);
      if (!fill) return;
      const r = Math.min(1, Math.max(0, ratio));
      fill.style.animation = "none";
      fill.style.transform = `translateY(-50%) scaleX(${r})`;
    };

    const syncPipFromVideo = (video) => {
      if (!video) return;
      const d = video.duration;
      if (!Number.isFinite(d) || d <= 0) {
        setPipScale(index, 0);
        return;
      }
      setPipScale(index, video.currentTime / d);
    };

    /* clock=true → görsel slayt CSS animasyonu; video → JS scaleX */
    const restartPip = (i, { clock = false, paused = false, progress = 0 } = {}) => {
      pips.forEach((pip, idx) => {
        const on = idx === i;
        pip.classList.toggle("is-active", on);
        pip.classList.toggle("is-clock", on && clock && !reduced);
        pip.classList.toggle("is-paused", on && paused);
        pip.setAttribute("aria-selected", on ? "true" : "false");
        const fill = qs(".hero__pip-fill", pip);
        if (!fill) return;
        fill.style.animation = "none";
        if (on && clock && !reduced) {
          fill.style.transform = "";
          void fill.offsetWidth;
          fill.style.animation = "";
        } else if (on) {
          fill.style.transform = `translateY(-50%) scaleX(${Math.min(1, Math.max(0, progress))})`;
        } else {
          fill.style.transform = "translateY(-50%) scaleX(0)";
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
            if (i !== index) return;
            if (restart) {
              try {
                video.currentTime = 0;
              } catch (_) {}
            }
            syncPipFromVideo(video);
            playLazyVideo(video);
          });
        } else if (i === active) {
          pauseLazyVideo(video);
          syncPipFromVideo(video);
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
        /* Geçiş video 'ended' ile — pip timeupdate ile */
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
      const video = slideVideo(i);
      if (video) {
        restartPip(i, { clock: false, paused: !canRun(), progress: 0 });
      } else {
        setPipDuration(IMAGE_MS);
        restartPip(i, { clock: true, paused: !canRun() });
      }
      syncVideos(i, true);
      scheduleAdvance();
    };

    /* ended → sonraki slayt; timeupdate → pip (bir kez bağla) */
    slides.forEach((slide, i) => {
      const video = qs("[data-hero-video]", slide);
      if (!video) return;
      prepareLazyVideo(video);
      video.loop = false;
      video.addEventListener("ended", () => {
        if (i !== index || !canRun()) return;
        setPipScale(i, 1);
        goTo(index + 1, false);
      });
      video.addEventListener("timeupdate", () => {
        if (i !== index) return;
        syncPipFromVideo(video);
      });
      video.addEventListener("loadedmetadata", () => {
        if (i !== index) return;
        syncPipFromVideo(video);
      });
    });

    prevBtn?.addEventListener("click", () => goTo(index - 1, true));
    nextBtn?.addEventListener("click", () => goTo(index + 1, true));

    const resumeHeroUi = () => {
      /* Preloader / ilk start öncesi veya çift tetik: oynatmayı başlatma / başa sarma */
      if (!started) return;
      syncVideos(index, false);
      scheduleAdvance();
      const video = slideVideo(index);
      if (video) {
        syncPipFromVideo(video);
        restartPip(index, {
          clock: false,
          paused: !canRun(),
          progress: video.duration > 0 ? video.currentTime / video.duration : 0,
        });
      } else {
        restartPip(index, { clock: true, paused: !canRun() });
      }
    };

    root.addEventListener("kuuine:hero-resume", resumeHeroUi);

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
          if (!started) return;
          if (inView) {
            resumeHeroUi();
          } else {
            clearTimer();
            syncVideos(index, false);
            pips[index]?.classList.add("is-paused");
            const video = slideVideo(index);
            if (video) syncPipFromVideo(video);
          }
        },
        { threshold: [0, 0.2, 0.5] }
      );
      io.observe(root);
    }

    const startHero = () => {
      if (started) return;
      started = true;
      goTo(index, true);
    };
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
    let activeId =
      medias.find((m) => m.classList.contains("is-active"))?.dataset.storyMedia ||
      slides[0]?.dataset.storySlide ||
      "";
    /* Tüm slide oranları — callback’te yalnız değişen entry’ye bakmak yanlış medyayı flash’lıyordu */
    const slideEntries = new Map();

    const syncStoryMediaVideos = () => {
      medias.forEach((m) => {
        const video = qs("video", m);
        if (!video || typeof video._kuuineStorySync !== "function") return;
        video._kuuineStorySync();
      });
    };

    const activate = (id, scrollTo) => {
      if (!id) return;
      if (id === activeId && !scrollTo) return;
      activeId = id;
      tabs.forEach((t) => t.classList.toggle("is-active", t.dataset.storyTab === id));
      medias.forEach((m) => {
        const on = m.dataset.storyMedia === id;
        m.classList.toggle("is-active", on);
        m.setAttribute("aria-hidden", on ? "false" : "true");
      });
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

    const pickBestSlide = () => {
      let best = null;
      let bestRatio = 0;
      slides.forEach((slide) => {
        const entry = slideEntries.get(slide);
        if (!entry || !entry.isIntersecting) return;
        if (entry.intersectionRatio > bestRatio) {
          bestRatio = entry.intersectionRatio;
          best = slide;
        }
      });
      if (best) return best;

      /* IO bandı boşsa: odak çizgisine (viewport %42) en yakın slide */
      const focusY = window.innerHeight * 0.42;
      let nearest = null;
      let nearestDist = Infinity;
      slides.forEach((slide) => {
        const r = slide.getBoundingClientRect();
        if (r.bottom <= 0 || r.top >= window.innerHeight) return;
        const mid = r.top + r.height * 0.5;
        const dist = Math.abs(mid - focusY);
        if (dist < nearestDist) {
          nearestDist = dist;
          nearest = slide;
        }
      });
      return nearest;
    };

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => slideEntries.set(entry.target, entry));
        const best = pickBestSlide();
        if (best) activate(best.dataset.storySlide, false);
      },
      {
        root: null,
        threshold: [0, 0.15, 0.3, 0.45, 0.6, 0.75],
        rootMargin: "-18% 0px -42% 0px",
      }
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
      if (document.body.classList.contains("mega-menu-open")) return;
      const solid = window.scrollY > window.innerHeight * 0.7;
      header.classList.toggle("site-header--solid", solid);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  /* Mega menü — Ürünler hover / focus */
  (() => {
    const root = qs("[data-mega-menu]");
    const trigger = qs("[data-mega-trigger]");
    const triggerWrap = qs("[data-mega-trigger-wrap]");
    if (!root || !trigger || !header) return;
    if (window.matchMedia("(max-width: 900px)").matches) return;

    const cats = qsa("[data-mega-cat]", root);
    const subs = qsa("[data-mega-subs]", root);
    const mediaSets = qsa("[data-mega-media]", root);
    const backdrop = qs("[data-mega-backdrop]", root);
    let closeTimer = null;
    let open = false;

    const setCat = (id) => {
      cats.forEach((btn) => {
        const on = btn.dataset.megaCat === id;
        btn.classList.toggle("is-active", on);
        btn.setAttribute("aria-expanded", on ? "true" : "false");
      });
      subs.forEach((list) => {
        const on = list.dataset.megaSubs === id;
        list.classList.toggle("is-active", on);
        list.setAttribute("aria-hidden", on ? "false" : "true");
      });
      mediaSets.forEach((set) => {
        const on = set.dataset.megaMedia === id;
        set.classList.toggle("is-active", on);
        set.setAttribute("aria-hidden", on ? "false" : "true");
      });
    };

    const openMenu = () => {
      if (closeTimer) {
        clearTimeout(closeTimer);
        closeTimer = null;
      }
      if (open) return;
      open = true;
      root.hidden = false;
      requestAnimationFrame(() => {
        root.classList.add("is-open");
        header.classList.add("mega-is-open");
        document.body.classList.add("mega-menu-open");
        trigger.setAttribute("aria-expanded", "true");
      });
    };

    const closeMenu = () => {
      if (!open) return;
      open = false;
      root.classList.remove("is-open");
      header.classList.remove("mega-is-open");
      document.body.classList.remove("mega-menu-open");
      trigger.setAttribute("aria-expanded", "false");
      window.setTimeout(() => {
        if (!open) root.hidden = true;
      }, 480);
    };

    const scheduleClose = () => {
      if (closeTimer) clearTimeout(closeTimer);
      closeTimer = window.setTimeout(closeMenu, 160);
    };

    const cancelClose = () => {
      if (closeTimer) {
        clearTimeout(closeTimer);
        closeTimer = null;
      }
    };

    triggerWrap.addEventListener("mouseenter", () => {
      cancelClose();
      openMenu();
    });
    triggerWrap.addEventListener("mouseleave", scheduleClose);
    root.addEventListener("mouseenter", cancelClose);
    root.addEventListener("mouseleave", scheduleClose);

    trigger.addEventListener("focus", openMenu);
    trigger.addEventListener("click", (e) => {
      if (window.matchMedia("(min-width: 901px)").matches) {
        e.preventDefault();
        if (open) closeMenu();
        else openMenu();
      }
    });

    cats.forEach((btn) => {
      btn.addEventListener("mouseenter", () => setCat(btn.dataset.megaCat));
      btn.addEventListener("focus", () => setCat(btn.dataset.megaCat));
    });

    backdrop?.addEventListener("click", closeMenu);
    qsa("[data-mega-close]", root).forEach((btn) => {
      btn.addEventListener("click", closeMenu);
    });
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeMenu();
    });

    const active = cats.find((c) => c.classList.contains("is-active"));
    if (active) setCat(active.dataset.megaCat);
  })();

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
