const fs = require("fs");
const Tesseract = require("tesseract.js");
const axios = require('axios');
const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);



async function handleFiles(file, mimeType, length) {
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });

  const chat = model.startChat({
    history: [
      {
        role: "user",
        parts: [
          {
            "text": `You are a smart summarizer. The input you receive comes either from OCR-extracted images or audio transcriptions. Your job is to transform it into a clear, structured, and visually engaging summary with the following rules: 🚫 Do NOT say things like 'Of course' or 'Here is your summary'. Start directly with the content. ✅ Organize content with headings, icons, and emojis but DO NOT use Markdown syntax like ###, **, or ---. ✅ Instead, write headings in plain text with emojis (e.g., 🔹 Heading). ✅ Use arrows (→), bullets (•), or icons (⭐, 🔹, ✅) for key points. ✅ Keep the language simple and easy to understand. ✅ If the input is long, break it into sections with headings + icons. ✅ If the text is in another language, summarize it in the same language. ✅ Make it look clean and beautiful (like a modern infographic in text). 🚫 Never mention AI, OCR, audio, or external tools. 🔊 For audio input: extract the spoken text and summarize it in a clear, brief way. 🗑️ If the input (image text or audio) is empty, junk, or irrelevant, respond with: 'Summary not available' , it there us is no text in the images or audio just return no text found in it , the summary should contain exactly ${length} words in it , it should not be more and it should not be less than ${length} make sure th summary contain exactly ${length} words give a proper spacing highlighting the important words every line has a new line character space the summary must be very benificial for user he musy love the content and the structure of the summary provided by you maintain spacing properly it should not look like conjested , try to extract and understand the text properly instead of sending summary not available as the response also give spacing to \n to every bullet points , such that every bullet points comes in new line twice not in one signle new line give two times for the key point as well , if the file format is mp4 video then identify wheather there is text in it on each frames if there are just extract the content of all frames and make a brief summary , and also look for some useful audio in that mp4 if you dont find any useful audio to summarize just send response as Cannot generate a summary on that , you need to totally check whether the video / audio has something explaining about something like articles / news ... related to field you intention is to explain the uploaded content in short`
          }

        ],
      },
    ],
  });

  // Now send a user question
  const result = await chat.sendMessage([
    {
      inlineData: {
        mimeType: mimeType, // or "image/jpeg"
        data: file.toString("base64"), // convert buffer → base64
      }
    }
  ]);
  return result;
}



async function handleText(text) {
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });

  const chat = model.startChat({
    history: [
      {
        role: "user",
        parts: [
          {
            "text": `You are a smart summarizer. DO NOT include any introductory phrases like "Of course", "Here is your summary", "Sure". Start directly with the summary.
. The input you receive comes as images, text or audio you need to transcript it to text and generate summary if it is a text directly , you need to make a enough brief summary on it , DON'T TAKE LONG TIME. and you should not include any of the instructions that is given here on response just follow your job Your job is to transform it into a clear, structured, and visually engaging summary with the following rules: 🚫 Do NOT say things like 'Of course' or 'Here is your summary'. Start directly with the content. ✅ Organize content with headings, icons, and emojis but DO NOT use Markdown syntax like ###, (**,) or ---. ✅ Instead, write headings in plain text with emojis (e.g., 🔹 Heading). ✅ Use arrows (→), bullets (•), or icons (⭐, 🔹, ✅) for key points dont use default markdowns keep iin mind you need to make the user happy arrange the text in a well manner. ✅ Keep the language simple and easy to understand. ✅ If the input is long, break it into sections with headings + icons. ✅ If the text is in another language, summarize it in the same language. ✅ Make it look clean and beautiful (like a modern infographic in text). 🚫 Never mention AI, OCR, audio, or external tools. 🔊 For audio input: extract the spoken text and summarize it in a clear, brief way. 🗑️ If the input (image text or audio) is empty, junk, or irrelevant, respond with: 'Summary not available' , it there us is no text in the images or audio just return no text found in it `,
          }

        ],
      },
    ],
  });

  // Now send a user question
  const result = await chat.sendMessage([{ text }]);
  console.log(result);
  return result;
}




processFiles = async (req, res) => {
  const file = req.file?.buffer;
  const mimeType = req.file?.mimetype;
  // const tempPath = `uploads/${Date.now()}-${req.file.originalname}`;
  // // fs.writeFileSync(tempPath, req.file.buffer);
  // // res.status(200).json({ status: true });
  // // fs.writeFileSync(req.file.originalname, req.file.buffer);
  // // handling images
  // const result = await Tesseract.recognize(file, "eng");
  // const extractedText = result.data.text;
  if (req.body.text) {
    const response = await handleText(req.body.textInput);
    const output = response?.response?.candidates?.[0]?.content?.parts?.[0]?.text || "Summary not available";
    res.status(200).json({ status: true, extractedText: response.response.text() });
  }
  else{
    const response = await handleFiles(file, mimeType, req.body.length);
    res.status(200).json({ status: true, extractedText: response.response.text() });
  }

}
module.exports = { processFiles }