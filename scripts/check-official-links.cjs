const fs = require("node:fs");
const path = require("node:path");

const indexPath = path.join(process.cwd(), "web", "index.html");
const outputPath = path.join(process.cwd(), "web", "official-links-status.json");
const html = fs.readFileSync(indexPath, "utf8");
const sectionStart = html.indexOf('<section class="section alt" id="official">');
const sectionEnd = html.indexOf("</section>", sectionStart);
if (sectionStart < 0 || sectionEnd < 0) throw new Error("Official directory section not found.");

const section = html.slice(sectionStart, sectionEnd);
const links = [];
const anchorRe = /<a\s+class="directory-item"\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
for (const match of section.matchAll(anchorRe)) {
  const url = match[1].split("#")[0];
  const label = (match[2].match(/<b>([\s\S]*?)<\/b>/)?.[1] || url).replace(/<[^>]*>/g, "").trim();
  if (/^https:\/\//i.test(url) && !links.some(item => item.url === url)) links.push({ label, url });
}
if (!links.length) throw new Error("No official directory links were extracted.");

async function check(link) {
  const started = Date.now();
  try {
    let response = await fetch(link.url, {
      method: "HEAD",
      redirect: "follow",
      signal: AbortSignal.timeout(12000),
      headers: { "user-agent": "AmnaYarOfficialLinkMonitor/1.0 (+https://amnayar.ir)" }
    }).catch(() => null);
    if (!response || response.status === 405 || response.status === 501) {
      response = await fetch(link.url, {
        method: "GET",
        redirect: "follow",
        signal: AbortSignal.timeout(12000),
        headers: { "user-agent": "AmnaYarOfficialLinkMonitor/1.0 (+https://amnayar.ir)", range: "bytes=0-1023" }
      });
    }
    const status = response.status;
    let result = "ok";
    if (status === 404 || status === 410) result = "not_found";
    else if (status === 401 || status === 403 || status === 429 || status >= 500) result = "needs_review";
    return { ...link, status, result, finalUrl: response.url, checkedInMs: Date.now() - started };
  } catch (error) {
    return { ...link, status: null, result: "needs_review", error: error.name === "TimeoutError" ? "timeout" : "connection_error", checkedInMs: Date.now() - started };
  }
}

(async () => {
  const results = [];
  for (let i = 0; i < links.length; i += 4) {
    results.push(...await Promise.all(links.slice(i, i + 4).map(check)));
  }
  const report = {
    schemaVersion: 1,
    checkedAt: new Date().toISOString(),
    total: results.length,
    ok: results.filter(x => x.result === "ok").length,
    notFound: results.filter(x => x.result === "not_found").length,
    needsReview: results.filter(x => x.result === "needs_review").length,
    note: "403/429/5xx and connection failures can be caused by anti-bot rules or temporary restrictions; review manually before changing a URL.",
    results
  };
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2) + "\n");
  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (summary) {
    const rows = results.map(x => `| ${x.label.replace(/\|/g, "\\|")} | ${x.status ?? x.error} | ${x.result} | [open](${x.url}) |`).join("\n");
    fs.appendFileSync(summary, `## AmnaYar — بررسی خودکار لینک‌های سامانه‌های رسمی\n\nزمان بررسی: ${report.checkedAt}\n\n- کل: ${report.total}\n- پاسخ معمول: ${report.ok}\n- 404/410: ${report.notFound}\n- نیازمند بررسی دستی: ${report.needsReview}\n\n> وضعیت‌های مسدودشده یا خطاهای موقت به‌تنهایی اثبات خرابی لینک نیستند.\n\n| سامانه | HTTP | نتیجه | لینک |\n|---|---:|---|---|\n${rows}\n`);
  }
  console.log(JSON.stringify({ total: report.total, ok: report.ok, notFound: report.notFound, needsReview: report.needsReview }, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
