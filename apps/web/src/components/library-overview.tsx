import {
  groupsFor,
  type Collection,
  type Project,
  type Sync,
  type SortOrder,
} from "@workspace/shared"
import {
  LayoutGrid,
  Layers,
  Plus,
  ArrowUpRight,
  KeyRound,
  Folder,
} from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import { OrganizationMenu } from "@workspace/ui/components/organization"
import { ItemIcon } from "@workspace/ui/components/item-icon"

export function LibraryOverview({
  kind,
  data,
  query,
  admin,
  group,
  setGroup,
  sort,
  setSort,
  request,
  refreshGroups,
  createProject,
  chooseProject,
  openCollection,
}: {
  kind: "projects" | "collections"
  data: Sync | null
  query: string
  admin: boolean
  group: string
  setGroup: (id: string) => void
  sort: SortOrder
  setSort: (order: SortOrder) => void
  request: <T>(path: string, method?: string, body?: unknown) => Promise<T>
  refreshGroups: () => Promise<unknown>
  createProject: () => void
  chooseProject: (project: Project) => void
  openCollection: (id: string) => void
}) {
  const projects = data?.projects ?? []
  const collections: Collection[] = data?.collections ?? []
  const isProjects = kind === "projects"
  const inCollection = collections.find((g) => g.id === group)
  const inGroup = (p: Project) =>
    !inCollection ||
    ((!inCollection.project_id || inCollection.project_id === p.id) &&
      (p.tags?.some(
        (t) => t.toLowerCase() === inCollection.tag.toLowerCase()
      ) ||
        data?.accounts.some(
          (a) =>
            a.project_id === p.id && groupsFor(a, p, [inCollection]).length > 0
        )))
  const items = isProjects ? projects.filter(inGroup) : collections
  const rows = items.filter((item) => item.name.toLowerCase().includes(query))
  return (
    <section className="library-overview">
      <header>
        <span className="library-emblem">
          {isProjects ? <LayoutGrid /> : <Layers />}
        </span>
        <div>
          <h1>
            {isProjects ? (inCollection?.name ?? "Projects") : "Collections"}
          </h1>
          <p>
            {isProjects
              ? rows.length + (rows.length === 1 ? " project" : " projects")
              : rows.length +
                (rows.length === 1 ? " collection" : " collections")}
          </p>
        </div>
        {admin && isProjects && !inCollection && (
          <Button variant="outline" size="sm" onClick={createProject}>
            <Plus />
            New project
          </Button>
        )}
        {!isProjects && (
          <OrganizationMenu
            groups={collections}
            group={group}
            change={setGroup}
            sort={sort}
            onSort={setSort}
            editable={admin}
            request={request}
            refresh={refreshGroups}
          />
        )}
      </header>
      <div className="library-grid">
        {rows.map((item) => {
          const collection = collections.find((g) => g.id === item.id)
          const matches = (data?.accounts ?? []).filter((a) =>
            isProjects
              ? a.project_id === item.id &&
                (!inCollection ||
                  groupsFor(
                    a,
                    projects.find((p) => p.id === item.id),
                    [inCollection]
                  ).length > 0)
              : groupsFor(
                  a,
                  projects.find((p) => p.id === a.project_id),
                  collection ? [collection] : []
                ).length > 0
          )
          const memberProjects = projects.filter(
            (p) =>
              (!collection?.project_id || collection.project_id === p.id) &&
              (p.tags?.some(
                (t) => t.toLowerCase() === collection?.tag.toLowerCase()
              ) ||
                matches.some((a) => a.project_id === p.id))
          )
          return (
            <button
              className="library-card"
              key={item.id}
              onClick={() => {
                if (isProjects)
                  chooseProject(projects.find((p) => p.id === item.id)!)
                else openCollection(item.id)
              }}
            >
              <div className="library-card-top">
                <span className="library-tile">
                  {isProjects ? (
                    <ItemIcon folder icon={"icon" in item ? item.icon : ""} />
                  ) : (
                    <Layers />
                  )}
                </span>
                <ArrowUpRight size={16} />
              </div>
              <strong>{item.name}</strong>
              <span className="library-description">
                {isProjects
                  ? ("description" in item && item.description) ||
                    projects
                      .find((p) => p.id === item.id)
                      ?.urls?.map((url) => {
                        try {
                          return new URL(url).host
                        } catch {
                          return url
                        }
                      })
                      .join(" · ")
                  : memberProjects.map((p) => p.name).join(" · ")}
              </span>
              <footer>
                {isProjects ? <KeyRound size={14} /> : <Folder size={14} />}{" "}
                {isProjects
                  ? matches.length +
                    (matches.length === 1 ? " login" : " logins")
                  : memberProjects.length +
                    " projects · " +
                    matches.length +
                    " logins"}
              </footer>
            </button>
          )
        })}
      </div>
      {!rows.length && (
        <p className="library-empty">
          {query
            ? "No matches."
            : isProjects
              ? inCollection
                ? "Select this collection when editing a project or login to include it here."
                : "Create a project to organize your first login."
              : "Create a collection in the collection menu, then select it when editing a project or login."}
        </p>
      )}
    </section>
  )
}
