import express from "express";
import cors from "cors";
import { Telegraf } from "telegraf";
import axios from "axios";
import fs from "fs";
import path from "path";

// 1. Настройка Express
const app = express();
app.use(cors({
  origin: ['https://semshow.ru', 'http://semshow.ru'],
  methods: ['POST', 'GET'],
  credentials: true
}));
app.use(express.json());

// 2. Настройка Telegram-бота
const bot = new Telegraf("8147984791:AAG-wpGksEE2g0bZDmeTXxf9VPtCct5K7dM");

// --- Твои обработчики бота ---
// Приветствие
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
    "https://script.google.com/macros/s/AKfycbz96G0EPgHYyOmaODTnQwe-39-WqF3Zy4cjjjCBr9x7JmEdi3eikkAnF7o5sEwtsYKPqg/exec/exec?type=booking",
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
    await axios.get(
      `https://script.google.com/macros/s/AKfycbyKCa3kdGmkYt_helZZ7oORyE56OL1krAmB1CE0qB4XOjfGpyJtdNuGmEdDPSkxMjV2lQ/exec?action=publish&id=${id}`,
    );
    await ctx.reply("Отзыв опубликован!");
  } else if (data.startsWith("reject_")) {
    const id = data.replace("reject_", "");
    await axios.get(
      `https://script.google.com/macros/s/AKfycbz96G0EPgHYyOmaODTnQwe-39-WqF3Zy4cjjjCBr9x7JmEdi3eikkAnF7o5sEwtsYKPqg/exec?action=reject&id=${id}`,
    );
    await ctx.reply("Отзыв отклонён.");
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
      "https://script.google.com/macros/s/AKfycbz96G0EPgHYyOmaODTnQwe-39-WqF3Zy4cjjjCBr9x7JmEdi3eikkAnF7o5sEwtsYKPqg/exec/exec?type=photo",
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
// Пример: обработка POST-запроса с отзывом
app.post("/send-review", async (req, res) => {
  const { name, event, date, review, photo } = req.body;
  try {
    // Генерируем уникальный id для отзыва
    const id = Date.now().toString();
    // Сохраняем отзыв в памяти (или в файл/БД, если нужно)
    if (!global.reviews) global.reviews = [];
    global.reviews.push({ id, name, event, date, review, photo, status: "pending" });

    // Формируем сообщение с кнопками
    let message = `Новый отзыв!\n\n`;
    message += `Имя: ${name}\n`;
    if (event) message += `Мероприятие: ${event}\n`;
    message += `Дата: ${date}\n`;
    message += `Отзыв: ${review}\n`;
    if (photo) message += `Фото: ${photo}\n`;

    const keyboard = {
      inline_keyboard: [
        [
          { text: "Опубликовать", callback_data: `publish_${id}` },
          { text: "Отклонить", callback_data: `reject_${id}` }
        ]
      ]
    };

    await bot.telegram.sendMessage(
      "532377079", // chat_id заказчика
      message,
      { reply_markup: keyboard }
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- Обработка callback-кнопок для отзывов ---
bot.on("callback_query", async (ctx) => {
  await ctx.answerCbQuery();
  const data = ctx.callbackQuery.data;

  if (data.startsWith("publish_")) {
    const id = data.replace("publish_", "");
    // Ищем отзыв и меняем статус
    if (global.reviews) {
      const review = global.reviews.find(r => r.id === id);
      if (review) {
        review.status = "published";
        await ctx.reply("Отзыв опубликован!");
        return;
      }
    }
    await ctx.reply("Отзыв не найден.");
  } else if (data.startsWith("reject_")) {
    const id = data.replace("reject_", "");
    if (global.reviews) {
      const review = global.reviews.find(r => r.id === id);
      if (review) {
        review.status = "rejected";
        await ctx.reply("Отзыв отклонён.");
        return;
      }
    }
    await ctx.reply("Отзыв не найден.");
  }
});

// --- Запуск сервера и бота ---
const PORT = 8080;
app.listen(8080, '0.0.0.0', () => {
  console.log(`API server started on port ${8080}`);
});
bot.launch();