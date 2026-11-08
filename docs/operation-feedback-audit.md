# Operation feedback audit

Paul requested this audit on 2026-11-08 after a refused Docs file open inserted a dismissible banner above the active document. The audit covers authored applets and the shared site shell. Imported third-party packages retain their own interaction contracts.

## Transient operation failures

These failures now use `yavcUtil.toast`, backed by PUDL's toast component. The message expires automatically and does not participate in document layout. If the optional component cannot load in a receiving host, the shared dialog presents the escaped message instead.

| Location | Operations covered |
| --- | --- |
| Docs and Editor | Unsupported opens, file/import/export failures, refused commands and save failures |
| Slides | File picker/open, import/export/save and print failures |
| Diagrams | File picker/open, save/export and other command failures previously reported as ordinary errors |
| Files | Unsupported opening, unavailable handlers, file operations and blocked picture windows |
| Launcher | Preference load/save failures |
| Taskbar | Pin-save, preference-load and application-activation failures |
| Toolbar customization | Failed preference saves |
| Settings | Failed Forget Data and token-revoke operations |

Slides previously allowed a rejected file-picker promise to reach PUDL's command dispatcher without visible feedback. Its Open command now reports that refusal through the same toast helper.

## Persistent contextual messages

These messages remain inline because they describe unresolved content or a field the person can correct. The generic notice helper is unchanged.

| Location | Persistent condition |
| --- | --- |
| Docs and Editor | Authored stylesheet/page-setting problems, external file changes, invalid key bindings and unavailable language assistance |
| Slides and Diagrams | Recovery conflicts, source diagnostics, stale rendering and unavailable language assistance |
| Shared diagram renderer | Parse failures and unsupported diagram dependencies |
| Site filesystem | Retained divergent file records from another browser tab |
| Toolbar and taskbar | Unavailable toolbar preferences or an unsupported taskbar preference version |
| Shared dialogs and file browser | Validation, stale-target errors, failed dependency selection and file-picker errors inside the open dialog |
| Settings | Token creation input errors beside the token form |

Terminal reports command output and failures in its transcript. It does not use the document-banner mechanism.

## Verification

The operation-feedback fixture opens an unsupported Go file from Docs' Files pane and verifies unchanged document tabs, content and pane geometry. It checks automatic toast expiry, simulated Slides/Diagrams picker failures, taskbar activation failure without header displacement, retained contextual warnings and an escaped dialog fallback when the toast component is blocked. The fixture passes Chromium, Firefox and WebKit.
