# PDF export font

`files/noto-sans-jp-export.ttf` is the existing
`files/noto-sans-jp-japanese-400-normal.woff2` decoded to TrueType with FontTools.
Its glyph repertoire and font names are retained. The font uses the same
SIL Open Font License in `LICENSE`.

The decoded font is embedded without runtime subsetting so that PDF viewers
receive valid complete outlines, including Japanese glyphs.
