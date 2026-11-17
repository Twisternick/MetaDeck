---
name: web-design-guidelines
description: Review UI code for Web Interface Guidelines compliance. Use when asked to "review my UI", "check accessibility", "audit design", "review UX", or "check my site against best practices".
metadata:
  author: vercel
  version: "1.0.0"
  argument-hint: <file-or-pattern>
---

# Web Interface Guidelines

Review files for compliance with Web Interface Guidelines.

## How It Works

1. Read the rules in `RULES.md` next to this file
2. Read the specified files (or prompt user for files/pattern)
3. Check against all rules in `RULES.md`
4. Output findings in the terse `file:line` format

## Guidelines Source

The rules are pinned locally in `RULES.md`, vendored from vercel-labs/web-interface-guidelines `command.md` on 2026-11-16. Do not fetch them remotely; refresh the file by hand if needed.

MetaDeck note: the web client is vanilla JS + plain CSS, not React/Tailwind. Translate rules accordingly (e.g. `focus-visible:ring-*` means a `:focus-visible` style) and skip the Hydration Safety and `nuqs` items.

## Usage

When a user provides a file or pattern argument:
1. Read `RULES.md`
2. Read the specified files
3. Apply all rules from `RULES.md`
4. Output findings using the format specified in `RULES.md`

If no files specified, ask the user which files to review.
