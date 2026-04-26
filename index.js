/**
 * Полный Telegram бот для Cloudflare Workers - ИСПРАВЛЕННАЯ ВЕРСИЯ
 * Все async/await исправлены + добавлено логирование
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    console.log(`📥 Request: ${request.method} ${url.pathname}`);
    
    // Webhook endpoint для Telegram
    if (url.pathname === '/webhook' && request.method === 'POST') {
      try {
        const update = await request.json();
        console.log('📨 Received update from Telegram');
        await handleTelegramUpdate(update, env);
        return new Response('OK', { status: 200 });
      } catch (error) {
        console.error('❌ Error handling update:', error.message);
        console.error('Stack:', error.stack);
        return new Response('Error: ' + error.message, { status: 500 });
      }
    }
    
    // Setup endpoint
    if (url.pathname === '/setup') {
      const webhookUrl = `${url.origin}/webhook`;
      const telegramApiUrl = `https://api.telegram.org/bot${env.BOT_TOKEN}/setWebhook`;
      
      console.log('🔗 Setting webhook to:', webhookUrl);
      
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
    
    return new Response('✅ Telegram Bot is running', { status: 200 });
  },
  
  // Cron trigger для напоминаний
  async scheduled(event, env, ctx) {
    console.log('⏰ Cron trigger started');
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
  const text = message.text || '';
  const userId = message.from.id;
  const username = message.from.username || '';
  const firstName = message.from.first_name || '';
  
  console.log(`👤 Message from ${userId} (${firstName}): "${text}"`);
  
  try {
    // Получаем пользователя и его состояние
    const user = await getUser(userId, env);
    const state = await getUserState(userId, env);
    
    console.log(`User found:`, user ? 'Yes' : 'No');
    console.log(`State:`, state ? state.state : 'None');
    
    // Обработка команд
    if (text === '/start') {
      await handleStart(chatId, userId, username, firstName, user, env);
      return;
    }
    
    // Обработка состояний (ConversationHandler)
    if (state && state.state) {
      console.log(`🔄 Processing state: ${state.state}`);
      await handleConversationState(chatId, userId, text, state, user, message, env);
      return;
    }
    
    // Обработка кнопок главного меню
    if (user) {
      await handleMenuButtons(chatId, userId, text, user, env);
    } else {
      await sendMessage(chatId, 'Пожалуйста, нажмите /start для начала работы', env);
    }
  } catch (error) {
    console.error('❌ Error in handleMessage:', error.message);
    console.error('Stack:', error.stack);
    await sendMessage(chatId, '❌ Произошла ошибка. Попробуйте позже.', env);
  }
}

async function handleCallbackQuery(callbackQuery, env) {
  const chatId = callbackQuery.message.chat.id;
  const messageId = callbackQuery.message.message_id;
  const data = callbackQuery.data;
  const userId = callbackQuery.from.id;
  const username = callbackQuery.from.username || '';
  const firstName = callbackQuery.from.first_name || '';
  
  console.log(`🖱️ Callback from ${userId}: ${data}`);
  
  try {
    await answerCallbackQuery(callbackQuery.id, env);
    
    const user = await getUser(userId, env);
    
    // Регистрация
    if (data === 'register_boss') {
      console.log('📝 Starting boss registration');
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
    
    // Пропустить дедлайн
    if (data === 'skip_deadline') {
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
    if (data.startsWith('task_')) {
      const parts = data.split('_');
      const taskId = parts[1];
      const action = parts[2];
      
      if (action === 'in' && parts[3] === 'progress') {
        await updateTaskStatus(taskId, 'in_progress', env);
        await sendMessage(chatId, '✅ Задача переведена в статус "В работе"', env);
        await handleViewTask(chatId, taskId, user, env);
      } else if (action === 'completed') {
        await updateTaskStatus(taskId, 'completed', env);
        await sendMessage(chatId, '🎉 Поздравляю! Задача завершена!', env);
        
        // Уведомляем босса
        const task = await getTask(taskId, env);
        if (task && task.created_by) {
          await sendMessage(
            task.created_by,
            `✅ Задача завершена!\n\n📋 ${task.title}\n👨‍💼 Исполнитель: ${firstName}`,
            env
          );
        }
        
        await handleViewTask(chatId, taskId, user, env);
      }
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
    
    if (data === 'back_to_main') {
      const keyboard = user && user.role === 'boss' ? getBossKeyboard() : getEmployeeKeyboard();
      await sendMessage(chatId, '🏠 Главное меню:', env, keyboard);
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
    
    if (data === 'mselect_all') {
      await handleSelectAllMeetingParticipants(chatId, messageId, userId, env);
      return;
    }
    
    if (data === 'mdeselect_all') {
      await handleDeselectAllMeetingParticipants(chatId, messageId, userId, env);
      return;
    }
    
    if (data === 'mconfirm_participants') {
      await handleConfirmMeetingParticipants(chatId, messageId, userId, user, env);
      return;
    }
    
  } catch (error) {
    console.error('❌ Error in handleCallbackQuery:', error.message);
    console.error('Stack:', error.stack);
    await sendMessage(chatId, '❌ Произошла ошибка. Попробуйте позже.', env);
  }
}

// ==================== СОСТОЯНИЯ (ConversationHandler) ====================

async function handleConversationState(chatId, userId, text, state, user, message, env) {
  const stateName = state.state;
  const stateData = state.data ? JSON.parse(state.data) : {};
  
  console.log(`🔄 Handling state: ${stateName}, data:`, stateData);
  
  try {
    switch (stateName) {
      case 'CREATE_ORG':
        console.log('📝 Creating organization:', text);
        await handleCreateOrg(chatId, userId, text, message.from, env);
        break;
        
      case 'CREATE_TASK_DESC':
        console.log('📝 Setting task description');
        await setState(userId, 'CREATE_TASK_DEADLINE', { description: text }, env);
        const calendar = createCalendarKeyboard(new Date().getFullYear(), new Date().getMonth() + 1);
        await sendMessage(chatId, '📅 Выберите дедлайн задачи:', env, calendar);
        break;
        
      case 'ADD_COMMENT':
        console.log('💬 Adding comment to task:', stateData.taskId);
        await handleSaveComment(chatId, userId, text, stateData.taskId, user, env);
        break;
        
      case 'ENTER_ORG_CODE':
        console.log('🔑 Entering org code:', text);
        await handleEnterOrgCode(chatId, userId, text, message.from, env);
        break;
        
      case 'ENTER_PHONE':
        const phone = message.contact ? message.contact.phone_number : text;
        console.log('📱 Entering phone:', phone);
        await handleEnterPhone(chatId, userId, phone, stateData, message.from, env);
        break;
        
      case 'MEETING_TITLE':
        console.log('📅 Setting meeting title');
        await setState(userId, 'MEETING_DATE', { title: text }, env);
        const meetingCal = createCalendarKeyboard(new Date().getFullYear(), new Date().getMonth() + 1, 'mcal');
        await sendMessage(chatId, '📅 Выберите дату встречи:', env, meetingCal);
        break;
        
      case 'MEETING_LOCATION':
        console.log('📍 Setting meeting location');
        await handleMeetingLocation(chatId, userId, text, stateData, user, env);
        break;
        
      default:
        console.log('⚠️ Unknown state:', stateName);
        await clearState(userId, env);
        await sendMessage(chatId, 'Что-то пошло не так. Попробуйте снова.', env);
    }
  } catch (error) {
    console.error('❌ Error in handleConversationState:', error.message);
    console.error('Stack:', error.stack);
    await clearState(userId, env);
    await sendMessage(chatId, '❌ Произошла ошибка. Попробуйте снова.', env);
  }
}

// ==================== ОБРАБОТЧИКИ ДЕЙСТВИЙ ====================

async function handleStart(chatId, userId, username, firstName, user, env) {
  console.log('🚀 Handling /start for user:', userId);
  
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
  
  console.log(`📱 Menu button pressed: "${text}" by ${role}`);
  
  try {
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
    
    console.log('⚠️ Unknown menu button:', text);
  } catch (error) {
    console.error('❌ Error in handleMenuButtons:', error.message);
    await sendMessage(chatId, '❌ Произошла ошибка. Попробуйте позже.', env);
  }
}

async function handleCreateOrg(chatId, userId, orgName, userFrom, env) {
  console.log(`🏢 Creating organization "${orgName}" for user ${userId}`);
  
  try {
    const result = await createOrganization(orgName, env);
    console.log('✅ Organization created:', result);
    
    await addUser(userId, userFrom.username, userFrom.first_name, 'boss', result.orgId, env);
    console.log('✅ User added as boss');
    
    await clearState(userId, env);
    
    const keyboard = getBossKeyboard();
    await sendMessage(
      chatId,
      `✅ Организация **${orgName}** создана!\n\n🔑 Код для сотрудников: \`${result.paymentCode}\`\n\nТеперь вы можете создавать задачи и приглашать сотрудников.`,
      env,
      keyboard
    );
  } catch (error) {
    console.error('❌ Error creating organization:', error.message);
    console.error('Stack:', error.stack);
    await clearState(userId, env);
    await sendMessage(chatId, '❌ Ошибка при создании организации. Попробуйте снова с /start', env);
  }
}

async function handleSaveComment(chatId, userId, commentText, taskId, user, env) {
  try {
    await addComment(taskId, userId, commentText, env);
    await clearState(userId, env);
    await sendMessage(chatId, '✅ Комментарий добавлен!', env);
    await handleViewTask(chatId, taskId, user, env);
  } catch (error) {
    console.error('❌ Error saving comment:', error.message);
    await sendMessage(chatId, '❌ Ошибка при добавлении комментария', env);
  }
}

async function handleEnterOrgCode(chatId, userId, code, userFrom, env) {
  console.log(`🔑 Checking org code: ${code}`);
  
  try {
    const orgId = await getOrgIdByCode(code, env);
    
    if (!orgId) {
      await sendMessage(chatId, '❌ Неверный код организации. Попробуйте ещё раз:', env);
      return;
    }
    
    console.log('✅ Org found:', orgId);
    
    await setState(userId, 'ENTER_PHONE', { orgId, code }, env);
    
    const keyboard = {
      keyboard: [[{ text: '📱 Отправить номер', request_contact: true }]],
      resize_keyboard: true,
      one_time_keyboard: true
    };
    
    await sendMessage(chatId, '📱 Отправьте ваш номер телефона:', env, keyboard);
  } catch (error) {
    console.error('❌ Error in handleEnterOrgCode:', error.message);
    await sendMessage(chatId, '❌ Ошибка. Попробуйте снова.', env);
  }
}

async function handleEnterPhone(chatId, userId, phone, stateData, userFrom, env) {
  console.log(`📱 Creating join request for user ${userId}, org ${stateData.orgId}`);
  
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
  } catch (error) {
    console.error('❌ Error in handleEnterPhone:', error.message);
    await sendMessage(chatId, '❌ Ошибка при отправке заявки', env);
  }
}

// ==================== ПРОСМОТР ДАННЫХ ====================

async function handleViewTask(chatId, taskId, user, env) {
  try {
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
  } catch (error) {
    console.error('❌ Error in handleViewTask:', error.message);
    await sendMessage(chatId, '❌ Ошибка при загрузке задачи', env);
  }
}

async function handleShowMyTasks(chatId, userId, env) {
  try {
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
      
      const displayTitle = task.title.length > 30 ? task.title.substring(0, 30) + '...' : task.title;
      keyboard.inline_keyboard.push([{
        text: `📖 ${displayTitle}`,
        callback_data: `view_task_${task.id}`
      }]);
    }
    
    await sendMessage(chatId, text, env, keyboard);
  } catch (error) {
    console.error('❌ Error in handleShowMyTasks:', error.message);
    await sendMessage(chatId, '❌ Ошибка при загрузке задач', env);
  }
}

async function handleShowTeamTasks(chatId, user, env) {
  try {
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
      
      const displayTitle = task.title.length > 30 ? task.title.substring(0, 30) + '...' : task.title;
      keyboard.inline_keyboard.push([{
        text: `📖 ${displayTitle}`,
        callback_data: `view_task_${task.id}`
      }]);
    }
    
    await sendMessage(chatId, text, env, keyboard);
  } catch (error) {
    console.error('❌ Error in handleShowTeamTasks:', error.message);
    await sendMessage(chatId, '❌ Ошибка при загрузке задач команды', env);
  }
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
  try {
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
  } catch (error) {
    console.error('❌ Error in handleShowEmployeesList:', error.message);
    await sendMessage(chatId, '❌ Ошибка при загрузке списка сотрудников', env);
  }
}

async function handleShowOrgCode(chatId, user, env) {
  try {
    const org = await getOrgInfo(user.org_id, env);
    
    if (!org) {
      await sendMessage(chatId, '❌ Организация не найдена', env);
      return;
    }
    
    await sendMessage(
      chatId,
      `🔑 **Код вашей организации:**\n\n\`${org.payment_code}\`\n\nОтправьте этот код сотрудникам для присоединения.`,
      env
    );
  } catch (error) {
    console.error('❌ Error in handleShowOrgCode:', error.message);
    await sendMessage(chatId, '❌ Ошибка при получении кода организации', env);
  }
}

async function handleShowPendingRequests(chatId, user, env) {
  try {
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
  } catch (error) {
    console.error('❌ Error in handleShowPendingRequests:', error.message);
    await sendMessage(chatId, '❌ Ошибка при загрузке заявок', env);
  }
}

async function handleApproveRequest(chatId, requestId, env) {
  try {
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
    } else {
      await sendMessage(chatId, '❌ Ошибка при одобрении заявки', env);
    }
  } catch (error) {
    console.error('❌ Error in handleApproveRequest:', error.message);
    await sendMessage(chatId, '❌ Ошибка при одобрении заявки', env);
  }
}

async function handleRejectRequest(chatId, requestId, env) {
  try {
    const userId = await rejectJoinRequest(requestId, env);
    
    await sendMessage(chatId, '❌ Заявка отклонена', env);
    
    if (userId) {
      await sendMessage(userId, '😔 К сожалению, ваша заявка была отклонена.', env);
    }
  } catch (error) {
    console.error('❌ Error in handleRejectRequest:', error.message);
    await sendMessage(chatId, '❌ Ошибка при отклонении заявки', env);
  }
}

async function handleShowCalendar(chatId, user, env) {
  try {
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
  } catch (error) {
    console.error('❌ Error in handleShowCalendar:', error.message);
    await sendMessage(chatId, '❌ Ошибка при загрузке календаря', env);
  }
}

async function handleShowOverdueTasks(chatId, user, env) {
  try {
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
      
      const displayTitle = task.title.length > 30 ? task.title.substring(0, 30) + '...' : task.title;
      keyboard.inline_keyboard.push([{
        text: `📖 ${displayTitle}`,
        callback_data: `view_task_${task.id}`
      }]);
    }
    
    await sendMessage(chatId, text, env, keyboard);
  } catch (error) {
    console.error('❌ Error in handleShowOverdueTasks:', error.message);
    await sendMessage(chatId, '❌ Ошибка при загрузке просроченных задач', env);
  }
}

async function handleShowMyMeetings(chatId, userId, env) {
  try {
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
  } catch (error) {
    console.error('❌ Error in handleShowMyMeetings:', error.message);
    await sendMessage(chatId, '❌ Ошибка при загрузке встреч', env);
  }
}

// ==================== КАЛЕНДАРЬ ====================

async function handleCalendarCallback(chatId, messageId, data, userId, env) {
  try {
    const parts = data.split('_');
    const action = parts[1];
    
    if (action === 'day') {
      const year = parseInt(parts[2]);
      const month = parseInt(parts[3]);
      const day = parseInt(parts[4]);
      
      const state = await getUserState(userId, env);
      const stateData = state && state.data ? JSON.parse(state.data) : {};
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
  } catch (error) {
    console.error('❌ Error in handleCalendarCallback:', error.message);
  }
}

async function handleTimePickerCallback(chatId, messageId, data, userId, env) {
  try {
    const state = await getUserState(userId, env);
    const stateData = state && state.data ? JSON.parse(state.data) : {};
    
    if (data === 'skip_deadline') {
      stateData.deadline = null;
    } else {
      const parts = data.split('_');
      const hour = parts[1];
      const minute = parts[2];
      
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
  } catch (error) {
    console.error('❌ Error in handleTimePickerCallback:', error.message);
  }
}

async function handleToggleEmployee(chatId, messageId, data, userId, env) {
  try {
    const empId = parseInt(data.split('_')[2]);
    
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
    
    await editMessage(chatId, messageId, '👥 Выберите исполнителей:', env, keyboard);
  } catch (error) {
    console.error('❌ Error in handleToggleEmployee:', error.message);
  }
}

async function handleSelectAllEmployees(chatId, messageId, userId, env) {
  try {
    const state = await getUserState(userId, env);
    const stateData = state && state.data ? JSON.parse(state.data) : {};
    
    const user = await getUser(userId, env);
    const employees = await getOrgEmployees(user.org_id, env);
    
    stateData.selectedEmployees = employees.map(e => e.id);
    await setState(userId, state.state, stateData, env);
    
    const keyboard = createEmployeeSelectKeyboard(employees, stateData.selectedEmployees);
    await editMessage(chatId, messageId, '👥 Выберите исполнителей:', env, keyboard);
  } catch (error) {
    console.error('❌ Error in handleSelectAllEmployees:', error.message);
  }
}

async function handleDeselectAllEmployees(chatId, messageId, userId, env) {
  try {
    const state = await getUserState(userId, env);
    const stateData = state && state.data ? JSON.parse(state.data) : {};
    
    stateData.selectedEmployees = [];
    await setState(userId, state.state, stateData, env);
    
    const user = await getUser(userId, env);
    const employees = await getOrgEmployees(user.org_id, env);
    const keyboard = createEmployeeSelectKeyboard(employees, []);
    
    await editMessage(chatId, messageId, '👥 Выберите исполнителей:', env, keyboard);
  } catch (error) {
    console.error('❌ Error in handleDeselectAllEmployees:', error.message);
  }
}

async function handleConfirmEmployees(chatId, messageId, userId, user, env) {
  try {
    const state = await getUserState(userId, env);
    const stateData = state && state.data ? JSON.parse(state.data) : {};
    
    if (!stateData.selectedEmployees || stateData.selectedEmployees.length === 0) {
      await sendMessage(chatId, '❌ Выберите хотя бы одного сотрудника', env);
      return;
    }
    
    console.log(`📝 Creating tasks for ${stateData.selectedEmployees.length} employees`);
    
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
  } catch (error) {
    console.error('❌ Error in handleConfirmEmployees:', error.message);
    await sendMessage(chatId, '❌ Ошибка при создании задач', env);
  }
}

// ==================== ВСТРЕЧИ ====================

async function handleMeetingCalendarCallback(chatId, messageId, data, userId, env) {
  try {
    const parts = data.split('_');
    const action = parts[1];
    
    if (action === 'day') {
      const year = parseInt(parts[2]);
      const month = parseInt(parts[3]);
      const day = parseInt(parts[4]);
      
      const state = await getUserState(userId, env);
      const stateData = state && state.data ? JSON.parse(state.data) : {};
      stateData.year = year;
      stateData.month = month;
      stateData.day = day;
      
      const keyboard = createTimePickerKeyboard('mtime');
      await editMessage(chatId, messageId, '⏰ Выберите время встречи:', env, keyboard);
      await setState(userId, 'MEETING_TIME', stateData, env);
    } else if (action === 'prev' || action === 'next') {
      let year = parseInt(parts[2]);
      let month = parseInt(parts[3]);
      
      if (action === 'prev') {
        month--;
        if (month === 0) { month = 12; year--; }
      } else {
        month++;
        if (month === 13) { month = 1; year++; }
      }
      
      const calendar = createCalendarKeyboard(year, month, 'mcal');
      await editMessage(chatId, messageId, '📅 Выберите дату встречи:', env, calendar);
    }
  } catch (error) {
    console.error('❌ Error in handleMeetingCalendarCallback:', error.message);
  }
}

async function handleMeetingTimeCallback(chatId, messageId, data, userId, env) {
  try {
    const state = await getUserState(userId, env);
    const stateData = state && state.data ? JSON.parse(state.data) : {};
    
    const parts = data.split('_');
    const hour = parts[1];
    const minute = parts[2];
    
    const datetime = new Date(stateData.year, stateData.month - 1, stateData.day, parseInt(hour), parseInt(minute));
    stateData.datetime = datetime.toISOString().slice(0, 16).replace('T', ' ');
    
    await setState(userId, 'MEETING_LOCATION', stateData, env);
    await sendMessage(chatId, '📍 Введите место проведения встречи (или "Пропустить"):', env);
  } catch (error) {
    console.error('❌ Error in handleMeetingTimeCallback:', error.message);
  }
}

async function handleMeetingLocation(chatId, userId, location, stateData, user, env) {
  try {
    stateData.location = location === 'Пропустить' ? null : location;
    
    await setState(userId, 'MEETING_PARTICIPANTS', stateData, env);
    
    const employees = await getOrgEmployees(user.org_id, env);
    const keyboard = createEmployeeSelectKeyboard(employees, [], 'mtoggle', 'mselect_all', 'mdeselect_all', 'mconfirm_participants');
    
    await sendMessage(chatId, '👥 Выберите участников встречи:', env, keyboard);
  } catch (error) {
    console.error('❌ Error in handleMeetingLocation:', error.message);
  }
}

async function handleToggleMeetingParticipant(chatId, messageId, data, userId, env) {
  try {
    const empId = parseInt(data.split('_')[1]);
    
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
    const keyboard = createEmployeeSelectKeyboard(employees, stateData.selectedEmployees, 'mtoggle', 'mselect_all', 'mdeselect_all', 'mconfirm_participants');
    
    await editMessage(chatId, messageId, '👥 Выберите участников встречи:', env, keyboard);
  } catch (error) {
    console.error('❌ Error in handleToggleMeetingParticipant:', error.message);
  }
}

async function handleSelectAllMeetingParticipants(chatId, messageId, userId, env) {
  try {
    const state = await getUserState(userId, env);
    const stateData = state && state.data ? JSON.parse(state.data) : {};
    
    const user = await getUser(userId, env);
    const employees = await getOrgEmployees(user.org_id, env);
    
    stateData.selectedEmployees = employees.map(e => e.id);
    await setState(userId, state.state, stateData, env);
    
    const keyboard = createEmployeeSelectKeyboard(employees, stateData.selectedEmployees, 'mtoggle', 'mselect_all', 'mdeselect_all', 'mconfirm_participants');
    await editMessage(chatId, messageId, '👥 Выберите участников встречи:', env, keyboard);
  } catch (error) {
    console.error('❌ Error in handleSelectAllMeetingParticipants:', error.message);
  }
}

async function handleDeselectAllMeetingParticipants(chatId, messageId, userId, env) {
  try {
    const state = await getUserState(userId, env);
    const stateData = state && state.data ? JSON.parse(state.data) : {};
    
    stateData.selectedEmployees = [];
    await setState(userId, state.state, stateData, env);
    
    const user = await getUser(userId, env);
    const employees = await getOrgEmployees(user.org_id, env);
    const keyboard = createEmployeeSelectKeyboard(employees, [], 'mtoggle', 'mselect_all', 'mdeselect_all', 'mconfirm_participants');
    
    await editMessage(chatId, messageId, '👥 Выберите участников встречи:', env, keyboard);
  } catch (error) {
    console.error('❌ Error in handleDeselectAllMeetingParticipants:', error.message);
  }
}

async function handleConfirmMeetingParticipants(chatId, messageId, userId, user, env) {
  try {
    const state = await getUserState(userId, env);
    const stateData = state && state.data ? JSON.parse(state.data) : {};
    
    if (!stateData.selectedEmployees || stateData.selectedEmployees.length === 0) {
      await sendMessage(chatId, '❌ Выберите хотя бы одного участника', env);
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
  } catch (error) {
    console.error('❌ Error in handleConfirmMeetingParticipants:', error.message);
    await sendMessage(chatId, '❌ Ошибка при создании встречи', env);
  }
}

// ==================== НАПОМИНАНИЯ (CRON) ====================

async function checkReminders(env) {
  console.log('⏰ Checking reminders...');
  
  try {
    await checkTaskReminders(env);
    await checkMeetingReminders(env);
  } catch (error) {
    console.error('❌ Error in checkReminders:', error.message);
  }
}

async function checkTaskReminders(env) {
  try {
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
          console.log(`✅ Sent 1-day reminder to employee ${task.assigned_to} for task ${task.id}`);
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
          console.log(`✅ Sent 2-hour reminder to boss ${task.created_by} for task ${task.id}`);
        }
      }
    }
  } catch (error) {
    console.error('❌ Error in checkTaskReminders:', error.message);
  }
}

async function checkMeetingReminders(env) {
  try {
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
          console.log(`✅ Sent 1-hour meeting reminder for meeting ${meeting.id}`);
        }
      }
    }
  } catch (error) {
    console.error('❌ Error in checkMeetingReminders:', error.message);
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
    console.error('❌ Error getting user:', error.message);
    return null;
  }
}

async function addUser(userId, username, firstName, role, orgId, env) {
  try {
    await env.DB.prepare(`
      INSERT OR REPLACE INTO users (id, username, first_name, role, org_id)
      VALUES (?, ?, ?, ?, ?)
    `).bind(userId, username, firstName, role, orgId).run();
    
    console.log(`✅ User ${userId} added/updated as ${role}`);
  } catch (error) {
    console.error('❌ Error adding user:', error.message);
    throw error;
  }
}

async function createOrganization(name, env) {
  try {
    // Генерируем уникальный 6-значный код
    let code;
    let attempts = 0;
    
    while (attempts < 10) {
      code = Math.floor(100000 + Math.random() * 900000).toString();
      
      // Проверяем уникальность
      const existing = await env.DB.prepare(
        'SELECT id FROM organizations WHERE payment_code = ?'
      ).bind(code).first();
      
      if (!existing) {
        break;
      }
      
      attempts++;
    }
    
    if (attempts >= 10) {
      throw new Error('Failed to generate unique org code');
    }
    
    console.log(`🏢 Creating organization "${name}" with code ${code}`);
    
    const result = await env.DB.prepare(
      'INSERT INTO organizations (name, payment_code) VALUES (?, ?)'
    ).bind(name, code).run();
    
    const orgId = result.meta.last_row_id;
    
    console.log(`✅ Organization created with ID: ${orgId}`);
    
    return { orgId, paymentCode: code };
  } catch (error) {
    console.error('❌ Error creating organization:', error.message);
    throw error;
  }
}

async function getOrgIdByCode(code, env) {
  try {
    const result = await env.DB.prepare(
      'SELECT id FROM organizations WHERE payment_code = ?'
    ).bind(code).first();
    
    return result ? result.id : null;
  } catch (error) {
    console.error('❌ Error getting org by code:', error.message);
    return null;
  }
}

async function getOrgInfo(orgId, env) {
  try {
    return await env.DB.prepare(
      'SELECT * FROM organizations WHERE id = ?'
    ).bind(orgId).first();
  } catch (error) {
    console.error('❌ Error getting org info:', error.message);
    return null;
  }
}

async function getOrgEmployees(orgId, env) {
  try {
    const result = await env.DB.prepare(`
      SELECT id, username, first_name FROM users 
      WHERE org_id = ? AND role = 'employee'
    `).bind(orgId).all();
    
    return result.results;
  } catch (error) {
    console.error('❌ Error getting org employees:', error.message);
    return [];
  }
}

async function getOrgBossId(orgId, env) {
  try {
    const result = await env.DB.prepare(
      'SELECT id FROM users WHERE org_id = ? AND role = ?'
    ).bind(orgId, 'boss').first();
    
    return result ? result.id : null;
  } catch (error) {
    console.error('❌ Error getting org boss:', error.message);
    return null;
  }
}

async function createTask(title, description, deadline, createdBy, assignedTo, orgId, env) {
  try {
    await env.DB.prepare(`
      INSERT INTO tasks (title, description, deadline, created_by, assigned_to, org_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(title, description, deadline, createdBy, assignedTo, orgId).run();
    
    console.log(`✅ Task created for employee ${assignedTo}`);
  } catch (error) {
    console.error('❌ Error creating task:', error.message);
    throw error;
  }
}

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
    console.error('❌ Error getting task:', error.message);
    return null;
  }
}

async function getEmployeeTasks(userId, env) {
  try {
    const result = await env.DB.prepare(`
      SELECT id, title, description, deadline, status 
      FROM tasks WHERE assigned_to = ?
      ORDER BY created_at DESC
    `).bind(userId).all();
    
    return result.results;
  } catch (error) {
    console.error('❌ Error getting employee tasks:', error.message);
    return [];
  }
}

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
  } catch (error) {
    console.error('❌ Error getting filtered tasks:', error.message);
    return [];
  }
}

async function updateTaskStatus(taskId, status, env) {
  try {
    await env.DB.prepare(
      'UPDATE tasks SET status = ? WHERE id = ?'
    ).bind(status, taskId).run();
    
    console.log(`✅ Task ${taskId} status updated to ${status}`);
  } catch (error) {
    console.error('❌ Error updating task status:', error.message);
    throw error;
  }
}

async function deleteTaskFromDB(taskId, env) {
  try {
    await env.DB.prepare('DELETE FROM reminders_sent WHERE task_id = ?').bind(taskId).run();
    await env.DB.prepare('DELETE FROM comments WHERE task_id = ?').bind(taskId).run();
    await env.DB.prepare('DELETE FROM tasks WHERE id = ?').bind(taskId).run();
    
    console.log(`✅ Task ${taskId} deleted`);
  } catch (error) {
    console.error('❌ Error deleting task:', error.message);
    throw error;
  }
}

async function addComment(taskId, userId, commentText, env) {
  try {
    await env.DB.prepare(
      'INSERT INTO comments (task_id, user_id, comment_text) VALUES (?, ?, ?)'
    ).bind(taskId, userId, commentText).run();
    
    console.log(`✅ Comment added to task ${taskId}`);
  } catch (error) {
    console.error('❌ Error adding comment:', error.message);
    throw error;
  }
}

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
    console.error('❌ Error getting task comments:', error.message);
    return [];
  }
}

async function createJoinRequest(userId, username, firstName, phone, orgId, env) {
  try {
    await env.DB.prepare(`
      INSERT INTO join_requests (user_id, username, first_name, phone, org_id, status)
      VALUES (?, ?, ?, ?, ?, 'pending')
    `).bind(userId, username, firstName, phone, orgId).run();
    
    console.log(`✅ Join request created for user ${userId} to org ${orgId}`);
  } catch (error) {
    console.error('❌ Error creating join request:', error.message);
    throw error;
  }
}

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
    console.error('❌ Error getting pending requests:', error.message);
    return [];
  }
}

async function approveJoinRequest(requestId, env) {
  try {
    const request = await env.DB.prepare(
      'SELECT user_id, username, first_name, org_id FROM join_requests WHERE id = ?'
    ).bind(requestId).first();
    
    if (!request) return null;
    
    await addUser(request.user_id, request.username, request.first_name, 'employee', request.org_id, env);
    
    await env.DB.prepare(
      'UPDATE join_requests SET status = ? WHERE id = ?'
    ).bind('approved', requestId).run();
    
    console.log(`✅ Join request ${requestId} approved`);
    
    return { userId: request.user_id, orgId: request.org_id };
  } catch (error) {
    console.error('❌ Error approving join request:', error.message);
    return null;
  }
}

async function rejectJoinRequest(requestId, env) {
  try {
    const request = await env.DB.prepare(
      'SELECT user_id FROM join_requests WHERE id = ?'
    ).bind(requestId).first();
    
    await env.DB.prepare(
      'UPDATE join_requests SET status = ? WHERE id = ?'
    ).bind('rejected', requestId).run();
    
    console.log(`✅ Join request ${requestId} rejected`);
    
    return request ? request.user_id : null;
  } catch (error) {
    console.error('❌ Error rejecting join request:', error.message);
    return null;
  }
}

async function createMeeting(title, description, datetime, location, createdBy, orgId, participants, env) {
  try {
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
    
    console.log(`✅ Meeting created with ${participants.length} participants`);
  } catch (error) {
    console.error('❌ Error creating meeting:', error.message);
    throw error;
  }
}

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
    `).bind(orgId, startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0]).all();
    
    return result.results;
  } catch (error) {
    console.error('❌ Error getting week tasks:', error.message);
    return [];
  }
}

async function getWeekMeetings(orgId, startDate, endDate, env) {
  try {
    const result = await env.DB.prepare(`
      SELECT m.id, m.title, m.meeting_datetime, m.location
      FROM meetings m
      WHERE m.org_id = ? 
      AND date(m.meeting_datetime) BETWEEN date(?) AND date(?)
      ORDER BY m.meeting_datetime ASC
    `).bind(orgId, startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0]).all();
    
    return result.results;
  } catch (error) {
    console.error('❌ Error getting week meetings:', error.message);
    return [];
  }
}

async function getOverdueTasks(orgId, env) {
  try {
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
  } catch (error) {
    console.error('❌ Error getting overdue tasks:', error.message);
    return [];
  }
}

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
    console.error('❌ Error getting employee meetings:', error.message);
    return [];
  }
}

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
    console.error('❌ Error getting meeting participants:', error.message);
    return [];
  }
}

async function wasReminderSent(taskId, meetingId, reminderType, env) {
  try {
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
  } catch (error) {
    console.error('❌ Error checking reminder:', error.message);
    return false;
  }
}

async function markReminderSent(taskId, meetingId, reminderType, env) {
  try {
    await env.DB.prepare(
      'INSERT INTO reminders_sent (task_id, meeting_id, reminder_type) VALUES (?, ?, ?)'
    ).bind(taskId, meetingId, reminderType).run();
  } catch (error) {
    console.error('❌ Error marking reminder sent:', error.message);
  }
}

// ==================== STATE MANAGEMENT ====================

async function getUserState(userId, env) {
  try {
    const result = await env.DB.prepare(
      'SELECT * FROM user_states WHERE user_id = ?'
    ).bind(userId).first();
    return result;
  } catch (error) {
    // Таблица может не существовать - создадим
    await createUserStatesTable(env);
    return null;
  }
}

async function setState(userId, state, data, env) {
  try {
    await createUserStatesTable(env);
    
    const dataJson = data ? JSON.stringify(data) : null;
    
    await env.DB.prepare(`
      INSERT OR REPLACE INTO user_states (user_id, state, data, updated_at)
      VALUES (?, ?, ?, datetime('now'))
    `).bind(userId, state, dataJson).run();
    
    console.log(`✅ State set for user ${userId}: ${state}`);
  } catch (error) {
    console.error('❌ Error setting state:', error.message);
    throw error;
  }
}

async function clearState(userId, env) {
  try {
    await env.DB.prepare(
      'DELETE FROM user_states WHERE user_id = ?'
    ).bind(userId).run();
    
    console.log(`✅ State cleared for user ${userId}`);
  } catch (error) {
    console.error('❌ Error clearing state:', error.message);
  }
}

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
    // Таблица уже существует - игнорируем
  }
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
  
  // Дни месяца
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
  
  // Кнопка пропустить (только для задач)
  if (prefix === 'cal') {
    keyboard.inline_keyboard.push([
      { text: '⏭ Без дедлайна', callback_data: 'skip_deadline' }
    ]);
  }
  
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
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    
    const result = await response.json();
    
    if (!result.ok) {
      console.error('❌ Telegram API error:', result);
    }
    
    return result;
  } catch (error) {
    console.error('❌ Error sending message:', error.message);
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
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    
    const result = await response.json();
    
    if (!result.ok) {
      console.error('❌ Telegram API error:', result);
    }
    
    return result;
  } catch (error) {
    console.error('❌ Error editing message:', error.message);
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
    console.error('❌ Error answering callback:', error.message);
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
