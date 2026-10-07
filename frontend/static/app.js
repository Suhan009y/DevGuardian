const API_BASE = "/api/projects";

const form = document.getElementById("upload-form");
const fileInput = document.getElementById("zip-file");
const uploadBtn = document.getElementById("upload-btn");
const statusEl = document.getElementById("upload-status");
const errorEl = document.getElementById("upload-error");
const projectsBody = document.getElementById("projects-body");
const projectsEmpty = document.getElementById("projects-empty");
const refreshBtn = document.getElementById("refresh-btn");

function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

async function loadProjects() {
  try {
    const res = await fetch(API_BASE);
    if (!res.ok) throw new Error("Failed to load projects");
    const projects = await res.json();

    projectsBody.innerHTML = "";
    if (projects.length === 0) {
      projectsEmpty.style.display = "block";
      return;
    }
    projectsEmpty.style.display = "none";

    for (const p of projects) {
      const tr = document.createElement("tr");
      tr.setAttribute("data-reveal", "");
      tr.innerHTML = `
        <td><a class="project-link" href="/report.html?id=${p.id}">${p.name}</a></td>
        <td>${p.language || "unknown"}</td>
        <td>${p.finding_count}</td>
        <td>${p.quality_score != null ? p.quality_score : "–"}</td>
        <td>${p.status}</td>
        <td>${fmtDate(p.uploaded_at)}</td>
      `;
      projectsBody.appendChild(tr);
    }
    revealNow(projectsBody);
  } catch (err) {
    projectsEmpty.textContent = "Could not load projects — is the backend running?";
    projectsEmpty.style.display = "block";
  }
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorEl.textContent = "";

  const file = fileInput.files[0];
  if (!file) return;

  uploadBtn.disabled = true;
  statusEl.textContent = "Uploading and analyzing — this can take up to a minute for the first Semgrep run…";

  const formData = new FormData();
  formData.append("file", file);

  try {
    const res = await fetch(`${API_BASE}/upload`, { method: "POST", body: formData });
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.detail || "Upload failed.");
    }

    statusEl.textContent = "Analysis complete. Redirecting to report…";
    window.location.href = `/report.html?id=${data.id}`;
  } catch (err) {
    statusEl.textContent = "";
    errorEl.textContent = err.message;
    uploadBtn.disabled = false;
  }
});

refreshBtn.addEventListener("click", loadProjects);

loadProjects();
