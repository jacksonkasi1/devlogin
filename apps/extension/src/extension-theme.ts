import { useEffect } from "react"

export function useExtensionTheme(
  theme = localStorage.getItem("theme") ?? "system"
) {
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)")
    const apply = () =>
      document.documentElement.classList.toggle(
        "dark",
        theme === "dark" || (theme === "system" && media.matches)
      )
    apply()
    media.addEventListener("change", apply)
    return () => media.removeEventListener("change", apply)
  }, [theme])
}
