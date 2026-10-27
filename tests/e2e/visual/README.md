---
title: Visual test document
tags: [markdown, viewer]
---
# Visual test document

Plain text with **bold**, *italic*, ~~strike~~, `inline code` and a [link](notes/todo.md).

## Lists and tables

- [x] Finished task
- [ ] Open task with a footnote[^1]

| Name | Value | Note |
|:-----|------:|:----:|
| alpha | 1 | left |
| beta | 22 | right |

Emoji shortcodes: :tada: :+1: :rocket:

## Code

```ts
// Greets someone by name.
function greet(name: string): string {
  return `Hello, ${name}!`;
}
```

## Alerts

> [!NOTE]
> Useful information.

> [!TIP]
> Helpful advice.

> [!IMPORTANT]
> Key information.

> [!WARNING]
> Needs attention.

> [!CAUTION]
> Possible negative outcomes.

## Image

![shape](img/shape.svg)

[^1]: The footnote text.
