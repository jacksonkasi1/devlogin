import { browser } from "wxt/browser"
import { matchProject, type Project } from "@workspace/shared"

export type PageIdentity = { title: string; application: string; site: string }
export type LocalBinding = {
  projectId: string
  origin: string
  identity: PageIdentity
}
export function localAddress(address: string) {
  try {
    return ["localhost", "127.0.0.1", "[::1]"].includes(
      new URL(address).hostname
    )
  } catch {
    return false
  }
}
// Only stable public identity hints; never form values, query strings, or passwords.
export function readPageIdentity(): PageIdentity {
  const clean = (value: string | null | undefined) =>
    (value ?? "").trim().replace(/\s+/g, " ").slice(0, 300)
  return {
    title: clean(document.title),
    application: clean(
      document
        .querySelector('meta[name="application-name"]')
        ?.getAttribute("content")
    ),
    site: clean(
      document
        .querySelector('meta[property="og:site_name"]')
        ?.getAttribute("content")
    ),
  }
}
export function sameIdentity(saved: PageIdentity, current: PageIdentity) {
  // A declared application name is more stable than a route-dependent title.
  const keys =
    saved.application || saved.site
      ? (["application", "site"] as const)
      : (["title"] as const)
  return (
    keys.some((key) => !!saved[key]) &&
    keys.every((key) => saved[key] === current[key])
  )
}
export async function tabIdentity(tabId: number): Promise<PageIdentity> {
  const [result] = await browser.scripting.executeScript({
    target: { tabId },
    func: readPageIdentity,
  })
  if (!result?.result)
    throw new Error("Enable Global Login on this site to identify it")
  return result.result
}
export async function matchPage(
  projects: Project[],
  address: string,
  tabId: number
) {
  if (!localAddress(address))
    return { project: matchProject(projects, address), identity: undefined }
  // Unknown sites have no project identity to verify. Avoid inspecting a tab
  // that may already be navigating after its login form was submitted.
  const eligible = projects.filter((project) => matchProject([project], address))
  if (!eligible.length) return { project: undefined, identity: undefined }
  const identity = await tabIdentity(tabId)
  const { localBindings = [] } =
    await browser.storage.local.get("localBindings")
  const bindings = localBindings as LocalBinding[]
  // A single project on this port is learned on first use, so there is no
  // identification step; a different app on the port later still fails below.
  const origin = new URL(address).origin
  if (
    eligible.length === 1 &&
    (identity.title || identity.application || identity.site) &&
    !bindings.some(
      (binding) =>
        binding.projectId === eligible[0]!.id && binding.origin === origin
    )
  ) {
    await browser.storage.local.set({
      localBindings: [
        ...bindings,
        { projectId: eligible[0]!.id, origin, identity },
      ],
    })
    return { project: eligible[0], identity }
  }
  const matches = eligible.filter(
    (project) =>
      matchProject([project], address) &&
      bindings.some(
        (binding) =>
          binding.projectId === project.id &&
          binding.origin === new URL(address).origin &&
          sameIdentity(binding.identity, identity)
      )
  )
  // Generic/identical metadata cannot distinguish two applications. Never guess.
  return { project: matches.length === 1 ? matches[0] : undefined, identity }
}
export async function bindLocalProject(
  project: Project,
  address: string,
  tabId: number
) {
  if (!localAddress(address) || !matchProject([project], address))
    throw new Error("Choose a project with this localhost URL")
  const identity = await tabIdentity(tabId)
  if (!identity.title && !identity.application && !identity.site)
    throw new Error(
      "Add a page title or application-name meta tag before identifying this project"
    )
  const { localBindings = [] } =
    await browser.storage.local.get("localBindings")
  const bindings = localBindings as LocalBinding[]
  await browser.storage.local.set({
    localBindings: [
      ...bindings.filter(
        (item) =>
          !(
            item.projectId === project.id &&
            item.origin === new URL(address).origin
          )
      ),
      { projectId: project.id, origin: new URL(address).origin, identity },
    ],
  })
  return identity
}
