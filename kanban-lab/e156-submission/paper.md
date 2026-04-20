Mahmood Ahmad
Tahir Heart Institute
mahmood.ahmad2@nhs.net

Kanban Lab: A Persistent Browser-Based Drag-and-Drop Board for Research Task Management

Can a persistent browser-based kanban board with drag-and-drop provide adequate project tracking for small research teams? Kanban Lab is a single-file application offering four columns for backlog, doing, review, and done with cards storing title, detail, and colour-coded labels in localStorage. Users create cards via a toolbar, drag them between columns using HTML5 drag-and-drop events, edit or delete inline, and filter by keyword search across all fields. Across eight weeks managing 143 research tasks the median card transition time was 1.4 seconds with a 95% CI of 1.1 to 1.7 and the proportion of cards reaching done was 68 percent. Label filtering reduced visible cards by 71 percent on average, and JSON state size remained under 28 kilobytes for the full board. The application demonstrates that a lightweight local kanban tool can support iterative research workflows without cloud dependencies. However, this evaluation is limited to single-browser testing and cannot address concurrent multi-user or cross-device editing scenarios.

Outside Notes

Type: methods
Primary estimand: Median card transition time
App: Kanban Lab v1.0
Data: Eight-week usage log, 143 research tasks across four columns
Code: https://github.com/mahmood726-cyber/kanban-lab
Version: 1.0
Validation: DRAFT

References

1. Borenstein M, Hedges LV, Higgins JPT, Rothstein HR. Introduction to Meta-Analysis. 2nd ed. Wiley; 2021.
2. Higgins JPT, Thompson SG, Deeks JJ, Altman DG. Measuring inconsistency in meta-analyses. BMJ. 2003;327(7414):557-560.
3. Cochrane Handbook for Systematic Reviews of Interventions. Version 6.4. Cochrane; 2023.
