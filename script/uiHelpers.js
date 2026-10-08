// Drobne pomocniki interfejsu: komunikaty (toasty) i wysokość stopki.
(function () {
  // --- Toasty ---
  // window.showToast("Kupiono: Miecz!", "success")  (typy: success | warning | danger)
  let host;
  function ensureHost() {
    if (host) return host;
    host = document.createElement("div");
    host.id = "toast-host";
    host.setAttribute("role", "status");
    host.setAttribute("aria-live", "polite");
    document.body.appendChild(host);
    return host;
  }

  window.showToast = function (text, type, duration = 2600) {
    if (!text) return;
    const container = ensureHost();
    const toast = document.createElement("div");
    toast.className = `toast ${type || ""}`.trim();
    toast.textContent = text;
    const dismiss = () => {
      toast.classList.add("is-leaving");
      window.setTimeout(() => toast.remove(), 200);
    };
    toast.addEventListener("click", dismiss);
    container.appendChild(toast);
    while (container.children.length > 3) container.firstElementChild.remove();
    window.setTimeout(dismiss, duration);
  };
})();
