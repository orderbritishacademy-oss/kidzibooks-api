const express = require("express");
const cors = require("cors");
const OpenAI = require("openai");

const app = express();
app.use(cors());
app.use(express.json());

// ✅ OpenAI client (key comes from Render ENV)
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Health check
app.get("/", (req, res) => {
  res.send("Kidzibooks API is running");
});

// ✅ AI Question Generator
app.post("/api/generate", async (req, res) => {
  try {
    const { topic, difficulty, type, count } = req.body;

    if (!topic || !difficulty || !type || !count) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields"
      });
    }

    const prompt = `
Create a school-level question paper.

Topic: ${topic}
Difficulty: ${difficulty}
Question Type: ${type}
Number of Questions: ${count}

Rules:
- Use simple language
- Suitable for students
- Provide answers
- Format clearly
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are an experienced school teacher." },
        { role: "user", content: prompt }
      ],
      temperature: 0.7
    });

    const result = completion.choices[0].message.content;

    res.json({
      success: true,
      result
    });

  } catch (error) {
    console.error("OpenAI Error:", error.message);

    res.status(500).json({
      success: false,
      message: "AI generation failed"
    });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () =>
  console.log("Server running on port", PORT)
);
