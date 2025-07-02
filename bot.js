const { Telegraf } = require('telegraf');
const axios = require('axios');

const bot = new Telegraf('8147984791:AAG-wpGksEE2g0bZDmeTXxf9VPtCct5K7dM');

// 1. Обработка заявок на бронирование (пример)
bot.command('booking', async (ctx) => {
  // Здесь твоя логика отправки заявки заказчику
  // Например, ctx.reply('Новая заявка на бронирование...');
});

// 2. Обработка callback-кнопок для отзывов
bot.on('callback_query', async (ctx) => {
  const data = ctx.callbackQuery.data;
  if (data.startsWith('publish_')) {
    const id = data.replace('publish_', '');
    // Вызов Google Apps Script для публикации
    await axios.get(`https://script.google.com/macros/s/AKfycbxq2vcx2TWWPTSyE92tBaqKTrLZw9Z3kphAa9SVYKoEAgU87xc71fTPn9p4WCYZv8smvw/exec{id}`);
    await ctx.reply('Отзыв опубликован!');
  } else if (data.startsWith('reject_')) {
    const id = data.replace('reject_', '');
    await axios.get(`https://script.google.com/macros/s/AKfycbxq2vcx2TWWPTSyE92tBaqKTrLZw9Z3kphAa9SVYKoEAgU87xc71fTPn9p4WCYZv8smvw/exec{id}`);
    await ctx.reply('Отзыв отклонён.');
  }
  ctx.answerCbQuery();
});

// 3. (Опционально) Обработка фото для галереи
bot.on('photo', async (ctx) => {
  // Получаем файл
  const fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
  // Получаем ссылку на файл
  const file = await ctx.telegram.getFile(fileId);
  const fileUrl = `https://api.telegram.org/file/bot${bot.token}/${file.file_path}`;
  // Здесь твоя логика загрузки фото на сайт/Google Drive/Sheets
  // Например, отправить ссылку в Google Таблицу или Object Storage
  await ctx.reply('Фото получено и отправлено на сайт!');
});

bot.launch();