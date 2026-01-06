function showPage(tab) {
  document.querySelectorAll(".page").forEach(el => el.classList.add("hidden"));
  document.querySelector(`#page-${tab}`)?.classList.remove("hidden");

  document.querySelectorAll(".tab").forEach(btn => btn.classList.remove("active"));
  document.querySelector(`.tab[data-tab="${tab}"]`)?.classList.add("active");
}

async function refreshHealth() {
  const status = document.getElementById("status");
  try {
    const res = await fetch("/api/health", { method: "GET" });
    const data = await res.json();
    const d1 = data?.d1?.ok ? "D1:OK" : "D1:FAIL";
    status.textContent = `Health: ${data.ok ? "OK" : "FAIL"} · ${d1}`;
  } catch (e) {
    status.textContent = "Health: FAIL · (API 응답 없음)";
  }
}

document.querySelectorAll(".tab").forEach(btn => {
  btn.addEventListener("click", () => showPage(btn.dataset.tab));
});

showPage("feed");
refreshHealth();
