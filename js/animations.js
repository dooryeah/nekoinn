const reduceMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
const reduceMotion = reduceMotionQuery.matches;
const THEME_KEY = 'nekoinn-theme';
const hasGsap = Boolean(window.gsap);
const hasScrollTrigger = Boolean(window.gsap && window.ScrollTrigger);
const finePointerQuery = window.matchMedia('(hover: hover) and (pointer: fine)');
const revealRecords = new WeakMap();
let refreshFrame = 0;

if (hasGsap) {
    if (hasScrollTrigger) {
        gsap.registerPlugin(ScrollTrigger);
    }
    gsap.defaults({
        duration: 0.72,
        ease: 'power3.out'
    });
}

function getStoredTheme() {
    try {
        const saved = localStorage.getItem(THEME_KEY);
        return saved === 'night' || saved === 'day' ? saved : null;
    } catch (error) {
        return null;
    }
}

function getPreferredTheme() {
    const stored = getStoredTheme();
    if (stored) return stored;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'night' : 'day';
}

function applyTheme(theme, animate = false) {
    const nextTheme = theme === 'night' ? 'night' : 'day';
    const root = document.documentElement;

    if (animate && !reduceMotion && document.body) {
        const veil = document.createElement('span');
        veil.className = `theme-transition-veil to-${nextTheme}`;
        document.body.appendChild(veil);
        window.setTimeout(() => veil.remove(), 680);
        root.classList.add('theme-switching');
        window.setTimeout(() => root.classList.remove('theme-switching'), 560);
    }

    root.dataset.theme = nextTheme;
    root.style.colorScheme = nextTheme === 'night' ? 'dark' : 'light';
}

function setupThemeToggle() {
    applyTheme(document.documentElement.dataset.theme || getPreferredTheme());

    if (document.querySelector('.theme-toggle')) return;

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'theme-toggle';
    toggle.innerHTML = `
        <span class="theme-toggle-track" aria-hidden="true">
            <span class="theme-toggle-orb"></span>
        </span>
        <span class="sr-only">切换日夜模式</span>
    `;
    document.body.appendChild(toggle);

    const syncToggle = () => {
        const isNight = document.documentElement.dataset.theme === 'night';
        toggle.setAttribute('aria-pressed', String(isNight));
        toggle.setAttribute('aria-label', isNight ? '切换到日间模式' : '切换到夜间模式');
        toggle.title = isNight ? '切换到日间模式' : '切换到夜间模式';
    };

    toggle.addEventListener('click', () => {
        const nextTheme = document.documentElement.dataset.theme === 'night' ? 'day' : 'night';
        try {
            localStorage.setItem(THEME_KEY, nextTheme);
        } catch (error) {
            // 浏览器禁用本地存储时仍允许本次切换生效。
        }
        applyTheme(nextTheme, true);
        syncToggle();
    });

    const preference = window.matchMedia('(prefers-color-scheme: dark)');
    const handlePreferenceChange = (event) => {
        if (getStoredTheme()) return;
        applyTheme(event.matches ? 'night' : 'day', true);
        syncToggle();
    };

    if (preference.addEventListener) {
        preference.addEventListener('change', handlePreferenceChange);
    } else if (preference.addListener) {
        preference.addListener(handlePreferenceChange);
    }

    syncToggle();
}

function setupScrollProgress() {
    if (document.querySelector('.scroll-progress')) return;
    const progress = document.createElement('div');
    progress.className = 'scroll-progress';
    document.body.appendChild(progress);

    if (hasGsap && hasScrollTrigger && !reduceMotion) {
        gsap.to(progress, {
            scaleX: 1,
            ease: 'none',
            scrollTrigger: {
                trigger: document.documentElement,
                start: 'top top',
                end: 'bottom bottom',
                scrub: 0.24
            }
        });
        return;
    }

    const update = () => {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        const value = max > 0 ? window.scrollY / max : 0;
        document.documentElement.style.setProperty('--scroll-progress', Math.min(1, Math.max(0, value)).toFixed(4));
    };

    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
}

function getRevealCandidates(root = document) {
    const scope = root && root.querySelectorAll ? root : document;
    const items = [];

    if (root instanceof Element && root.matches('.fade-up')) {
        items.push(root);
    }

    scope.querySelectorAll('.fade-up').forEach(el => items.push(el));
    return Array.from(new Set(items));
}

function isRevealReady(el) {
    return Boolean(
        el
        && el.isConnected
        && !el.hidden
        && !el.closest('[hidden]')
        && el.getClientRects().length
    );
}

function isIgnoredRevealMutation(mutation) {
    const target = mutation.target;
    return Boolean(target instanceof Element && target.closest('[data-hero-carousel]'));
}

function cleanupRevealTargets(root) {
    if (!hasGsap) return;

    getRevealCandidates(root).forEach(el => {
        const record = revealRecords.get(el);
        if (record) {
            if (record.scrollTrigger) record.scrollTrigger.kill();
            if (record.tween) record.tween.kill();
            revealRecords.delete(el);
        }

        gsap.killTweensOf(el);
        delete el.dataset.revealReady;
    });
}

function refreshMotion() {
    if (hasScrollTrigger && !reduceMotion) {
        if (refreshFrame) return;
        refreshFrame = requestAnimationFrame(() => {
            refreshFrame = 0;
            ScrollTrigger.refresh();
        });
    }
}

function setupReveal() {
    const getItems = (root = document) => getRevealCandidates(root)
        .filter(el => !el.classList.contains('visible') && el.dataset.revealReady !== 'true' && isRevealReady(el));

    if (hasGsap && hasScrollTrigger && !reduceMotion) {
        const reveal = (items) => {
            items.forEach((el, index) => {
                el.dataset.revealReady = 'true';
                gsap.set(el, {
                    autoAlpha: 0,
                    y: 30,
                    scale: 0.985,
                    filter: 'blur(7px)'
                });
                const tween = gsap.to(el, {
                    autoAlpha: 1,
                    y: 0,
                    scale: 1,
                    filter: 'blur(0px)',
                    delay: Math.min(index * 0.045, 0.22),
                    clearProps: 'visibility,filter,transform,opacity',
                    scrollTrigger: {
                        trigger: el,
                        start: 'top 88%',
                        once: true,
                        onEnter: () => el.classList.add('visible')
                    }
                });
                revealRecords.set(el, {
                    tween,
                    scrollTrigger: tween.scrollTrigger
                });
            });
        };

        reveal(getItems());

        const observer = new MutationObserver((mutations) => {
            const relevantMutations = mutations.filter(mutation => !isIgnoredRevealMutation(mutation));
            const shouldCheck = relevantMutations.some(mutation => mutation.addedNodes.length > 0 || mutation.type === 'attributes');
            if (!shouldCheck) return;
            requestAnimationFrame(() => {
                const items = getItems();
                if (items.length) reveal(items);
                refreshMotion();
            });
        });
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['hidden', 'class']
        });
        return;
    }

    const items = getRevealCandidates().filter(isRevealReady);
    items.forEach((el, index) => {
        el.style.setProperty('--reveal-delay', `${Math.min(index * 70, 420)}ms`);
    });

    if (reduceMotion || !('IntersectionObserver' in window)) {
        items.forEach(el => el.classList.add('visible'));
        return;
    }

    const fadeObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                fadeObserver.unobserve(entry.target);
            }
        });
    }, {
        threshold: 0.12,
        rootMargin: '0px 0px -8% 0px'
    });

    items.forEach(el => fadeObserver.observe(el));

    const observer = new MutationObserver((mutations) => {
        if (!mutations.some(mutation => !isIgnoredRevealMutation(mutation))) return;
        getRevealCandidates()
            .filter(el => !el.classList.contains('visible') && isRevealReady(el))
            .forEach(el => fadeObserver.observe(el));
    });
    observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['hidden', 'class']
    });
}

function setupGsapStage() {
    if (!hasGsap || reduceMotion) {
        document.body.classList.add('motion-ready');
        return;
    }

    document.body.classList.add('motion-ready');

    const nav = document.querySelector('.navbar');
    const hero = document.querySelector('.home-hero');
    const heroCopy = document.querySelector('.hero-copy');
    const heroItems = document.querySelectorAll('.hero-kicker, .hero-copy h1, .hero-copy p, .hero-actions');

    const intro = gsap.timeline({
        defaults: {
            ease: 'power3.out'
        }
    });

    if (nav) {
        intro.from(nav, {
            autoAlpha: 0,
            y: -18,
            duration: 0.58
        }, 0);
    }

    if (hero) {
        intro.from(hero, {
            autoAlpha: 0,
            scale: 1.018,
            duration: 1.05
        }, 0.05);
    }

    if (heroItems.length) {
        intro.from(heroItems, {
            autoAlpha: 0,
            y: 28,
            duration: 0.8,
            stagger: 0.08
        }, hero ? 0.28 : 0.12);
    }

    if (hero && hasScrollTrigger) {
        const heroImages = hero.querySelectorAll('.hero-slide img');

        if (heroImages.length) {
            gsap.fromTo(heroImages, {
                yPercent: 0
            }, {
                yPercent: -4,
                ease: 'none',
                scrollTrigger: {
                    trigger: hero,
                    start: 'top top',
                    end: 'bottom top',
                    scrub: 0.7
                }
            });
        } else {
            gsap.to(hero, {
                backgroundPosition: 'center 58%',
                ease: 'none',
                scrollTrigger: {
                    trigger: hero,
                    start: 'top top',
                    end: 'bottom top',
                    scrub: 0.7
                }
            });
        }

        if (heroCopy) {
            gsap.set(heroCopy, {
                autoAlpha: 1,
                y: 0
            });
        }
    }

    const hoverTargets = document.querySelectorAll('.join-btn, .ghost-btn, .filter-tag, .viewer-nav, .modal-nav, .theme-toggle');
    hoverTargets.forEach(target => {
        target.addEventListener('pointerenter', () => {
            gsap.to(target, {
                y: -2,
                scale: 1.015,
                duration: 0.22,
                overwrite: 'auto'
            });
        });
        target.addEventListener('pointerleave', () => {
            gsap.to(target, {
                y: 0,
                scale: 1,
                duration: 0.28,
                overwrite: 'auto',
                clearProps: 'transform'
            });
        });
    });

    if (hasScrollTrigger) {
        gsap.utils.toArray('.project-card, .gallery-item, .thumb, .ranking-item, .profile-fact').forEach((el) => {
            gsap.set(el, {
                transformOrigin: '50% 65%'
            });
        });
    }
}

function getInlineCarouselElements(hero) {
    const viewport = hero.querySelector('.hero-carousel');
    const dotsWrap = hero.querySelector('.hero-carousel-dots');
    if (!viewport || !dotsWrap) return null;

    let track = viewport.querySelector('.hero-carousel-track');
    if (!track) {
        track = document.createElement('div');
        track.className = 'hero-carousel-track';
        track.append(...Array.from(viewport.querySelectorAll('.hero-slide')));
        viewport.replaceChildren(track);
    }

    const slides = Array.from(track.querySelectorAll('.hero-slide'))
        .filter(slide => slide.querySelector('img'));
    if (!slides.length) return null;

    const existingDots = Array.from(dotsWrap.querySelectorAll('.hero-carousel-dot'));
    if (existingDots.length !== slides.length) {
        dotsWrap.replaceChildren();
        slides.forEach((_, index) => {
            const dot = document.createElement('button');
            dot.type = 'button';
            dot.className = `hero-carousel-dot${index === 0 ? ' is-active' : ''}`;
            dot.setAttribute('aria-label', `显示第 ${index + 1} 张横幅`);
            if (index === 0) {
                dot.setAttribute('aria-current', 'true');
            }
            dotsWrap.appendChild(dot);
        });
    }

    slides.forEach((slide, index) => {
        slide.classList.toggle('is-active', index === 0);
    });

    return {
        track,
        slides,
        dots: Array.from(dotsWrap.querySelectorAll('.hero-carousel-dot'))
    };
}

function setupHeroCarousel() {
    const heroes = Array.from(document.querySelectorAll('[data-hero-carousel]'));

    heroes.forEach((hero) => {
        if (hero.dataset.carouselReady === 'true') return;

        const rendered = getInlineCarouselElements(hero);
        if (!rendered) return;

        const { track, slides, dots } = rendered;
        if (slides.length < 2) {
            hero.dataset.carouselReady = 'true';
            return;
        }

        const prevButton = hero.querySelector('[data-carousel-prev]');
        const nextButton = hero.querySelector('[data-carousel-next]');
        const interval = Math.max(Number(hero.dataset.carouselInterval) || 5200, 2800);
        let current = 0;
        let timer = null;
        let isAnimating = false;
        let touchStartX = 0;
        let touchStartY = 0;
        let touchTracking = false;

        hero.dataset.carouselReady = 'true';
        hero.classList.toggle('is-gsap-carousel', hasGsap && !reduceMotion);

        const syncActive = (nextIndex) => {
            slides.forEach((slide, index) => {
                slide.classList.toggle('is-active', index === nextIndex);
            });
            dots.forEach((dot, index) => {
                const isActive = index === nextIndex;
                dot.classList.toggle('is-active', isActive);
                if (isActive) {
                    dot.setAttribute('aria-current', 'true');
                } else {
                    dot.removeAttribute('aria-current');
                }
            });
        };

        const jumpTo = (nextIndex) => {
            current = (nextIndex + slides.length) % slides.length;
            syncActive(current);
            if (hasGsap) {
                gsap.set(track, {
                    xPercent: -100 * current
                });
            } else {
                track.style.transform = `translateX(${-100 * current}%)`;
            }
            isAnimating = false;
        };

        const showSlide = (nextIndex, immediate = false) => {
            const normalizedIndex = (nextIndex + slides.length) % slides.length;
            if (normalizedIndex === current || isAnimating) return;

            if (immediate || reduceMotion || !hasGsap) {
                jumpTo(normalizedIndex);
                return;
            }

            isAnimating = true;
            syncActive(normalizedIndex);
            gsap.killTweensOf(track);
            gsap.to(track, {
                xPercent: -100 * normalizedIndex,
                duration: 1.25,
                ease: 'power3.inOut',
                overwrite: 'auto',
                onComplete: () => {
                    current = normalizedIndex;
                    isAnimating = false;
                }
            });
        };

        const showNext = () => showSlide(current + 1);
        const showPrev = () => showSlide(current - 1);
        const stop = () => {
            if (!timer) return;
            window.clearInterval(timer);
            timer = null;
        };
        const start = () => {
            if (timer || reduceMotion) return;
            timer = window.setInterval(showNext, interval);
        };

        dots.forEach((dot, index) => {
            dot.addEventListener('click', () => {
                stop();
                showSlide(index);
                start();
            });
        });

        if (prevButton) {
            prevButton.addEventListener('click', () => {
                stop();
                showPrev();
                start();
            });
        }

        if (nextButton) {
            nextButton.addEventListener('click', () => {
                stop();
                showNext();
                start();
            });
        }

        hero.addEventListener('keydown', (event) => {
            if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
            event.preventDefault();
            stop();
            if (event.key === 'ArrowLeft') {
                showPrev();
            } else {
                showNext();
            }
            start();
        });

        hero.addEventListener('touchstart', (event) => {
            if (event.touches.length !== 1) return;
            touchTracking = true;
            touchStartX = event.touches[0].clientX;
            touchStartY = event.touches[0].clientY;
            stop();
        }, { passive: true });

        hero.addEventListener('touchend', (event) => {
            if (!touchTracking) return;
            touchTracking = false;

            const touch = event.changedTouches[0];
            if (!touch) {
                start();
                return;
            }

            const deltaX = touch.clientX - touchStartX;
            const deltaY = touch.clientY - touchStartY;
            if (Math.abs(deltaX) > 46 && Math.abs(deltaX) > Math.abs(deltaY) * 1.35) {
                if (deltaX > 0) {
                    showPrev();
                } else {
                    showNext();
                }
            }
            start();
        }, { passive: true });

        hero.addEventListener('touchcancel', () => {
            touchTracking = false;
            start();
        }, { passive: true });

        hero.addEventListener('pointerenter', stop);
        hero.addEventListener('pointerleave', start);
        hero.addEventListener('focusin', stop);
        hero.addEventListener('focusout', start);
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                stop();
            } else {
                start();
            }
        });

        jumpTo(0);
        start();
    });
}

function setupPointerGlow() {
    if (reduceMotion || !finePointerQuery.matches) return;

    const targets = document.querySelectorAll(
        '.card, .player-avatar-card, .project-card, .thumb, .profile-card, .ranking-item, .profile-fact, .uptime-block'
    );

    targets.forEach(target => {
        target.addEventListener('pointermove', (event) => {
            const rect = target.getBoundingClientRect();
            const x = ((event.clientX - rect.left) / rect.width) * 100;
            const y = ((event.clientY - rect.top) / rect.height) * 100;
            target.style.setProperty('--spot-x', `${x.toFixed(2)}%`);
            target.style.setProperty('--spot-y', `${y.toFixed(2)}%`);
        });
    });
}

function setupPremiumTilts() {
    if (reduceMotion || !hasGsap || !finePointerQuery.matches) return;

    const attach = (target) => {
        if (target.dataset.tiltReady === 'true') return;
        target.dataset.tiltReady = 'true';

        const rotateXTo = gsap.quickTo(target, 'rotationX', {
            duration: 0.34,
            ease: 'power3.out'
        });
        const rotateYTo = gsap.quickTo(target, 'rotationY', {
            duration: 0.34,
            ease: 'power3.out'
        });
        const yTo = gsap.quickTo(target, 'y', {
            duration: 0.34,
            ease: 'power3.out'
        });

        target.addEventListener('pointermove', (event) => {
            const rect = target.getBoundingClientRect();
            const x = (event.clientX - rect.left) / rect.width - 0.5;
            const y = (event.clientY - rect.top) / rect.height - 0.5;
            rotateXTo(y * -4);
            rotateYTo(x * 5);
            yTo(-4);
        });

        target.addEventListener('pointerleave', () => {
            gsap.to(target, {
                rotationX: 0,
                rotationY: 0,
                y: 0,
                duration: 0.42,
                ease: 'power3.out',
                overwrite: 'auto',
                clearProps: 'transform'
            });
        });
    };

    const attachAll = () => {
        document
            .querySelectorAll('.project-card, .thumb, .gallery-item, .profile-card, .ranking-item, .uptime-block')
            .forEach(attach);
    };

    attachAll();

    const observer = new MutationObserver((mutations) => {
        if (!mutations.some(mutation => mutation.addedNodes.length > 0)) return;
        requestAnimationFrame(attachAll);
    });
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
}

function setupPageTransitions() {
    document.querySelectorAll('a[href]').forEach(a => {
        a.addEventListener('click', (e) => {
            const url = a.getAttribute('href');
            if (
                !url
                || url.startsWith('#')
                || url.startsWith('javascript:')
                || url.startsWith('mailto:')
                || url.startsWith('tel:')
                || a.target === '_blank'
                || a.hasAttribute('download')
            ) {
                return;
            }
            e.preventDefault();
            document.body.classList.add('page-fade-out');
            setTimeout(() => window.location.href = url, reduceMotion ? 0 : 260);
        });
    });
}

async function initNekoinnMotion() {
    setupThemeToggle();
    setupHeroCarousel();
    setupGsapStage();
    setupScrollProgress();
    setupReveal();
    setupPointerGlow();
    setupPremiumTilts();
    setupPageTransitions();
}

initNekoinnMotion();

window.addEventListener('load', () => {
    refreshMotion();
});

window.NekoinnMotion = {
    cleanupRevealTargets,
    refresh: refreshMotion
};
