const express = require("express");
const cors = require("cors");
require("dotenv").config();

// ✅ NEW: Gemini SDK
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
app.use(cors());
app.use(express.json());

// ✅ NEW: Gemini client
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

app.get("/", (req, res) => {
  res.send("Kidzibooks API is running");
});

app.post("/api/generate", async (req, res) => {
  try {
    const { topic, difficulty, type, count } = req.body;

    if (!topic || !difficulty || !type || !count) {
      return res.status(400).json({ success: false });
    }

    let prompt = "";

    if (type === "ALL") {
      prompt = `
Create a student-level question paper.

IMPORTANT FORMAT RULES (FOLLOW STRICTLY):
- Use ONLY plain text
- Do NOT use #, ##, ###, *, **, ---, ___, bullets
- Show the topic name at the top in UPPERCASE
- Use clear SECTION headings (plain text)
- Proper question numbering (1, 2, 3)
- Student-friendly language
- Do NOT mix answers with questions
- Add a separate ANSWER KEY at the end
- For Match the Following, show two clear columns

Start the paper EXACTLY like this:

QUESTION PAPER – ${topic.toUpperCase()}

Then generate ${count} questions in EACH section:

SECTION A: MCQs
SECTION B: True / False
SECTION C: Fill in the Blanks
SECTION D: Match the Following
SECTION E: Descriptive Questions
`;
    } else {
      prompt = `
Create a student-level question paper.

IMPORTANT FORMAT RULES (FOLLOW STRICTLY):
- Use ONLY plain text
- Do NOT use #, ##, ###, *, **, ---, ___, bullets
- Show the topic name at the top in UPPERCASE
- Always start with a SECTION heading
- Proper numbering (1, 2, 3)
- Student-friendly language
- Do NOT mix answers with questions
- Add a separate ANSWER KEY at the end

Start the paper EXACTLY like this:

QUESTION PAPER – ${topic.toUpperCase()}

SECTION: ${type}

Then generate ${count} questions under this section.
`;
    }

    // ✅ NEW: Gemini request
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    res.json({
      success: true,
      result: text
    });

  } catch (err) {
    console.error("Gemini Error:", err.message);

    res.status(500).json({
      success: false,
      error: "Free API limit reached or network issue. Try again later."
    });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log("Server running on", PORT));
