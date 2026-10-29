import { h } from "./dom.js";

const INLINE = /(`+)([\s\S]*?[^`])\1(?!`)|\*\*([\s\S]+?)\*\*(?!\*)|__([\s\S]+?)__(?!_)|~~([\s\S]+?)~~|\|\|([\s\S]+?)\|\||\*(?!\s)([^*]+?)\*|\b_(?!\s)([^_]+?)_\b/;

function inline(text, renderText) {
    const out = [];
    let rest = text;
    while (rest) {
        const m = INLINE.exec(rest);
        if (!m) {
            out.push(...renderText(rest));
            break;
        }
        if (m.index > 0) out.push(...renderText(rest.slice(0, m.index)));
        const [, , code, bold, underline, strike, spoiler, italicStar, italicUnderscore] = m;
        if (code !== undefined) out.push(h("code.md-code", code.trim()));
        else if (bold !== undefined) out.push(h("strong", inline(bold, renderText)));
        else if (underline !== undefined) out.push(h("u", inline(underline, renderText)));
        else if (strike !== undefined) out.push(h("s", inline(strike, renderText)));
        else if (spoiler !== undefined) out.push(h("span.md-spoiler", inline(spoiler, renderText)));
        else out.push(h("em", inline(italicStar ?? italicUnderscore, renderText)));
        rest = rest.slice(m.index + m[0].length);
    }
    return out;
}

export function renderDiscordMarkdown(source, renderText = (t) => [t]) {
    const blocks = [];
    const lines = source.replace(/\r\n?/g, "\n").split("\n");

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // ``` fenced code block (optional language on the first line)
        if (line.trimStart().startsWith("```")) {
            const body = [];
            const first = line.trimStart().slice(3);
            const closesSameLine = first.length > 3 && first.endsWith("```");
            if (closesSameLine) {
                blocks.push(h("pre.md-pre", first.slice(0, -3)));
                continue;
            }
            let j = i + 1;
            for (; j < lines.length && !lines[j].trimEnd().endsWith("```"); j++) body.push(lines[j]);
            if (j < lines.length) {
                const last = lines[j].trimEnd().slice(0, -3);
                if (last) body.push(last);
                blocks.push(h("pre.md-pre", body.join("\n")));
                i = j;
                continue;
            }
            // unclosed fence: Discord shows it as text
        }

        let m;
        if ((m = /^(#{1,3}) (.+)$/.exec(line))) blocks.push(h(`div.md-h${m[1].length}`, inline(m[2], renderText)));
        else if ((m = /^-# (.+)$/.exec(line))) blocks.push(h("div.md-sub", inline(m[1], renderText)));
        else if ((m = /^>>> ?([\s\S]*)$/.exec(line))) {
            blocks.push(h("div.md-quote", [m[1], ...lines.slice(i + 1)].map((l) => h("div", inline(l, renderText)))));
            break;
        } else if ((m = /^> ?(.*)$/.exec(line))) blocks.push(h("div.md-quote", inline(m[1], renderText)));
        else if ((m = /^\s*[-*] (.+)$/.exec(line))) blocks.push(h("div.md-li", inline(m[1], renderText)));
        else if (!line.trim()) blocks.push(h("div.md-blank", { "aria-hidden": "true" }));
        else blocks.push(h("div", inline(line, renderText)));
    }
    return blocks;
}
