import { defineConfig } from "wxt"
import tailwindcss from "@tailwindcss/vite"

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  vite: () => ({ plugins: [tailwindcss()] }),
  manifest: {
    name: "Global Login",
    description: "Peacock Projects",
    version: "1.0.0",
    // Public key pins the unpacked extension ID across browsers, paths, and OSes.
    key: "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAobB8Pti89R9zM6GCt3PNU5vDWUbO+kQB4JzRfOb5mC/YLf0J8UdC0LSusF0cAYATaAq/ma5YZXGw9UBF2/Bgcf/mYozgC1tAM9CrNWnu5VREPde8s4r+1VyKV8tdrp1di9JJKbZ6x8U2QsVOgaZh5VM5GI77ETgfIFqmpFulkVALqNuQtjMsGCyOR/g+thFNYhEwyCAof6Yg4stgx96zeniHKN0gVeHjzYipP+XdCrQpSmGJX3rvR00hnon4iXTtW+gRX5GZeC3xIxv8imJ0xk9xfhjRxBXCjn/ujRTzjyS6CLsEJEdQ6EAEg8aorXkh+hvWeAVyYa8D0VNole6g/wIDAQAB",
    permissions: ["storage", "identity", "tabs", "activeTab", "scripting"],
    host_permissions: [
      "https://devlogin.peacockindia.in/*",
      "http://localhost/*",
      "http://127.0.0.1/*",
    ],
    optional_host_permissions: ["http://*/*", "https://*/*"],
    action: { default_title: "Global Login" },
  },
})
