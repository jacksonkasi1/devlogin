import { defineConfig } from "wxt"
import tailwindcss from "@tailwindcss/vite"

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  vite: () => ({ plugins: [tailwindcss()] }),
  manifest: {
    name: "DevLogin",
    description: "Shared internal project logins",
    version: "1.0.0",
    permissions: ["storage", "identity", "tabs", "activeTab", "scripting"],
    // Granted once at install, like a password manager: no per-site prompts.
    host_permissions: ["https://*/*", "http://*/*"],
    action: { default_title: "DevLogin" },
  },
})
