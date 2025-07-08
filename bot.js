import { Telegraf } from "telegraf";
import axios from "axios";
import fs from "fs";
import path from "path";

const bot = new Telegraf("8147984791:AAG-wpGksEE2g0bZDmeTXxf9VPtCct5K7dM");

// 1. Приветствие
bot.start((ctx) => ctx.reply("Бот работает!"));

// 2. Команда бронирования даты
bot.command("booking", async (ctx) => {
  // Пример: пользователь пишет /booking 2025-07-10
  const parts = ctx.message.text.split(" ");
  if (parts.length < 2) {
    return ctx.reply(
      "Пожалуйста, укажите дату в формате ГГГГ-ММ-ДД, например: /booking 2025-07-10",
    );
  }
  const date = parts[1];
  await axios.post(
    "https://script.google.com/macros/s/AKfycbyKCa3kdGmkYt_helZZ7oORyE56OL1krAmB1CE0qB4XOjfGpyJtdNuGmEdDPSkxMjV2lQ/exec?type=booking",
    {
      date,
      source: "telegram",
      comment: `Бронирование через Telegram от ${ctx.from.username || ctx.from.first_name || ""}`,
    },
  );
  await ctx.reply(`Дата ${date} забронирована!`);
});

// 3. Обработка callback-кнопок для отзывов
bot.on("callback_query", async (ctx) => {
  await ctx.answerCbQuery(); // Сразу отвечаем Telegram

  const data = ctx.callbackQuery.data;
  if (data.startsWith("publish_")) {
    const id = data.replace("publish_", "");
    await axios.get(
      `https://script.google.com/macros/s/AKfycbyKCa3kdGmkYt_helZZ7oORyE56OL1krAmB1CE0qB4XOjfGpyJtdNuGmEdDPSkxMjV2lQ/exec?action=reject&id=${id}`,
    );
    await ctx.reply("Отзыв отклонён.");
  }
});

// 4. Обработка фото для галереи
bot.on("photo", async (ctx) => {
  const caption = ctx.message.caption || "";
  if (
    caption.toLowerCase().includes("загрузить") ||
    caption.toLowerCase().includes("/загрузить")
  ) {
    const fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
    const file = await ctx.telegram.getFile(fileId);
    const fileUrl = `https://api.telegram.org/file/bot${bot.token}/${file.file_path}`;

    // Скачиваем файл
    const response = await axios.get(fileUrl, { responseType: "arraybuffer" });
    const base64 = Buffer.from(response.data, "binary").toString("base64");

    // Отправляем на Apps Script
    await axios.post(
      "https://script.google.com/macros/s/AKfycbyKCa3kdGmkYt_helZZ7oORyE56OL1krAmB1CE0qB4XOjfGpyJtdNuGmEdDPSkxMjV2lQ/exec?type=photo",
      {
        base64,
        filename: path.basename(file.file_path),
        contentType: "image/jpeg",
        uploader: ctx.from.username || ctx.from.first_name || "",
        caption,
      },
    );

    await ctx.reply("Фото успешно загружено в галерею сайта!");
  }
});

// 5. Логирование всех сообщений (опционально)
bot.on("message", (ctx) => {
  if (ctx.message.text) {
    console.log("Получено сообщение:", ctx.message.text);
  }
});

bot.launch();
