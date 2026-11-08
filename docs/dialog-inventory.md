# Dialog inventory and acceptance record

This inventory covers every authored dialog and generated dialog family found in the site, applets and shared modules. Each row names its interaction contract and its current evidence. A source review establishes control choice and ownership rules; it does not establish rendered acceptance. A layout check on an empty authored dialog does not establish its populated workflow. Those distinctions remain visible below.

The shared contract uses PUDL fields, labeled native selections, contextual errors and an explicit commit action for document changes. Preferences that apply immediately identify that behavior and use Done or Close. Cancel, Escape, stale-target refusal and disposal must leave the document unchanged. File fields offer direct entry and Browse; lasting computer dependencies require a separate create-only Import into the VFS. A folder destination offers a directory chooser instead of a computer-file upload.

The executable evidence includes the site, content, authored, block, formatting, file and dependency dialog suites in `scripts/test-*-dialogs.cjs` and `scripts/test-dialog-overhaul.cjs`, plus the existing focused content suites. Screenshots are written under the corresponding `yavc-*-evidence` directories in the system temporary folder with finite animations settled. Each sweep opens the listed form, checks its accessible name and bounds, exercises keyboard containment, and cancels it. A sweep establishes those rendered interactions; it does not assert that every possible input combination or external backend was exercised. The deeper checks are named separately in the table.

| Owner | Dialog or variant | Contract and review finding | Rendered acceptance |
| --- | --- | --- | --- |
| Shared | Text question | One labeled field, validation, explicit action, Cancel and Escape | Site sweep, all three engines |
| Shared | Choice question | Explicit action choices with safe cancellation | Site sweep, all three engines |
| Shared | Destructive confirmation | Warning and named destructive action, safe initial focus | Site sweep, all three engines |
| Shared | Save one document | Cancel, Don't Save and Save, retained draft on failure | Site sweep, all three engines; resource failure/recovery suite all three |
| Shared | Save several documents | Named scope and Save All, failure keeps window open | Site sweep, all three engines; individual save-failure paths covered by resource suites |
| File browser | Open a VFS file | Navigable browser, direct path, file-type validation | Resource suites, all three engines |
| File browser | Open from computer | Native selection, cancellation and size refusal | Dependency suite, all three; extension and per-field size refusal checked |
| File browser | Save As a new file | Destination selection and create-only commit | Resource suites, all three engines |
| File browser | Replace an existing file | Confirm the captured destination revision | Resource suites, all three engines |
| File browser | Download instead | Captured source and native download | Files sweep, all three engines |
| File browser | New Folder | Name validation and existing-name refusal | Files sweep, all three engines |
| File browser | Choose Folder | Directory selection with direct path entry | Files sweep, all three engines |
| File fields | Import a dependency | Explicit create-only import; cancellation before commit | Dependency suite all three; authority cancellation tested in home-store suite |
| Toolbar | Customize Editor/Docs | Available and selected lists, transfer controls and ordering | Content sweep all three; toolbar suite Chromium; focused visual/keyboard suite Firefox and WebKit |
| Toolbar | Customize Slides | Same command model, Slides choices | Content sweep all three; toolbar suite Chromium; focused visual/keyboard suite Firefox and WebKit |
| Toolbar | Customize Diagrams | Same command model, diagram choices | Content sweep all three; toolbar suite Chromium; focused visual/keyboard suite Firefox and WebKit |
| Site | About yavc.app | Addressable informational dialog and Close | Site sweep, all three engines |
| Site | About PUDL | Addressable informational dialog and Close | Site sweep, all three engines |
| Site | Launcher | Dialog-role launcher, filter, nested commands, taskbar state | Site sweep, all three engines; filter, title activation, narrow bounds and Escape |
| Site actions | Agent permission | Refuse, Allow Once and page grant, explicit operation scope | Site sweep, all three engines |
| PUDL actions | Generated agent questions | Supported field kinds, validation and cancellation | Site sweep, all three engines |
| Files | New File | Current folder and validated name | Files sweep, all three engines; commits and cancellation checked |
| Files | New Folder | Current folder and validated name | Files sweep, all three engines; commits and cancellation checked |
| Files | Rename | Current item and collision validation | Files sweep, all three engines; commits and cancellation checked |
| Files | Move | Directory chooser plus direct destination input | Files sweep, all three engines; commits and cancellation checked |
| Files | Delete | Named target and safe cancellation | Files sweep, all three engines; commits and cancellation checked |
| Editor | Properties | Stock and custom metadata, original tab and source ownership | Content sweep, all three engines |
| Editor | Document Zoom | Bounded numeric percent and forwarded validation | Content sweep, all three engines; bounds tested by document-view suites |
| Editor/Docs | Text Style in source | Parser-confirmed ordinary text, current style, removal, one undo step | Content and source/rich formatting suites, all three engines |
| Editor/Docs | Text Style in rich view | Current/mixed marks, collapsed typing marks and style preview | Content and source/rich formatting suites, all three engines |
| Editor/Docs | Text Color in source | Theme/default/custom selection, native picker and CSS validation | Content and source/rich formatting suites, all three engines |
| Editor/Docs | Text Color in rich view | Current/mixed marks and captured selection | Content and source/rich formatting suites, all three engines |
| Slides | Text Style in source | Deck and current-slide classes only | Content and source/rich formatting suites, all three engines |
| Slides | Text Style in rich view | Deck and current-slide classes only, current/mixed marks | Content and source/rich formatting suites, all three engines |
| Slides | Text Color in source | Shared color contract and slide ownership | Content and source/rich formatting suites, all three engines |
| Slides | Text Color in rich view | Shared color contract and selection ownership | Content and source/rich formatting suites, all three engines |
| Shared content | Insert or change Link in source | Captured source selection and URL validation | Content sweep, all three engines; source/rich cancellation in formatting suite |
| Shared content | Insert or change Link in rich view | Captured rich document and selection | Content sweep, all three engines; source/rich cancellation in formatting suite |
| Shared content | Insert Picture | Address, Browse/import, alt text, bounded width and caption | Content sweep, all three engines |
| Shared content | Change/remove Picture | Current values, original block and explicit removal | Block/picture sweep, all three engines; existing address and Remove checked |
| Shortcodes | Hosted Video | Service, identifier and preview-compatible address | Content sweep, all three engines |
| Shortcodes | Embedded Applet | Discoverable applet and parameter choices | Content sweep, all three engines |
| Shortcodes | Code Listing | File Browse/import, language and line options | Content sweep, all three engines |
| Shortcodes | Contents | Heading scope and depth validation | Content sweep, all three engines |
| Shortcodes | Status Label | Text and semantic status choice | Content sweep, all three engines |
| Shortcodes | Keys | Key labels and source escaping | Content sweep, all three engines |
| Shortcodes | Glyph | Searchable single-column list with glyph and name, no radio indicators | Picker fixture, all three engines; light/dark, narrow layout, search and keyboard insertion |
| Shortcodes | Page Link | Page selection and link text | Content sweep, all three engines |
| Shortcodes | Generated text parameter | Label, current value, escaped source and ownership | Content sweep, all three engines; custom-shortcode behavior suite all three |
| Shortcodes | Generated number parameter | Bounded value and visible enhanced-field validation | Content sweep, all three engines; visible invalid input and correction checked |
| Shortcodes | Generated select parameter | Current and unknown value retention, asynchronous catalog | Content sweep, all three engines |
| Shortcodes | Generated file parameter | Shared Browse/import and owning document lifetime | Content sweep, all three engines |
| Shortcodes | Block arguments | Information, Note, Tip, Warning, Expand and Style Class; original block retained | Block-argument sweep in Editor and Slides, all three engines |
| Shortcodes | Custom inline arguments | Captured definition, document and selection | Content sweep, all three engines; custom-shortcode behavior suite all three |
| Shortcodes | Custom container arguments | Body retained while opening arguments change | Content sweep, all three engines; custom-shortcode behavior suite all three |
| Shortcodes | Definition manager | Shared/local scope, add/change/remove, errors and Browse/import | Content sweep, all three engines; custom-shortcode behavior suite all three |
| Stylesheets | Document Stylesheet | Style block selection, CSS editor, shared file Browse/import | Styles and dependency suites, all three engines |
| Stylesheets | Slide Stylesheet | Whole-deck and slide-only blocks, source ownership | Styles and dependency suites, all three engines |
| Stylesheets | Shared Stylesheet editor | Original file and document checks before conditional update | Styles and dependency suites, all three engines |
| Document | Page Setup | Standard/custom paper, units, orientation and linked/separate margins | Content sweep and focused Page Setup suite, all three engines |
| Document | Typography | Body/heading controls, defaults, spacing and preview | Content sweep and focused Typography suite, all three engines |
| Document | Header and Footer | Six slots, fields, alignment and overflow | Content sweep and focused furniture suite, all three engines |
| Slides | Delete Slide | Named slide and safe cancellation | Content sweep, all three engines |
| Slides | Deck Colors | Labeled native color controls and theme defaults | Content sweep, all three engines |
| Slides | Slide Colors | Override scope and removal/default semantics | Content sweep, all three engines |
| Slides | Deck Stylesheet File | Direct CSS path and Browse/import | Content sweep, all three engines |
| Slides | Slide Classes | Available shared/deck/current-slide classes, custom names and empty-state guidance | Picker fixture, all three engines; scoped catalog, custom entries, removal, validation and stale cancellation |
| Slides | Background Picture | Direct URL/path and Browse/import | Content sweep, all three engines |
| Slides | Deck Properties | Metadata scope and original deck ownership | Content sweep, all three engines |
| Diagrams | Select Canvas Items | Searchable PUDL multi-select list, node/connector detail and selection count | Content sweep, all three engines; keyboard selection and hidden-selection retention checked |
| Diagrams | Connect to a Node | Readable target selection instead of memorized IDs | Content sweep, all three engines |
| Diagrams | Resize Shape | Separate dimensions and enhanced numeric validation | Content sweep, all three engines; invalid input, correction and committed dimensions checked |
| Diagrams | Reconnect Start | Shape/free point, automatic/explicit anchor and coordinates | Content sweep, all three engines |
| Diagrams | Reconnect End | Same contract for the opposite endpoint | Content sweep, all three engines |
| Diagrams | Move Into a Shape | Discoverable valid destinations and source ownership | Content sweep, all three engines |
| Diagrams | Shape Label | Original shape and source, one undo step | Content sweep, all three engines |
| Diagrams | Connection Label | Original connection and source, one undo step | Content sweep, all three engines |
| Diagrams | Rename Shape | Valid name and collision checks | Content sweep, all three engines |
| Settings | Forget State | Explicit destructive scope; files retained | Authored sweep, all three engines |
| Settings | Make Agent Token | Name and explicit permissions, no accidental creation | Authored sweep, all three engines |
| Settings | Revoke Token | Named token and safe cancellation | Site sweep, all three engines (synthetic token) |
| Terminal | Settings | Immediate text-size preference, explicit Done | Authored sweep, all three engines |
| Barcode Tool | Layout JSON | Textarea, associated announced errors and source focus | Authored sweep, all three engines; populated flow checked |
| Barcode Tool | Remove Layout | Named target and destructive confirmation | Authored sweep, all three engines; populated flow checked |
| Barcode Tool | Help | Structured informational content and Close | Authored sweep, all three engines |
| Barcode Scanner | Type/Paste | Textarea and format selection, Decode and Cancel | Authored sweep, all three engines |
| Barcode Scanner | Scan Details | Current capture, readable diagnostic content | Authored sweep, all three engines; populated flow checked |
| Barcode Scanner | Install | Navigation links and platform instructions | Authored sweep, all three engines |
| Barcode Scanner | Copy Fallback | Read-only selectable result and Close | Authored sweep, all three engines; synthetic clipboard denial |
| Sight Reader | Choose Music | Score choices and native MusicXML upload | Authored sweep, all three engines; filtering and enhanced-list Enter checked |
| Sight Reader | Options | Immediate instrument and practice preferences | Authored sweep, all three engines |
| Sight Reader | Read | Current score and part selection | Authored sweep, all three engines; populated flow checked |
| Sight Reader | Help | Structured reference content and Close | Authored sweep, all three engines |
| Asteroids | Help | Game keys remain inactive while the dialog is open | Authored sweep, all three engines |
| Asteroids | Scores | Readable table or empty state, Close and Escape | Authored sweep, all three engines; real empty state checked |
| Invaders | Help | Game keys remain inactive while the dialog is open | Authored sweep, all three engines |
| Invaders | Scores | Readable table or empty state, Close and Escape | Authored sweep, all three engines; real empty state checked |
| Sudoku | Help | Accessible title and structured reference content | Authored sweep, all three engines |
| Conway | Help | Structured reference content and Close | Authored sweep, all three engines |
| Conway | Share | Read-only address, navigation link and Copy action | Authored sweep, all three engines; populated flow checked |
| Dice | About | Instance-safe accessible name and Close | Authored sweep, all three engines |
| Diff | About | Informational content and Close | Authored sweep, all three engines |
| Theme Studio | About | Informational content and Close | Authored sweep, all three engines |

## Native browser boundaries

The native operating-system file picker, color picker and browser permission prompt cannot be restyled as PUDL controls. The review covers their invocation, keyboard-accessible fallback, cancellation, bounded input and late-result handling. It includes VFS uploads and dependencies, Slides PPTX input, Barcode Tool linked files, Theme Studio CSS files, Sight Reader MusicXML/MXL input, Scanner image/layout input and camera permission. Device camera hardware and every platform's native picker remain separate manual environments; synthetic permission stubs must be identified as such in the evidence.

Flashcards has no authored dialog. Its navigation commands still require menu-ownership review, and it shares the host's permission and file flows when those are used.
