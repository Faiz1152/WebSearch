/* WebSearch shared theme handling
   Exposes window.WebSearchTheme = { get, set, apply }
   Values: 'system' | 'light' | 'dark' (default: 'system')
   Applies theme class to <html> (and <body> once available) so the
   existing CSS (which targets body.dark-mode / body.light-mode, plus
   an html mirror added for flash-free early application) picks it up.
*/
(function () {
  var STORAGE_KEY = 'websearch-theme';

  function get() {
    var v = null;
    try { v = localStorage.getItem(STORAGE_KEY); } catch (e) {}
    return v === 'light' || v === 'dark' ? v : 'system';
  }

  function apply(value) {
    var theme = value || get();
    var root = document.documentElement;
    var body = document.body;

    root.classList.remove('dark-mode', 'light-mode');
    if (body) body.classList.remove('dark-mode', 'light-mode');

    if (theme === 'dark') {
      root.classList.add('dark-mode');
      if (body) body.classList.add('dark-mode');
    } else if (theme === 'light') {
      root.classList.add('light-mode');
      if (body) body.classList.add('light-mode');
    }
    // 'system' -> no class; CSS prefers-color-scheme media query handles it,
    // and updates live automatically as the OS preference changes.

    var meta = document.querySelector('meta[name="color-scheme"]');
    if (meta) meta.setAttribute('content', theme === 'system' ? 'light dark' : theme);
  }

  function set(value) {
    var theme = value === 'light' || value === 'dark' ? value : 'system';
    try { localStorage.setItem(STORAGE_KEY, theme); } catch (e) {}
    apply(theme);
    return theme;
  }

  // Apply immediately (covers the case this file loads after <body> exists).
  apply(get());

  window.WebSearchTheme = { get: get, set: set, apply: function () { apply(get()); } };
})();
