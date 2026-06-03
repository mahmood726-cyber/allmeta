# Vendored web fonts

Locally-hosted woff2 subsets so `focus-studio` and `kanban-lab` render their
display fonts **offline, with no CDN dependency** (CSP stays `'self'`). Replaces
the former Google Fonts `<link>` loads.

| Family | Weights | File(s) | Used by |
| ------ | ------- | ------- | ------- |
| IBM Plex Mono | 400, 500 | `ibm-plex-mono-{400,500}.woff2` | both |
| Space Grotesk | 400, 500, 700 | `space-grotesk-{400,500,700}.woff2` | focus-studio |
| Sora | 400, 500, 700 | `sora-{400,500,700}.woff2` | kanban-lab |

Only the **latin** unicode subset is vendored (these are English-only UI apps).
`focus-fonts.css` / `kanban-fonts.css` carry the `@font-face` rules; the woff2
`src` URLs are relative to this directory.

## License

All three families are licensed under the **SIL Open Font License 1.1** (OFL),
which permits bundling and redistribution (including in an MIT-licensed project)
provided the fonts are not sold on their own. Upstream:

- IBM Plex Mono — © IBM Corp. — https://github.com/IBM/plex
- Space Grotesk — © Florian Karsten — https://github.com/floriankarsten/space-grotesk
- Sora — © Jonny Pinhorn / Soketype — https://github.com/soketype/Sora

The OFL is compatible with the repository's MIT license (permissive bundling;
no copyleft contamination of the surrounding code).
