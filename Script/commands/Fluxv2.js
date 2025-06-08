const fs = global.nodemodule["fs-extra"];
const path = global.nodemodule["path"];
const axios = global.nodemodule["axios"];
const { createCanvas, loadImage } = global.nodemodule["canvas"];

const styleMap = {
  "1": "flux.1-schnell",
  "2": "flux.1-dev",
  "3": "flux.1-pro"
};

async function getApiUrl() {
    try {
        const response = await axios.get("https://raw.githubusercontent.com/romeoislamrasel/romeobot/refs/heads/main/api.json");
        return response.data.api;
    } catch (error) {
        console.error("Error fetching API URL:", error);
        return null;
    }
}

module.exports.config = {
  name: "fluxv2",
  version: "1.0.0",
  permission: 0,
  credits: " Chitron Bhattacharjee",
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
};

module.exports.languages = {
  "en": {
    "promptRequired": "❌ | Prompt is required.",
    "invalidModel": "❌ | Invalid model style. Choose 1, 2, or 3.",
    "apiError": "❌ | API did not return enough images.",
    "selectImage": "Select an image by replying with 1, 2, 3, or 4.",
    "errorGenerating": "❌ | Error generating images.",
    "invalidSelection": "❌ | Please reply with a number between 1 and 4.",
    "errorSending": "❌ | Error sending image.",
    "expiredSelection": "❌ | This selection has expired. Please generate new images.",
    "apiFetchError": "❌ | Failed to connect to the image generation service. Please try again later."
  }
};

module.exports.run = async function({ api, event, args, getText }) {
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
      return api.sendMessage(getText("promptRequired"), event.threadID, event.messageID);
    }

    if (!styleMap[model]) {
      api.setMessageReaction("❌", event.messageID, () => {}, true);
      return api.sendMessage(getText("invalidModel"), event.threadID, event.messageID);
    }

    const cacheFolderPath = path.join(__dirname, "tmp");
    if (!fs.existsSync(cacheFolderPath)) {
      fs.mkdirSync(cacheFolderPath, { recursive: true });
    }

    const apiUrl = await getApiUrl();
    if (!apiUrl) {
      api.setMessageReaction("❌", event.messageID, () => {}, true);
      return api.sendMessage(getText("apiFetchError"), event.threadID, event.messageID);
    }

    const modelParam = Array(4).fill(styleMap[model]).join("/");

    const { data } = await axios.get(`${apiUrl}/api/flux`, {
      params: { prompt, model: modelParam }
    });

    if (!data?.results || data.results.length < 4) {
      api.setMessageReaction("❌", event.messageID, () => {}, true);
      return api.sendMessage(getText("apiError"), event.threadID, event.messageID);
    }

    const imageUrls = data.results.slice(0, 4).map(res => res.data[0].url);
    const imagePaths = await Promise.all(
      imageUrls.map(async (url, i) => {
        const imagePath = path.join(cacheFolderPath, `image_${i + 1}_${Date.now()}.jpg`);
        const writer = fs.createWriteStream(imagePath);
        const response = await axios({ 
          url, 
          method: "GET", 
          responseType: "stream" 
        });
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
    const sent = await api.sendMessage({
      body: getText("selectImage"),
      attachment: fs.createReadStream(combinedPath)
    }, event.threadID, event.messageID);

    if (!global.client.handleReply) {
      global.client.handleReply = [];
    }

    global.client.handleReply.push({
      messageID: sent.messageID,
      name: this.config.name,
      author: event.senderID,
      imagePaths
    });

    setTimeout(() => {
      try {
        const index
