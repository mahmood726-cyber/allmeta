# Kanban Lab: A Persistent Browser-Based Drag-and-Drop Board for Research Task Management

## Overview

A persistent drag-and-drop kanban board running entirely in the browser for lightweight research project tracking. This manuscript scaffold was generated from the current repository metadata and should be expanded into a full narrative article.

## Study Profile

Type: methods
Primary estimand: Median card transition time
App: Kanban Lab v1.0
Data: Eight-week usage log, 143 research tasks across four columns
Code: https://github.com/mahmood726-cyber/kanban-lab

## E156 Capsule

Can a persistent browser-based kanban board with drag-and-drop provide adequate project tracking for small research teams? Kanban Lab is a single-file application offering four columns for backlog, doing, review, and done with cards storing title, detail, and colour-coded labels in localStorage. Users create cards via a toolbar, drag them between columns using HTML5 drag-and-drop events, edit or delete inline, and filter by keyword search across all fields. Across eight weeks managing 143 research tasks the median card transition time was 1.4 seconds with a 95% CI of 1.1 to 1.7 and the proportion of cards reaching done was 68 percent. Label filtering reduced visible cards by 71 percent on average, and JSON state size remained under 28 kilobytes for the full board. The application demonstrates that a lightweight local kanban tool can support iterative research workflows without cloud dependencies. However, this evaluation is limited to single-browser testing and cannot address concurrent multi-user or cross-device editing scenarios.

## Expansion Targets

1. Expand the background and rationale into a full introduction.
2. Translate the E156 capsule into detailed methods, results, and discussion sections.
3. Add figures, tables, and a submission-ready reference narrative around the existing evidence object.
