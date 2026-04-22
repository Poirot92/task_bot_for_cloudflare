/**
 * Полный Telegram бот для Cloudflare Workers
 * С поддержкой всех функций: задачи, встречи, напоминания, команда
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // Webhook endpoint для Telegram
    if (url.pathname === '/webhook' && request.method === 'POST') {
      try {
        const update = await request.json();
        await handleTelegramUpdate(update, env);
        return new Response('OK', { status: 200 });
      } catch (error) {
        console.error('Error handling update:', error);
        return new Response('Error', { status: 500 });
      }
    }
    
    // Setup endpoint
    if (url.pathname === '/setup') {
      const webhookUrl = `${url.origin}/webhook`;
      const telegramApiUrl = `https://api.telegram.org/bot${env.BOT_TOKEN}/setWebhook`;
      
      const response = await fetch(telegramApiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: webhookUrl })
      });
      
      const result = await response.json();
      return new Response(JSON.stringify(result, null, 2), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    return new Response('Telegram Bot is running', { status: 200 });
  },
  
  // Cron trigger для напоминаний
  async scheduled(event, env, ctx) {
    ctx.waitUntil(checkReminders(env));
  }
};

// ==================== ОСНОВНЫЕ ОБРАБОТЧИКИ ====================

async function handleTelegramUpdate(update, env) {
  if (update.message) {
    await handleMessage(update.message, env);
  }
  
  if (update.callback_query) {
    await handleCallbackQuery(update.callback_query, env);
  }
}

async function handleMessage(message, env) {
  const chatId = message.chat.id;
  const text = message.text;
  const userId = message.from.id;
  const username = message.from.username || '';
  const firstName = message.from.first_name || '';
  
  // Получаем пользователя и его состояние
  const user = await getUser(userId, env);
  const state = await getUserState(userId, env);
  
  // Обработка команд
  if (text === '/start') {
    await handleStart(chatId, userId, username, firstName, user, env);
    return;
  }
  
  // Обработка состояний (ConversationHandler)
  if (state) {
    await handleConversationState(chatId, userId, text, state, user, message, env);
    return;
  }
  
  // Обработка кнопок главного меню
  if (user) {
    await handleMenuButtons(chatId, userId, text, user, env);
  }
}

async function handleCallbackQuery(callbackQuery, env) {
  const chatId = callbackQuery.message.chat.id;
  const messageId = callbackQuery.message.message_id;
  const data = callbackQuery.data;
  const userId = callbackQuery.from.id;
  const username = callbackQuery.from.username || '';
  const firstName = callbackQuery.from.first_name || '';
  
  await answerCallbackQuery(callbackQuery.id, env);
  
  const user = await getUser(userId, env);
  
  // Регистрация
  if (data === 'register_boss') {
    await setState(userId, 'CREATE_ORG', null, env);
    await sendMessage(chatId, '👔 Отлично! Введите название вашей организации:', env);
    return;
  }
  
  if (data === 'join_as_employee') {
    await setState(userId, 'ENTER_ORG_CODE', null, env);
    await sendMessage(chatId, '🔑 Введите 6-значный код организации:', env);
    return;
  }
  
  // Календарь для задач
  if (data.startsWith('cal_')) {
    await handleCalendarCallback(chatId, messageId, data, userId, env);
    return;
  }
  
  // Выбор времени
  if (data.startsWith('time_')) {
    await handleTimePickerCallback(chatId, messageId, data, userId, env);
    return;
  }
  
  // Выбор сотрудников
  if (data.startsWith('toggle_emp_')) {
    await handleToggleEmployee(chatId, messageId, data, userId, env);
    return;
  }
  
  if (data === 'select_all') {
    await handleSelectAllEmployees(chatId, messageId, userId, env);
    return;
  }
  
  if (data === 'deselect_all') {
    await handleDeselectAllEmployees(chatId, messageId, userId, env);
    return;
  }
  
  if (data === 'confirm_employees') {
    await handleConfirmEmployees(chatId, messageId, userId, user, env);
    return;
  }
  
  // Просмотр задачи
  if (data.startsWith('view_task_')) {
    const taskId = data.split('_')[2];
    await handleViewTask(chatId, taskId, user, env);
    return;
  }
  
  // Изменение статуса задачи
  if (data.startsWith('task_') && data.includes('_in_progress')) {
    const taskId = data.split('_')[1];
    await updateTaskStatus(taskId, 'in_progress', env);
    await sendMessage(chatId, '✅ Задача переведена в статус "В работе"', env);
    await handleViewTask(chatId, taskId, user, env);
    return;
  }
  
  if (data.startsWith('task_') && data.includes('_completed')) {
    const taskId = data.split('_')[1];
    await updateTaskStatus(taskId, 'completed', env);
    await sendMessage(chatId, '🎉 Поздравляю! Задача завершена!', env);
    
    // Уведомляем босса
    const task = await getTask(taskId, env);
    if (task) {
      await sendMessage(
        task.created_by,
        `✅ Задача завершена!\n\n📋 ${task.title}\n👨‍💼 Исполнитель: ${firstName}`,
        env
      );
    }
    
    await handleViewTask(chatId, taskId, user, env);
    return;
  }
  
  // Добавление комментария
  if (data.startsWith('comment_')) {
    const taskId = data.split('_')[1];
    await setState(userId, 'ADD_COMMENT', { taskId }, env);
    await sendMessage(chatId, '💬 Введите ваш комментарий:', env);
    return;
  }
  
  // Удаление задачи
  if (data.startsWith('delete_task_')) {
    const taskId = data.split('_')[2];
    const keyboard = {
      inline_keyboard: [
        [{ text: '✅ Да, удалить', callback_data: `confirm_del_task_${taskId}` }],
        [{ text: '❌ Отмена', callback_data: 'back_to_main' }]
      ]
    };
    await editMessage(chatId, messageId, '⚠️ Вы уверены что хотите удалить задачу?', env, keyboard);
    return;
  }
  
  if (data.startsWith('confirm_del_task_')) {
    const taskId = data.split('_')[3];
    await deleteTaskFromDB(taskId, env);
    await editMessage(chatId, messageId, '✅ Задача удалена', env);
    return;
  }
  
  // Управление командой
  if (data === 'team_employees_list') {
    await handleShowEmployeesList(chatId, user, env);
    return;
  }
  
  if (data === 'team_org_code') {
    await handleShowOrgCode(chatId, user, env);
    return;
  }
  
  if (data === 'team_pending_requests') {
    await handleShowPendingRequests(chatId, user, env);
    return;
  }
  
  if (data.startsWith('approve_req_')) {
    const requestId = data.split('_')[2];
    await handleApproveRequest(chatId, requestId, env);
    return;
  }
  
  if (data.startsWith('reject_req_')) {
    const requestId = data.split('_')[2];
    await handleRejectRequest(chatId, requestId, env);
    return;
  }
  
  // Встречи
  if (data.startsWith('mcal_')) {
    await handleMeetingCalendarCallback(chatId, messageId, data, userId, env);
    return;
  }
  
  if (data.startsWith('mtime_')) {
    await handleMeetingTimeCallback(chatId, messageId, data, userId, env);
    return;
  }
  
  if (data.startsWith('mtoggle_')) {
    await handleToggleMeetingParticipant(chatId, messageId, data, userId, env);
    return;
  }
  
  if (data === 'mconfirm_participants') {
    await handleConfirmMeetingParticipants(chatId, messageId, userId, user, env);
    return;
  }
}

// ==================== СОСТОЯНИЯ (ConversationHandler) ====================

async function handleConversationState(chatId, userId, text, state, user, message, env) {
  const stateName = state.state;
  const stateData = state.data ? JSON.parse(state.data) : {};
  
  switch (stateName) {
    case 'CREATE_ORG':
      await handleCreateOrg(chatId, userId, text, message.from, env);
      break;
      
    case 'CREATE_TASK_DESC':
      await setState(userId, 'CREATE_TASK_DEADLINE', { description: text }, env);
      const calendar = createCalendarKeyboard(new Date().getFullYear(), new Date().getMonth() + 1);
      await sendMessage(chatId, '📅 Выберите дедлайн задачи:', env, calendar);
      break;
      
    case 'ADD_COMMENT':
      await handleSaveComment(chatId, userId, text, stateData.taskId, user, env);
      break;
      
    case 'ENTER_ORG_CODE':
      await handleEnterOrgCode(chatId, userId, text, message.from, env);
      break;
      
    case 'ENTER_PHONE':
      const phone = message.contact ? message.contact.phone_number : text;
      await handleEnterPhone(chatId, userId, phone, stateData, message.from, env);
      break;
      
    case 'MEETING_TITLE':
      await setState(userId, 'MEETING_DATE', { title: text }, env);
      const meetingCal = createCalendarKeyboard(new Date().getFullYear(), new Date().getMonth() + 1, 'mcal');
      await sendMessage(chatId, '📅 Выберите дату встречи:', env, meetingCal);
      break;
      
    case 'MEETING_LOCATION':
      await handleMeetingLocation(chatId, userId, text, stateData, user, env);
      break;
  }
}

// ==================== ОБРАБОТЧИКИ ДЕЙСТВИЙ ====================

async function handleStart(chatId, userId, username, firstName, user, env) {
  if (user) {
    const keyboard = user.role === 'boss' ? getBossKeyboard() : getEmployeeKeyboard();
    await sendMessage(
      chatId,
      `👋 Привет, **${user.first_name}**!\n\n🎯 Роль: ${user.role === 'boss' ? 'Босс' : 'Сотрудник'}\nВыбери действие:`,
      env,
      keyboard
    );
  } else {
    const keyboard = {
      inline_keyboard: [
        [{ text: '👔 Я босс', callback_data: 'register_boss' }],
        [{ text: '🏢 Присоединиться к организации', callback_data: 'join_as_employee' }]
      ]
    };
    await sendMessage(
      chatId,
      '👋 Добро пожаловать в таск-менеджер!\n\nВыберите вашу роль:',
      env,
      keyboard
    );
  }
}

async function handleMenuButtons(chatId, userId, text, user, env) {
  const role = user.role;
  
  // Босс
  if (role === 'boss') {
    if (text === '➕ Создать задачу') {
      await setState(userId, 'CREATE_TASK_DESC', null, env);
      await sendMessage(chatId, '📝 Введите описание задачи:', env);
      return;
    }
    
    if (text === '📅 Назначить встречу') {
      await setState(userId, 'MEETING_TITLE', null, env);
      await sendMessage(chatId, '📋 Введите название встречи:', env);
      return;
    }
    
    if (text === '📊 Задачи команды') {
      await handleShowTeamTasks(chatId, user, env);
      return;
    }
    
    if (text === '👥 Моя команда') {
      await handleShowTeamMenu(chatId, env);
      return;
    }
    
    if (text === '📆 Календарь') {
      await handleShowCalendar(chatId, user, env);
      return;
    }
    
    if (text === '⚠️ Просроченные') {
      await handleShowOverdueTasks(chatId, user, env);
      return;
    }
  }
  
  // Сотрудник
  if (role === 'employee') {
    if (text === '📋 Мои задачи') {
      await handleShowMyTasks(chatId, userId, env);
      return;
    }
    
    if (text === '📅 Мои встречи') {
      await handleShowMyMeetings(chatId, userId, env);
      return;
    }
  }
}

async function handleCreateOrg(chatId, userId, orgName, userFrom, env) {
  const code = await createOrganization(orgName, env);
  await addUser(userId, userFrom.username, userFrom.first_name, 'boss', code.orgId, env);
  await clearState(userId, env);
  
  const keyboard = getBossKeyboard();
  await sendMessage(
    chatId,
    `✅ Организация **${orgName}** создана!\n\n🔑 Код для сотрудников: \`${code.paymentCode}\`\n\nТеперь вы можете создавать задачи и приглашать сотрудников.`,
    env,
    keyboard
  );
}

async function handleSaveComment(chatId, userId, commentText, taskId, user, env) {
  await addComment(taskId, userId, commentText, env);
  await clearState(userId, env);
  await sendMessage(chatId, '✅ Комментарий добавлен!', env);
  await handleViewTask(chatId, taskId, user, env);
}

async function handleEnterOrgCode(chatId, userId, code, userFrom, env) {
  const orgId = await getOrgIdByCode(code, env);
  
  if (!orgId) {
    await sendMessage(chatId, '❌ Неверный код организации. Попробуйте ещё раз:', env);
    return;
  }
  
  await setState(userId, 'ENTER_PHONE', { orgId, code }, env);
  
  const keyboard = {
    keyboard: [[{ text: '📱 Отправить номер', request_contact: true }]],
    resize_keyboard: true,
    one_time_keyboard: true
  };
  
  await sendMessage(chatId, '📱 Отправьте ваш номер телефона:', env, keyboard);
}

async function handleEnterPhone(chatId, userId, phone, stateData, userFrom, env) {
  await createJoinRequest(
    userId,
    userFrom.username,
    userFrom.first_name,
    phone,
    stateData.orgId,
    env
  );
  
  await clearState(userId, env);
  
  // Уведомляем босса
  const bossId = await getOrgBossId(stateData.orgId, env);
  if (bossId) {
    await sendMessage(
      bossId,
      `📨 Новая заявка на вступление!\n\n👤 ${userFrom.first_name}\n📱 ${phone}\n\nПроверьте в разделе "Моя команда"`,
      env
    );
  }
  
  await sendMessage(chatId, '✅ Заявка отправлена! Ожидайте подтверждения от руководителя.', env);
}

// ==================== ПРОСМОТР ДАННЫХ ====================

async function handleViewTask(chatId, taskId, user, env) {
  const task = await getTask(taskId, env);
  const comments = await getTaskComments(taskId, env);
  
  if (!task) {
    await sendMessage(chatId, '❌ Задача не найдена', env);
    return;
  }
  
  const statusEmoji = { pending: '🔴', in_progress: '🟡', completed: '🟢' };
  const statusText = { pending: 'Ожидает', in_progress: 'В работе', completed: 'Завершена' };
  
  let text = `📋 **${task.title}**\n\n`;
  text += `📊 Статус: ${statusEmoji[task.status]} ${statusText[task.status]}\n`;
  text += `📝 ${task.description}\n`;
  
  if (task.deadline) {
    text += `📅 Дедлайн: ${formatDeadline(task.deadline)}\n`;
  }
  
  if (comments && comments.length > 0) {
    text += '\n💬 **Комментарии:**\n';
    for (const comment of comments) {
      const roleEmoji = comment.role === 'boss' ? '👔' : '👨‍💼';
      text += `\n${roleEmoji} **${comment.first_name}**\n_${comment.comment_text}_\n`;
    }
  }
  
  const keyboard = getTaskActionsKeyboard(taskId, task.status, user.role);
  await sendMessage(chatId, text, env, keyboard);
}

async function handleShowMyTasks(chatId, userId, env) {
  const tasks = await getEmployeeTasks(userId, env);
  
  if (!tasks || tasks.length === 0) {
    await sendMessage(chatId, '📭 У вас пока нет задач', env);
    return;
  }
  
  let text = '📋 **Мои задачи:**\n\n';
  const keyboard = { inline_keyboard: [] };
  
  for (const task of tasks) {
    const emoji = { pending: '🔴', in_progress: '🟡', completed: '🟢' };
    text += `${emoji[task.status]} ${task.title}\n`;
    if (task.deadline) {
      text += `   📅 ${formatDeadline(task.deadline)}\n`;
    }
    text += '\n';
    
    keyboard.inline_keyboard.push([{
      text: `📖 ${task.title.substring(0, 30)}...`,
      callback_data: `view_task_${task.id}`
    }]);
  }
  
  await sendMessage(chatId, text, env, keyboard);
}

async function handleShowTeamTasks(chatId, user, env) {
  const tasks = await getFilteredTasks(user.org_id, null, null, env);
  
  if (!tasks || tasks.length === 0) {
    await sendMessage(chatId, '📭 Задач пока нет', env);
    return;
  }
  
  let text = '📊 **Задачи команды:**\n\n';
  const keyboard = { inline_keyboard: [] };
  
  for (const task of tasks) {
    const emoji = { pending: '🔴', in_progress: '🟡', completed: '🟢' };
    text += `${emoji[task.status]} **${task.title}**\n`;
    text += `   👨‍💼 ${task.emp_name}\n`;
    if (task.deadline) {
      text += `   📅 ${formatDeadline(task.deadline)}\n`;
    }
    text += '\n';
    
    keyboard.inline_keyboard.push([{
      text: `📖 ${task.title.substring(0, 30)}...`,
      callback_data: `view_task_${task.id}`
    }]);
  }
  
  await sendMessage(chatId, text, env, keyboard);
}

async function handleShowTeamMenu(chatId, env) {
  const keyboard = {
    inline_keyboard: [
      [{ text: '👥 Список сотрудников', callback_data: 'team_employees_list' }],
      [{ text: '📨 Заявки на вступление', callback_data: 'team_pending_requests' }],
      [{ text: '🔑 Код организации', callback_data: 'team_org_code' }]
    ]
  };
  
  await sendMessage(chatId, '👥 **Управление командой:**\n\nВыберите действие:', env, keyboard);
}

async function handleShowEmployeesList(chatId, user, env) {
  const employees = await getOrgEmployees(user.org_id, env);
  
  if (!employees || employees.length === 0) {
    await sendMessage(chatId, '📭 В вашей команде пока нет сотрудников', env);
    return;
  }
  
  let text = '👥 **Сотрудники организации:**\n\n';
  for (const emp of employees) {
    text += `👨‍💼 ${emp.first_name || emp.username}\n`;
  }
  
  await sendMessage(chatId, text, env);
}

async function handleShowOrgCode(chatId, user, env) {
  const org = await getOrgInfo(user.org_id, env);
  
  await sendMessage(
    chatId,
    `🔑 **Код вашей организации:**\n\n\`${org.payment_code}\`\n\nОтправьте этот код сотрудникам для присоединения.`,
    env
  );
}

async function handleShowPendingRequests(chatId, user, env) {
  const requests = await getPendingRequests(user.org_id, env);
  
  if (!requests || requests.length === 0) {
    await sendMessage(chatId, '📭 Нет ожидающих заявок', env);
    return;
  }
  
  let text = '📨 **Заявки на вступление:**\n\n';
  const keyboard = { inline_keyboard: [] };
  
  for (const req of requests) {
    text += `👤 ${req.first_name}\n📱 ${req.phone}\n\n`;
    
    keyboard.inline_keyboard.push([
      { text: `✅ Принять ${req.first_name}`, callback_data: `approve_req_${req.id}` },
      { text: `❌ Отклонить`, callback_data: `reject_req_${req.id}` }
    ]);
  }
  
  await sendMessage(chatId, text, env, keyboard);
}

async function handleApproveRequest(chatId, requestId, env) {
  const result = await approveJoinRequest(requestId, env);
  
  if (result) {
    await sendMessage(chatId, '✅ Сотрудник добавлен в команду!', env);
    
    // Уведомляем сотрудника
    const keyboard = getEmployeeKeyboard();
    await sendMessage(
      result.userId,
      '🎉 Ваша заявка одобрена! Добро пожаловать в команду!',
      env,
      keyboard
    );
  }
}

async function handleRejectRequest(chatId, requestId, env) {
  const userId = await rejectJoinRequest(requestId, env);
  
  await sendMessage(chatId, '❌ Заявка отклонена', env);
  
  if (userId) {
    await sendMessage(userId, '😔 К сожалению, ваша заявка была отклонена.', env);
  }
}

async function handleShowCalendar(chatId, user, env) {
  const today = new Date();
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - today.getDay() + 1);
  
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  
  const tasks = await getWeekTasks(user.org_id, weekStart, weekEnd, env);
  const meetings = await getWeekMeetings(user.org_id, weekStart, weekEnd, env);
  
  let text = `📆 **Календарь на неделю**\n${formatDate(weekStart)} - ${formatDate(weekEnd)}\n\n`;
  
  if (tasks && tasks.length > 0) {
    text += '📋 **Задачи:**\n';
    for (const task of tasks) {
      text += `• ${task.title} - ${formatDeadline(task.deadline)}\n`;
    }
    text += '\n';
  }
  
  if (meetings && meetings.length > 0) {
    text += '📅 **Встречи:**\n';
    for (const meeting of meetings) {
      text += `• ${meeting.title} - ${formatDeadline(meeting.meeting_datetime)}\n`;
    }
  }
  
  if ((!tasks || tasks.length === 0) && (!meetings || meetings.length === 0)) {
    text += '📭 На этой неделе ничего не запланировано';
  }
  
  await sendMessage(chatId, text, env);
}

async function handleShowOverdueTasks(chatId, user, env) {
  const tasks = await getOverdueTasks(user.org_id, env);
  
  if (!tasks || tasks.length === 0) {
    await sendMessage(chatId, '✅ Просроченных задач нет!', env);
    return;
  }
  
  let text = '⚠️ **Просроченные задачи:**\n\n';
  const keyboard = { inline_keyboard: [] };
  
  for (const task of tasks) {
    text += `🔴 **${task.title}**\n`;
    text += `   👨‍💼 ${task.emp_name}\n`;
    text += `   📅 Дедлайн был: ${formatDeadline(task.deadline)}\n\n`;
    
    keyboard.inline_keyboard.push([{
      text: `📖 ${task.title.substring(0, 30)}...`,
      callback_data: `view_task_${task.id}`
    }]);
  }
  
  await sendMessage(chatId, text, env, keyboard);
}

async function handleShowMyMeetings(chatId, userId, env) {
  const meetings = await getEmployeeMeetings(userId, env);
  
  if (!meetings || meetings.length === 0) {
    await sendMessage(chatId, '📭 У вас пока нет запланированных встреч', env);
    return;
  }
  
  let text = '📅 **Мои встречи:**\n\n';
  
  for (const meeting of meetings) {
    text += `📌 **${meeting.title}**\n`;
    text += `   ⏰ ${formatDeadline(meeting.meeting_datetime)}\n`;
    text += `   📍 ${meeting.location || 'Место не указано'}\n\n`;
  }
  
  await sendMessage(chatId, text, env);
}

// ==================== КАЛЕНДАРЬ ====================

async function handleCalendarCallback(chatId, messageId, data, userId, env) {
  const parts = data.split('_');
  const action = parts[1];
  
  if (action === 'day') {
    const year = parseInt(parts[2]);
    const month = parseInt(parts[3]);
    const day = parseInt(parts[4]);
    
    const state = await getUserState(userId, env);
    const stateData = state.data ? JSON.parse(state.data) : {};
    stateData.year = year;
    stateData.month = month;
    stateData.day = day;
    
    const keyboard = createTimePickerKeyboard();
    await editMessage(chatId, messageId, '⏰ Выберите время дедлайна:', env, keyboard);
    await setState(userId, state.state, stateData, env);
    return;
  }
  
  if (action === 'prev' || action === 'next') {
    let year = parseInt(parts[2]);
    let month = parseInt(parts[3]);
    
    if (action === 'prev') {
      month--;
      if (month === 0) { month = 12; year--; }
    } else {
      month++;
      if (month === 13) { month = 1; year++; }
    }
    
    const calendar = createCalendarKeyboard(year, month);
    await editMessage(chatId, messageId, '📅 Выберите дату:', env, calendar);
    return;
  }
  
  if (action === 'ignore') {
    return;
  }
}

async function handleTimePickerCallback(chatId, messageId, data, userId, env) {
  const state = await getUserState(userId, env);
  const stateData = state.data ? JSON.parse(state.data) : {};
  
  if (data === 'skip_deadline') {
    stateData.deadline = null;
  } else {
    const hour = data.split('_')[1];
    const minute = data.split('_')[2];
    
    const deadline = new Date(stateData.year, stateData.month - 1, stateData.day, parseInt(hour), parseInt(minute));
    stateData.deadline = deadline.toISOString().slice(0, 16).replace('T', ' ');
  }
  
  await setState(userId, 'SELECT_EMPLOYEE', stateData, env);
  
  const user = await getUser(userId, env);
  const employees = await getOrgEmployees(user.org_id, env);
  
  if (!employees || employees.length === 0) {
    await sendMessage(chatId, '❌ В вашей организации пока нет сотрудников', env);
    await clearState(userId, env);
    return;
  }
  
  const keyboard = createEmployeeSelectKeyboard(employees, []);
  await editMessage(chatId, messageId, '👥 Выберите исполнителей:', env, keyboard);
}

async function handleToggleEmployee(chatId, messageId, data, userId, env) {
  const empId = parseInt(data.split('_')[2]);
  
  const state = await getUserState(userId, env);
  const stateData = state.data ? JSON.parse(state.data) : {};
  
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
  
  await editMessage(chatId, messageId, '👥 Выберите исполнителей:', env, keyboard);
}

async function handleSelectAllEmployees(chatId, messageId, userId, env) {
  const state = await getUserState(userId, env);
  const stateData = state.data ? JSON.parse(state.data) : {};
  
  const user = await getUser(userId, env);
  const employees = await getOrgEmployees(user.org_id, env);
  
  stateData.selectedEmployees = employees.map(e => e.id);
  await setState(userId, state.state, stateData, env);
  
  const keyboard = createEmployeeSelectKeyboard(employees, stateData.selectedEmployees);
  await editMessage(chatId, messageId, '👥 Выберите исполнителей:', env, keyboard);
}

async function handleDeselectAllEmployees(chatId, messageId, userId, env) {
  const state = await getUserState(userId, env);
  const stateData = state.data ? JSON.parse(state.data) : {};
  
  stateData.selectedEmployees = [];
  await setState(userId, state.state, stateData, env);
  
  const user = await getUser(userId, env);
  const employees = await getOrgEmployees(user.org_id, env);
  const keyboard = createEmployeeSelectKeyboard(employees, []);
  
  await editMessage(chatId, messageId, '👥 Выберите исполнителей:', env, keyboard);
}

async function handleConfirmEmployees(chatId, messageId, userId, user, env) {
  const state = await getUserState(userId, env);
  const stateData = state.data ? JSON.parse(state.data) : {};
  
  if (!stateData.selectedEmployees || stateData.selectedEmployees.length === 0) {
    await answerCallbackQuery(messageId, env, '❌ Выберите хотя бы одного сотрудника');
    return;
  }
  
  // Создаём задачи для каждого сотрудника
  for (const empId of stateData.selectedEmployees) {
    await createTask(
      stateData.description,
      stateData.description,
      stateData.deadline,
      userId,
      empId,
      user.org_id,
      env
    );
    
    // Уведомляем сотрудника
    await sendMessage(
      empId,
      `📋 **Новая задача!**\n\n${stateData.description}\n\n📅 Дедлайн: ${stateData.deadline ? formatDeadline(stateData.deadline) : 'Не указан'}`,
      env
    );
  }
  
  await clearState(userId, env);
  await editMessage(chatId, messageId, `✅ Задача создана для ${stateData.selectedEmployees.length} сотрудников!`, env);
}

// ==================== ВСТРЕЧИ ====================

async function handleMeetingCalendarCallback(chatId, messageId, data, userId, env) {
  // Аналогично handleCalendarCallback, но с префиксом mcal_
  const parts = data.split('_');
  const action = parts[1];
  
  if (action === 'day') {
    const year = parseInt(parts[2]);
    const month = parseInt(parts[3]);
    const day = parseInt(parts[4]);
    
    const state = await getUserState(userId, env);
    const stateData = state.data ? JSON.parse(state.data) : {};
    stateData.year = year;
    stateData.month = month;
    stateData.day = day;
    
    const keyboard = createTimePickerKeyboard('mtime');
    await editMessage(chatId, messageId, '⏰ Выберите время встречи:', env, keyboard);
    await setState(userId, 'MEETING_TIME', stateData, env);
  }
}

async function handleMeetingTimeCallback(chatId, messageId, data, userId, env) {
  const state = await getUserState(userId, env);
  const stateData = state.data ? JSON.parse(state.data) : {};
  
  const hour = data.split('_')[1];
  const minute = data.split('_')[2];
  
  const datetime = new Date(stateData.year, stateData.month - 1, stateData.day, parseInt(hour), parseInt(minute));
  stateData.datetime = datetime.toISOString().slice(0, 16).replace('T', ' ');
  
  await setState(userId, 'MEETING_LOCATION', stateData, env);
  await sendMessage(chatId, '📍 Введите место проведения встречи (или "Пропустить"):', env);
}

async function handleMeetingLocation(chatId, userId, location, stateData, user, env) {
  stateData.location = location === 'Пропустить' ? null : location;
  
  await setState(userId, 'MEETING_PARTICIPANTS', stateData, env);
  
  const employees = await getOrgEmployees(user.org_id, env);
  const keyboard = createEmployeeSelectKeyboard(employees, [], 'mtoggle', 'mselect_all', 'mdeselect_all', 'mconfirm_participants');
  
  await sendMessage(chatId, '👥 Выберите участников встречи:', env, keyboard);
}

async function handleToggleMeetingParticipant(chatId, messageId, data, userId, env) {
  // Аналогично handleToggleEmployee
  const empId = parseInt(data.split('_')[1]);
  
  const state = await getUserState(userId, env);
  const stateData = state.data ? JSON.parse(state.data) : {};
  
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
  const keyboard = createEmployeeSelectKeyboard(employees, stateData.selectedEmployees, 'mtoggle', 'mselect_all', 'mdeselect_all', 'mconfirm_participants');
  
  await editMessage(chatId, messageId, '👥 Выберите участников встречи:', env, keyboard);
}

async function handleConfirmMeetingParticipants(chatId, messageId, userId, user, env) {
  const state = await getUserState(userId, env);
  const stateData = state.data ? JSON.parse(state.data) : {};
  
  if (!stateData.selectedEmployees || stateData.selectedEmployees.length === 0) {
    await answerCallbackQuery(messageId, env, '❌ Выберите хотя бы одного участника');
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
  
  // Уведомляем участников
  for (const empId of stateData.selectedEmployees) {
    await sendMessage(
      empId,
      `📅 **Новая встреча!**\n\n📌 ${stateData.title}\n⏰ ${formatDeadline(stateData.datetime)}\n📍 ${stateData.location || 'Место не указано'}`,
      env
    );
  }
  
  await clearState(userId, env);
  await editMessage(chatId, messageId, '✅ Встреча назначена!', env);
}

// ==================== НАПОМИНАНИЯ (CRON) ====================

async function checkReminders(env) {
  try {
    await checkTaskReminders(env);
    await checkMeetingReminders(env);
  } catch (error) {
    console.error('Error in checkReminders:', error);
  }
}

async function checkTaskReminders(env) {
  const now = new Date();
  
  // Получаем все незавершённые задачи с дедлайном
  const tasks = await env.DB.prepare(`
    SELECT t.id, t.title, t.deadline, t.assigned_to, t.created_by,
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
    const timeDiff = deadline - now;
    const hoursDiff = timeDiff / (1000 * 60 * 60);
    
    // Напоминание за 24 часа сотруднику
    if (hoursDiff >= 23.5 && hoursDiff <= 24.5) {
      const sent = await wasReminderSent(task.id, null, 'employee_1day', env);
      if (!sent) {
        await sendMessage(
          task.assigned_to,
          `⏰ **Напоминание!**\n\n📋 Задача: **${task.title}**\n📅 Дедлайн: **завтра** (${formatDeadline(task.deadline)})\n\nНе забудь выполнить!`,
          env
        );
        await markReminderSent(task.id, null, 'employee_1day', env);
      }
    }
    
    // Напоминание за 2 часа боссу
    if (hoursDiff >= 1.75 && hoursDiff <= 2.25) {
      const sent = await wasReminderSent(task.id, null, 'boss_2hours', env);
      if (!sent) {
        await sendMessage(
          task.created_by,
          `⚠️ **Внимание!**\n\n📋 Задача: **${task.title}**\n👨‍💼 Исполнитель: ${task.emp_name}\n📅 Дедлайн через **2 часа**\n\nЗадача ещё не завершена!`,
          env
        );
        await markReminderSent(task.id, null, 'boss_2hours', env);
      }
    }
  }
}

async function checkMeetingReminders(env) {
  const now = new Date();
  
  // Получаем встречи на ближайшие 2 часа
  const meetings = await env.DB.prepare(`
    SELECT m.id, m.title, m.meeting_datetime, m.location, m.created_by
    FROM meetings m
    WHERE datetime(m.meeting_datetime) >= datetime('now')
    AND datetime(m.meeting_datetime) <= datetime('now', '+2 hours')
  `).all();
  
  for (const meeting of meetings.results) {
    const meetingTime = new Date(meeting.meeting_datetime);
    const timeDiff = meetingTime - now;
    const minutesDiff = timeDiff / (1000 * 60);
    
    // Напоминание за 1 час участникам
    if (minutesDiff >= 55 && minutesDiff <= 65) {
      const sent = await wasReminderSent(null, meeting.id, 'employee_1hour', env);
      if (!sent) {
        const participants = await getMeetingParticipants(meeting.id, env);
        for (const participant of participants) {
          await sendMessage(
            participant.user_id,
            `📅 **Напоминание о встрече!**\n\n📌 ${meeting.title}\n⏰ Через **1 час**\n📍 ${meeting.location || 'Место не указано'}`,
            env
          );
        }
        await markReminderSent(null, meeting.id, 'employee_1hour', env);
      }
    }
  }
}

// ==================== БАЗА ДАННЫХ ====================

async function getUser(userId, env) {
  try {
    const result = await env.DB.prepare('SELECT * FROM users WHERE id = ?')
      .bind(userId)
      .first();
    return result;
  } catch (error) {
    console.error('Error getting user:', error);
    return null;
  }
}

async function addUser(userId, username, firstName, role, orgId, env) {
  await env.DB.prepare(`
    INSERT OR REPLACE INTO users (id, username, first_name, role, org_id)
    VALUES (?, ?, ?, ?, ?)
  `).bind(userId, username, firstName, role, orgId).run();
}

async function createOrganization(name, env) {
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  
  const result = await env.DB.prepare(
    'INSERT INTO organizations (name, payment_code) VALUES (?, ?)'
  ).bind(name, code).run();
  
  return { orgId: result.meta.last_row_id, paymentCode: code };
}

async function getOrgIdByCode(code, env) {
  const result = await env.DB.prepare(
    'SELECT id FROM organizations WHERE payment_code = ?'
  ).bind(code).first();
  
  return result ? result.id : null;
}

async function getOrgInfo(orgId, env) {
  return await env.DB.prepare(
    'SELECT * FROM organizations WHERE id = ?'
  ).bind(orgId).first();
}

async function getOrgEmployees(orgId, env) {
  const result = await env.DB.prepare(`
    SELECT id, username, first_name FROM users 
    WHERE org_id = ? AND role = 'employee'
  `).bind(orgId).all();
  
  return result.results;
}

async function getOrgBossId(orgId, env) {
  const result = await env.DB.prepare(
    'SELECT id FROM users WHERE org_id = ? AND role = ?'
  ).bind(orgId, 'boss').first();
  
  return result ? result.id : null;
}

async function createTask(title, description, deadline, createdBy, assignedTo, orgId, env) {
  await env.DB.prepare(`
    INSERT INTO tasks (title, description, deadline, created_by, assigned_to, org_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(title, description, deadline, createdBy, assignedTo, orgId).run();
}

async function getTask(taskId, env) {
  return await env.DB.prepare(`
    SELECT t.*, emp.first_name as emp_name, boss.first_name as boss_name
    FROM tasks t
    LEFT JOIN users emp ON t.assigned_to = emp.id
    LEFT JOIN users boss ON t.created_by = boss.id
    WHERE t.id = ?
  `).bind(taskId).first();
}

async function getEmployeeTasks(userId, env) {
  const result = await env.DB.prepare(`
    SELECT id, title, description, deadline, status 
    FROM tasks WHERE assigned_to = ?
    ORDER BY created_at DESC
  `).bind(userId).all();
  
  return result.results;
}

async function getFilteredTasks(orgId, statusFilter, employeeId, env) {
  let query = `
    SELECT t.id, t.title, t.status, t.deadline, u.first_name as emp_name, t.assigned_to
    FROM tasks t
    JOIN users u ON t.assigned_to = u.id
    WHERE t.org_id = ?
  `;
  
  const params = [orgId];
  
  if (statusFilter) {
    query += ' AND t.status = ?';
    params.push(statusFilter);
  }
  
  if (employeeId) {
    query += ' AND t.assigned_to = ?';
    params.push(employeeId);
  }
  
  query += ' ORDER BY t.created_at DESC';
  
  const result = await env.DB.prepare(query).bind(...params).all();
  return result.results;
}

async function updateTaskStatus(taskId, status, env) {
  await env.DB.prepare(
    'UPDATE tasks SET status = ? WHERE id = ?'
  ).bind(status, taskId).run();
}

async function deleteTaskFromDB(taskId, env) {
  await env.DB.prepare('DELETE FROM reminders_sent WHERE task_id = ?').bind(taskId).run();
  await env.DB.prepare('DELETE FROM comments WHERE task_id = ?').bind(taskId).run();
  await env.DB.prepare('DELETE FROM tasks WHERE id = ?').bind(taskId).run();
}

async function addComment(taskId, userId, commentText, env) {
  await env.DB.prepare(
    'INSERT INTO comments (task_id, user_id, comment_text) VALUES (?, ?, ?)'
  ).bind(taskId, userId, commentText).run();
}

async function getTaskComments(taskId, env) {
  const result = await env.DB.prepare(`
    SELECT c.comment_text, c.created_at, u.first_name, u.role
    FROM comments c
    JOIN users u ON c.user_id = u.id
    WHERE c.task_id = ?
    ORDER BY c.created_at ASC
  `).bind(taskId).all();
  
  return result.results;
}

async function createJoinRequest(userId, username, firstName, phone, orgId, env) {
  await env.DB.prepare(`
    INSERT INTO join_requests (user_id, username, first_name, phone, org_id, status)
    VALUES (?, ?, ?, ?, ?, 'pending')
  `).bind(userId, username, firstName, phone, orgId).run();
}

async function getPendingRequests(orgId, env) {
  const result = await env.DB.prepare(`
    SELECT id, user_id, username, first_name, phone, created_at
    FROM join_requests
    WHERE org_id = ? AND status = 'pending'
    ORDER BY created_at DESC
  `).bind(orgId).all();
  
  return result.results;
}

async function approveJoinRequest(requestId, env) {
  const request = await env.DB.prepare(
    'SELECT user_id, username, first_name, org_id FROM join_requests WHERE id = ?'
  ).bind(requestId).first();
  
  if (!request) return null;
  
  await addUser(request.user_id, request.username, request.first_name, 'employee', request.org_id, env);
  
  await env.DB.prepare(
    'UPDATE join_requests SET status = ? WHERE id = ?'
  ).bind('approved', requestId).run();
  
  return { userId: request.user_id, orgId: request.org_id };
}

async function rejectJoinRequest(requestId, env) {
  const request = await env.DB.prepare(
    'SELECT user_id FROM join_requests WHERE id = ?'
  ).bind(requestId).first();
  
  await env.DB.prepare(
    'UPDATE join_requests SET status = ? WHERE id = ?'
  ).bind('rejected', requestId).run();
  
  return request ? request.user_id : null;
}

async function createMeeting(title, description, datetime, location, createdBy, orgId, participants, env) {
  const result = await env.DB.prepare(`
    INSERT INTO meetings (title, description, meeting_datetime, location, created_by, org_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(title, description, datetime, location, createdBy, orgId).run();
  
  const meetingId = result.meta.last_row_id;
  
  for (const userId of participants) {
    await env.DB.prepare(
      'INSERT INTO meeting_participants (meeting_id, user_id) VALUES (?, ?)'
    ).bind(meetingId, userId).run();
  }
}

async function getWeekTasks(orgId, startDate, endDate, env) {
  const result = await env.DB.prepare(`
    SELECT t.id, t.title, t.status, t.deadline, u.first_name as emp_name
    FROM tasks t
    JOIN users u ON t.assigned_to = u.id
    WHERE t.org_id = ? 
    AND t.deadline IS NOT NULL 
    AND t.deadline != ''
    AND date(t.deadline) BETWEEN date(?) AND date(?)
    ORDER BY t.deadline ASC
  `).bind(orgId, startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0]).all();
  
  return result.results;
}

async function getWeekMeetings(orgId, startDate, endDate, env) {
  const result = await env.DB.prepare(`
    SELECT m.id, m.title, m.meeting_datetime, m.location
    FROM meetings m
    WHERE m.org_id = ? 
    AND date(m.meeting_datetime) BETWEEN date(?) AND date(?)
    ORDER BY m.meeting_datetime ASC
  `).bind(orgId, startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0]).all();
  
  return result.results;
}

async function getOverdueTasks(orgId, env) {
  const result = await env.DB.prepare(`
    SELECT t.id, t.title, t.status, t.deadline, u.first_name as emp_name, t.assigned_to
    FROM tasks t
    JOIN users u ON t.assigned_to = u.id
    WHERE t.org_id = ? 
    AND t.status != 'completed'
    AND t.deadline IS NOT NULL 
    AND t.deadline != ''
    AND datetime(t.deadline) < datetime('now')
    ORDER BY t.deadline ASC
  `).bind(orgId).all();
  
  return result.results;
}

async function getEmployeeMeetings(userId, env) {
  const result = await env.DB.prepare(`
    SELECT m.id, m.title, m.meeting_datetime, m.location
    FROM meetings m
    JOIN meeting_participants mp ON m.id = mp.meeting_id
    WHERE mp.user_id = ?
    AND datetime(m.meeting_datetime) >= datetime('now')
    ORDER BY m.meeting_datetime ASC
  `).bind(userId).all();
  
  return result.results;
}

async function getMeetingParticipants(meetingId, env) {
  const result = await env.DB.prepare(`
    SELECT mp.user_id, u.first_name
    FROM meeting_participants mp
    JOIN users u ON mp.user_id = u.id
    WHERE mp.meeting_id = ?
  `).bind(meetingId).all();
  
  return result.results;
}

async function wasReminderSent(taskId, meetingId, reminderType, env) {
  let query = 'SELECT id FROM reminders_sent WHERE reminder_type = ?';
  const params = [reminderType];
  
  if (taskId) {
    query += ' AND task_id = ?';
    params.push(taskId);
  } else if (meetingId) {
    query += ' AND meeting_id = ?';
    params.push(meetingId);
  }
  
  const result = await env.DB.prepare(query).bind(...params).first();
  return result !== null;
}

async function markReminderSent(taskId, meetingId, reminderType, env) {
  await env.DB.prepare(
    'INSERT INTO reminders_sent (task_id, meeting_id, reminder_type) VALUES (?, ?, ?)'
  ).bind(taskId, meetingId, reminderType).run();
}

// ==================== STATE MANAGEMENT ====================

async function getUserState(userId, env) {
  try {
    const result = await env.DB.prepare(
      'SELECT * FROM user_states WHERE user_id = ?'
    ).bind(userId).first();
    return result;
  } catch (error) {
    // Таблица может не существовать - создадим при первом запуске
    await createUserStatesTable(env);
    return null;
  }
}

async function setState(userId, state, data, env) {
  await createUserStatesTable(env);
  
  const dataJson = data ? JSON.stringify(data) : null;
  
  await env.DB.prepare(`
    INSERT OR REPLACE INTO user_states (user_id, state, data, updated_at)
    VALUES (?, ?, ?, datetime('now'))
  `).bind(userId, state, dataJson).run();
}

async function clearState(userId, env) {
  await env.DB.prepare(
    'DELETE FROM user_states WHERE user_id = ?'
  ).bind(userId).run();
}

async function createUserStatesTable(env) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS user_states (
      user_id INTEGER PRIMARY KEY,
      state TEXT NOT NULL,
      data TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
}

// ==================== КЛАВИАТУРЫ ====================

function getBossKeyboard() {
  return {
    keyboard: [
      ['➕ Создать задачу', '📅 Назначить встречу'],
      ['📆 Календарь', '⚠️ Просроченные'],
      ['📊 Задачи команды', '👥 Моя команда']
    ],
    resize_keyboard: true
  };
}

function getEmployeeKeyboard() {
  return {
    keyboard: [
      ['📋 Мои задачи'],
      ['📅 Мои встречи'],
      ['ℹ️ Помощь']
    ],
    resize_keyboard: true
  };
}

function getTaskActionsKeyboard(taskId, status, role) {
  const keyboard = { inline_keyboard: [] };
  
  if (role === 'employee' && status !== 'completed') {
    if (status === 'pending') {
      keyboard.inline_keyboard.push([
        { text: '▶️ Начать работу', callback_data: `task_${taskId}_in_progress` }
      ]);
    } else if (status === 'in_progress') {
      keyboard.inline_keyboard.push([
        { text: '✅ Завершить задачу', callback_data: `task_${taskId}_completed` }
      ]);
    }
  }
  
  keyboard.inline_keyboard.push([
    { text: '💬 Добавить комментарий', callback_data: `comment_${taskId}` }
  ]);
  
  if (role === 'boss') {
    keyboard.inline_keyboard.push([
      { text: '🗑 Удалить задачу', callback_data: `delete_task_${taskId}` }
    ]);
  }
  
  return keyboard;
}

function createCalendarKeyboard(year, month, prefix = 'cal') {
  const keyboard = { inline_keyboard: [] };
  
  const MONTHS_RU = [
    '', 'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
    'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
  ];
  
  // Заголовок
  keyboard.inline_keyboard.push([
    { text: '◀️', callback_data: `${prefix}_prev_${year}_${month}` },
    { text: `${MONTHS_RU[month]} ${year}`, callback_data: `${prefix}_ignore` },
    { text: '▶️', callback_data: `${prefix}_next_${year}_${month}` }
  ]);
  
  // Дни недели
  keyboard.inline_keyboard.push([
    { text: 'Пн', callback_data: `${prefix}_ignore` },
    { text: 'Вт', callback_data: `${prefix}_ignore` },
    { text: 'Ср', callback_data: `${prefix}_ignore` },
    { text: 'Чт', callback_data: `${prefix}_ignore` },
    { text: 'Пт', callback_data: `${prefix}_ignore` },
    { text: 'Сб', callback_data: `${prefix}_ignore` },
    { text: 'Вс', callback_data: `${prefix}_ignore` }
  ]);
  
  // Дни месяца (упрощённо - нужна реальная календарная логика)
  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDay = new Date(year, month - 1, 1).getDay();
  const today = new Date();
  
  let week = [];
  for (let i = 0; i < (firstDay === 0 ? 6 : firstDay - 1); i++) {
    week.push({ text: ' ', callback_data: `${prefix}_ignore` });
  }
  
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month - 1, day);
    
    if (date < today) {
      week.push({ text: '·', callback_data: `${prefix}_ignore` });
    } else if (date.toDateString() === today.toDateString()) {
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
      week.push({ text: ' ', callback_data: `${prefix}_ignore` });
    }
    keyboard.inline_keyboard.push(week);
  }
  
  // Кнопка пропустить
  keyboard.inline_keyboard.push([
    { text: '⏭ Без дедлайна', callback_data: 'skip_deadline' }
  ]);
  
  return keyboard;
}

function createTimePickerKeyboard(prefix = 'time') {
  const keyboard = { inline_keyboard: [] };
  
  const hours = ['09', '10', '11', '12', '13', '14', '15', '16', '17', '18'];
  
  for (let i = 0; i < hours.length; i += 2) {
    keyboard.inline_keyboard.push([
      { text: `${hours[i]}:00`, callback_data: `${prefix}_${hours[i]}_00` },
      { text: `${hours[i]}:30`, callback_data: `${prefix}_${hours[i]}_30` },
      { text: `${hours[i+1]}:00`, callback_data: `${prefix}_${hours[i+1]}_00` },
      { text: `${hours[i+1]}:30`, callback_data: `${prefix}_${hours[i+1]}_30` }
    ]);
  }
  
  return keyboard;
}

function createEmployeeSelectKeyboard(
  employees, 
  selected = [], 
  togglePrefix = 'toggle_emp',
  selectAllData = 'select_all',
  deselectAllData = 'deselect_all',
  confirmData = 'confirm_employees'
) {
  const keyboard = { inline_keyboard: [] };
  
  for (const emp of employees) {
    const isSelected = selected.includes(emp.id);
    const checkbox = isSelected ? '✅' : '⬜';
    const name = emp.first_name || emp.username;
    
    keyboard.inline_keyboard.push([
      { text: `${checkbox} ${name}`, callback_data: `${togglePrefix}_${emp.id}` }
    ]);
  }
  
  keyboard.inline_keyboard.push([
    { text: '✅ Выбрать всех', callback_data: selectAllData },
    { text: '❌ Снять всех', callback_data: deselectAllData }
  ]);
  
  if (selected.length > 0) {
    keyboard.inline_keyboard.push([
      { text: `📤 Назначить (${selected.length})`, callback_data: confirmData }
    ]);
  }
  
  return keyboard;
}

// ==================== TELEGRAM API ====================

async function sendMessage(chatId, text, env, keyboard = null) {
  const url = `https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`;
  const body = {
    chat_id: chatId,
    text: text,
    parse_mode: 'Markdown'
  };
  
  if (keyboard) {
    body.reply_markup = keyboard;
  }
  
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  } catch (error) {
    console.error('Error sending message:', error);
  }
}

async function editMessage(chatId, messageId, text, env, keyboard = null) {
  const url = `https://api.telegram.org/bot${env.BOT_TOKEN}/editMessageText`;
  const body = {
    chat_id: chatId,
    message_id: messageId,
    text: text,
    parse_mode: 'Markdown'
  };
  
  if (keyboard) {
    body.reply_markup = keyboard;
  }
  
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  } catch (error) {
    console.error('Error editing message:', error);
  }
}

async function answerCallbackQuery(callbackQueryId, env, text = null) {
  const url = `https://api.telegram.org/bot${env.BOT_TOKEN}/answerCallbackQuery`;
  const body = { callback_query_id: callbackQueryId };
  
  if (text) {
    body.text = text;
  }
  
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  } catch (error) {
    console.error('Error answering callback:', error);
  }
}

// ==================== УТИЛИТЫ ====================

function formatDeadline(deadline) {
  if (!deadline) return '';
  
  const date = new Date(deadline);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  
  return `${day}.${month}.${year} ${hours}:${minutes}`;
}

function formatDate(date) {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  
  return `${day}.${month}.${year}`;
}
