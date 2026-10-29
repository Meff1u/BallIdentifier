/**
 * Catch Trainer — a Discord-like practice channel. Balls spawn at random intervals,
 * simulated players chat and race you, and you get stats when you stop.
 */

import { h, icon, img, initials, storage, store, spinner } from "../core/dom.js";
import { openDialog, toast } from "../core/ui.js";
import { getDexList, getDex, getTrainerData, dexIcon, compressedArtUrl } from "../core/data.js";

const CONFIG_KEY = "trainerConfig";
const DEFAULT_CONFIG = { spawnFreqMin: 5, spawnFreqMax: 20, chatFreq: "medium", userCatching: "off", bot: "ballsdex" };
const ME = "amazing sniper";
const CHAT_RANGES = { low: [8000, 14000], medium: [5000, 10000], high: [3000, 5000] };
const CATCH_RANGES = { easy: [5000, 10000], medium: [3000, 5000], hard: [2000, 3000] };

const rn = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = (list) => list[rn(0, list.length - 1)];
const clock = () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

function shuffle(list) {
    const copy = [...list];
    for (let i = copy.length - 1; i > 0; i--) {
        const j = rn(0, i);
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}

function hueFor(name) {
    let hash = 0;
    for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
    return hash % 360;
}

export function createView() {
    const config = { ...DEFAULT_CONFIG, ...(storage(CONFIG_KEY) || {}) };
    let dexes = [];
    let incomplete = [];
    let channel = "spawn";

    // Simulation state
    let running = false;
    let starting = false;
    let startTime = 0;
    let spawns = []; // { ball, spawnTime, el, caught, catchTime, caughtBy }
    let ballsList = [];
    let chatData = null;
    let spawnTimer = null;
    let chatTimer = null;
    let catchTimers = []; // { id, endTime }
    let catchDelay = null;

    const save = () => store(CONFIG_KEY, config);
    const dexName = () => dexes.find((d) => d.toLowerCase() === config.bot.toLowerCase()) || "Ballsdex";
    const lastSpawn = () => spawns[spawns.length - 1];

    /* ----- Layout ----- */

    const spawnBtn = h("button.t-channel", { type: "button", "aria-current": "true" }, icon("hash", "icon-sm"), "spawn-channel");
    const configBtn = h("button.t-channel", { type: "button" }, icon("hash", "icon-sm"), "configuration");
    const sidebar = h(
        "aside.t-sidebar",
        { "aria-label": "Channels" },
        h("div.t-server", h("img", { src: "assets/brand/logo-mark.svg", alt: "" }), h("span", "Catch Trainer")),
        h("nav.t-channels", h("div.t-label", "Text channels"), spawnBtn, configBtn),
        h("div.t-user", h("span.t-avatar", { style: { background: `hsl(${hueFor(ME)} 55% 45%)` } }, initials(ME)), h("span", ME)),
    );
    const scrim = h("div.t-scrim", { onclick: () => toggleSidebar(false) });

    const headTitle = h("h2", icon("hash", "icon-sm"), h("span", "spawn-channel"));
    const headText = h("p", "Spawns and chat, simulated");
    const menuBtn = h("button.icon-btn.t-menu", { type: "button", "aria-label": "Channels", onclick: () => toggleSidebar() }, icon("menu"));

    const messages = h("div.t-messages", { role: "log", "aria-live": "polite", "aria-label": "spawn-channel messages" });
    const configPanel = h("div.t-config", { hidden: true });

    const startBtn = h("button.btn.btn-primary.btn-sm", { type: "button" }, icon("play", "icon-sm"), h("span", "Start simulation"));
    const inputText = h("span", "Ready when you are");
    const inputArea = h("div.t-input", h("div.t-input-box", inputText, startBtn));

    const trainer = h(
        "div.trainer",
        sidebar,
        scrim,
        h("div.t-main", h("header.t-head", menuBtn, headTitle, headText), messages, configPanel, inputArea),
    );
    const el = h("section.view", { dataset: { view: "trainer" }, "aria-labelledby": "trainer-title" }, h("h1.sr-only", { id: "trainer-title" }, "Catch Trainer"), trainer);

    function toggleSidebar(force) {
        trainer.classList.toggle("sidebar-open", force);
    }

    spawnBtn.addEventListener("click", () => switchChannel("spawn"));
    configBtn.addEventListener("click", () => {
        if (running || starting) return toast("Stop the simulation to change settings.", "info");
        switchChannel("config");
    });

    function switchChannel(name) {
        channel = name;
        spawnBtn.setAttribute("aria-current", String(name === "spawn"));
        configBtn.setAttribute("aria-current", String(name === "config"));
        headTitle.lastChild.textContent = name === "spawn" ? "spawn-channel" : "configuration";
        headText.textContent = name === "spawn" ? "Spawns and chat, simulated" : "Trainer settings";
        messages.hidden = name !== "spawn";
        configPanel.hidden = name !== "config";
        inputArea.querySelector(".t-input-box").replaceChildren(
            ...(name === "spawn" ? [inputText, startBtn] : [h("span", "Settings save automatically in this browser")]),
        );
        toggleSidebar(false);
    }

    function setLocked(locked) {
        configBtn.disabled = locked;
        configBtn.title = locked ? "Locked while the simulation runs" : "";
    }

    /* ----- Messages ----- */

    function emptyState() {
        messages.replaceChildren(
            h(
                "div.t-empty",
                h("div.empty-icon", icon("gamepad-2", "icon-lg")),
                h("strong", "Practice catching"),
                h("p", "Start the simulation. Balls spawn like on a real server: press Catch me, type the name and beat the other players."),
            ),
        );
    }

    function scrollDown() {
        requestAnimationFrame(() => (messages.scrollTop = messages.scrollHeight));
    }

    function avatarFor(author, isBot) {
        if (isBot) return img(dexIcon(dexName()), "", "t-avatar");
        return h("span.t-avatar", { "aria-hidden": "true", style: { background: `hsl(${hueFor(author)} 55% 45%)` } }, initials(author));
    }

    function post({ author, isBot = false, content, replyTo = null }) {
        messages.querySelector(".t-empty")?.remove();
        const reply = replyTo
            ? h(
                  "button.t-reply",
                  { type: "button", onclick: () => replyTo.scrollIntoView({ behavior: "smooth", block: "center" }) },
                  icon("chevron-right", "icon-sm"),
                  h("span.t-reply-text", "Replying to ", h("b", "A wild countryball appeared!")),
              )
            : null;
        const message = h(
            "div.t-msg",
            reply,
            avatarFor(author, isBot),
            h("div", { style: { "min-width": "0" } }, h("div.t-msg-head", h(`span.t-author${isBot ? ".is-bot" : ""}`, author), h("span.t-time", clock())), h("div.t-text", content)),
        );
        messages.append(message);
        scrollDown();
        return message;
    }

    const mention = (name) => h("span.t-mention", `@${name}`);

    /* ----- Spawning ----- */

    function spawnBall() {
        const ball = pick(ballsList);
        if (!ball) return;
        const image = h("img.t-spawn-img", { src: compressedArtUrl(dexName(), ball), alt: "A wild countryball" });
        image.addEventListener("load", scrollDown, { once: true });
        const button = h("button.btn.btn-primary.btn-sm.t-catch-btn", { type: "button" }, "Catch me");
        const spawn = { ball, spawnTime: Date.now(), el: null, caught: false, catchTime: null, caughtBy: null, button };
        spawn.el = post({ author: dexName(), isBot: true, content: [h("div", "A wild countryball appeared!"), image, button] });
        button.addEventListener("click", () => onCatchClick(spawn));
        spawns.push(spawn);
        scheduleSimulatedCatches(spawn);
    }

    function scheduleNextSpawn() {
        if (!running) return;
        clearTimeout(spawnTimer);
        const min = config.spawnFreqMin || 5;
        const max = config.spawnFreqMax || 20;
        spawnTimer = setTimeout(() => running && spawnBall(), rn(min, max) * 1000);
    }

    function isValidCatch(guess, ball) {
        const normalized = guess.toLowerCase().trim();
        if (normalized === ball.toLowerCase()) return true;
        const abbreviations = chatData?.abbreviations?.[config.bot.toLowerCase()]?.[ball] || [];
        return abbreviations.some((abbr) => normalized === String(abbr).toLowerCase());
    }

    function markCaught(spawn) {
        spawn.button.disabled = true;
        spawn.button.textContent = "Catch me";
    }

    /* ----- Simulated players ----- */

    function scheduleSimulatedCatches(spawn) {
        catchTimers.forEach((t) => clearTimeout(t.id));
        catchTimers = [];
        if (!chatData?.usernames?.length || config.userCatching === "off") return;

        const [min, max] = CATCH_RANGES[config.userCatching] || CATCH_RANGES.easy;
        for (const username of shuffle(chatData.usernames).slice(0, rn(1, 5))) {
            const delay = rn(min, max) + rn(500, 800) + spawn.ball.length * rn(90, 130);
            const id = setTimeout(() => simulatedCatch(spawn, username, delay), delay);
            catchTimers.push({ id, endTime: Date.now() + delay });
        }
    }

    function simulatedCatch(spawn, username, delay) {
        if (!running) return;
        if (spawn.caught) {
            post({ author: dexName(), isBot: true, replyTo: spawn.el, content: [mention(username), " I was caught already!"] });
            return;
        }
        spawn.caught = true;
        spawn.catchTime = Date.now();
        spawn.caughtBy = "simulated";
        post({ author: dexName(), isBot: true, replyTo: spawn.el, content: [mention(username), " You caught ", h("strong", spawn.ball), `! (${(delay / 1000).toFixed(2)}s)`] });
        markCaught(spawn);
        scheduleNextSpawn();
    }

    function scheduleChat() {
        if (!running || !chatData) return;
        const [min, max] = CHAT_RANGES[config.chatFreq] || CHAT_RANGES.medium;
        chatTimer = setTimeout(() => {
            if (!running) return;
            post({ author: pick(chatData.usernames || ["User"]), content: pick(chatData.messages || ["Hey there!"]) });
            scheduleChat();
        }, rn(min, max));
    }

    /* ----- Catching ----- */

    const isPhone = () => window.matchMedia("(max-width: 767px)").matches;
    let keyboardKeeper = null;

    function onCatchClick(spawn) {
        const { button } = spawn;
        // iOS only opens the keyboard for focus() inside a tap; hold it open with a hidden input
        // until the modal's text box takes over after the "loading" delay.
        if (isPhone() && !keyboardKeeper) {
            keyboardKeeper = h("input.keyboard-keeper", { type: "text", "aria-hidden": "true", tabindex: "-1" });
            document.body.append(keyboardKeeper);
            keyboardKeeper.focus({ preventScroll: true });
        }
        clearTimeout(catchDelay);
        button.disabled = true;
        button.replaceChildren(spinner());
        catchDelay = setTimeout(() => {
            button.disabled = spawn.caught;
            button.textContent = "Catch me";
            openCatchDialog(spawn);
        }, rn(500, 1300));
    }

    function openCatchDialog(spawn) {
        const input = h("input.input", { type: "text", placeholder: "Your guess", autocomplete: "off", autocapitalize: "words", spellcheck: false, "aria-label": "Name of this countryball" });
        const submit = h("button.btn.btn-primary", { type: "submit" }, "Submit");
        const form = h(
            "form.field",
            { id: "catch-form" },
            h("label.label", { htmlFor: "catch-guess" }, "Name of this countryball"),
            input,
        );
        input.id = "catch-guess";
        // Like Discord: on desktop the modal opens without focusing the text box (Tab twice to reach it);
        // on phones it slides up from the bottom with the keyboard already open.
        const phone = isPhone();
        const dialog = openDialog({
            title: "Catch this countryball!",
            body: form,
            drawer: phone,
            className: "catch-dialog",
            initialFocus: phone ? input : "dialog",
            footer: [h("button.btn.btn-ghost", { type: "button", onclick: () => dialog.close() }, "Cancel"), submit],
        });
        keyboardKeeper?.remove();
        keyboardKeeper = null;
        submit.setAttribute("form", "catch-form");
        form.addEventListener("submit", (event) => {
            event.preventDefault();
            handleGuess(spawn, input.value);
            dialog.close();
        });
    }

    function handleGuess(spawn, guess) {
        if (!running) return;
        const now = Date.now();
        const correct = isValidCatch(guess, spawn.ball);

        if (spawn.caught) {
            post({ author: dexName(), isBot: true, replyTo: spawn.el, content: [mention(ME), " I was caught already!"] });
            return;
        }
        if (!correct) {
            post({ author: dexName(), isBot: true, replyTo: spawn.el, content: [mention(ME), " Wrong name!"] });
            return;
        }

        spawn.caught = true;
        spawn.catchTime = now;
        spawn.caughtBy = "real";
        // Players who were about to submit (under 2 s) still get "caught already"
        catchTimers.forEach((t) => {
            if (t.endTime - now > 2000) clearTimeout(t.id);
        });
        catchTimers = [];
        post({ author: dexName(), isBot: true, replyTo: spawn.el, content: [mention(ME), " You caught ", h("strong", spawn.ball), `! (${((now - spawn.spawnTime) / 1000).toFixed(2)}s)`] });
        markCaught(spawn);
        scheduleNextSpawn();
    }

    /* ----- Start / stop ----- */

    function setStartButton(state) {
        const states = {
            idle: [icon("play", "icon-sm"), h("span", "Start simulation")],
            loading: [spinner(), h("span", "Loading arts…")],
            running: [icon("square", "icon-sm"), h("span", "Stop")],
        };
        startBtn.replaceChildren(...states[state]);
        startBtn.disabled = state === "loading";
        startBtn.classList.toggle("btn-primary", state !== "running");
        startBtn.classList.toggle("btn-danger", state === "running");
        inputText.textContent = state === "running" ? `Simulating ${dexName()} spawns` : state === "loading" ? "Getting the arts ready" : "Ready when you are";
    }

    async function start() {
        starting = true;
        setLocked(true);
        setStartButton("loading");
        try {
            ballsList = Object.keys(await getDex(dexName()));
            chatData = await getTrainerData().catch(() => null);
            // Preload arts so spawns appear instantly
            await Promise.all(
                ballsList.map(
                    (ball) =>
                        new Promise((resolve) => {
                            const image = new Image();
                            image.onload = image.onerror = resolve;
                            image.src = compressedArtUrl(dexName(), ball);
                        }),
                ),
            );
        } catch {
            starting = false;
            setLocked(false);
            setStartButton("idle");
            return toast("Couldn't load the balls. Check your connection and try again.", "error");
        }
        starting = false;
        running = true;
        startTime = Date.now();
        spawns = [];
        messages.replaceChildren();
        setStartButton("running");
        scheduleChat();
        spawnBall();
    }

    function stop() {
        running = false;
        clearTimeout(spawnTimer);
        clearTimeout(chatTimer);
        clearTimeout(catchDelay);
        catchTimers.forEach((t) => clearTimeout(t.id));
        catchTimers = [];
        setLocked(false);
        setStartButton("idle");

        const mine = spawns.filter((s) => s.caughtBy === "real");
        const times = mine.map((s) => ({ ball: s.ball, ms: s.catchTime - s.spawnTime }));
        const fastest = times.reduce((best, t) => (!best || t.ms < best.ms ? t : best), null);
        const average = times.length ? times.reduce((sum, t) => sum + t.ms, 0) / times.length : 0;
        const seconds = Math.floor((Date.now() - startTime) / 1000);
        const duration = seconds >= 60 ? `${Math.floor(seconds / 60)}m ${seconds % 60}s` : `${seconds}s`;

        emptyState();
        const dialog = openDialog({
            title: "Simulation results",
            body: h(
                "dl.stat-list",
                h("div", h("dt", "Catches"), h("dd", `${mine.length} / ${spawns.length}`)),
                h("div", h("dt", "Duration"), h("dd", duration)),
                h("div", h("dt", "Average time"), h("dd", times.length ? `${(average / 1000).toFixed(2)}s` : "—")),
                h("div", h("dt", "Fastest"), h("dd", fastest ? `${(fastest.ms / 1000).toFixed(2)}s` : "—")),
                fastest ? h("div.wide", h("dt", "Fastest catch"), h("dd", fastest.ball)) : null,
            ),
            footer: [h("button.btn.btn-primary", { type: "button", onclick: () => dialog.close() }, "Close")],
        });
    }

    startBtn.addEventListener("click", () => {
        if (starting) return;
        if (running) stop();
        else start();
    });

    /* ----- Configuration panel ----- */

    function buildConfig() {
        const minInput = h("input.input", { type: "number", min: "5", max: "60", inputMode: "numeric", value: String(config.spawnFreqMin), id: "t-min" });
        const maxInput = h("input.input", { type: "number", min: "5", max: "60", inputMode: "numeric", value: String(config.spawnFreqMax), id: "t-max" });
        const freqError = h("p.form-error", { role: "alert", hidden: true });

        const validate = () => {
            const min = parseInt(minInput.value, 10);
            const max = parseInt(maxInput.value, 10);
            let error = "";
            if (!Number.isFinite(min) || min < 5) error = "Minimum must be at least 5 seconds.";
            else if (!Number.isFinite(max) || max > 60) error = "Maximum can't be more than 60 seconds.";
            else if (max < min) error = "Maximum must be at least the minimum.";
            freqError.textContent = error;
            freqError.hidden = !error;
            minInput.setAttribute("aria-invalid", String(Boolean(error) && (min < 5 || max < min)));
            maxInput.setAttribute("aria-invalid", String(Boolean(error) && (max > 60 || max < min)));
            if (!error) {
                config.spawnFreqMin = min;
                config.spawnFreqMax = max;
                save();
            }
        };
        minInput.addEventListener("change", validate);
        maxInput.addEventListener("change", validate);

        const radios = (name, options, key) =>
            h(
                "div.option-grid",
                { role: "radiogroup" },
                options.map(([value, title, hint]) => {
                    const input = h("input", { type: "radio", name, value, checked: config[key] === value });
                    input.addEventListener("change", () => {
                        config[key] = value;
                        save();
                    });
                    return h("label.option", input, h("strong", title), h("small", hint));
                }),
            );

        const botSelect = h("select.select", { id: "t-bot" }, dexes.map((d) => h("option", { value: d.toLowerCase(), selected: d.toLowerCase() === config.bot.toLowerCase() }, d)));
        const warning = h(
            "p.callout.callout-warning",
            icon("triangle-alert", "icon-sm"),
            h("span", "Not every catch abbreviation is in this dex yet. Know a missing one? Message ", h("b", "@meffiu"), " on Discord."),
        );
        const updateWarning = () => (warning.hidden = !incomplete.some((d) => d.toLowerCase() === config.bot.toLowerCase()));
        botSelect.addEventListener("change", () => {
            config.bot = botSelect.value;
            save();
            updateWarning();
        });
        updateWarning();

        configPanel.replaceChildren(
            h(
                "section",
                h("h3", icon("timer", "icon-sm"), "Spawn frequency"),
                h("p.subtle", "Seconds between spawns, picked at random in this range."),
                h("div.grid-2", h("div.field", h("label.label", { htmlFor: "t-min" }, "Min (5–60 s)"), minInput), h("div.field", h("label.label", { htmlFor: "t-max" }, "Max (5–60 s)"), maxInput)),
                freqError,
            ),
            h(
                "section",
                h("h3", icon("message-square", "icon-sm"), "Chat activity"),
                h("p.subtle", "How often simulated players send messages."),
                radios("t-chat", [["low", "Low", "Every 8–14 s"], ["medium", "Medium", "Every 5–10 s"], ["high", "High", "Every 3–5 s"]], "chatFreq"),
            ),
            h(
                "section",
                h("h3", icon("users", "icon-sm"), "Other players catching"),
                h("p.subtle", "Simulated players race you for every ball."),
                radios(
                    "t-catching",
                    [["off", "Off", "Only you"], ["easy", "Easy", "React in 5–10 s"], ["medium", "Medium", "React in 3–5 s"], ["hard", "Hard", "React in 2–3 s"]],
                    "userCatching",
                ),
            ),
            h(
                "section",
                h("h3", icon("bot", "icon-sm"), "Bot"),
                h("p.subtle", "Which dex spawns the balls."),
                h("div.field", h("label.sr-only", { htmlFor: "t-bot" }, "Bot"), botSelect),
                warning,
            ),
        );
    }

    (async () => {
        ({ dexes, incomplete } = await getDexList());
        buildConfig();
    })();
    emptyState();

    return {
        el,
        show() {},
    };
}
