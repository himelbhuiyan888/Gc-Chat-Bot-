const fs = require("fs");
const path = require("path");
const axios = require("axios");
const { createCanvas, loadImage } = require("canvas");

const styleMap = {
  "1": "flux.1-schnell",
  "2": "flux.1-dev",
  "3": "flux.1-pro"
};

async function getApiUrl() {
  return "http://87.106.100.187:6401";
}

module.exports = {
  config: {
    name: "fluskv2",
    version: "1.0",
    author: "Team Calyx (Modified by Chitron)",
    countDown: 5,
    role: 0,
    shortDescription: "Generate AI images via FLUX",
    longDescription: "Generates 4 AI images from a prompt using FLUX API and allows selection.",
    category: "ai",
    guide: {
      en: "{prefix}fluskv2 <prompt> [-m 1/2/3]"
    }
  },

  onStart: async function ({ message, event, args, usersData, api }) {
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

      if (!prompt) return message.reply("❌ | Prompt is required.");
      if (!styleMap[model]) {
        api.setMessageReaction("❌", event.messageID, () => {}, true);
        return message.reply("❌ | Invalid model style. Choose 1, 2, or 3.");
      }

      const apiUrl = await getApiUrl();

      const cacheFolderPath = path.join(__dirname, "tmp");
      if (!fs.existsSync(cacheFolderPath)) fs.mkdirSync(cacheFolderPath);

      const modelParam = Array(4).fill(styleMap[model]).join("/");

      const { data } = await axios.get(`${apiUrl}/api/flux`, {
        params: { prompt, model: modelParam }
      });

      if (!data?.results || data.results.length < 4) {
        api.setMessageReaction("❌", event.messageID, () => {}, true);
        return message.reply("❌ | API did not return enough images.");
      }

      const imageUrls = data.results.slice(0, 4).map(res => res.data[0].url);

      const imagePaths = await Promise.all(
        imageUrls.map(async (url, i) => {
          const imagePath = path.join(cacheFolderPath, `image_${i + 1}_${Date.now()}.jpg`);
          const writer = fs.createWriteStream(imagePath);
          const response = await axios({ url, method: "GET", responseType: "stream" });
          response.data.pipe(writer);
          await new Promise((resolve, reject) => {
            writer.on("finish", resolve);
            writer.on("error", reject);
          });
          return imagePath;
        })
      );

      const loadedImages = await Promise.all(imagePaths.map(p => loadImage(p)));
      const width = loadedImages[0].width;
      const height = loadedImages[0].height;
      const canvas = createCanvas(width * 2, height * 2);
      const ctx = canvas.getContext("2d");

      ctx.drawImage(loadedImages[0], 0, 0, width, height);
      ctx.drawImage(loadedImages[1], width, 0, width, height);
      ctx.drawImage(loadedImages[2], 0, height, width, height);
      ctx.drawImage(loadedImages[3], width, height, width, height);

      const combinedPath = path.join(cacheFolderPath, `combined_${Date.now()}.jpg`);
      fs.writeFileSync(combinedPath, canvas.toBuffer("image/jpeg"));

      api.setMessageReaction("✅", event.messageID, () => {}, true);
      const sent = await message.reply({
        body: "Select an image by replying with 1, 2, 3, or 4.",
        attachment: fs.createReadStream(combinedPath)
      });

      global.client.reply.set(sent.messageID, {
        name: this.config.name,
        author: event.senderID,
        imagePaths,
      });
    } catch (err) {
      console.error(err);
      api.setMessageReaction("❌", event.messageID, () => {}, true);
      return message.reply("❌ | Error generating images.");
    }
  },

  onReply: async function ({ message, event, Reply }) {
    const index = parseInt(event.body.trim());
    if (!Reply || Reply.author !== event.senderID) return;

    if (isNaN(index) || index < 1 || index > 4)
      return message.reply("❌ | Please reply with a number between 1 and 4.");

    try {
      await message.reply({
        attachment: fs.createReadStream(Reply.imagePaths[index - 1])
      });
    } catch (err) {
      console.error(err);
      message.reply("❌ | Error sending image.");
    }
  }
};
