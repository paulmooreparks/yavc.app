# Files Help

[Files](/files) shows yavc.app as folders and keeps your own files in your browser. The Editor and the Terminal see the same files. Files runs in a window on the desktop and on its own at `files.yavc.app`.

## Getting started

1. Open Files. It starts in `/site`, which holds the site's applications, pages, help and scripts.
2. Choose a folder in the tree on the left, and its contents appear in the list on the right with their kinds and dates.
3. Select an entry to see its description and details below the list, and double-click it or press Enter to open it.
4. Choose the Home button, or Go, Home, to go to `~`, your own folder.
5. Choose New File or New Folder to make something there. Open a new file in the Editor to write in it and save it.

## Finding your way around

The path bar above the list shows the current folder, and choosing a part of the path goes back to it. Up One Folder, on the toolbar and under Go, moves to the folder above, and Home always goes back to your own folder. The divider between the tree and the list can be dragged, and Files remembers where you left it.

| Folder | What it holds |
| --- | --- |
| `/site` | The site itself. Nothing here can be changed. |
| `/site/apps` | One entry for each application, such as `sudoku`, `terminal`, `files` and `editor`. |
| `/site/pages` | The site's pages, such as `privacy`, `terms` and `author`. |
| `/site/help` | The help pages, this one among them. |
| `/site/bin` | The site's scripts, such as `hello`, which prints a greeting. |
| `~` or `/home/guest` | Your own files and folders, kept in this browser. |
| `/bin` | The Terminal's commands. Opening one explains it in a terminal. |

The current folder is part of the page's address, or of the window's state on the desktop, so a folder can be bookmarked. A link to your own folder does not carry its contents to another person or device.

## Commands

The File menu holds every command, and the toolbar holds the same ones in groups. A command appears only where it applies, so select an entry before looking for the commands that act on it. Commands that change files appear only in your own folder.

| Command | What it does |
| --- | --- |
| Open Folder | Goes into the selected folder. |
| Open | Opens a page, in a window on the desktop. |
| Launch | Starts the selected application. |
| Open Link in a New Tab | Opens an entry that points to another site. |
| Open in the Editor, or Edit | Opens one of your text files or scripts in the Editor. |
| View in the Editor | Shows a page's text in the Editor, read-only. |
| Run in the Terminal | Opens a terminal with the selected script or application at its prompt, so you can read it before pressing Enter. |
| Download | Saves a copy of the selected file to your computer. A folder cannot be downloaded. |
| Copy to ~ | Copies a page's text into your own folder. |
| New Terminal Window Here | Opens a terminal in the folder Files is showing. |

View, Show Hidden Files shows and hides the names that begin with a dot, such as `.config`, and Files remembers the choice. Help, Files Help opens this page.

## Making and arranging your own files

These commands appear in your own folder and the folders inside it.

| Command | What it does |
| --- | --- |
| New File | Asks for a name, makes an empty text file and selects it. |
| New Folder | Asks for a name and makes a folder in the current one. |
| Upload | Reads files you choose from your computer into the current folder. Dropping files on the list does the same. |
| Rename | Asks for a new name for the selected entry. |
| Move To | Asks for the folder to move the selected entry to. Dragging one of your entries onto one of your folders does the same. |
| Delete | Asks before deleting the selected entry, and a folder goes with everything in it. A deletion cannot be undone. |

A name cannot contain `/` or be `.` or `..`, and it cannot be one that is already in the folder. Some special files, such as the settings in `~/.config`, offer fewer commands because another part of the site looks after them. When a command fails, a notice above the list says why.

## Storage and its limits

Your files never leave this browser. A text file, such as notes, Markdown, JSON, CSV or a script, is kept in the browser's local storage, with a limit of 256 KB for one file and 2 MB for all of them together. A picture or any other file that is not text is kept in the browser's database instead, with a limit of 8 MB each, and does not count towards the 2 MB. A save or an upload over these limits is refused with a notice. The Editor and the Terminal do not open a file that is not text; a picture opens in a tab of its own, and anything else downloads.

The files belong to this browser profile and to the address you made them at. The desktop at `yavc.app` and each application's own address, such as `files.yavc.app`, keep separate files, and another browser, profile or device does not see them. The settings in `~/.config` are the exception, because the site keeps them under your session and every address shares them. Local storage usually survives closing the page and restarting the browser, but it is no backup. Clearing the browser's data for the site removes your files, and a private window may lose them when it closes. Download any file you want to keep.

The Forget button in Settings removes what the site keeps for you on the server, which is your appearance, your settings and each application's state. It leaves the files in this browser alone.

## Keys

Tab moves between the toolbar, the tree, the list and the menu bar, and the arrow keys move through the tree or the list. In the list, Enter opens the selected entry and Backspace goes up a folder. F2 renames one of your entries, and Delete asks before deleting it. These keys do nothing while you are typing in a dialog.

A right-click on an entry gives the commands for it. On a folder in the tree it gives Open and the commands for making things there, and on the list itself it gives the commands for the folder. Escape closes a menu or a dialog.

## When something seems wrong

If a command is missing, select the entry it should act on and check that you are in your own folder; New File, New Folder and Upload appear only there. If a file seems to be missing, check the path, turn on Show Hidden Files if its name starts with a dot, and make sure you are in the same browser profile and at the same address where you saved it. If a save fails, the limits above are the likely reason, and downloading and then deleting large files makes room. If the browser's data has been cleared, the site has no copy of your files to bring back, and a copy you downloaded earlier can be uploaded again.

[Terminal Help](/help/terminal) explains how to reach the same folders from the command line.
