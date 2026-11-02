# Your home folder

Everything under `~` is yours. It lives in this browser's storage, under this address, and nowhere else: the site never sees it, and clearing the browser's site data erases it, so download anything you want to keep. The rest of the site is read-only.

## What is here

- `Howto/` holds samples to open and change: a slide deck about Slides that you can present, a document for the Editor, and notes for a talk. Each one links to its application's help page, and Help, Help Contents lists them all.
- `Documents/` is for what you write. Slides and the Editor start their Save As dialogs here.
- `bin/` holds your scripts. `hello` is a first one to copy; scripts here run by name in the Terminal.
- `glider.cells` is a pattern for Conway's Game of Life and `puzzle.sudoku` a puzzle for Sudoku.

## Some things to try

In the Terminal:

```
edit glider.cells
conway glider.cells
sudoku puzzle.sudoku
ls /site/help
guide
hello
```

`man edit` lists the editor's keys, `help` lists every command, and `guide` reads the Terminal's help a screen at a time. The site keeps this folder's stock files up to date: a guide that changes on the site replaces your copy only while your copy is still as it came, and a file you delete stays deleted.
