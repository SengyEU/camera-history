UPDATE cameras
SET theme_colors = theme_colors - 'bg'
WHERE theme_colors IS NOT NULL;
