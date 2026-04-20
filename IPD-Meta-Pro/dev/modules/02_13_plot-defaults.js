const PlotDefaults = {

  // Forest plots: wide labels on left, CI text on right

  forest: function() { return { top: 40, right: 120, bottom: 40, left: 150 }; },

  // Forest with extra label room

  forestWide: function() { return { top: 40, right: 100, bottom: 40, left: 150 }; },

  // Forest with large labels (e.g. cumulative, detailed)

  forestLarge: function() { return { top: 40, right: 150, bottom: 40, left: 150 }; },

  // Standard scatter/funnel/bubble

  standard: function() { return { top: 30, right: 30, bottom: 50, left: 60 }; },

  // Standard with extra bottom for axis labels

  standardDeep: function() { return { top: 30, right: 30, bottom: 60, left: 60 }; },

  // Compact small plots (thumbnails, mini diagnostics)

  compact: function() { return { top: 20, right: 20, bottom: 40, left: 50 }; },

  // Very compact

  mini: function() { return { top: 20, right: 20, bottom: 30, left: 40 }; },

  // Medium plots with moderate padding

  medium: function() { return { top: 40, right: 40, bottom: 60, left: 70 }; },

  // Medium with right space for legend

  mediumLegend: function() { return { top: 40, right: 40, bottom: 50, left: 70 }; },

  // Medium standard

  mediumStd: function() { return { top: 40, right: 40, bottom: 50, left: 60 }; },

  // Large label plots (e.g. study-level with long names)

  largeLabel: function() { return { top: 60, right: 120, bottom: 60, left: 200 }; },

  // Wide left margin for labels, right for legend

  wideLabel: function() { return { top: 40, right: 100, bottom: 60, left: 200 }; },

  // Left-heavy with axis text

  leftLabel: function() { return { top: 30, right: 40, bottom: 60, left: 200 }; },

  // Moderate with more headroom

  headroom: function() { return { top: 50, right: 50, bottom: 60, left: 70 }; },

  // Headroom with right legend space

  headroomLegend: function() { return { top: 50, right: 100, bottom: 60, left: 70 }; },

  // Network/horizontal bar

  horizontal: function() { return { top: 30, right: 60, bottom: 20, left: 120 }; },

  // Right-labeled

  rightInfo: function() { return { top: 30, right: 100, bottom: 40, left: 150 }; }

 };

 window.PlotDefaults = PlotDefaults;



 