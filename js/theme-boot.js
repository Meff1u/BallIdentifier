// Runs in <head> before first paint so the saved theme never flashes.
(function () {
    try {
        var theme = JSON.parse(localStorage.getItem("theme"));
        if (theme === "light" || theme === "dark" || theme === "synthwave" || theme === "sakura" || theme === "ruby") {
            document.documentElement.setAttribute("data-theme", theme);
        }
        if (JSON.parse(localStorage.getItem("sidebarCollapsed")) === true) {
            document.documentElement.setAttribute("data-sidebar", "collapsed");
        }
    } catch (e) {
        /* no storage */
    }
})();
