// Runs in <head> before first paint so the saved theme never flashes.
(function () {
    try {
        var theme = JSON.parse(localStorage.getItem("theme"));
        if (theme === "light" || theme === "dark" || theme === "synthwave" || theme === "sakura") {
            document.documentElement.setAttribute("data-theme", theme);
        }
    } catch (e) {
        /* no storage */
    }
})();
