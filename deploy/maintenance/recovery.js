(() => {
  let pending = false;

  async function check() {
    if (pending || document.visibilityState === "hidden") return;
    pending = true;
    try {
      const response = await fetch("/maintenance/status", {
        cache: "no-store",
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) return;
      const status = await response.json();
      if (status.restricted === 0) {
        // An API POST may have produced this document. Always navigate with GET.
        if (window.location.pathname.startsWith("/api/")) window.location.replace("/");
        else window.location.replace(window.location.href);
        return;
      }
      document.getElementById("status").textContent = "Prace nadal trwają. Zapraszamy ponownie później.";
    } catch {
      // Keep the maintenance screen during restarts or a temporary network outage.
    } finally {
      pending = false;
    }
  }

  document.getElementById("retry").addEventListener("click", check);
  document.addEventListener("visibilitychange", check);
  window.addEventListener("online", check);
  window.addEventListener("pageshow", check);
  window.setInterval(check, 10000);
  void check();
})();
