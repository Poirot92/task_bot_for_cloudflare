var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// index.js
var repo_default = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    console.log(`\u{1F4E5} Request: ${request.method} ${url.pathname}`);
    if (url.pathname === "/webhook" && request.method === "POST") {
      try {
        const update = await request.json();
        console.log("\u{1F4E8} Received update from Telegram");
        await handleTelegramUpdate(update, env);
        return new Response("OK", { status: 200 });
      } catch (error) {
        console.error("\u274C Error handling update:", error.message);
        console.error("Stack:", error.stack);
        return new Response("Error: " + error.message, { status: 500 });
      }
    }
    if (url.pathname === "/setup") {
      const webhookUrl = `${url.origin}/webhook`;
      const telegramApiUrl = `https://api.telegram.org/bot${env.BOT_TOKEN}/setWebhook`;
      console.log("\u{1F517} Setting webhook to:", webhookUrl);
      const response = await fetch(telegramApiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: webhookUrl })
      });
      const result = await response.json();
      return new Response(JSON.stringify(result, null, 2), {
        headers: { "Content-Type": "application/json" }
      });
    }
    return new Response("\u2705 Telegram Bot is running", { status: 200 });
  },
  // Cron trigger для напоминаний
  async scheduled(event, env, ctx) {
    console.log("\u23F0 Cron trigger started");
    ctx.waitUntil(checkReminders(env));
  }
};
async function handleTelegramUpdate(update, env) {
  if (update.message) {
    await handleMessage(update.message, env);
  }
  if (update.callback_query) {
    await handleCallbackQuery(update.callback_query, env);
  }
}

__name(handleTelegramUpdate, "handleTelegramUpdate");

async function handleMessage(message, env) {
  const chatId = message.chat.id;
  const text = message.text || "";
  const userId = message.from.id;
  const username = message.from.username || "";
  const firstName = message.from.first_name || "";

  console.log(`\u{1F464} Message from ${userId} (${firstName}): "${text}"`);

  try {
    const user = await getUser(userId, env);
    const state = await getUserState(userId, env);

    console.log(`User found:`, user ? "Yes" : "No");
    console.log(`State:`, state ? state.state : "None");

    if (text === "/start") {
      await clearState(userId, env);
      await handleStart(
        chatId,
        userId,
        username,
        firstName,
        user,
        env
      );
      return;
    }

    // 🤖 TEST: Cloudflare Workers AI
    if (text === "/ai") {
      const aiAnswer = await askAI(
        "Привет! Проверь, что ты работаешь.",
        env
      );

      await sendMessage(
        chatId,
        `🤖 ${aiAnswer}`,
        env
      );

      return;
    }



    const MENU_BUTTONS = [
      "\u2795 \u0421\u043E\u0437\u0434\u0430\u0442\u044C \u0437\u0430\u0434\u0430\u0447\u0443",
      "\u{1F4C5} \u041D\u0430\u0437\u043D\u0430\u0447\u0438\u0442\u044C \u0432\u0441\u0442\u0440\u0435\u0447\u0443",
      "\u{1F4C6} \u041A\u0430\u043B\u0435\u043D\u0434\u0430\u0440\u044C",
      "\u26A0\uFE0F \u041F\u0440\u043E\u0441\u0440\u043E\u0447\u0435\u043D\u043D\u044B\u0435",
      "\u{1F4CA} \u0417\u0430\u0434\u0430\u0447\u0438 \u043A\u043E\u043C\u0430\u043D\u0434\u044B",
      "\u{1F465} \u041C\u043E\u044F \u043A\u043E\u043C\u0430\u043D\u0434\u0430",
      "\u{1F4CB} \u041C\u043E\u0438 \u0437\u0430\u0434\u0430\u0447\u0438",
      "\u{1F4C5} \u041C\u043E\u0438 \u0432\u0441\u0442\u0440\u0435\u0447\u0438",
      "\u2139\uFE0F \u041F\u043E\u043C\u043E\u0449\u044C"
    ];

    if (MENU_BUTTONS.includes(text)) {
      if (state && state.state) {
        console.log(
          `\u{1F504} Menu button pressed during state ${state.state} \u2014 clearing state`
        );

        await clearState(userId, env);
      }

      if (user) {
        await handleMenuButtons(
          chatId,
          userId,
          text,
          user,
          env
        );
      }

      return;
    }

    if (state && state.state) {
      console.log(
        `\u{1F504} Processing state: ${state.state}`
      );

      await handleConversationState(
        chatId,
        userId,
        text,
        state,
        user,
        message,
        env
      );

      return;
    }

        // 🤖 AI Router — обработка свободного текста
    if (
      text &&
      !text.startsWith("/") &&
      user
    ) {
      const route = await aiRouter(text, env);

      const result = await executeAIAction(
        route,
        user,
        env
      );

      await sendMessage(
        chatId,
        result.message,
        env,
        result.keyboard
      );

      return;
    }


    if (user) {
      await handleMenuButtons(
        chatId,
        userId,
        text,
        user,
        env
      );
    } else {
      await sendMessage(
        chatId,
        "\u041F\u043E\u0436\u0430\u043B\u0443\u0439\u0441\u0442\u0430, \u043D\u0430\u0436\u043C\u0438\u0442\u0435 /start \u0434\u043B\u044F \u043D\u0430\u0447\u0430\u043B\u0430 \u0440\u0430\u0431\u043E\u0442\u044B",
        env
      );
    }

  } catch (error) {
    console.error(
      "\u274C Error in handleMessage:",
      error.message
    );

    console.error(
      "Stack:",
      error.stack
    );

    await sendMessage(
      chatId,
      "\u274C \u041F\u0440\u043E\u0438\u0437\u043E\u0448\u043B\u0430 \u043E\u0448\u0438\u0431\u043A\u0430. \u041F\u043E\u043F\u0440\u043E\u0431\u0443\u0439\u0442\u0435 \u043F\u043E\u0437\u0436\u0435.",
      env
    );
  }
}


// ============================================================
// 🤖 CLOUDFLARE WORKERS AI — TEST --
// ============================================================

async function askAI(text, env) {
  try {
    console.log("🤖 Sending request to Workers AI:", text);

    const result = await env.AI.run(
      "@cf/openai/gpt-oss-20b",
      {
        messages: [
          {
            role: "system",
            content:
              "Ты AI-ассистент Telegram-бота управления задачами. " +
              "Отвечай кратко и понятно на русском языке."
          },
          {
            role: "user",
            content: text
          }
        ]
      }
    );

    console.log("🤖 Workers AI RAW RESULT:");
    console.log(JSON.stringify(result));

    const answer = result?.choices?.[0]?.message?.content;

    if (answer) {
      return answer;
    }

    return "AI не вернул текстовый ответ.";

  } catch (error) {
    console.error("❌ Workers AI ERROR:", error.message);
    console.error("❌ Workers AI STACK:", error.stack);

    return "Ошибка при обращении к AI.";
  }
}

function routeExplicitSelfTask(text) {
  const input = String(text || "").trim();
  const startsCreateTask = /^(?:(?:пожалуйста)[, ]*)?(?:создай|создать|поставь|добавь)\s+(?:(?:мне|себе)\s+)?задач[уы](?=\s|$)/i.test(input);
  const explicitlySelf = /задач[уы]\s+(?:себе|для себя)(?=\s|$)/i.test(input) ||
    /^(?:(?:пожалуйста)[, ]*)?(?:создай|создать|поставь|добавь)\s+мне\s+задач[уы](?=\s|$)/i.test(input);
  if (!startsCreateTask || !explicitlySelf) return null;

  let remainder = input
    .replace(/^(?:(?:пожалуйста)[, ]*)?(?:создай|создать|поставь|добавь)\s+(?:(?:мне|себе)\s+)?задач[уы](?=\s|$)\s*/i, "")
    .replace(/^(?:себе|для себя|мне)\s*/i, "")
    .replace(/^мне\s+(?:нужно|надо)\s+/i, "");

  let dueDate = null;
  const isoDate = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(remainder);
  const numericDate = /\b(\d{1,2})[./](\d{1,2})(?:[./](\d{4}))?\b/.exec(remainder);
  const relativeDate = /(?:^|\s)(?:до\s+)?(послезавтра|завтра|сегодня)(?=\s|$)/i.exec(remainder);

  if (isoDate) {
    dueDate = isoDate[0];
    remainder = remainder.replace(isoDate[0], " ");
  } else if (numericDate) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Tashkent", year: "numeric"
    }).formatToParts(new Date());
    const currentYear = Number(parts.find((part) => part.type === "year")?.value);
    const year = numericDate[3] ? Number(numericDate[3]) : currentYear;
    dueDate = `${year}-${String(Number(numericDate[2])).padStart(2, "0")}-${String(Number(numericDate[1])).padStart(2, "0")}`;
    remainder = remainder.replace(numericDate[0], " ");
  } else if (relativeDate) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Tashkent", year: "numeric", month: "2-digit", day: "2-digit"
    }).formatToParts(new Date());
    const year = Number(parts.find((part) => part.type === "year")?.value);
    const month = Number(parts.find((part) => part.type === "month")?.value);
    const day = Number(parts.find((part) => part.type === "day")?.value);
    const offset = relativeDate[1].toLowerCase() === "послезавтра" ? 2 :
      relativeDate[1].toLowerCase() === "завтра" ? 1 : 0;
    const date = new Date(Date.UTC(year, month - 1, day + offset));
    dueDate = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
    remainder = remainder.replace(relativeDate[0], " ");
  }

  const title = remainder
    .replace(/(?:^|\s)до(?=\s)/gi, " ")
    .replace(/мне\s+(?:нужно|надо)\s+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  console.log("🧭 Explicit self-task route:", JSON.stringify({title, dueDate}));
  return {
    action: "create_task",
    parameters: {employee: "self", title, due_date: dueDate}
  };
}

async function aiRouter(text, env) {
  try {
    console.log("🧠 AI ROUTER INPUT:", text);
    const explicitSelfTask = routeExplicitSelfTask(text);
    if (explicitSelfTask) return explicitSelfTask;

    const result = await env.AI.run(
      "@cf/openai/gpt-oss-20b",
      {
        messages: [
          {
            role: "system",
            content: `
Ты AI Router для Telegram-бота управления задачами.

Твоя задача — определить, что пользователь хочет сделать.

Разрешенные действия:

1. create_task
   Пользователь хочет создать или поставить задачу.

2. find_task
   Пользователь хочет найти конкретную задачу.

3. get_my_tasks
   Пользователь хочет узнать свои задачи.

4. get_team_tasks
   Пользователь хочет узнать активные задачи всей команды.

5. get_employee_tasks
   Пользователь хочет узнать задачи конкретного сотрудника.

   Примеры:
   - "Покажи задачи Умарбека"
   - "Покажи активные задачи Умарбека"
   - "Покажи выполненные задачи Умарбека"
   - "Покажи просроченные задачи Умарбека"

6. get_overdue_tasks
   Пользователь хочет узнать просроченные задачи.

7. complete_task
   Пользователь хочет завершить, закрыть или отметить задачу выполненной.

8. unknown
   Если запрос не относится к этим действиям.

ВАЖНО:
- НЕ выполняй действия.
- НЕ придумывай данные.
- НЕ пиши обычный ответ.
- Верни ТОЛЬКО JSON.
- Никакого Markdown.
- Никакого текста до или после JSON.

Формат:

{
  "action": "create_task | find_task | get_my_tasks | get_team_tasks | get_employee_tasks | get_overdue_tasks | complete_task | unknown",
  "parameters": {}
}

Для create_task:
Если пользователь хочет создать задачу себе, укажи employee = "self". Если начальник назначает задачу сотруднику, укажи его имя. Для каждой задачи нужна дата дедлайна YYYY-MM-DD; если пользователь не назвал дату, передай due_date = null.

{
  "action": "create_task",
  "parameters": {
    "employee": "self для себя или имя сотрудника",
    "title": "текст задачи",
    "due_date": "обязательная дата YYYY-MM-DD, если пользователь не указал — null"
  }
}

Для find_task:

{
  "action": "find_task",
  "parameters": {
    "query": "что искать"
  }
}

Для get_my_tasks:

{
  "action": "get_my_tasks",
  "parameters": {}
}

Для get_team_tasks:

{
  "action": "get_team_tasks",
  "parameters": {}
}

Для get_employee_tasks:

{
  "action": "get_employee_tasks",
  "parameters": {
    "employee": "имя сотрудника",
    "status": "active | completed | overdue | all"
  }
}

Для get_overdue_tasks:

{
  "action": "get_overdue_tasks",
  "parameters": {}
}

Для complete_task:

{
  "action": "complete_task",
  "parameters": {
    "query": "название или описание задачи"
  }
}

Для неизвестного запроса:

{
  "action": "unknown",
  "parameters": {}
}
`
          },
          {
            role: "user",
            content: text
          }
        ],
        max_tokens: 512
      }
    );
    console.log(
      "🧠 AI ROUTER FULL RESULT:",
      JSON.stringify(result)
    );

    const content =
      result?.choices?.[0]?.message?.content;

    console.log("🧠 AI ROUTER RAW:", content);

    if (!content) {
      return {
        action: "unknown",
        parameters: {}
      };
    }

    // Убираем возможный ```json ... ```
    const cleaned = content
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();

    const parsed = JSON.parse(cleaned);

    console.log("🧠 AI ROUTER PARSED:", JSON.stringify(parsed));

    // Нормализуем action, если модель убрала "_"
    const actionAliases = {
      createtask: "create_task",
      create_task: "create_task",
      createtaskself: "create_task",
      createtaskforself: "create_task",
      createselftask: "create_task",
      createtaskforme: "create_task",
      create_task_self: "create_task",
      create_task_for_self: "create_task",
      create_self_task: "create_task",

      findtask: "find_task",
      find_task: "find_task",

      getmytasks: "get_my_tasks",
      get_my_tasks: "get_my_tasks",
      mytasks: "get_my_tasks",
      my_tasks: "get_my_tasks",
      gettasks: "get_my_tasks",
      get_tasks: "get_my_tasks",
      listmytasks: "get_my_tasks",
      list_my_tasks: "get_my_tasks",
      showmytasks: "get_my_tasks",
      show_my_tasks: "get_my_tasks",

      getteamtasks: "get_team_tasks",
      get_team_tasks: "get_team_tasks",
      teamtasks: "get_team_tasks",
      team_tasks: "get_team_tasks",
      listteamtasks: "get_team_tasks",
      list_team_tasks: "get_team_tasks",
      showteamtasks: "get_team_tasks",
      show_team_tasks: "get_team_tasks",

      getemployeetasks: "get_employee_tasks",
      get_employee_tasks: "get_employee_tasks",

      getoverduetasks: "get_overdue_tasks",
      get_overdue_tasks: "get_overdue_tasks",

      complete_task: "complete_task",
      completetask: "complete_task",

      unknown: "unknown"
    };



    const rawAction = String(parsed.action || "")
      .toLowerCase()
      .replace(/[\s-]/g, "");

    const compactAction = rawAction.replace(/_/g, "");
    const action =
      actionAliases[rawAction] ||
      actionAliases[compactAction] ||
      "unknown";

    const normalized = {
      action,
      parameters: parsed.parameters || {}
    };

    console.log(
      "🧠 AI ROUTER NORMALIZED:",
      JSON.stringify(normalized)
    );

    return normalized;

  } catch (error) {
    console.error("❌ AI ROUTER ERROR:", error.message);

    return {
      action: "unknown",
      parameters: {}
    };
  }
}

__name(handleMessage, "handleMessage");
async function handleCallbackQuery(callbackQuery, env) {
  const chatId = callbackQuery.message.chat.id;
  const messageId = callbackQuery.message.message_id;
  const data = callbackQuery.data;
  const userId = callbackQuery.from.id;
  const username = callbackQuery.from.username || "";
  const firstName = callbackQuery.from.first_name || "";
  console.log(`\u{1F5B1}\uFE0F Callback from ${userId}: ${data}`);
  try {
    await answerCallbackQuery(callbackQuery.id, env);
    const user = await getUser(userId, env);
    if (data === "register_boss") {
      console.log("\u{1F4DD} Starting boss registration");
      await setState(userId, "CREATE_ORG", null, env);
      await sendMessage(chatId, "\u{1F454} \u041E\u0442\u043B\u0438\u0447\u043D\u043E! \u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u043D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 \u0432\u0430\u0448\u0435\u0439 \u043E\u0440\u0433\u0430\u043D\u0438\u0437\u0430\u0446\u0438\u0438:", env);
      return;
    }
    if (data === "join_as_employee") {
      await setState(userId, "ENTER_ORG_CODE", null, env);
      await sendMessage(chatId, "\u{1F511} \u0412\u0432\u0435\u0434\u0438\u0442\u0435 6-\u0437\u043D\u0430\u0447\u043D\u044B\u0439 \u043A\u043E\u0434 \u043E\u0440\u0433\u0430\u043D\u0438\u0437\u0430\u0446\u0438\u0438:", env);
      return;
    }
    if (data.startsWith("cal_")) {
      await handleCalendarCallback(chatId, messageId, data, userId, env);
      return;
    }
    if (data.startsWith("time_")) {
      await handleTimePickerCallback(chatId, messageId, data, userId, env);
      return;
    }
    if (data === "skip_deadline") {
      await handleTimePickerCallback(chatId, messageId, data, userId, env);
      return;
    }
    if (data.startsWith("toggle_emp_")) {
      await handleToggleEmployee(chatId, messageId, data, userId, env);
      return;
    }
    if (data === "select_all") {
      await handleSelectAllEmployees(chatId, messageId, userId, env);
      return;
    }
    if (data === "deselect_all") {
      await handleDeselectAllEmployees(chatId, messageId, userId, env);
      return;
    }
    if (data === "confirm_employees") {
      await handleConfirmEmployees(chatId, messageId, userId, user, env);
      return;
    }
    if (data.startsWith("view_task_")) {
      const taskId = data.split("_")[2];
      await handleViewTask(chatId, taskId, user, env);
      return;
    }
    if (data.startsWith("task_")) {
      const parts = data.split("_");
      const taskId = parts[1];
      const action = parts[2];
      if (action === "in" && parts[3] === "progress") {
        await updateTaskStatus(taskId, "in_progress", env);
        await sendMessage(chatId, '\u2705 \u0417\u0430\u0434\u0430\u0447\u0430 \u043F\u0435\u0440\u0435\u0432\u0435\u0434\u0435\u043D\u0430 \u0432 \u0441\u0442\u0430\u0442\u0443\u0441 "\u0412 \u0440\u0430\u0431\u043E\u0442\u0435"', env);
        await handleViewTask(chatId, taskId, user, env);
      } else if (action === "completed") {
        await updateTaskStatus(taskId, "completed", env);
        await sendMessage(chatId, "\u{1F389} \u041F\u043E\u0437\u0434\u0440\u0430\u0432\u043B\u044F\u044E! \u0417\u0430\u0434\u0430\u0447\u0430 \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u0430!", env);
        const task = await getTask(taskId, env);
        if (task && task.created_by) {
          await sendMessage(
            task.created_by,
            `\u2705 \u0417\u0430\u0434\u0430\u0447\u0430 \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u0430!

\u{1F4CB} ${task.title}
\u{1F468}\u200D\u{1F4BC} \u0418\u0441\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044C: ${firstName}`,
            env
          );
        }
        await handleViewTask(chatId, taskId, user, env);
      }
      return;
    }
    if (data.startsWith("comment_")) {
      const taskId = data.split("_")[1];
      await setState(userId, "ADD_COMMENT", { taskId }, env);
      await sendMessage(chatId, "\u{1F4AC} \u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u0432\u0430\u0448 \u043A\u043E\u043C\u043C\u0435\u043D\u0442\u0430\u0440\u0438\u0439:", env);
      return;
    }
    if (data.startsWith("delete_task_")) {
      const taskId = data.split("_")[2];
      const keyboard = {
        inline_keyboard: [
          [{ text: "\u2705 \u0414\u0430, \u0443\u0434\u0430\u043B\u0438\u0442\u044C", callback_data: `confirm_del_task_${taskId}` }],
          [{ text: "\u274C \u041E\u0442\u043C\u0435\u043D\u0430", callback_data: "back_to_main" }]
        ]
      };
      await editMessage(chatId, messageId, "\u26A0\uFE0F \u0412\u044B \u0443\u0432\u0435\u0440\u0435\u043D\u044B \u0447\u0442\u043E \u0445\u043E\u0442\u0438\u0442\u0435 \u0443\u0434\u0430\u043B\u0438\u0442\u044C \u0437\u0430\u0434\u0430\u0447\u0443?", env, keyboard);
      return;
    }
    if (data.startsWith("confirm_del_task_")) {
      const taskId = data.split("_")[3];
      await deleteTaskFromDB(taskId, env);
      await editMessage(chatId, messageId, "\u2705 \u0417\u0430\u0434\u0430\u0447\u0430 \u0443\u0434\u0430\u043B\u0435\u043D\u0430", env);
      return;
    }
    if (data === "back_to_main") {
      const keyboard = user && user.role === "boss" ? getBossKeyboard() : getEmployeeKeyboard();
      await sendMessage(chatId, "\u{1F3E0} \u0413\u043B\u0430\u0432\u043D\u043E\u0435 \u043C\u0435\u043D\u044E:", env, keyboard);
      return;
    }

    if (data.startsWith("team_page_")) {
      const parts = data.split("_");

      const filter = parts[2];
      const page = parseInt(parts[3], 10);

      const result = await buildTeamTasksPage(
        user,
        env,
        filter,
        page
      );

      await editMessage(
        chatId,
        messageId,
        result.text,
        env,
        result.keyboard
      );

      return;
    }

    if (data === "noop") {
      return;
    }

    if (data === "team_tasks_active") {
      await handleShowTeamTasks(chatId, user, env, "active");
      return;
    }
    if (data === "team_tasks_done") {
      await handleShowTeamTasks(chatId, user, env, "done");
      return;
    }
    if (data.startsWith("change_deadline_")) {
      const taskId = data.split("_")[2];
      let calendar = createCalendarKeyboard((/* @__PURE__ */ new Date()).getFullYear(), (/* @__PURE__ */ new Date()).getMonth() + 1, `dlcal_${taskId}_`);
      calendar.inline_keyboard.push([
        { text: "\u274C \u041E\u0442\u043C\u0435\u043D\u0430", callback_data: `cancel_deadline_${taskId}` }
      ]);
      await sendMessage(chatId, "\u{1F4C5} \u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u043D\u043E\u0432\u0443\u044E \u0434\u0430\u0442\u0443 \u0434\u0435\u0434\u043B\u0430\u0439\u043D\u0430:", env, calendar);
      return;
    }
    if (data.startsWith("cancel_deadline_")) {
      await clearState(userId, env);
      const taskId = data.split("_")[2];
      await sendMessage(chatId, "\u274C \u0418\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u0435 \u0434\u0435\u0434\u043B\u0430\u0439\u043D\u0430 \u043E\u0442\u043C\u0435\u043D\u0435\u043D\u043E", env);
      await handleViewTask(chatId, taskId, user, env);
      return;
    }
    if (data.startsWith("dlcal_")) {
      await handleDeadlineCalendarCallback(chatId, messageId, data, userId, env);
      return;
    }
    if (data.startsWith("dltime_")) {
      await handleDeadlineTimeCallback(chatId, messageId, data, userId, env);
      return;
    }
    if (data === "team_employees_list") {
      await handleShowEmployeesList(chatId, user, env);
      return;
    }
    if (data === "team_org_code") {
      await handleShowOrgCode(chatId, user, env);
      return;
    }
    if (data === "team_pending_requests") {
      await handleShowPendingRequests(chatId, user, env);
      return;
    }
    if (data.startsWith("approve_req_")) {
      const requestId = data.split("_")[2];
      await handleApproveRequest(chatId, requestId, env);
      return;
    }
    if (data.startsWith("reject_req_")) {
      const requestId = data.split("_")[2];
      await handleRejectRequest(chatId, requestId, env);
      return;
    }
    if (data.startsWith("mcal_")) {
      await handleMeetingCalendarCallback(chatId, messageId, data, userId, env);
      return;
    }
    if (data.startsWith("mtime_")) {
      await handleMeetingTimeCallback(chatId, messageId, data, userId, env);
      return;
    }
    if (data.startsWith("mtoggle_")) {
      await handleToggleMeetingParticipant(chatId, messageId, data, userId, env);
      return;
    }
    if (data === "mselect_all") {
      await handleSelectAllMeetingParticipants(chatId, messageId, userId, env);
      return;
    }
    if (data === "mdeselect_all") {
      await handleDeselectAllMeetingParticipants(chatId, messageId, userId, env);
      return;
    }
    if (data === "mconfirm_participants") {
      await handleConfirmMeetingParticipants(chatId, messageId, userId, user, env);
      return;
    }
  } catch (error) {
    console.error("\u274C Error in handleCallbackQuery:", error.message);
    console.error("Stack:", error.stack);
    await sendMessage(chatId, "\u274C \u041F\u0440\u043E\u0438\u0437\u043E\u0448\u043B\u0430 \u043E\u0448\u0438\u0431\u043A\u0430. \u041F\u043E\u043F\u0440\u043E\u0431\u0443\u0439\u0442\u0435 \u043F\u043E\u0437\u0436\u0435.", env);
  }
}
__name(handleCallbackQuery, "handleCallbackQuery");
async function handleAIDeadlineClarification(chatId, userId, text, pending, user, env) {
  const parsed = routeExplicitSelfTask(`Создай задачу себе ${text}`);
  const deadline = parsed?.parameters?.due_date;
  if (!deadline) {
    await sendMessage(chatId, "📅 Не распознал дату. Ответь, например: «завтра», «22.11.2026» или «2026-11-22». Если не ответишь, напомню через 30 минут; через 24 часа задача создастся автоматически со сроком на 10:00 по Ташкенту.", env);
    return;
  }
  const result = await executeAIAction({
    action: "create_task",
    parameters: {employee: pending.employee, title: pending.title, due_date: deadline}
  }, user, env);
  if (result.success || !String(result.message || "").includes("обязательно нужен дедлайн")) {
    await clearState(userId, env);
  }
  await sendMessage(chatId, result.message, env, result.keyboard);
}

async function handleConversationState(chatId, userId, text, state, user, message, env) {
  const stateName = state.state;
  const stateData = state.data ? JSON.parse(state.data) : {};
  console.log(`\u{1F504} Handling state: ${stateName}, data:`, stateData);
  try {
    switch (stateName) {
      case "CREATE_ORG":
        console.log("\u{1F4DD} Creating organization:", text);
        await handleCreateOrg(chatId, userId, text, message.from, env);
        break;
      case "CREATE_TASK_DESC":
        console.log("\u{1F4DD} Setting task description");
        await setState(userId, "CREATE_TASK_DEADLINE", { description: text }, env);
        const calendar = createCalendarKeyboard((/* @__PURE__ */ new Date()).getFullYear(), (/* @__PURE__ */ new Date()).getMonth() + 1);
        await sendMessage(chatId, "\u{1F4C5} \u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0434\u0435\u0434\u043B\u0430\u0439\u043D \u0437\u0430\u0434\u0430\u0447\u0438:", env, calendar);
        break;
      case "AI_TASK_DEADLINE":
        await handleAIDeadlineClarification(chatId, userId, text, stateData, user, env);
        break;
      case "ADD_COMMENT":
        console.log("\u{1F4AC} Adding comment to task:", stateData.taskId);
        await handleSaveComment(chatId, userId, text, stateData.taskId, user, env);
        break;
      case "ENTER_ORG_CODE":
        console.log("\u{1F511} Entering org code:", text);
        await handleEnterOrgCode(chatId, userId, text, message.from, env);
        break;
      case "ENTER_PHONE":
        if (!message.contact) {
          await sendMessage(chatId, "\u274C \u0418\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0439\u0442\u0435 \u043A\u043D\u043E\u043F\u043A\u0443 \u043D\u0438\u0436\u0435 \u0447\u0442\u043E\u0431\u044B \u043E\u0442\u043F\u0440\u0430\u0432\u0438\u0442\u044C \u0441\u0432\u043E\u0439 \u043D\u043E\u043C\u0435\u0440", env, {
            keyboard: [[{ text: "\u{1F4F1} \u041E\u0442\u043F\u0440\u0430\u0432\u0438\u0442\u044C \u043D\u043E\u043C\u0435\u0440", request_contact: true }]],
            resize_keyboard: true,
            one_time_keyboard: true
          });
          return;
        }
        if (message.contact.user_id !== userId) {
          await sendMessage(chatId, "\u274C \u041F\u043E\u0436\u0430\u043B\u0443\u0439\u0441\u0442\u0430, \u043E\u0442\u043F\u0440\u0430\u0432\u044C\u0442\u0435 \u0441\u0432\u043E\u0439 \u043D\u043E\u043C\u0435\u0440, \u0430 \u043D\u0435 \u0447\u0443\u0436\u043E\u0439 \u043A\u043E\u043D\u0442\u0430\u043A\u0442", env, {
            keyboard: [[{ text: "\u{1F4F1} \u041E\u0442\u043F\u0440\u0430\u0432\u0438\u0442\u044C \u043D\u043E\u043C\u0435\u0440", request_contact: true }]],
            resize_keyboard: true,
            one_time_keyboard: true
          });
          return;
        }
        console.log("\u{1F4F1} Phone accepted:", message.contact.phone_number);
        await handleEnterPhone(chatId, userId, message.contact.phone_number, stateData, message.from, env);
        break;
      case "MEETING_TITLE":
        console.log("\u{1F4C5} Setting meeting title");
        await setState(userId, "MEETING_DATE", { title: text }, env);
        const meetingCal = createCalendarKeyboard((/* @__PURE__ */ new Date()).getFullYear(), (/* @__PURE__ */ new Date()).getMonth() + 1, "mcal");
        await sendMessage(chatId, "\u{1F4C5} \u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0434\u0430\u0442\u0443 \u0432\u0441\u0442\u0440\u0435\u0447\u0438:", env, meetingCal);
        break;
      case "MEETING_DATE":
        await sendMessage(chatId, "\u{1F4C5} \u0418\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0439\u0442\u0435 \u043A\u043D\u043E\u043F\u043A\u0438 \u043A\u0430\u043B\u0435\u043D\u0434\u0430\u0440\u044F \u0432\u044B\u0448\u0435 \u0434\u043B\u044F \u0432\u044B\u0431\u043E\u0440\u0430 \u0434\u0430\u0442\u044B", env);
        break;
      case "MEETING_TIME":
        await sendMessage(chatId, "\u23F0 \u0418\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0439\u0442\u0435 \u043A\u043D\u043E\u043F\u043A\u0438 \u0432\u044B\u0448\u0435 \u0434\u043B\u044F \u0432\u044B\u0431\u043E\u0440\u0430 \u0432\u0440\u0435\u043C\u0435\u043D\u0438", env);
        break;
      case "MEETING_LOCATION":
        console.log("\u{1F4CD} Setting meeting location");
        await handleMeetingLocation(chatId, userId, text, stateData, user, env);
        break;
      case "MEETING_PARTICIPANTS":
        await sendMessage(chatId, "\u{1F465} \u0418\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0439\u0442\u0435 \u043A\u043D\u043E\u043F\u043A\u0438 \u0432\u044B\u0448\u0435 \u0434\u043B\u044F \u0432\u044B\u0431\u043E\u0440\u0430 \u0443\u0447\u0430\u0441\u0442\u043D\u0438\u043A\u043E\u0432", env);
        break;
      case "CHANGE_DEADLINE":
        await clearState(userId, env);
        if (user)
          await handleMenuButtons(chatId, userId, text, user, env);
        break;
      default:
        console.log("\u26A0\uFE0F Unknown state:", stateName);
        await clearState(userId, env);
        await sendMessage(chatId, "\u0427\u0442\u043E-\u0442\u043E \u043F\u043E\u0448\u043B\u043E \u043D\u0435 \u0442\u0430\u043A. \u041F\u043E\u043F\u0440\u043E\u0431\u0443\u0439\u0442\u0435 \u0441\u043D\u043E\u0432\u0430.", env);
    }
  } catch (error) {
    console.error("\u274C Error in handleConversationState:", error.message);
    console.error("Stack:", error.stack);
    await clearState(userId, env);
    await sendMessage(chatId, "\u274C \u041F\u0440\u043E\u0438\u0437\u043E\u0448\u043B\u0430 \u043E\u0448\u0438\u0431\u043A\u0430. \u041F\u043E\u043F\u0440\u043E\u0431\u0443\u0439\u0442\u0435 \u0441\u043D\u043E\u0432\u0430.", env);
  }
}
__name(handleConversationState, "handleConversationState");
async function handleStart(chatId, userId, username, firstName, user, env) {
  console.log("\u{1F680} Handling /start for user:", userId);
  if (user) {
    const keyboard = user.role === "boss" ? getBossKeyboard() : getEmployeeKeyboard();
    await sendMessage(
      chatId,
      `\u{1F44B} \u041F\u0440\u0438\u0432\u0435\u0442, **${user.first_name}**!

\u{1F3AF} \u0420\u043E\u043B\u044C: ${user.role === "boss" ? "\u0411\u043E\u0441\u0441" : "\u0421\u043E\u0442\u0440\u0443\u0434\u043D\u0438\u043A"}
\u0412\u044B\u0431\u0435\u0440\u0438 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0435:`,
      env,
      keyboard
    );
  } else {
    const keyboard = {
      inline_keyboard: [
        [{ text: "\u{1F454} \u042F \u0431\u043E\u0441\u0441", callback_data: "register_boss" }],
        [{ text: "\u{1F3E2} \u041F\u0440\u0438\u0441\u043E\u0435\u0434\u0438\u043D\u0438\u0442\u044C\u0441\u044F \u043A \u043E\u0440\u0433\u0430\u043D\u0438\u0437\u0430\u0446\u0438\u0438", callback_data: "join_as_employee" }]
      ]
    };
    await sendMessage(
      chatId,
      "\u{1F44B} \u0414\u043E\u0431\u0440\u043E \u043F\u043E\u0436\u0430\u043B\u043E\u0432\u0430\u0442\u044C \u0432 \u0442\u0430\u0441\u043A-\u043C\u0435\u043D\u0435\u0434\u0436\u0435\u0440!\n\n\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0432\u0430\u0448\u0443 \u0440\u043E\u043B\u044C:",
      env,
      keyboard
    );
  }
}
__name(handleStart, "handleStart");
async function handleMenuButtons(chatId, userId, text, user, env) {
  const role = user.role;
  console.log(`\u{1F4F1} Menu button pressed: "${text}" by ${role}`);
  try {
    if (role === "boss") {
      if (text === "\u2795 \u0421\u043E\u0437\u0434\u0430\u0442\u044C \u0437\u0430\u0434\u0430\u0447\u0443") {
        await setState(userId, "CREATE_TASK_DESC", null, env);
        await sendMessage(chatId, "\u{1F4DD} \u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u043E\u043F\u0438\u0441\u0430\u043D\u0438\u0435 \u0437\u0430\u0434\u0430\u0447\u0438:", env);
        return;
      }
      if (text === "\u{1F4C5} \u041D\u0430\u0437\u043D\u0430\u0447\u0438\u0442\u044C \u0432\u0441\u0442\u0440\u0435\u0447\u0443") {
        await setState(userId, "MEETING_TITLE", null, env);
        await sendMessage(chatId, "\u{1F4CB} \u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u043D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 \u0432\u0441\u0442\u0440\u0435\u0447\u0438:", env);
        return;
      }
      if (text === "\u{1F4CA} \u0417\u0430\u0434\u0430\u0447\u0438 \u043A\u043E\u043C\u0430\u043D\u0434\u044B") {
        await handleShowTeamTasks(chatId, user, env);
        return;
      }
      if (text === "\u{1F465} \u041C\u043E\u044F \u043A\u043E\u043C\u0430\u043D\u0434\u0430") {
        await handleShowTeamMenu(chatId, env);
        return;
      }
      if (text === "\u{1F4C6} \u041A\u0430\u043B\u0435\u043D\u0434\u0430\u0440\u044C") {
        await handleShowCalendar(chatId, user, env);
        return;
      }
      if (text === "\u26A0\uFE0F \u041F\u0440\u043E\u0441\u0440\u043E\u0447\u0435\u043D\u043D\u044B\u0435") {
        await handleShowOverdueTasks(chatId, user, env);
        return;
      }
    }
    if (role === "employee") {
      if (text === "\u{1F4CB} \u041C\u043E\u0438 \u0437\u0430\u0434\u0430\u0447\u0438") {
        await handleShowMyTasks(chatId, userId, env);
        return;
      }
      if (text === "\u{1F4C5} \u041C\u043E\u0438 \u0432\u0441\u0442\u0440\u0435\u0447\u0438") {
        await handleShowMyMeetings(chatId, userId, env);
        return;
      }
    }
    console.log("\u26A0\uFE0F Unknown menu button:", text);
  } catch (error) {
    console.error("\u274C Error in handleMenuButtons:", error.message);
    await sendMessage(chatId, "\u274C \u041F\u0440\u043E\u0438\u0437\u043E\u0448\u043B\u0430 \u043E\u0448\u0438\u0431\u043A\u0430. \u041F\u043E\u043F\u0440\u043E\u0431\u0443\u0439\u0442\u0435 \u043F\u043E\u0437\u0436\u0435.", env);
  }
}
__name(handleMenuButtons, "handleMenuButtons");
async function handleCreateOrg(chatId, userId, orgName, userFrom, env) {
  console.log(`\u{1F3E2} Creating organization "${orgName}" for user ${userId}`);
  try {
    const result = await createOrganization(orgName, env);
    console.log("\u2705 Organization created:", result);
    await addUser(userId, userFrom.username, userFrom.first_name, "boss", result.orgId, env);
    console.log("\u2705 User added as boss");
    await clearState(userId, env);
    const keyboard = getBossKeyboard();
    await sendMessage(
      chatId,
      `\u2705 \u041E\u0440\u0433\u0430\u043D\u0438\u0437\u0430\u0446\u0438\u044F *${orgName}* \u0441\u043E\u0437\u0434\u0430\u043D\u0430!

\u{1F511} \u041A\u043E\u0434 \u0434\u043B\u044F \u0441\u043E\u0442\u0440\u0443\u0434\u043D\u0438\u043A\u043E\u0432: ${result.paymentCode}

\u0422\u0435\u043F\u0435\u0440\u044C \u0432\u044B \u043C\u043E\u0436\u0435\u0442\u0435 \u0441\u043E\u0437\u0434\u0430\u0432\u0430\u0442\u044C \u0437\u0430\u0434\u0430\u0447\u0438 \u0438 \u043F\u0440\u0438\u0433\u043B\u0430\u0448\u0430\u0442\u044C \u0441\u043E\u0442\u0440\u0443\u0434\u043D\u0438\u043A\u043E\u0432.`,
      env,
      keyboard
    );
  } catch (error) {
    console.error("\u274C Error creating organization:", error.message);
    console.error("Stack:", error.stack);
    await clearState(userId, env);
    await sendMessage(chatId, "\u274C \u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u0438 \u0441\u043E\u0437\u0434\u0430\u043D\u0438\u0438 \u043E\u0440\u0433\u0430\u043D\u0438\u0437\u0430\u0446\u0438\u0438. \u041F\u043E\u043F\u0440\u043E\u0431\u0443\u0439\u0442\u0435 \u0441\u043D\u043E\u0432\u0430 \u0441 /start", env);
  }
}
__name(handleCreateOrg, "handleCreateOrg");
async function handleSaveComment(chatId, userId, commentText, taskId, user, env) {
  try {
    await addComment(taskId, userId, commentText, env);
    await clearState(userId, env);
    await sendMessage(chatId, "\u2705 \u041A\u043E\u043C\u043C\u0435\u043D\u0442\u0430\u0440\u0438\u0439 \u0434\u043E\u0431\u0430\u0432\u043B\u0435\u043D!", env);
    const task = await getTask(taskId, env);
    if (task) {
      if (user.role === "boss") {
        await sendMessage(
          task.assigned_to,
          `\u{1F4AC} **\u041D\u043E\u0432\u044B\u0439 \u043A\u043E\u043C\u043C\u0435\u043D\u0442\u0430\u0440\u0438\u0439 \u043E\u0442 \u0440\u0443\u043A\u043E\u0432\u043E\u0434\u0438\u0442\u0435\u043B\u044F!**

\u{1F4CB} \u0417\u0430\u0434\u0430\u0447\u0430: **${task.title}**

\u{1F454} ${user.first_name}: _${commentText}_`,
          env
        );
      } else {
        await sendMessage(
          task.created_by,
          `\u{1F4AC} **\u041D\u043E\u0432\u044B\u0439 \u043A\u043E\u043C\u043C\u0435\u043D\u0442\u0430\u0440\u0438\u0439 \u043E\u0442 \u0441\u043E\u0442\u0440\u0443\u0434\u043D\u0438\u043A\u0430!**

\u{1F4CB} \u0417\u0430\u0434\u0430\u0447\u0430: **${task.title}**

\u{1F468}\u200D\u{1F4BC} ${user.first_name}: _${commentText}_`,
          env
        );
      }
    }
    await handleViewTask(chatId, taskId, user, env);
  } catch (error) {
    console.error("\u274C Error saving comment:", error.message);
    await sendMessage(chatId, "\u274C \u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u0438 \u0434\u043E\u0431\u0430\u0432\u043B\u0435\u043D\u0438\u0438 \u043A\u043E\u043C\u043C\u0435\u043D\u0442\u0430\u0440\u0438\u044F", env);
  }
}
__name(handleSaveComment, "handleSaveComment");
async function handleEnterOrgCode(chatId, userId, code, userFrom, env) {
  console.log(`\u{1F511} Checking org code: ${code}`);
  try {
    const orgId = await getOrgIdByCode(code, env);
    if (!orgId) {
      await sendMessage(chatId, "\u274C \u041D\u0435\u0432\u0435\u0440\u043D\u044B\u0439 \u043A\u043E\u0434 \u043E\u0440\u0433\u0430\u043D\u0438\u0437\u0430\u0446\u0438\u0438. \u041F\u043E\u043F\u0440\u043E\u0431\u0443\u0439\u0442\u0435 \u0435\u0449\u0451 \u0440\u0430\u0437:", env);
      return;
    }
    console.log("\u2705 Org found:", orgId);
    await setState(userId, "ENTER_PHONE", { orgId, code }, env);
    const keyboard = {
      keyboard: [[{ text: "\u{1F4F1} \u041E\u0442\u043F\u0440\u0430\u0432\u0438\u0442\u044C \u043D\u043E\u043C\u0435\u0440", request_contact: true }]],
      resize_keyboard: true,
      one_time_keyboard: true
    };
    await sendMessage(chatId, "\u{1F4F1} \u041E\u0442\u043F\u0440\u0430\u0432\u044C\u0442\u0435 \u0432\u0430\u0448 \u043D\u043E\u043C\u0435\u0440 \u0442\u0435\u043B\u0435\u0444\u043E\u043D\u0430:", env, keyboard);
  } catch (error) {
    console.error("\u274C Error in handleEnterOrgCode:", error.message);
    await sendMessage(chatId, "\u274C \u041E\u0448\u0438\u0431\u043A\u0430. \u041F\u043E\u043F\u0440\u043E\u0431\u0443\u0439\u0442\u0435 \u0441\u043D\u043E\u0432\u0430.", env);
  }
}
__name(handleEnterOrgCode, "handleEnterOrgCode");
async function handleEnterPhone(chatId, userId, phone, stateData, userFrom, env) {
  console.log(`\u{1F4F1} Creating join request for user ${userId}, org ${stateData.orgId}`);
  try {
    await createJoinRequest(
      userId,
      userFrom.username,
      userFrom.first_name,
      phone,
      stateData.orgId,
      env
    );
    await clearState(userId, env);
    const bossId = await getOrgBossId(stateData.orgId, env);
    if (bossId) {
      await sendMessage(
        bossId,
        `\u{1F4E8} \u041D\u043E\u0432\u0430\u044F \u0437\u0430\u044F\u0432\u043A\u0430 \u043D\u0430 \u0432\u0441\u0442\u0443\u043F\u043B\u0435\u043D\u0438\u0435!

\u{1F464} ${userFrom.first_name}
\u{1F4F1} ${phone}

\u041F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u0432 \u0440\u0430\u0437\u0434\u0435\u043B\u0435 "\u041C\u043E\u044F \u043A\u043E\u043C\u0430\u043D\u0434\u0430"`,
        env
      );
    }
    await sendMessage(chatId, "\u2705 \u0417\u0430\u044F\u0432\u043A\u0430 \u043E\u0442\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u0430! \u041E\u0436\u0438\u0434\u0430\u0439\u0442\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0438\u044F \u043E\u0442 \u0440\u0443\u043A\u043E\u0432\u043E\u0434\u0438\u0442\u0435\u043B\u044F.", env);
  } catch (error) {
    console.error("\u274C Error in handleEnterPhone:", error.message);
    await sendMessage(chatId, "\u274C \u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u0438 \u043E\u0442\u043F\u0440\u0430\u0432\u043A\u0435 \u0437\u0430\u044F\u0432\u043A\u0438", env);
  }
}
__name(handleEnterPhone, "handleEnterPhone");
async function handleViewTask(chatId, taskId, user, env) {
  try {
    const task = await getTask(taskId, env);
    const comments = await getTaskComments(taskId, env);
    if (!task) {
      await sendMessage(chatId, "\u274C \u0417\u0430\u0434\u0430\u0447\u0430 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u0430", env);
      return;
    }
    const statusEmoji = { pending: "\u{1F534}", in_progress: "\u{1F7E1}", completed: "\u{1F7E2}" };
    const statusText = { pending: "\u041E\u0436\u0438\u0434\u0430\u0435\u0442", in_progress: "\u0412 \u0440\u0430\u0431\u043E\u0442\u0435", completed: "\u0417\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u0430" };
    let text = `\u{1F4CB} **${task.title}**

`;
    text += `\u{1F4CA} \u0421\u0442\u0430\u0442\u0443\u0441: ${statusEmoji[task.status]} ${statusText[task.status]}
`;
    text += `\u{1F4DD} ${task.description}
`;
    if (task.created_at) {
      text += `\u{1F550} \u0421\u043E\u0437\u0434\u0430\u043D\u0430: ${formatDeadline(task.created_at)}
`;
    }
    if (task.deadline) {
      text += `\u{1F4C5} \u0414\u0435\u0434\u043B\u0430\u0439\u043D: ${formatDeadline(task.deadline)}
`;
    }
    if (comments && comments.length > 0) {
      text += "\n\u{1F4AC} **\u041A\u043E\u043C\u043C\u0435\u043D\u0442\u0430\u0440\u0438\u0438:**\n";
      for (const comment of comments) {
        const roleEmoji = comment.role === "boss" ? "\u{1F454}" : "\u{1F468}\u200D\u{1F4BC}";
        text += `
${roleEmoji} **${comment.first_name}**
_${comment.comment_text}_
`;
      }
    }
    const keyboard = getTaskActionsKeyboard(taskId, task.status, user.role);
    await sendMessage(chatId, text, env, keyboard);
  } catch (error) {
    console.error("\u274C Error in handleViewTask:", error.message);
    await sendMessage(chatId, "\u274C \u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u0438 \u0437\u0430\u0433\u0440\u0443\u0437\u043A\u0435 \u0437\u0430\u0434\u0430\u0447\u0438", env);
  }
}
__name(handleViewTask, "handleViewTask");
async function handleShowMyTasks(chatId, userId, env) {
  try {
    const user = await getUser(userId, env);
    if (!user) {
      await sendMessage(chatId, "❌ Пользователь не найден.", env);
      return;
    }

    const tasks = await getEmployeeTasks(
      user.id,
      user.org_id,
      "active",
      env
    );
    let text = "\u{1F4CB} **\u041C\u043E\u0438 \u0437\u0430\u0434\u0430\u0447\u0438:**\n\n";
    const keyboard = { inline_keyboard: [] };
    for (const task of tasks) {
      const emoji = { pending: "\u{1F534}", in_progress: "\u{1F7E1}", completed: "\u{1F7E2}" };
      text += `${emoji[task.status]} ${task.title}
`;
      if (task.deadline) {
        text += `   \u{1F4C5} ${formatDeadline(task.deadline)}
`;
      }
      text += "\n";
      const displayTitle = task.title.length > 30 ? task.title.substring(0, 30) + "..." : task.title;
      keyboard.inline_keyboard.push([{
        text: `\u{1F4D6} ${displayTitle}`,
        callback_data: `view_task_${task.id}`
      }]);
    }
    await sendMessage(chatId, text, env, keyboard);
  } catch (error) {
    console.error("\u274C Error in handleShowMyTasks:", error.message);
    await sendMessage(chatId, "\u274C \u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u0438 \u0437\u0430\u0433\u0440\u0443\u0437\u043A\u0435 \u0437\u0430\u0434\u0430\u0447", env);
  }
}
__name(handleShowMyTasks, "handleShowMyTasks");

async function buildTeamTasksPage(user, env, filter = "active", page = 1) {
  const statusFilter =
    filter === "active"
      ? ["pending", "in_progress"]
      : ["completed"];

  const tasks = await getFilteredTasks(
    user.org_id,
    statusFilter,
    null,
    env
  );

  const perPage = 5;
  const totalPages = Math.max(1, Math.ceil(tasks.length / perPage));

  page = Math.max(1, Math.min(page, totalPages));

  const startIndex = (page - 1) * perPage;
  const pageTasks = tasks.slice(startIndex, startIndex + perPage);

  const tabKeyboard = {
    inline_keyboard: [
      [
        {
          text:
            filter === "active"
              ? "🔴🟡 Активные ✓"
              : "🔴🟡 Активные",
          callback_data: "team_tasks_active"
        },
        {
          text:
            filter === "done"
              ? "🟢 Выполненные ✓"
              : "🟢 Выполненные",
          callback_data: "team_tasks_done"
        }
      ]
    ]
  };

  if (tasks.length === 0) {
    const emptyText =
      filter === "active"
        ? "📭 Нет активных задач"
        : "📭 Нет выполненных задач";

    return {
      text: emptyText,
      keyboard: tabKeyboard
    };
  }

  const header =
    filter === "active"
      ? "🔴🟡 *Активные задачи команды:*\n\n"
      : "🟢 *Выполненные задачи команды:*\n\n";

  let text = header;

  const emoji = {
    pending: "🔴",
    in_progress: "🟡",
    completed: "🟢"
  };

  for (const task of pageTasks) {
    text += `${emoji[task.status] || "⚪"} *${task.title}*\n`;
    text += `   👨‍💼 ${task.emp_name}\n`;

    if (task.deadline) {
      text += `   📅 ${formatDeadline(task.deadline)}\n`;
    }

    text += "\n";

    const displayTitle =
      task.title.length > 28
        ? task.title.substring(0, 28) + "..."
        : task.title;

    tabKeyboard.inline_keyboard.push([
      {
        text: `📖 ${displayTitle}`,
        callback_data: `view_task_${task.id}`
      }
    ]);
  }

  if (totalPages > 1) {
    const paginationRow = [];

    if (page > 1) {
      paginationRow.push({
        text: "⬅️",
        callback_data: `team_page_${filter}_${page - 1}`
      });
    }

    paginationRow.push({
      text: `${page}/${totalPages}`,
      callback_data: "noop"
    });

    if (page < totalPages) {
      paginationRow.push({
        text: "➡️",
        callback_data: `team_page_${filter}_${page + 1}`
      });
    }

    tabKeyboard.inline_keyboard.push(paginationRow);
  }

  return {
    text,
    keyboard: tabKeyboard
  };
}

__name(buildTeamTasksPage, "buildTeamTasksPage");

async function handleShowTeamTasks(
  chatId,
  user,
  env,
  filter = "active",
  page = 1
) {
  try {
    const result = await buildTeamTasksPage(
      user,
      env,
      filter,
      page
    );

    await sendMessage(
      chatId,
      result.text,
      env,
      result.keyboard
    );

  } catch (error) {
    console.error(
      "❌ Error in handleShowTeamTasks:",
      error.message
    );

    await sendMessage(
      chatId,
      "❌ Ошибка при загрузке задач команды",
      env
    );
  }
}

__name(handleShowTeamTasks, "handleShowTeamTasks");


async function handleShowTeamMenu(chatId, env) {
  const keyboard = {
    inline_keyboard: [
      [{ text: "\u{1F465} \u0421\u043F\u0438\u0441\u043E\u043A \u0441\u043E\u0442\u0440\u0443\u0434\u043D\u0438\u043A\u043E\u0432", callback_data: "team_employees_list" }],
      [{ text: "\u{1F4E8} \u0417\u0430\u044F\u0432\u043A\u0438 \u043D\u0430 \u0432\u0441\u0442\u0443\u043F\u043B\u0435\u043D\u0438\u0435", callback_data: "team_pending_requests" }],
      [{ text: "\u{1F511} \u041A\u043E\u0434 \u043E\u0440\u0433\u0430\u043D\u0438\u0437\u0430\u0446\u0438\u0438", callback_data: "team_org_code" }]
    ]
  };
  await sendMessage(chatId, "\u{1F465} **\u0423\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u0438\u0435 \u043A\u043E\u043C\u0430\u043D\u0434\u043E\u0439:**\n\n\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0435:", env, keyboard);
}
__name(handleShowTeamMenu, "handleShowTeamMenu");
async function handleShowEmployeesList(chatId, user, env) {
  try {
    const employees = await getOrgEmployees(user.org_id, env);
    if (!employees || employees.length === 0) {
      await sendMessage(chatId, "\u{1F4ED} \u0412 \u0432\u0430\u0448\u0435\u0439 \u043A\u043E\u043C\u0430\u043D\u0434\u0435 \u043F\u043E\u043A\u0430 \u043D\u0435\u0442 \u0441\u043E\u0442\u0440\u0443\u0434\u043D\u0438\u043A\u043E\u0432", env);
      return;
    }
    let text = "\u{1F465} **\u0421\u043E\u0442\u0440\u0443\u0434\u043D\u0438\u043A\u0438 \u043E\u0440\u0433\u0430\u043D\u0438\u0437\u0430\u0446\u0438\u0438:**\n\n";
    for (const emp of employees) {
      text += `\u{1F468}\u200D\u{1F4BC} ${emp.first_name || emp.username}
`;
    }
    await sendMessage(chatId, text, env);
  } catch (error) {
    console.error("\u274C Error in handleShowEmployeesList:", error.message);
    await sendMessage(chatId, "\u274C \u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u0438 \u0437\u0430\u0433\u0440\u0443\u0437\u043A\u0435 \u0441\u043F\u0438\u0441\u043A\u0430 \u0441\u043E\u0442\u0440\u0443\u0434\u043D\u0438\u043A\u043E\u0432", env);
  }
}
__name(handleShowEmployeesList, "handleShowEmployeesList");
async function handleShowOrgCode(chatId, user, env) {
  try {
    const org = await getOrgInfo(user.org_id, env);
    if (!org) {
      await sendMessage(chatId, "\u274C \u041E\u0440\u0433\u0430\u043D\u0438\u0437\u0430\u0446\u0438\u044F \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u0430", env);
      return;
    }
    await sendMessage(
      chatId,
      `\u{1F511} *\u041A\u043E\u0434 \u0432\u0430\u0448\u0435\u0439 \u043E\u0440\u0433\u0430\u043D\u0438\u0437\u0430\u0446\u0438\u0438:*

${org.payment_code}

\u041E\u0442\u043F\u0440\u0430\u0432\u044C\u0442\u0435 \u044D\u0442\u043E\u0442 \u043A\u043E\u0434 \u0441\u043E\u0442\u0440\u0443\u0434\u043D\u0438\u043A\u0430\u043C \u0434\u043B\u044F \u043F\u0440\u0438\u0441\u043E\u0435\u0434\u0438\u043D\u0435\u043D\u0438\u044F.`,
      env
    );
  } catch (error) {
    console.error("\u274C Error in handleShowOrgCode:", error.message);
    await sendMessage(chatId, "\u274C \u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u0438 \u043F\u043E\u043B\u0443\u0447\u0435\u043D\u0438\u0438 \u043A\u043E\u0434\u0430 \u043E\u0440\u0433\u0430\u043D\u0438\u0437\u0430\u0446\u0438\u0438", env);
  }
}
__name(handleShowOrgCode, "handleShowOrgCode");
async function handleShowPendingRequests(chatId, user, env) {
  try {
    const requests = await getPendingRequests(user.org_id, env);
    if (!requests || requests.length === 0) {
      await sendMessage(chatId, "\u{1F4ED} \u041D\u0435\u0442 \u043E\u0436\u0438\u0434\u0430\u044E\u0449\u0438\u0445 \u0437\u0430\u044F\u0432\u043E\u043A", env);
      return;
    }
    let text = "\u{1F4E8} **\u0417\u0430\u044F\u0432\u043A\u0438 \u043D\u0430 \u0432\u0441\u0442\u0443\u043F\u043B\u0435\u043D\u0438\u0435:**\n\n";
    const keyboard = { inline_keyboard: [] };
    for (const req of requests) {
      text += `\u{1F464} ${req.first_name}
\u{1F4F1} ${req.phone}

`;
      keyboard.inline_keyboard.push([
        { text: `\u2705 \u041F\u0440\u0438\u043D\u044F\u0442\u044C ${req.first_name}`, callback_data: `approve_req_${req.id}` },
        { text: `\u274C \u041E\u0442\u043A\u043B\u043E\u043D\u0438\u0442\u044C`, callback_data: `reject_req_${req.id}` }
      ]);
    }
    await sendMessage(chatId, text, env, keyboard);
  } catch (error) {
    console.error("\u274C Error in handleShowPendingRequests:", error.message);
    await sendMessage(chatId, "\u274C \u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u0438 \u0437\u0430\u0433\u0440\u0443\u0437\u043A\u0435 \u0437\u0430\u044F\u0432\u043E\u043A", env);
  }
}
__name(handleShowPendingRequests, "handleShowPendingRequests");
async function handleApproveRequest(chatId, requestId, env) {
  try {
    const result = await approveJoinRequest(requestId, env);
    if (result) {
      await sendMessage(chatId, "\u2705 \u0421\u043E\u0442\u0440\u0443\u0434\u043D\u0438\u043A \u0434\u043E\u0431\u0430\u0432\u043B\u0435\u043D \u0432 \u043A\u043E\u043C\u0430\u043D\u0434\u0443!", env);
      const keyboard = getEmployeeKeyboard();
      await sendMessage(
        result.userId,
        "\u{1F389} \u0412\u0430\u0448\u0430 \u0437\u0430\u044F\u0432\u043A\u0430 \u043E\u0434\u043E\u0431\u0440\u0435\u043D\u0430! \u0414\u043E\u0431\u0440\u043E \u043F\u043E\u0436\u0430\u043B\u043E\u0432\u0430\u0442\u044C \u0432 \u043A\u043E\u043C\u0430\u043D\u0434\u0443!",
        env,
        keyboard
      );
    } else {
      await sendMessage(chatId, "\u274C \u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u0438 \u043E\u0434\u043E\u0431\u0440\u0435\u043D\u0438\u0438 \u0437\u0430\u044F\u0432\u043A\u0438", env);
    }
  } catch (error) {
    console.error("\u274C Error in handleApproveRequest:", error.message);
    await sendMessage(chatId, "\u274C \u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u0438 \u043E\u0434\u043E\u0431\u0440\u0435\u043D\u0438\u0438 \u0437\u0430\u044F\u0432\u043A\u0438", env);
  }
}
__name(handleApproveRequest, "handleApproveRequest");
async function handleRejectRequest(chatId, requestId, env) {
  try {
    const userId = await rejectJoinRequest(requestId, env);
    await sendMessage(chatId, "\u274C \u0417\u0430\u044F\u0432\u043A\u0430 \u043E\u0442\u043A\u043B\u043E\u043D\u0435\u043D\u0430", env);
    if (userId) {
      await sendMessage(userId, "\u{1F614} \u041A \u0441\u043E\u0436\u0430\u043B\u0435\u043D\u0438\u044E, \u0432\u0430\u0448\u0430 \u0437\u0430\u044F\u0432\u043A\u0430 \u0431\u044B\u043B\u0430 \u043E\u0442\u043A\u043B\u043E\u043D\u0435\u043D\u0430.", env);
    }
  } catch (error) {
    console.error("\u274C Error in handleRejectRequest:", error.message);
    await sendMessage(chatId, "\u274C \u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u0438 \u043E\u0442\u043A\u043B\u043E\u043D\u0435\u043D\u0438\u0438 \u0437\u0430\u044F\u0432\u043A\u0438", env);
  }
}
__name(handleRejectRequest, "handleRejectRequest");
async function handleShowCalendar(chatId, user, env) {
  try {
    const today = /* @__PURE__ */ new Date();
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - today.getDay() + 1);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    const tasks = await getWeekTasks(user.org_id, weekStart, weekEnd, env);
    const meetings = await getWeekMeetings(user.org_id, weekStart, weekEnd, env);
    let text = `\u{1F4C6} **\u041A\u0430\u043B\u0435\u043D\u0434\u0430\u0440\u044C \u043D\u0430 \u043D\u0435\u0434\u0435\u043B\u044E**
${formatDate(weekStart)} - ${formatDate(weekEnd)}

`;
    if (tasks && tasks.length > 0) {
      text += "\u{1F4CB} **\u0417\u0430\u0434\u0430\u0447\u0438:**\n";
      for (const task of tasks) {
        text += `\u2022 ${task.title} - ${formatDeadline(task.deadline)}
`;
      }
      text += "\n";
    }
    if (meetings && meetings.length > 0) {
      text += "\u{1F4C5} **\u0412\u0441\u0442\u0440\u0435\u0447\u0438:**\n";
      for (const meeting of meetings) {
        text += `\u2022 ${meeting.title} - ${formatDeadline(meeting.meeting_datetime)}
`;
      }
    }
    if ((!tasks || tasks.length === 0) && (!meetings || meetings.length === 0)) {
      text += "\u{1F4ED} \u041D\u0430 \u044D\u0442\u043E\u0439 \u043D\u0435\u0434\u0435\u043B\u0435 \u043D\u0438\u0447\u0435\u0433\u043E \u043D\u0435 \u0437\u0430\u043F\u043B\u0430\u043D\u0438\u0440\u043E\u0432\u0430\u043D\u043E";
    }
    await sendMessage(chatId, text, env);
  } catch (error) {
    console.error("\u274C Error in handleShowCalendar:", error.message);
    await sendMessage(chatId, "\u274C \u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u0438 \u0437\u0430\u0433\u0440\u0443\u0437\u043A\u0435 \u043A\u0430\u043B\u0435\u043D\u0434\u0430\u0440\u044F", env);
  }
}
__name(handleShowCalendar, "handleShowCalendar");
async function handleShowOverdueTasks(chatId, user, env) {
  try {
    const tasks = await getOverdueTasks(user.org_id, env);
    if (!tasks || tasks.length === 0) {
      await sendMessage(chatId, "\u2705 \u041F\u0440\u043E\u0441\u0440\u043E\u0447\u0435\u043D\u043D\u044B\u0445 \u0437\u0430\u0434\u0430\u0447 \u043D\u0435\u0442!", env);
      return;
    }
    let text = "\u26A0\uFE0F **\u041F\u0440\u043E\u0441\u0440\u043E\u0447\u0435\u043D\u043D\u044B\u0435 \u0437\u0430\u0434\u0430\u0447\u0438:**\n\n";
    const keyboard = { inline_keyboard: [] };
    for (const task of tasks) {
      text += `\u{1F534} **${task.title}**
`;
      text += `   \u{1F468}\u200D\u{1F4BC} ${task.emp_name}
`;
      text += `   \u{1F4C5} \u0414\u0435\u0434\u043B\u0430\u0439\u043D \u0431\u044B\u043B: ${formatDeadline(task.deadline)}

`;
      const displayTitle = task.title.length > 30 ? task.title.substring(0, 30) + "..." : task.title;
      keyboard.inline_keyboard.push([{
        text: `\u{1F4D6} ${displayTitle}`,
        callback_data: `view_task_${task.id}`
      }]);
    }
    await sendMessage(chatId, text, env, keyboard);
  } catch (error) {
    console.error("\u274C Error in handleShowOverdueTasks:", error.message);
    await sendMessage(chatId, "\u274C \u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u0438 \u0437\u0430\u0433\u0440\u0443\u0437\u043A\u0435 \u043F\u0440\u043E\u0441\u0440\u043E\u0447\u0435\u043D\u043D\u044B\u0445 \u0437\u0430\u0434\u0430\u0447", env);
  }
}
__name(handleShowOverdueTasks, "handleShowOverdueTasks");
async function handleShowMyMeetings(chatId, userId, env) {
  try {
    const meetings = await getEmployeeMeetings(userId, env);
    if (!meetings || meetings.length === 0) {
      await sendMessage(chatId, "\u{1F4ED} \u0423 \u0432\u0430\u0441 \u043F\u043E\u043A\u0430 \u043D\u0435\u0442 \u0437\u0430\u043F\u043B\u0430\u043D\u0438\u0440\u043E\u0432\u0430\u043D\u043D\u044B\u0445 \u0432\u0441\u0442\u0440\u0435\u0447", env);
      return;
    }
    let text = "\u{1F4C5} **\u041C\u043E\u0438 \u0432\u0441\u0442\u0440\u0435\u0447\u0438:**\n\n";
    for (const meeting of meetings) {
      text += `\u{1F4CC} **${meeting.title}**
`;
      text += `   \u23F0 ${formatDeadline(meeting.meeting_datetime)}
`;
      text += `   \u{1F4CD} ${meeting.location || "\u041C\u0435\u0441\u0442\u043E \u043D\u0435 \u0443\u043A\u0430\u0437\u0430\u043D\u043E"}

`;
    }
    await sendMessage(chatId, text, env);
  } catch (error) {
    console.error("\u274C Error in handleShowMyMeetings:", error.message);
    await sendMessage(chatId, "\u274C \u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u0438 \u0437\u0430\u0433\u0440\u0443\u0437\u043A\u0435 \u0432\u0441\u0442\u0440\u0435\u0447", env);
  }
}
__name(handleShowMyMeetings, "handleShowMyMeetings");
async function handleCalendarCallback(chatId, messageId, data, userId, env) {
  try {
    const parts = data.split("_");
    const action = parts[1];
    if (action === "day") {
      const year = parseInt(parts[2]);
      const month = parseInt(parts[3]);
      const day = parseInt(parts[4]);
      const state = await getUserState(userId, env);
      const stateData = state && state.data ? JSON.parse(state.data) : {};
      stateData.year = year;
      stateData.month = month;
      stateData.day = day;
      const keyboard = createTimePickerKeyboard();
      await editMessage(chatId, messageId, "\u23F0 \u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0432\u0440\u0435\u043C\u044F \u0434\u0435\u0434\u043B\u0430\u0439\u043D\u0430:", env, keyboard);
      await setState(userId, state.state, stateData, env);
      return;
    }
    if (action === "prev" || action === "next") {
      let year = parseInt(parts[2]);
      let month = parseInt(parts[3]);
      if (action === "prev") {
        month--;
        if (month === 0) {
          month = 12;
          year--;
        }
      } else {
        month++;
        if (month === 13) {
          month = 1;
          year++;
        }
      }
      const calendar = createCalendarKeyboard(year, month);
      await editMessage(chatId, messageId, "\u{1F4C5} \u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0434\u0430\u0442\u0443:", env, calendar);
      return;
    }
  } catch (error) {
    console.error("\u274C Error in handleCalendarCallback:", error.message);
  }
}
__name(handleCalendarCallback, "handleCalendarCallback");
async function handleTimePickerCallback(chatId, messageId, data, userId, env) {
  try {
    const state = await getUserState(userId, env);
    const stateData = state && state.data ? JSON.parse(state.data) : {};
    if (data === "skip_deadline") {
      stateData.deadline = null;
    } else {
      const parts = data.split("_");
      const hour = parts[1];
      const minute = parts[2];
      const deadline = new Date(stateData.year, stateData.month - 1, stateData.day, parseInt(hour), parseInt(minute));
      stateData.deadline = deadline.toISOString().slice(0, 16).replace("T", " ");
    }
    await setState(userId, "SELECT_EMPLOYEE", stateData, env);
    const user = await getUser(userId, env);
    const employees = await getOrgEmployees(user.org_id, env);
    if (!employees || employees.length === 0) {
      await sendMessage(chatId, "\u274C \u0412 \u0432\u0430\u0448\u0435\u0439 \u043E\u0440\u0433\u0430\u043D\u0438\u0437\u0430\u0446\u0438\u0438 \u043F\u043E\u043A\u0430 \u043D\u0435\u0442 \u0441\u043E\u0442\u0440\u0443\u0434\u043D\u0438\u043A\u043E\u0432", env);
      await clearState(userId, env);
      return;
    }
    const keyboard = createEmployeeSelectKeyboard(employees, []);
    await editMessage(chatId, messageId, "\u{1F465} \u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0438\u0441\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u0435\u0439:", env, keyboard);
  } catch (error) {
    console.error("\u274C Error in handleTimePickerCallback:", error.message);
  }
}
__name(handleTimePickerCallback, "handleTimePickerCallback");
async function handleToggleEmployee(chatId, messageId, data, userId, env) {
  try {
    const empId = parseInt(data.split("_")[2]);
    const state = await getUserState(userId, env);
    const stateData = state && state.data ? JSON.parse(state.data) : {};
    if (!stateData.selectedEmployees) {
      stateData.selectedEmployees = [];
    }
    const index = stateData.selectedEmployees.indexOf(empId);
    if (index > -1) {
      stateData.selectedEmployees.splice(index, 1);
    } else {
      stateData.selectedEmployees.push(empId);
    }
    await setState(userId, state.state, stateData, env);
    const user = await getUser(userId, env);
    const employees = await getOrgEmployees(user.org_id, env);
    const keyboard = createEmployeeSelectKeyboard(employees, stateData.selectedEmployees);
    await editMessage(chatId, messageId, "\u{1F465} \u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0438\u0441\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u0435\u0439:", env, keyboard);
  } catch (error) {
    console.error("\u274C Error in handleToggleEmployee:", error.message);
  }
}
__name(handleToggleEmployee, "handleToggleEmployee");
async function handleSelectAllEmployees(chatId, messageId, userId, env) {
  try {
    const state = await getUserState(userId, env);
    const stateData = state && state.data ? JSON.parse(state.data) : {};
    const user = await getUser(userId, env);
    const employees = await getOrgEmployees(user.org_id, env);
    stateData.selectedEmployees = employees.map((e) => e.id);
    await setState(userId, state.state, stateData, env);
    const keyboard = createEmployeeSelectKeyboard(employees, stateData.selectedEmployees);
    await editMessage(chatId, messageId, "\u{1F465} \u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0438\u0441\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u0435\u0439:", env, keyboard);
  } catch (error) {
    console.error("\u274C Error in handleSelectAllEmployees:", error.message);
  }
}
__name(handleSelectAllEmployees, "handleSelectAllEmployees");
async function handleDeselectAllEmployees(chatId, messageId, userId, env) {
  try {
    const state = await getUserState(userId, env);
    const stateData = state && state.data ? JSON.parse(state.data) : {};
    stateData.selectedEmployees = [];
    await setState(userId, state.state, stateData, env);
    const user = await getUser(userId, env);
    const employees = await getOrgEmployees(user.org_id, env);
    const keyboard = createEmployeeSelectKeyboard(employees, []);
    await editMessage(chatId, messageId, "\u{1F465} \u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0438\u0441\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u0435\u0439:", env, keyboard);
  } catch (error) {
    console.error("\u274C Error in handleDeselectAllEmployees:", error.message);
  }
}
__name(handleDeselectAllEmployees, "handleDeselectAllEmployees");
async function handleConfirmEmployees(chatId, messageId, userId, user, env) {
  try {
    const state = await getUserState(userId, env);
    const stateData = state && state.data ? JSON.parse(state.data) : {};
    if (!stateData.selectedEmployees || stateData.selectedEmployees.length === 0) {
      await sendMessage(chatId, "\u274C \u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0445\u043E\u0442\u044F \u0431\u044B \u043E\u0434\u043D\u043E\u0433\u043E \u0441\u043E\u0442\u0440\u0443\u0434\u043D\u0438\u043A\u0430", env);
      return;
    }
    console.log(`\u{1F4DD} Creating tasks for ${stateData.selectedEmployees.length} employees`);
    for (const empId of stateData.selectedEmployees) {
      await createTask(
        stateData.description,
        stateData.description,
        stateData.deadline ?? null,
        userId,
        empId,
        user.org_id,
        env
      );
      await sendMessage(
        empId,
        `\u{1F4CB} **\u041D\u043E\u0432\u0430\u044F \u0437\u0430\u0434\u0430\u0447\u0430!**

${stateData.description}

\u{1F4C5} \u0414\u0435\u0434\u043B\u0430\u0439\u043D: ${stateData.deadline ? formatDeadline(stateData.deadline) : "\u041D\u0435 \u0443\u043A\u0430\u0437\u0430\u043D"}`,
        env
      );
    }
    await clearState(userId, env);
    await editMessage(chatId, messageId, `\u2705 \u0417\u0430\u0434\u0430\u0447\u0430 \u0441\u043E\u0437\u0434\u0430\u043D\u0430 \u0434\u043B\u044F ${stateData.selectedEmployees.length} \u0441\u043E\u0442\u0440\u0443\u0434\u043D\u0438\u043A\u043E\u0432!`, env);
  } catch (error) {
    console.error("\u274C Error in handleConfirmEmployees:", error.message);
    await sendMessage(chatId, "\u274C \u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u0438 \u0441\u043E\u0437\u0434\u0430\u043D\u0438\u0438 \u0437\u0430\u0434\u0430\u0447", env);
  }
}
__name(handleConfirmEmployees, "handleConfirmEmployees");
async function handleMeetingCalendarCallback(chatId, messageId, data, userId, env) {
  try {
    const parts = data.split("_");
    const action = parts[1];
    if (action === "day") {
      const year = parseInt(parts[2]);
      const month = parseInt(parts[3]);
      const day = parseInt(parts[4]);
      const state = await getUserState(userId, env);
      const stateData = state && state.data ? JSON.parse(state.data) : {};
      stateData.year = year;
      stateData.month = month;
      stateData.day = day;
      const keyboard = createTimePickerKeyboard("mtime");
      await editMessage(chatId, messageId, "\u23F0 \u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0432\u0440\u0435\u043C\u044F \u0432\u0441\u0442\u0440\u0435\u0447\u0438:", env, keyboard);
      await setState(userId, "MEETING_TIME", stateData, env);
    } else if (action === "prev" || action === "next") {
      let year = parseInt(parts[2]);
      let month = parseInt(parts[3]);
      if (action === "prev") {
        month--;
        if (month === 0) {
          month = 12;
          year--;
        }
      } else {
        month++;
        if (month === 13) {
          month = 1;
          year++;
        }
      }
      const calendar = createCalendarKeyboard(year, month, "mcal");
      await editMessage(chatId, messageId, "\u{1F4C5} \u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0434\u0430\u0442\u0443 \u0432\u0441\u0442\u0440\u0435\u0447\u0438:", env, calendar);
    }
  } catch (error) {
    console.error("\u274C Error in handleMeetingCalendarCallback:", error.message);
  }
}
__name(handleMeetingCalendarCallback, "handleMeetingCalendarCallback");
async function handleMeetingTimeCallback(chatId, messageId, data, userId, env) {
  try {
    const state = await getUserState(userId, env);
    const stateData = state && state.data ? JSON.parse(state.data) : {};
    const parts = data.split("_");
    const hour = parts[1];
    const minute = parts[2];
    const datetime = new Date(stateData.year, stateData.month - 1, stateData.day, parseInt(hour), parseInt(minute));
    stateData.datetime = datetime.toISOString().slice(0, 16).replace("T", " ");
    await setState(userId, "MEETING_LOCATION", stateData, env);
    await sendMessage(chatId, '\u{1F4CD} \u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u043C\u0435\u0441\u0442\u043E \u043F\u0440\u043E\u0432\u0435\u0434\u0435\u043D\u0438\u044F \u0432\u0441\u0442\u0440\u0435\u0447\u0438 (\u0438\u043B\u0438 "\u041F\u0440\u043E\u043F\u0443\u0441\u0442\u0438\u0442\u044C"):', env);
  } catch (error) {
    console.error("\u274C Error in handleMeetingTimeCallback:", error.message);
  }
}
__name(handleMeetingTimeCallback, "handleMeetingTimeCallback");
async function handleMeetingLocation(chatId, userId, location, stateData, user, env) {
  try {
    stateData.location = location === "\u041F\u0440\u043E\u043F\u0443\u0441\u0442\u0438\u0442\u044C" ? null : location;
    await setState(userId, "MEETING_PARTICIPANTS", stateData, env);
    const employees = await getOrgEmployees(user.org_id, env);
    const keyboard = createEmployeeSelectKeyboard(employees, [], "mtoggle", "mselect_all", "mdeselect_all", "mconfirm_participants");
    await sendMessage(chatId, "\u{1F465} \u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0443\u0447\u0430\u0441\u0442\u043D\u0438\u043A\u043E\u0432 \u0432\u0441\u0442\u0440\u0435\u0447\u0438:", env, keyboard);
  } catch (error) {
    console.error("\u274C Error in handleMeetingLocation:", error.message);
  }
}
__name(handleMeetingLocation, "handleMeetingLocation");
async function handleToggleMeetingParticipant(chatId, messageId, data, userId, env) {
  try {
    const empId = parseInt(data.split("_")[1]);
    const state = await getUserState(userId, env);
    const stateData = state && state.data ? JSON.parse(state.data) : {};
    if (!stateData.selectedEmployees) {
      stateData.selectedEmployees = [];
    }
    const index = stateData.selectedEmployees.indexOf(empId);
    if (index > -1) {
      stateData.selectedEmployees.splice(index, 1);
    } else {
      stateData.selectedEmployees.push(empId);
    }
    await setState(userId, state.state, stateData, env);
    const user = await getUser(userId, env);
    const employees = await getOrgEmployees(user.org_id, env);
    const keyboard = createEmployeeSelectKeyboard(employees, stateData.selectedEmployees, "mtoggle", "mselect_all", "mdeselect_all", "mconfirm_participants");
    await editMessage(chatId, messageId, "\u{1F465} \u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0443\u0447\u0430\u0441\u0442\u043D\u0438\u043A\u043E\u0432 \u0432\u0441\u0442\u0440\u0435\u0447\u0438:", env, keyboard);
  } catch (error) {
    console.error("\u274C Error in handleToggleMeetingParticipant:", error.message);
  }
}
__name(handleToggleMeetingParticipant, "handleToggleMeetingParticipant");
async function handleSelectAllMeetingParticipants(chatId, messageId, userId, env) {
  try {
    const state = await getUserState(userId, env);
    const stateData = state && state.data ? JSON.parse(state.data) : {};
    const user = await getUser(userId, env);
    const employees = await getOrgEmployees(user.org_id, env);
    stateData.selectedEmployees = employees.map((e) => e.id);
    await setState(userId, state.state, stateData, env);
    const keyboard = createEmployeeSelectKeyboard(employees, stateData.selectedEmployees, "mtoggle", "mselect_all", "mdeselect_all", "mconfirm_participants");
    await editMessage(chatId, messageId, "\u{1F465} \u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0443\u0447\u0430\u0441\u0442\u043D\u0438\u043A\u043E\u0432 \u0432\u0441\u0442\u0440\u0435\u0447\u0438:", env, keyboard);
  } catch (error) {
    console.error("\u274C Error in handleSelectAllMeetingParticipants:", error.message);
  }
}
__name(handleSelectAllMeetingParticipants, "handleSelectAllMeetingParticipants");
async function handleDeselectAllMeetingParticipants(chatId, messageId, userId, env) {
  try {
    const state = await getUserState(userId, env);
    const stateData = state && state.data ? JSON.parse(state.data) : {};
    stateData.selectedEmployees = [];
    await setState(userId, state.state, stateData, env);
    const user = await getUser(userId, env);
    const employees = await getOrgEmployees(user.org_id, env);
    const keyboard = createEmployeeSelectKeyboard(employees, [], "mtoggle", "mselect_all", "mdeselect_all", "mconfirm_participants");
    await editMessage(chatId, messageId, "\u{1F465} \u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0443\u0447\u0430\u0441\u0442\u043D\u0438\u043A\u043E\u0432 \u0432\u0441\u0442\u0440\u0435\u0447\u0438:", env, keyboard);
  } catch (error) {
    console.error("\u274C Error in handleDeselectAllMeetingParticipants:", error.message);
  }
}
__name(handleDeselectAllMeetingParticipants, "handleDeselectAllMeetingParticipants");
async function handleConfirmMeetingParticipants(chatId, messageId, userId, user, env) {
  try {
    const state = await getUserState(userId, env);
    const stateData = state && state.data ? JSON.parse(state.data) : {};
    if (!stateData.selectedEmployees || stateData.selectedEmployees.length === 0) {
      await sendMessage(chatId, "\u274C \u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0445\u043E\u0442\u044F \u0431\u044B \u043E\u0434\u043D\u043E\u0433\u043E \u0443\u0447\u0430\u0441\u0442\u043D\u0438\u043A\u0430", env);
      return;
    }
    await createMeeting(
      stateData.title,
      stateData.title,
      stateData.datetime,
      stateData.location,
      userId,
      user.org_id,
      stateData.selectedEmployees,
      env
    );
    for (const empId of stateData.selectedEmployees) {
      await sendMessage(
        empId,
        `\u{1F4C5} **\u041D\u043E\u0432\u0430\u044F \u0432\u0441\u0442\u0440\u0435\u0447\u0430!**

\u{1F4CC} ${stateData.title}
\u23F0 ${formatDeadline(stateData.datetime)}
\u{1F4CD} ${stateData.location || "\u041C\u0435\u0441\u0442\u043E \u043D\u0435 \u0443\u043A\u0430\u0437\u0430\u043D\u043E"}`,
        env
      );
    }
    await clearState(userId, env);
    await editMessage(chatId, messageId, "\u2705 \u0412\u0441\u0442\u0440\u0435\u0447\u0430 \u043D\u0430\u0437\u043D\u0430\u0447\u0435\u043D\u0430!", env);
  } catch (error) {
    console.error("\u274C Error in handleConfirmMeetingParticipants:", error.message);
    await sendMessage(chatId, "\u274C \u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u0438 \u0441\u043E\u0437\u0434\u0430\u043D\u0438\u0438 \u0432\u0441\u0442\u0440\u0435\u0447\u0438", env);
  }
}
__name(handleConfirmMeetingParticipants, "handleConfirmMeetingParticipants");
async function handleDeadlineCalendarCallback(chatId, messageId, data, userId, env) {
  try {
    const parts = data.split("_");
    const taskId = parts[1];
    const action = parts[2];
    if (action === "day") {
      const year = parseInt(parts[3]);
      const month = parseInt(parts[4]);
      const day = parseInt(parts[5]);
      const keyboard = createTimePickerKeyboard(`dltime_${taskId}_${year}_${month}_${day}`);
      await editMessage(chatId, messageId, "\u23F0 \u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u043D\u043E\u0432\u043E\u0435 \u0432\u0440\u0435\u043C\u044F \u0434\u0435\u0434\u043B\u0430\u0439\u043D\u0430:", env, keyboard);
    } else if (action === "prev" || action === "next") {
      let year = parseInt(parts[3]);
      let month = parseInt(parts[4]);
      if (action === "prev") {
        month--;
        if (month === 0) {
          month = 12;
          year--;
        }
      } else {
        month++;
        if (month === 13) {
          month = 1;
          year++;
        }
      }
      let calendar = createCalendarKeyboard(year, month, `dlcal_${taskId}_`);
      calendar.inline_keyboard.push([
        { text: "\u274C \u041E\u0442\u043C\u0435\u043D\u0430", callback_data: `cancel_deadline_${taskId}` }
      ]);
      await editMessage(chatId, messageId, "\u{1F4C5} \u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u043D\u043E\u0432\u0443\u044E \u0434\u0430\u0442\u0443 \u0434\u0435\u0434\u043B\u0430\u0439\u043D\u0430:", env, calendar);
    }
  } catch (error) {
    console.error("\u274C Error in handleDeadlineCalendarCallback:", error.message);
  }
}
__name(handleDeadlineCalendarCallback, "handleDeadlineCalendarCallback");
async function handleDeadlineTimeCallback(chatId, messageId, data, userId, env) {
  try {
    const parts = data.split("_");
    const taskId = parts[1];
    const year = parseInt(parts[2]);
    const month = parseInt(parts[3]);
    const day = parseInt(parts[4]);
    const hour = parts[5];
    const minute = parts[6];
    const newDeadline = new Date(
      year,
      month - 1,
      day,
      parseInt(hour),
      parseInt(minute)
    );
    const deadlineStr = newDeadline.toISOString().slice(0, 16).replace("T", " ");
    await env.DB.prepare(
      "UPDATE tasks SET deadline = ? WHERE id = ?"
    ).bind(deadlineStr, taskId).run();
    await env.DB.prepare(
      "DELETE FROM reminders_sent WHERE task_id = ?"
    ).bind(taskId).run();
    const task = await env.DB.prepare(`
      SELECT t.*, u.first_name as emp_name
      FROM tasks t JOIN users u ON t.assigned_to = u.id
      WHERE t.id = ?
    `).bind(taskId).first();
    await editMessage(
      chatId,
      messageId,
      `\u2705 \u0414\u0435\u0434\u043B\u0430\u0439\u043D \u043E\u0431\u043D\u043E\u0432\u043B\u0451\u043D!

\u{1F4CB} ${task ? task.title : "\u0417\u0430\u0434\u0430\u0447\u0430"}
\u{1F4C5} \u041D\u043E\u0432\u044B\u0439 \u0434\u0435\u0434\u043B\u0430\u0439\u043D: ${formatDeadline(deadlineStr)}`,
      env
    );
    if (task) {
      await sendMessage(
        task.assigned_to,
        `\u{1F4C5} *\u0414\u0435\u0434\u043B\u0430\u0439\u043D \u0437\u0430\u0434\u0430\u0447\u0438 \u0438\u0437\u043C\u0435\u043D\u0451\u043D!*

\u{1F4CB} ${task.title}
\u{1F4C5} \u041D\u043E\u0432\u044B\u0439 \u0434\u0435\u0434\u043B\u0430\u0439\u043D: ${formatDeadline(deadlineStr)}`,
        env
      );
    }
  } catch (error) {
    console.error("\u274C Error in handleDeadlineTimeCallback:", error.message);
    await sendMessage(chatId, "\u274C \u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u0438 \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u0438 \u0434\u0435\u0434\u043B\u0430\u0439\u043D\u0430", env);
  }
}
__name(handleDeadlineTimeCallback, "handleDeadlineTimeCallback");
async function checkReminders(env) {
  console.log("\u23F0 Checking reminders...");
  try {
    await checkTaskReminders(env);
    await checkMeetingReminders(env);
    await checkPendingAIDeadlineClarifications(env);
  } catch (error) {
    console.error("\u274C Error in checkReminders:", error.message);
  }
}
__name(checkReminders, "checkReminders");
async function checkTaskReminders(env) {
  try {
    const now = /* @__PURE__ */ new Date();
    const tasks = await env.DB.prepare(`
      SELECT t.id, t.title, t.deadline, t.status, t.assigned_to, t.created_by, t.created_at,
             emp.first_name as emp_name, boss.first_name as boss_name
      FROM tasks t
      JOIN users emp ON t.assigned_to = emp.id
      JOIN users boss ON t.created_by = boss.id
      WHERE t.status != 'completed'
      AND t.deadline IS NOT NULL
      AND t.deadline != ''
    `).all();
    for (const task of tasks.results) {
      const deadline = new Date(task.deadline);
      const created = new Date(task.created_at);
      const hoursLeft = (deadline - now) / 36e5;
      const hoursSince = (now - created) / 36e5;
      const totalHours = (deadline - created) / 36e5;
      if (task.status === "pending") {
        if (hoursSince >= 2) {
          const sent = await wasReminderSent(task.id, null, "boss_not_accepted_2h", env);
          if (!sent) {
            await sendMessage(
              task.created_by,
              `\u{1F634} *\u0428\u0435\u0444, \u0442\u0443\u0442 \u0437\u0430\u0434\u0430\u0447\u043A\u0443 \u043D\u0435 \u0432\u0437\u044F\u043B\u0438 \u0432 \u0440\u0430\u0431\u043E\u0442\u0443...*

\u{1F4CB} ${task.title}
\u{1F468}\u200D\u{1F4BC} ${task.emp_name} \u043F\u043E\u043A\u0430 \u0441\u043C\u043E\u0442\u0440\u0438\u0442 \u0432 \u043E\u043A\u043D\u043E
\u{1F4C5} \u0414\u0435\u0434\u043B\u0430\u0439\u043D: ${formatDeadline(task.deadline)}

_\u041C\u043E\u0436\u0435\u0442 \u043D\u0430\u043F\u043E\u043C\u043D\u0438\u0442\u044C \u043B\u0438\u0447\u043D\u043E? \u{1F604}_`,
              env
            );
            await markReminderSent(task.id, null, "boss_not_accepted_2h", env);
          }
        }
        if (hoursSince >= 24) {
          const sent = await wasReminderSent(task.id, null, "boss_not_accepted_24h", env);
          if (!sent) {
            await sendMessage(
              task.created_by,
              `\u{1F6A8} *\u0417\u0430\u0434\u0430\u0447\u0430 \u0443\u0436\u0435 \u0441\u0443\u0442\u043A\u0438 \u0432\u0438\u0441\u0438\u0442 \u043D\u0435\u0442\u0440\u043E\u043D\u0443\u0442\u043E\u0439!*

\u{1F4CB} ${task.title}
\u{1F468}\u200D\u{1F4BC} \u0418\u0441\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044C: ${task.emp_name}
\u{1F4C5} \u0414\u0435\u0434\u043B\u0430\u0439\u043D: ${formatDeadline(task.deadline)}

_\u0421\u0442\u0430\u0442\u0443\u0441: \u0434\u0430\u0436\u0435 \u043D\u0435 \u043D\u0430\u0447\u0430\u0442\u0430. \u041F\u043E\u0440\u0430 \u043F\u043E\u0433\u043E\u0432\u043E\u0440\u0438\u0442\u044C!_`,
              env
            );
            await markReminderSent(task.id, null, "boss_not_accepted_24h", env);
          }
        }
      }
      if (hoursLeft > 0) {
        if (totalHours >= 72 && hoursLeft >= 23.5 && hoursLeft <= 24.5) {
          const sent = await wasReminderSent(task.id, null, "emp_24h", env);
          if (!sent) {
            await sendMessage(
              task.assigned_to,
              `\u23F0 *\u041D\u0430\u043F\u043E\u043C\u0438\u043D\u0430\u043D\u0438\u0435!*

\u{1F4CB} ${task.title}
\u{1F4C5} \u0414\u0435\u0434\u043B\u0430\u0439\u043D *\u0437\u0430\u0432\u0442\u0440\u0430* (${formatDeadline(task.deadline)})

\u0412\u0441\u0451 \u0438\u0434\u0451\u0442 \u043F\u043E \u043F\u043B\u0430\u043D\u0443? \u{1F4AA}`,
              env
            );
            await markReminderSent(task.id, null, "emp_24h", env);
          }
        }
        if (totalHours >= 72 && hoursLeft >= 2.75 && hoursLeft <= 3.25) {
          const sent = await wasReminderSent(task.id, null, "boss_3h_long", env);
          if (!sent) {
            await sendMessage(
              task.created_by,
              `\u26A0\uFE0F *\u0414\u043E \u0434\u0435\u0434\u043B\u0430\u0439\u043D\u0430 3 \u0447\u0430\u0441\u0430!*

\u{1F4CB} ${task.title}
\u{1F468}\u200D\u{1F4BC} ${task.emp_name}
\u{1F4C5} ${formatDeadline(task.deadline)}

\u0417\u0430\u0434\u0430\u0447\u0430 \u0435\u0449\u0451 \u043D\u0435 \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u0430!`,
              env
            );
            await markReminderSent(task.id, null, "boss_3h_long", env);
          }
        }
        if (totalHours >= 24 && totalHours < 72 && hoursLeft >= 5.75 && hoursLeft <= 6.25) {
          const sent = await wasReminderSent(task.id, null, "emp_6h", env);
          if (!sent) {
            await sendMessage(
              task.assigned_to,
              `\u23F0 *\u041E\u0441\u0442\u0430\u043B\u043E\u0441\u044C 6 \u0447\u0430\u0441\u043E\u0432!*

\u{1F4CB} ${task.title}
\u{1F4C5} \u0414\u0435\u0434\u043B\u0430\u0439\u043D: ${formatDeadline(task.deadline)}

\u041A\u0430\u043A \u0434\u0435\u043B\u0430 \u0441 \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u0438\u0435\u043C? \u{1F525}`,
              env
            );
            await markReminderSent(task.id, null, "emp_6h", env);
          }
        }
        if (totalHours >= 24 && totalHours < 72 && hoursLeft >= 1.75 && hoursLeft <= 2.25) {
          const sent = await wasReminderSent(task.id, null, "boss_2h_mid", env);
          if (!sent) {
            await sendMessage(
              task.created_by,
              `\u26A0\uFE0F *\u0414\u043E \u0434\u0435\u0434\u043B\u0430\u0439\u043D\u0430 2 \u0447\u0430\u0441\u0430!*

\u{1F4CB} ${task.title}
\u{1F468}\u200D\u{1F4BC} ${task.emp_name}
\u{1F4C5} ${formatDeadline(task.deadline)}

\u0417\u0430\u0434\u0430\u0447\u0430 \u0435\u0449\u0451 \u043D\u0435 \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u0430!`,
              env
            );
            await markReminderSent(task.id, null, "boss_2h_mid", env);
          }
        }
        if (totalHours < 24 && hoursLeft >= 2.75 && hoursLeft <= 3.25) {
          const sent = await wasReminderSent(task.id, null, "emp_3h_short", env);
          if (!sent) {
            await sendMessage(
              task.assigned_to,
              `\u{1F525} *\u041E\u0441\u0442\u0430\u043B\u043E\u0441\u044C 3 \u0447\u0430\u0441\u0430!*

\u{1F4CB} ${task.title}
\u{1F4C5} \u0414\u0435\u0434\u043B\u0430\u0439\u043D: ${formatDeadline(task.deadline)}

\u0414\u0430\u0432\u0430\u0439, \u0444\u0438\u043D\u0438\u0448\u043D\u0430\u044F \u043F\u0440\u044F\u043C\u0430\u044F! \u{1F4AA}`,
              env
            );
            await markReminderSent(task.id, null, "emp_3h_short", env);
          }
        }
        if (totalHours < 24 && hoursLeft >= 0.75 && hoursLeft <= 1.25) {
          const sent = await wasReminderSent(task.id, null, "emp_1h_short", env);
          if (!sent) {
            await sendMessage(
              task.assigned_to,
              `\u{1F6A8} *\u041E\u0441\u0442\u0430\u043B\u0441\u044F 1 \u0447\u0430\u0441!*

\u{1F4CB} ${task.title}
\u{1F4C5} \u0414\u0435\u0434\u043B\u0430\u0439\u043D: ${formatDeadline(task.deadline)}

\u041F\u043E\u0441\u043B\u0435\u0434\u043D\u0438\u0439 \u0440\u044B\u0432\u043E\u043A! \u0422\u044B \u043C\u043E\u0436\u0435\u0448\u044C! \u{1F3C3}`,
              env
            );
            await markReminderSent(task.id, null, "emp_1h_short", env);
          }
        }
        if (totalHours < 24 && hoursLeft >= 0.75 && hoursLeft <= 1.25) {
          const sent = await wasReminderSent(task.id, null, "boss_1h_short", env);
          if (!sent) {
            await sendMessage(
              task.created_by,
              `\u26A0\uFE0F *\u0414\u043E \u0434\u0435\u0434\u043B\u0430\u0439\u043D\u0430 1 \u0447\u0430\u0441!*

\u{1F4CB} ${task.title}
\u{1F468}\u200D\u{1F4BC} ${task.emp_name}
\u{1F4C5} ${formatDeadline(task.deadline)}

\u0417\u0430\u0434\u0430\u0447\u0430 \u0435\u0449\u0451 \u043D\u0435 \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u0430!`,
              env
            );
            await markReminderSent(task.id, null, "boss_1h_short", env);
          }
        }
      }
      if (hoursLeft < 0) {
        const overdueHours = Math.abs(hoursLeft);
        if (overdueHours <= 1) {
          const sent = await wasReminderSent(task.id, null, "emp_overdue_now", env);
          if (!sent) {
            await sendMessage(
              task.assigned_to,
              `\u{1F6A8} *\u0414\u0435\u0434\u043B\u0430\u0439\u043D \u043F\u0440\u043E\u0448\u0451\u043B!*

\u{1F4CB} ${task.title}
\u23F0 \u0411\u044B\u043B: ${formatDeadline(task.deadline)}

\u0421\u0440\u043E\u0447\u043D\u043E \u043E\u0431\u043D\u043E\u0432\u0438\u0442\u0435 \u0441\u0442\u0430\u0442\u0443\u0441 \u0438\u043B\u0438 \u0441\u0432\u044F\u0436\u0438\u0442\u0435\u0441\u044C \u0441 \u0440\u0443\u043A\u043E\u0432\u043E\u0434\u0438\u0442\u0435\u043B\u0435\u043C!`,
              env
            );
            await markReminderSent(task.id, null, "emp_overdue_now", env);
          }
        }
        if (overdueHours >= 1 && overdueHours < 2) {
          const sent = await wasReminderSent(task.id, null, "boss_overdue_1h", env);
          if (!sent) {
            await sendMessage(
              task.created_by,
              `\u{1F6A8} *\u0417\u0430\u0434\u0430\u0447\u0430 \u043F\u0440\u043E\u0441\u0440\u043E\u0447\u0435\u043D\u0430!*

\u{1F4CB} ${task.title}
\u{1F468}\u200D\u{1F4BC} ${task.emp_name}
\u23F0 \u0414\u0435\u0434\u043B\u0430\u0439\u043D \u0431\u044B\u043B: ${formatDeadline(task.deadline)}

\u0421\u043E\u0442\u0440\u0443\u0434\u043D\u0438\u043A \u043D\u0435 \u043E\u0431\u043D\u043E\u0432\u0438\u043B \u0441\u0442\u0430\u0442\u0443\u0441. \u0422\u0440\u0435\u0431\u0443\u0435\u0442\u0441\u044F \u0432\u0430\u0448\u0435 \u0432\u043D\u0438\u043C\u0430\u043D\u0438\u0435!`,
              env
            );
            await markReminderSent(task.id, null, "boss_overdue_1h", env);
          }
        }
        const daysOverdue = Math.floor(overdueHours / 24);
        if (daysOverdue >= 1) {
          const reminderKey = `boss_overdue_day_${daysOverdue}`;
          const sent = await wasReminderSent(task.id, null, reminderKey, env);
          if (!sent) {
            const dayWord = daysOverdue === 1 ? "\u0434\u0435\u043D\u044C" : daysOverdue < 5 ? "\u0434\u043D\u044F" : "\u0434\u043D\u0435\u0439";
            await sendMessage(
              task.created_by,
              `\u{1F534} *\u0417\u0430\u0434\u0430\u0447\u0430 \u043F\u0440\u043E\u0441\u0440\u043E\u0447\u0435\u043D\u0430 \u043D\u0430 ${daysOverdue} ${dayWord}!*

\u{1F4CB} ${task.title}
\u{1F468}\u200D\u{1F4BC} ${task.emp_name}
\u23F0 \u0411\u044B\u043B\u0430: ${formatDeadline(task.deadline)}

_\u0417\u0430\u043A\u0440\u043E\u0439\u0442\u0435 \u0438\u043B\u0438 \u043F\u0435\u0440\u0435\u043D\u0435\u0441\u0438\u0442\u0435 \u0434\u0435\u0434\u043B\u0430\u0439\u043D._`,
              env
            );
            await markReminderSent(task.id, null, reminderKey, env);
          }
        }
      }
    }
  } catch (error) {
    console.error("\u274C Error in checkTaskReminders:", error.message);
  }
}
__name(checkTaskReminders, "checkTaskReminders");
async function checkPendingAIDeadlineClarifications(env) {
  try {
    await createUserStatesTable(env);
    const pendingRows = await env.DB.prepare(
      "SELECT user_id, data FROM user_states WHERE state = ?"
    ).bind("AI_TASK_DEADLINE").all();
    const now = new Date();

    for (const row of pendingRows.results || []) {
      let pending;
      try {
        pending = JSON.parse(row.data || "{}");
      } catch (error) {
        console.error("❌ Invalid AI deadline state:", error.message);
        continue;
      }
      const askedAt = Date.parse(pending.askedAt || "");
      if (!Number.isFinite(askedAt) || !pending.title) continue;

      const elapsedMs = now.getTime() - askedAt;
      if (elapsedMs >= 24 * 60 * 60 * 1000 && !pending.autoAttemptedAt) {
        const user = await getUser(row.user_id, env);
        if (!user) {
          await clearState(row.user_id, env);
          continue;
        }
        const result = await executeAIAction({
          action: "create_task",
          parameters: {
            employee: pending.employee,
            title: pending.title,
            due_date: getNextTashkentTenDeadline(now)
          }
        }, user, env);
        if (result.success) {
          await clearState(row.user_id, env);
        } else {
          pending.autoAttemptedAt = now.toISOString();
          await setState(row.user_id, "AI_TASK_DEADLINE", pending, env);
        }
        const message = result.success
          ? `⏰ Не получил дату за 24 часа, поэтому поставил автоматический дедлайн на 10:00 по Ташкенту.\n\n${result.message}`
          : `⚠️ Не смог создать задачу автоматически: ${result.message} Ответь датой, чтобы завершить создание.`;
        await sendMessage(row.user_id, message, env);
        continue;
      }

      if (elapsedMs >= 30 * 60 * 1000 && !pending.remindedAt) {
        pending.remindedAt = now.toISOString();
        await setState(row.user_id, "AI_TASK_DEADLINE", pending, env);
        await sendMessage(row.user_id, `⏰ Напоминаю: у задачи «${pending.title}» ещё нет дедлайна. Ответь датой, например «завтра» или «2026-11-22». Через 24 часа без ответа я создам задачу со сроком на 10:00 по Ташкенту.`, env);
      }
    }
  } catch (error) {
    console.error("❌ Error checking pending AI deadlines:", error.message);
  }
}
__name(checkPendingAIDeadlineClarifications, "checkPendingAIDeadlineClarifications");

function getNextTashkentTenDeadline(referenceDate) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tashkent", year: "numeric", month: "2-digit",
    day: "2-digit", hour: "2-digit", hourCycle: "h23"
  }).formatToParts(referenceDate || new Date());
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  const date = new Date(Date.UTC(year, month - 1, day + (hour >= 10 ? 1 : 0)));
  const localDate = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
  return `${localDate}T10:00:00+05:00`;
}
__name(getNextTashkentTenDeadline, "getNextTashkentTenDeadline");

async function checkMeetingReminders(env) {
  try {
    const meetings = await env.DB.prepare(`
      SELECT m.id, m.title, m.meeting_datetime, m.location, m.created_by
      FROM meetings m
      WHERE datetime(m.meeting_datetime) >= datetime('now', '-1 hours')
      AND datetime(m.meeting_datetime) <= datetime('now', '+25 hours')
    `).all();
    for (const meeting of meetings.results) {
      const meetingTime = new Date(meeting.meeting_datetime);
      const now = /* @__PURE__ */ new Date();
      const minutesLeft = (meetingTime - now) / 6e4;
      if (minutesLeft >= 1410 && minutesLeft <= 1450) {
        const sent = await wasReminderSent(null, meeting.id, "meeting_24h", env);
        if (!sent) {
          const participants = await getMeetingParticipants(meeting.id, env);
          for (const p of participants) {
            await sendMessage(
              p.user_id,
              `\u{1F4C5} **\u041D\u0430\u043F\u043E\u043C\u0438\u043D\u0430\u043D\u0438\u0435 \u043E \u0432\u0441\u0442\u0440\u0435\u0447\u0435!**

\u{1F4CC} ${meeting.title}
\u23F0 \u0417\u0430\u0432\u0442\u0440\u0430 \u0432 ${formatTime(meeting.meeting_datetime)}
\u{1F4CD} ${meeting.location || "\u041C\u0435\u0441\u0442\u043E \u043D\u0435 \u0443\u043A\u0430\u0437\u0430\u043D\u043E"}`,
              env
            );
          }
          await markReminderSent(null, meeting.id, "meeting_24h", env);
        }
      }
      if (minutesLeft >= 55 && minutesLeft <= 65) {
        const sent = await wasReminderSent(null, meeting.id, "meeting_1h", env);
        if (!sent) {
          const participants = await getMeetingParticipants(meeting.id, env);
          for (const p of participants) {
            await sendMessage(
              p.user_id,
              `\u{1F514} **\u0412\u0441\u0442\u0440\u0435\u0447\u0430 \u0447\u0435\u0440\u0435\u0437 1 \u0447\u0430\u0441!**

\u{1F4CC} ${meeting.title}
\u23F0 ${formatDeadline(meeting.meeting_datetime)}
\u{1F4CD} ${meeting.location || "\u041C\u0435\u0441\u0442\u043E \u043D\u0435 \u0443\u043A\u0430\u0437\u0430\u043D\u043E"}`,
              env
            );
          }
          await markReminderSent(null, meeting.id, "meeting_1h", env);
        }
      }
      if (minutesLeft >= 12 && minutesLeft <= 18) {
        const sent = await wasReminderSent(null, meeting.id, "meeting_15min", env);
        if (!sent) {
          const participants = await getMeetingParticipants(meeting.id, env);
          for (const p of participants) {
            await sendMessage(
              p.user_id,
              `\u26A1\uFE0F **\u0412\u0441\u0442\u0440\u0435\u0447\u0430 \u0447\u0435\u0440\u0435\u0437 15 \u043C\u0438\u043D\u0443\u0442!**

\u{1F4CC} ${meeting.title}
\u{1F4CD} ${meeting.location || "\u041C\u0435\u0441\u0442\u043E \u043D\u0435 \u0443\u043A\u0430\u0437\u0430\u043D\u043E"}

\u041F\u043E\u0440\u0430 \u0441\u043E\u0431\u0438\u0440\u0430\u0442\u044C\u0441\u044F! \u{1F3C3}`,
              env
            );
          }
          await markReminderSent(null, meeting.id, "meeting_15min", env);
        }
      }
    }
  } catch (error) {
    console.error("\u274C Error in checkMeetingReminders:", error.message);
  }
}

__name(checkMeetingReminders, "checkMeetingReminders");
async function getUser(userId, env) {
  try {
    const result = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(userId).first();
    return result;
  } catch (error) {
    console.error("\u274C Error getting user:", error.message);
    return null;
  }
}
__name(getUser, "getUser");
async function addUser(userId, username, firstName, role, orgId, env) {
  try {
    await env.DB.prepare(`
      INSERT OR REPLACE INTO users (id, username, first_name, role, org_id)
      VALUES (?, ?, ?, ?, ?)
    `).bind(userId, username, firstName, role, orgId).run();
    console.log(`\u2705 User ${userId} added/updated as ${role}`);
  } catch (error) {
    console.error("\u274C Error adding user:", error.message);
    throw error;
  }
}
__name(addUser, "addUser");
  // ============================================================
  // 👤 FIND EMPLOYEE FOR AI
  // ============================================================

  async function resolveEmployee(employeeName, orgId, currentUserId, env) {
    try {
      if (!employeeName || !orgId || !currentUserId) {
        return {
          success: false,
          error: "Не указано имя сотрудника, организация или текущий пользователь."
        };
      }

      const result = await env.DB.prepare(`
        SELECT id, username, first_name, role, org_id
        FROM users
        WHERE org_id = ?
          AND LOWER(first_name) = LOWER(?)
          AND id != ?
        LIMIT 10
      `).bind(
        orgId,
        employeeName.trim(),
        currentUserId
      ).all();

      const users = result.results || [];

      if (users.length === 0) {
        console.log(
          `❌ Employee not found: "${employeeName}" in org ${orgId}`
        );

        return {
          success: false,
          error: `Сотрудник "${employeeName}" не найден.`
        };
      }

      if (users.length > 1) {
        console.log(
          `⚠️ Multiple employees found: "${employeeName}" in org ${orgId}`
        );

        return {
          success: false,
          error: `Найдено несколько сотрудников с именем "${employeeName}".`
        };
      }

      const employee = users[0];

      console.log(
        `👤 Employee resolved: ${employee.first_name} (${employee.id})`
      );

      return {
        success: true,
        user: employee
      };

    } catch (error) {
      console.error(
        "❌ Error resolving employee:",
        error.message
      );

      return {
        success: false,
        error: "Ошибка поиска сотрудника."
      };
    }
  }

  __name(resolveEmployee, "resolveEmployee");


// ============================================================
// 🏢 CREATE ORGANIZATION
// ============================================================

async function createOrganization(name, env) {
  try {
    let code;
    let attempts = 0;

    while (attempts < 10) {
      code = Math.floor(1e5 + Math.random() * 9e5).toString();

      const existing = await env.DB.prepare(
        "SELECT id FROM organizations WHERE payment_code = ?"
      ).bind(code).first();

      if (!existing) {
        break;
      }

      attempts++;
    }

    if (attempts >= 10) {
      throw new Error("Failed to generate unique org code");
    }

    console.log(
      `🏢 Creating organization "${name}" with code ${code}`
    );

    const result = await env.DB.prepare(
      "INSERT INTO organizations (name, payment_code) VALUES (?, ?)"
    ).bind(name, code).run();

    const orgId = result.meta.last_row_id;

    console.log(
      `✅ Organization created with ID: ${orgId}`
    );

    return {
      orgId,
      paymentCode: code
    };

  } catch (error) {
    console.error(
      "❌ Error creating organization:",
      error.message
    );

    throw error;
  }
}

__name(createOrganization, "createOrganization");


async function getOrgIdByCode(code, env) {
  try {
    const result = await env.DB.prepare(
      "SELECT id FROM organizations WHERE payment_code = ?"
    ).bind(code).first();
    return result ? result.id : null;
  } catch (error) {
    console.error("\u274C Error getting org by code:", error.message);
    return null;
  }
}
__name(getOrgIdByCode, "getOrgIdByCode");
async function getOrgInfo(orgId, env) {
  try {
    return await env.DB.prepare(
      "SELECT * FROM organizations WHERE id = ?"
    ).bind(orgId).first();
  } catch (error) {
    console.error("\u274C Error getting org info:", error.message);
    return null;
  }
}
__name(getOrgInfo, "getOrgInfo");
async function getOrgEmployees(orgId, env) {
  try {
    const result = await env.DB.prepare(`
      SELECT id, username, first_name FROM users 
      WHERE org_id = ? AND role = 'employee'
    `).bind(orgId).all();
    return result.results;
  } catch (error) {
    console.error("\u274C Error getting org employees:", error.message);
    return [];
  }
}
__name(getOrgEmployees, "getOrgEmployees");
async function getOrgBossId(orgId, env) {
  try {
    const result = await env.DB.prepare(
      "SELECT id FROM users WHERE org_id = ? AND role = ?"
    ).bind(orgId, "boss").first();
    return result ? result.id : null;
  } catch (error) {
    console.error("\u274C Error getting org boss:", error.message);
    return null;
  }
}
__name(getOrgBossId, "getOrgBossId");
async function createTask(title, description, deadline, createdBy, assignedTo, orgId, env) {
  try {
    await env.DB.prepare(`
      INSERT INTO tasks (title, description, deadline, created_by, assigned_to, org_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(title, description, deadline, createdBy, assignedTo, orgId).run();
    console.log(`\u2705 Task created for employee ${assignedTo}`);
  } catch (error) {
    console.error("\u274C Error creating task:", error.message);
    throw error;
  }
}
__name(createTask, "createTask");

// ============================================================
// 🔐 AI POLICY ENGINE
// ============================================================

const ACTION_POLICIES = {

  create_task: {
    boss: {
      scope: "organization"
    },

    employee: {
      scope: "own"
    }
  },

  complete_task: {
    boss: {
      scope: "organization"
    },

    employee: {
      scope: "own"
    }
  },

  get_my_tasks: {
    boss: {
      scope: "own"
    },

    employee: {
      scope: "own"
    }
  },

  get_team_tasks: {
    boss: {
      scope: "organization"
    }
  },

  get_employee_tasks: {

    boss: {

      scope: "organization"

    },

    employee: {

      scope: "own"

    }

  },

  get_overdue_tasks: {
    boss: {
      scope: "organization"
    },

    employee: {
      scope: "own"
    }
  },

  find_task: {
    boss: {
      scope: "organization"
    },

    employee: {
      scope: "own"
    }
  },

  unknown: {}
};


function checkPermission(action, user) {
  try {
    if (!user) {
      return {
        allowed: false,
        message: "❌ Пользователь не авторизован."
      };
    }

    if (!user.org_id) {
      console.log(
        `🚫 User ${user.id} has no organization`
      );

      return {
        allowed: false,
        message: "❌ Пользователь не привязан к организации."
      };
    }

    if (action === "unknown") {
      return {
        allowed: false,
        message: "🤔 Не распознал действие. Скажи, например: «создай задачу себе» или «покажи мои задачи»."
      };
    }

    const actionPolicy = ACTION_POLICIES[action];

    if (!actionPolicy) {
      console.log(
        `🚫 No policy found for action: ${action}`
      );

      return {
        allowed: false,
        message: "❌ Это действие не поддерживается."
      };
    }

    const normalizedRole = String(user.role || "")
      .trim()
      .toLowerCase();
    const rolePolicy = actionPolicy[normalizedRole];

    if (!rolePolicy) {
      console.log(
        `🚫 Permission denied: user=${user.id}, role=${user.role}, action=${action}`
      );

      return {
        allowed: false,
        message: "❌ У тебя нет прав для выполнения этого действия."
      };
    }

    console.log(
      `✅ Permission granted: user=${user.id}, role=${user.role}, org=${user.org_id}, action=${action}, scope=${rolePolicy.scope}`
    );

    return {
      allowed: true,
      scope: rolePolicy.scope
    };

  } catch (error) {
    console.error(
      "❌ POLICY ERROR:",
      error.message
    );

    return {
      allowed: false,
      message: "❌ Ошибка проверки прав."
    };
  }
}
  
__name(checkPermission, "checkPermission");


// ==========================================================
// STATUS LABEL
// ==========================================================

function getTaskStatusLabel(status, deadline) {

  if (
    status !== "completed" &&
    deadline &&
    new Date(deadline) < new Date()
  ) {
    return "🔴 Просрочена";
  }

  if (status === "pending") {
    return "🟡 Назначена";
  }

  if (status === "in_progress") {
    return "🔵 В процессе";
  }

  if (status === "completed") {
    return "✅ Выполнена";
  }

  return `⚪ ${status || "Не указан"}`;
}

__name(getTaskStatusLabel, "getTaskStatusLabel");

// ============================================================
// 🤖 AI ACTION EXECUTOR
// ============================================================

async function executeAIAction(route, user, env) {
  try {
    const action = route?.action;
    const parameters = route?.parameters || {};

    console.log(
      "⚙️ AI ACTION:",
      JSON.stringify(route)
    );

    // ==========================================================
    // 🔐 POLICY CHECK
    // ==========================================================

    const permission = checkPermission(
      action,
      user
    );

    if (!permission.allowed) {
      return {
        success: false,
        message: permission.message
      };
    }

    console.log(
      `🔐 POLICY ALLOWED: action=${action}, scope=${permission.scope}`
    );


    // ==========================================================
    // CREATE TASK
    // ==========================================================

    if (action === "create_task") {
      const requestedEmployee = String(parameters.employee || "").trim();
      const title = String(parameters.title || "").trim();
      const deadlineValue =
        parameters.due_date ??
        parameters.duedate ??
        null;
      const deadline =
        deadlineValue === null ? "" : String(deadlineValue).trim();

      if (!title) {
        return {
          success: false,
          message: "❌ Не указана задача."
        };
      }

      const datePattern = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?)?$/;
      const dateParts = /^(\d{4})-(\d{2})-(\d{2})/.exec(deadline);
      const parsedDate = Date.parse(deadline.replace(" ", "T"));
      const validCalendarDate = dateParts
        ? (() => {
            const year = Number(dateParts[1]);
            const month = Number(dateParts[2]);
            const day = Number(dateParts[3]);
            const check = new Date(Date.UTC(year, month - 1, day));
            return check.getUTCFullYear() === year &&
              check.getUTCMonth() === month - 1 &&
              check.getUTCDate() === day;
          })()
        : false;

      if (!deadline || !datePattern.test(deadline) ||
          !validCalendarDate || !Number.isFinite(parsedDate)) {
        if (user.role === "boss" && !requestedEmployee) {
          return {
            success: false,
            message: "❓ Укажи, кому создать задачу, и добавь дату дедлайна."
          };
        }
        await setState(user.id, "AI_TASK_DEADLINE", {
          title,
          employee: requestedEmployee || "self",
          askedAt: new Date().toISOString(),
          remindedAt: null
        }, env);
        return {
          success: true,
          message: `📅 Для задачи «${title}» укажи дедлайн датой (например, «завтра» или «2026-11-22»). Если ответа не будет, напомню через 30 минут; через 24 часа задача создастся автоматически со сроком на 10:00 по Ташкенту.`
        };
      }

      const normalizeName = (value) =>
        String(value || "")
          .trim()
          .toLocaleLowerCase("ru")
          .replace(/[.,!?]/g, "")
          .replace(/\s+/g, " ");

      const selfAliases = new Set([
        "self",
        "me",
        "myself",
        "я",
        "мне",
        "себе",
        "для себя",
        "сам",
        "сама",
        "самому",
        "самой"
      ]);

      const requestedName = normalizeName(requestedEmployee);
      const ownNames = [
        user.first_name,
        user.username
      ].map(normalizeName).filter(Boolean);
      const isSelf =
        !requestedName ||
        selfAliases.has(requestedName) ||
        ownNames.includes(requestedName);

      if (user.role === "employee" && !isSelf) {
        return {
          success: false,
          message: "❌ Сотрудник может создавать задачи только для себя. Назначать задачи другим может руководитель."
        };
      }

      if (user.role === "boss" && !requestedName) {
        return {
          success: false,
          message: "❓ Уточни, кому создать задачу: тебе или сотруднику?"
        };
      }

      let assignee = user;

      if (!isSelf) {
        const employeeResult = await resolveEmployee(
          requestedEmployee,
          user.org_id,
          user.id,
          env
        );

        if (!employeeResult.success) {
          return {
            success: false,
            message: `❌ ${employeeResult.error}`
          };
        }

        assignee = employeeResult.user;
      }

      await createTask(
        title,
        "",
        deadline,
        user.id,
        assignee.id,
        user.org_id,
        env
      );

      console.log(
        `✅ AI created task "${title}" for user ${assignee.id} by user ${user.id}`
      );

      return {
        success: true,
        message: isSelf
          ? `✅ Задача «${title}» создана для тебя${deadline ? ` до ${deadline}.` : "."}`
          : `✅ Задача «${title}» назначена сотруднику ${assignee.first_name}${deadline ? ` до ${deadline}.` : "."}`
      };
    }

    // ==========================================================
    // GET MY TASKS
    // ==========================================================

    if (action === "get_my_tasks") {

      console.log(
        `📋 Getting tasks for user ${user.id}`
      );

      const tasks = await getEmployeeTasks(
        user.id,
        user.org_id,
        "active",
        env
      );

      if (!tasks || tasks.length === 0) {
        return {
          success: true,
          message: "📋 У тебя сейчас нет назначенных задач."
        };
      }

      let message = "📋 *Твои задачи:*\n\n";

      tasks.forEach((task, index) => {

        message +=
          `${index + 1}. *${task.title}*\n` +
          `   📅 Дедлайн: ${task.deadline || "не указан"}\n` +
          `   📌 Статус: ${getTaskStatusLabel(task.status, task.deadline)}\n\n`;
      });

      return {
        success: true,
        message
      };
    }


    // ==========================================================
    // GET TEAM TASKS
    // ==========================================================

    if (action === "get_team_tasks") {

      console.log(
        `👥 Getting team tasks for organization ${user.org_id}`
      );

      const result = await buildTeamTasksPage(
        user,
        env,
        "active",
        1
      );

      return {
        success: true,
        message: result.text,
        keyboard: result.keyboard
      };
    }

    // ==========================================================
    // GET EMPLOYEE TASKS
    // ==========================================================

    if (action === "get_employee_tasks") {

      const employeeName = parameters.employee;
      const requestedStatus = parameters.status || "active";

      console.log(
        `👤 Getting employee tasks: user=${user.id}, org=${user.org_id}, employee="${employeeName}", status="${requestedStatus}", scope=${permission.scope}`
      );

      // ==========================================================
      // EMPLOYEE
      // ==========================================================

      if (permission.scope === "own") {

        const tasks = await getEmployeeTasks(
          user.id,
          user.org_id,
          requestedStatus,
          env
        );

        if (!tasks || tasks.length === 0) {

          return {
            success: true,
            message: "📋 У тебя нет задач по этому фильтру."
          };
        }

        let message =
          `📋 *Твои задачи:*\n\n`;

        tasks.forEach((task, index) => {

          message +=
            `${index + 1}. *${task.title}*\n` +
            `   🆔 ID: ${task.id}\n` +
            `   📅 Дедлайн: ${task.deadline || "не указан"}\n` +
            `   📌 Статус: ${getTaskStatusLabel(task.status, task.deadline)}\n\n`;
        });

        return {
          success: true,
          message
        };
      }


      // ==========================================================
      // BOSS
      // ==========================================================

      if (!employeeName) {

        return {
          success: false,
          message: "❌ Укажи сотрудника."
        };
      }

      const employeeResult = await resolveEmployee(
        employeeName,
        user.org_id,
        user.id,
        env
      );

      if (!employeeResult.success) {

        return {
          success: false,
          message:
            `❌ ${employeeResult.error || "Сотрудник не найден."}`
        };
      }

      const employee = employeeResult.user;

      const tasks = await getEmployeeTasks(
        employee.id,
        user.org_id,
        requestedStatus,
        env
      );

      if (!tasks || tasks.length === 0) {

        let statusText = "активных";

        if (requestedStatus === "completed") {
          statusText = "выполненных";
        }

        if (requestedStatus === "overdue") {
          statusText = "просроченных";
        }

        if (requestedStatus === "all") {
          statusText = "";
        }

        return {
          success: true,
          message:
            `📋 У сотрудника *${employee.first_name}* нет ${statusText} задач.`
        };
      }


      let title = `📋 *Задачи ${employee.first_name}:*`;

      if (requestedStatus === "active") {
        title = `📋 *Активные задачи ${employee.first_name}:*`;
      }

      if (requestedStatus === "completed") {
        title = `✅ *Выполненные задачи ${employee.first_name}:*`;
      }

      if (requestedStatus === "overdue") {
        title = `🔴 *Просроченные задачи ${employee.first_name}:*`;
      }

      if (requestedStatus === "all") {
        title = `📋 *Все задачи ${employee.first_name}:*`;
      }

      let message =
        `${title}\n\n`;

      tasks.forEach((task, index) => {

        message +=
          `${index + 1}. *${task.title}*\n` +
          `   🆔 ID: ${task.id}\n` +
          `   📅 Дедлайн: ${task.deadline || "не указан"}\n` +
          `   📌 Статус: ${getTaskStatusLabel(task.status, task.deadline)}\n\n`;
      });

      return {
        success: true,
        message
      };
    }


    // ==========================================================
    // GET OVERDUE TASKS
    // ==========================================================

    if (action === "get_overdue_tasks") {

      console.log(
        `⏰ Getting overdue tasks: user=${user.id}, org=${user.org_id}, scope=${permission.scope}`
      );

      const tasks = await getOverdueTasks(
        user,
        permission.scope,
        env
      );

      if (!tasks || tasks.length === 0) {

        if (permission.scope === "own") {
          return {
            success: true,
            message: "✅ У тебя нет просроченных задач."
          };
        }

        return {
          success: true,
          message: "✅ В организации нет просроченных задач."
        };
      }

      // EMPLOYEE
      if (permission.scope === "own") {

        let message = "⏰ *Твои просроченные задачи:*\n\n";

        tasks.forEach((task, index) => {

          message +=
            `${index + 1}. *${task.title}*\n` +
            `   📅 Дедлайн: ${task.deadline}\n` +
            `   📌 Статус: ${task.status || "не указан"}\n\n`;
        });

        return {
          success: true,
          message
        };
      }

      // BOSS
      let message = "⏰ *Просроченные задачи команды:*\n\n";

      tasks.forEach((task, index) => {

        message +=
          `${index + 1}. *${task.title}*\n` +
          `   👤 Сотрудник: ${task.employee_name || "не указан"}\n` +
          `   📅 Дедлайн: ${task.deadline}\n` +
          `   📌 Статус: ${task.status || "не указан"}\n\n`;
      });

      return {
        success: true,
        message
      };
    }


    // ==========================================================
    // FIND TASK
    // ==========================================================

    if (action === "find_task") {

      const query = parameters.query;

      console.log(
        `🔎 Finding tasks: user=${user.id}, org=${user.org_id}, scope=${permission.scope}, query="${query}"`
      );

      if (!query || !query.trim()) {
        return {
          success: false,
          message: "❌ Укажи, какую задачу нужно найти."
        };
      }

      const tasks = await findTasks(
        user,
        permission.scope,
        query,
        env
      );

      if (!tasks || tasks.length === 0) {
        return {
          success: true,
          message: `🔎 Задач по запросу «${query}» не найдено.`
        };
      }


      // ========================================================
      // 👤 EMPLOYEE
      // ========================================================

      if (permission.scope === "own") {

        let message =
          `🔎 *Найденные задачи по запросу «${query}»:*\n\n`;

        tasks.forEach((task, index) => {

          message +=
            `${index + 1}. *${task.title}*\n` +
            `   🆔 ID: ${task.id}\n` +
            `   📅 Дедлайн: ${task.deadline || "не указан"}\n` +
            `   📌 Статус: ${getTaskStatusLabel(task.status, task.deadline)}\n\n`;
        });

        return {
          success: true,
          message
        };
      }


      // ========================================================
      // 🏢 BOSS
      // ========================================================

      let message =
        `🔎 *Найденные задачи по запросу «${query}»:*\n\n`;

      tasks.forEach((task, index) => {

        message +=
          `${index + 1}. *${task.title}*\n` +
          `   🆔 ID: ${task.id}\n` +
          `   👤 Сотрудник: ${task.employee_name || "не указан"}\n` +
          `   📅 Дедлайн: ${task.deadline || "не указан"}\n` +
          `   📌 Статус: ${task.status || "не указан"}\n\n`;
      });

      return {
        success: true,
        message
      };
    }  


    // ==========================================================
    // COMPLETE TASK
    // ==========================================================

    if (action === "complete_task") {

      const query = parameters.query;

      console.log(
        `✅ Complete task request: user=${user.id}, org=${user.org_id}, scope=${permission.scope}, query="${query}"`
      );

      if (!query || !query.trim()) {
        return {
          success: false,
          message: "❌ Укажи, какую задачу нужно закрыть."
        };
      }


      // ==========================================================
      // Сначала ищем задачу в разрешённом scope
      // ==========================================================

      const tasks = await findTasks(
        user,
        permission.scope,
        query,
        env
      );


      if (!tasks || tasks.length === 0) {
        return {
          success: false,
          message: `❌ Задача «${query}» не найдена.`
        };
      }


      // ==========================================================
      // Если найдено несколько задач — НЕ выбираем случайную
      // ==========================================================

      if (tasks.length > 1) {

        let message =
          `🔎 Найдено несколько задач по запросу «${query}».\n\n`;

        tasks.slice(0, 5).forEach((task, index) => {

          message +=
            `${index + 1}. *${task.title}* ` +
            `(ID: ${task.id})\n` +
            `   📅 ${task.deadline || "без дедлайна"}\n` +
            `   📌 ${task.status || "не указан"}\n\n`;
        });

        message +=
          "Уточни название задачи или укажи её ID.";

        return {
          success: false,
          message
        };
      }


      // ==========================================================
      // Получили ровно одну задачу
      // ==========================================================

      const taskCandidate = tasks[0];

      const task = await getTaskForUser(
        taskCandidate.id,
        user,
        permission.scope,
        env
      );


      // ==========================================================
      // RESOURCE AUTHORIZATION
      // ==========================================================

      if (!task) {

        console.log(
          `🚫 Resource access denied: user=${user.id}, task=${taskCandidate.id}, org=${user.org_id}`
        );

        return {
          success: false,
          message: "❌ У тебя нет прав изменить эту задачу."
        };
      }


      // ==========================================================
      // Уже завершена
      // ==========================================================

      if (task.status === "completed") {
        return {
          success: true,
          message:
            `ℹ️ Задача «${task.title}» уже завершена.`
        };
      }


      // ==========================================================
      // UPDATE
      // ==========================================================

      await updateTaskStatus(
        task.id,
        "completed",
        env
      );


      console.log(
        `✅ Task ${task.id} completed by user ${user.id}`
      );


      return {
        success: true,
        message:
          `✅ Задача «${task.title}» отмечена как выполненная.`
      };
    }


    // ==========================================================
    // UNKNOWN / НЕПОДДЕРЖИВАЕМОЕ ДЕЙСТВИЕ
    // ==========================================================

    return {
      success: false,
      message: "🤔 Я пока не умею выполнять такую команду."
    };

  } catch (error) {
    console.error(
      "❌ AI ACTION ERROR:",
      error.message
    );

    console.error(
      "❌ AI ACTION STACK:",
      error.stack
    );

    return {
      success: false,
      message: "❌ Не удалось выполнить действие."
    };
  }
}

__name(executeAIAction, "executeAIAction");

async function getTask(taskId, env) {
  try {
    return await env.DB.prepare(`
      SELECT t.*, emp.first_name as emp_name, boss.first_name as boss_name
      FROM tasks t
      LEFT JOIN users emp ON t.assigned_to = emp.id
      LEFT JOIN users boss ON t.created_by = boss.id
      WHERE t.id = ?
    `).bind(taskId).first();
  } catch (error) {
    console.error("\u274C Error getting task:", error.message);
    return null;
  }
}
__name(getTask, "getTask");

// ============================================================
// 🔐 RESOURCE AUTHORIZATION — GET TASK FOR USER
// ============================================================

async function getTaskForUser(taskId, user, scope, env) {
  try {

    // ==========================================================
    // 👤 EMPLOYEE — только назначенная ему задача
    // ==========================================================

    if (scope === "own") {

      const task = await env.DB.prepare(`
        SELECT
          t.id,
          t.title,
          t.description,
          t.deadline,
          t.status,
          t.created_by,
          t.assigned_to,
          t.org_id,
          u.first_name AS employee_name
        FROM tasks t
        LEFT JOIN users u
          ON t.assigned_to = u.id
        WHERE t.id = ?
          AND t.org_id = ?
          AND t.assigned_to = ?
        LIMIT 1
      `).bind(
        taskId,
        user.org_id,
        user.id
      ).first();

      return task || null;
    }


    // ==========================================================
    // 🏢 BOSS — любая задача своей организации
    // ==========================================================

    if (scope === "organization") {

      const task = await env.DB.prepare(`
        SELECT
          t.id,
          t.title,
          t.description,
          t.deadline,
          t.status,
          t.created_by,
          t.assigned_to,
          t.org_id,
          u.first_name AS employee_name
        FROM tasks t
        LEFT JOIN users u
          ON t.assigned_to = u.id
        WHERE t.id = ?
          AND t.org_id = ?
        LIMIT 1
      `).bind(
        taskId,
        user.org_id
      ).first();

      return task || null;
    }


    console.log(
      `🚫 Unknown resource scope: ${scope}`
    );

    return null;

  } catch (error) {

    console.error(
      "❌ Error getting authorized task:",
      error.message
    );

    return null;
  }
}

__name(getTaskForUser, "getTaskForUser");


async function getFilteredTasks(orgId, statusFilter, employeeId, env) {
  try {
    let query = `
      SELECT t.id, t.title, t.status, t.deadline, u.first_name as emp_name, t.assigned_to
      FROM tasks t
      JOIN users u ON t.assigned_to = u.id
      WHERE t.org_id = ?
    `;
    const params = [orgId];
    if (statusFilter) {
      if (Array.isArray(statusFilter)) {
        const placeholders = statusFilter.map(() => "?").join(", ");
        query += ` AND t.status IN (${placeholders})`;
        params.push(...statusFilter);
      } else {
        query += " AND t.status = ?";
        params.push(statusFilter);
      }
    }
    if (employeeId) {
      query += " AND t.assigned_to = ?";
      params.push(employeeId);
    }
    query += " ORDER BY t.created_at DESC";
    const result = await env.DB.prepare(query).bind(...params).all();
    return result.results;
  } catch (error) {
    console.error("\u274C Error getting filtered tasks:", error.message);
    return [];
  }
}


// ============================================================
// 👥 GET TEAM TASKS
// ============================================================

async function getTeamTasks(orgId, env, status = "active") {
  try {

    let statusCondition = "";

    if (status === "active") {
      statusCondition = `
        AND t.status IN ('pending', 'in_progress')
      `;
    }

    if (status === "completed") {
      statusCondition = `
        AND t.status = 'completed'
      `;
    }

    if (status === "all") {
      statusCondition = "";
    }

    const result = await env.DB.prepare(`
      SELECT
        t.id,
        t.title,
        t.description,
        t.deadline,
        t.status,
        t.assigned_to,
        u.first_name AS employee_name
      FROM tasks t
      LEFT JOIN users u
        ON t.assigned_to = u.id
      WHERE t.org_id = ?
        ${statusCondition}
      ORDER BY
        CASE
          WHEN t.status = 'completed' THEN 1
          WHEN t.status = 'in_progress' THEN 0
          ELSE 0
        END,
        CASE
          WHEN t.deadline IS NULL THEN 1
          ELSE 0
        END,
        t.deadline ASC
    `).bind(orgId).all();

    return result.results || [];

  } catch (error) {

    console.error(
      "❌ Error getting team tasks:",
      error.message
    );

    return [];
  }
}

__name(getTeamTasks, "getTeamTasks");



// ============================================================
// 👤 GET EMPLOYEE TASKS
// ============================================================

async function getEmployeeTasks(employeeId, orgId, status = "active", env) {
  try {

    let statusCondition = "";

    // ==========================================================
    // ACTIVE
    // pending + in_progress
    // ==========================================================

    if (status === "active") {
      statusCondition = `
        AND t.status IN ('pending', 'in_progress')
      `;
    }

    // ==========================================================
    // COMPLETED
    // ==========================================================

    if (status === "completed") {
      statusCondition = `
        AND t.status = 'completed'
      `;
    }

    // ==========================================================
    // OVERDUE
    // ==========================================================

    if (status === "overdue") {
      statusCondition = `
        AND t.deadline IS NOT NULL
        AND t.deadline < datetime('now')
        AND t.status != 'completed'
      `;
    }

    // ==========================================================
    // ALL
    // ==========================================================

    if (status === "all") {
      statusCondition = "";
    }

    const result = await env.DB.prepare(`
      SELECT
        t.id,
        t.title,
        t.description,
        t.deadline,
        t.status,
        t.assigned_to,
        u.first_name AS employee_name
      FROM tasks t
      LEFT JOIN users u
        ON t.assigned_to = u.id
      WHERE t.org_id = ?
        AND t.assigned_to = ?
        ${statusCondition}
      ORDER BY
        CASE
          WHEN t.status = 'completed' THEN 1
          WHEN t.status = 'in_progress' THEN 0
          ELSE 0
        END,
        CASE
          WHEN t.deadline IS NULL THEN 1
          ELSE 0
        END,
        t.deadline ASC
    `).bind(
      orgId,
      employeeId
    ).all();

    return result.results || [];

  } catch (error) {

    console.error(
      "❌ Error getting employee tasks:",
      error.message
    );

    return [];
  }
}

__name(getEmployeeTasks, "getEmployeeTasks");


// ============================================================
// 📋 GET OVERDUE TASKS
// ============================================================

async function getOverdueTasks(user, scope, env) {
  try {

    // EMPLOYEE — только свои задачи
    if (scope === "own") {

      const result = await env.DB.prepare(`
        SELECT
          id,
          title,
          description,
          deadline,
          status
        FROM tasks
        WHERE assigned_to = ?
          AND org_id = ?
          AND deadline IS NOT NULL
          AND deadline < datetime('now')
          AND status != 'completed'
        ORDER BY deadline ASC
      `).bind(
        user.id,
        user.org_id
      ).all();

      return result.results || [];
    }

    // BOSS — задачи всей организации
    if (scope === "organization") {

      const result = await env.DB.prepare(`
        SELECT
          t.id,
          t.title,
          t.description,
          t.deadline,
          t.status,
          t.assigned_to,
          u.first_name AS employee_name
        FROM tasks t
        LEFT JOIN users u
          ON t.assigned_to = u.id
        WHERE t.org_id = ?
          AND t.deadline IS NOT NULL
          AND t.deadline < datetime('now')
          AND t.status != 'completed'
        ORDER BY t.deadline ASC
      `).bind(
        user.org_id
      ).all();

      return result.results || [];
    }

    console.log(
      `🚫 Unknown overdue task scope: ${scope}`
    );

    return [];

  } catch (error) {

    console.error(
      "❌ Error getting overdue tasks:",
      error.message
    );

    return [];
  }
}

__name(getOverdueTasks, "getOverdueTasks");

// ============================================================
// 🔎 FIND TASKS
// ============================================================

async function findTasks(user, scope, query, env) {
  try {

    if (!query || !query.trim()) {
      return [];
    }

    const search = `%${query.trim()}%`;
    const exactId = query.trim();

    // ==========================================================
    // 👤 EMPLOYEE — только свои задачи
    // ==========================================================

    if (scope === "own") {

      const result = await env.DB.prepare(`
        SELECT
          t.id,
          t.title,
          t.description,
          t.deadline,
          t.status
        FROM tasks t
        WHERE t.assigned_to = ?
          AND (
            LOWER(t.title) LIKE LOWER(?)
            OR LOWER(COALESCE(t.description, '')) LIKE LOWER(?)
            OR CAST(t.id AS TEXT) = ?
          )
        ORDER BY
          CASE
            WHEN CAST(t.id AS TEXT) = ? THEN 0
            ELSE 1
          END,
          t.created_at DESC
      `).bind(
        user.id,
        search,
        search,
        exactId,
        exactId
      ).all();

      return result.results || [];
    }


    // ==========================================================
    // 🏢 BOSS — вся организация
    // ==========================================================

    if (scope === "organization") {

      const result = await env.DB.prepare(`
        SELECT
          t.id,
          t.title,
          t.description,
          t.deadline,
          t.status,
          t.assigned_to,
          u.first_name AS employee_name
        FROM tasks t
        LEFT JOIN users u
          ON t.assigned_to = u.id
        WHERE t.org_id = ?
          AND (
            LOWER(t.title) LIKE LOWER(?)
            OR LOWER(COALESCE(t.description, '')) LIKE LOWER(?)
            OR LOWER(COALESCE(u.first_name, '')) LIKE LOWER(?)
            OR CAST(t.id AS TEXT) = ?
          )
        ORDER BY
          CASE
            WHEN CAST(t.id AS TEXT) = ? THEN 0
            ELSE 1
          END,
          t.created_at DESC
      `).bind(
        user.org_id,
        search,
        search,
        search,
        exactId,
        exactId
      ).all();

      return result.results || [];
    }


    console.log(
      `🚫 Unknown task search scope: ${scope}`
    );

    return [];

  } catch (error) {

    console.error(
      "❌ Error finding tasks:",
      error.message
    );

    return [];
  }
}

__name(findTasks, "findTasks");

__name(getFilteredTasks, "getFilteredTasks");
async function updateTaskStatus(taskId, status, env) {
  try {
    await env.DB.prepare(
      "UPDATE tasks SET status = ? WHERE id = ?"
    ).bind(status, taskId).run();
    console.log(`\u2705 Task ${taskId} status updated to ${status}`);
  } catch (error) {
    console.error("\u274C Error updating task status:", error.message);
    throw error;
  }
}
__name(updateTaskStatus, "updateTaskStatus");
async function deleteTaskFromDB(taskId, env) {
  try {
    await env.DB.prepare("DELETE FROM reminders_sent WHERE task_id = ?").bind(taskId).run();
    await env.DB.prepare("DELETE FROM comments WHERE task_id = ?").bind(taskId).run();
    await env.DB.prepare("DELETE FROM tasks WHERE id = ?").bind(taskId).run();
    console.log(`\u2705 Task ${taskId} deleted`);
  } catch (error) {
    console.error("\u274C Error deleting task:", error.message);
    throw error;
  }
}
__name(deleteTaskFromDB, "deleteTaskFromDB");
async function addComment(taskId, userId, commentText, env) {
  try {
    await env.DB.prepare(
      "INSERT INTO comments (task_id, user_id, comment_text) VALUES (?, ?, ?)"
    ).bind(taskId, userId, commentText).run();
    console.log(`\u2705 Comment added to task ${taskId}`);
  } catch (error) {
    console.error("\u274C Error adding comment:", error.message);
    throw error;
  }
}
__name(addComment, "addComment");
async function getTaskComments(taskId, env) {
  try {
    const result = await env.DB.prepare(`
      SELECT c.comment_text, c.created_at, u.first_name, u.role
      FROM comments c
      JOIN users u ON c.user_id = u.id
      WHERE c.task_id = ?
      ORDER BY c.created_at ASC
    `).bind(taskId).all();
    return result.results;
  } catch (error) {
    console.error("\u274C Error getting task comments:", error.message);
    return [];
  }
}
__name(getTaskComments, "getTaskComments");
async function createJoinRequest(userId, username, firstName, phone, orgId, env) {
  try {
    await env.DB.prepare(`
      INSERT INTO join_requests (user_id, username, first_name, phone, org_id, status)
      VALUES (?, ?, ?, ?, ?, 'pending')
    `).bind(userId, username, firstName, phone, orgId).run();
    console.log(`\u2705 Join request created for user ${userId} to org ${orgId}`);
  } catch (error) {
    console.error("\u274C Error creating join request:", error.message);
    throw error;
  }
}
__name(createJoinRequest, "createJoinRequest");
async function getPendingRequests(orgId, env) {
  try {
    const result = await env.DB.prepare(`
      SELECT id, user_id, username, first_name, phone, created_at
      FROM join_requests
      WHERE org_id = ? AND status = 'pending'
      ORDER BY created_at DESC
    `).bind(orgId).all();
    return result.results;
  } catch (error) {
    console.error("\u274C Error getting pending requests:", error.message);
    return [];
  }
}
__name(getPendingRequests, "getPendingRequests");
async function approveJoinRequest(requestId, env) {
  try {
    const request = await env.DB.prepare(
      "SELECT user_id, username, first_name, org_id FROM join_requests WHERE id = ?"
    ).bind(requestId).first();
    if (!request)
      return null;
    await addUser(request.user_id, request.username, request.first_name, "employee", request.org_id, env);
    await env.DB.prepare(
      "UPDATE join_requests SET status = ? WHERE id = ?"
    ).bind("approved", requestId).run();
    console.log(`\u2705 Join request ${requestId} approved`);
    return { userId: request.user_id, orgId: request.org_id };
  } catch (error) {
    console.error("\u274C Error approving join request:", error.message);
    return null;
  }
}
__name(approveJoinRequest, "approveJoinRequest");
async function rejectJoinRequest(requestId, env) {
  try {
    const request = await env.DB.prepare(
      "SELECT user_id FROM join_requests WHERE id = ?"
    ).bind(requestId).first();
    await env.DB.prepare(
      "UPDATE join_requests SET status = ? WHERE id = ?"
    ).bind("rejected", requestId).run();
    console.log(`\u2705 Join request ${requestId} rejected`);
    return request ? request.user_id : null;
  } catch (error) {
    console.error("\u274C Error rejecting join request:", error.message);
    return null;
  }
}
__name(rejectJoinRequest, "rejectJoinRequest");
async function createMeeting(title, description, datetime, location, createdBy, orgId, participants, env) {
  try {
    const result = await env.DB.prepare(`
      INSERT INTO meetings (title, description, meeting_datetime, location, created_by, org_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(title, description, datetime, location, createdBy, orgId).run();
    const meetingId = result.meta.last_row_id;
    for (const userId of participants) {
      await env.DB.prepare(
        "INSERT INTO meeting_participants (meeting_id, user_id) VALUES (?, ?)"
      ).bind(meetingId, userId).run();
    }
    console.log(`\u2705 Meeting created with ${participants.length} participants`);
  } catch (error) {
    console.error("\u274C Error creating meeting:", error.message);
    throw error;
  }
}
__name(createMeeting, "createMeeting");
async function getWeekTasks(orgId, startDate, endDate, env) {
  try {
    const result = await env.DB.prepare(`
      SELECT t.id, t.title, t.status, t.deadline, u.first_name as emp_name
      FROM tasks t
      JOIN users u ON t.assigned_to = u.id
      WHERE t.org_id = ? 
      AND t.deadline IS NOT NULL 
      AND t.deadline != ''
      AND date(t.deadline) BETWEEN date(?) AND date(?)
      ORDER BY t.deadline ASC
    `).bind(orgId, startDate.toISOString().split("T")[0], endDate.toISOString().split("T")[0]).all();
    return result.results;
  } catch (error) {
    console.error("\u274C Error getting week tasks:", error.message);
    return [];
  }
}
__name(getWeekTasks, "getWeekTasks");
async function getWeekMeetings(orgId, startDate, endDate, env) {
  try {
    const result = await env.DB.prepare(`
      SELECT m.id, m.title, m.meeting_datetime, m.location
      FROM meetings m
      WHERE m.org_id = ? 
      AND date(m.meeting_datetime) BETWEEN date(?) AND date(?)
      ORDER BY m.meeting_datetime ASC
    `).bind(orgId, startDate.toISOString().split("T")[0], endDate.toISOString().split("T")[0]).all();
    return result.results;
  } catch (error) {
    console.error("\u274C Error getting week meetings:", error.message);
    return [];
  }
}
__name(getWeekMeetings, "getWeekMeetings");

async function getEmployeeMeetings(userId, env) {
  try {
    const result = await env.DB.prepare(`
      SELECT m.id, m.title, m.meeting_datetime, m.location
      FROM meetings m
      JOIN meeting_participants mp ON m.id = mp.meeting_id
      WHERE mp.user_id = ?
      AND datetime(m.meeting_datetime) >= datetime('now')
      ORDER BY m.meeting_datetime ASC
    `).bind(userId).all();
    return result.results;
  } catch (error) {
    console.error("\u274C Error getting employee meetings:", error.message);
    return [];
  }
}
__name(getEmployeeMeetings, "getEmployeeMeetings");
async function getMeetingParticipants(meetingId, env) {
  try {
    const result = await env.DB.prepare(`
      SELECT mp.user_id, u.first_name
      FROM meeting_participants mp
      JOIN users u ON mp.user_id = u.id
      WHERE mp.meeting_id = ?
    `).bind(meetingId).all();
    return result.results;
  } catch (error) {
    console.error("\u274C Error getting meeting participants:", error.message);
    return [];
  }
}
__name(getMeetingParticipants, "getMeetingParticipants");
async function wasReminderSent(taskId, meetingId, reminderType, env) {
  try {
    let query = "SELECT id FROM reminders_sent WHERE reminder_type = ?";
    const params = [reminderType];
    if (taskId) {
      query += " AND task_id = ?";
      params.push(taskId);
    } else if (meetingId) {
      query += " AND meeting_id = ?";
      params.push(meetingId);
    }
    const result = await env.DB.prepare(query).bind(...params).first();
    return result !== null;
  } catch (error) {
    console.error("\u274C Error checking reminder:", error.message);
    return false;
  }
}
__name(wasReminderSent, "wasReminderSent");
async function markReminderSent(taskId, meetingId, reminderType, env) {
  try {
    await env.DB.prepare(
      "INSERT INTO reminders_sent (task_id, meeting_id, reminder_type) VALUES (?, ?, ?)"
    ).bind(taskId, meetingId, reminderType).run();
  } catch (error) {
    console.error("\u274C Error marking reminder sent:", error.message);
  }
}
__name(markReminderSent, "markReminderSent");
async function getUserState(userId, env) {
  try {
    await createUserStatesTable(env);
    const result = await env.DB.prepare(
      "SELECT * FROM user_states WHERE user_id = ?"
    ).bind(userId).first();
    console.log(`\u{1F4CA} getUserState(${userId}):`, result ? result.state : "null");
    return result;
  } catch (error) {
    console.error("\u274C Error getting user state:", error.message);
    return null;
  }
}
__name(getUserState, "getUserState");
async function setState(userId, state, data, env) {
  try {
    await createUserStatesTable(env);
    const dataJson = data ? JSON.stringify(data) : null;
    await env.DB.prepare(`
      INSERT OR REPLACE INTO user_states (user_id, state, data, updated_at)
      VALUES (?, ?, ?, datetime('now'))
    `).bind(userId, state, dataJson).run();
    console.log(`\u2705 setState(${userId}): "${state}", data: ${dataJson}`);
  } catch (error) {
    console.error("\u274C Error setting state:", error.message);
    console.error("\u274C Stack:", error.stack);
    throw error;
  }
}
__name(setState, "setState");
async function clearState(userId, env) {
  try {
    await env.DB.prepare(
      "DELETE FROM user_states WHERE user_id = ?"
    ).bind(userId).run();
    console.log(`\u2705 State cleared for user ${userId}`);
  } catch (error) {
    console.error("\u274C Error clearing state:", error.message);
  }
}
__name(clearState, "clearState");
async function createUserStatesTable(env) {
  try {
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS user_states (
        user_id INTEGER PRIMARY KEY,
        state TEXT NOT NULL,
        data TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
  } catch (error) {
    console.error("\u274C Error creating user_states table:", error.message);
  }
}
__name(createUserStatesTable, "createUserStatesTable");
function getBossKeyboard() {
  return {
    keyboard: [
      ["\u2795 \u0421\u043E\u0437\u0434\u0430\u0442\u044C \u0437\u0430\u0434\u0430\u0447\u0443", "\u{1F4C5} \u041D\u0430\u0437\u043D\u0430\u0447\u0438\u0442\u044C \u0432\u0441\u0442\u0440\u0435\u0447\u0443"],
      ["\u{1F4C6} \u041A\u0430\u043B\u0435\u043D\u0434\u0430\u0440\u044C", "\u26A0\uFE0F \u041F\u0440\u043E\u0441\u0440\u043E\u0447\u0435\u043D\u043D\u044B\u0435"],
      ["\u{1F4CA} \u0417\u0430\u0434\u0430\u0447\u0438 \u043A\u043E\u043C\u0430\u043D\u0434\u044B", "\u{1F465} \u041C\u043E\u044F \u043A\u043E\u043C\u0430\u043D\u0434\u0430"]
    ],
    resize_keyboard: true
  };
}
__name(getBossKeyboard, "getBossKeyboard");
function getEmployeeKeyboard() {
  return {
    keyboard: [
      ["\u{1F4CB} \u041C\u043E\u0438 \u0437\u0430\u0434\u0430\u0447\u0438"],
      ["\u{1F4C5} \u041C\u043E\u0438 \u0432\u0441\u0442\u0440\u0435\u0447\u0438"],
      ["\u2139\uFE0F \u041F\u043E\u043C\u043E\u0449\u044C"]
    ],
    resize_keyboard: true
  };
}
__name(getEmployeeKeyboard, "getEmployeeKeyboard");
function getTaskActionsKeyboard(taskId, status, role) {
  const keyboard = { inline_keyboard: [] };
  if (role === "employee" && status !== "completed") {
    if (status === "pending") {
      keyboard.inline_keyboard.push([
        { text: "\u25B6\uFE0F \u041D\u0430\u0447\u0430\u0442\u044C \u0440\u0430\u0431\u043E\u0442\u0443", callback_data: `task_${taskId}_in_progress` }
      ]);
    } else if (status === "in_progress") {
      keyboard.inline_keyboard.push([
        { text: "\u2705 \u0417\u0430\u0432\u0435\u0440\u0448\u0438\u0442\u044C \u0437\u0430\u0434\u0430\u0447\u0443", callback_data: `task_${taskId}_completed` }
      ]);
    }
  }
  keyboard.inline_keyboard.push([
    { text: "\u{1F4AC} \u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u043A\u043E\u043C\u043C\u0435\u043D\u0442\u0430\u0440\u0438\u0439", callback_data: `comment_${taskId}` }
  ]);
  if (role === "boss" && status !== "completed") {
    keyboard.inline_keyboard.push([
      { text: "\u{1F4C5} \u0418\u0437\u043C\u0435\u043D\u0438\u0442\u044C \u0434\u0435\u0434\u043B\u0430\u0439\u043D", callback_data: `change_deadline_${taskId}` }
    ]);
    keyboard.inline_keyboard.push([
      { text: "\u{1F5D1} \u0423\u0434\u0430\u043B\u0438\u0442\u044C \u0437\u0430\u0434\u0430\u0447\u0443", callback_data: `delete_task_${taskId}` }
    ]);
  } else if (role === "boss") {
    keyboard.inline_keyboard.push([
      { text: "\u{1F5D1} \u0423\u0434\u0430\u043B\u0438\u0442\u044C \u0437\u0430\u0434\u0430\u0447\u0443", callback_data: `delete_task_${taskId}` }
    ]);
  }
  return keyboard;
}
__name(getTaskActionsKeyboard, "getTaskActionsKeyboard");
function createCalendarKeyboard(year, month, prefix = "cal") {
  const keyboard = { inline_keyboard: [] };
  const MONTHS_RU = [
    "",
    "\u042F\u043D\u0432\u0430\u0440\u044C",
    "\u0424\u0435\u0432\u0440\u0430\u043B\u044C",
    "\u041C\u0430\u0440\u0442",
    "\u0410\u043F\u0440\u0435\u043B\u044C",
    "\u041C\u0430\u0439",
    "\u0418\u044E\u043D\u044C",
    "\u0418\u044E\u043B\u044C",
    "\u0410\u0432\u0433\u0443\u0441\u0442",
    "\u0421\u0435\u043D\u0442\u044F\u0431\u0440\u044C",
    "\u041E\u043A\u0442\u044F\u0431\u0440\u044C",
    "\u041D\u043E\u044F\u0431\u0440\u044C",
    "\u0414\u0435\u043A\u0430\u0431\u0440\u044C"
  ];
  keyboard.inline_keyboard.push([
    { text: "\u25C0\uFE0F", callback_data: `${prefix}_prev_${year}_${month}` },
    { text: `${MONTHS_RU[month]} ${year}`, callback_data: `${prefix}_ignore` },
    { text: "\u25B6\uFE0F", callback_data: `${prefix}_next_${year}_${month}` }
  ]);
  keyboard.inline_keyboard.push([
    { text: "\u041F\u043D", callback_data: `${prefix}_ignore` },
    { text: "\u0412\u0442", callback_data: `${prefix}_ignore` },
    { text: "\u0421\u0440", callback_data: `${prefix}_ignore` },
    { text: "\u0427\u0442", callback_data: `${prefix}_ignore` },
    { text: "\u041F\u0442", callback_data: `${prefix}_ignore` },
    { text: "\u0421\u0431", callback_data: `${prefix}_ignore` },
    { text: "\u0412\u0441", callback_data: `${prefix}_ignore` }
  ]);
  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDay = new Date(year, month - 1, 1).getDay();
  const today = /* @__PURE__ */ new Date();
  let week = [];
  for (let i = 0; i < (firstDay === 0 ? 6 : firstDay - 1); i++) {
    week.push({ text: " ", callback_data: `${prefix}_ignore` });
  }
  const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month - 1, day);
    if (date < todayDate) {
      week.push({ text: "\xB7", callback_data: `${prefix}_ignore` });
    } else if (date.getTime() === todayDate.getTime()) {
      week.push({ text: `[${day}]`, callback_data: `${prefix}_day_${year}_${month}_${day}` });
    } else {
      week.push({ text: String(day), callback_data: `${prefix}_day_${year}_${month}_${day}` });
    }
    if (week.length === 7) {
      keyboard.inline_keyboard.push(week);
      week = [];
    }
  }
  if (week.length > 0) {
    while (week.length < 7) {
      week.push({ text: " ", callback_data: `${prefix}_ignore` });
    }
    keyboard.inline_keyboard.push(week);
  }
  if (prefix === "cal") {
    keyboard.inline_keyboard.push([
      { text: "\u23ED \u0411\u0435\u0437 \u0434\u0435\u0434\u043B\u0430\u0439\u043D\u0430", callback_data: "skip_deadline" }
    ]);
  }
  return keyboard;
}
__name(createCalendarKeyboard, "createCalendarKeyboard");
function createTimePickerKeyboard(prefix = "time") {
  const keyboard = { inline_keyboard: [] };
  const hours = ["08", "09", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "20", "21", "22"];
  for (let i = 0; i < hours.length; i += 3) {
    const row = [];
    for (let j = i; j < Math.min(i + 3, hours.length); j++) {
      row.push({ text: `${hours[j]}:00`, callback_data: `${prefix}_${hours[j]}_00` });
      row.push({ text: `${hours[j]}:30`, callback_data: `${prefix}_${hours[j]}_30` });
    }
    if (row.length > 0)
      keyboard.inline_keyboard.push(row);
  }
  return keyboard;
}
__name(createTimePickerKeyboard, "createTimePickerKeyboard");
function createEmployeeSelectKeyboard(employees, selected = [], togglePrefix = "toggle_emp", selectAllData = "select_all", deselectAllData = "deselect_all", confirmData = "confirm_employees") {
  const keyboard = { inline_keyboard: [] };
  for (const emp of employees) {
    const isSelected = selected.includes(emp.id);
    const checkbox = isSelected ? "\u2705" : "\u2B1C";
    const name = emp.first_name || emp.username;
    keyboard.inline_keyboard.push([
      { text: `${checkbox} ${name}`, callback_data: `${togglePrefix}_${emp.id}` }
    ]);
  }
  keyboard.inline_keyboard.push([
    { text: "\u2705 \u0412\u044B\u0431\u0440\u0430\u0442\u044C \u0432\u0441\u0435\u0445", callback_data: selectAllData },
    { text: "\u274C \u0421\u043D\u044F\u0442\u044C \u0432\u0441\u0435\u0445", callback_data: deselectAllData }
  ]);
  if (selected.length > 0) {
    keyboard.inline_keyboard.push([
      { text: `\u{1F4E4} \u041D\u0430\u0437\u043D\u0430\u0447\u0438\u0442\u044C (${selected.length})`, callback_data: confirmData }
    ]);
  }
  return keyboard;
}
__name(createEmployeeSelectKeyboard, "createEmployeeSelectKeyboard");
async function sendMessage(chatId, text, env, keyboard = null) {
  const url = `https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`;
  const body = {
    chat_id: chatId,
    text,
    parse_mode: "Markdown"
  };
  if (keyboard) {
    body.reply_markup = keyboard;
  }
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const result = await response.json();
    if (!result.ok) {
      console.error("\u274C Telegram API error:", result);
    }
    return result;
  } catch (error) {
    console.error("\u274C Error sending message:", error.message);
  }
}
__name(sendMessage, "sendMessage");
async function editMessage(chatId, messageId, text, env, keyboard = null) {
  const url = `https://api.telegram.org/bot${env.BOT_TOKEN}/editMessageText`;
  const body = {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: "Markdown"
  };
  if (keyboard) {
    body.reply_markup = keyboard;
  }
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const result = await response.json();
    if (!result.ok) {
      console.error("\u274C Telegram API error:", result);
    }
    return result;
  } catch (error) {
    console.error("\u274C Error editing message:", error.message);
  }
}
__name(editMessage, "editMessage");
async function answerCallbackQuery(callbackQueryId, env, text = null) {
  const url = `https://api.telegram.org/bot${env.BOT_TOKEN}/answerCallbackQuery`;
  const body = { callback_query_id: callbackQueryId };
  if (text) {
    body.text = text;
  }
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
  } catch (error) {
    console.error("\u274C Error answering callback:", error.message);
  }
}
__name(answerCallbackQuery, "answerCallbackQuery");
function formatDeadline(deadline) {
  if (!deadline)
    return "";
  const date = new Date(deadline);
  if (/(?:Z|[+-]\d{2}:\d{2})$/i.test(String(deadline).trim())) {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Tashkent", day: "2-digit", month: "2-digit",
      year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23"
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.day}.${values.month}.${values.year} ${values.hour}:${values.minute}`;
  }
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${day}.${month}.${year} ${hours}:${minutes}`;
}
__name(formatDeadline, "formatDeadline");
function formatDate(date) {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}.${month}.${year}`;
}
__name(formatDate, "formatDate");
function formatTime(datetime) {
  const date = new Date(datetime);
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}
__name(formatTime, "formatTime");
export {
  repo_default as default
};
//# sourceMappingURL=index.js.map
