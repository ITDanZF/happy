const fs = require('node:fs');
const path = require('node:path');

const DIST_DIR = path.resolve(__dirname, '..', 'dist');
const INDEX_HTML = path.join(DIST_DIR, 'index.html');

function escapeForHtml(text) {
    // JS/CSS 放进 <script>/<style> 内不需要做 HTML entity escape。
    // 但需要避免意外闭合标签：</script> / </style>
    return text
        .replaceAll('</script>', '<\\/script>')
        .replaceAll('</style>', '<\\/style>');
}

function toFsPathFromHtmlUrl(url) {
    const clean = url.split('?')[0].split('#')[0];
    if (clean.startsWith('/')) return path.join(DIST_DIR, clean.slice(1));
    return path.join(DIST_DIR, clean);
}

async function fileExists(p) {
    try {
        await fs.promises.access(p, fs.constants.F_OK);
        return true;
    } catch {
        return false;
    }
}

async function main() {
    const html = await fs.promises.readFile(INDEX_HTML, 'utf8');

    // 收集所有外链 JS/CSS（含 modulepreload）。
    const jsUrls = new Set();
    const cssUrls = new Set();

    for (const m of html.matchAll(
        /<script\b[^>]*\bsrc\s*=\s*"([^"]+)"[^>]*><\/script>/gi
    )) {
        const url = m[1];
        if (url.endsWith('.js') || url.includes('.js?')) jsUrls.add(url);
    }

    for (const m of html.matchAll(
        /<link\b[^>]*\brel\s*=\s*"stylesheet"[^>]*\bhref\s*=\s*"([^"]+)"[^>]*>/gi
    )) {
        const url = m[1];
        if (url.endsWith('.css') || url.includes('.css?')) cssUrls.add(url);
    }

    for (const m of html.matchAll(
        /<link\b[^>]*\brel\s*=\s*"modulepreload"[^>]*\bhref\s*=\s*"([^"]+)"[^>]*>/gi
    )) {
        const url = m[1];
        if (url.endsWith('.js') || url.includes('.js?')) jsUrls.add(url);
    }

    // 先内联 CSS（替换 <link rel="stylesheet" ...> 为 <style>）。
    let out = html;
    for (const url of cssUrls) {
        const filePath = toFsPathFromHtmlUrl(url);
        if (!(await fileExists(filePath))) {
            throw new Error(`CSS not found: ${url} -> ${filePath}`);
        }
        const css = await fs.promises.readFile(filePath, 'utf8');
        out = out.replace(
            new RegExp(
                `<link\\b[^>]*\\brel\\s*=\\s*"stylesheet"[^>]*\\bhref\\s*=\\s*"${url.replace(
                    /[.*+?^${}()|[\\]\\]/g,
                    '\\$&'
                )}"[^>]*>`,
                'i'
            ),
            `<style>${escapeForHtml(css)}</style>`
        );
    }

    // 移除 modulepreload（JS 已内联/合并时没必要）。
    out = out.replaceAll(
        /\s*<link\b[^>]*\brel\s*=\s*"modulepreload"[^>]*>/gi,
        ''
    );

    // 再内联 JS（替换 <script src=...></script> 为内联 <script type="module">）。
    for (const url of jsUrls) {
        const filePath = toFsPathFromHtmlUrl(url);
        if (!(await fileExists(filePath))) {
            // 有些 preload 可能被 Vite 输出但最终没生成（极少见）；这里直接报错更安全。
            throw new Error(`JS not found: ${url} -> ${filePath}`);
        }
        const js = await fs.promises.readFile(filePath, 'utf8');
        out = out.replace(
            new RegExp(
                `<script\\b([^>]*)\\bsrc\\s*=\\s*"${url.replace(
                    /[.*+?^${}()|[\\]\\]/g,
                    '\\$&'
                )}"([^>]*)><\\/script>`,
                'i'
            ),
            (full, before, after) => {
                const attrs = `${before}${after}`;
                const isModule = /\btype\s*=\s*"module"/i.test(attrs);
                const typeAttr = isModule ? ' type="module"' : '';
                return `<script${typeAttr}>${escapeForHtml(js)}</script>`;
            }
        );
    }

    await fs.promises.writeFile(INDEX_HTML, out, 'utf8');

    // 删除已内联的外部文件（避免 dist 里残留 .js/.css）。
    const filesToRemove = [...jsUrls, ...cssUrls]
        .map(toFsPathFromHtmlUrl)
        .filter((p) => p.startsWith(DIST_DIR));

    for (const p of filesToRemove) {
        if (await fileExists(p)) {
            await fs.promises.rm(p);
        }
    }
}

main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
