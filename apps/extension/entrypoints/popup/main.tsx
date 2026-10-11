import { createRoot } from "react-dom/client"
import "@workspace/ui/globals.css"
import "./style.css"
import { App } from "./App"
createRoot(document.getElementById("root")!).render(<App />)
