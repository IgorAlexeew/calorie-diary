import sys
src, dst = sys.argv[1], sys.argv[2]
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
assert "Claude" not in s.replace("claude.use","").replace("window.claude",""), [l for l in s.splitlines() if "Claude" in l][:5]
open(dst, "w", encoding="utf-8").write(s)
print("ok", len(s))
