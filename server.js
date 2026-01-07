const express = require("express");
const cors = require("cors");
const OpenAI = require("openai");

// ✅ NEW: Rate limiter protection
const rateLimit = require("express-rate-limit");

// ✅ NEW: In-memory cache
const cache = new Map();

const app = express();
app.use(cors());
app.use(express.json());

// ✅ NEW: API protection (5 requests per minute per IP)
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: {
    success: false,
    error: "Too many requests. Please wait 1 minute."
  }
});

app.use("/api/", apiLimiter);

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

    // ✅ NEW: Cache key
    const cacheKey = `${topic}-${difficulty}-${type}-${count}`;

    // ✅ NEW: Serve from cache if exists
    if (cache.has(cacheKey)) {
      console.log("⚡ Serving from cache");
      return res.json({
        success: true,
        result: cache.get(cacheKey)
      });
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

DESCRIPTIVE QUESTIONS RULES:
- Use Explain, Describe, Why, Write a short note
- Mix short and long answer questions

MATCH THE FOLLOWING FORMAT (PLAIN TEXT):

Match the items in Column A with Column B.

Column A                     Column B
a) Item from Column A        1) Item from Column B
b) Item from Column A        2) Item from Column B
c) Item from Column A        3) Item from Column B
d) Item from Column A        4) Item from Column B
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

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a professional school exam paper setter." },
        { role: "user", content: prompt }
      ],
      temperature: 0.6,

      // ✅ NEW: Token safety limit
      max_tokens: 1200
    });

    // ✅ NEW: Save output safely
    const output = completion.choices[0].message.content;

    // ✅ NEW: Store in cache
    cache.set(cacheKey, output);

    res.json({
      success: true,
      result: output
    });

  } catch (err) {
    console.error("AI ERROR:", err);

    // ✅ NEW: Friendly error message
    res.status(500).json({
      success: false,
      error: "AI temporarily busy. Please try again after 1 minute."
    });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log("Server running on", PORT));
