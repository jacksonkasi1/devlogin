import { defineConfig } from "wxt"
import tailwindcss from "@tailwindcss/vite"

// Chrome Web Store builds (`bun run zip:store`) omit the pinned key, which the
// store rejects, and the local development hosts.
const store = process.env.WXT_STORE === "1"

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  vite: () => ({ plugins: [tailwindcss()] }),
  manifest: {
    name: "Global Login",
    description:
      "Your team's shared logins and secure notes, filled in one click on every staging, QA and production site.",
    version: "1.0.0",
    homepage_url: "https://devlogin.peacockindia.in",
    // Public key pins the unpacked extension ID across browsers, paths, and OSes.
    ...(store
      ? {}
      : {
          key: "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAobB8Pti89R9zM6GCt3PNU5vDWUbO+kQB4JzRfOb5mC/YLf0J8UdC0LSusF0cAYATaAq/ma5YZXGw9UBF2/Bgcf/mYozgC1tAM9CrNWnu5VREPde8s4r+1VyKV8tdrp1di9JJKbZ6x8U2QsVOgaZh5VM5GI77ETgfIFqmpFulkVALqNuQtjMsGCyOR/g+thFNYhEwyCAof6Yg4stgx96zeniHKN0gVeHjzYipP+XdCrQpSmGJX3rvR00hnon4iXTtW+gRX5GZeC3xIxv8imJ0xk9xfhjRxBXCjn/ujRTzjyS6CLsEJEdQ6EAEg8aorXkh+hvWeAVyYa8D0VNole6g/wIDAQAB",
        }),
    permissions: ["storage", "identity", "tabs", "activeTab", "scripting"],
    // Granted once at install, like other password managers, so the inline
    // account list works on every site without per-site permission prompts.
    host_permissions: ["https://*/*", "http://*/*"],
    action: { default_title: "Global Login" },
    commands: {
      "quick-access": {
        suggested_key: { default: "Ctrl+Shift+Space", mac: "Command+Shift+Space" },
        description: "Quick Access: search logins and notes on any page",
      },
      _execute_action: {
        suggested_key: { default: "Alt+Shift+L", mac: "Alt+Shift+L" },
        description: "Open Global Login",
      },
    },
    // Framed into pages by the Quick Access shortcut; it shows nothing without
    // a one-time token issued by the service worker.
    web_accessible_resources: [
      { resources: ["quick.html"], matches: ["<all_urls>"] },
    ],
  },
})
