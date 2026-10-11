import { useState } from "react"
import { createRoot } from "react-dom/client"
function Form() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        document.body.dataset.submitted = JSON.stringify({ email, password })
        document.body.dataset.count = String(
          Number(document.body.dataset.count ?? "0") + 1
        )
      }}
    >
      <label>
        Email
        <input
          id="email"
          name="email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </label>
      <label>
        Password
        <input
          id="password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </label>
      <button type="submit">Login</button>
    </form>
  )
}
setTimeout(
  () => createRoot(document.getElementById("root")!).render(<Form />),
  new URLSearchParams(location.search).has("delayed") ? 1000 : 0
)
