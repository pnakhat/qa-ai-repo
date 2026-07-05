# qa-ai-repo

QA AI tooling, organized **by objective**. Each QA objective gets its own
top-level folder, containing only the `skills/`, `agents/`, and `mcp/` pieces
that objective needs.

## Layout

```
qa-ai-repo/
├── _template/            # copy this to start a new objective
│   ├── skills/
│   ├── agents/
│   └── mcp/
└── <objective-name>/     # e.g. checkout-regression, api-contract-tests
    ├── README.md         # what this objective covers
    ├── skills/           # (optional) skills for this objective
    ├── agents/           # (optional) agents for this objective
    └── mcp/              # (optional) MCP servers/configs
```

## Add a new objective

```bash
cp -r _template my-new-objective
# edit my-new-objective/README.md, drop any subfolders you don't need
```

Only keep the `skills/` / `agents/` / `mcp/` folders an objective actually uses.
