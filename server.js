const express = require("express");
const cors = require("cors");
const OpenAI = require("openai");

const app = express();
app.use(cors());
app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

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
Create a SCHOOL EXAM QUESTION PAPER.

Topic: ${topic}
Difficulty: ${difficulty}

IMPORTANT INSTRUCTIONS:
- Use clear SECTION headings
- Proper question numbering
- Student-friendly language
- DO NOT mix answers with questions
- Add a separate ANSWER KEY at the end

Generate ${count} questions in EACH section below:

SECTION A: MCQs  
SECTION B: True / False  
SECTION C: Fill in the Blanks  
SECTION D: Match the Following  
SECTION E: Descriptive Questions  

DESCRIPTIVE QUESTIONS RULES:
- Include short and long answer questions
- Use words like "Explain", "Describe", "Write a short note", "Why"
- Suitable for school exams

MATCH THE FOLLOWING FORMAT:
- Column A (a, b, c, d)   Column B (1, 2, 3, 4)
- Answer format: a-2, b-1, etc.
`;
    } else {
      prompt = `
Create a SCHOOL EXAM QUESTION PAPER.

Topic: ${topic}
Difficulty: ${difficulty}
Question Type: ${type}
Number of Questions: ${count}

INSTRUCTIONS:
- Proper numbering
- Student-friendly language
- Do NOT mix answers with questions
- Add a separate ANSWER KEY at the end

- DO NOT use #, ##, ###, *, **, ---, ___, bullets
- Use ONLY plain text
- Use normal numbering: 1, 2, 3
- Use SECTION A, SECTION B (no symbols)
`;
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a professional school exam paper setter." },
        { role: "user", content: prompt }
      ],
      temperature: 0.6
    });

    res.json({
      success: true,
      result: completion.choices[0].message.content
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log("Server running on", PORT));
