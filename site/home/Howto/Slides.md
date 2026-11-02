# Notes for a talk

These notes are a sample to change, and they show the shape a deck takes. The deck beside them, `Slides.slides.md`, is a real one: open it in Slides, change it and present it. The instructions for Slides are in [Slides Help](/help/slides), which is also under Help, Slides Help.

## The shape of a deck

A deck is a Markdown file whose name ends in `.slides.md`. Front matter at the top sets the title, the theme and the size, and a line of three dashes divides one slide from the next.

```
---
title: My talk
theme: plain
size: 16:9
---

{{slide:layout=title}}
# My talk
## Why it matters

---

## The first point

- One thing
- Another thing

{{notes}}
What I will say about it.
{{/notes}}
```

## Things to try

1. Copy the example above into a new file named `talk.slides.md` in `~/Documents`.
2. Open it in Slides, and change a slide on its canvas.
3. Choose Show, Present from the Start, and press Escape to come back.
4. Choose File, Download as PowerPoint to take the deck somewhere else.
