/** Theme toggle — light default, dark optional. */
export function getTheme(): "dark" | "light" {
  if (typeof document === "undefined") return "light";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export function setTheme(t: "dark" | "light") {
  if (t === "dark") document.documentElement.classList.add("dark");
  else document.documentElement.classList.remove("dark");
  localStorage.setItem("kismet-theme", t);
}

export function toggleTheme() {
  setTheme(getTheme() === "dark" ? "light" : "dark");
}
