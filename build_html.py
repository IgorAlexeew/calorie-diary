"""Patches a diary page for the app: build_html.py SRC DST [--pet].
Classic: the artifact's HTML -> assets/index.html. Pixel (--pet): pet/index.html -> build/pet-assets/index.html (run by Gradle and build.sh)."""
import os, sys
src, dst = sys.argv[1], sys.argv[2]
pet = "--pet" in sys.argv[3:]
s = open(src, encoding="utf-8").read()
def rep(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, (old, n)
    s = s.replace(old, new)
rep('<head>', '<head><script src="native.js"></script>')
rep('    default: return "Не удалось связаться с Claude. Попробуй ещё раз.";',
    '''    case "no_key": return "Добавь ключ odirouter в настройках (шестерёнка вверху).";
    case "auth": return "Ключ odirouter не подошёл. Проверь его в настройках.";
    case "no_credit": return "На балансе odirouter не хватает средств.";
    case "bad_model": return "Модель не найдена. Выбери другую в настройках." + (e.message ? " (" + e.message + ")" : "");
    case "network": return "Нет связи с odirouter. Проверь интернет и попробуй ещё раз.";
    case "http": return "odirouter ответил ошибкой: " + (e.message || "без описания");
    default: return "Не удалось связаться с ИИ. Попробуй ещё раз.";''')
rep('"Странице не разрешено обращаться к Claude. Разреши доступ в меню разрешений этой страницы."', '"Нет доступа к ИИ. Проверь настройки."')
rep('"Нужно заново войти в Claude."', '"Проверь ключ в настройках."')
rep('"Claude не стал отвечать на это описание. Переформулируй."', '"ИИ не стал отвечать на это описание. Переформулируй."')
rep('Claude пересчитает запись', 'ИИ пересчитает запись')
rep('"Claude пересчитывает запись, обычно это 5–30 секунд."', '"Пересчитываю запись, обычно это 5–30 секунд."')
rep('"Claude думает"', '"ИИ думает"', 3)
rep('"Эта функция работает только внутри Claude."', '"Не удалось открыть хранилище на телефоне."')
rep('"Чат работает только внутри Claude."', '"Не удалось открыть хранилище на телефоне."')
rep('"Оценка калорий недоступна в этом окне. Открой дневник в Claude."', '"Оценка калорий недоступна."')
rep('"Записи хранятся в Claude. Открой этот дневник по ссылке из Claude, войдя в свой аккаунт."', '"Не удалось открыть хранилище на телефоне. Перезапусти приложение."')
# today's totals for reminders and the widget; a way to jump back to today
rep('function render(){\n',
    'function render(){\n  if (window.__pushToday) try { const te = (days[todayKey()] && days[todayKey()].entries) || []; window.__pushToday({date: todayKey(), eaten: totals(te), target: targets(todayKey()), meals: [0,1,2,3].map(m => te.some(e => (+e.meal||0) === m))}); } catch (e) {}\n')
rep('render();\n\n(async () => {',
    'window.__goToday = () => { if (cur !== todayKey()){ cur = todayKey(); render(); renderChat(); } };\nrender();\n\n(async () => {')
if pet:
    # Handjet from the APK (flavors/pet/assets/fonts) instead of Google Fonts, so the pet looks right offline
    rep('<link rel="preconnect" href="https://fonts.googleapis.com">\n', '')
    rep('<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Handjet:wght@400;500;600;700&display=swap">\n',
        '<style>\n'
        '@font-face{font-family:"Handjet";font-weight:100 900;font-display:swap;src:url(fonts/handjet-cyrillic.woff2) format("woff2");unicode-range:U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116}\n'
        '@font-face{font-family:"Handjet";font-weight:100 900;font-display:swap;src:url(fonts/handjet-latin.woff2) format("woff2");unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD}\n'
        '</style>\n')
assert "Claude" not in s.replace("claude.use","").replace("window.claude",""), [l for l in s.splitlines() if "Claude" in l][:5]
os.makedirs(os.path.dirname(os.path.abspath(dst)), exist_ok=True)
open(dst, "w", encoding="utf-8").write(s)
print("ok", len(s))
