import { Moon, Sun } from "lucide-react"
import { Button } from "./button"

export function AppearanceToggle({
  onChange,
  disabled,
}: {
  onChange: (theme: "light" | "dark") => void
  disabled?: boolean
}) {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      disabled={disabled}
      aria-label="Toggle light/dark theme"
      title="Toggle light/dark theme"
      onClick={() =>
        onChange(
          document.documentElement.classList.contains("dark") ? "light" : "dark"
        )
      }
    >
      <Sun className="hidden dark:block" />
      <Moon className="dark:hidden" />
    </Button>
  )
}
