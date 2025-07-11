import express from "express";
import cors from "cors";
import { Telegraf, Markup } from "telegraf";
import axios from "axios";
import fs from "fs";
import path from "path";

// 1. Настройка Express
const app = express();
app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://semshow.ru',
    'https://semshow.ru'
  ],
  credentials: true
}));
app.use(express.json());

// 2. Настройка Telegram-бота
const bot = new Telegraf("8147984791:AAG-wpGksEE2g0bZDmeTXxf9VPtCct5K7dM");
const ADMIN_CHAT_ID = "532377079"; // chat_id заказчика
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyKCa3kdGmkYt_helZZ7oORyE56OL1krAmB1CE0qB4XOjfGpyJtdNuGmEdDPSkxMjV2lQ/exec";

// --- Твои обработчики бота ---
bot.start((ctx) => ctx.reply("Бот работает!"));

// Команда бронирования даты
bot.command("booking", async (ctx) => {
  const parts = ctx.message.text.split(" ");
  if (parts.length < 2) {
    return ctx.reply(
      "Пожалуйста, укажите дату в формате ГГГГ-ММ-ДД, например: /booking 2025-07-10",
    );
  }
  const date = parts[1];
  await axios.post(
    `${GOOGLE_SCRIPT_URL}?type=booking`,
    {
      date,
      source: "telegram",
      comment: `Бронирование через Telegram от ${ctx.from.username || ctx.from.first_name || ""}`,
    },
  );
  await ctx.reply(`Дата ${date} забронирована!`);
});

// Callback-кнопки для отзывов
bot.on("callback_query", async (ctx) => {
  await ctx.answerCbQuery();
  const data = ctx.callbackQuery.data;
  if (data.startsWith("publish_")) {
    const id = data.replace("publish_", "");
    // Меняем статус на published
    await axios.get(`${GOOGLE_SCRIPT_URL}?action=publish&id=${id}`);
    await ctx.editMessageReplyMarkup(); // убираем кнопки
    await ctx.reply("Отзыв опубликован и теперь виден на сайте!");
  } else if (data.startsWith("reject_")) {
    const id = data.replace("reject_", "");
    // Удаляем отзыв
    await axios.get(`${GOOGLE_SCRIPT_URL}?action=reject&id=${id}`);
    await ctx.editMessageReplyMarkup(); // убираем кнопки
    await ctx.reply("Отзыв отклонён и удалён из таблицы.");
  }
});

// Фото для галереи
bot.on("photo", async (ctx) => {
  const caption = ctx.message.caption || "";
  if (
    caption.toLowerCase().includes("загрузить") ||
    caption.toLowerCase().includes("/загрузить")
  ) {
    const fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
    const file = await ctx.telegram.getFile(fileId);
    const fileUrl = `https://api.telegram.org/file/bot${bot.token}/${file.file_path}`;
    const response = await axios.get(fileUrl, { responseType: "arraybuffer" });
    const base64 = Buffer.from(response.data, "binary").toString("base64");
    await axios.post(
      `${GOOGLE_SCRIPT_URL}?type=photo`,
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

// Логирование всех сообщений (опционально)
bot.on("message", (ctx) => {
  if (ctx.message.text) {
    console.log("Получено сообщение:", ctx.message.text);
  }
});

// --- HTTP API для сайта ---
// Обработка POST-запроса с отзывом
app.post("/send-review", async (req, res) => {
  const { name, review, date, event, photo } = req.body;
  try {
    // 1. Сохраняем отзыв в Google Таблицу через Apps Script
    const gsRes = await axios.post(`${GOOGLE_SCRIPT_URL}?type=review`, {
      name,
      event,
      date,
      review,
      photo,
    });
    const { id } = gsRes.data;
    // 2. Отправляем заказчику в Telegram с кнопками
    await bot.telegram.sendMessage(
      ADMIN_CHAT_ID,
      `Новый отзыв:
Имя: ${name}
Мероприятие: ${event}
Дата: ${date}
Отзыв: ${review}`,
      Markup.inlineKeyboard([
        [
          Markup.button.callback("✅ Опубликовать", `publish_${id}`),
          Markup.button.callback("❌ Отклонить", `reject_${id}`)
        ]
      ])
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- Запуск сервера и бота ---
const PORT = 8080;
app.listen(8080, '0.0.0.0', () => {
  console.log(`API server started on port ${8080}`);
});
bot.launch();