// Shared header/footer and mobile menu for every page.
(function () {
  // line icons shared with the game (same drawings as the sprite in jugar.html)
  const sprite = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  sprite.setAttribute('width', '0'); sprite.setAttribute('height', '0'); sprite.setAttribute('aria-hidden', 'true');
  sprite.style.position = 'absolute';
  sprite.innerHTML = '<symbol id="i-ballot" viewBox="0 0 24 24"><rect x="4" y="11" width="16" height="9" rx="1.5"/><path d="M8 11V4h8v7M9.8 7.2l1.6 1.6 2.9-2.9"/></symbol><symbol id="i-chart" viewBox="0 0 24 24"><path d="M4 4v16h16M8.5 16v-4M12.5 16V8M16.5 16v-6"/></symbol><symbol id="i-people" viewBox="0 0 24 24"><circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="9" r="2.5"/><path d="M15.5 14.2A5 5 0 0 1 21 19"/></symbol><symbol id="i-city" viewBox="0 0 24 24"><path d="M3 21V10l5-3v14M8 21V4h8v17M16 21v-9h5v9M2 21h20M11 8h2M11 12h2M11 16h2"/></symbol><symbol id="i-hand" viewBox="0 0 24 24"><path d="M8 13V6a1.5 1.5 0 0 1 3 0v5M11 10.5V4.5a1.5 1.5 0 0 1 3 0V11M14 10.5V6a1.5 1.5 0 0 1 3 0v8a7 7 0 0 1-7 7h-.5a6 6 0 0 1-4.6-2.2L3.5 17a1.6 1.6 0 0 1 2.4-2.1L8 17"/></symbol><symbol id="i-fast" viewBox="0 0 24 24"><path d="M3.5 6v12l8-6zM12 6v12l8-6z" fill="currentColor"/></symbol><symbol id="i-undo" viewBox="0 0 24 24"><path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></symbol><symbol id="i-bus" viewBox="0 0 24 24"><rect x="5" y="3" width="14" height="15" rx="2.5"/><path d="M5 11h14M8 18v3M16 18v3"/><circle cx="8.5" cy="14.5" r=".9"/><circle cx="15.5" cy="14.5" r=".9"/></symbol><symbol id="i-ferris" viewBox="0 0 24 24"><circle cx="12" cy="10" r="7"/><circle cx="12" cy="10" r="1.2"/><path d="M12 3v14M5 10h14M7 5l10 10M17 5L7 15M8.5 21l3.5-4 3.5 4"/></symbol><symbol id="i-columns" viewBox="0 0 24 24"><path d="M3 9l9-5 9 5zM5.5 9v9M9.8 9v9M14.2 9v9M18.5 9v9M3 20h18"/></symbol><symbol id="i-heart" viewBox="0 0 24 24"><path d="M12 20s-7.5-4.6-7.5-10.2A4.2 4.2 0 0 1 12 7.2a4.2 4.2 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20z"/></symbol><symbol id="i-bolt" viewBox="0 0 24 24"><path d="M13 3L5 13.5h6L10 21l8-10.5h-6z"/></symbol><symbol id="i-drop" viewBox="0 0 24 24"><path d="M12 3s6 6.4 6 11a6 6 0 0 1-12 0c0-4.6 6-11 6-11z"/></symbol><symbol id="i-road" viewBox="0 0 24 24"><path d="M8 3L4 21M16 3l4 18M12 4v3M12 10.5v3M12 17v3"/></symbol><symbol id="i-zones" viewBox="0 0 24 24"><rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/></symbol><symbol id="i-mouse" viewBox="0 0 24 24"><rect x="6" y="3" width="12" height="18" rx="6"/><path d="M12 7v4"/></symbol><symbol id="i-keyboard" viewBox="0 0 24 24"><rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/></symbol><symbol id="i-phone" viewBox="0 0 24 24"><rect x="7" y="2.5" width="10" height="19" rx="2"/><path d="M11 18h2"/></symbol><symbol id="i-house" viewBox="0 0 24 24"><path d="M3 11l9-7 9 7M5 9.5V20h14V9.5M10 20v-5h4v5"/></symbol><symbol id="i-flame" viewBox="0 0 24 24"><path d="M12 3c1 4 5 5.5 5 10a5 5 0 0 1-10 0c0-2.6 1.5-4 2.5-5 .3 2 1.5 3 2.5 3 0-3-1-5 0-8z"/></symbol><symbol id="i-firetruck" viewBox="0 0 24 24"><path d="M2.5 16V9h9.5v7M12 11h5l3.5 3.5V16"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/><path d="M4 6.5l8-2"/></symbol><symbol id="i-coins" viewBox="0 0 24 24"><ellipse cx="12" cy="6.5" rx="7" ry="3"/><path d="M5 6.5v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5M5 11.5v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5"/></symbol><symbol id="i-layers" viewBox="0 0 24 24"><path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/><path d="M3 17.5l9 5 9-5" opacity=".6"/></symbol><symbol id="i-stats" viewBox="0 0 24 24"><path d="M3 3v18h18"/><path d="M6 15l4-5 4 3 6-7"/></symbol><symbol id="i-camera" viewBox="0 0 24 24"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></symbol><symbol id="i-sound" viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11"/></symbol><symbol id="i-star" viewBox="0 0 24 24"><path d="M12 3l2.7 5.8 6.3.7-4.7 4.3 1.3 6.2L12 17l-5.6 3 1.3-6.2L3 9.5l6.3-.7z"/></symbol><symbol id="i-avenue" viewBox="0 0 24 24"><path d="M6 3L3 21M18 3l3 18M12 3v18M9 7v2M9 13v2M15 7v2M15 13v2"/></symbol><symbol id="i-info" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.3"/></symbol><symbol id="i-sparkle" viewBox="0 0 24 24"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/></symbol><symbol id="i-gauge" viewBox="0 0 24 24"><path d="M4 17a8 8 0 1 1 16 0"/><path d="M12 17l4-5"/></symbol><symbol id="i-save" viewBox="0 0 24 24"><path d="M5 4h11l3 3v13H5zM8 4v5h7V4M8 20v-6h8v6"/></symbol><symbol id="i-trend" viewBox="0 0 24 24"><path d="M3 7l6 6 4-4 8 8M21 11v6h-6"/></symbol><symbol id="i-paw" viewBox="0 0 24 24"><circle cx="7" cy="9" r="1.8"/><circle cx="12" cy="6.3" r="1.8"/><circle cx="17" cy="9" r="1.8"/><path d="M12 12c-3 0-5.5 3.2-5.5 5.3 0 1.8 1.7 2.7 3.5 2.2 1.2-.3 2.8-.3 4 0 1.8.5 3.5-.4 3.5-2.2C17.5 15.2 15 12 12 12z"/></symbol><symbol id="i-factory" viewBox="0 0 24 24"><path d="M3 20V11l5 3v-3l5 3v-3l5 3V4h3v16zM2 20h20"/></symbol><symbol id="i-wind" viewBox="0 0 24 24"><path d="M12 11v10M9.5 21h5"/><circle cx="12" cy="9" r="1.6"/><path d="M12 7.4V2.5M13.4 9.8l4.3 2.5M10.6 9.8l-4.3 2.5"/></symbol><symbol id="i-solar" viewBox="0 0 24 24"><path d="M4.5 17l2-9h11l2 9zM5.5 12.5h13M10.3 8l-.8 9M13.7 8l.8 9M12 17v3.5M9 20.5h6"/></symbol><symbol id="i-moon" viewBox="0 0 24 24"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/></symbol>';
  document.body.prepend(sprite);
  const page = document.body.dataset.page;
  const links = [
    ["index.html", "Inicio", "home"],
    ["como-jugar.html", "Cómo jugar", "how"],
    ["catalogo.html", "Catálogo", "catalog"],
    ["estilos.html", "Estilos", "styles"],
  ];
  const logo = `<svg class="logo-mark" viewBox="0 0 32 32" aria-hidden="true">
    <rect x="3" y="14" width="8" height="15" rx="1.5" fill="#fbf7ee" stroke="#2b2622" stroke-width="1.6"/>
    <path d="M2 15 7 9l5 6z" fill="#e4553b" stroke="#2b2622" stroke-width="1.6" stroke-linejoin="round"/>
    <rect x="13" y="6" width="8" height="23" rx="1.5" fill="#86c96a" stroke="#2b2622" stroke-width="1.6"/>
    <rect x="23" y="12" width="7" height="17" rx="1.5" fill="#6aaeea" stroke="#2b2622" stroke-width="1.6"/></svg>`;

  const header = document.createElement("header");
  header.className = "site-header";
  header.innerHTML = `<nav class="wrap nav" aria-label="Principal">
    <a class="logo" href="index.html">${logo}Urbania</a>
    <button class="menu-btn" aria-label="Abrir menú" aria-expanded="false">☰</button>
    <ul class="nav-links">${links
      .map(([href, label, id]) => `<li><a href="${href}"${id === page ? ' aria-current="page"' : ""}>${label}</a></li>`)
      .join("")}</ul>
    <a class="btn btn-primary btn-sm" href="jugar.html">▶ Jugar gratis</a>
  </nav>`;
  document.body.prepend(header);

  const btn = header.querySelector(".menu-btn");
  const list = header.querySelector(".nav-links");
  btn.addEventListener("click", () => {
    const open = list.classList.toggle("open");
    btn.setAttribute("aria-expanded", String(open));
  });

  const footer = document.createElement("footer");
  footer.innerHTML = `<div class="wrap foot">
    <a class="logo" href="index.html">${logo}Urbania</a>
    <ul>${links.map(([href, label]) => `<li><a href="${href}">${label}</a></li>`).join("")}
      <li><a href="jugar.html">Jugar</a></li></ul>
    <span>© ${new Date().getFullYear()} Urbania · Gratis, sin descargas.</span>
  </div>`;
  document.body.append(footer);

  // cards and screenshots rise into place as they scroll into view
  if (!matchMedia("(prefers-reduced-motion: reduce)").matches && "IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
    }, { rootMargin: "0px 0px -8% 0px" });
    document.querySelectorAll("main .card, main .shot, main .stat, main .ranks li, main details").forEach((el, k) => {
      el.classList.add("reveal");
      el.style.transitionDelay = `${(k % 3) * 70}ms`;
      io.observe(el);
    });
  }
})();
