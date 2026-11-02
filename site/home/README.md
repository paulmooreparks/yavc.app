# Your home folder

Everything under `~` is yours. It lives in this browser's storage, under this address, and nowhere else: the site never sees it, and clearing the browser's site data erases it, so download anything you want to keep. The rest of the site is read-only.

## What is here

- `Howto/` holds the guides: a slide deck about Slides you can open and present, and longer notes on the Editor and on Slides. Open them in the Editor or in Slides, or read them in the Terminal with `cat`.
- `Documents/` is for what you write. Slides and the Editor start their Save As dialogs here.
- `bin/` holds your scripts. `hello` is a first one to copy; scripts here run by name in the Terminal.
- `glider.cells` is a pattern for Conway's Game of Life and `puzzle.sudoku` a puzzle for Sudoku.

## Some things to try

In the Terminal:

```
edit glider.cells
conway glider.cells
sudoku puzzle.sudoku
cat Howto/Slides.md
ls /site/apps
hello
```

`man edit` lists the Editor's keys, and `help` lists every command. The site keeps this folder's stock files up to date: a guide that changes on the site replaces your copy only while your copy is still as it came, and a file you delete stays deleted.
