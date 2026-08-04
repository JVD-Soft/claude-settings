# claude-settings

Внутренний маркетплейс плагинов Claude Code для проектов JVD-Soft.

Существует по одной причине: агентная конфигурация была скопирована побайтово
в каждый репозиторий и расходилась молча. Цена уже была уплачена — миграцию
фронтенда на TypeScript сделали дважды, независимо, разными коммитами. Здесь
общий слой живёт в одном месте и версионируется.

## Что внутри

`plugins/jvd-frontend` — для стека Laravel + React/Vite:

| | |
|---|---|
| `skills/scaffold` | Поднимает фронтенд проекта до базовой линии стека: харнес Vitest, error boundaries, safeStorage, SEO и пререндер, PWA, заголовки nginx, CI, цели Makefile. ~35 файлов и 8 слияний одной командой. Режим `--brand` переименовывает форк. |
| `commands/new-project` | Порядок заведения нового проекта: форк `base_setup` → `--brand` → бэкенд-слоты → `make init` → `make check`. |
| `hooks/detect-setup.mjs` | `SessionStart`: говорит, чего из базовой линии не хватает. Молчит, когда всё на месте. |
| `hooks/guard-read.mjs` | `PreToolUse`: не даёт прочитать сборку, зависимости, лок-файлы и бинарники целиком. 49 самотестов. |
| `hooks/format-changed.mjs` | `PostToolUse`: `eslint --fix` на один изменённый файл. Раньше это была просьба к агенту не забыть. |
| `agents/jvd-frontend-reviewer` | Ревью изменения против конвенций стека. |
| `agents/jvd-a11y-auditor` | То, что линтер структурно не видит: доступные имена, фокус, лендмарки. |
| `agents/jvd-test-writer` | Тесты по конвенциям харнеса Vitest + RTL. |
| `agents/jvd-prerender-doctor` | Разбор упавшего или пустого пререндера. |
| `commands/` | `/check`, `/verify-hooks`, `/sync-from-template`. |
| `skills/` | `react-data-fetching`, `shadcn-ui-components`, `forms-validation`, `i18n-translations`. |
| `.mcp.json` | `context7` (документация вместо памяти модели) и `shadcn`. |

**Префикс `jvd-` у агентов обязателен.** Плагинные агенты — самый низкий из
пяти уровней приоритета: одноимённый файл в `.claude/agents/` проекта молча
перекрывает плагинный, без ошибки и без следа. `scripts/validate-plugins.mjs`
падает на агенте без префикса.

**Только фронтенд.** Бэкендный скил `laravel-api-endpoint` остаётся в каждом
проекте — он описывает конкретный Laravel, а не общий стек.

## Подключение в проекте

Репозиторий приватный, поэтому Claude Code клонирует его вашими git-креденшелами.
Убедитесь, что `git clone https://github.com/JVD-Soft/claude-settings.git`
проходит без запроса пароля (Git Credential Manager на Windows или `gh auth login`).

В `.claude/settings.json` проекта:

```json
{
  "extraKnownMarketplaces": {
    "jvd-soft": {
      "source": { "source": "github", "repo": "JVD-Soft/claude-settings" }
    }
  },
  "enabledPlugins": { "jvd-frontend@jvd-soft": true }
}
```

Оба ключа — объекты, не массивы. Имя маркетплейса (`jvd-soft`) должно
совпадать с `name` в `.claude-plugin/marketplace.json`, иначе ссылка
`jvd-frontend@jvd-soft` никуда не ведёт.

Проверить: `/plugin` показывает маркетплейс и включённый плагин, скилы видны
под неймспейсом `jvd-frontend:`, `/mcp` — оба сервера.

**Режим отказа тихий.** Если репозиторий недоступен, плагина просто нет —
агент ведёт себя как со старым конфигом, без ошибки. Если хук перестал
срабатывать или пропали MCP-серверы, начните с проверки доступа.

## Настройка под проект

Восемь значений (`APP_NAME`, `APP_SHORT_NAME`, `APP_DESCRIPTION`, `SITE_URL`,
`LANG`, `THEME_COLOR_LIGHT`, `THEME_COLOR_DARK`, `PWA_CATEGORIES`) объявлены
в `userConfig` плагина. Claude Code спрашивает их при включении и отдаёт
скаффолдеру через `CLAUDE_PLUGIN_OPTION_*` — редактировать шаблон под проект
не нужно. Стек один, проекты разные: это ровно та граница между ними.

## Новый проект

Форк `base_setup`, а не пустой репозиторий: файлы, которые ставит скаффолдер,
импортируют `@/api/apiClient`, `@/components/ui`, `@/lib/utils`,
`@/providers/ThemeProvider` и `@/routes` — ничего из этого он не поставляет.
На голом `yarn create vite` `yarn typecheck` падает сразу.

Порядок — в `/jvd-frontend:new-project`. Ключевой шаг, который иначе теряется:
**форк надо переименовать**. Восемь значений `userConfig` бьют в файлы, которые
в форке уже существуют (`index.html`, `app.html`, `vite.config.ts` — seeded,
`config/index.ts` — starter), поэтому обычный прогон их не трогает, и проект
уезжает в прод с `<title>App</title>`. Это делает `--brand`; `SessionStart`
напоминает, если забыли.

## Что сюда НЕ переносится

Роутеры (`AGENTS.md` и вложенные), `docs/context-map.md`, ADR проекта и
доменные скилы вроде `laravel-api-endpoint` остаются в проектах. Каждый из них
описывает одну конкретную кодовую базу; общий шаблон таких файлов означал бы,
что в одном из проектов документация врёт.

## Разработка

```bash
node scripts/validate-plugins.mjs
node plugins/jvd-frontend/hooks/guard-read.test.mjs
node plugins/jvd-frontend/skills/scaffold/scripts/scaffold.test.mjs
```

Эти три гоняет CI. `validate-plugins.mjs` существует потому, что структурные
ошибки плагина тихие: сломанный frontmatter не даёт ошибки — скил грузится с
пустыми метаданными и просто перестаёт активироваться сам.

```bash
claude --plugin-dir ./plugins/jvd-frontend
```

`--plugin-dir` перебивает установленную версию на одну сессию. После правок —
`/reload-plugins`.

Версия в `plugin.json` определяет, когда пользователи получат обновление:
поднимайте её осознанно. Без версии считается коммит, и каждый коммит — новая
версия.
