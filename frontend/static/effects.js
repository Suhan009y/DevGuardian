/**
 * effects.js — shared visual behavior for DevGuardian's frontend.
 *
 * The Lenis init and confetti-burst techniques are adapted directly from
 * the reference project's app.js (same defensive try/catch guard around
 * Lenis, same confetti-piece generation pattern with randomized CSS
 * custom properties for drift/rotation/timing).
 */

// ---------- Lenis smooth scroll ----------
function initLenis() {
  if (typeof window.Lenis !== "function") return;
  try {
    window.__lenis = new window.Lenis({
      autoRaf: true,
      anchors: true,
      smoothWheel: true,
      lerp: 0.09,
    });
  } catch (error) {
    console.info("Lenis was skipped; native scrolling remains active.", error);
  }
}

// ---------- Scroll-reveal ----------
function initScrollReveal() {
  const els = document.querySelectorAll("[data-reveal]");
  if (!els.length) return;

  els.forEach((el, i) => {
    el.style.transitionDelay = `${Math.min(i * 50, 350)}ms`;
  });

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("in-view");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12 }
  );

  els.forEach((el) => observer.observe(el));
}

// Call after dynamically inserting new [data-reveal] elements.
function revealNow(container) {
  const scope = container || document;
  scope.querySelectorAll("[data-reveal]:not(.in-view)").forEach((el) => {
    requestAnimationFrame(() => el.classList.add("in-view"));
  });
}

// ---------- Animated counters ----------
function initCounters() {
  const els = document.querySelectorAll("[data-counter]");
  if (!els.length) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        animateCounter(entry.target);
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.4 }
  );
  els.forEach((el) => observer.observe(el));
}

function animateCounter(el) {
  const target = parseFloat(el.dataset.counter);
  if (Number.isNaN(target)) return;
  const duration = 800;
  const start = performance.now();

  function tick(now) {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.round(target * eased);
    if (progress < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function animateCountersNow(container) {
  const scope = container || document;
  scope.querySelectorAll("[data-counter]").forEach(animateCounter);
}

// ---------- Confetti burst ----------
// Adapted from the reference project's finishGame() confetti generation:
// a burst of colored rectangles falling with randomized drift/rotation.
const CONFETTI_COLOURS = ["#14b8a6", "#fbbf24", "#34d399", "#38bdf8", "#a78bfa", "#fb923c", "#22d3ee"];

function fireConfetti(count = 50) {
  let container = document.getElementById("confetti-layer");
  if (!container) {
    container = document.createElement("div");
    container.id = "confetti-layer";
    container.className = "confetti";
    container.setAttribute("aria-hidden", "true");
    document.body.appendChild(container);
  }
  container.innerHTML = "";

  for (let i = 0; i < count; i++) {
    const piece = document.createElement("i");
    piece.className = "confetti-piece";
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.setProperty("--confetti-colour", CONFETTI_COLOURS[i % CONFETTI_COLOURS.length]);
    piece.style.setProperty("--duration", `${2.6 + Math.random() * 2}s`);
    piece.style.setProperty("--delay", `${Math.random() * 0.6}s`);
    piece.style.setProperty("--drift", `${-160 + Math.random() * 320}px`);
    piece.style.setProperty("--start-rotation", `${Math.random() * 180}deg`);
    piece.style.setProperty("--end-rotation", `${520 + Math.random() * 680}deg`);
    container.appendChild(piece);
  }

  // Clean up after the animation finishes so it doesn't linger in the DOM.
  setTimeout(() => { container.innerHTML = ""; }, 5200);
}

// ---------- Theme toggle (light / dark) ----------
function initThemeToggle() {
  const btn = document.getElementById("theme-toggle");
  if (!btn) return;

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("dg-theme", theme);
    const metaLight = document.querySelector('meta[name="theme-color"][media*="light"]');
    const metaDark = document.querySelector('meta[name="theme-color"][media*="dark"]');
    if (metaLight) metaLight.content = theme === "light" ? "#e8eef5" : "#0b1220";
    if (metaDark) metaDark.content = theme === "dark" ? "#0b1220" : "#e8eef5";
  }

  btn.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme") || "light";
    applyTheme(current === "dark" ? "light" : "dark");
  });
}

document.addEventListener("DOMContentLoaded", () => {
  initLenis();
  initScrollReveal();
  initCounters();
  initThemeToggle();
});
