
const fs = require("fs-extra");
const path = require("path");
const axios = require("axios");
const { createCanvas, loadImage } = require("canvas");

const styleMap = {
  "1": "flux.1-schnell",
  "2": "flux.1-dev",
  "3": "flux.1-pro"
};

async function getApiUrl() {
  try {
    const res = await axios.get("https://raw.githubusercontent.com/romeoislamrasel/romeobot/refs/heads/main/api.json");
    return res.data.api;
  } catch (e) {
    console.error("Error fetching API URL:", e);
    return null;
  }
}

module.exports = {
  config: {
    name: "fluximg",
    version: "1.0.0",
    permission: 0,
    credits: "Chitron Bhattacharjee",
    description: "Generate AI images via FLUX",
    prefix: true,
    category: "ai",
    usages: "[prompt] [-m 1/2/3]",
    cooldowns: 5,
    dependencies: {
      "axios": "",
      "canvas": "",
      "fs-extra": ""
    }
  },

  langs: {
    en: {
      promptRequired: "❌ | Prompt is required.",
      invalidModel: "❌ | Invalid model style. Choose 1, 2, or 3.",
      apiError: "❌ | API did not return enough images.",
      selectImage: "Select an image by replying with 1, 2, 3, or 4.",
      errorGenerating: "❌ | Error generating images.",
      invalidSelection: "❌ | Please reply with a number between 1 and 4.",
      errorSending: "❌ | Error sending image.",
      expiredSelection: "❌ | This selection has expired. Please generate new images.",
      apiFetchError: "❌ | Failed to connect to the image generation service. Please try again later."
    }
  },

  onStart: async function ({ api, event, args, getLang }) {
    api.setMessageReaction("⏳", event.messageID, () => {}, true);

    try {
      let prompt = "";
      let model = "1";

      for (let i = 0; i < args.length; i++) {
        if ((args[i] === "-m" || args[i] === "--model") && args[i + 1]) {
          model = args[i + 1];
          i++;
        } else {
          prompt += args[i] + " ";
        }
      }
      prompt = prompt.trim();

      if (!prompt) {
        api.setMessageReaction("❌", event.messageID, () => {}, true);
        return api.sendMessage(getLang("promptRequired"), event.threadID, event.messageID);
      }

      if (!styleMap[model]) {
        api.setMessageReaction("❌", event.messageID, () => {}, true);
        return api.sendMessage(getLang("invalidModel"), event.threadID, event.messageID);
      }

      const cachePath = path.join(__dirname, "tmp");
      if (!fs.existsSync(cachePath)) fs.mkdirSync(cachePath, { recursive: true });

      const apiUrl = await getApiUrl();
      if (!apiUrl) {
        api.setMessageReaction("❌", event.messageID, () => {}, true);
        return api.sendMessage(getLang("apiFetchError"), event.threadID, event.messageID);
      }

      const modelParam = Array(4).fill(styleMap[model]).join("/");
      const { data } = await axios.get(`${apiUrl}/api/flux`, {
        params: { prompt, model: modelParam }
      });

      if (!data?.results || data.results.length < 4) {
        api.setMessageReaction("❌", event.messageID, () => {}, true);
        return api.sendMessage(getLang("apiError"), event.threadID, event.messageID);
      }

      const imageUrls = data.results.slice(0, 4).map(res => res.data[0].url);
      const imagePaths = await Promise.all(
        imageUrls.map(async (url, idx) => {
          const imgPath = path.join(cachePath, `image_${idx + 1}_${Date.now()}.jpg`);
          const writer = fs.createWriteStream(imgPath);
          const response = await axios({ url, method: "GET", responseType: "stream" });
          response.data.pipe(writer);
          await new Promise((resolve, reject) => {
            writer.on("finish", resolve);
            writer.on("error", reject);
          });
          return imgPath;
        })
      );

      const loadedImages = await Promise.all(imagePaths.map(loadImage));
      const width = loadedImages[0].width;
      const height = loadedImages[0].height;
      const canvas = createCanvas(width * 2, height * 2);
      const ctx = canvas.getContext("2d");

      ctx.drawImage(loadedImages[0], 0, 0, width, height);
      ctx.drawImage(loadedImages[1], width, 0, width, height);
      ctx.drawImage(loadedImages[2], 0, height, width, height);
      ctx.drawImage(loadedImages[3], width, height, width, height);

      const finalPath = path.join(cachePath, `combined_${Date.now()}.jpg`);
      fs.writeFileSync(finalPath, canvas.toBuffer("image/jpeg"));

      api.setMessageReaction("✅", event.messageID, () => {}, true);
      const sent = await api.sendMessage({
        body: getLang("selectImage"),
        attachment: fs.createReadStream(finalPath)
      }, event.threadID, event.messageID);

      global.GoatBot.handleReply.push({
        name: "fluxv2",
        messageID: sent.messageID,
        author: event.senderID,
        imagePaths
      });

      setTimeout(() => {
        try {
          const index = global.GoatBot.handleReply.findIndex(e => e.messageID === sent.messageID);
          if (index !== -1) global.GoatBot.handleReply.splice(index, 1);

          imagePaths.forEach(p => fs.existsSync(p) && fs.unlinkSync(p));
          fs.existsSync(finalPath) && fs.unlinkSync(finalPath);
        } catch (e) {
          console.error("Error during cleanup:", e);
        }
      }, 5 * 60 * 1000);

    } catch (err) {
      console.error(err);
      api.setMessageReaction("❌", event.messageID, () => {}, true);
      return api.sendMessage(getLang("errorGenerating"), event.threadID, event.messageID);
    }
  },

  onReply: async function ({ api, event, handleReply, getLang }) {
    const choice = parseInt(event.body?.trim());
    if (isNaN(choice) || choice < 1 || choice > 4) {
      return api.sendMessage(getLang("invalidSelection"), event.threadID, event.messageID);
    }

    try {
      await api.sendMessage({
        attachment: fs.createReadStream(handleReply.imagePaths[choice - 1])
      }, event.threadID, event.messageID);
    } catch (err) {
      console.error(err);
      return api.sendMessage(getLang("errorSending"), event.threadID, event.messageID);
    }
  }
};

