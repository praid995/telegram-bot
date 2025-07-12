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
    "https://script.google.com/macros/s/AKfycbyKCa3kdGmkYt_helZZ7oORyE56OL1krAmB1CE0qB4XOjfGpyJtdNuGmEdDPSkxMjV2lQ/exec?type=booking",
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
      `https://script.google.com/macros/s/AKfycbyKCa3kdGmkYt_helZZ7oORyE56OL1krAmB1CE0qB4XOjfGpyJtdNuGmEdDPSkxMjV2lQ/exec?action=reject&id=${id}`,
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

// Логирование всех сообщений (опционально)
bot.on("message", (ctx) => {
  if (ctx.message.text) {
    console.log("Получено сообщение:", ctx.message.text);
  }
});

// --- HTTP API для сайта ---
// Пример: обработка POST-запроса с отзывом
app.post("/send-review", async (req, res) => {
  const { name, review, date } = req.body;
  try {
    await bot.telegram.sendMessage(
      "532377079", // chat_id заказчика
      `Новый отзыв:\nИмя: ${name}\nДата: ${date}\nОтзыв: ${review}`
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