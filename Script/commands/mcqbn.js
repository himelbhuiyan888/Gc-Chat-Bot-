
const axios = require('axios');
const userStats = new Map();

function decodeHtmlEntities(text) {
    const entities = {
        '&#039;': "'",
        '&quot;': '"',
        '&amp;': '&',
        '&lt;': '<',
        '&gt;': '>'
    };
    return text.replace(/&[^;]+;/g, match => entities[match] || match);
}

async function translateToBangla(text) {
    try {
        const response = await axios.get(
            `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=bn&dt=t&q=${encodeURIComponent(text)}`
        );
        return response.data[0][0][0];
    } catch {
        return text;
    }
}

module.exports.config = {
    name: "mcqbn",
    version: "6.0.0",
    credits: "Chitron Bhattacharjee",
    aliases: ["quizbn", "qsnbn", "ansbn"],
    hasPermssion: 0,
    description: "ইন্টারেক্টিভ বাংলা MCQ কুইজ",
    commandCategory: "Education",
    cooldowns: 5,
    dependencies: { "axios": "" },
    usage: "[easy/medium/hard]"
};

module.exports.handleReply = async ({ api, event, handleReply, Currencies }) => {
    if (event.senderID !== handleReply.author) return;

    if (!userStats.has(event.senderID)) {
        userStats.set(event.senderID, {
            totalQuestions: 0,
            correctAnswers: 0,
            totalEarned: 0,
            wrongAnswers: 0
        });
    }

    const stats = userStats.get(event.senderID);
    const userInput = event.body.trim().toLowerCase();
    let userAnswer;

    if (/^[1-4]$/.test(userInput)) {
        userAnswer = parseInt(userInput) - 1;
    } else if (/^[a-d]$/.test(userInput)) {
        userAnswer = userInput.charCodeAt(0) - 97;
    } else {
        userAnswer = handleReply.answers.findIndex(ans => ans.toLowerCase() === userInput);
    }

    if (userAnswer === -1 || isNaN(userAnswer)) {
        return api.sendMessage("❌ ভুল ইনপুট! 1-4, ক-ঘ বা সঠিক উত্তর দিন।", event.threadID);
    }

    const isCorrect = userAnswer === handleReply.correctIndex;
    const rewardAmount = 20;
    stats.totalQuestions++;

    if (isCorrect) {
        stats.correctAnswers++;
        stats.totalEarned += rewardAmount;
        await Currencies.increaseMoney(event.senderID, rewardAmount);
    } else {
        stats.wrongAnswers++;
    }

    let resultMessage = `📘 *${handleReply.question}*\n\n`;
    handleReply.answers.forEach((ans, i) => {
        const prefix = i === handleReply.correctIndex ? "✅" :
                      i === userAnswer ? "❌" : "  ";
        resultMessage += `${prefix} ${String.fromCharCode(65+i)}. ${ans}\n`;
    });

    resultMessage += `\n――――――――――――――――――\n` +
                     `${isCorrect ? "🎉 সঠিক!" : "🚫 ভুল!"} উত্তর: (${String.fromCharCode(65+handleReply.correctIndex)}) ${handleReply.answers[handleReply.correctIndex]}\n\n` +
                     `💰 আয়: ${isCorrect ? `+${rewardAmount}৳` : "০৳"}\n` +
                     `📊 সঠিক: ${stats.correctAnswers}/${stats.totalQuestions}\n` +
                     `💵 মোট আয়: ${stats.totalEarned}৳\n` +
                     `❌ ভুলের সংখ্যা: ${stats.wrongAnswers}/5\n\n`;

    if (stats.wrongAnswers >= 5) {
        resultMessage += `🔚 আপনি ৫টি ভুল করেছেন। কুইজ শেষ।`;
        userStats.delete(event.senderID);
        return api.sendMessage(resultMessage, event.threadID);
    }

    resultMessage += `🔁 পরবর্তী প্রশ্ন পেতে এই মেসেজে রিয়েক্ট দিন`;

    api.sendMessage(resultMessage, event.threadID, (err, info) => {
        if (!err) {
            api.setMessageReaction("💡", info.messageID, () => {}, true);
            const index = global.client.handleReply.findIndex(e => e.messageID === handleReply.messageID);
            if (index !== -1) global.client.handleReply.splice(index, 1);

            global.client.handleReaction.push({
                name: this.config.name,
                messageID: info.messageID,
                author: event.senderID,
                difficulty: handleReply.difficulty,
                currencies: Currencies
            });
        }
    });
};

module.exports.handleReaction = async ({ api, event, handleReaction }) => {
    if (event.userID !== handleReaction.author) return;

    const index = global.client.handleReaction.findIndex(e => e.messageID === handleReaction.messageID);
    if (index !== -1) global.client.handleReaction.splice(index, 1);

    await this.run({
        api,
        event,
        args: [handleReaction.difficulty],
        Currencies: handleReaction.currencies
    });
};

module.exports.run = async ({ api, event, args, Currencies }) => {
    try {
        if (!userStats.has(event.senderID)) {
            userStats.set(event.senderID, {
                totalQuestions: 0,
                correctAnswers: 0,
                totalEarned: 0,
                wrongAnswers: 0
            });
        }

        const difficulties = ["easy", "medium", "hard"];
        const difficulty = args[0]?.toLowerCase() || difficulties[Math.floor(Math.random() * difficulties.length)];

        if (!difficulties.includes(difficulty)) {
            return api.sendMessage(`⚠️ সঠিক লেভেল দিন:\n${difficulties.join(", ")}`, event.threadID);
        }

        const { data } = await axios.get(`https://opentdb.com/api.php?amount=1&type=multiple&difficulty=${difficulty}`);
        if (!data.results || !data.results.length) {
            return api.sendMessage("🔴 কুইজ সিস্টেম ব্যস্ত। পরে চেষ্টা করুন!", event.threadID);
        }

        const question = data.results[0];
        const decodedQuestion = decodeHtmlEntities(question.question);
        const decodedCorrect = decodeHtmlEntities(question.correct_answer);
        const decodedIncorrect = question.incorrect_answers.map(ans => decodeHtmlEntities(ans));

        const [bnQuestion, bnCorrect, ...bnIncorrect] = await Promise.all([
            translateToBangla(decodedQuestion),
            translateToBangla(decodedCorrect),
            ...decodedIncorrect.map(translateToBangla)
        ]);

        const allAnswers = [bnCorrect, ...bnIncorrect].sort(() => Math.random() - 0.5);
        const correctIndex = allAnswers.indexOf(bnCorrect);

        let quizMessage = `📘 প্রশ্ন: ${bnQuestion}\n\n`;
        allAnswers.forEach((ans, i) => {
            quizMessage += `${String.fromCharCode(0x1F150 + i)} ${ans}\n`;
        });
        quizMessage += `――――――――――――――――\n💡 উত্তর দিন: 1-4 বা ক-ঘ`;

        const msg = await api.sendMessage(quizMessage, event.threadID);

        global.client.handleReply.push({
            name: this.config.name,
            messageID: msg.messageID,
            author: event.senderID,
            question: bnQuestion,
            answers: allAnswers,
            correctIndex,
            difficulty
        });

    } catch (error) {
        console.error("কুইজ ত্রুটি:", error);
        api.sendMessage("❌ প্রশ্ন লোড করতে ব্যর্থ! পরে চেষ্টা করুন", event.threadID);
    }
};

