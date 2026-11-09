# Actual Obsidian Canvas acceptance

The appliance tests the official [Obsidian 1.15.0 Linux installer](https://github.com/obsidianmd/obsidian-releases/releases/tag/v1.15.0) in a disposable Docker container. The Dockerfile pins its SHA-256, the base image digest and the browser driver's locked package integrity. The appliance is for local acceptance and is not published as part of yavc.app.

Run from the repository:

```powershell
pwsh -NoProfile -File scripts/test-obsidian-canvas.ps1
```

The script requires Docker and Node. It creates a new evidence directory, builds the image and runs that immutable image ID. The runtime has no network, personal documents or host profile. Its private Xvfb display and native folder chooser belong entirely to the container. The only writable host mount is the synthetic output directory; prepared inputs are mounted separately as read-only. The script removes only its own labeled container and retains every run's files and logs.

The test prepares both extended and standard-only Canvas documents using the actual producer reader, writer and model. It opens an empty vault through the normal Obsidian folder picker, populates the synthetic files, and performs real card edits through the visible Edit control and its sandboxed editor frame. It then reads the actual saved file, changes text and geometry using the producer model, observes Obsidian's reload and performs a second native save. No private Obsidian Canvas methods or configuration files participate.

The fixture covers all four node types, six preset colors, independent colors/alignment/shape metadata, a local group background, file subpaths, directional arrowheads, automatic sides, zero-size free endpoints and nested unknown root/node/edge fields. The observer compares every field, allowing documented default arrowhead omission and disjoint-node ordering changes. It rejects reordered overlapping nodes, which would change their standard z-order. Automatic projections must remain active and choose new sides after the producer moves a target above its source.

The [Canvas user interface](https://obsidian.md/help/plugins/canvas) documents the user operations. The driver connects through Electron's documented [remote debugging switch](https://www.electronjs.org/docs/latest/api/command-line-switches). Chromium's `--no-sandbox` switch is used only inside this bounded, non-root, offline testing container, as Electron permits for testing. Nothing opens on the shared desktop.

The receipt includes the tested version and actual user agent, immutable image identity, input/module hashes, harness hashes and source revision. A result applies to this pinned Linux build with core Canvas and no community plugins. Other versions, plugins and operating systems need their own acceptance run. A matching group/image aspect ratio avoids Obsidian's observed group resizing with `backgroundStyle: ratio`; that earlier mismatch is retained as a separate compatibility finding in the design record.
