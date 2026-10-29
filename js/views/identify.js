/**
 * Identifier — the first screen. Upload, paste or drop a spawn image (or a Discord image link)
 * and get the matching ball for the selected dex.
 */

import { h, icon, img, fmt, storage, store, copyText, timeAgo, reducedMotion } from "../core/dom.js";
import { toast, openDialog, isDialogOpen } from "../core/ui.js";
import { getDexList, getDex, dexIcon, artUrl, DEX_WITH_WAVES } from "../core/data.js";
import { latestEntry, openChangelog } from "../changelog.js";

const DISCORD_IMAGE_PATTERN = /^https:\/\/(cdn\.discordapp\.com|media\.discordapp\.net)\/(ephemeral-)?attachments\/\d+\/\d+\/[^?]+\.(png|jpg|jpeg|gif|webp)(\?.*)?$/i;
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_DIMENSION = 800;
const CONTACT_URL = "https://discord.com/users/334411435633541121";

export function createView() {
    let dexes = [];
    let dex = storage("identifierDex", "Ballsdex");
    let busy = false;
    let visible = false;
    let previewUrl = null;

    /* ----- Elements ----- */
    const countEl = h("span.count.num", { "aria-live": "polite" });
    const dexIconEl = h("img.dex-picker-icon", { alt: "", width: 28, height: 28 });
    dexIconEl.addEventListener("error", () => dexIconEl.classList.add("is-broken"));
    const dexSelect = h("select.select", { id: "identify-dex" });
    const dexPicker = h("div.dex-picker", dexIconEl, dexSelect);

    const fileInput = h("input.sr-only", { type: "file", accept: "image/*", id: "identify-file", tabindex: "-1" });
    const pasteBtn = h("button.btn.btn-primary", { type: "button" }, icon("clipboard-paste"), h("span", "Paste"));
    const uploadBtn = h("button.btn", { type: "button" }, icon("upload"), h("span", "Upload"));

    const scannerIcon = h("div.scanner-icon", icon("scan-search"));
    const scannerTitle = h("h2", "Drop a spawn image here");
    const scannerText = h("p", "Paste it, upload the file, or paste a Discord image link.");
    const scanner = h(
        "div.scanner",
        { "aria-describedby": "identify-tips" },
        h("span.corner.tl", { "aria-hidden": "true" }),
        h("span.corner.tr", { "aria-hidden": "true" }),
        h("span.corner.bl", { "aria-hidden": "true" }),
        h("span.corner.br", { "aria-hidden": "true" }),
        h("div.scan-target", scannerIcon, h("span.scan-line", { "aria-hidden": "true" })),
        h("div", { style: { display: "grid", gap: "6px", "justify-items": "center" } }, scannerTitle, scannerText),
        h("div.scanner-actions", pasteBtn, uploadBtn),
        h("p.kbd-hint", "Tip: press ", h("kbd", "Ctrl"), " ", h("kbd", "V"), " anywhere on this page"),
        fileInput,
    );

    const latestPill = h("button.latest-update", { type: "button", hidden: true, onclick: () => openChangelog(dex) });

    const tips = h(
        "details.disclosure",
        { id: "identify-tips" },
        h("summary", icon("info", "icon-sm"), "Tips for accurate results", icon("chevron-down", "icon-sm")),
        h(
            "ol",
            h("li", "Use the exact file the bot sent, not a screenshot. Screenshots change the image and the result may be off."),
            h("li", "Discord links to images over 6 MB return nothing. That's a hosting limit that can't be bypassed, so upload the file instead."),
            h("li", "Got a wrong answer? The ball probably has a new art. ", h("a", { href: CONTACT_URL, target: "_blank", rel: "noopener" }, "Let me know on Discord"), " so I can update it."),
        ),
    );

    const card = h(
        "div.card.identify-card",
        h("div.dex-head", h("h1", "Identify"), countEl),
        h("div.field", h("label.label", { htmlFor: "identify-dex" }, "Dex"), dexPicker),
        scanner,
        latestPill,
        tips,
    );

    const el = h("section.view", { dataset: { view: "identify" }, "aria-labelledby": "identify-title" }, h("div.identify-layout", card));
    card.querySelector("h1").id = "identify-title";

    /* ----- Dex picker ----- */

    async function initDexes() {
        ({ dexes } = await getDexList());
        if (!dexes.includes(dex)) dex = dexes[0];
        dexSelect.replaceChildren(...dexes.map((name) => h("option", { value: name, selected: name === dex }, name)));
        dexIconEl.src = dexIcon(dex);
        updateCount();
    }

    dexSelect.addEventListener("change", () => {
        dex = dexSelect.value;
        store("identifierDex", dex);
        dexIconEl.classList.remove("is-broken");
        dexIconEl.src = dexIcon(dex);
        updateCount();
        initLatest();
    });

    async function updateCount() {
        const current = dex;
        countEl.textContent = "";
        try {
            const data = await getDex(current);
            if (current === dex) countEl.textContent = `${fmt(Object.keys(data).length)} entries in ${dex}`;
        } catch {
            /* count is decorative */
        }
    }

    async function initLatest() {
        const current = dex;
        latestPill.hidden = true;
        try {
            const entry = await latestEntry(current);
            if (!entry || current !== dex) return;
            latestPill.replaceChildren(icon("sparkle", "icon-sm"), h("span", `${entry.dex || "Dex"} updated ${timeAgo(entry.time)}: ${entry.changes[0]}`));
            latestPill.hidden = false;
        } catch {
            /* optional */
        }
    }

    /* ----- Input sources ----- */

    uploadBtn.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", () => {
        const file = fileInput.files[0];
        fileInput.value = "";
        if (file) handleFile(file);
    });

    pasteBtn.addEventListener("click", async () => {
        if (busy) return;
        try {
            if (navigator.clipboard?.read) {
                const items = await navigator.clipboard.read();
                for (const item of items) {
                    const type = item.types.find((t) => t.startsWith("image/"));
                    if (type) {
                        const blob = await item.getType(type);
                        return handleFile(new File([blob], "pasted-image", { type: blob.type }));
                    }
                }
                for (const item of items) {
                    if (item.types.includes("text/plain")) {
                        const text = await (await item.getType("text/plain")).text();
                        return handleText(text);
                    }
                }
            } else if (navigator.clipboard?.readText) {
                return handleText(await navigator.clipboard.readText());
            }
            toast("Your clipboard has no image or Discord image link.", "info");
        } catch {
            toast("Your browser blocked clipboard access. Press Ctrl+V on the page or use Upload.", "error");
        }
    });

    document.addEventListener("paste", (event) => {
        if (!visible || busy || isDialogOpen()) return;
        if (/^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName)) return;
        const items = [...(event.clipboardData?.items || [])];
        const image = items.find((item) => item.type.startsWith("image/"));
        if (image) {
            event.preventDefault();
            const file = image.getAsFile();
            if (file) handleFile(file);
            return;
        }
        const text = event.clipboardData?.getData("text/plain");
        if (text) handleText(text, { quiet: true });
    });

    // Drag and drop anywhere on the page while this view is open
    let dragDepth = 0;
    const isFileDrag = (event) => [...(event.dataTransfer?.types || [])].some((t) => t === "Files" || t === "text/uri-list" || t === "text/plain");
    window.addEventListener("dragenter", (event) => {
        if (!visible || busy || !isFileDrag(event)) return;
        dragDepth += 1;
        scanner.classList.add("is-drag");
        scannerTitle.textContent = "Drop to identify";
    });
    window.addEventListener("dragleave", () => {
        if (!visible) return;
        dragDepth = Math.max(0, dragDepth - 1);
        if (!dragDepth) resetScanner();
    });
    window.addEventListener("dragover", (event) => {
        if (visible) event.preventDefault();
    });
    window.addEventListener("drop", (event) => {
        if (!visible) return;
        event.preventDefault();
        dragDepth = 0;
        resetScanner();
        if (busy) return;
        const file = event.dataTransfer.files[0];
        if (file) {
            if (file.type.startsWith("image/")) handleFile(file);
            else toast("That isn't an image. Drop a PNG, JPG, WebP or GIF.", "error");
            return;
        }
        const text = event.dataTransfer.getData("text/uri-list") || event.dataTransfer.getData("text/plain");
        if (text) handleText(text.split("\n")[0].trim());
    });

    function handleText(text, { quiet = false } = {}) {
        const url = (text || "").trim();
        if (DISCORD_IMAGE_PATTERN.test(url)) return identify({ url });
        if (!quiet) toast("That's not a Discord image link. Copy the image itself or its link from Discord.", "error");
    }

    async function handleFile(file) {
        if (!file.type.startsWith("image/")) return toast("That isn't an image. Use a PNG, JPG, WebP or GIF.", "error");
        const upload = file.size >= MAX_FILE_SIZE ? await compress(file) : file;
        identify({ file: upload, preview: file });
    }

    function compress(file) {
        return new Promise((resolve) => {
            const image = new Image();
            const url = URL.createObjectURL(file);
            image.onload = () => {
                let { width, height } = image;
                const scale = Math.min(1, MAX_DIMENSION / Math.max(width, height));
                width = Math.round(width * scale);
                height = Math.round(height * scale);
                const canvas = h("canvas", { width, height });
                canvas.getContext("2d").drawImage(image, 0, 0, width, height);
                URL.revokeObjectURL(url);
                canvas.toBlob((blob) => resolve(blob || file), "image/jpeg", 0.8);
            };
            image.onerror = () => {
                URL.revokeObjectURL(url);
                resolve(file);
            };
            image.src = url;
        });
    }

    /* ----- Identify ----- */

    async function identify({ file, url, preview }) {
        if (busy) return;
        busy = true;
        const forDex = dex;
        setScanning(preview ? URL.createObjectURL(preview) : url);

        try {
            let response;
            if (file) {
                const form = new FormData();
                form.append("file", file);
                form.append("dex", forDex);
                response = await fetch("/.netlify/functions/identify", { method: "POST", body: form });
            } else {
                response = await fetch("/.netlify/functions/identify", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ url, dex: forDex }),
                });
            }

            const text = await response.text();
            let data = {};
            try {
                data = JSON.parse(text);
            } catch {
                data = { error: text };
            }
            if (!response.ok) throw new Error(errorMessage(response.status, data, Boolean(url)));

            const name = data.country || data.name;
            if (!name) throw new Error("No match found for this image.");
            await showResult(forDex, name, Number(data.diff) || 0);
            scanner.classList.add("is-done");
            setTimeout(() => {
                scanner.classList.remove("is-done");
                resetScanner();
            }, reducedMotion() ? 0 : 900);
        } catch (error) {
            toast(error.message || "Couldn't identify this image. Try again.", "error");
            resetScanner();
        } finally {
            scanner.classList.remove("is-scanning");
            busy = false;
            setButtons(false);
        }
    }

    function errorMessage(status, data, fromUrl) {
        const raw = String(data.error || data.message || data.errorMessage || "");
        if (data.errorType === "Function.ResponseSizeTooLarge" || /too large|ResponseSizeTooLarge/i.test(raw) || status === 413) {
            return fromUrl ? "That image is over 6 MB. Upload the file instead." : "That image is too large. Try a smaller one.";
        }
        if (status === 429) return "Too many requests. Wait a moment and try again.";
        if (status === 504 || /timeout/i.test(raw)) return "That took too long. Try again.";
        if (/Unsupported image format|Invalid image file|Magic bytes/i.test(raw)) return "That file isn't a valid image. Use a PNG, JPG, WebP or GIF.";
        if (/403|Forbidden|expired/i.test(raw)) return "The link is no longer valid. Discord links expire, so copy a fresh one.";
        if (/404|Not Found/i.test(raw)) return "That image link is broken. Copy it again from Discord.";
        if (raw && raw.length < 140 && !/^</.test(raw)) return raw;
        return "Couldn't identify this image. Try again.";
    }

    function setButtons(disabled) {
        pasteBtn.disabled = disabled;
        uploadBtn.disabled = disabled;
        dexSelect.disabled = disabled;
    }

    function setScanning(src) {
        setButtons(true);
        scanner.classList.remove("is-done", "is-drag");
        scanner.classList.add("is-scanning");
        scannerTitle.textContent = "Identifying…";
        scannerText.textContent = `Comparing with every ball in ${dex}`;
        if (src) {
            if (previewUrl?.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
            previewUrl = src;
            scannerIcon.replaceWith(h("img.scanner-preview", { src, alt: "Your image", "data-preview": "" }));
        }
    }

    function resetScanner() {
        if (scanner.classList.contains("is-scanning")) return;
        scanner.classList.remove("is-drag");
        scanner.querySelector("[data-preview]")?.replaceWith(scannerIcon);
        scannerTitle.textContent = "Drop a spawn image here";
        scannerText.textContent = "Paste it, upload the file, or paste a Discord image link.";
    }

    /* ----- Result ----- */

    function lockCorners() {
        return ["tl", "tr", "bl", "br"].map((c) => h(`span.lock.${c}`, { "aria-hidden": "true" }));
    }

    async function showResult(forDex, name, diff) {
        let ball = null;
        try {
            ball = (await getDex(forDex))[name] || null;
        } catch {
            /* details are optional */
        }

        const similarity = Math.max(0, Math.min(100, Math.round((100 - diff) * 10) / 10));
        // Same line as the bot: a difference above 20 (below 80 %) is most likely a new spawn art
        const level = similarity >= 90 ? "high" : similarity >= 80 ? "warn" : "low";
        const verdict = { high: "Confident match", warn: "Probable match", low: "Unsure: probably a new spawn art, double-check" }[level];

        const fill = h("div.meter-fill");
        const copyBtn = h("button.btn", { type: "button" }, icon("copy"), h("span", "Copy name"));
        copyBtn.addEventListener("click", async () => {
            await copyText(name);
            copyBtn.replaceChildren(icon("check"), h("span", "Copied"));
            setTimeout(() => copyBtn.replaceChildren(icon("copy"), h("span", "Copy name")), 1500);
        });

        const facts = [];
        if (ball) {
            facts.push(["Rarity", `T${ball.rarity}`]);
            facts.push(["Artist", ball.artist || "Unknown"]);
            if (DEX_WITH_WAVES.includes(forDex) && ball.wave !== undefined) facts.push(["Wave", String(ball.wave)]);
            if (ball.id !== undefined) facts.push(["ID", `#${ball.id}`]);
        }

        const art = artUrl(forDex, name);
        const viewBtn = h("button.btn", { type: "button" }, icon("maximize-2"), h("span", "Full art"));
        const againBtn = h("button.btn.btn-primary", { type: "button" }, icon("scan-search"), h("span", "Identify another"));

        const { close } = openDialog({
            title: name,
            className: "result-dialog",
            initialFocus: "dialog",
            body: [
                h("div.result-art.is-locked", img(art, name), lockCorners()),
                h("p.result-verdict", h("span", { class: `level-${level}` }, verdict), ` · ${forDex}`),
                h(
                    "div.meter",
                    { dataset: { level } },
                    h("div.meter-head", h("span", "Similarity"), h("span.meter-value.num", `${similarity}%`)),
                    h("div.meter-track", { role: "meter", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": String(similarity), "aria-label": "Similarity" }, fill),
                ),
                facts.length ? h("dl.facts", facts.map(([k, v]) => h("div", h("dt", k), h("dd", { title: v }, v)))) : null,
                h("div.result-actions", copyBtn, viewBtn),
            ],
            footer: [againBtn],
        });
        viewBtn.addEventListener("click", () => openDialog({ title: name, wide: true, body: h("img.enlarged-art", { src: art, alt: `${name} spawn art` }) }));
        againBtn.addEventListener("click", () => close());
        requestAnimationFrame(() => requestAnimationFrame(() => (fill.style.width = `${similarity}%`)));
    }

    initDexes();
    initLatest();

    return {
        el,
        show() {
            visible = true;
        },
        hide() {
            visible = false;
            dragDepth = 0;
            resetScanner();
        },
    };
}

