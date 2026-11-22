import { AppearanceToggle } from "@workspace/ui/components/appearance-toggle"
import { useTheme } from "./theme-provider"

export function ThemeToggle() {
  const { setTheme } = useTheme()
  return <AppearanceToggle onChange={setTheme} />
}
