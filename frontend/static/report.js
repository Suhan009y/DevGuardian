const API_BASE = "/api/projects";
const params = new URLSearchParams(window.location.search);
const projectId = params.get("id");

const titleEl = document.getElementById("project-title");
const statQuality = document.getElementById("stat-quality");
const statTotal = document.getElementById("stat-total");
const statLanguage = document.getElementById("stat-language");
const statStatus = document.getElementById("stat-status");
const findingsBody = document.getElementById("findings-body");
const findingsEmpty = document.getElementById("findings-empty");
const explainBtn = document.getElementById("explain-btn");
const explainStatus = document.getElementById("explain-status");
const exportLink = document.getElementById("export-link");

let severityChart = null;
let confettiFiredForThisLoad = false;

const SEVERITY_ORDER = ["critical", "high", "medium", "low", "info"];
const SEVERITY_COLORS = {
  critical: "#f43f5e", high: "#fb923c", medium: "#fbbf24", low: "#38bdf8", info: "#94a3b8",
};

function chartInkColor() {
  return getComputedStyle(document.documentElement).getPropertyValue("--ink").trim() || "#0f172a";
}
function chartMutedColor() {
  return getComputedStyle(document.documentElement).getPropertyValue("--muted").trim() || "#64748b";
}

if (!projectId) {
  titleEl.textContent = "No project specified.";
} else {
  exportLink.href = `${API_BASE}/${projectId}/export.csv`;
  loadProject();
}

async function loadProject() {
  let detail, dashboard;

  // Fetching and rendering the header/findings is the critical path — if
  // this fails, there's genuinely nothing to show.
  try {
    const [detailRes, dashRes] = await Promise.all([
      fetch(`${API_BASE}/${projectId}`),
      fetch(`${API_BASE}/${projectId}/dashboard`),
    ]);
    if (!detailRes.ok) throw new Error("Project not found.");

    detail = await detailRes.json();
    dashboard = await dashRes.json();
  } catch (err) {
    titleEl.textContent = "Could not load this project.";
    explainStatus.textContent = err.message;
    return;
  }

  renderHeader(detail);
  renderFindings(detail.findings);
  maybeFireQualityConfetti(detail.quality_score);

  // The chart is a nice-to-have: isolated in its own try/catch so a
  // Chart.js load failure (offline, CDN blocked, etc.) never takes down
  // the rest of the page.
  try {
    renderChart(dashboard);
  } catch (err) {
    const canvas = document.getElementById("severity-chart");
    canvas.style.display = "none";
    canvas.insertAdjacentHTML(
      "afterend",
      `<p class="muted">Chart unavailable (Chart.js didn't load — check your connection).</p>`
    );
  }
}

function renderHeader(detail) {
  titleEl.textContent = detail.name;
  statQuality.textContent = detail.quality_score != null ? detail.quality_score : "–";
  statLanguage.textContent = detail.language || "unknown";
  statStatus.textContent = detail.status;

  statTotal.dataset.counter = detail.finding_count;
  animateCountersNow(statTotal.parentElement.parentElement);
}

// A little celebratory touch, same spirit as the reference project's
// win-screen confetti: fires once per page load if the quality score is strong.
function maybeFireQualityConfetti(qualityScore) {
  if (confettiFiredForThisLoad) return;
  if (qualityScore != null && qualityScore >= 90) {
    confettiFiredForThisLoad = true;
    setTimeout(() => fireConfetti(45), 400);
  }
}

function renderChart(dashboard) {
  const labels = SEVERITY_ORDER.filter((s) => dashboard.by_severity[s]);
  const data = labels.map((s) => dashboard.by_severity[s]);
  const colors = labels.map((s) => SEVERITY_COLORS[s]);

  const canvas = document.getElementById("severity-chart");
  const ctx = canvas.getContext("2d");
  if (severityChart) severityChart.destroy();

  if (labels.length === 0) {
    canvas.style.display = "none";
    return;
  }
  canvas.style.display = "block";

  const ink = chartInkColor();
  const muted = chartMutedColor();
  const isDark = document.documentElement.getAttribute("data-theme") === "dark" ||
    (!document.documentElement.getAttribute("data-theme") && window.matchMedia("(prefers-color-scheme: dark)").matches);

  severityChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Findings",
        data,
        backgroundColor: colors,
        borderColor: isDark ? "#0f172a" : ink,
        borderWidth: 2,
        maxBarThickness: 56,
      }],
    },
    options: {
      plugins: { legend: { display: false } },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { stepSize: 1, color: muted },
          grid: { color: isDark ? "rgba(226,232,240,0.08)" : "rgba(15,23,42,0.08)" },
        },
        x: { ticks: { color: muted }, grid: { display: false } },
      },
    },
  });
}

function renderFindings(findings) {
  findingsBody.innerHTML = "";

  if (!findings || findings.length === 0) {
    findingsEmpty.style.display = "block";
    return;
  }
  findingsEmpty.style.display = "none";

  for (const f of findings) {
    const tr = document.createElement("tr");
    tr.setAttribute("data-reveal", "");
    const location = f.file ? `${f.file}${f.line ? ":" + f.line : ""}` : "–";

    let aiHtml = "";
    if (f.ai_explanation) {
      aiHtml = `<div class="finding-detail">
        <strong>✎ AI explanation:</strong> ${escapeHtml(f.ai_explanation)}
        ${f.ai_suggested_fix ? `<br/><strong>Suggested fix:</strong> ${escapeHtml(f.ai_suggested_fix)}` : ""}
      </div>`;
    }

    tr.innerHTML = `
      <td><span class="badge ${f.severity}">${f.severity}</span></td>
      <td>${f.tool}</td>
      <td>${escapeHtml(location)}</td>
      <td>${escapeHtml(f.message)}${aiHtml}</td>
    `;
    findingsBody.appendChild(tr);
  }
  revealNow(findingsBody);
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

explainBtn.addEventListener("click", async () => {
  explainBtn.disabled = true;
  const originalLabel = explainBtn.textContent;
  explainBtn.textContent = "✨ Thinking…";
  explainStatus.textContent = "Asking the local AI model to explain each finding — this runs one at a time and may take a while…";

  try {
    const res = await fetch(`${API_BASE}/${projectId}/explain`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "AI explanation failed.");

    renderHeader(data);
    renderFindings(data.findings);
    explainStatus.textContent = "Done. ✎";
  } catch (err) {
    explainStatus.textContent = `Could not generate explanations: ${err.message}`;
  } finally {
    explainBtn.disabled = false;
    explainBtn.textContent = originalLabel;
  }
});
