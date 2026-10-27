// Shared header/footer and mobile menu for every page.
(function () {
  const page = document.body.dataset.page;
  const links = [
    ["index.html", "Inicio", "home"],
    ["como-jugar.html", "Cómo jugar", "how"],
    ["catalogo.html", "Catálogo", "catalog"],
    ["estilos.html", "Estilos", "styles"],
  ];
  const logo = `<svg class="logo-mark" viewBox="0 0 32 32" aria-hidden="true">
    <rect x="3" y="14" width="7" height="15" rx="1" fill="#6ea8ff"/>
    <rect x="12" y="5" width="8" height="24" rx="1" fill="#5ee6b0"/>
    <rect x="22" y="10" width="7" height="19" rx="1" fill="#ffb86b"/></svg>`;

  const header = document.createElement("header");
  header.className = "site-header";
  header.innerHTML = `<nav class="wrap nav" aria-label="Principal">
    <a class="logo" href="index.html">${logo}Urbania</a>
    <button class="menu-btn" aria-label="Abrir menú" aria-expanded="false">☰</button>
    <ul class="nav-links">${links
      .map(([href, label, id]) => `<li><a href="${href}"${id === page ? ' aria-current="page"' : ""}>${label}</a></li>`)
      .join("")}</ul>
    <span class="lang" title="Idioma">ES</span>
    <a class="btn btn-primary btn-sm" href="jugar.html">Jugar gratis</a>
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
    <span>© ${new Date().getFullYear()} Urbania. Gratis para siempre.</span>
  </div>`;
  document.body.append(footer);
})();
