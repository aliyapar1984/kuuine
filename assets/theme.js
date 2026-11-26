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
      /* Uzun section (katalog vb.) intersectionRatio’yu düşürüp ambient play’i engeller —
         önce yakın medya/hero kabı, section yalnızca kısa bloklarda. */
      const observeTarget =
        video.closest(".catalog-look") ||
        video.closest(".catalog-atelier__hero") ||
        video.closest("[data-catalog-landing]") ||
        video.closest(".thematic-duo__figure") ||
        video.closest(".product-card") ||
        storySlide ||
        video.closest(".feature-banner") ||
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

  /* Our Story: sticky media + scroll spy (medya geçişi yalnız desktop) */
  qsa("[data-our-story]").forEach((root) => {
    const tabs = qsa("[data-story-tab]", root);
    const slides = qsa("[data-story-slide]", root);
    const medias = qsa("[data-story-media]", root);
    const mqDesk = window.matchMedia("(min-width: 900px)");
    const firstMediaId = medias[0]?.dataset.storyMedia || slides[0]?.dataset.storySlide || "";
    let activeId =
      medias.find((m) => m.classList.contains("is-active"))?.dataset.storyMedia ||
      firstMediaId;
    /* Tüm slide oranları — callback’te yalnız değişen entry’ye bakmak yanlış medyayı flash’lıyordu */
    const slideEntries = new Map();

    const syncStoryMediaVideos = () => {
      medias.forEach((m) => {
        const video = qs("video", m);
        if (!video || typeof video._kuuineStorySync !== "function") return;
        video._kuuineStorySync();
      });
    };

    const setMedia = (id) => {
      medias.forEach((m) => {
        const on = m.dataset.storyMedia === id;
        m.classList.toggle("is-active", on);
        m.setAttribute("aria-hidden", on ? "false" : "true");
      });
      syncStoryMediaVideos();
    };

    const lockFirstMedia = () => {
      if (!firstMediaId) return;
      activeId = firstMediaId;
      setMedia(firstMediaId);
      tabs.forEach((t, i) => t.classList.toggle("is-active", i === 0 || t.dataset.storyTab === firstMediaId));
    };

    const activate = (id, scrollTo) => {
      if (!id) return;
      if (id === activeId && !scrollTo) return;
      activeId = id;
      tabs.forEach((t) => t.classList.toggle("is-active", t.dataset.storyTab === id));
      /* Mobilde yalnız ilk görsel — scroll spy / tab ile medya değişmez */
      if (mqDesk.matches) setMedia(id);
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

    let observer = null;
    const bindObserver = () => {
      if (observer) {
        observer.disconnect();
        observer = null;
      }
      slideEntries.clear();
      if (!mqDesk.matches) {
        lockFirstMedia();
        return;
      }
      observer = new IntersectionObserver(
        (entries) => {
          if (!mqDesk.matches) return;
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
    };

    bindObserver();
    if (typeof mqDesk.addEventListener === "function") {
      mqDesk.addEventListener("change", bindObserver);
    } else if (typeof mqDesk.addListener === "function") {
      mqDesk.addListener(bindObserver);
    }
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

  /* FAQ accordion */
  qsa("[data-faq-accordion]").forEach((root) => {
    qsa("[data-faq-trigger]", root).forEach((btn) => {
      btn.addEventListener("click", () => {
        const item = btn.closest(".pdp-faq__item");
        if (!item) return;
        const open = !item.classList.contains("is-open");
        qsa(".pdp-faq__item", root).forEach((el) => {
          const on = el === item && open;
          el.classList.toggle("is-open", on);
          const t = qs("[data-faq-trigger]", el);
          if (t) t.setAttribute("aria-expanded", on ? "true" : "false");
        });
      });
    });
  });

  /* Header: sadece görünüm değişir (fixed kalır → layout kayması olmaz) */
  const header = qs("[data-site-header]");
  const syncHeaderSolid = () => {
    if (!header || !header.classList.contains("site-header--over-hero")) return;
    if (
      document.body.classList.contains("mega-menu-open") ||
      document.body.classList.contains("ai-search-open") ||
      document.body.classList.contains("nav-drawer-open")
    ) {
      header.classList.add("site-header--solid");
      return;
    }
    const solid = window.scrollY > window.innerHeight * 0.7;
    header.classList.toggle("site-header--solid", solid);
  };
  if (header && header.classList.contains("site-header--over-hero")) {
    syncHeaderSolid();
    window.addEventListener("scroll", syncHeaderSolid, { passive: true });
  }

  /* Mobil menü drawer — soldan (filtre ritmi) */
  (() => {
    const drawer = qs("[data-nav-drawer]");
    const openBtns = qsa("[data-nav-drawer-open]");
    if (!drawer || !openBtns.length) return;

    if (drawer.parentElement !== document.body) {
      document.body.appendChild(drawer);
    }

    let open = false;

    const openDrawer = () => {
      if (open) return;
      open = true;
      drawer.hidden = false;
      drawer.setAttribute("aria-hidden", "false");
      document.body.classList.add("nav-drawer-open");
      openBtns.forEach((btn) => btn.setAttribute("aria-expanded", "true"));
      syncHeaderSolid();
      requestAnimationFrame(() => drawer.classList.add("is-open"));
    };

    const closeDrawer = () => {
      if (!open) return;
      open = false;
      drawer.classList.remove("is-open");
      document.body.classList.remove("nav-drawer-open");
      openBtns.forEach((btn) => btn.setAttribute("aria-expanded", "false"));
      drawer.setAttribute("aria-hidden", "true");
      syncHeaderSolid();
      window.setTimeout(() => {
        if (!open) drawer.hidden = true;
      }, 480);
    };

    openBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        if (open) closeDrawer();
        else openDrawer();
      });
    });
    qsa("[data-nav-drawer-close]", drawer).forEach((el) => {
      el.addEventListener("click", closeDrawer);
    });
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && open) closeDrawer();
    });
  })();

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

  /* Katalog: sıralama, kategori, görünüm, filtre modal */
  qsa("[data-catalog]").forEach((root) => {
    const sort = qs("[data-catalog-sort]", root);
    const grid = qs("[data-catalog-grid]", root);
    const filterModal = qs("[data-catalog-filter-modal]", root);
    const landing = qs("[data-catalog-landing]", root);

    if (landing) {
      if ("IntersectionObserver" in window) {
        const landIo = new IntersectionObserver(
          ([entry]) => {
            if (entry.isIntersecting) {
              landing.classList.add("is-inview");
              landIo.disconnect();
            }
          },
          { threshold: 0.15 }
        );
        landIo.observe(landing);
      } else {
        landing.classList.add("is-inview");
      }
    }

    if ("IntersectionObserver" in window) {
      const revealIo = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            entry.target.classList.add("is-revealed");
            revealIo.unobserve(entry.target);
          });
        },
        { threshold: 0.2, rootMargin: "0px 0px -8% 0px" }
      );
      qsa("[data-catalog-reveal]", root).forEach((el) => revealIo.observe(el));
    } else {
      qsa("[data-catalog-reveal]", root).forEach((el) => el.classList.add("is-revealed"));
    }

    if (sort) {
      const params = new URLSearchParams(window.location.search);
      if (params.get("sort_by")) sort.value = params.get("sort_by");
      sort.addEventListener("change", () => {
        if (!window.Shopify) return;
        const url = new URL(window.location.href);
        url.searchParams.set("sort_by", sort.value);
        window.location.assign(url.toString());
      });
    }

    const categoryLabel = qs("[data-catalog-category]", root);
    const categoryDefault = categoryLabel?.textContent?.trim() || "";

    qsa("[data-catalog-chip]", root).forEach((chip) => {
      chip.addEventListener("click", () => {
        qsa("[data-catalog-chip]", root).forEach((c) => c.classList.remove("is-active"));
        chip.classList.add("is-active");
        if (categoryLabel) {
          const key = chip.dataset.catalogChip || "all";
          const label = (chip.textContent || "").trim();
          categoryLabel.textContent = key === "all" ? categoryDefault || label : label;
        }
      });
    });

    const syncBannerHeight = () => {
      if (!grid) return;
      const card = grid.querySelector(".product-card");
      if (!card) return;
      const h = Math.ceil(card.getBoundingClientRect().height);
      if (h > 0) grid.style.setProperty("--catalog-card-h", `${h}px`);
    };

    const deskMq = window.matchMedia("(min-width: 900px)");
    const isDesk = () => deskMq.matches;

    const setView = (cols) => {
      if (!grid) return;
      const n = Number(cols);
      if (isDesk()) {
        if (n !== 3 && n !== 4) return;
        grid.classList.toggle("catalog__grid--cols-3", n === 3);
        grid.classList.toggle("catalog__grid--cols-4", n === 4);
        try {
          localStorage.setItem("kuuine-catalog-cols-desk", String(n));
        } catch (e) {}
      } else {
        if (n !== 1 && n !== 2) return;
        grid.classList.toggle("catalog__grid--cols-1", n === 1);
        grid.classList.toggle("catalog__grid--cols-2", n === 2);
        try {
          localStorage.setItem("kuuine-catalog-cols-mobile", String(n));
        } catch (e) {}
      }
      qsa("[data-catalog-view]", root).forEach((btn) => {
        const on = Number(btn.dataset.catalogView) === n;
        btn.classList.toggle("is-active", on);
        btn.setAttribute("aria-pressed", on ? "true" : "false");
      });
      requestAnimationFrame(syncBannerHeight);
    };

    const restoreView = () => {
      try {
        if (isDesk()) {
          const saved = Number(localStorage.getItem("kuuine-catalog-cols-desk"));
          setView(saved === 3 || saved === 4 ? saved : 4);
        } else {
          const saved = Number(localStorage.getItem("kuuine-catalog-cols-mobile"));
          setView(saved === 1 || saved === 2 ? saved : 2);
        }
      } catch (e) {
        setView(isDesk() ? 4 : 2);
      }
    };

    qsa("[data-catalog-view]", root).forEach((btn) => {
      btn.addEventListener("click", () => setView(Number(btn.dataset.catalogView)));
    });

    restoreView();
    if (typeof deskMq.addEventListener === "function") {
      deskMq.addEventListener("change", restoreView);
    } else if (typeof deskMq.addListener === "function") {
      deskMq.addListener(restoreView);
    }

    syncBannerHeight();
    window.addEventListener("resize", syncBannerHeight, { passive: true });
    if (typeof ResizeObserver !== "undefined" && grid) {
      const card = grid.querySelector(".product-card");
      if (card) {
        const ro = new ResizeObserver(() => syncBannerHeight());
        ro.observe(card);
      }
    }

    if (filterModal) {
      let filterOpen = false;
      const filterCountEls = qsa("[data-catalog-filter-count]", root);
      const openFilterBtns = qsa("[data-catalog-filter-open]", root);

      /* Header altında kalmasın: viewport’a sabitle */
      if (filterModal.parentElement !== document.body) {
        document.body.appendChild(filterModal);
      }

      const filterInputs = qsa("[data-catalog-filter]", filterModal);
      const filterTitle = qs("#catalog-filter-title", filterModal);
      if (filterTitle) filterTitle.textContent = "Filtrele";

      const activeFilterCount = () =>
        filterInputs.filter((input) => {
          if (!input.checked) return false;
          /* Varsayılan "Stokta" sayaca dahil değil */
          return input.dataset.catalogFilter !== "available";
        }).length;

      const syncFilterCount = () => {
        const n = activeFilterCount();
        filterCountEls.forEach((el) => {
          if (n > 0) {
            el.hidden = false;
            el.textContent = String(n);
          } else {
            el.hidden = true;
            el.textContent = "";
          }
        });
        openFilterBtns.forEach((btn) => {
          btn.setAttribute("aria-label", n > 0 ? `Filtrele, ${n} aktif` : "Filtrele");
          btn.classList.toggle("has-filters", n > 0);
        });
      };

      const openFilter = () => {
        if (filterOpen) return;
        filterOpen = true;
        if (filterTitle) filterTitle.textContent = "Filtrele";
        filterModal.hidden = false;
        filterModal.setAttribute("aria-hidden", "false");
        document.body.classList.add("catalog-filter-open");
        requestAnimationFrame(() => filterModal.classList.add("is-open"));
      };
      const closeFilter = () => {
        if (!filterOpen) return;
        filterOpen = false;
        filterModal.classList.remove("is-open");
        document.body.classList.remove("catalog-filter-open");
        filterModal.setAttribute("aria-hidden", "true");
        window.setTimeout(() => {
          if (!filterOpen) filterModal.hidden = true;
        }, 480);
      };

      openFilterBtns.forEach((btn) => {
        btn.addEventListener("click", openFilter);
      });
      qsa("[data-catalog-filter-close]", filterModal).forEach((btn) => {
        btn.addEventListener("click", closeFilter);
      });
      qsa("[data-catalog-filter-reset]", filterModal).forEach((btn) => {
        btn.addEventListener("click", () => {
          filterInputs.forEach((input) => {
            input.checked = input.dataset.catalogFilter === "available";
          });
          syncFilterCount();
        });
      });
      filterInputs.forEach((input) => {
        input.addEventListener("change", syncFilterCount);
      });
      syncFilterCount();
      window.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && filterOpen) closeFilter();
      });
    }
  });

  /* Header AI arama — üstten aşağı drawer */
  (() => {
    const root = qs("[data-ai-search]");
    const openBtns = qsa("[data-ai-search-open]");
    if (!root || !openBtns.length) return;

    if (root.parentElement !== document.body) {
      document.body.appendChild(root);
    }

    const input = qs("[data-ai-search-input]", root);
    const form = qs("[data-ai-search-form]", root);
    const clearBtn = qs("[data-ai-search-clear]", root);
    const results = qs("[data-ai-search-results]", root);
    const assist = qs("[data-ai-search-assist]", root);
    const reply = qs("[data-ai-search-reply]", root);
    const backdrop = qs("[data-ai-search-backdrop]", root);
    const catalogNode = qs("[data-ai-search-catalog]");
    let open = false;
    let catalog = [];

    const syncClearBtn = () => {
      if (!clearBtn) return;
      const has = !!(input?.value || "").trim();
      clearBtn.hidden = !has;
    };

    try {
      if (catalogNode) catalog = JSON.parse(catalogNode.textContent || "[]");
    } catch (e) {
      catalog = [];
    }

    const replyFor = (q) => {
      const t = q.toLowerCase();
      if (t.includes("yemek") || t.includes("takım") || t.includes("sofra")) {
        return "Sofra için yemek takımı ve seramik seçkiler hazırladım — misafir sayınıza göre setleri öne çıkardım.";
      }
      if (t.includes("bardak") || t.includes("cam") || t.includes("fincan")) {
        return "Cam ve bardak tarafında soft, amber ve kristal seçenekleri bir araya getirdim.";
      }
      if (t.includes("emaye")) {
        return "Emaye parçalarda mutfak ve sofra kesişiminde sade formlar öneriyorum.";
      }
      if (t.includes("outlet") || t.includes("indirim")) {
        return "Outlet ve sınırlı stoklu parçaları ayıkladım — kaçırmadan bakın.";
      }
      return `“${q}” için kuuine kataloğundan en yakın eşleşmeleri getirdim.`;
    };

    const filterLocal = (q) => {
      const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
      if (!terms.length) return catalog.slice(0, 6);
      return catalog
        .filter((p) => {
          const hay = `${p.title} ${p.brand || ""} ${p.tags || ""}`.toLowerCase();
          return terms.some((t) => hay.includes(t));
        })
        .slice(0, 6);
    };

    const renderCards = (items) => {
      if (!results) return;
      if (!items.length) {
        results.innerHTML = `<p class="ai-search__hint">Eşleşen ürün yok — arama sayfasında tüm sonuçlara bakabilirsiniz.</p>`;
        return;
      }
      results.innerHTML = items
        .map(
          (p) => `
        <a class="ai-search__card" href="${p.url || "#"}">
          <div class="ai-search__card-media">
            ${p.image ? `<img src="${p.image}" alt="" loading="lazy" decoding="async" width="320" height="400">` : ""}
          </div>
          <div class="ai-search__card-body">
            <h3 class="ai-search__card-title">${p.title}</h3>
            <p class="ai-search__card-meta">${p.brand || ""} · ${p.price || ""}</p>
          </div>
        </a>`
        )
        .join("");
    };

    const runQuery = (q) => {
      const query = (q || "").trim();
      if (!query) return;
      if (assist && reply) {
        assist.hidden = false;
        reply.textContent = replyFor(query);
      }
      if (catalog.length) {
        renderCards(filterLocal(query));
        return;
      }
      /* Shopify Predictive Search */
      const url = `/search/suggest.json?q=${encodeURIComponent(query)}&resources[type]=product&resources[limit]=6`;
      fetch(url)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          const products = data?.resources?.results?.products || [];
          renderCards(
            products.map((p) => ({
              title: p.title,
              url: p.url,
              image: p.image,
              brand: p.vendor || "",
              price: p.price || "",
            }))
          );
        })
        .catch(() => {
          if (results) {
            results.innerHTML = `<p class="ai-search__hint">Öneri alınamadı. <a href="/search?q=${encodeURIComponent(query)}">Arama sayfasına git</a></p>`;
          }
        });
    };

    const openSearch = () => {
      if (open) return;
      open = true;
      root.hidden = false;
      root.setAttribute("aria-hidden", "false");
      document.body.classList.add("ai-search-open");
      header?.classList.add("site-header--solid");
      requestAnimationFrame(() => {
        root.classList.add("is-open");
        input?.focus();
      });
    };

    const closeSearch = () => {
      if (!open) return;
      open = false;
      root.classList.remove("is-open");
      document.body.classList.remove("ai-search-open");
      root.setAttribute("aria-hidden", "true");
      if (typeof syncHeaderSolid === "function") syncHeaderSolid();
      window.setTimeout(() => {
        if (!open) root.hidden = true;
      }, 520);
    };

    openBtns.forEach((btn) => btn.addEventListener("click", openSearch));
    qsa("[data-ai-search-close]", root).forEach((btn) => btn.addEventListener("click", closeSearch));
    backdrop?.addEventListener("click", closeSearch);
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && open) closeSearch();
    });

    form?.addEventListener("submit", (e) => {
      if (!catalog.length) return; /* Shopify: normal form submit → search page */
      e.preventDefault();
      runQuery(input?.value || "");
    });

    clearBtn?.addEventListener("click", () => {
      if (!input) return;
      input.value = "";
      syncClearBtn();
      if (assist) assist.hidden = true;
      if (reply) reply.textContent = "";
      if (results) results.innerHTML = "";
      qsa("[data-ai-chip]", root).forEach((c) => c.classList.remove("is-active"));
      input.focus();
    });

    let debounce;
    input?.addEventListener("input", () => {
      syncClearBtn();
      window.clearTimeout(debounce);
      debounce = window.setTimeout(() => {
        if ((input.value || "").trim().length >= 2) runQuery(input.value);
      }, 280);
    });

    qsa("[data-ai-chip]", root).forEach((chip) => {
      chip.addEventListener("click", () => {
        qsa("[data-ai-chip]", root).forEach((c) => c.classList.remove("is-active"));
        chip.classList.add("is-active");
        if (input) input.value = chip.dataset.aiChip || chip.textContent.trim();
        syncClearBtn();
        runQuery(input?.value || "");
      });
    });

    syncClearBtn();
  })();

  /* ——— PDP: galeri index (mobil snap / masaüstü scroll) + varyant ——— */
  qsa("[data-pdp]").forEach((root) => {
    const frames = qsa("[data-pdp-frame]", root);
    const indexEl = qs("[data-pdp-index]", root);
    const gallery = qs("[data-pdp-gallery]", root);
    const progressEl = qs("[data-pdp-progress]", root);
    const progressFill = qs("[data-pdp-progress-fill]", root);
    const form = qs("[data-pdp-form]", root);
    const variantInput = qs("[data-pdp-variant-id]", root);
    const priceEl = qs("[data-pdp-price]", root);
    const submit = qs("[data-pdp-submit]", root);
    const optionInputs = qsa("[data-pdp-option]", root);
    let variants = [];
    try {
      const raw = qs("[data-pdp-variants]", root)?.textContent || "[]";
      variants = JSON.parse(raw);
    } catch (_) {
      variants = [];
    }

    const pad = (n) => String(n).padStart(2, "0");
    const total = frames.length;
    const bullets = qsa("[data-pdp-jump]", root);
    const mqDesk = window.matchMedia("(min-width: 900px)");
    let galleryIo = null;

    const setIndex = (n) => {
      const i = Math.max(1, Math.min(n, total || 1));
      if (indexEl) indexEl.textContent = pad(i);
      if (progressFill && total) {
        progressFill.style.width = `${(i / total) * 100}%`;
      }
      if (progressEl) progressEl.setAttribute("aria-valuenow", String(i));
      bullets.forEach((btn) => {
        const on = Number(btn.dataset.pdpJump || "0") === i;
        btn.classList.toggle("is-active", on);
        btn.setAttribute("aria-current", on ? "true" : "false");
      });
    };

    const bindGalleryIo = () => {
      if (!frames.length || !("IntersectionObserver" in window)) return;
      if (galleryIo) {
        galleryIo.disconnect();
        galleryIo = null;
      }
      const desk = mqDesk.matches;
      galleryIo = new IntersectionObserver(
        (entries) => {
          let best = null;
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            if (!best || entry.intersectionRatio > best.intersectionRatio) best = entry;
          }
          if (best) {
            setIndex(Number(best.target.getAttribute("data-index") || "1"));
          }
        },
        desk
          ? { root: null, threshold: [0.45, 0.6, 0.8], rootMargin: "-10% 0px -10% 0px" }
          : { root: gallery, threshold: [0.55, 0.75] }
      );
      frames.forEach((f) => galleryIo.observe(f));
    };

    bindGalleryIo();
    if (typeof mqDesk.addEventListener === "function") {
      mqDesk.addEventListener("change", bindGalleryIo);
    } else if (typeof mqDesk.addListener === "function") {
      mqDesk.addListener(bindGalleryIo);
    }

    bullets.forEach((btn) => {
      btn.addEventListener("click", () => {
        const i = Number(btn.dataset.pdpJump || "1") - 1;
        const frame = frames[i];
        if (!frame) return;
        const smooth = reduceMotion() ? "auto" : "smooth";
        if (mqDesk.matches) {
          frame.scrollIntoView({ behavior: smooth, block: "start" });
        } else if (gallery) {
          gallery.scrollTo({ left: frame.offsetLeft, behavior: smooth });
        }
        setIndex(i + 1);
      });
    });

    /* Görsel zoom lightbox + slide */
    (() => {
      const zoomFrames = frames.filter((f) => f.classList.contains("pdp__frame--zoomable"));
      if (!zoomFrames.length) return;

      const slides = zoomFrames.map((frame) => {
        const img = qs("img.pdp__media", frame);
        return {
          src: frame.dataset.pdpZoom || img?.currentSrc || img?.src || "",
          alt: img?.alt || "",
        };
      }).filter((s) => s.src);

      if (!slides.length) return;

      let dialog = qs("[data-pdp-zoom-dialog]");
      if (!dialog) {
        dialog = document.createElement("dialog");
        dialog.className = "pdp-zoom";
        dialog.setAttribute("data-pdp-zoom-dialog", "");
        dialog.innerHTML =
          '<button type="button" class="pdp-zoom__close" data-pdp-zoom-close aria-label="Kapat">×</button>' +
          '<div class="pdp-zoom__stage" data-pdp-zoom-stage>' +
          '<button type="button" class="pdp-zoom__nav pdp-zoom__nav--prev" data-pdp-zoom-prev aria-label="Önceki">‹</button>' +
          '<img class="pdp-zoom__img is-settle" data-pdp-zoom-img alt="" decoding="async">' +
          '<button type="button" class="pdp-zoom__nav pdp-zoom__nav--next" data-pdp-zoom-next aria-label="Sonraki">›</button>' +
          "</div>" +
          '<div class="pdp-zoom__meta" data-pdp-zoom-meta aria-live="polite"></div>';
        document.body.appendChild(dialog);
      }

      const zoomImg = qs("[data-pdp-zoom-img]", dialog);
      const closeBtn = qs("[data-pdp-zoom-close]", dialog);
      const prevBtn = qs("[data-pdp-zoom-prev]", dialog);
      const nextBtn = qs("[data-pdp-zoom-next]", dialog);
      const metaEl = qs("[data-pdp-zoom-meta]", dialog);
      const stage = qs("[data-pdp-zoom-stage]", dialog);
      const pad = (n) => String(n).padStart(2, "0");
      let index = 0;
      let animating = false;
      let touchX = 0;
      let touchY = 0;

      const syncChrome = () => {
        if (metaEl) metaEl.textContent = `${pad(index + 1)} / ${pad(slides.length)}`;
        if (prevBtn) prevBtn.disabled = slides.length < 2;
        if (nextBtn) nextBtn.disabled = slides.length < 2;
        if (prevBtn) prevBtn.hidden = slides.length < 2;
        if (nextBtn) nextBtn.hidden = slides.length < 2;
      };

      const setSlide = (i) => {
        const slide = slides[i];
        if (!slide || !zoomImg) return;
        zoomImg.src = slide.src;
        zoomImg.alt = slide.alt;
        zoomImg.classList.remove("is-leave-next", "is-leave-prev", "is-enter-next", "is-enter-prev");
        zoomImg.classList.add("is-settle");
        index = i;
        syncChrome();
      };

      const waitTransition = (el) =>
        new Promise((resolve) => {
          if (reduceMotion()) {
            resolve();
            return;
          }
          let done = false;
          const finish = () => {
            if (done) return;
            done = true;
            el.removeEventListener("transitionend", onEnd);
            resolve();
          };
          const onEnd = (e) => {
            if (e.target === el && (e.propertyName === "transform" || e.propertyName === "opacity")) finish();
          };
          el.addEventListener("transitionend", onEnd);
          window.setTimeout(finish, 450);
        });

      const goTo = async (nextIndex, dir) => {
        if (!zoomImg || animating || !slides.length) return;
        const len = slides.length;
        const i = ((nextIndex % len) + len) % len;
        if (i === index && dialog.open) return;

        if (reduceMotion() || !dialog.open) {
          setSlide(i);
          return;
        }

        animating = true;
        const leave = dir >= 0 ? "is-leave-next" : "is-leave-prev";
        const enter = dir >= 0 ? "is-enter-next" : "is-enter-prev";
        zoomImg.classList.remove("is-settle", "is-enter-next", "is-enter-prev", "is-leave-next", "is-leave-prev");
        // force reflow so leave starts from settle
        void zoomImg.offsetWidth;
        zoomImg.classList.add(leave);
        await waitTransition(zoomImg);

        const slide = slides[i];
        zoomImg.src = slide.src;
        zoomImg.alt = slide.alt;
        zoomImg.classList.remove(leave);
        zoomImg.classList.add(enter);
        void zoomImg.offsetWidth;
        zoomImg.classList.remove(enter);
        zoomImg.classList.add("is-settle");
        await waitTransition(zoomImg);

        index = i;
        syncChrome();
        animating = false;
      };

      const closeZoom = () => {
        if (typeof dialog.close === "function" && dialog.open) dialog.close();
        else dialog.removeAttribute("open");
        document.body.classList.remove("pdp-zoom-open");
        animating = false;
        if (zoomImg) {
          zoomImg.removeAttribute("src");
          zoomImg.alt = "";
        }
      };

      const openZoom = (startIndex) => {
        const i = Math.max(0, Math.min(startIndex, slides.length - 1));
        setSlide(i);
        document.body.classList.add("pdp-zoom-open");
        if (typeof dialog.showModal === "function") {
          if (!dialog.open) dialog.showModal();
        } else {
          dialog.setAttribute("open", "");
        }
      };

      closeBtn?.addEventListener("click", (e) => {
        e.stopPropagation();
        closeZoom();
      });
      prevBtn?.addEventListener("click", (e) => {
        e.stopPropagation();
        goTo(index - 1, -1);
      });
      nextBtn?.addEventListener("click", (e) => {
        e.stopPropagation();
        goTo(index + 1, 1);
      });
      dialog.addEventListener("click", (e) => {
        if (e.target === dialog || e.target === stage) closeZoom();
      });
      dialog.addEventListener("close", () => {
        document.body.classList.remove("pdp-zoom-open");
        animating = false;
        if (zoomImg) {
          zoomImg.removeAttribute("src");
          zoomImg.alt = "";
        }
      });
      dialog.addEventListener("keydown", (e) => {
        if (!dialog.open) return;
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          goTo(index - 1, -1);
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          goTo(index + 1, 1);
        }
      });

      stage?.addEventListener(
        "touchstart",
        (e) => {
          const t = e.changedTouches[0];
          if (!t) return;
          touchX = t.clientX;
          touchY = t.clientY;
        },
        { passive: true }
      );
      stage?.addEventListener(
        "touchend",
        (e) => {
          const t = e.changedTouches[0];
          if (!t) return;
          const dx = t.clientX - touchX;
          const dy = t.clientY - touchY;
          if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy)) return;
          if (dx < 0) goTo(index + 1, 1);
          else goTo(index - 1, -1);
        },
        { passive: true }
      );

      zoomFrames.forEach((frame) => {
        const open = () => {
          const i = zoomFrames.indexOf(frame);
          openZoom(i < 0 ? 0 : i);
        };
        frame.addEventListener("click", open);
        frame.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            open();
          }
        });
      });
    })();

    const selectedOptions = () => {
      const map = {};
      optionInputs.forEach((input) => {
        if (input.checked) map[input.dataset.optionPosition] = input.value;
      });
      return map;
    };

    const findVariant = () => {
      if (!variants.length) return null;
      const selected = selectedOptions();
      return (
        variants.find((v) => {
          const opts = v.options || [];
          return opts.every((val, idx) => {
            const pos = String(idx + 1);
            return selected[pos] == null || selected[pos] === val;
          });
        }) || variants[0]
      );
    };

    const money = (cents) => {
      try {
        return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(
          (Number(cents) || 0) / 100
        );
      } catch (_) {
        return `₺${Math.round((Number(cents) || 0) / 100)}`;
      }
    };

    const syncColorLabel = () => {
      qsa(".pdp__option--color", root).forEach((fieldset) => {
        const label = qs("[data-pdp-color-label]", fieldset);
        const checked = qs("[data-pdp-option]:checked", fieldset);
        if (label && checked) label.textContent = `: ${checked.value}`;
      });
    };

    const syncVariant = () => {
      const v = findVariant();
      syncColorLabel();
      if (!v) return;
      if (variantInput) variantInput.value = v.id;
      if (priceEl) {
        const onSale = v.compare_at_price && v.compare_at_price > v.price;
        let html = `<span class="pdp__price-current">${money(v.price)}</span>`;
        if (onSale) {
          const pct = Math.round(((v.compare_at_price - v.price) / v.compare_at_price) * 100);
          html += `<s class="pdp__price-compare">${money(v.compare_at_price)}</s>`;
          html += `<span class="pdp__price-badge">%${pct}</span>`;
        }
        priceEl.classList.toggle("is-sale", !!onSale);
        priceEl.innerHTML = html;
      }
      if (submit) {
        submit.disabled = !v.available;
        submit.textContent = v.available ? submit.dataset.labelAdd || "Sepete ekle" : submit.dataset.labelSold || "Tükendi";
      }
    };

    if (submit) {
      submit.dataset.labelAdd = submit.textContent.trim();
      submit.dataset.labelSold = "Tükendi";
    }
    optionInputs.forEach((input) => input.addEventListener("change", syncVariant));
    if (optionInputs.length) syncVariant();

    /* Preview: form submit engelle */
    form?.addEventListener("submit", (e) => {
      if (!root.closest(".template-product") || location.protocol === "file:" || /\/preview\//.test(location.pathname)) {
        e.preventDefault();
      }
    });
  });
})();
