import express from "express";
import cors from "cors";
import { Telegraf } from "telegraf";
import axios from "axios";
import fs from "fs";
import path from "path";
import FormData from "form-data";
import qs from "qs"; // в начале файла, если не установлен: npm install qs

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
    "https://script.google.com/macros/s/AKfycbwrJH8CEMa4rGiBoJ_nIuoGOZeOVVG-vPJxAXjq2UA7iVFbnVKSj8vTGrNgP_M1dSSvdg/exec?type=booking",
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
      `https://script.google.com/macros/s/AKfycbwrJH8CEMa4rGiBoJ_nIuoGOZeOVVG-vPJxAXjq2UA7iVFbnVKSj8vTGrNgP_M1dSSvdg/exec?action=publish&id=${id}`,
    );
    await ctx.reply("Отзыв опубликован.");
  } else if (data.startsWith("reject_")) {
    const id = data.replace("reject_", "");
    await axios.get(
      `https://script.google.com/macros/s/AKfycbwrJH8CEMa4rGiBoJ_nIuoGOZeOVVG-vPJxAXjq2UA7iVFbnVKSj8vTGrNgP_M1dSSvdg/exec?action=reject&id=${id}`,
    );
    await ctx.reply("Отзыв отклонён.");
  }
});

// Фото для галереи
bot.on("photo", async (ctx) => {
  const caption = ctx.message.caption || "";
  if (
    caption.toLowerCase().includes("загрузить") ||
    caption.toLowerCase().includes("/загрузить") ||
    caption.toLowerCase().includes("фото") ||
    caption.toLowerCase().includes("/фото")
  ) {
    const fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
    const file = await ctx.telegram.getFile(fileId);
    const fileUrl = `https://api.telegram.org/file/bot${bot.token}/${file.file_path}`;
    const response = await axios.get(fileUrl, { responseType: "arraybuffer" });

    // Загрузка на ImageBan
    const form = new FormData();
    form.append('image', Buffer.from(response.data, "binary"), {
      filename: path.basename(file.file_path),
      contentType: "image/jpeg"
    });

    try {
      const uploadResponse = await axios.post(
        'https://api.imageban.ru/v1/image/upload',
        form,
        {
          headers: {
            ...form.getHeaders(),
            Authorization: 'Bearer OXqAiHoaDv6TAmE8OAvX083BD6yaMD2kKRY'
          }
        }
      );

      // Добавь эту строку для отладки:
      console.log('Ответ от ImageBan:', uploadResponse.data);

      const data = uploadResponse.data;
      let imageUrl = null;

      if (data && data.data) {
        // Если data.data — строка
        if (typeof data.data === 'string' && data.data.startsWith('http')) {
          imageUrl = data.data;
        }
        // Если data.data — объект с нужным полем
        else if (typeof data.data === 'object') {
          // Попробуй найти прямую ссылку по ключам
          for (const key in data.data) {
            if (
              typeof data.data[key] === 'string' &&
              /^https:\/\/i\d+\.imageban\.ru\/out\//.test(data.data[key])
            ) {
              imageUrl = data.data[key];
              break;
            }
          }
        }
      }

      if (!imageUrl) {
        console.error('Некорректный ответ от ImageBan:', data);
        await ctx.reply('Ошибка: не удалось получить ссылку на изображение от ImageBan!');
        return;
      }

      // Сохраняем ссылку в Google Таблицу
      console.log('Данные для Google Таблицы:', {
        photo_url: imageUrl,
        filename: path.basename(file.file_path),
        uploader: ctx.from.username || ctx.from.first_name || "",
        caption,
      });

      await axios.post(
        "https://script.google.com/macros/s/AKfycbwrJH8CEMa4rGiBoJ_nIuoGOZeOVVG-vPJxAXjq2UA7iVFbnVKSj8vTGrNgP_M1dSSvdg/exec?type=photo",
        qs.stringify({
          photo_url: imageUrl,
          filename: path.basename(file.file_path),
          uploader: ctx.from.username || ctx.from.first_name || "",
          caption,
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

    await ctx.reply("Фото успешно загружено в галерею сайта!");
    } catch (err) {
      console.error('Ошибка загрузки на ImageBan:', err.response?.data || err.message);
      await ctx.reply('Ошибка загрузки фото на ImageBan!');
      return;
    }
  }
});

// Логирование всех сообщений (опционально)
bot.on("message", (ctx) => {
  if (ctx.message.text) {
    console.log("Получено сообщение:", ctx.message.text);
  }
});

// --- HTTP API для сайта ---
app.post("/send-review", async (req, res) => {
  const { name, review, date, event, photo } = req.body;
  try {
    // Просто пересылаем данные в Google Apps Script
    await axios.post(
      "https://script.google.com/macros/s/AKfycbwrJH8CEMa4rGiBoJ_nIuoGOZeOVVG-vPJxAXjq2UA7iVFbnVKSj8vTGrNgP_M1dSSvdg/exec",
      {
        name,
        review,
        date,
        event,
        photo
      }
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