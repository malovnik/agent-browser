<p align="center">
  <h1 align="center">agent-browser</h1>
  <p align="center">Первый текстовый браузер, созданный для AI-агентов</p>
</p>

<p align="center">
  <a href="#быстрый-старт">Быстрый старт</a> &bull;
  <a href="#зачем">Зачем</a> &bull;
  <a href="#интеграция">Интеграция</a> &bull;
  <a href="#справочник-инструментов">Инструменты</a> &bull;
  <a href="#архитектура">Архитектура</a>
</p>

<p align="center">
  <a href="../README.md">English</a> | <strong>Русский</strong>
</p>

---

## Проблема

Все AI-инструменты для браузера работают одинаково: делают скриншот, отправляют пиксели в LLM, надеются, что модель разберётся куда нажать. Это тратит тысячи токенов на визуальный шум, работает медленно и ломается на динамических страницах.

**agent-browser** использует принципиально другой подход. Он читает страницу так, как это делает скринридер — через дерево доступности (accessibility tree) — и возвращает семантический текстовый снимок с автоматически обнаруженными действиями. Без скриншотов. Без селекторов. Без скриптов.

## Чем отличается

| | agent-browser | Playwright MCP | Browser Use | Stagehand |
|---|---|---|---|---|
| Основной вход | Accessibility tree | Accessibility tree | Скриншоты | Скриншоты + HTML |
| Токенов на страницу | **~200-300** | ~1,500-3,000 | ~4,800+ | ~2,000+ |
| Обнаружение действий | Автогруппировка | Сырой список | Нет | AI-вывод |
| Классификация страниц | Встроенная | Нет | Нет | Нет |
| Diff страниц (только дельты) | Встроен | Нет | Нет | Нет |
| Фильтрация по намерению | Встроена (7 intent) | Нет | Нет | Нет |
| Многошаговые сценарии | Автоопределение, 1 вызов | Нет | Нет | Нет |
| Извлечение контента | 6 встроенных экстракторов | Нет | Нет | Нет |
| Язык | TypeScript | TypeScript | Python | TypeScript |

### Сравнение расхода токенов

| Сайт | agent-browser | Playwright MCP |
|------|--------------|----------------|
| Новостная статья | ~250 токенов | ~4,800 токенов |
| Поиск Google | ~180 токенов | ~3,200 токенов |
| Страница логина | ~150 токенов | ~2,100 токенов |

**В 17 раз меньше** расход контекстного окна.

## Ключевые возможности

### Семантическое обнаружение действий

Вместо плоского списка элементов agent-browser группирует их в осмысленные категории:

```
=== ACTIONS ===
[LOGIN FORM]
  fill(@e1) — Поле Email
  fill(@e2) — Поле Password
  click(@e3) — Кнопка Sign in

[SOCIAL SIGN-IN]
  click(@e4) — Войти через Google
  click(@e5) — Войти через Apple

[NAVIGATION]
  click(@e6) — Главная
  click(@e7) — О нас
  click(@e8) — Цены
```

### Предиктивный движок (Predictive Browsing Engine)

Четыре возможности, которых нет ни в одном конкурирующем инструменте:

1. **Page Diff** — После первого снимка получай только изменения. На ~80-90% меньше токенов.
2. **Intent Filtering** — Укажи цель (login, search, buy). Получи только релевантные элементы.
3. **Action Flows** — Автоопределение многошаговых сценариев (логин, поиск, оформление). Выполнение в 1 вызов.
4. **Smart Extraction** — Извлечение статей, ссылок, заголовков, изображений, таблиц, метаданных без селекторов.

## Быстрый старт

### Требования

- Node.js 18+
- Google Chrome или Chromium

### Установка

```bash
git clone https://github.com/malovnik/agent-browser.git
cd agent-browser
npm install
npm run build
```

### Подключение к AI-инструменту

Подробнее в разделе [Интеграция](#интеграция).

## Интеграция

agent-browser работает как [MCP](https://modelcontextprotocol.io/)-сервер через stdio. Любой MCP-совместимый клиент может подключиться.

### Claude Desktop

Отредактируй конфиг:

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "agent-browser": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/agent-browser/src/bin/cli.ts"]
    }
  }
}
```

С видимым окном браузера добавь `"--headed"` в конец массива `args`.

Перезапусти Claude Desktop после сохранения. 21 инструмент появится в меню инструментов (иконка молотка).

### Claude Code

```bash
claude mcp add --scope user agent-browser -- npx --prefix /path/to/agent-browser tsx src/bin/cli.ts
```

С видимым окном браузера:

```bash
claude mcp add --scope user agent-browser -- npx --prefix /path/to/agent-browser tsx src/bin/cli.ts --headed
```

### OpenClaw (ClawBot)

Добавь в `openclaw.json`:

```json
{
  "mcpServers": {
    "agent-browser": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/agent-browser/src/bin/cli.ts"],
      "transport": "stdio"
    }
  }
}
```

Или через CLI:

```bash
openclaw config set mcpServers.agent-browser.command "npx"
openclaw config set mcpServers.agent-browser.args '["tsx", "/absolute/path/to/agent-browser/src/bin/cli.ts"]'
```

### Cursor

Создай или отредактируй `~/.cursor/mcp.json` (глобальный) или `.cursor/mcp.json` (для проекта):

```json
{
  "mcpServers": {
    "agent-browser": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/agent-browser/src/bin/cli.ts"]
    }
  }
}
```

Или добавь через Cursor Settings > Tools & MCP > New MCP Server.

### VS Code Copilot (1.99+)

Создай `.vscode/mcp.json` в проекте:

```json
{
  "servers": {
    "agent-browser": {
      "type": "stdio",
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/agent-browser/src/bin/cli.ts"]
    }
  }
}
```

### Cline (VS Code)

Нажми иконку MCP Servers в панели Cline > Configure > "Configure MCP Servers" и добавь:

```json
{
  "mcpServers": {
    "agent-browser": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/agent-browser/src/bin/cli.ts"],
      "disabled": false
    }
  }
}
```

### Windsurf

Отредактируй `~/.codeium/windsurf/mcp_config.json` или открой через иконку MCPs > Configure в панели Cascade:

```json
{
  "mcpServers": {
    "agent-browser": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/agent-browser/src/bin/cli.ts"]
    }
  }
}
```

### Continue.dev

Создай JSON-конфиг `.continue/mcpServers/agent-browser.json` в рабочей директории:

```json
{
  "mcpServers": {
    "agent-browser": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/agent-browser/src/bin/cli.ts"]
    }
  }
}
```

Continue автоматически подхватывает JSON-конфиги из `.continue/mcpServers/`. MCP-инструменты доступны в режиме agent.

### Любой MCP-клиент

agent-browser общается через stdio по протоколу [Model Context Protocol](https://modelcontextprotocol.io/). Запусти сервер:

```bash
npx tsx src/bin/cli.ts
```

Подключи свой клиент к stdin/stdout этого процесса.

### Программное использование (Node.js / TypeScript)

```typescript
import { AgentBrowser } from "./src/index.js";

const browser = new AgentBrowser({ headless: true });
await browser.launch();

// Навигация и семантический снимок
const snapshot = await browser.navigate("https://example.com");
console.log(snapshot);

// Извлечение текста статьи
const article = await browser.extract("article_text");
console.log(article.data);

// Выполнение обнаруженного flow
const flows = await browser.getFlows();
const result = await browser.executeFlow("login", {
  email: "user@example.com",
  password: "secret",
});

await browser.close();
```

### Флаги командной строки

| Флаг | Описание |
|------|----------|
| `--headed` | Запуск с видимым окном браузера (по умолчанию: headless) |
| `--chrome-path=PATH` | Путь к исполняемому файлу Chrome/Chromium |
| `--user-data-dir=PATH` | Директория пользовательских данных Chrome (сохраняет сессии/куки) |
| `--help` | Показать справку |

## Справочник инструментов

### Базовые (15 инструментов)

| Инструмент | Описание |
|------------|----------|
| `navigate` | Перейти по URL, вернуть семантический снимок с действиями |
| `snapshot` | Текущее состояние страницы с обнаружением действий |
| `snapshot_compact` | Минимальный снимок (экономия токенов) |
| `click` | Кликнуть элемент по ref (например `@e1`) |
| `fill` | Ввести текст в поле по ref |
| `select` | Выбрать опцию в dropdown по ref |
| `scroll` | Прокрутить страницу вверх или вниз |
| `evaluate` | Выполнить JavaScript в браузере |
| `screenshot` | Сделать визуальный скриншот (используй редко) |
| `back` | Назад в истории |
| `forward` | Вперёд в истории |
| `tabs` | Список открытых вкладок |
| `new_tab` | Открыть новую вкладку |
| `switch_tab` | Переключиться на вкладку по ID |
| `close_tab` | Закрыть вкладку по ID |
| `close_browser` | Закрыть браузер |

### Предиктивный движок (6 инструментов)

| Инструмент | Описание |
|------------|----------|
| `snapshot_intent` | Снимок с фильтрацией по намерению: `login`, `search`, `read_content`, `fill_form`, `navigate`, `buy`, `extract_data` |
| `diff` | Только изменения с последнего снимка (нужен baseline) |
| `extract` | Извлечь контент: `article_text`, `links`, `headings`, `images`, `table_data`, `metadata` |
| `get_flows` | Обнаружить доступные многошаговые сценарии |
| `execute_flow` | Выполнить сценарий с параметрами (например `{email: "...", password: "..."}`) |

## Архитектура

```
src/
  bin/cli.ts               Точка входа CLI, парсинг флагов, запуск MCP-сервера
  browser/engine.ts        CDP-соединение через puppeteer-core, управление вкладками
  intelligence/
    analyzer.ts            Accessibility tree -> PageElement[]
    classifier.ts          Эвристическая классификация страниц (10 типов)
    actions.ts             Обнаружение семантических групп действий
    differ.ts              Движок diff состояний (дельта-снимки)
    intent.ts              Фильтрация по намерению агента (7 intent)
    flows.ts               Автоопределение многошаговых сценариев
    extractor.ts           Умное извлечение контента (6 целей)
  renderer/text.ts         PageState -> оптимизированный текст
  mcp/server.ts            MCP-сервер с 21 инструментом
  index.ts                 Главный класс AgentBrowser (публичный API)
  types.ts                 TypeScript-интерфейсы
```

### Как это работает

```
1. Chrome (CDP)
      |
2. Дерево доступности (Accessibility.getFullAXTree)
      |
3. DomAnalyzer -> PageElement[] (структурированные элементы)
      |
4. PageClassifier -> PageType (login, search, article, ...)
      |
5. ActionDiscoverer -> ActionGroup[] (LOGIN FORM, SEARCH, ...)
      |
6. TextRenderer -> Оптимизированный текст для LLM (~200-300 токенов)
```

### Почему TypeScript, а не Rust/Go

Мы оценили переписывание на Rust и Go. Вывод: **нет значимого выигрыша в производительности**.

- **95%+ времени выполнения** занимает I/O к Chrome через CDP (сетевые roundtrips). Это I/O-bound задача, где TypeScript не уступает Rust или Go.
- **puppeteer-core** — самая зрелая CDP-библиотека. Аналоги на Rust (chromiumoxide) и Go (chromedp) менее зрелы.
- **MCP SDK** нативно написан на TypeScript. Переписывание потребует поддержки биндингов протокола.
- Слой интеллекта (classifier, analyzer, differ) занимает <5% времени выполнения.
- TypeScript обеспечивает быстрые итерации, простые контрибуции и совместимость с MCP-экосистемой.

## Вклад в проект

Смотри [CONTRIBUTING.md](../CONTRIBUTING.md).

## Лицензия

[MIT](../LICENSE)
