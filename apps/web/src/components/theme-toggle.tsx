import { Moon, Sun } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import { useTheme } from "./theme-provider"

export function ThemeToggle() {
  const { setTheme } = useTheme()
  return (
    <Button
      variant="ghost"
      size="icon"
      className="rounded-md"
      aria-label="Toggle light/dark theme"
      title="Toggle light/dark theme"
      onClick={() =>
        setTheme(
          document.documentElement.classList.contains("dark") ? "light" : "dark"
        )
      }
    >
      <Sun className="hidden dark:block" />
      <Moon className="dark:hidden" />
    </Button>
  )
}
