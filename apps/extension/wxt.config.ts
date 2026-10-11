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
    host_permissions: [
      "https://devlogin.peacockindia.in/*",
      "http://localhost/*",
      "http://127.0.0.1/*",
    ],
    optional_host_permissions: ["http://*/*", "https://*/*"],
    action: { default_title: "DevLogin" },
  },
})
