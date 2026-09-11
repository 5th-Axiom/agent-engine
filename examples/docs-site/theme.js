try {
  const theme = localStorage.getItem("agent-docs-theme");
  document.documentElement.dataset.theme = theme === "dark" ? "dark" : "light";
} catch {
  document.documentElement.dataset.theme = "light";
}
