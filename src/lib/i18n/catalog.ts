import type { InterfaceLanguage } from './core';

export type Translations = Record<InterfaceLanguage, string>;
export const catalog: Record<string, Translations> = Object.create(null);

// English and Ukrainian sources are aliases so older UI components share one catalog.
const rows = String.raw`
TTS settings were saved, but backend profiles could not be saved locally.|Налаштування озвучення збережено, але профілі способів озвучення не вдалося зберегти локально.|Настройки озвучивания сохранены, но профили способов озвучивания не удалось сохранить локально.
AI settings|Налаштування ШІ|Настройки ИИ
AI modules|Модулі ШІ|Модули ИИ
Provider source|Джерело провайдерів|Источник провайдеров
Reasoning|Мислення|Мышление
Text-to-speech|Озвучення тексту|Озвучивание текста
Cloud providers|Хмарні провайдери|Облачные провайдеры
Fetch models to list the Windows speech recognizers installed on this PC. Install a speech language pack if no recognizers are available.|Натисніть «Отримати моделі», щоб побачити встановлені на цьому ПК рушії розпізнавання Windows. Якщо їх немає, встановіть мовний пакет розпізнавання.|Нажмите «Получить модели», чтобы увидеть установленные на этом ПК движки распознавания Windows. Если их нет, установите языковой пакет распознавания.
Save to activate this text-to-speech backend.|Збережіть, щоб увімкнути цей спосіб озвучення.|Сохраните, чтобы включить этот способ озвучивания.
Piper voice model (.onnx)|Модель голосу Piper (.onnx)|Модель голоса Piper (.onnx)
Local Piper needs an installed executable and an ONNX voice model. Whisper and Nemotron recognize speech; they do not generate voices.|Локальному Piper потрібні встановлена програма та ONNX-модель голосу. Whisper і Nemotron розпізнають мовлення; вони не створюють голос.|Локальному Piper нужны установленная программа и ONNX-модель голоса. Whisper и Nemotron распознают речь; они не создают голос.
GGUF ASR queue is full (maximum 8 recordings); use another STT provider or a smaller model|Черга GGUF ASR заповнена (максимум 8 записів); використайте інший STT або меншу модель|Очередь GGUF ASR заполнена (максимум 8 записей); используйте другой STT или меньшую модель
GGUF ASR queue wait exceeded the 90-second request deadline|Очікування в черзі GGUF ASR перевищило 90-секундний ліміт запиту|Ожидание в очереди GGUF ASR превысило 90-секундный лимит запроса
ASR native library|Нативна бібліотека ASR|Нативная библиотека ASR
ASR native library (transcribe.dll)|Нативна бібліотека ASR (transcribe.dll)|Нативная библиотека ASR (transcribe.dll)
The CPU engine downloader installs verified official llama.cpp (about 20 MB), whisper.cpp (about 9 MB) or transcribe.cpp (about 18 MB) releases. GGUF ASR runs in an isolated native worker. Model downloads are separate; check their size and license first.|Завантажувач CPU-рушіїв установлює перевірені офіційні випуски llama.cpp (близько 20 МБ), whisper.cpp (близько 9 МБ) або transcribe.cpp (близько 18 МБ). GGUF ASR працює в окремому нативному процесі. Моделі завантажуються окремо; перевірте їхній розмір і ліцензію.|Загрузчик CPU-движков устанавливает проверенные официальные выпуски llama.cpp (около 20 МБ), whisper.cpp (около 9 МБ) или transcribe.cpp (около 18 МБ). GGUF ASR работает в отдельном нативном процессе. Модели загружаются отдельно; проверьте их размер и лицензию.
No offline Windows speech recognizer is installed. Install a Windows speech language pack or select local Whisper / GGUF ASR.|Офлайн-рушій розпізнавання мовлення Windows не встановлено. Встановіть мовний пакет розпізнавання Windows або виберіть локальний Whisper / GGUF ASR.|Офлайн-движок распознавания речи Windows не установлен. Установите языковой пакет распознавания Windows или выберите локальный Whisper / GGUF ASR.
Windows offline speech runtime is unavailable. Install a Windows speech language pack or select local Whisper / GGUF ASR.|Системне офлайн-розпізнавання Windows недоступне. Встановіть мовний пакет розпізнавання Windows або виберіть локальний Whisper / GGUF ASR.|Системное офлайн-распознавание Windows недоступно. Установите языковой пакет распознавания Windows или выберите локальный Whisper / GGUF ASR.
Windows speech language discovery timed out after 45 seconds|Час пошуку мов розпізнавання Windows перевищив 45 секунд|Время поиска языков распознавания Windows превысило 45 секунд
GGUF speech recognition (transcribe.cpp)|Розпізнавання мовлення GGUF (transcribe.cpp)|Распознавание речи GGUF (transcribe.cpp)
ASR GGUF models require a compatible speech engine. transcribe.cpp v0.4.0 supports Nemotron 3.5 ASR and other explicitly supported ASR families; a brain GGUF is incompatible. Fluely transcribes completed speech segments in an isolated CPU worker.|Моделі ASR GGUF потребують сумісного мовленнєвого рушія. transcribe.cpp v0.4.0 підтримує Nemotron 3.5 ASR та інші явно підтримувані сімейства ASR; GGUF моделі мислення несумісні. Fluely транскрибує завершені сегменти мовлення в окремому CPU-процесі.|Модели ASR GGUF требуют совместимого речевого движка. transcribe.cpp v0.4.0 поддерживает Nemotron 3.5 ASR и другие явно поддерживаемые семейства ASR; GGUF модели мышления несовместимы. Fluely транскрибирует завершённые сегменты речи в отдельном CPU-процессе.
Recommended: Nemotron 3.5 ASR Streaming 0.6B Q4_K_M (496 MB, OpenMDW 1.1). Supports Ukrainian, Russian, English and other listed languages. The official native CPU engine download is about 18 MB.|Рекомендовано: Nemotron 3.5 ASR Streaming 0.6B Q4_K_M (496 МБ, OpenMDW 1.1). Підтримує українську, російську, англійську та інші зазначені мови. Офіційний нативний CPU-рушій займає близько 18 МБ.|Рекомендовано: Nemotron 3.5 ASR Streaming 0.6B Q4_K_M (496 МБ, OpenMDW 1.1). Поддерживает украинский, русский, английский и другие указанные языки. Официальный нативный CPU-движок занимает около 18 МБ.
Ordinary actions are unavailable during Sleep mode.|Звичайні дії недоступні в режимі сну.|Обычные действия недоступны в режиме сна.
Request cancelled by Sleep mode transition.|Запит скасовано через перемикання режиму сну.|Запрос отменён из-за переключения режима сна.
Pixel representation is empty|Піксельне представлення порожнє|Пиксельное представление пусто
Refresh providers|Оновити провайдерів|Обновить провайдеров
Saving failed and the previous API key could not be restored. Check the account key before retrying.|Збереження не вдалося, попередній API-ключ не відновлено. Перевірте ключ облікового запису перед повторною спробою.|Сохранение не удалось, предыдущий API-ключ не восстановлен. Проверьте ключ учётной записи перед повторной попыткой.
Model list request failed ({status})|Не вдалося отримати моделі ({status})|Не удалось получить модели ({status})
Sleep mode · system audio only|Режим сну · лише звук системи|Режим сна · только звук системы
Sleep settings saved|Налаштування сну збережено|Настройки сна сохранены
Alarm playing through {device}|Сигнал відтворюється через {device}|Сигнал воспроизводится через {device}
Sleep mode|Режим сну|Режим сна
The crescent button stops screen capture, microphone and ordinary actions. System audio continues through STT and AI. An exact alarm code in the AI response plays your track on the selected output.|Кнопка півмісяця зупиняє знімки, мікрофон і звичайні дії. Звук системи продовжує проходити через STT та ШІ. Точний код сигналу у відповіді ШІ запускає ваш трек на вибраному виході.|Кнопка полумесяца останавливает снимки, микрофон и обычные действия. Звук системы продолжает проходить через STT и ИИ. Точный код сигнала в ответе ИИ запускает ваш трек на выбранном выходе.
Retry|Повторити|Повторить
Sleep prompt|Інструкція режиму сну|Инструкция режима сна
Alarm code|Код сигналу|Код сигнала
Alarm track|Трек сигналу|Трек сигнала
Choose a WAV, MP3, OGG or FLAC track|Виберіть трек WAV, MP3, OGG або FLAC|Выберите трек WAV, MP3, OGG или FLAC
Choose track|Вибрати трек|Выбрать трек
Alarm output device|Пристрій виведення сигналу|Устройство вывода сигнала
System default output|Стандартний системний вихід|Стандартный системный выход
Selected output is unavailable|Вибраний вихід недоступний|Выбранный выход недоступен
An unavailable selected output raises an error instead of playing through a different device.|Якщо вибраний вихід недоступний, програма повідомляє про помилку, не відтворюючи сигнал через інший пристрій.|Если выбранный выход недоступен, программа сообщает об ошибке, не воспроизводя сигнал через другое устройство.
Alarm volume|Гучність сигналу|Громкость сигнала
Test alarm|Перевірити сигнал|Проверить сигнал
Alarm stopped|Сигнал зупинено|Сигнал остановлен
Stop alarm|Зупинити сигнал|Остановить сигнал
Refresh outputs|Оновити виходи|Обновить выходы
Screen vision method|Метод зору екрана|Метод зрения экрана
Screenshot → visual model → text reasoning|Знімок → візуальна модель → текстове мислення|Снимок → визуальная модель → текстовое мышление
Pixel-to-text (experimental, local CPU)|Пікселі в текст (експериментально, локальний CPU)|Пиксели в текст (экспериментально, локальный CPU)
An independent image-capable model describes changed screenshots. The reasoning model receives its text observations.|Окрема модель із підтримкою зображень описує змінені знімки. Модель мислення отримує її текстові спостереження.|Отдельная модель с поддержкой изображений описывает изменённые снимки. Модель мышления получает её текстовые наблюдения.
Vision model|Модель зору|Модель зрения
Automatic: available image-capable models by rank|Автоматично: доступні моделі зображень за пріоритетом|Автоматически: доступные модели изображений по приоритету
Selected model is unavailable|Вибрана модель недоступна|Выбранная модель недоступна
Register and enable an image-capable model in Models, then select it here.|Додайте й увімкніть модель із підтримкою зображень у списку моделей, а потім виберіть її тут.|Добавьте и включите модель с поддержкой изображений в списке моделей, затем выберите её здесь.
Add OCR and interface text when available|Додавати OCR і текст інтерфейсу за наявності|Добавлять OCR и текст интерфейса при наличии
Converts screenshot pixels into a Unicode luminance grid and a spatial color map on the CPU. No extra vision model is loaded. The text reasoning model interprets the maps.|Перетворює пікселі знімка на Unicode-сітку яскравості та просторову карту кольорів на CPU. Додаткова модель зору не завантажується. Карти інтерпретує текстова модель мислення.|Преобразует пиксели снимка в Unicode-сетку яркости и пространственную карту цветов на CPU. Дополнительная модель зрения не загружается. Карты интерпретирует текстовая модель мышления.
Experimental: preserves coarse layout, shapes and colors. Recognition of objects, small text and exact counts is unreliable. OCR is supplemental; this method does not provide VLM-quality understanding.|Експериментально: зберігає загальний макет, форми й кольори. Розпізнавання об’єктів, дрібного тексту й точних кількостей ненадійне. OCR допоміжний; якість розуміння нижча за візуальні моделі.|Экспериментально: сохраняет общий макет, формы и цвета. Распознавание объектов, мелкого текста и точных количеств ненадёжно. OCR вспомогательный; качество понимания ниже визуальных моделей.
Pixel grid width|Ширина піксельної сітки|Ширина пиксельной сетки
Include spatial color map|Додавати просторову карту кольорів|Добавлять пространственную карту цветов
Larger grids use more text context. Complete grids shrink automatically to fit the per-frame budget.|Більші сітки потребують більше текстового контексту. Цілі сітки автоматично зменшуються до ліміту одного кадру.|Большие сетки требуют больше текстового контекста. Целые сетки автоматически уменьшаются до лимита одного кадра.
Method inspired by TheiaVision (MIT)|Метод на основі TheiaVision (MIT)|Метод на основе TheiaVision (MIT)
Maximum screen context characters|Максимум символів контексту екрана|Максимум символов контекста экрана
Advanced OCR and interface settings|Додаткові налаштування OCR та інтерфейсу|Дополнительные настройки OCR и интерфейса
Interface tree depth|Глибина дерева інтерфейсу|Глубина дерева интерфейса
Maximum interface characters|Максимум символів інтерфейсу|Максимум символов интерфейса
Reasoning models|Моделі мислення|Модели мышления
Speech recognition|Розпізнавання мовлення|Распознавание речи
Text to speech|Озвучення тексту|Озвучивание текста
Vision models|Моделі зору|Модели зрения
Could not load providers|Не вдалося завантажити провайдерів|Не удалось загрузить провайдеров
Could not save provider models|Не вдалося зберегти моделі провайдера|Не удалось сохранить модели провайдера
Output tokens cannot exceed context window|Кількість вихідних токенів не може перевищувати контекстне вікно|Количество выходных токенов не может превышать контекстное окно
Could not verify the protected API key|Не вдалося перевірити API-ключ у захищеному сховищі|Не удалось проверить API-ключ в защищённом хранилище
Selected models saved|Вибрані моделі збережено|Выбранные модели сохранены
Enabled|Увімкнено|Включено
Remove|Видалити|Удалить
Context window|Контекстне вікно|Контекстное окно
Max output tokens|Максимум вихідних токенів|Максимум выходных токенов
Not provided by API|API не надав значення|API не предоставил значение
Priority|Пріоритет|Приоритет
Image input|Зображення на вході|Изображения на входе
Audio input|Аудіо на вході|Аудио на входе
Request limits|Ліміти запитів|Лимиты запросов
second|секунда|секунда
minute|хвилина|минута
hour|година|час
Model settings saved|Налаштування моделі збережено|Настройки модели сохранены
Save model settings|Зберегти налаштування моделі|Сохранить настройки модели
Providers and models|Провайдери й моделі|Провайдеры и модели
Add an API key, fetch models, and save your selection. Each key has its own model list.|Додайте API-ключ, отримайте моделі та збережіть вибрані. Кожен ключ має власний список моделей.|Добавьте API-ключ, получите модели и сохраните выбранные. Каждый ключ имеет свой список моделей.
Manage models and API key|Керувати моделями й API-ключем|Управлять моделями и API-ключом
Add provider or API key|Додати провайдера або API-ключ|Добавить провайдера или API-ключ
Provider|Провайдер|Провайдер
Other|Інший|Другой
Provider name|Назва провайдера|Название провайдера
Provider ID|Ідентифікатор провайдера|Идентификатор провайдера
Base URL|Базова URL-адреса|Базовый URL
Other providers use the OpenAI-compatible API.|Інші провайдери використовують API, сумісний з OpenAI.|Другие провайдеры используют API, совместимый с OpenAI.
Display name|Відображувана назва|Отображаемое название
Name this API key or account|Назвіть цей API-ключ або обліковий запис|Назовите этот API-ключ или учётную запись
API key|API-ключ|API-ключ
Leave blank to keep the saved key|Залиште порожнім, щоб зберегти наявний ключ|Оставьте пустым, чтобы сохранить существующий ключ
Enter API key|Введіть API-ключ|Введите API-ключ
Fetch models|Отримати моделі|Получить модели
Select models manually|Вибрати моделі вручну|Выбрать модели вручную
Select models|Вибір моделей|Выбор моделей
Check model capabilities and token limits. Missing values can be entered manually.|Перевірте можливості моделей і ліміти токенів. Відсутні значення можна ввести вручну.|Проверьте возможности моделей и лимиты токенов. Отсутствующие значения можно ввести вручную.
Search models|Пошук моделей|Поиск моделей
Deselect all|Зняти всі позначки|Снять все отметки
Select all|Вибрати всі|Выбрать все
Previous selection|Попередній вибір|Предыдущий выбор
Next selection|Наступний вибір|Следующий выбор
{count} models selected|Вибрано моделей: {count}|Выбрано моделей: {count}
Model ID|Ідентифікатор моделі|Идентификатор модели
Add|Додати|Добавить
Save selected models|Зберегти вибрані моделі|Сохранить выбранные модели
Model list response is invalid|Некоректна відповідь зі списком моделей|Некорректный ответ со списком моделей
Model list pagination repeated|Сторінка списку моделей повторилася|Страница списка моделей повторилась
Model list pagination changed host|Наступна сторінка моделей змінила сервер|Следующая страница моделей изменила сервер
Model list pagination exceeded 100 pages|Список моделей перевищив 100 сторінок|Список моделей превысил 100 страниц
s|с|с
min|хв|мин
h|год|ч
day|доба|сутки
Custom layout|Власний макет|Свой макет
Microphone is already in use by another Fluely window|Мікрофон уже використовує інше вікно Fluely|Микрофон уже использует другое окно Fluely
Microphone ownership unavailable|Не вдалося визначити власника мікрофона|Не удалось определить владельца микрофона
Too many actions in a panel|Забагато дій у панелі|Слишком много действий в панели
Each action must belong to exactly one group|Кожна дія має належати рівно одній групі|Каждое действие должно принадлежать ровно одной группе
Every action must belong to a group, including disabled actions|Кожна дія має належати групі, включно з вимкненими діями|Каждое действие должно принадлежать группе, включая отключённые действия
Overlay shortcuts|Гарячі клавіші оверлею|Горячие клавиши оверлея
Hide all windows also hides settings and status. Press the shortcut again to restore the windows that were visible.|Повне приховування прибирає також налаштування й стан. Натисніть комбінацію повторно, щоб повернути раніше видимі вікна.|Полное скрытие убирает также настройки и состояние. Нажмите комбинацию повторно, чтобы вернуть ранее видимые окна.
Visual understanding requires an image-capable vision provider. Start local vision with a model and matching projector, or configure a cloud vision provider in Settings.|Для зору потрібен провайдер із підтримкою зображень. Запустіть локальну модель зору з відповідним проєктором або налаштуйте хмарного провайдера зору в налаштуваннях.|Для зрения нужен провайдер с поддержкой изображений. Запустите локальную модель зрения с соответствующим проектором или настройте облачного провайдера зрения в настройках.
The vision provider must support images.|Візуальний провайдер має підтримувати зображення.|Визуальный провайдер должен поддерживать изображения.
Visual description is empty|Візуальний опис порожній|Визуальное описание пустое
Analyze the screenshot.|Проаналізуй знімок екрана.|Проанализируй снимок экрана.
The provider returned an empty response.|Провайдер повернув порожню відповідь.|Провайдер вернул пустой ответ.
JPEG quality, %|Якість JPEG, %|Качество JPEG, %
Image change threshold (0–1)|Поріг зміни зображення (0–1)|Порог изменения изображения (0–1)
Windows OCR|Windows OCR|Windows OCR
Could not verify key migration.|Не вдалося перевірити міграцію ключа.|Не удалось проверить перенос ключа.
A group is larger than its monitor workarea. Reduce its columns, button size, gap or padding.|Група більша за робочу область монітора. Зменште кількість стовпців, розмір кнопок або відступи.|Группа больше рабочей области монитора. Уменьшите число столбцов, размер кнопок или отступы.
· priority|· пріоритет|· приоритет
Overlay controls|Елементи керування оверлеєм|Элементы управления оверлеем
Overlay layout|Макет оверлею|Макет оверлея
Choose a compact preset or arrange free groups. Disabled controls stay assigned and can be restored here.|Виберіть компактний шаблон або розташуйте вільні групи. Вимкнені кнопки залишаються в групах, їх можна відновити тут.|Выберите компактный шаблон или расположите свободные группы. Отключённые кнопки остаются в группах, их можно восстановить здесь.
Compact buttons|Окремі компактні кнопки|Отдельные компактные кнопки
Side groups|Бічні групи|Боковые группы
Top/bottom groups|Групи зверху й знизу|Группы сверху и снизу
Add group|Додати групу|Добавить группу
Reload saved layout|Завантажити збережений макет|Загрузить сохранённый макет
Layout preview|Попередній перегляд макету|Предварительный просмотр макета
Move group|Перемістити групу|Переместить группу
Hidden group|Прихована група|Скрытая группа
Drag groups in the preview. Arrow keys move a focused group; Shift moves by 10 pixels. Coordinates use physical desktop pixels.|Перетягуйте групи в попередньому перегляді. Стрілки переміщують виділену групу, Shift — на 10 пікселів. Координати вказано у фізичних пікселях робочого столу.|Перетаскивайте группы в предварительном просмотре. Стрелки перемещают выделенную группу, Shift — на 10 пикселей. Координаты указаны в физических пикселях рабочего стола.
Monitor|Монітор|Монитор
physical pixels|фізичні пікселі|физические пиксели
Columns|Стовпці|Столбцы
Button size|Розмір кнопок|Размер кнопок
Gap|Відстань між кнопками|Расстояние между кнопками
Padding|Відступ від країв|Отступ от краёв
Transparency|Прозорість|Прозрачность
Move up|Перемістити вище|Переместить выше
Move down|Перемістити нижче|Переместить ниже
Assign group|Призначити групу|Назначить группу
Detach|Відокремити|Отделить
Move a control here using its group selector in another group.|Перенесіть сюди кнопку, вибравши цю групу в іншій групі.|Перенесите сюда кнопку, выбрав эту группу в другой группе.
Remove group and keep its controls|Видалити групу й зберегти її кнопки|Удалить группу и сохранить её кнопки
Applying…|Застосування…|Применение…
Apply custom layout|Застосувати власний макет|Применить свой макет
Layout applied. Drag the controls on the desktop or edit them here.|Макет застосовано. Перетягуйте кнопки на робочому столі або редагуйте їх тут.|Макет применён. Перетаскивайте кнопки на рабочем столе или редактируйте их здесь.
No monitors available.|Немає доступних моніторів.|Нет доступных мониторов.
No monitors available|Немає доступних моніторів|Нет доступных мониторов
Panel IDs must be 1–48 lowercase letters, digits or hyphens|Ідентифікатор панелі має містити 1–48 малих латинських літер, цифр або дефісів|Идентификатор панели должен содержать 1–48 строчных латинских букв, цифр или дефисов
Panel positions must be physical integer coordinates|Позиції панелей мають бути цілими фізичними координатами|Позиции панелей должны быть целыми физическими координатами
Panel columns, button size, gap or padding is outside its allowed range|Стовпці, розмір кнопок або відступи виходять за дозволені межі|Столбцы, размер кнопок или отступы выходят за допустимые пределы
Panel opacity must be between 0.05 and 1|Непрозорість панелі має бути від 0,05 до 1|Непрозрачность панели должна быть от 0,05 до 1
Invalid panel monitor key|Некоректний ідентифікатор монітора|Некорректный идентификатор монитора
Panel contains an unknown or duplicate action|Панель містить невідому або повторну дію|Панель содержит неизвестное или повторное действие
A layout must contain 1–16 groups|Макет має містити 1–16 груп|Макет должен содержать 1–16 групп
Duplicate panel ID|Повторний ідентифікатор панелі|Повторный идентификатор панели
Every action must belong to exactly one group, including disabled actions|Кожна дія має належати рівно одній групі, включно з вимкненими діями|Каждое действие должно принадлежать ровно одной группе, включая отключённые действия
Unknown destination group|Невідома цільова група|Неизвестная целевая группа
Unknown action|Невідома дія|Неизвестное действие
Screen vision|Зір екрана|Зрение экрана
Processing…|Обробка…|Обработка…
Fluely|Fluely|Fluely
Settings|Налаштування|Настройки
Interface Language|Мова інтерфейсу|Язык интерфейса
Choose the language for menus and settings. The system language is used on first launch.|Виберіть мову меню й налаштувань. Під час першого запуску використовується мова системи.|Выберите язык меню и настроек. При первом запуске используется язык системы.
History ({count})|Історія ({count})|История ({count})
Copy to clipboard|Копіювати в буфер обміну|Копировать в буфер обмена
Copied to clipboard!|Скопійовано в буфер обміну!|Скопировано в буфер обмена!
Failed to copy to clipboard.|Не вдалося скопіювати в буфер обміну.|Не удалось скопировать в буфер обмена.
User cancelled|Скасовано користувачем|Отменено пользователем
Error capturing selected area|Помилка захоплення вибраної області|Ошибка захвата выбранной области
Screen Capture:|Знімок екрана:|Снимок экрана:
Click and drag to select area · Press ESC to cancel|Натисніть і перетягніть, щоб вибрати область · ESC — скасувати|Нажмите и перетащите, чтобы выбрать область · ESC — отменить
Cancel (ESC)|Скасувати (ESC)|Отмена (ESC)
Loading...|Завантаження…|Загрузка…
Custom AI Providers|Власні провайдери ШІ|Свои провайдеры ИИ
Command Palette|Палітра команд|Палитра команд
Search for a command to run...|Знайдіть команду…|Найдите команду…
Close|Закрити|Закрыть
Chat movement and interaction|Переміщення та взаємодія з чатом|Перемещение и взаимодействие с чатом
Toggle passive transparent chat and opaque input/movement mode|Перемкнути пасивний прозорий чат і непрозорий режим введення/переміщення|Переключить пассивный прозрачный чат и непрозрачный режим ввода/перемещения
Find buttons / reset layout|Знайти кнопки / скинути розташування|Найти кнопки / сбросить расположение
Return panels and buttons to the screen|Повернути панелі й кнопки на екран|Вернуть панели и кнопки на экран
Switch panel layout|Перемкнути вигляд панелей|Переключить вид панелей
Side strips → top/bottom → buttons|Бічні смуги → верхня/нижня → кнопки|Боковые полосы → верхняя/нижняя → кнопки
Toggle Dashboard|Перемкнути панель керування|Переключить панель управления
Open/Close the dashboard window|Відкрити/закрити панель керування|Открыть/закрыть панель управления
Toggle Window|Показати/сховати вікна|Показать/скрыть окна
Show/Hide all overlay windows|Показати/сховати всі вікна помічника|Показать/скрыть все окна помощника
Refocus Input Box|Повернути фокус до поля введення|Вернуть фокус в поле ввода
Bring Fluely forward and place the cursor in the input area|Вивести Fluely на передній план і встановити курсор у поле введення|Вывести Fluely на передний план и установить курсор в поле ввода
Move Window|Перемістити вікно|Переместить окно
Move overlay with arrow keys (hold to move continuously)|Переміщувати вікно стрілками (утримуйте для безперервного руху)|Перемещать окно стрелками (удерживайте для непрерывного движения)
System Audio|Системне аудіо|Системное аудио
Toggle system audio capture|Увімкнути/вимкнути захоплення системного аудіо|Включить/выключить захват системного аудио
Voice Input|Голосове введення|Голосовой ввод
Start voice recording|Почати запис голосу|Начать запись голоса
Screenshot|Знімок екрана|Снимок экрана
Capture screenshot|Зробити знімок екрана|Сделать снимок экрана
TTS Toggle|Увімкнути/вимкнути озвучення|Включить/выключить озвучивание
Enable/disable text-to-speech entirely|Повністю увімкнути/вимкнути озвучення тексту|Полностью включить/выключить озвучивание текста
TTS Stop|Зупинити озвучення|Остановить озвучивание
Stop TTS playback|Зупинити відтворення озвучення|Остановить воспроизведение озвучивания
TTS Pause|Пауза озвучення|Пауза озвучивания
Pause/resume TTS playback|Призупинити/відновити озвучення|Приостановить/возобновить озвучивание
TTS Seek Back|Попереднє речення озвучення|Предыдущее предложение озвучивания
Play the previous sentence|Відтворити попереднє речення|Воспроизвести предыдущее предложение
TTS Seek Forward|Наступне речення озвучення|Следующее предложение озвучивания
Play the next sentence|Відтворити наступне речення|Воспроизвести следующее предложение
Secure storage is unavailable.|Захищене сховище недоступне.|Защищённое хранилище недоступно.
Please select an AI provider in settings|Виберіть провайдера ШІ в налаштуваннях|Выберите провайдера ИИ в настройках
Invalid provider selected|Вибрано некоректного провайдера|Выбран некорректный провайдер
An error occurred|Сталася помилка|Произошла ошибка
Failed to save conversation. Please try again.|Не вдалося зберегти розмову. Спробуйте ще раз.|Не удалось сохранить разговор. Попробуйте ещё раз.
An error occurred processing screenshot|Сталася помилка обробки знімка екрана|Произошла ошибка обработки снимка экрана
Failed to capture screenshot. Please try again.|Не вдалося зробити знімок екрана. Спробуйте ще раз.|Не удалось сделать снимок экрана. Попробуйте ещё раз.
Cannot save conversation: missing message content|Неможливо зберегти розмову: немає тексту повідомлення|Невозможно сохранить разговор: нет текста сообщения
No conversation ID provided|Не вказано ідентифікатор розмови|Не указан идентификатор разговора
Invalid conversation selected|Вибрано некоректну розмову|Выбран некорректный разговор
Conversation not found. It may have been deleted.|Розмову не знайдено. Можливо, її видалено.|Разговор не найден. Возможно, он удалён.
Failed to load conversation. Please try again.|Не вдалося завантажити розмову. Спробуйте ще раз.|Не удалось загрузить разговор. Попробуйте ещё раз.
Curl command is required|Потрібна команда cURL|Требуется команда cURL
Response content path is required|Потрібен шлях до тексту відповіді|Требуется путь к тексту ответа
cURL command must contain {{AUDIO}}.|Команда cURL має містити {{AUDIO}}.|Команда cURL должна содержать {{AUDIO}}.
Dashboard|Панель керування|Панель управления
Chats|Чати|Чаты
System prompts|Системні інструкції|Системные инструкции
App Settings|Налаштування застосунку|Настройки приложения
Responses|Відповіді|Ответы
Audio|Аудіо|Аудио
Cursor & Shortcuts|Курсор і гарячі клавіші|Курсор и горячие клавиши
Dev space|Налаштування провайдерів|Настройки провайдеров
Report a bug|Повідомити про помилку|Сообщить об ошибке
Quit Fluely|Вийти з Fluely|Выйти из Fluely
Website|Вебсайт|Веб-сайт
Github|Github|Github
Buy Me a Coffee|Підтримати розробника|Поддержать разработчика
Follow on X|Стежити в X|Подписаться в X
Could not connect to the service.|Не вдалося підключитися до служби.|Не удалось подключиться к службе.
Could not send the action.|Не вдалося надіслати дію.|Не удалось отправить действие.
No speech provider selected.|Не вибрано провайдера розпізнавання мовлення.|Не выбран провайдер распознавания речи.
Speech provider config not found.|Налаштування провайдера мовлення не знайдено.|Настройки провайдера речи не найдены.
Speech transcription timed out (30s)|Час розпізнавання мовлення вичерпано (30 с)|Время распознавания речи истекло (30 с)
Received empty transcription|Отримано порожній результат розпізнавання|Получен пустой результат распознавания
Failed to transcribe audio|Не вдалося розпізнати аудіо|Не удалось распознать аудио
Failed to process speech|Не вдалося обробити мовлення|Не удалось обработать речь
No AI provider selected.|Не вибрано провайдера ШІ.|Не выбран провайдер ИИ.
AI provider config not found.|Налаштування провайдера ШІ не знайдено.|Настройки провайдера ИИ не найдены.
Failed to get AI response|Не вдалося отримати відповідь ШІ|Не удалось получить ответ ИИ
Not in continuous mode|Безперервний режим не ввімкнено|Непрерывный режим не включён
Permission not granted. Please try the manual steps.|Дозвіл не надано. Виконайте налаштування вручну.|Разрешение не предоставлено. Выполните настройку вручную.
Failed to request access. Please try the manual steps below.|Не вдалося запросити доступ. Виконайте наведені нижче кроки вручну.|Не удалось запросить доступ. Выполните приведённые ниже шаги вручную.
Failed to fetch system prompts|Не вдалося отримати системні інструкції|Не удалось получить системные инструкции
Failed to create system prompt|Не вдалося створити системну інструкцію|Не удалось создать системную инструкцию
Failed to update system prompt|Не вдалося оновити системну інструкцію|Не удалось обновить системную инструкцию
Failed to delete system prompt|Не вдалося видалити системну інструкцію|Не удалось удалить системную инструкцию
Failed to load version|Не вдалося завантажити версію|Не удалось загрузить версию
Unknown|Невідомо|Неизвестно
Reset|Скинути|Сбросить
Oops! Something went wrong. Click reload to restart the app.|Щось пішло не так. Натисніть «Перезавантажити», щоб перезапустити застосунок.|Что-то пошло не так. Нажмите «Перезагрузить», чтобы перезапустить приложение.
Oops!|Ой!|Ой!
Something unexpected happened|Сталося щось несподіване|Произошло что-то неожиданное
Don't worry! Just click the reload button below to restart the app.|Натисніть кнопку перезавантаження нижче, щоб перезапустити застосунок.|Нажмите кнопку перезагрузки ниже, чтобы перезапустить приложение.
Reload|Перезавантажити|Перезагрузить
Toggle voice input|Увімкнути/вимкнути голосове введення|Включить/выключить голосовой ввод
Speech Provider Configuration Required|Потрібно налаштувати провайдера мовлення|Требуется настройка провайдера речи
PROVIDER IS MISSING|ПРОВАЙДЕРА НЕМАЄ|ПРОВАЙДЕР ОТСУТСТВУЕТ
Please go to settings and configure your speech provider to enable voice input.|Перейдіть до налаштувань і налаштуйте провайдера мовлення для голосового введення.|Перейдите в настройки и настройте провайдера речи для голосового ввода.
No speech provider selected|Не вибрано провайдера мовлення|Не выбран провайдер речи
No speech provider selected. Please select one in settings.|Не вибрано провайдера мовлення. Виберіть його в налаштуваннях.|Не выбран провайдер речи. Выберите его в настройках.
Selected speech provider configuration not found|Налаштування вибраного провайдера мовлення не знайдено|Настройки выбранного провайдера речи не найдены
Speech provider configuration not found. Please check your settings.|Налаштування провайдера мовлення не знайдено. Перевірте налаштування.|Настройки провайдера речи не найдены. Проверьте настройки.
Transcription failed|Помилка розпізнавання|Ошибка распознавания
Attach images|Додати зображення|Добавить изображения
Image upload not supported by current AI provider|Поточний провайдер ШІ не підтримує завантаження зображень|Текущий провайдер ИИ не поддерживает загрузку изображений
Attached Images (|Додані зображення (|Добавленные изображения (
Remove image|Видалити зображення|Удалить изображение
Add More Images|Додати ще зображення|Добавить ещё изображения
Remove All Images|Видалити всі зображення|Удалить все изображения
Ask me anything...|Запитайте що завгодно…|Спросите что угодно…
Conversation Mode|Режим розмови|Режим разговора
AI Response|Відповідь ШІ|Ответ ИИ
(Use arrow keys to scroll)|(Прокручуйте стрілками)|(Прокручивайте стрелками)
AI response|відповідь ШІ|ответ ИИ
conversation mode|режим розмови|режим разговора
Cancel loading|Скасувати завантаження|Отменить загрузку
Close and start new conversation|Закрити й почати нову розмову|Закрыть и начать новый разговор
Clear conversation|Очистити розмову|Очистить разговор
Error:|Помилка:|Ошибка:
Generating response...|Генерування відповіді…|Генерация ответа…
You|Ви|Вы
View Current Conversation|Переглянути поточну розмову|Посмотреть текущий разговор
Current Conversation|Поточна розмова|Текущий разговор
messages in this conversation|повідомлень у цій розмові|сообщений в этом разговоре
New Chat|Новий чат|Новый чат
Selection|Вибрана область|Выбранная область
Screenshot not supported by current AI provider|Поточний провайдер ШІ не підтримує знімки екрана|Текущий провайдер ИИ не поддерживает снимки экрана
Ready|Готово|Готово
Listening|Прослуховування|Прослушивание
Recording|Запис|Запись
Transcribing|Розпізнавання|Распознавание
AI Responding|ШІ відповідає|ИИ отвечает
Error|Помилка|Ошибка
Setup Required|Потрібне налаштування|Требуется настройка
Speech Assistant|Голосовий помічник|Голосовой помощник
Auto-detect|Автовиявлення|Автоопределение
Manual|Вручну|Вручную
Setup required - Click for instructions|Потрібне налаштування — натисніть для інструкцій|Требуется настройка — нажмите для инструкций
Transcribing audio...|Розпізнавання аудіо…|Распознавание аудио…
Stop system audio capture|Зупинити захоплення системного аудіо|Остановить захват системного аудио
Start system audio capture|Почати захоплення системного аудіо|Начать захват системного аудио
Capture screenshot to include with transcription|Зробити знімок екрана для надсилання з розпізнаним текстом|Сделать снимок экрана для отправки с распознанным текстом
Start a new conversation|Почати нову розмову|Начать новый разговор
New|Нова|Новая
Screenshot attached|Знімок екрана додано|Снимок экрана добавлен
Will be sent with next transcription|Буде надіслано з наступним розпізнаним текстом|Будет отправлен со следующим распознанным текстом
(voice activity)|(голосова активність)|(голосовая активность)
(press to record)|(натисніть для запису)|(нажмите для записи)
Checking Permissions|Перевірка дозволів|Проверка разрешений
Verifying system audio access...|Перевірка доступу до системного аудіо…|Проверка доступа к системному аудио…
Permission Granted|Дозвіл надано|Разрешение предоставлено
Starting capture...|Початок захоплення…|Начало захвата…
Waiting for Permission|Очікування дозволу|Ожидание разрешения
Permission Required|Потрібен дозвіл|Требуется разрешение
Grant access to capture system audio|Надайте доступ до захоплення системного аудіо|Предоставьте доступ к захвату системного аудио
Grant Permission|Надати дозвіл|Предоставить разрешение
Manual setup|Налаштування вручну|Настройка вручную
Open System Settings|Відкрийте системні налаштування|Откройте системные настройки
Go to Privacy & Security|Перейдіть до «Приватність і безпека»|Перейдите в «Конфиденциальность и безопасность»
Select Screen & System Audio Recording|Виберіть «Запис екрана й системного аудіо»|Выберите «Запись экрана и системного аудио»
Enable Fluely|Увімкніть Fluely|Включите Fluely
Check Now|Перевірити зараз|Проверить сейчас
Quick Actions|Швидкі дії|Быстрые действия
Done|Готово|Готово
Edit|Редагувати|Редактировать
Add action...|Додати дію…|Добавить действие…
Transcribing...|Розпізнавання…|Распознавание…
Generating...|Генерування…|Генерация…
Start Recording|Почати запис|Начать запись
Discard|Відкинути|Отбросить
Stop & Send|Зупинити й надіслати|Остановить и отправить
s max|с макс.|с макс.
Conversation|Розмова|Разговор
System:|Система:|Система:
System|Система|Система
Previous|Попередні|Предыдущие
Low|Низька|Низкая
Only picks up clear, loud speech|Розпізнає лише чітке, гучне мовлення|Распознаёт только чёткую, громкую речь
Normal|Звичайна|Обычная
Balanced for typical conversations|Збалансовано для звичайних розмов|Сбалансировано для обычных разговоров
High|Висока|Высокая
Picks up quieter speech|Розпізнає тихіше мовлення|Распознаёт более тихую речь
Speech Sensitivity|Чутливість до мовлення|Чувствительность к речи
Custom sensitivity values|Власні значення чутливості|Свои значения чувствительности
Max Recording Duration|Максимальна тривалість запису|Максимальная длительность записи
AI Context|Контекст ШІ|Контекст ИИ
Use System Prompt|Використовувати системну інструкцію|Использовать системную инструкцию
Using default prompt from settings|Використовується стандартна інструкція з налаштувань|Используется стандартная инструкция из настроек
Using custom context below|Використовується власний контекст нижче|Используется свой контекст ниже
Templates|Шаблони|Шаблоны
Quick-fill a template|Заповнити з шаблону|Заполнить из шаблона
Enter custom system prompt and context...|Введіть власну системну інструкцію й контекст…|Введите свою системную инструкцию и контекст…
Advanced Settings|Розширені налаштування|Расширенные настройки
Speech Sensitivity (Raw)|Чутливість до мовлення (значення)|Чувствительность к речи (значение)
Silence Duration|Тривалість тиші|Длительность тишины
How long to wait after speech stops|Час очікування після завершення мовлення|Время ожидания после окончания речи
Noise Gate|Поріг шуму|Порог шума
Filters background noise|Фільтрує фоновий шум|Фильтрует фоновый шум
Reset to Defaults|Відновити стандартні значення|Восстановить стандартные значения
Listening...|Прослуховування…|Прослушивание…
Help & Keyboard Shortcuts|Довідка й гарячі клавіші|Справка и горячие клавиши
Auto-detect Mode|Режим автовиявлення|Режим автоопределения
Manual Mode|Ручний режим|Ручной режим
Speech is automatically detected from system audio. When someone speaks, it will be captured and transcribed.|Мовлення автоматично виявляється в системному аудіо. Коли хтось говорить, його мовлення записується й розпізнається.|Речь автоматически обнаруживается в системном аудио. Когда кто-то говорит, его речь записывается и распознаётся.
Press the record button or use keyboard shortcuts to manually control recording.|Натисніть кнопку запису або використовуйте гарячі клавіші для керування записом вручну.|Нажмите кнопку записи или используйте горячие клавиши для управления записью вручную.
Keyboard Shortcuts|Гарячі клавіші|Горячие клавиши
Scroll down|Прокрутити вниз|Прокрутить вниз
Scroll up|Прокрутити вгору|Прокрутить вверх
Start/Stop|Почати/зупинити|Начать/остановить
Start record|Почати запис|Начать запись
Toggle view|Перемкнути вигляд|Переключить вид
Screenshot Feature|Функція знімка екрана|Функция снимка экрана
Screenshot: Captures your current screen and attaches it to your next transcription.|Знімок екрана: захоплює поточний екран і додає його до наступного розпізнаного тексту.|Снимок экрана: захватывает текущий экран и добавляет его к следующему распознанному тексту.
The AI will receive both the transcribed audio and the screenshot image, allowing it to provide context-aware responses based on what you're viewing.|ШІ отримає розпізнане аудіо та знімок екрана, щоб врахувати те, що ви переглядаєте, у своїй відповіді.|ИИ получит распознанное аудио и снимок экрана, чтобы учесть то, что вы просматриваете, в своём ответе.
The screenshot is automatically cleared after each message is sent.|Знімок екрана автоматично очищується після надсилання повідомлення.|Снимок экрана автоматически очищается после отправки сообщения.
Tip:|Порада:|Совет:
Use Auto-detect for hands-free operation during interviews.|Використовуйте автовиявлення для роботи без рук під час співбесід.|Используйте автоопределение для работы без рук во время собеседований.
Use Manual mode when you need precise control over what gets transcribed.|Використовуйте ручний режим для точного контролю розпізнавання.|Используйте ручной режим для точного контроля распознавания.
Quick Actions let you send follow-up prompts with one click.|Швидкі дії дають змогу надсилати додаткові запити одним натисканням.|Быстрые действия позволяют отправлять дополнительные запросы одним нажатием.
Use Screenshot to share your screen context with the AI for more relevant responses.|Надавайте ШІ контекст екрана за допомогою знімків для доречніших відповідей.|Передавайте ИИ контекст экрана с помощью снимков для более подходящих ответов.
Open Dev Space|Відкрити налаштування провайдерів|Открыть настройки провайдеров
Microphone|Мікрофон|Микрофон
Select your microphone for voice input and speech-to-text. If issues occur, adjust your system's default microphone in OS settings.|Виберіть мікрофон для голосового введення й розпізнавання мовлення. У разі проблем змініть стандартний мікрофон у налаштуваннях ОС.|Выберите микрофон для голосового ввода и распознавания речи. При проблемах измените стандартный микрофон в настройках ОС.
Loading microphones...|Завантаження мікрофонів…|Загрузка микрофонов…
No microphones found|Мікрофонів не знайдено|Микрофоны не найдены
(Default)|(Стандартний)|(Стандартный)
Select a microphone|Виберіть мікрофон|Выберите микрофон
Refresh microphone list|Оновити список мікрофонів|Обновить список микрофонов
✓ Microphone changed successfully!|✓ Мікрофон змінено!|✓ Микрофон изменён!
Using:|Використовується:|Используется:
Unknown device|Невідомий пристрій|Неизвестное устройство
⚠️ Click the refresh button to load your microphone devices.|⚠️ Натисніть кнопку оновлення, щоб завантажити список мікрофонів.|⚠️ Нажмите кнопку обновления, чтобы загрузить список микрофонов.
If this doesn't work, try changing your default microphone in your system settings.|Якщо це не допоможе, змініть стандартний мікрофон у системних налаштуваннях.|Если это не поможет, измените стандартный микрофон в системных настройках.
When you select a microphone, the app will immediately switch to that device. You can verify by hovering over the microphone button in the main interface - it will show the active device name.|Після вибору мікрофона застосунок одразу перемкнеться на нього. Наведіть курсор на кнопку мікрофона в головному інтерфейсі, щоб побачити назву активного пристрою.|После выбора микрофона приложение сразу переключится на него. Наведите курсор на кнопку микрофона в основном интерфейсе, чтобы увидеть имя активного устройства.
Select the output device to capture system sounds and application audio. If issues occur, set the correct default output in OS settings.|Виберіть пристрій виведення для захоплення системних звуків і аудіо застосунків. У разі проблем задайте правильний стандартний вихід у налаштуваннях ОС.|Выберите устройство вывода для захвата системных звуков и аудио приложений. При проблемах задайте правильный стандартный выход в настройках ОС.
Loading output devices...|Завантаження пристроїв виведення…|Загрузка устройств вывода…
No output devices found|Пристроїв виведення не знайдено|Устройства вывода не найдены
Select an output device|Виберіть пристрій виведення|Выберите устройство вывода
Refresh output device list|Оновити список пристроїв виведення|Обновить список устройств вывода
✓ Output device changed successfully!|✓ Пристрій виведення змінено!|✓ Устройство вывода изменено!
⚠️ Click the refresh button to load your system audio devices.|⚠️ Натисніть кнопку оновлення, щоб завантажити список аудіопристроїв.|⚠️ Нажмите кнопку обновления, чтобы загрузить список аудиоустройств.
If this doesn't work, try changing your default system audio output in your system settings.|Якщо це не допоможе, змініть стандартний аудіовихід у системних налаштуваннях.|Если это не поможет, измените стандартный аудиовыход в системных настройках.
System audio capture allows you to record audio playing through your speakers or headphones. This is useful for capturing conversation audio or system sounds along with your voice.|Захоплення системного аудіо записує звук із динаміків або навушників. Це дає змогу записувати розмови або системні звуки разом із вашим голосом.|Захват системного аудио записывает звук из динамиков или наушников. Это позволяет записывать разговоры или системные звуки вместе с вашим голосом.
System Preferences → Sound → Input|Системні налаштування → Звук → Вхід|Системные настройки → Звук → Вход
System Preferences → Sound → Output|Системні налаштування → Звук → Вихід|Системные настройки → Звук → Выход
Settings → System → Sound → Input|Налаштування → Система → Звук → Вхід|Настройки → Система → Звук → Вход
Settings → System → Sound → Output|Налаштування → Система → Звук → Вихід|Настройки → Система → Звук → Выход
Sound Settings → Input Devices|Налаштування звуку → Пристрої введення|Настройки звука → Устройства ввода
Sound Settings → Output Devices|Налаштування звуку → Пристрої виведення|Настройки звука → Устройства вывода
your system's sound settings|налаштування звуку вашої системи|настройки звука вашей системы
Audio Settings|Налаштування аудіо|Настройки аудио
Configure your audio input and output devices for voice interaction and system audio capture.|Налаштуйте аудіопристрої введення й виведення для голосової взаємодії та захоплення системного аудіо.|Настройте аудиоустройства ввода и вывода для голосового взаимодействия и захвата системного аудио.
⚠️ If selected devices don't work:|⚠️ Якщо вибрані пристрої не працюють:|⚠️ Если выбранные устройства не работают:
Please verify your default system audio settings. Go to|Перевірте стандартні системні налаштування аудіо. Перейдіть до|Проверьте стандартные системные настройки аудио. Перейдите в
for microphone and|для мікрофона й|для микрофона и
for speakers/headphones. Ensure the correct devices are set as default in your operating system.|для динаміків/навушників. Переконайтеся, що правильні пристрої вибрано стандартними в ОС.|для динамиков/наушников. Убедитесь, что правильные устройства выбраны стандартными в ОС.
Note:|Примітка:|Примечание:
If the selected device fails or is unavailable, Fluely will automatically fall back to your system's default audio devices.|Якщо вибраний пристрій недоступний або не працює, Fluely автоматично використає стандартні аудіопристрої системи.|Если выбранное устройство недоступно или не работает, Fluely автоматически использует стандартные аудиоустройства системы.
Initializing...|Ініціалізація…|Инициализация…
Stop recording|Зупинити запис|Остановить запись
Sending...|Надсилання…|Отправка…
Send to AI|Надіслати ШІ|Отправить ИИ
Recording...|Запис…|Запись…
Voice input|Голосове введення|Голосовой ввод
Speech Provider Required|Потрібен провайдер мовлення|Требуется провайдер речи
Provider not configured|Провайдера не налаштовано|Провайдер не настроен
Configure a speech provider in settings to enable voice input.|Налаштуйте провайдера мовлення в налаштуваннях для голосового введення.|Настройте провайдера речи в настройках для голосового ввода.
Add More|Додати ще|Добавить ещё
Remove All|Видалити все|Удалить всё
Delete Conversation|Видалити розмову|Удалить разговор
Are you sure you want to delete this conversation? This action cannot be undone.|Видалити цю розмову? Цю дію неможливо скасувати.|Удалить этот разговор? Это действие невозможно отменить.
Cancel|Скасувати|Отмена
Delete|Видалити|Удалить
Open this conversation in overlay|Відкрити цю розмову у вікні помічника|Открыть этот разговор в окне помощника
Attached|Додано|Добавлено
Open in Overlay|Відкрити у вікні помічника|Открыть в окне помощника
Download conversation as markdown|Завантажити розмову у форматі Markdown|Скачать разговор в формате Markdown
Downloaded|Завантажено|Скачано
Download|Завантажити|Скачать
Delete conversation|Видалити розмову|Удалить разговор
No messages found|Повідомлень не знайдено|Сообщения не найдены
Start a new message to get started|Почніть із нового повідомлення|Начните с нового сообщения
Type a message...|Введіть повідомлення…|Введите сообщение…
Send message|Надіслати повідомлення|Отправить сообщение
All conversations|Усі розмови|Все разговоры
View all your conversations|Переглядайте всі свої розмови|Просматривайте все свои разговоры
No conversations found|Розмов не знайдено|Разговоры не найдены
Start a new conversation to get started|Почніть нову розмову|Начните новый разговор
Search conversations...|Пошук розмов…|Поиск разговоров…
Fluely local AI assistant.|Fluely — локальний помічник ШІ.|Fluely — локальный помощник ИИ.
Use the Dev Space to configure your own AI and STT providers.|Налаштуйте власних провайдерів ШІ й розпізнавання мовлення в налаштуваннях провайдерів.|Настройте своих провайдеров ИИ и распознавания речи в настройках провайдеров.
Add Custom Provider|Додати власного провайдера|Добавить своего провайдера
Edit Provider|Редагувати провайдера|Редактировать провайдера
Create a custom AI provider to use with your AI-powered applications.|Створіть власного провайдера ШІ для своїх застосунків.|Создайте своего провайдера ИИ для своих приложений.
AI Provider|Провайдер ШІ|Провайдер ИИ
Auto-fill|Автозаповнення|Автозаполнение
Curl Command *|Команда cURL *|Команда cURL *
The curl command to use with the AI provider.|Команда cURL для провайдера ШІ.|Команда cURL для провайдера ИИ.
💡 Important: You can add custom variables or directly include your API keys/values|💡 Можна додавати власні змінні або безпосередньо вказувати API-ключі/значення|💡 Можно добавлять свои переменные или непосредственно указывать API-ключи/значения
No need to enter variables separately when selecting the provider - you can embed them directly in the curl command (e.g., replace YOUR_API_KEY with your actual key or use|Змінні можна вставити безпосередньо в команду cURL (наприклад, замінити YOUR_API_KEY своїм ключем або використати|Переменные можно вставить непосредственно в команду cURL (например, заменить YOUR_API_KEY своим ключом или использовать
for model name).|для назви моделі).|для имени модели).
⚠️ Required Variables for AI Providers:|⚠️ Обов’язкові змінні для провайдерів ШІ:|⚠️ Обязательные переменные для провайдеров ИИ:
→ REQUIRED: User's text input|→ ОБОВ’ЯЗКОВО: текст запиту користувача|→ ОБЯЗАТЕЛЬНО: текст запроса пользователя
→ Base64 image data (without data:image/jpeg;base64 prefix)|→ Дані зображення Base64 (без префікса data:image/jpeg;base64)|→ Данные изображения Base64 (без префикса data:image/jpeg;base64)
→ System prompt/instructions(optional)|→ Системна інструкція (необов’язково)|→ Системная инструкция (необязательно)
Quick Setup:|Швидке налаштування:|Быстрая настройка:
Replace|Замініть|Замените
with your actual API key directly in the curl command.|своїм API-ключем безпосередньо в команді cURL.|своим API-ключом непосредственно в команде cURL.
Custom Variables:|Власні змінні:|Свои переменные:
You can add your own variables using the same|Можна додавати власні змінні в такому самому|Можно добавлять свои переменные в таком же
format and they'll be available for configuration when you select this provider.|форматі, і вони будуть доступні під час вибору цього провайдера.|формате, и они будут доступны при выборе этого провайдера.
💡 Tip: Use the required variables (|💡 Порада: використовуйте обов’язкові змінні (|💡 Совет: используйте обязательные переменные (
) for basic functionality. Add|) для базових функцій. Додавайте|) для базовых функций. Добавляйте
only if your provider supports image input.|лише якщо провайдер підтримує зображення.|только если провайдер поддерживает изображения.
Streaming|Потокова відповідь|Потоковый ответ
streaming is used to stream the response from the AI provider.|Потоковий режим показує відповідь ШІ поступово.|Потоковый режим показывает ответ ИИ постепенно.
Response Content Path *|Шлях до тексту відповіді *|Путь к тексту ответа *
The path to extract content from the API response.|Шлях для отримання тексту з відповіді API.|Путь для извлечения текста из ответа API.
The path to extract content from the API response. Examples: choices[0].message.content, text, candidates[0].content.parts[0].text|Шлях до тексту у відповіді API. Приклади: choices[0].message.content, text, candidates[0].content.parts[0].text|Путь к тексту в ответе API. Примеры: choices[0].message.content, text, candidates[0].content.parts[0].text
Invalid cURL, try again|Некоректний cURL, спробуйте ще раз|Некорректный cURL, попробуйте ещё раз
Update|Оновити|Обновить
Save|Зберегти|Сохранить
Provider|Провайдер|Провайдер
Custom Providers|Власні провайдери|Свои провайдеры
Create and manage custom AI providers. Configure endpoints, authentication, and response formats.|Створюйте власних провайдерів ШІ. Налаштовуйте адреси, автентифікацію й формати відповідей.|Создавайте своих провайдеров ИИ. Настраивайте адреса, аутентификацию и форматы ответов.
Invalid curl command|Некоректна команда cURL|Некорректная команда cURL
Not set|Не задано|Не задано
Streaming:|Потокова відповідь:|Потоковый ответ:
Yes|Так|Да
No|Ні|Нет
Delete Provider|Видалити провайдера|Удалить провайдера
Delete Custom Provider|Видалити власного провайдера|Удалить своего провайдера
Are you sure you want to delete this custom provider? This action cannot be undone.|Видалити цього власного провайдера? Цю дію неможливо скасувати.|Удалить этого своего провайдера? Это действие невозможно отменить.
AI Providers|Провайдери ШІ|Провайдеры ИИ
Select your preferred AI service provider to get started.|Виберіть провайдера ШІ, щоб почати.|Выберите провайдера ИИ, чтобы начать.
Select AI Provider|Виберіть провайдера ШІ|Выберите провайдера ИИ
Select your preferred AI service provider or custom providers to get started.|Виберіть провайдера ШІ або власного провайдера, щоб почати.|Выберите провайдера ИИ или своего провайдера, чтобы начать.
Custom Provider|Власний провайдер|Свой провайдер
Choose your AI provider|Виберіть провайдера ШІ|Выберите провайдера ИИ
Invalid|Некоректно|Некорректно
If you want to use different url or method, you can always create a custom provider.|Для іншої URL-адреси або методу створіть власного провайдера.|Для другого URL-адреса или метода создайте своего провайдера.
API Key|API-ключ|API-ключ
Submit API Key|Зберегти API-ключ|Сохранить API-ключ
Remove API Key|Видалити API-ключ|Удалить API-ключ
Add Custom STT Provider|Додати власного провайдера розпізнавання|Добавить своего провайдера распознавания
Edit STT Provider|Редагувати провайдера розпізнавання|Редактировать провайдера распознавания
Create a custom STT provider to use with your STT-powered applications.|Створіть власного провайдера розпізнавання мовлення для своїх застосунків.|Создайте своего провайдера распознавания речи для своих приложений.
STT Provider|Провайдер розпізнавання|Провайдер распознавания
The curl command to use with the STT provider.|Команда cURL для провайдера розпізнавання.|Команда cURL для провайдера распознавания.
⚠️ Required Variables for STT Providers:|⚠️ Обов’язкові змінні для провайдерів розпізнавання:|⚠️ Обязательные переменные для провайдеров распознавания:
→ REQUIRED: Base64 encoded audio data or audio file as wav file if you are using multipart/form-data (using -F or --form)|→ ОБОВ’ЯЗКОВО: аудіо Base64 або WAV-файл для multipart/form-data (з -F або --form)|→ ОБЯЗАТЕЛЬНО: аудио Base64 или WAV-файл для multipart/form-data (с -F или --form)
💡 Tip: The|💡 Порада: змінна|💡 Совет: переменная
variable is essential for STT functionality - make sure it's properly included in your curl command.|обов’язкова для розпізнавання — переконайтеся, що вона є в команді cURL.|обязательна для распознавания — убедитесь, что она есть в команде cURL.
Streaming is not supported for STT providers. it will be fixed in the future.|Потоковий режим для розпізнавання мовлення поки не підтримується.|Потоковый режим для распознавания речи пока не поддерживается.
The path to extract content from the API response. Examples: text, transcript, results[0].alternatives[0].transcript|Шлях до тексту у відповіді API. Приклади: text, transcript, results[0].alternatives[0].transcript|Путь к тексту в ответе API. Примеры: text, transcript, results[0].alternatives[0].transcript
Custom STT Providers|Власні провайдери розпізнавання|Свои провайдеры распознавания
Create and manage custom STT providers. Configure endpoints, authentication, and response formats.|Створюйте власних провайдерів розпізнавання. Налаштовуйте адреси, автентифікацію й формати відповідей.|Создавайте своих провайдеров распознавания. Настраивайте адреса, аутентификацию и форматы ответов.
Delete Custom STT Provider|Видалити власного провайдера розпізнавання|Удалить своего провайдера распознавания
Are you sure you want to delete this custom STT provider? This action cannot be undone.|Видалити цього провайдера розпізнавання? Цю дію неможливо скасувати.|Удалить этого провайдера распознавания? Это действие невозможно отменить.
STT Providers|Провайдери розпізнавання|Провайдеры распознавания
Select your preferred STT service provider to get started.|Виберіть провайдера розпізнавання, щоб почати.|Выберите провайдера распознавания, чтобы начать.
Select STT Provider|Виберіть провайдера розпізнавання|Выберите провайдера распознавания
Select your preferred STT service provider or custom providers to get started.|Виберіть стандартного або власного провайдера розпізнавання, щоб почати.|Выберите стандартного или своего провайдера распознавания, чтобы начать.
Choose your STT provider|Виберіть провайдера розпізнавання|Выберите провайдера распознавания
Dev Space|Налаштування провайдерів|Настройки провайдеров
Manage your providers|Керуйте своїми провайдерами|Управляйте своими провайдерами
Auto-Scroll Behavior|Автоматичне прокручування|Автоматическая прокрутка
Control whether responses automatically scroll to the bottom. This setting applies immediately and controls whether responses automatically scroll to the latest content as it streams|Керуйте автоматичним прокручуванням відповідей униз. Налаштування діє одразу й показує найновіший текст під час генерування.|Управляйте автоматической прокруткой ответов вниз. Настройка действует сразу и показывает новейший текст при генерации.
Auto-Scroll Enabled|Автопрокручування ввімкнено|Автопрокрутка включена
Auto-Scroll Disabled|Автопрокручування вимкнено|Автопрокрутка выключена
Responses will automatically scroll to the bottom as they arrive|Відповіді автоматично прокручуватимуться вниз у міру надходження|Ответы будут автоматически прокручиваться вниз по мере поступления
Responses will stay at your current scroll position|Відповіді залишатимуться на поточній позиції прокручування|Ответы останутся на текущей позиции прокрутки
Response Language|Мова відповідей|Язык ответов
Select the language for AI responses. Setting applies globally to all providers and conversations. Language support may vary depending on your selected LLM provider|Виберіть мову відповідей ШІ для всіх провайдерів і розмов. Підтримка мов залежить від вибраного провайдера.|Выберите язык ответов ИИ для всех провайдеров и разговоров. Поддержка языков зависит от выбранного провайдера.
Select a language|Виберіть мову|Выберите язык
Response Length|Довжина відповіді|Длина ответа
Control how detailed the AI responses should be. Changes apply to all new conversations and will influence how the AI structures responses|Задайте докладність відповідей ШІ. Зміни застосовуються до всіх нових розмов і впливають на структуру відповідей.|Задайте подробность ответов ИИ. Изменения применяются ко всем новым разговорам и влияют на структуру ответов.
Response Settings|Налаштування відповідей|Настройки ответов
Customize how AI generates and displays responses|Налаштуйте генерування й відображення відповідей ШІ|Настройте генерацию и отображение ответов ИИ
Capture Method|Спосіб захоплення|Способ захвата
Screenshot Mode: Quickly capture the entire screen with one click.|Режим знімка: захоплює весь екран одним натисканням.|Режим снимка: захватывает весь экран одним нажатием.
Selection Mode: Click and drag to select a specific area to capture.|Режим області: натисніть і перетягніть, щоб вибрати область.|Режим области: нажмите и перетащите, чтобы выбрать область.
Screenshot Mode|Режим знімка екрана|Режим снимка экрана
Selection Mode|Режим вибраної області|Режим выбранной области
Processing Mode|Режим обробки|Режим обработки
Screenshots will be captured and automatically added to your attached files. You can then submit them with your own prompt. you can capture multiple screenshots and submit them later.|Знімки автоматично додаються до вкладень. Ви можете зробити кілька знімків і надіслати їх пізніше зі своїм запитом.|Снимки автоматически добавляются во вложения. Вы можете сделать несколько снимков и отправить их позже со своим запросом.
Screenshots will be automatically submitted to AI using your custom prompt. No manual intervention required. only one screenshot can be submitted at a time.|Знімки автоматично надсилаються ШІ з вашим запитом. За раз можна надіслати один знімок.|Снимки автоматически отправляются ИИ с вашим запросом. За раз можно отправить один снимок.
Mode|Режим|Режим
Auto Mode|Автоматичний режим|Автоматический режим
Auto Prompt|Автоматичний запит|Автоматический запрос
Enter prompt for automatic screenshot analysis...|Введіть запит для автоматичного аналізу знімків…|Введите запрос для автоматического анализа снимков…
This prompt will be used automatically when screenshots are taken|Цей запит використовуватиметься автоматично для знімків екрана|Этот запрос будет использоваться автоматически для снимков экрана
Screenshot mode captures the full screen with one click.|Режим знімка захоплює весь екран одним натисканням.|Режим снимка захватывает весь экран одним нажатием.
Selection mode lets you choose specific areas to capture.|Режим області дає змогу вибрати окрему ділянку екрана.|Режим области позволяет выбрать отдельный участок экрана.
Auto mode is great for quick analysis, manual mode gives you more control.|Автоматичний режим зручний для швидкого аналізу, ручний дає більше контролю.|Автоматический режим удобен для быстрого анализа, ручной даёт больше контроля.
Manage your screenshot settings|Керуйте налаштуваннями знімків екрана|Управляйте настройками снимков экрана
Always On Top Mode|Поверх усіх вікон|Поверх всех окон
Control whether the window stays above all other applications|Керуйте відображенням вікна поверх інших застосунків|Управляйте отображением окна поверх других приложений
Disable Always On Top|Вимкнути відображення поверх усіх вікон|Выключить отображение поверх всех окон
Enable Always On Top|Увімкнути відображення поверх усіх вікон|Включить отображение поверх всех окон
Window stays above all other applications (default)|Вікно залишається поверх усіх застосунків (стандартно)|Окно остаётся поверх всех приложений (по умолчанию)
Window behaves like normal applications|Вікно поводиться як звичайний застосунок|Окно ведёт себя как обычное приложение
Enabled|Увімкнено|Включено
Disabled|Вимкнено|Выключено
App Icon Stealth Mode|Приховування значка застосунку|Скрытие значка приложения
Control dock/taskbar icon visibility when window is hidden for maximum discretion|Керуйте видимістю значка в Dock/панелі завдань, коли вікно приховано|Управляйте видимостью значка в Dock/панели задач, когда окно скрыто
Show Icon in Dock/Taskbar|Показати значок у Dock/панелі завдань|Показать значок в Dock/панели задач
Hide Icon from Dock/Taskbar|Сховати значок у Dock/панелі завдань|Скрыть значок в Dock/панели задач
Visible|Видимий|Видимый
Hidden|Прихований|Скрытый
Toggle app icon visibility|Перемкнути видимість значка застосунку|Переключить видимость значка приложения
Launch on Startup|Запуск разом із системою|Запуск вместе с системой
Automatically open Fluely when your system starts|Автоматично відкривати Fluely під час запуску системи|Автоматически открывать Fluely при запуске системы
Open on Start|Відкривати під час запуску|Открывать при запуске
Fluely will launch automatically on system startup|Fluely запускатиметься автоматично разом із системою|Fluely будет запускаться автоматически вместе с системой
Fluely will not launch automatically|Fluely не запускатиметься автоматично|Fluely не будет запускаться автоматически
Toggle autostart|Перемкнути автозапуск|Переключить автозапуск
Delete Chat History|Видалити історію чатів|Удалить историю чатов
Permanently delete all your chat conversations and history. This action cannot be undone and will remove all stored conversations from your local storage.|Назавжди видаліть усі чати та їхню історію. Дію неможливо скасувати: усі збережені розмови буде видалено з локального сховища.|Навсегда удалите все чаты и их историю. Действие невозможно отменить: все сохранённые разговоры будут удалены из локального хранилища.
✅ All chat history has been successfully deleted.|✅ Усю історію чатів видалено.|✅ Вся история чатов удалена.
Delete all chat history|Видалити всю історію чатів|Удалить всю историю чатов
Deleting...|Видалення…|Удаление…
Delete All Chats|Видалити всі чати|Удалить все чаты
Delete All Chat History|Видалити всю історію чатів|Удалить всю историю чатов
Are you sure you want to delete all chat history? This action cannot be undone and will permanently remove all stored conversations.|Видалити всю історію чатів? Дію неможливо скасувати: усі збережені розмови буде видалено назавжди.|Удалить всю историю чатов? Действие невозможно отменить: все сохранённые разговоры будут удалены навсегда.
Delete All|Видалити все|Удалить всё
Could not save and verify the key in secure storage. Provider settings were not changed.|Не вдалося зберегти й перевірити ключ у захищеному сховищі. Налаштування провайдера не змінено.|Не удалось сохранить и проверить ключ в защищённом хранилище. Настройки провайдера не изменены.
OpenAI / compatible API|OpenAI / сумісний API|OpenAI / совместимый API
Local Whisper (compatible server)|Локальний Whisper (сумісний сервер)|Локальный Whisper (совместимый сервер)
Windows: offline recognition|Windows: офлайн-розпізнавання|Windows: офлайн-распознавание
Custom cURL request|Власний запит cURL|Свой запрос cURL
Variables must be a valid JSON object.|Змінні мають бути коректним JSON-об’єктом.|Переменные должны быть корректным JSON-объектом.
Variables must be a JSON object with string values.|Змінні мають бути JSON-об’єктом із текстовими значеннями.|Переменные должны быть JSON-объектом с текстовыми значениями.
Provide a provider ID and model.|Укажіть ідентифікатор і модель провайдера.|Укажите идентификатор и модель провайдера.
Provide a valid base URL.|Укажіть коректну базову URL-адресу.|Укажите корректный базовый URL-адрес.
The base URL must use HTTP(S) without embedded keys.|Базова адреса має бути HTTP(S) без вбудованих ключів.|Базовый адрес должен использовать HTTP(S) без встроенных ключей.
Priority must be an integer.|Пріоритет має бути цілим числом.|Приоритет должен быть целым числом.
Limits must be non-negative integers; 0 means unlimited.|Ліміти мають бути невід’ємними цілими числами; 0 означає без обмежень.|Лимиты должны быть неотрицательными целыми числами; 0 означает без ограничений.
Enter keys and tokens in the secure API key field, not in variables.|Ключі й токени вводьте в захищене поле API-ключа, а не в змінні.|Ключи и токены вводите в защищённое поле API-ключа, а не в переменные.
Theme Customization|Налаштування теми|Настройка темы
Personalize your experience with custom theme and transparency settings|Налаштуйте тему й прозорість на свій смак|Настройте тему и прозрачность по своему вкусу
Light Mode|Світлий режим|Светлый режим
Dark Mode|Темний режим|Тёмный режим
Using light theme for better visibility in bright environments|Світла тема для кращої видимості за яскравого освітлення|Светлая тема для лучшей видимости при ярком освещении
Using dark theme for comfortable viewing in low light|Темна тема для комфортного перегляду за слабкого освітлення|Тёмная тема для комфортного просмотра при слабом освещении
Light|Світла|Светлая
Dark|Темна|Тёмная
Window Transparency|Прозорість вікна|Прозрачность окна
Adjust the transparency level of the application window|Налаштуйте рівень прозорості вікна застосунку|Настройте уровень прозрачности окна приложения
💡 Tip: Higher transparency lets you see through the window, perfect for dark overlay. Changes apply immediately.|💡 Порада: більша прозорість дає змогу бачити крізь вікно. Зміни застосовуються одразу.|💡 Совет: большая прозрачность позволяет видеть сквозь окно. Изменения применяются сразу.
Cursor|Курсор|Курсор
Control Fluely cursor visibility|Керуйте видимістю курсора Fluely|Управляйте видимостью курсора Fluely
Select a cursor type|Виберіть тип курсора|Выберите тип курсора
Invisible (|Невидимий (|Невидимый (
Not supported on Linux|Не підтримується в Linux|Не поддерживается в Linux
Default (|Стандартний (|Стандартный (
Auto (|Автоматичний (|Автоматический (
Failed to reset shortcuts. Please try again.|Не вдалося скинути гарячі клавіші. Спробуйте ще раз.|Не удалось сбросить горячие клавиши. Попробуйте ещё раз.
Reset all shortcuts to platform defaults|Відновити стандартні гарячі клавіші для платформи|Восстановить стандартные горячие клавиши для платформы
Change this shortcut|Змінити цю гарячу клавішу|Изменить эту горячую клавишу
Change|Змінити|Изменить
💡 Shortcuts work globally, even when the app is hidden|💡 Гарячі клавіші працюють глобально, навіть коли застосунок приховано|💡 Горячие клавиши работают глобально, даже когда приложение скрыто
Arrow keys are automatic for Move Window. Only set modifiers.|Для переміщення вікна стрілки працюють автоматично. Задайте лише модифікатори.|Для перемещения окна стрелки работают автоматически. Задайте только модификаторы.
Must include at least one modifier (Cmd/Ctrl/Alt/Shift)|Потрібен принаймні один модифікатор (Cmd/Ctrl/Alt/Shift)|Требуется хотя бы один модификатор (Cmd/Ctrl/Alt/Shift)
Must include at least one modifier (Cmd/Ctrl/Alt/Shift) and one key|Потрібен принаймні один модифікатор (Cmd/Ctrl/Alt/Shift) і одна клавіша|Требуется хотя бы один модификатор (Cmd/Ctrl/Alt/Shift) и одна клавиша
Move Window needs at least one modifier|Для переміщення вікна потрібен принаймні один модифікатор|Для перемещения окна требуется хотя бы один модификатор
Shortcut must have at least one modifier and one key|Гаряча клавіша має містити принаймні один модифікатор і одну клавішу|Горячая клавиша должна содержать хотя бы один модификатор и одну клавишу
Invalid shortcut combination|Некоректне поєднання клавіш|Некорректное сочетание клавиш
This shortcut combination is not supported|Це поєднання клавіш не підтримується|Это сочетание клавиш не поддерживается
Failed to validate shortcut|Не вдалося перевірити гарячу клавішу|Не удалось проверить горячую клавишу
Waiting for keys...|Очікування клавіш…|Ожидание клавиш…
Save shortcut|Зберегти гарячу клавішу|Сохранить горячую клавишу
Press modifier keys (e.g., Cmd+Shift). Arrow keys work automatically.|Натисніть модифікатори (наприклад, Cmd+Shift). Стрілки працюють автоматично.|Нажмите модификаторы (например, Cmd+Shift). Стрелки работают автоматически.
Press a key combination now (e.g., Cmd+Shift+K)|Натисніть поєднання клавіш (наприклад, Cmd+Shift+K)|Нажмите сочетание клавиш (например, Cmd+Shift+K)
✓ Shortcut captured! Click "Save" to apply.|✓ Гарячу клавішу записано! Натисніть «Зберегти», щоб застосувати.|✓ Горячая клавиша записана! Нажмите «Сохранить», чтобы применить.
Cursor & Keyboard Shortcuts|Курсор і гарячі клавіші|Курсор и горячие клавиши
Manage your cursor and keyboard shortcuts|Керуйте курсором і гарячими клавішами|Управляйте курсором и горячими клавишами
Enter a name for the system prompt|Введіть назву системної інструкції|Введите название системной инструкции
You are a helpful AI assistant. Be concise, accurate, and friendly in your responses...|Ви — корисний помічник ШІ. Відповідайте стисло, точно й доброзичливо…|Вы — полезный помощник ИИ. Отвечайте кратко, точно и доброжелательно…
Delete this prompt|Видалити цю інструкцію|Удалить эту инструкцию
Updating...|Оновлення…|Обновление…
Creating...|Створення…|Создание…
Create|Створити|Создать
Edit System Prompt|Редагувати системну інструкцію|Редактировать системную инструкцию
Create System Prompt|Створити системну інструкцію|Создать системную инструкцию
Update your system prompt details below.|Оновіть системну інструкцію нижче.|Обновите системную инструкцию ниже.
Define a new AI behavior and personality.|Задайте нову поведінку й роль ШІ.|Задайте новое поведение и роль ИИ.
Name|Назва|Название
e.g., Code Review Expert, Creative Writer...|Наприклад, експерт із перевірки коду, письменник…|Например, эксперт по проверке кода, писатель…
System Prompt|Системна інструкція|Системная инструкция
💡 Tip: Be specific about tone, expertise level, and response format|💡 Порада: уточніть тон, рівень знань і формат відповіді|💡 Совет: уточните тон, уровень знаний и формат ответа
Delete System Prompt|Видалити системну інструкцію|Удалить системную инструкцию
Are you sure you want to delete "|Видалити «|Удалить «
This action cannot be undone. This will permanently delete the system prompt from the database.|Дію неможливо скасувати. Системну інструкцію буде назавжди видалено з бази даних.|Действие невозможно отменить. Системная инструкция будет навсегда удалена из базы данных.
Please describe what you want|Опишіть, що вам потрібно|Опишите, что вам нужно
Please select an AI provider in Dev Space first|Спочатку виберіть провайдера ШІ в налаштуваннях провайдерів|Сначала выберите провайдера ИИ в настройках провайдеров
Failed to generate prompt|Не вдалося згенерувати інструкцію|Не удалось сгенерировать инструкцию
Generate with AI|Згенерувати за допомогою ШІ|Сгенерировать с помощью ИИ
Generate a system prompt|Згенерувати системну інструкцію|Сгенерировать системную инструкцию
Describe the AI behavior you want, and we'll generate a prompt for you.|Опишіть бажану поведінку ШІ, і ми згенеруємо інструкцію.|Опишите желаемое поведение ИИ, и мы сгенерируем инструкцию.
e.g., I want an AI that helps me with code reviews and focuses on best practices...|Наприклад, мені потрібен ШІ для перевірки коду з увагою до найкращих практик…|Например, мне нужен ИИ для проверки кода с вниманием к лучшим практикам…
Generate|Згенерувати|Сгенерировать
System Prompts|Системні інструкції|Системные инструкции
Manage your AI behavior profiles and create new ones|Керуйте профілями поведінки ШІ й створюйте нові|Управляйте профилями поведения ИИ и создавайте новые
Search system prompts...|Пошук системних інструкцій…|Поиск системных инструкций…
Create New|Створити нову|Создать новую
No prompts found|Інструкцій не знайдено|Инструкции не найдены
Create a new prompt to get started|Створіть нову інструкцію, щоб почати|Создайте новую инструкцию, чтобы начать
General|Загальний|Общий
Default|Стандартний|Стандартный
Interview|Співбесіда|Собеседование
Coding|Програмування|Программирование
Translate|Переклад|Перевод
Meeting|Зустріч|Встреча
Default Prompts|Стандартні інструкції|Стандартные инструкции
Pre-configured presets. Selecting a prompt sets the system prompt. Configure your own AI provider in Dev Space.|Готові шаблони. Вибір шаблону задає системну інструкцію. Налаштуйте власного провайдера ШІ в налаштуваннях провайдерів.|Готовые шаблоны. Выбор шаблона задаёт системную инструкцию. Настройте своего провайдера ИИ в настройках провайдеров.
Template name|Назва шаблону|Название шаблона
Template instruction|Інструкція шаблону|Инструкция шаблона
Save template|Зберегти шаблон|Сохранить шаблон
Short|Коротка|Короткий
Medium|Середня|Средний
Auto|Автоматично|Автоматически
Best for quick answers, summaries, and when you need to save time|Для швидких відповідей, підсумків та економії часу|Для быстрых ответов, итогов и экономии времени
Balanced responses with adequate explanations for most tasks|Збалансовані відповіді з достатніми поясненнями для більшості завдань|Сбалансированные ответы с достаточными пояснениями для большинства задач
AI determines the best length based on your question's complexity|ШІ визначає довжину відповідно до складності запитання|ИИ определяет длину в зависимости от сложности вопроса
English|Англійська|Английский
Spanish|Іспанська|Испанский
French|Французька|Французский
German|Німецька|Немецкий
Italian|Італійська|Итальянский
Portuguese|Португальська|Португальский
Dutch|Нідерландська|Нидерландский
Russian|Російська|Русский
Chinese|Китайська|Китайский
Japanese|Японська|Японский
Korean|Корейська|Корейский
Arabic|Арабська|Арабский
Turkish|Турецька|Турецкий
Polish|Польська|Польский
Swedish|Шведська|Шведский
Norwegian|Норвезька|Норвежский
Danish|Данська|Датский
Finnish|Фінська|Финский
Greek|Грецька|Греческий
Czech|Чеська|Чешский
Hungarian|Угорська|Венгерский
Romanian|Румунська|Румынский
Ukrainian|Українська|Украинский
Vietnamese|В’єтнамська|Вьетнамский
Thai|Тайська|Тайский
Indonesian|Індонезійська|Индонезийский
Malay|Малайська|Малайский
Hebrew|Іврит|Иврит
Filipino|Філіппінська|Филиппинский
Real-time Translator|Перекладач у реальному часі|Переводчик в реальном времени
Meeting Assistant|Помічник на зустрічах|Помощник на встречах
Interview Assistant|Помічник на співбесідах|Помощник на собеседованиях
Technical Interview Helper|Помічник на технічних співбесідах|Помощник на технических собеседованиях
Presentation Coach|Тренер презентацій|Тренер презентаций
Learning Assistant|Помічник у навчанні|Помощник в обучении
Customer Call Helper|Помічник у розмовах із клієнтами|Помощник в разговорах с клиентами
General Assistant|Універсальний помічник|Универсальный помощник
mode|режим|режим
s|с|с
min|хв|мин
start|почати|начать
send|надіслати|отправить
discard|відкинути|отбросить
Messages: {count}|Повідомлень: {count}|Сообщений: {count}
Configured shortcuts: {count}|Налаштованих гарячих клавіш: {count}|Настроенных горячих клавиш: {count}
Shortcut "{key}" is already used by: {actions}|Гаряча клавіша «{key}» уже використовується: {actions}|Горячая клавиша «{key}» уже используется: {actions}
Failed to apply shortcuts: {error}|Не вдалося застосувати гарячі клавіші: {error}|Не удалось применить горячие клавиши: {error}
Failed to process audio: {error}|Не вдалося обробити аудіо: {error}|Не удалось обработать аудио: {error}
Failed to start recording: {error}|Не вдалося почати запис: {error}|Не удалось начать запись: {error}
Failed to ignore recording: {error}|Не вдалося відкинути запис: {error}|Не удалось отбросить запись: {error}
Failed to stop capture: {error}|Не вдалося зупинити захоплення: {error}|Не удалось остановить захват: {error}
Failed to manually stop: {error}|Не вдалося зупинити вручну: {error}|Не удалось остановить вручную: {error}
Failed to setup speech listener|Не вдалося налаштувати обробку мовлення|Не удалось настроить обработку речи
You can only upload {count} files|Можна завантажити лише {count} файлів|Можно загрузить только {count} файлов
Enable auto-scroll|Увімкнути автопрокручування|Включить автопрокрутку
Disable auto-scroll|Вимкнути автопрокручування|Выключить автопрокрутку
Enable always on top|Увімкнути поверх усіх вікон|Включить поверх всех окон
Disable always on top|Вимкнути поверх усіх вікон|Выключить поверх всех окон
Show app icon|Показати значок застосунку|Показать значок приложения
Hide app icon|Сховати значок застосунку|Скрыть значок приложения
Method: {method} · URL: {url}|Метод: {method} · URL: {url}|Метод: {method} · URL: {url}
Enter your {provider} API key|Введіть API-ключ {provider}|Введите API-ключ {provider}
Set your preferred {variable}|Задайте бажане значення {variable}|Задайте желаемое значение {variable}
Enter {variable}|Введіть {variable}|Введите {variable}
Response Path: {path}|Шлях до відповіді: {path}|Путь к ответу: {path}
Enable Fluely in System Settings ({attempt}/20)|Увімкніть Fluely в системних налаштуваннях ({attempt}/20)|Включите Fluely в системных настройках ({attempt}/20)
Error: {error}|Помилка: {error}|Ошибка: {error}
Local engines|Локальні рушії|Локальные движки
Local brain|Локальна модель мислення|Локальная модель мышления
Local Whisper speech recognition|Локальне розпізнавання мовлення Whisper|Локальное распознавание речи Whisper
Local visual understanding|Локальний аналіз зображень|Локальный анализ изображений
Choose a small instruct GGUF model. For an 8 GB PC, start with 0.5–1.5B parameters, 4 threads and 2048 context tokens.|Виберіть невелику інструктивну модель GGUF. Для ПК із 8 ГБ почніть із 0,5–1,5 млрд параметрів, 4 потоків і 2048 токенів контексту.|Выберите небольшую инструктивную модель GGUF. Для ПК с 8 ГБ начните с 0,5–1,5 млрд параметров, 4 потоков и 2048 токенов контекста.
Whisper uses whisper.cpp GGML .bin models, not arbitrary GGUF files. The multilingual base model supports Ukrainian, Russian and English.|Whisper використовує моделі whisper.cpp GGML .bin, а не довільні GGUF-файли. Багатомовна базова модель підтримує українську, російську й англійську.|Whisper использует модели whisper.cpp GGML .bin, а не произвольные GGUF-файлы. Многоязычная базовая модель поддерживает украинский, русский и английский.
Choose a vision GGUF model and its matching mmproj projector. SmolVLM2 500M is a lightweight starting point; larger models can understand more detail.|Виберіть візуальну модель GGUF і відповідний проєктор mmproj. SmolVLM2 500M — легкий початковий варіант; більші моделі розуміють більше деталей.|Выберите визуальную модель GGUF и соответствующий проектор mmproj. SmolVLM2 500M — лёгкий начальный вариант; более крупные модели понимают больше деталей.
Run independent brain, speech and vision models on this PC. Servers listen only on 127.0.0.1. Start each engine explicitly; nothing records or loads automatically.|Запускайте окремі моделі мислення, мовлення й зору на цьому ПК. Сервери слухають лише 127.0.0.1. Кожен рушій потрібно запустити вручну; автоматичного запису чи завантаження немає.|Запускайте отдельные модели мышления, речи и зрения на этом ПК. Серверы слушают только 127.0.0.1. Каждый движок нужно запустить вручную; автоматической записи или загрузки нет.
The CPU engine downloader installs verified official llama.cpp (about 20 MB) or whisper.cpp (about 9 MB) releases. Model downloads are separate and can be much larger; check their size and license first.|Завантажувач CPU-рушіїв встановлює перевірені офіційні випуски llama.cpp (близько 20 МБ) або whisper.cpp (близько 9 МБ). Моделі завантажуються окремо й можуть бути значно більшими; спочатку перевірте розмір і ліцензію.|Загрузчик CPU-движков устанавливает проверенные официальные выпуски llama.cpp (около 20 МБ) или whisper.cpp (около 9 МБ). Модели загружаются отдельно и могут быть значительно больше; сначала проверьте размер и лицензию.
For simple offline speech without a downloaded model, add a Windows system speech provider in Speech recognition settings. Only installed Windows recognizers are available.|Для простого офлайн-розпізнавання без завантаженої моделі додайте системного провайдера мовлення Windows у налаштуваннях розпізнавання. Доступні лише встановлені розпізнавачі Windows.|Для простого офлайн-распознавания без загруженной модели добавьте системного провайдера речи Windows в настройках распознавания. Доступны только установленные распознаватели Windows.
Loading local engine settings…|Завантаження налаштувань локальних рушіїв…|Загрузка настроек локальных движков…
Browse|Огляд|Обзор
Running|Працює|Работает
Starting|Запускається|Запускается
Stopped|Зупинено|Остановлен
Engine executable|Виконуваний файл рушія|Исполняемый файл движка
Model file|Файл моделі|Файл модели
Matching visual projector|Відповідний візуальний проєктор|Соответствующий визуальный проектор
Port|Порт|Порт
CPU threads|Потоки CPU|Потоки CPU
Context tokens|Токени контексту|Токены контекста
GPU layers (0 = CPU)|Шари GPU (0 = CPU)|Слои GPU (0 = CPU)
Speech language|Мова мовлення|Язык речи
Automatic language detection|Автоматичне визначення мови|Автоматическое определение языка
GPU acceleration needs a compatible engine build. The bundled CPU download works with GPU layers set to 0.|Для прискорення GPU потрібна сумісна збірка рушія. Завантажена CPU-збірка працює зі значенням шарів GPU 0.|Для ускорения GPU нужна совместимая сборка движка. Загруженная CPU-сборка работает со значением слоёв GPU 0.
Start|Запустити|Запустить
Stop|Зупинити|Остановить
Test|Перевірити|Проверить
Local engine settings saved|Налаштування локального рушія збережено|Настройки локального движка сохранены
Local engine is ready and registered as a provider|Локальний рушій готовий і зареєстрований як провайдер|Локальный движок готов и зарегистрирован как провайдер
Local engine stopped|Локальний рушій зупинено|Локальный движок остановлен
Local server is healthy and its model is loaded|Локальний сервер працює, модель завантажена|Локальный сервер работает, модель загружена
Official CPU engine installed. Select a model file before starting.|Офіційний CPU-рушій встановлено. Перед запуском виберіть файл моделі.|Официальный CPU-движок установлен. Перед запуском выберите файл модели.
Download CPU engine|Завантажити CPU-рушій|Скачать CPU-движок
Find compatible models|Знайти сумісні моделі|Найти совместимые модели
Loading the model. A large model can take up to two minutes.|Завантаження моделі. Велика модель може завантажуватися до двох хвилин.|Загрузка модели. Большая модель может загружаться до двух минут.
Engine log|Журнал рушія|Журнал движка
Invalid native microphone audio|Некоректні аудіодані мікрофона|Некорректные аудиоданные микрофона
Manage your settings|Керуйте налаштуваннями|Управляйте настройками
Brain|Мислення|Мышление
Speech recognition|Розпізнавання мовлення|Распознавание речи
Speech playback|Озвучення|Озвучивание
Image analysis|Аналіз зображень|Анализ изображений
Per second|За секунду|За секунду
Per minute|За хвилину|За минуту
Per hour|За годину|За час
Per day|За добу|За сутки
Could not load some settings. Reopen this page.|Не вдалося завантажити частину налаштувань. Відкрийте цю сторінку повторно.|Не удалось загрузить часть настроек. Откройте эту страницу повторно.
Provider saved.|Провайдера збережено.|Провайдер сохранён.
Could not save the provider. Check the address, model and cURL template; keys in the template must be variables.|Не вдалося зберегти провайдера. Перевірте адресу, модель та шаблон cURL; ключі в шаблоні мають бути змінними.|Не удалось сохранить провайдера. Проверьте адрес, модель и шаблон cURL; ключи в шаблоне должны быть переменными.
Provider deleted.|Провайдера видалено.|Провайдер удалён.
Could not delete the provider.|Не вдалося видалити провайдера.|Не удалось удалить провайдера.
Loading settings…|Завантаження налаштувань…|Загрузка настроек…
Providers and models|Провайдери й моделі|Провайдеры и модели
A lower priority means the first attempt. After an error or a limit is reached, the next model handles the request.|Нижчий пріоритет означає першу спробу. Після помилки або вичерпання ліміту наступна модель підхоплює запит.|Меньший приоритет означает первую попытку. После ошибки или исчерпания лимита следующая модель подхватывает запрос.
priority|пріоритет|приоритет
enabled|увімкнено|включён
disabled|вимкнено|выключен
No providers of this type yet.|Провайдерів цього типу ще немає.|Провайдеров этого типа пока нет.
Add provider|Додати провайдера|Добавить провайдера
Service preset|Шаблон сервісу|Шаблон сервиса
Model|Модель|Модель
Models loaded. Select a model in the field above.|Список моделей завантажено. Виберіть модель у полі вище.|Список моделей загружен. Выберите модель в поле выше.
Could not load models. Check the address and key.|Не вдалося отримати список моделей. Перевірте адресу та ключ.|Не удалось получить список моделей. Проверьте адрес и ключ.
Load models|Завантажити моделі|Загрузить модели
Base URL|Базова URL-адреса|Базовый URL-адрес
Priority|Пріоритет|Приоритет
API key|API-ключ|API-ключ
The key is saved in secure storage. An empty field keeps the existing key.|Ключ зберігається в захищеному сховищі. Порожнє поле залишає наявний ключ.|Ключ хранится в защищённом хранилище. Пустое поле сохраняет имеющийся ключ.
Key already saved|Ключ уже збережено|Ключ уже сохранён
Enter a key if required|Введіть ключ, якщо потрібен|Введите ключ, если требуется
Provider enabled|Провайдер увімкнений|Провайдер включён
Supports images|Підтримує зображення|Поддерживает изображения
Streaming response|Потокова відповідь|Потоковый ответ
Request limits · 0 means unlimited|Ліміти запитів · 0 — без обмежень|Лимиты запросов · 0 — без ограничений
Custom request and variables|Власний запит і змінні|Свой запрос и переменные
cURL template|Шаблон cURL|Шаблон cURL
Header key: Authorization: Bearer {{API_KEY}}. Do not paste the key directly into the template.|Ключ у заголовку: Authorization: Bearer {{API_KEY}}. Не вставляйте ключ безпосередньо в шаблон.|Ключ в заголовке: Authorization: Bearer {{API_KEY}}. Не вставляйте ключ непосредственно в шаблон.
Response text path|Шлях до тексту відповіді|Путь к тексту ответа
Non-secret JSON variables|Несекретні змінні JSON|Несекретные переменные JSON
Example: {"LANGUAGE":"uk"}. Do not add API keys or tokens here.|Наприклад: {"LANGUAGE":"uk"}. API-ключі й токени сюди не додавайте.|Например: {"LANGUAGE":"uk"}. API-ключи и токены сюда не добавляйте.
Save provider|Зберегти провайдера|Сохранить провайдера
Shared limits and neutral mode|Спільні ліміти й нейтральний режим|Общие лимиты и нейтральный режим
Shared limits saved.|Спільні ліміти збережено.|Общие лимиты сохранены.
Could not save shared limits.|Не вдалося зберегти спільні ліміти.|Не удалось сохранить общие лимиты.
Shared budget for all providers. 0 means unlimited; requests are counted over the last second, minute, hour and day.|Спільний бюджет для всіх провайдерів. 0 — без обмежень; використані запити враховуються за останню секунду, хвилину, годину та добу.|Общий бюджет для всех провайдеров. 0 — без ограничений; использованные запросы учитываются за последнюю секунду, минуту, час и сутки.
Neutral mode: pause all requests|Нейтральний режим: призупинити всі запити|Нейтральный режим: приостановить все запросы
Save limits|Зберегти ліміти|Сохранить лимиты
Screenshots and audio|Знімки екрана й аудіо|Снимки экрана и аудио
Screenshot and audio settings saved.|Налаштування знімків та аудіо збережено.|Настройки снимков и аудио сохранены.
Could not save screenshot and audio settings.|Не вдалося зберегти налаштування знімків та аудіо.|Не удалось сохранить настройки снимков и аудио.
Screenshot capture mode|Режим знімків|Режим снимков
At intervals|Через інтервал|Через интервал
After speech|Після мовлення|После речи
Interval, seconds|Інтервал, секунд|Интервал, секунд
Display|Екран|Экран
Primary display|Основний екран|Основной экран
All displays|Усі екрани|Все экраны
By identifier|За ідентифікатором|По идентификатору
Display identifier|Ідентифікатор екрана|Идентификатор экрана
Maximum frames per request|Максимум кадрів у запиті|Максимум кадров в запросе
Longer screenshot side, pixels|Довша сторона знімка, пікселів|Длинная сторона снимка, пикселей
JPEG quality|Якість JPEG|Качество JPEG
Duplicate threshold|Поріг однакових кадрів|Порог одинаковых кадров
Maximum wait, seconds|Максимальне очікування, секунд|Максимальное ожидание, секунд
System sound|Звук системи|Звук системы
Save screenshots and audio|Зберегти знімки й аудіо|Сохранить снимки и аудио
Screen context for text models|Екран для текстових моделей|Экран для текстовых моделей
Screen analysis saved.|Аналіз екрана збережено.|Анализ экрана сохранён.
Could not save screen analysis.|Не вдалося зберегти аналіз екрана.|Не удалось сохранить анализ экрана.
How to analyze the screen|Як аналізувати екран|Как анализировать экран
OCR and interface tree|OCR та дерево інтерфейсу|OCR и дерево интерфейса
Visual model|Візуальна модель|Визуальная модель
OCR, interface and visual model|OCR, інтерфейс та візуальна модель|OCR, интерфейс и визуальная модель
Maximum context characters|Максимум символів контексту|Максимум символов контекста
Interface tree depth|Глибина дерева інтерфейсу|Глубина дерева интерфейса
Save screen analysis|Зберегти аналіз екрана|Сохранить анализ экрана
Answer speech playback|Озвучення відповіді|Озвучивание ответа
Speech settings saved.|Налаштування озвучення збережено.|Настройки озвучивания сохранены.
Could not save speech settings.|Не вдалося зберегти налаштування озвучення.|Не удалось сохранить настройки озвучивания.
Speech playback enabled|Озвучення увімкнено|Озвучивание включено
Speech backend|Спосіб озвучення|Способ озвучивания
System voice|Системний голос|Системный голос
Piper — local voice|Piper — локальний голос|Piper — локальный голос
Cloud TTS provider|Хмарний провайдер TTS|Облачный провайдер TTS
Voice|Голос|Голос
Leave empty to use the default system voice.|Для системного голосу можна залишити порожнім.|Для системного голоса можно оставить пустым.
Language|Мова|Язык
Speed|Швидкість|Скорость
Read completed sentences as the response arrives|Читати завершені речення під час надходження відповіді|Читать завершённые предложения по мере поступления ответа
Piper executable|Програма Piper|Программа Piper
Install Piper locally. Enter the .onnx model path in the Voice field.|Встановіть Piper локально. У полі «Голос» укажіть шлях до .onnx моделі.|Установите Piper локально. В поле «Голос» укажите путь к .onnx модели.
Save speech playback|Зберегти озвучення|Сохранить озвучивание
Overlay appearance|Вигляд накладеного інтерфейсу|Вид накладываемого интерфейса
Interface appearance saved.|Вигляд інтерфейсу збережено.|Вид интерфейса сохранён.
Could not apply all interface settings.|Не вдалося застосувати всі налаштування інтерфейсу.|Не удалось применить все настройки интерфейса.
Control layout|Розташування керування|Расположение управления
Side strips|Бічні смуги|Боковые полосы
Top and bottom strips|Верхня та нижня смуги|Верхняя и нижняя полосы
Separate buttons|Окремі кнопки|Отдельные кнопки
Shimmer period, seconds|Період переливання, секунд|Период переливания, секунд
Chat transparency: {percent}%|Прозорість чату: {percent}%|Прозрачность чата: {percent}%
Strip transparency: {percent}%|Прозорість смуг: {percent}%|Прозрачность полос: {percent}%
Button "{action}" transparency: {percent}%|Прозорість кнопки «{action}»: {percent}%|Прозрачность кнопки «{action}»: {percent}%
Chat becomes opaque in interaction mode.|У режимі переміщення чат стає непрозорим.|В режиме перемещения чат становится непрозрачным.
The chat passes clicks through. Press Shift + \ to move, resize and type. Press again or Escape to return to passive mode. Change the Chat movement and interaction shortcut on the shortcuts page.|Чат пропускає кліки. Натисніть Shift + \ для переміщення, зміни розміру й введення. Повторне натискання або Escape повертає прозорий режим. Окрему комбінацію «Переміщення та взаємодія з чатом» можна змінити на сторінці гарячих клавіш.|Чат пропускает клики. Нажмите Shift + \ для перемещения, изменения размера и ввода. Повторное нажатие или Escape возвращает прозрачный режим. Комбинацию «Перемещение и взаимодействие с чатом» можно изменить на странице горячих клавиш.
Color shimmer|Переливання кольорів|Переливание цветов
Save appearance|Зберегти вигляд|Сохранить вид
Model instructions|Інструкції для моделі|Инструкции для модели
Instructions saved.|Інструкції збережено.|Инструкции сохранены.
Could not save instructions.|Не вдалося зберегти інструкції.|Не удалось сохранить инструкции.
System instruction|Системна інструкція|Системная инструкция
Response structure|Структура відповіді|Структура ответа
Keep the <main>, <side> and <speak> tags to separate the solution, explanation and speech playback.|Залиште теги <main>, <side> і <speak>, щоб розділити розв’язок, пояснення та озвучення.|Оставьте теги <main>, <side> и <speak>, чтобы разделить решение, пояснение и озвучивание.
Save instructions|Зберегти інструкції|Сохранить инструкции
Listen|Слухати|Слушать
Continuous screenshots|Безперервні знімки|Непрерывные снимки
Answer|Відповідь|Ответ
Chat|Чат|Чат
Panel mode|Режим панелей|Режим панелей
Connecting…|Підключення…|Подключение…
Requests paused|Запити призупинено|Запросы приостановлены
Preparing an answer…|Готуємо відповідь…|Готовим ответ…
Listening now|Слухаємо|Слушаем
Wait: {seconds} s|Очікування: {seconds} с|Ожидание: {seconds} с
Neutral mode · {seconds} s|Нейтральний режим · {seconds} с|Нейтральный режим · {seconds} с
Close answer|Закрити відповідь|Закрыть ответ
Main · MAIN|Основне · MAIN|Основное · MAIN
Details · SIDE|Додатково · SIDE|Дополнительно · SIDE
Speech · SPEAK|Озвучення · SPEAK|Озвучивание · SPEAK
Back|Назад|Назад
Speech back|Озвучення назад|Озвучивание назад
Resume speech|Продовжити озвучення|Продолжить озвучивание
Forward|Вперед|Вперёд
Speech forward|Озвучення вперед|Озвучивание вперёд
Chat history ({count})|Історія чату ({count})|История чата ({count})
Enter a question|Ввести запит|Ввести запрос
Ask…|Запитайте…|Спросите…
Assistant request|Запит до помічника|Запрос помощнику
Send|Надіслати|Отправить
Interaction · Escape to finish|Взаємодія · Escape — завершити|Взаимодействие · Escape — завершить
{shortcut} — move and type|{shortcut} — переміщення та введення|{shortcut} — перемещение и ввод
hour|год|ч
day|доба|сутки
Toggle AI response|Перемкнути відповідь ШІ|Переключить ответ ИИ
Toggle conversation mode|Перемкнути режим розмови|Переключить режим разговора
Enter your {provider} API key to authenticate and access models. Your key is stored locally and never shared.|Введіть API-ключ {provider} для автентифікації й доступу до моделей. Ключ зберігається локально та нікому не передається.|Введите API-ключ {provider} для аутентификации и доступа к моделям. Ключ хранится локально и никому не передаётся.
Set {variable} for {provider}|Задайте {variable} для {provider}|Задайте {variable} для {provider}
Enter {provider} {variable}|Введіть {provider} {variable}|Введите {provider} {variable}
Screen Recording permission required. Please enable it by going to System Settings > Privacy & Security > Screen & System Audio Recording. If you don't see Fluely in the list, click the '+' button to add it. If it's already listed, make sure it's enabled. Then restart the app.|Потрібен дозвіл на запис екрана. Увімкніть його: Системні налаштування > Приватність і безпека > Запис екрана й системного аудіо. Якщо Fluely немає у списку, додайте його кнопкою «+». Якщо він уже є, переконайтеся, що дозвіл увімкнено. Перезапустіть застосунок.|Требуется разрешение на запись экрана. Включите его: Системные настройки > Конфиденциальность и безопасность > Запись экрана и системного аудио. Если Fluely нет в списке, добавьте его кнопкой «+». Если он уже есть, убедитесь, что разрешение включено. Перезапустите приложение.
Hide all windows|Сховати всі вікна|Скрыть все окна
Hide or restore every Fluely window, including settings and status|Сховати або відновити всі вікна Fluely, зокрема налаштування та стан|Скрыть или восстановить все окна Fluely, включая настройки и состояние
Vision|Зір|Зрение
Scene understanding (vision model)|Розуміння сцени (візуальна модель)|Понимание сцены (визуальная модель)
Process and startup name|Назва процесу й автозапуску|Имя процесса и автозапуска
Fluely keeps its own interface name. These names apply only to its own executable and startup entry.|Fluely зберігає власну назву інтерфейсу. Ці назви стосуються лише його виконуваного файлу й запису автозапуску.|Fluely сохраняет собственное имя интерфейса. Эти имена относятся только к его исполняемому файлу и записи автозапуска.
Executable filename|Ім’я виконуваного файлу|Имя исполняемого файла
Startup display name|Відображувана назва автозапуску|Отображаемое имя автозапуска
Start at Windows sign-in|Запускати під час входу у Windows|Запускать при входе в Windows
Save names|Зберегти назви|Сохранить имена
Restart with saved name|Перезапустити зі збереженою назвою|Перезапустить с сохранённым именем
Restart required|Потрібен перезапуск|Требуется перезапуск
Alias active|Власна назва активна|Своё имя активно
Current executable|Поточний виконуваний файл|Текущий исполняемый файл
Managed executable|Керований виконуваний файл|Управляемый исполняемый файл
Saved. Restart to apply the process name.|Збережено. Перезапустіть, щоб застосувати назву процесу.|Сохранено. Перезапустите, чтобы применить имя процесса.
Saving…|Збереження…|Сохранение…
No identity settings available|Налаштування назви недоступні|Настройки имени недоступны
The executable copy keeps upstream copyright and licensing. Changing metadata does not preserve an Authenticode signature.|Копія виконуваного файлу зберігає авторські права й ліцензію оригіналу. Зміна метаданих не зберігає підпис Authenticode.|Копия исполняемого файла сохраняет авторские права и лицензию оригинала. Изменение метаданных не сохраняет подпись Authenticode.
Automatic alias launch is disabled for this development/test process|Автоматичний запуск із власною назвою вимкнено для цього процесу розробки/тестування|Автоматический запуск со своим именем выключен для этого процесса разработки/тестирования
Unsupported local engine kind|Непідтримуваний тип локального рушія|Неподдерживаемый тип локального движка
Choose a port between 1024 and 65535|Виберіть порт від 1024 до 65535|Выберите порт от 1024 до 65535
Threads must be between 1 and 128|Кількість потоків має бути від 1 до 128|Количество потоков должно быть от 1 до 128
Context must be between 512 and 131072 tokens|Контекст має містити від 512 до 131072 токенів|Контекст должен содержать от 512 до 131072 токенов
GPU layers must be between 0 (CPU) and 1000|Кількість шарів GPU має бути від 0 (CPU) до 1000|Количество слоёв GPU должно быть от 0 (CPU) до 1000
Model file is missing: {path}|Файл моделі відсутній: {path}|Файл модели отсутствует: {path}
Read model: {error}|Читання моделі: {error}|Чтение модели: {error}
Model file is empty or incomplete|Файл моделі порожній або неповний|Файл модели пустой или неполный
Language must be auto or a language code such as uk/en|Мова має бути auto або кодом мови, наприклад uk/en|Язык должен быть auto или кодом языка, например uk/en
Invalid local engine path|Некоректний шлях до локального рушія|Некорректный путь к локальному движку
Engine executable is missing. Download the CPU engine or choose llama-server / whisper-server.|Виконуваний файл рушія відсутній. Завантажте CPU-рушій або виберіть llama-server / whisper-server.|Исполняемый файл движка отсутствует. Скачайте CPU-движок или выберите llama-server / whisper-server.
Engine executable must use an absolute path|Шлях до виконуваного файлу рушія має бути абсолютним|Путь к исполняемому файлу движка должен быть абсолютным
Choose a native .exe server executable|Виберіть виконуваний файл сервера .exe|Выберите исполняемый файл сервера .exe
Model and projector files must use absolute paths|Шляхи до моделі й проєктора мають бути абсолютними|Пути к модели и проектору должны быть абсолютными
Local vision requires the matching multimodal projector (mmproj GGUF)|Для локального зору потрібен відповідний мультимодальний проєктор (mmproj GGUF)|Для локального зрения требуется соответствующий мультимодальный проектор (mmproj GGUF)
Local config lock unavailable|Блокування локальних налаштувань недоступне|Блокировка локальных настроек недоступна
Local status lock unavailable|Блокування локального стану недоступне|Блокировка локального состояния недоступна
Local log lock unavailable|Блокування локального журналу недоступне|Блокировка локального журнала недоступна
Read local engine settings: {error}|Читання налаштувань локального рушія: {error}|Чтение настроек локального движка: {error}
Invalid local engine settings: {error}|Некоректні налаштування локального рушія: {error}|Некорректные настройки локального движка: {error}
Local engine settings exceed 128 KiB|Налаштування локального рушія перевищують 128 КіБ|Настройки локального движка превышают 128 КиБ
Expected independent brain, STT and vision settings|Потрібні окремі налаштування мислення, розпізнавання й зору|Требуются отдельные настройки мышления, распознавания и зрения
Local engines require distinct kinds and ports|Локальні рушії мають використовувати різні типи й порти|Локальные движки должны использовать разные типы и порты
Stop this local engine before changing its configuration|Зупиніть цей локальний рушій перед зміною налаштувань|Остановите этот локальный движок перед изменением настроек
Local settings unavailable|Локальні налаштування недоступні|Локальные настройки недоступны
Unknown engine kind|Невідомий тип рушія|Неизвестный тип движка
Save local engine settings: {error}|Збереження налаштувань локального рушія: {error}|Сохранение настроек локального движка: {error}
Engine exited: {code}|Рушій завершив роботу: {code}|Движок завершил работу: {code}
Engine is already running. Stop or restart it to apply new settings.|Рушій уже працює. Зупиніть або перезапустіть його для застосування нових налаштувань.|Движок уже работает. Остановите или перезапустите его для применения новых настроек.
Could not start local engine: {error}|Не вдалося запустити локальний рушій: {error}|Не удалось запустить локальный движок: {error}
Engine startup cancelled|Запуск рушія скасовано|Запуск движка отменён
Engine exited while loading the model: {code}. See its log and verify the model/runtime match.|Рушій завершив роботу під час завантаження моделі: {code}. Перевірте журнал і сумісність моделі з рушієм.|Движок завершил работу при загрузке модели: {code}. Проверьте журнал и совместимость модели с движком.
Local model did not become ready within 120 seconds. Try a smaller model/context or inspect the log.|Локальна модель не підготувалася за 120 секунд. Спробуйте меншу модель/контекст або перевірте журнал.|Локальная модель не подготовилась за 120 секунд. Попробуйте меньшую модель/контекст или проверьте журнал.
Start this engine before testing its readiness|Запустіть рушій перед перевіркою готовності|Запустите движок перед проверкой готовности
Engine is not ready. Start it and inspect the log.|Рушій не готовий. Запустіть його й перевірте журнал.|Движок не готов. Запустите его и проверьте журнал.
Automatic CPU engine installation supports Windows x64. Browse to a compatible server executable on this platform.|Автоматичне встановлення CPU-рушія підтримує Windows x64. На цій платформі виберіть сумісний виконуваний файл сервера.|Автоматическая установка CPU-движка поддерживает Windows x64. На этой платформе выберите совместимый исполняемый файл сервера.
Official engine download: {error}|Завантаження офіційного рушія: {error}|Загрузка официального движка: {error}
Official engine checksum mismatch. Nothing was installed.|Контрольна сума офіційного рушія не збігається. Нічого не встановлено.|Контрольная сумма официального движка не совпадает. Ничего не установлено.
Could not verify the engine license|Не вдалося перевірити ліцензію рушія|Не удалось проверить лицензию движка
Engine package exceeds the 64 MiB CPU-package limit|Пакет рушія перевищує ліміт 64 МіБ для CPU-пакетів|Пакет движка превышает лимит 64 МиБ для CPU-пакетов
Engine package exceeds 64 MiB|Пакет рушія перевищує 64 МіБ|Пакет движка превышает 64 МиБ
Engine archive contains too many directories|Архів рушія містить забагато каталогів|Архив движка содержит слишком много каталогов
Engine archive has too many entries|Архів рушія містить забагато файлів|Архив движка содержит слишком много файлов
Engine archive contains an unsafe path|Архів рушія містить небезпечний шлях|Архив движка содержит небезопасный путь
Engine archive contains a symlink|Архів рушія містить символічне посилання|Архив движка содержит символическую ссылку
Unpacked engine exceeds 256 MiB|Розпакований рушій перевищує 256 МіБ|Распакованный движок превышает 256 МиБ
Invalid microphone device|Некоректний пристрій мікрофона|Некорректное устройство микрофона
Selected microphone is no longer available|Вибраний мікрофон більше недоступний|Выбранный микрофон больше недоступен
No microphone found. Connect an input device and allow native microphone access in Windows privacy settings.|Мікрофон не знайдено. Підключіть пристрій введення й надайте доступ до мікрофона в налаштуваннях приватності Windows.|Микрофон не найден. Подключите устройство ввода и предоставьте доступ к микрофону в настройках конфиденциальности Windows.
Microphone configuration: {error}|Налаштування мікрофона: {error}|Настройка микрофона: {error}
Microphone stopped: {error}|Мікрофон зупинено: {error}|Микрофон остановлен: {error}
Unsupported microphone sample rate or channel count|Непідтримувана частота дискретизації або кількість каналів мікрофона|Неподдерживаемая частота дискретизации или количество каналов микрофона
Microphone lock unavailable|Блокування мікрофона недоступне|Блокировка микрофона недоступна
Microphone did not start within 5 seconds|Мікрофон не запустився за 5 секунд|Микрофон не запустился за 5 секунд
Unsupported microphone format {format}; choose another input device|Непідтримуваний формат мікрофона {format}; виберіть інший пристрій|Неподдерживаемый формат микрофона {format}; выберите другое устройство
Whisper uses whisper.cpp GGML .bin models, not arbitrary GGUF files. The multilingual tiny model supports Ukrainian, Russian and English; larger models improve accuracy.|Whisper використовує моделі whisper.cpp GGML .bin, а не довільні GGUF-файли. Багатомовна модель tiny підтримує українську, російську й англійську; більші моделі точніші.|Whisper использует модели whisper.cpp GGML .bin, а не произвольные GGUF-файлы. Многоязычная модель tiny поддерживает украинский, русский и английский; более крупные модели точнее.
Recommended: Qwen2.5 0.5B Instruct Q4 (491 MB, Apache 2.0).|Рекомендовано: Qwen2.5 0.5B Instruct Q4 (491 МБ, Apache 2.0).|Рекомендуется: Qwen2.5 0.5B Instruct Q4 (491 МБ, Apache 2.0).
Recommended: multilingual Whisper tiny (78 MB, MIT).|Рекомендовано: багатомовна Whisper tiny (78 МБ, MIT).|Рекомендуется: многоязычная Whisper tiny (78 МБ, MIT).
Recommended: SmolVLM 256M Q8 plus matching projector (279 MB total, Apache 2.0). A small model can miss fine details.|Рекомендовано: SmolVLM 256M Q8 і відповідний проєктор (разом 279 МБ, Apache 2.0). Невелика модель може пропускати дрібні деталі.|Рекомендуется: SmolVLM 256M Q8 и соответствующий проектор (всего 279 МБ, Apache 2.0). Небольшая модель может пропускать мелкие детали.
Download recommended model|Завантажити рекомендовану модель|Скачать рекомендуемую модель
Recommended model downloaded and selected. Press Start to load it.|Рекомендовану модель завантажено й вибрано. Натисніть «Запустити», щоб завантажити її в пам’ять.|Рекомендуемая модель скачана и выбрана. Нажмите «Запустить», чтобы загрузить её в память.
Downloading model|Завантаження моделі|Загрузка модели
AI|ШІ|ИИ
MB|МБ|МБ
Delete "{name}"?|Видалити «{name}»?|Удалить «{name}»?
Could not perform the action. Check settings.|Не вдалося виконати дію. Перевірте налаштування.|Не удалось выполнить действие. Проверьте настройки.
Could not perform the action.|Не вдалося виконати дію.|Не удалось выполнить действие.
Enter a question.|Введіть запитання.|Введите вопрос.
Unknown shell action.|Невідома дія оболонки.|Неизвестное действие оболочки.
Configure a {kind} provider in settings.|Налаштуйте провайдер {kind} у налаштуваннях.|Настройте провайдера {kind} в настройках.
All {kind} providers rejected the request. Check keys, models and addresses.|Усі провайдери {kind} відхилили запит. Перевірте ключі, моделі та адреси.|Все провайдеры {kind} отклонили запрос. Проверьте ключи, модели и адреса.
Provider returned an empty response stream.|Порожній потік відповіді провайдера.|Пустой поток ответа провайдера.
Google STT did not return a transcript.|Google STT не повернув транскрипт.|Google STT не вернул транскрипт.
STT returned a response without a transcript.|STT повернув відповідь без транскрипту.|STT вернул ответ без транскрипта.
TTS did not return audio at the configured response path.|TTS не повернув аудіо за вказаним шляхом відповіді.|TTS не вернул аудио по указанному пути ответа.
Google TTS did not return audio.|Google TTS не повернув аудіо.|Google TTS не вернул аудио.
The provider stream is not responding.|Потік провайдера не відповідає.|Поток провайдера не отвечает.
The service did not acknowledge the action within 30 seconds.|Служба не підтвердила дію за 30 секунд.|Служба не подтвердила действие за 30 секунд.
Whisper requires a whisper.cpp GGML .bin model, not a text GGUF model|Whisper потребує модель whisper.cpp GGML .bin, а не текстову модель GGUF|Whisper требует модель whisper.cpp GGML .bin, а не текстовую модель GGUF
Model must be a GGUF file (the selected file has an invalid header)|Модель має бути GGUF-файлом (вибраний файл має некоректний заголовок)|Модель должна быть GGUF-файлом (выбранный файл имеет некорректный заголовок)
Choose a whisper.cpp GGML .bin model before starting|Перед запуском виберіть модель whisper.cpp GGML .bin|Перед запуском выберите модель whisper.cpp GGML .bin
Choose a GGUF model before starting|Перед запуском виберіть модель GGUF|Перед запуском выберите модель GGUF
Chat interaction shortcut|Комбінація для взаємодії з чатом|Комбинация для взаимодействия с чатом
Move and type|Переміщення та введення|Перемещение и ввод
Shortcut disabled|Комбінацію вимкнено|Комбинация отключена
Choose a mode, then edit its English instructions to suit your workflow. Your saved templates stay available.|Виберіть режим і налаштуйте його англомовну інструкцію для своєї роботи. Збережені шаблони залишаються доступними.|Выберите режим и настройте его англоязычную инструкцию для своей работы. Сохранённые шаблоны остаются доступными.
Normal mode uses the selected template and response structure. Sleep mode listens only to system audio and uses its separate alarm instructions.|Звичайний режим використовує вибраний шаблон і структуру відповіді. Режим сну слухає лише системний звук і використовує окремі інструкції для тривоги.|Обычный режим использует выбранный шаблон и структуру ответа. Режим сна слушает только системный звук и использует отдельные инструкции для тревоги.
Normal mode · system instruction|Звичайний режим · системна інструкція|Обычный режим · системная инструкция
Sleep mode · alarm instruction|Режим сну · інструкція тривоги|Режим сна · инструкция тревоги
Keep <main>, <side>, and <speak> tags for the answer panels and speech.|Залиште теги <main>, <side> і <speak> для панелей відповіді й озвучення.|Сохраните теги <main>, <side> и <speak> для панелей ответа и озвучивания.
The alarm marker, track, volume, and output device are configured in Sleep settings.|Маркер тривоги, трек, гучність і пристрій виведення налаштовуються в параметрах режиму сну.|Маркер тревоги, трек, громкость и устройство вывода настраиваются в параметрах режима сна.
`.trim().split('\n');

for (const row of rows) {
  const [en, uk, ru] = row.split('|');
  const translation = { en, uk, ru };
  catalog[en] = translation;
  // Shared Ukrainian words may alias more than one English source. Preserve first match.
  catalog[uk] ??= translation;
  catalog[ru] ??= translation;
}
