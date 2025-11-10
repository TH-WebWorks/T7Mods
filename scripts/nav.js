const MOBILE_BREAKPOINT = 960;

function closeNav(nav, toggle) {
  if (!nav.classList.contains('nav-open')) {
    return;
  }
  nav.classList.remove('nav-open');
  if (toggle) {
    toggle.setAttribute('aria-expanded', 'false');
  }
}

function setupNavigation(nav) {
  const toggle = nav.querySelector('.nav-toggle');
  const menu = nav.querySelector('.nav-menu');

  if (!toggle || !menu) {
    return;
  }

  toggle.addEventListener('click', (event) => {
    event.stopPropagation();
    const isOpen = nav.classList.toggle('nav-open');
    toggle.setAttribute('aria-expanded', String(isOpen));

    if (isOpen) {
      const focusable = menu.querySelector('a, button, [tabindex]');
      focusable?.focus();
    }
  });

  menu.addEventListener('click', (event) => {
    event.stopPropagation();
  });
}

function bindGlobalHandlers(navs) {
  document.addEventListener('click', (event) => {
    navs.forEach((nav) => {
      if (!nav.contains(event.target)) {
        const toggle = nav.querySelector('.nav-toggle');
        closeNav(nav, toggle);
      }
    });
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth > MOBILE_BREAKPOINT) {
      navs.forEach((nav) => {
        const toggle = nav.querySelector('.nav-toggle');
        closeNav(nav, toggle);
      });
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      navs.forEach((nav) => {
        const toggle = nav.querySelector('.nav-toggle');
        closeNav(nav, toggle);
      });
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const navs = Array.from(document.querySelectorAll('nav'));
  if (!navs.length) return;

  navs.forEach(setupNavigation);
  bindGlobalHandlers(navs);
});

