# Files Guide

[Files](/files) lets you browse yavc.app as folders and keep personal files in your browser. It shares those personal files with the site's Editor and Terminal. In the Windowed view, you can keep these applications open beside one another; in the Pages view, Files has its own page at `yavc.app/files`, and it also runs standalone at `files.yavc.app`.

## Your data and privacy

On yavc.app, your personal file contents are never sent to the site. Files keeps your personal files, folders, and its saved settings in your browser's local storage. The Upload command reads a file you choose from your computer into that local storage; it does not upload its contents to the site.

The site still retrieves the list of its pages and their text from the server when you browse them. The local-storage statement concerns the personal data you manage with Files; it does not mean the website makes no network requests.

Your files belong to this browser profile and to the address you made them at. The desktop at `yavc.app` and each application's own address, such as `files.yavc.app`, keep separate files, and another browser, profile, or device will not see them. Local storage normally survives closing the page or restarting the browser, but it is not a backup. Clearing the browser's site data for that address removes your files, along with the terminal's history and the preferences kept there, and losing the browser profile removes them too. Private browsing may discard them when the private session ends. Download files you want to keep outside the browser.

The Forget button in Settings removes only what the site keeps on the server, which is your appearance choices and each application's state. It does not touch your home directory. Accounts, and with them a home kept on the site, are planned.

## Get started

1. Open [Files](/files). It starts in `/site`, which contains the site's applications, pages and scripts.
2. Choose a folder in the tree on the left. Its contents appear in the list on the right, with their kinds and dates.
3. Select an entry to see its description and other details below the list. Double-click it or press Enter to open it.
4. Choose the home button, or **Files > Your home directory**, to go to `~`, your personal storage.
5. Choose **New file** or **New folder** to create something there. Select the new file and open it in the Editor to enter and save its contents.

## Find your way around

The path bar above the list shows the current folder. Choose a part of the path to return to it. The up button and **Files > Up one folder** move to the parent folder. The home button always returns to your personal directory. You can resize the divider between the tree and list.

| Location | Contents |
| --- | --- |
| `/site` | The site itself. These entries are read-only. |
| `/site/apps` | One entry per application, such as `sudoku`, `terminal`, `files` and `editor`. |
| `/site/pages` | The site's pages, such as `privacy`, `terms`, `author` and this guide. |
| `/site/bin` | The site's scripts. Today there is one, `hello`, which echoes a greeting. |
| `~` or `/home/guest` | Your personal files and folders in this browser. |
| `/bin` | Terminal commands. This folder is populated when the Terminal starts; opening a command displays its help in a terminal. |

The current folder is represented in the page address or window state. You can bookmark a browsing location, but a link to your personal folder does not transfer its contents to another person or device.

## Menus and opening entries

The **Files** menu and the surface **Actions** button offer operations that apply to the current selection and folder. Select an entry before looking for its commands. Commands that change personal files are absent for read-only site entries. The Files menu also contains folder navigation.

| Command | Behavior |
| --- | --- |
| Open folder | Enters the selected folder. |
| Open | Opens a page, in a window when using the Windowed view. |
| Launch | Starts the selected application. |
| Open link in a new tab | Opens the entry's external link. |
| Open in the editor or Edit | Opens a personal text file or script in the Editor. |
| View in the editor | Shows a page's source text in the Editor without changing the page. |
| Run in the terminal | Opens a terminal with the selected script or application command at its prompt. Review it and press Enter to run it. |
| Download | Saves a copy of the selected entry's content to your computer through the browser's download mechanism. It does not download an entire folder. |
| Copy to ~ | Copies a page's text into your personal home directory. |
| Open a terminal here | Opens a terminal at the folder currently shown in Files. |

**View > Files > Show hidden files** toggles names that begin with a dot, including `.config`. Files remembers this setting. The Files label is a section heading inside View.

**Help > Files** contains **Files quick help** and **Files guide**. Quick help opens a dialog with a link to this guide. Close the dialog with its Close button or Escape.

## Create, import, and organize personal files

Open your home directory or a folder inside it to use these operations.

| Command | Behavior |
| --- | --- |
| New file | Asks for a name, creates an empty text file, and selects it in the list. |
| New folder | Asks for a name and creates a folder in the current directory. |
| Upload | Lets you choose files from your computer and imports them into the current browser folder. You can also drop files onto the list. |
| Rename | Changes the selected entry's name after you confirm the new name. |
| Move to | Asks for a destination path for the selected entry. You can also drag a personal entry onto a writable folder. |
| Delete | Asks for confirmation before deleting the selected entry. Deleting a folder also deletes its contents. Deletion cannot be undone. |

Names cannot contain `/` or be `.` or `..`. A new file or folder cannot use a name already present in the destination. Read any error shown below the list before trying again. Some special files have fewer operations because another application manages them.

Your home directory accepts text files, such as notes, Markdown, JSON, CSV, and scripts, and pictures or other files of bytes. A text file is kept in the browser's local storage, with a per-file limit of 256 KB and a total of 2 MB for all of them, including storage overhead. A picture or any other file that is not text is kept in the browser's database instead, with a limit of 8 MB each, and does not count against the 2 MB. Uploads or saves that exceed these limits report an error. The Editor and the Terminal do not open a file of bytes; a picture opens in a tab of its own, and anything else downloads.

The Editor saves into the same personal filesystem that Files and Terminal use. Changes appear across open applications and other tabs at the same address. Download makes an independent copy on your computer; editing that downloaded copy does not automatically change the browser copy.

## Keyboard access

Use Tab to reach the toolbar, tree, list, and menu bar. Arrow keys move through the tree or list. With an entry selected in the list, Enter opens it. With focus on a list row, Backspace goes up a folder, F2 renames an eligible personal entry, and Delete asks before deleting an eligible personal entry. These file commands do not apply while you are typing in a dialog field.

The menu bar supports arrow-key navigation between titles and commands. Escape closes an open menu or dismisses a dialog.

## Troubleshooting and keeping copies

If a command is missing, select the entry it should act on and check whether you are in a writable folder. New file, New folder, and Upload are available in your personal home directory, not in `/site`.

If a file seems missing, check the folder path, enable Show hidden files if its name starts with a dot, and confirm that you are using the same browser profile and the same address where you saved it. A file saved on the desktop is not seen at `files.yavc.app`, and the other way round. Personal files do not synchronize across devices.

If a save fails, check the per-file and total storage limits. The browser can also refuse local storage. Download important files before deleting anything to make space. Files provides downloads of individual entries rather than a whole-home backup command.

If browser data has already been cleared, the site has no copy of your personal files to restore. Import a copy you previously downloaded using Upload.

For command-line access to the same folders, see the [Terminal Guide](/terminal-guide).
