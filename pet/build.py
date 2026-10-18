"""Assembles the pixel-pet web version into one page: pet/index.html.
Sources in pet/src: base.css (the diary's styles), pet.css (8-bit layer), body.html,
icons.js, engine.js, pet.js, diary.js (the diary's logic), tail.js (pixel widgets, screens, chat, voice)."""
import os
here = os.path.dirname(os.path.abspath(__file__))
src = lambda n: open(os.path.join(here, "src", n), encoding="utf-8").read()
head = ('<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover">'
        '<style>:root{color-scheme:light;box-sizing:border-box;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}'
        'html{scroll-padding-top:env(safe-area-inset-top,0px)}body{margin:0;padding:0;font:14px -apple-system,BlinkMacSystemFont,sans-serif;background:#fff;color:#000}'
        'img{max-width:100%}[hidden]:not([hidden=until-found i]){display:none!important}</style></head><body>\n')
page = (head
  + '<title>Пиксельный дневник</title>\n'
  + '<meta name="claude:viewport-fit-sides" content="cover">\n'
  + '<link rel="preconnect" href="https://fonts.googleapis.com">\n'
  + '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Handjet:wght@400;500;600;700&display=swap">\n'
  + '<style>\n' + src("base.css") + src("pet.css") + '</style>\n'
  + src("body.html")
  + '<script>\n' + "\n".join(src(n) for n in ["icons.js", "engine.js", "pet.js", "diary.js", "tail.js"]) + '</script>\n'
  + '</body></html>')
open(os.path.join(here, "index.html"), "w", encoding="utf-8").write(page)
print("ok", len(page))
