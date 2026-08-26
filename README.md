# peligaming

**Gaming tools index — self-hosted companion tools for the games I play.**

A zero-build static site: an index page plus a folder of standalone HTML tools
(mostly exported Claude artifacts), deployed as a Cloudflare Worker with static
assets. Part of the [peliglot](https://peliglot.com) family.

## Structure

```
peligaming/
  wrangler.jsonc          Cloudflare Worker config (static assets only)
  public/                 Everything in here is served as-is
    index.html            The tools index (renders from tools.js)
    tools.js              Tool manifest — edit when adding a tool
    404.html              Not-found page
    tools/
      runescape/          One folder per game; built/exported tool HTML
      skyrim/
  tools-src/              React (.jsx) tool sources, bundled by build:tools
  scripts/build-tools.mjs Bundles each tools-src entry into public/tools/
  scripts/fetch-naval-data.mjs  Refreshes the Naval Pathfinder's committed
                          data (map texture, nav grid, POIs) from the OSRS Wiki
```

Deploys are still zero-build: `public/` is served verbatim, and built tool
HTML is committed. The only build step is local, when a React tool changes.

## Adding a tool

1. Get the tool file in place:
   - **Plain HTML artifact** (claude.ai → artifact → download as HTML): save
     it as `public/tools/<game>/<tool-name>.html`. Done.
   - **React/JSX artifact**: save the source under `tools-src/<game>/`, add
     an entry to the `TOOLS` list in `scripts/build-tools.mjs`, then run
     `npm install` (first time) and `npm run build:tools`. Commit both the
     source and the built HTML in `public/tools/`. The build bundles React
     and any imported libraries (recharts, etc. — add new ones to
     `devDependencies`) and includes a Tailwind pass so artifact utility
     classes work.
2. Add an entry to that game's `tools` array in `public/tools.js`
   (name, description, path).

To add a whole new game, add a new object to the `games` array in
`public/tools.js` with a name, emoji icon, accent color, and `tools` array,
then create the matching `public/tools/<game>/` folder.

## Local preview

Any static server works:

```sh
npx wrangler dev          # exact Cloudflare behavior, includes 404 handling
# or
python3 -m http.server -d public
```

Opening `public/index.html` directly in a browser also works.

## Deploy

```sh
npx wrangler deploy
```

First deploy serves at `peligaming.<your-subdomain>.workers.dev`.

### Custom subdomain

To serve at `gaming.peliglot.com`, uncomment the `routes` block in
`wrangler.jsonc` (the `peliglot.com` zone must exist in the same Cloudflare
account), or add it in the dashboard under
**Workers & Pages → peligaming → Settings → Domains & Routes**.
